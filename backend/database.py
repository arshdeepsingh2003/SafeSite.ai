from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv()

MONGODB_URL = os.getenv("MONGO_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME", "safesite_ai")

# This is the MongoDB client — one connection shared across the whole app
client = AsyncIOMotorClient(MONGODB_URL)
db = client[DATABASE_NAME]

# --- Collections (like "tables" in SQL) ---
users_collection = db["users"]
alerts_collection = db["alerts"]
sites_collection = db["sites"]
workers_collection = db["workers"]
settings_collection = db["settings"]
reports_collection = db["reports"]

async def connect_db():
    """Test the database connection on startup."""
    try:
        await client.admin.command("ping")
        print("Connected to MongoDB successfully!")
    except Exception as e:
        print(f"MongoDB connection failed: {e}")
        print("   Make sure MongoDB is running: sudo systemctl start mongod")

async def close_db():
    """Close the database connection on shutdown."""
    client.close()
    print("MongoDB connection closed.")