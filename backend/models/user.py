# it controls how user data is created, validated, stored, and returned
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from enum import Enum
 
 
# Roles 
class UserRole(str, Enum):
    admin = "admin"
    user = "user"
 
 
# What a user looks like in MongoDB 
class UserInDB(BaseModel):
    id: Optional[str] = None
    name: str
    email: str
    hashed_password: str
    role: UserRole = UserRole.user
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
 
 
# What we receive when registering a new user 
class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=50, example="John Doe")
    email: EmailStr = Field(..., example="john@example.com")
    password: str = Field(..., min_length=6, example="secret123")
    role: UserRole = UserRole.user  # default role is "user"
 
 
# What we receive on login
class UserLogin(BaseModel):
    email: EmailStr = Field(..., example="admin@safesite.com")
    password: str = Field(..., example="admin123")
 
 
# What we send back to the frontend (NEVER send the password!) 
class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    is_active: bool
    created_at: datetime
 
 
# JWT Token response 
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
 