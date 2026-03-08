from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException
import requests
import logging
from .config import get_settings

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

settings = get_settings()
SECRET_KEY = settings.secret_key
ALGORITHM = settings.jwt_algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes

logger = logging.getLogger(__name__)

def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

def verify_azure_token(token: str):
    try:
        client_id = settings.azure_client_id
        tenant_id = settings.azure_tenant_id

        # 1. Odczyt nagłówka i niezweryfikowanych pól tokena dla debug
        # 2. Rozkodowanie nagłówka, aby znaleźć odpowiedni klucz (kid)
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get('kid')
        logger.info("Azure token verify: token_kid=%s", kid)

        token_tid = None
        try:
            unverified_claims = jwt.get_unverified_claims(token)
            token_tid = unverified_claims.get("tid")
            logger.info(
                "Azure token verify: iss=%s aud=%s tid=%s",
                unverified_claims.get("iss"),
                unverified_claims.get("aud"),
                token_tid,
            )
        except Exception:
            logger.warning("Azure token verify: failed to read unverified token fields")

        if tenant_id and token_tid and tenant_id != token_tid:
            raise HTTPException(status_code=401, detail="Token tenant mismatch")

        issuer_tenant = tenant_id or token_tid
        if not issuer_tenant:
            raise HTTPException(status_code=401, detail="Tenant ID missing for token verification")

        def fetch_keys(tenant_id: str):
            jwks_url = f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys"
            logger.info("Azure token verify: tenant_id=%s jwks_url=%s", tenant_id, jwks_url)
            response = requests.get(jwks_url, timeout=10)
            response.raise_for_status()
            keys = response.json().get("keys", [])
            logger.info("Azure token verify: jwks_keys_count=%s", len(keys))
            return keys

        # 2. Pobranie kluczy publicznych Microsoftu dla Twojego tenanta
        keys = fetch_keys(issuer_tenant)
        
        rsa_key = next((key for key in keys if key['kid'] == kid), None)

        if not rsa_key:
            # Fallback do 'common' (klucze są globalne dla AAD)
            logger.warning("Azure token verify: kid not found in tenant keys, trying common")
            keys = fetch_keys("common")
            rsa_key = next((key for key in keys if key['kid'] == kid), None)
        
        if not rsa_key:
            raise HTTPException(status_code=401, detail="Public key not found")
        
        # 3. Weryfikacja tokena
        # Uwaga: Azure wysyła dane w ID Tokenie. Sprawdzamy audience (client_id)
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=['RS256'],
            audience=client_id,
            issuer=f"https://login.microsoftonline.com/{issuer_tenant}/v2.0"
        )
        
        return payload # Zawiera 'name', 'preferred_username' (email), 'oid'
        
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Verification failed: {str(e)}")
