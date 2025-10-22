from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException
import requests

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings (optional - configure these in your .env file)
SECRET_KEY = "your-secret-key-here-change-this-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

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
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_azure_token(token: str):
    """Verify Azure AD token"""
    try:
        # Get Azure AD public keys
        TENANT_ID = "YOUR_TENANT_ID"
        jwks_url = f"https://login.microsoftonline.com/{TENANT_ID}/discovery/v2.0/keys"
        
        # Decode token without verification first to get header
        unverified_header = jwt.get_unverified_header(token)
        
        # Get the key id from token
        kid = unverified_header.get('kid')
        
        # Get public keys from Azure
        response = requests.get(jwks_url)
        keys = response.json()['keys']
        
        # Find the right key
        rsa_key = None
        for key in keys:
            if key['kid'] == kid:
                rsa_key = key
                break
        
        if not rsa_key:
            raise ValueError("Public key not found")
        
        # Verify and decode the token
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=['RS256'],
            audience="YOUR_CLIENT_ID"
        )
        
        return payload
        
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")