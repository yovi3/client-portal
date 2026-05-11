# client-portal

## Local development

Frontend:
```
cd frontend && npm install && npm run dev
```

Backend:
```
cd backend && ./start.sh
```

Optional tunneling for inbound Twilio webhooks:
```
ngrok http 8002
```

## Production deployment checklist (Azure)

Before pushing to `main` (which deploys via `.github/workflows/main_clientportaldss.yml` + `frontend-deploy.yml`):

### Required Azure App Service settings for the backend
| Setting | Value |
| --- | --- |
| `APP_ENV` | `production` |
| `SECRET_KEY` | Output of `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `DATABASE_URL` | `postgresql+psycopg2://<user>:<password>@<server>.postgres.database.azure.com:5432/<db>?sslmode=require` |
| `CLIENT_BASE_URL` | `https://<your-static-web-app-domain>` |
| `BACKEND_BASE_URL` | `https://clientportaldss.azurewebsites.net` |
| `CORS_ALLOW_ORIGINS` | Same value as `CLIENT_BASE_URL` (no localhost in prod) |
| `AZURE_REDIRECT_URI` | `https://clientportaldss.azurewebsites.net/auth/azure/callback` |
| `AZURE_POST_LOGIN_REDIRECT_URL` | `https://<your-frontend>/dashboard` |
| `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_CLIENT_SECRET` | From Entra ID app registration |
| `AZURE_ALLOWED_GROUP_IDS` and/or `AZURE_GROUP_ROLE_MAP` | From your tenant |
| Twilio vars | Only if SMS is enabled |

### Required Static Web App secrets (frontend)
| Repo secret | Value |
| --- | --- |
| `PROD_API_BASE_URL` | `https://clientportaldss.azurewebsites.net` |
| `PROD_CLIENT_BASE_URL` | `https://<your-static-web-app-domain>` |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | From Static Web App resource |

### Database migrations
Schema is managed exclusively by Alembic. After deploy:
```
cd backend && alembic upgrade head
```
Run this from a shell against the production Postgres (e.g. via Azure Cloud Shell or a one-off App Service SSH session).

## Known limitations (MVP)

1. **File uploads are on local App Service disk.** The `uploads/` directory is wiped on every restart/redeploy of the backend container. Acceptable only while MVP users are not uploading anything important. Migrate to Azure Blob Storage before general availability.
2. **JWTs cannot be revoked server-side.** Logout deletes the cookie, but if a token is exfiltrated it remains valid until `exp`. Mitigations: short `ACCESS_TOKEN_EXPIRE_MINUTES` (default 30) and HttpOnly + Secure cookies in prod.
3. **No automated tests.** Smoke test the auth + create-case + upload-document flow manually after each deploy until coverage is added.
4. **`passlib` 1.7.4 + `bcrypt` 4.0.1 pin.** Locked because newer bcrypt prints noisy warnings with passlib. Revisit when migrating off `passlib`.
