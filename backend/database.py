from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

MONGO_URL = os.getenv("MONGO_URL")

if not MONGO_URL:
    raise ValueError("❌ MONGO_URL is not set in .env file")

# Global variables
client: AsyncIOMotorClient = None
db = None


# 🔌 Connect to MongoDB
async def connect_db():
    global client, db
    try:
        client = AsyncIOMotorClient(MONGO_URL)

        # Select database
        db = client["safesite_db"]

        # Test connection
        await client.admin.command("ping")

        print("✅ MongoDB Connected Successfully")

    except Exception as e:
        print(f"❌ MongoDB Connection Error: {e}")
        raise e


# ❌ Close connection
async def close_db():
    global client
    if client:
        client.close()
        print("🔌 MongoDB Connection Closed")


# 📦 Helper to access DB anywhere
def get_db():
    return db