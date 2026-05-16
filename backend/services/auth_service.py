from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status
from time_utils import istnow
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from pathlib import Path
import os

# Explicitly load .env from backend directory
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# --- Settings from .env ---
SECRET_KEY = os.getenv("SECRET_KEY", "change_this_secret_key")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))
 
# --- Password hashing setup ---
# bcrypt is a secure one-way hashing algorithm
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
 
# --- Bearer token extractor ---
# This reads "Authorization: Bearer <token>" from request headers
security = HTTPBearer()
 
 
def hash_password(plain_password: str) -> str:
    """
    Convert a plain text password into a secure hash.
    Example: "admin123" → "$2b$12$abc...xyz"
    We NEVER store plain passwords!
    """
    return pwd_context.hash(plain_password)
 
 
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Check if a plain password matches the stored hash.
    Returns True if they match, False otherwise.
    """
    return pwd_context.verify(plain_password, hashed_password)
 
 
def create_access_token(data: dict) -> str:
    """
    Create a JWT token that expires after ACCESS_TOKEN_EXPIRE_MINUTES.
    The token contains: user_id, email, role (but NOT the password).
    """
    to_encode = data.copy()
    expire = istnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
 
 
def decode_token(token: str) -> dict:
    """
    Decode and verify a JWT token.
    Returns the payload (user data) if valid.
    Raises HTTPException if the token is invalid or expired.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
 
 
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    FastAPI dependency — extracts and validates the JWT from every request.
    Use this on any route that requires authentication.
 
    Example:
        @app.get("/protected")
        def my_route(user = Depends(get_current_user)):
            return {"hello": user["name"]}
    """
    token = credentials.credentials
    payload = decode_token(token)
    return payload
 
 
async def require_admin(current_user: dict = Depends(get_current_user)):
    """
    FastAPI dependency — only allows admin users.
    Use this on admin-only routes.
 
    Example:
        @app.delete("/users/{id}")
        def delete_user(user = Depends(require_admin)):
            ...
    """
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Admin role required."
        )
    return current_user
 