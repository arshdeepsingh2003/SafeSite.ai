# ============================================================
# SafeSite AI — Create Default Admin User
# This creates the first admin account so you can log in.
# Run this ONCE after setting up the database.
# ============================================================

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime
from dotenv import load_dotenv
import os

load_dotenv()

MONGODB_URL = os.getenv("MONGO_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def create_admin():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    users = db["users"]

    # --- Default admin credentials ---
    # Change these before going to production!
    admin_email = "admin@safesite.com"
    admin_password = "admin123"
    admin_name = "Site Admin"

    # Check if admin already exists
    existing = await users.find_one({"email": admin_email})
    if existing:
        print(f"⚠️  Admin already exists: {admin_email}")
        print("    If you forgot the password, delete the user from MongoDB and run this again.")
        client.close()
        return

    # Create the admin user
    admin_doc = {
        "name": admin_name,
        "email": admin_email,
        "hashed_password": pwd_context.hash(admin_password),
        "role": "admin",
        "is_active": True,
        "created_at": datetime.now(UTC)
    }

    result = await users.insert_one(admin_doc)

    print("=" * 50)
    print("✅ Admin user created successfully!")
    print("=" * 50)
    print(f"   Email:    {admin_email}")
    print(f"   Password: {admin_password}")
    print(f"   Role:     admin")
    print(f"   ID:       {result.inserted_id}")
    print("=" * 50)
    print("⚠️  Remember to change the password after first login!")
    print("=" * 50)

    client.close()


if __name__ == "__main__":
    asyncio.run(create_admin())