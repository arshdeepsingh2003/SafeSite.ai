
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv
from time_utils import istnow
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
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")
    admin_name = os.getenv("ADMIN_NAME", "Admin")

    # Check if admin already exists
    existing = await users.find_one({"email": admin_email})
    if existing:
        print(f"⚠️  Admin already exists")
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
        "created_at": istnow()
    }

    result = await users.insert_one(admin_doc)

    print("=" * 50)
    print("✅ Admin user created successfully!")
    print("=" * 50)
    
    client.close()


if __name__ == "__main__":
    asyncio.run(create_admin())