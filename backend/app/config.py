import os
from pathlib import Path
import json
from dotenv import load_dotenv


_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH)


def _get_env(name: str, default: str | None = None, required: bool = False) -> str | None:
    value = os.getenv(name, default)
    if required and (value is None or value == ""):
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


class Settings:
    def __init__(self) -> None:
        self.environment = _get_env("APP_ENV", "development")
        self.cookie_secure = self.environment == "production"
        
        # Database
        self.database_url = _get_env("DATABASE_URL", "sqlite:///./app.db")
        
        # Security
        self.secret_key = _get_env("SECRET_KEY", required=True)
        self.jwt_algorithm = _get_env("JWT_ALGORITHM", "HS256")
        self.access_token_expire_minutes = int(_get_env("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

        # Azure AD
        self.azure_client_id = _get_env("AZURE_CLIENT_ID", required=True)
        self.azure_tenant_id = _get_env("AZURE_TENANT_ID", required=True)
        self.azure_client_secret = _get_env("AZURE_CLIENT_SECRET", required=True)
        self.backend_base_url = _get_env("BACKEND_BASE_URL", "http://localhost:8002")
        self.azure_redirect_uri = _get_env(
            "AZURE_REDIRECT_URI",
            f"{self.backend_base_url.rstrip('/')}/auth/azure/callback",
        )
        self.azure_post_login_redirect_url = _get_env("AZURE_POST_LOGIN_REDIRECT_URL")
        self.azure_fallback_role = _get_env("AZURE_FALLBACK_ROLE", "client")
        self.azure_role_priority = [
            role.strip()
            for role in (_get_env("AZURE_ROLE_PRIORITY", "admin,lawyer,accountant,paralegal,legal assistant,client") or "").split(",")
            if role.strip()
        ]
        self.azure_allowed_group_ids = {
            group_id.strip()
            for group_id in (_get_env("AZURE_ALLOWED_GROUP_IDS", "") or "").split(",")
            if group_id.strip()
        }
        group_role_map_raw = _get_env("AZURE_GROUP_ROLE_MAP", "{}") or "{}"
        try:
            parsed_group_role_map = json.loads(group_role_map_raw)
            if not isinstance(parsed_group_role_map, dict):
                raise ValueError("AZURE_GROUP_ROLE_MAP must be a JSON object")
            self.azure_group_role_map = {
                str(group_id): str(role)
                for group_id, role in parsed_group_role_map.items()
            }
        except Exception as exc:
            raise RuntimeError(f"Invalid AZURE_GROUP_ROLE_MAP: {exc}") from exc

        self.invite_expiry_days = int(_get_env("INVITE_EXPIRY_DAYS", "7"))
        self.invite_manage_permission = _get_env("INVITE_MANAGE_PERMISSION", "invites:manage")

        # Auth cookie
        self.auth_cookie_name = _get_env("AUTH_COOKIE_NAME", "access_token")

        # Twilio (optional)
        self.twilio_account_sid = _get_env("TWILIO_ACCOUNT_SID")
        self.twilio_auth_token = _get_env("TWILIO_AUTH_TOKEN")
        self.twilio_phone_number = _get_env("TWILIO_PHONE_NUMBER")
        twilio_validate_signature = (_get_env("TWILIO_VALIDATE_SIGNATURE", "true") or "true").strip().lower()
        self.twilio_validate_signature = twilio_validate_signature in {"1", "true", "yes", "on"}

        # URLs / CORS
        self.client_base_url = _get_env("CLIENT_BASE_URL", "http://localhost:5173")
        if not self.azure_post_login_redirect_url:
            self.azure_post_login_redirect_url = f"{self.client_base_url.rstrip('/')}/dashboard"
        cors = _get_env(
            "CORS_ALLOW_ORIGINS",
            "http://localhost:3000,http://localhost:5173,http://0.0.0.0:8002,http://127.0.0.1:8002",
        )
        self.cors_allow_origins = [origin.strip() for origin in cors.split(",") if origin.strip()]


_SETTINGS: Settings | None = None


def get_settings() -> Settings:
    global _SETTINGS
    if _SETTINGS is None:
        _SETTINGS = Settings()
    return _SETTINGS
