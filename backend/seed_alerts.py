import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta
from dotenv import load_dotenv
import random, os

load_dotenv()

MONGO_URL   = os.getenv("MONGO_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME")

ZONES    = ["Zone A", "Zone B", "Zone C", "Zone D"]
CAMERAS  = ["Camera 1", "Camera 2", "Camera 3", "Camera 4"]
STATUSES = ["new", "new", "new", "acknowledged", "resolved"]   # weighted toward "new"

VIOLATIONS = [
    {"type": "no_helmet",             "severity": "medium", "has_helmet": False, "has_vest": True },
    {"type": "no_vest",               "severity": "medium", "has_helmet": True,  "has_vest": False},
    {"type": "no_helmet_and_no_vest", "severity": "high",   "has_helmet": False, "has_vest": False},
]

async def seed():
    client = AsyncIOMotorClient(MONGO_URL)
    db     = client[DATABASE_NAME]
    col    = db["alerts"]

    # Clear existing sample alerts (keeps real ones from video analysis)
    existing = await col.count_documents({})
    print(f"Existing alerts in DB: {existing}")

    # Create 25 sample alerts spread across today
    now    = datetime.utcnow()
    created = 0

    for i in range(25):
        v = random.choice(VIOLATIONS)
        minutes_ago = random.randint(0, 480)   # Up to 8 hours ago

        doc = {
            "video_id":       None,
            "worker_id":      random.randint(1000, 1099),
            "zone":           random.choice(ZONES),
            "camera":         random.choice(CAMERAS),
            "violation_type": v["type"],
            "severity":       v["severity"],
            "has_helmet":     v["has_helmet"],
            "has_vest":       v["has_vest"],
            "frame_number":   random.randint(1, 500),
            "timestamp_sec":  round(random.uniform(1, 120), 2),
            "bbox":           [
                random.randint(50,  300),
                random.randint(30,  200),
                random.randint(200, 500),
                random.randint(300, 700),
            ],
            "source":         "uploaded_video",
            "status":         random.choice(STATUSES),
            "resolved":       False,
            "created_at":     now - timedelta(minutes=minutes_ago),
            "resolved_at":    None,
        }

        # Mark resolved ones properly
        if doc["status"] == "resolved":
            doc["resolved"]    = True
            doc["resolved_at"] = doc["created_at"] + timedelta(minutes=random.randint(5, 30))

        await col.insert_one(doc)
        created += 1

    print(f"Seeded {created} sample alerts!")
    print(f"   Now run the frontend and visit /alerts to see them.")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed())
