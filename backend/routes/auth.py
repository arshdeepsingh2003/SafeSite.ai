from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from dotenv import load_dotenv
from pathlib import Path
import os

from database import users_collection
from time_utils import istnow

# Explicitly load .env from backend directory
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

router = APIRouter(prefix="/auth", tags=["Auth"])

# ── Security setup ──────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
jwt_bearer = HTTPBearer()

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

# ── Pydantic models ─────────────────────────────────────────
class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "user"  # "admin" or "user"

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

# ── Helpers ─────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = istnow() + expires_delta
    else:
        expire = istnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(jwt_bearer)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await users_collection.find_one({"email": email})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    user["_id"] = str(user["_id"])
    return user

# ── Routes ──────────────────────────────────────────────────
@router.get("/")
def test_auth():
    return {"message": "Auth route working"}

@router.post("/login", response_model=TokenResponse)
async def login(creds: LoginRequest):
    user = await users_collection.find_one({"email": creds.email})
    if not user or not verify_password(creds.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    if not user.get("is_active", True):
        raise HTTPException(status_code=400, detail="Account is deactivated")

    token = create_access_token({"sub": user["email"], "role": user["role"]})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
        }
    }

@router.post("/register", response_model=TokenResponse)
async def register(data: RegisterRequest):
    existing = await users_collection.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_doc = {
        "name": data.name,
        "email": data.email,
        "hashed_password": hash_password(data.password),
        "role": data.role,
        "is_active": True,
        "created_at": istnow(),
    }

    result = await users_collection.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id

    token = create_access_token({"sub": user_doc["email"], "role": user_doc["role"]})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user_doc["_id"]),
            "name": user_doc["name"],
            "email": user_doc["email"],
            "role": user_doc["role"],
        }
    }

@router.get("/me")
async def read_me(user: dict = Depends(get_current_user)):
    return {
        "id": user["_id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
    }