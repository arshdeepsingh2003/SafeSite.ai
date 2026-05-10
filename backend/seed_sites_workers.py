# ============================================================
# SafeSite AI — Seed Sites & Workers
# File: backend/seed_sites_workers.py
# Run with: python seed_sites_workers.py
#
# Creates 8 sample sites and 20 sample workers in MongoDB.
# Run this ONCE to get realistic data on the Sites/Workers pages.
# ============================================================

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta
from dotenv import load_dotenv
import random, os

load_dotenv()
MONGODB_URL   = os.getenv("MONGO_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME", "safesite_ai")

SITES = [
    {"name": "Main Construction Site", "location": "Downtown, New York, USA",
     "status": "active", "project_manager": "John Smith",
     "description": "Main downtown construction project. Multi-floor building with 5 active zones.",
     "cameras": 8, "zones": ["Zone A","Zone B","Zone C","Zone D","Zone E"],
     "workers": 120, "compliance_rate": 72, "is_primary": True},
    {"name": "North Zone Site",       "location": "Brooklyn, New York, USA",
     "status": "active",      "project_manager": "Mary Johnson",
     "cameras": 6, "zones": ["Zone A","Zone B","Zone C","Zone D"], "workers": 85,  "compliance_rate": 65},
    {"name": "East Side Project",     "location": "Queens, New York, USA",
     "status": "active",      "project_manager": "David Lee",
     "cameras": 4, "zones": ["Zone A","Zone B","Zone C"],          "workers": 60,  "compliance_rate": 80},
    {"name": "West End Construction", "location": "Manhattan, New York, USA",
     "status": "inactive",    "project_manager": "Sarah Brown",
     "cameras": 5, "zones": ["Zone A","Zone B"],                   "workers": 0,   "compliance_rate": 0},
    {"name": "Riverside Building",    "location": "Jersey City, New Jersey, USA",
     "status": "active",      "project_manager": "Mike Davis",
     "cameras": 3, "zones": ["Zone A","Zone B"],                   "workers": 45,  "compliance_rate": 58},
    {"name": "Industrial Park",       "location": "Newark, New Jersey, USA",
     "status": "maintenance", "project_manager": "Lisa Chen",
     "cameras": 2, "zones": ["Zone A"],                            "workers": 20,  "compliance_rate": 0},
    {"name": "Airport Terminal Site", "location": "Newark, New Jersey, USA",
     "status": "inactive",    "project_manager": "Tom Wilson",
     "cameras": 1, "zones": ["Zone A"],                            "workers": 0,   "compliance_rate": 0},
    {"name": "Bridge Development",    "location": "Staten Island, New York, USA",
     "status": "active",      "project_manager": "Anna Park",
     "cameras": 1, "zones": [],                                    "workers": 15,  "compliance_rate": 75},
]

ROLES = ["Electrician","Laborer","Welder","Plumber","Carpenter","Steel Fixer","Mason","Painter","Operator"]
ZONES = ["Zone A","Zone B","Zone C","Zone D"]
SITES_NAMES = ["Main Site","North Zone Site","East Side Project","Riverside Building","Bridge Development"]

WORKERS = [
    {"name":"Ramesh Kumar",   "phone":"+91 98765 43210","role":"Electrician","nationality":"India"},
    {"name":"Suresh Yadav",   "phone":"+91 98765 43211","role":"Laborer",    "nationality":"India"},
    {"name":"Amit Singh",     "phone":"+91 98765 43212","role":"Welder",     "nationality":"India"},
    {"name":"Vikram Patel",   "phone":"+91 98765 43213","role":"Plumber",    "nationality":"India"},
    {"name":"Mohammed Ali",   "phone":"+91 98765 43214","role":"Carpenter",  "nationality":"Pakistan"},
    {"name":"Rajesh Gupta",   "phone":"+91 98765 43215","role":"Laborer",    "nationality":"India"},
    {"name":"Deepak Sharma",  "phone":"+91 98765 43216","role":"Electrician","nationality":"India"},
    {"name":"Raju Paswan",    "phone":"+91 98765 43217","role":"Steel Fixer","nationality":"India"},
    {"name":"Carlos Rivera",  "phone":"+1 555 0101",    "role":"Mason",      "nationality":"Mexico"},
    {"name":"Juan Mendez",    "phone":"+1 555 0102",    "role":"Painter",    "nationality":"Mexico"},
    {"name":"Ahmed Hassan",   "phone":"+20 555 0103",   "role":"Laborer",    "nationality":"Egypt"},
    {"name":"Omar Farooq",    "phone":"+92 555 0104",   "role":"Carpenter",  "nationality":"Pakistan"},
    {"name":"Wei Zhang",      "phone":"+86 555 0105",   "role":"Operator",   "nationality":"China"},
    {"name":"Kim Sung",       "phone":"+82 555 0106",   "role":"Welder",     "nationality":"Korea"},
    {"name":"Ivan Petrov",    "phone":"+7 555 0107",    "role":"Electrician","nationality":"Russia"},
    {"name":"Ali Hassan",     "phone":"+971 555 0108",  "role":"Laborer",    "nationality":"UAE"},
    {"name":"Pedro Santos",   "phone":"+55 555 0109",   "role":"Mason",      "nationality":"Brazil"},
    {"name":"Ravi Shankar",   "phone":"+91 98765 43219","role":"Plumber",    "nationality":"India"},
    {"name":"Priya Nair",     "phone":"+91 98765 43220","role":"Operator",   "nationality":"India"},
    {"name":"Sanjay Dubey",   "phone":"+91 98765 43221","role":"Carpenter",  "nationality":"India"},
]

async def seed():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]

    # ── Sites ──────────────────────────────────────────────────
    existing_sites = await db["sites"].count_documents({})
    if existing_sites > 0:
        print(f"⚠️  {existing_sites} sites already exist. Delete them first if you want to reseed.")
    else:
        now = datetime.utcnow()
        for i, s in enumerate(SITES):
            s["start_date"]  = "Jan 15, 2024"
            s["end_date"]    = "Dec 31, 2024"
            s["created_at"]  = now - timedelta(days=random.randint(1, 90))
            s["updated_at"]  = now
            s["active_alerts"] = random.randint(0, 15)
        await db["sites"].insert_many(SITES)
        print(f"✅ Seeded {len(SITES)} sites")

    # ── Workers ────────────────────────────────────────────────
    existing_workers = await db["workers"].count_documents({})
    if existing_workers > 0:
        print(f"⚠️  {existing_workers} workers already exist. Skipping workers seed.")
    else:
        now = datetime.utcnow()
        worker_docs = []
        for i, w in enumerate(WORKERS):
            worker_docs.append({
                **w,
                "worker_code": f"WKR-{1001 + i}",
                "site":        random.choice(SITES_NAMES),
                "zone":        random.choice(ZONES),
                "experience":  f"{random.randint(1, 15)} Years",
                "status":      "active" if i < 17 else "inactive",
                "join_date":   "Jan 15, 2024",
                "created_at":  now - timedelta(days=random.randint(1, 180)),
                "updated_at":  now,
            })
        await db["workers"].insert_many(worker_docs)
        print(f"✅ Seeded {len(worker_docs)} workers")

    client.close()
    print("\n🎉 Done! Visit /sites and /workers in the dashboard.")

if __name__ == "__main__":
    asyncio.run(seed())