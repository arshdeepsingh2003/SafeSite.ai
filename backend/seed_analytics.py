# ============================================================
# SafeSite AI — Seed Analytics Data  (Phase 11)
# File: backend/seed_analytics.py
# Run with: python seed_analytics.py
#
# Creates 30 days of realistic alert data spread across
# zones, cameras, and violation types so the Analytics
# charts have interesting data to display.
# ============================================================

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta
from dotenv import load_dotenv
from time_utils import istnow
import random, os

load_dotenv()

MONGODB_URL   = os.getenv("MONGO_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME")

ZONES    = ["Zone A", "Zone B", "Zone C", "Zone D", "Zone E"]
CAMERAS  = ["Camera 1", "Camera 2", "Camera 3", "Camera 4", "Camera 5"]
TYPES    = ["no_helmet", "no_vest", "no_helmet_and_no_vest"]
SEVERITY = {"no_helmet": "medium", "no_vest": "medium", "no_helmet_and_no_vest": "high"}

# More violations in Zone A (highest risk), fewer in Zone E
ZONE_WEIGHTS = [0.35, 0.28, 0.19, 0.12, 0.06]

# Peak hours: 10am-2pm and 6pm-8pm (workers most active)
def weighted_hour():
    peak_hours = [10,11,12,13,14,18,19]
    off_hours  = list(set(range(6, 22)) - set(peak_hours))
    if random.random() < 0.65:
        return random.choice(peak_hours)
    return random.choice(off_hours)


async def seed():
    client = AsyncIOMotorClient(MONGODB_URL)
    db     = client[DATABASE_NAME]
    alerts = db["alerts"]

    # Remove old seeded analytics data
    deleted = await alerts.delete_many({"source": "analytics_seed"})
    print(f"🗑  Removed {deleted.deleted_count} old seed records")

    docs     = []
    now      = istnow()
    days     = 30
    per_day  = random.randint(18, 45)   # violations per day

    for day_offset in range(days):
        date  = now - timedelta(days=day_offset)
        count = per_day + random.randint(-8, 8)

        for _ in range(count):
            hour   = weighted_hour()
            minute = random.randint(0, 59)
            second = random.randint(0, 59)
            ts     = date.replace(hour=hour, minute=minute, second=second, microsecond=0)

            zone   = random.choices(ZONES,   weights=ZONE_WEIGHTS)[0]
            camera = random.choice(CAMERAS)
            vtype  = random.choices(TYPES,   weights=[0.45, 0.35, 0.20])[0]

            docs.append({
                "worker_id":      random.randint(1001, 1300),
                "zone":           zone,
                "camera":         camera,
                "violation_type": vtype,
                "severity":       SEVERITY[vtype],
                "has_helmet":     vtype == "no_vest",
                "has_vest":       vtype == "no_helmet",
                "status":         random.choices(["new", "acknowledged", "resolved"],
                                                 weights=[0.3, 0.2, 0.5])[0],
                "resolved":       random.random() > 0.5,
                "source":         "analytics_seed",    # tag so we can delete later
                "created_at":     ts,
                "resolved_at":    ts + timedelta(minutes=random.randint(5, 120)) if random.random() > 0.4 else None,
                "email_sent":     False,
                "frame_number":   random.randint(1, 500),
            })

    # Batch insert
    if docs:
        await alerts.insert_many(docs)
        print(f"✅ Seeded {len(docs)} analytics records across {days} days")
        print(f"   Date range: {(now - timedelta(days=days)).strftime('%Y-%m-%d')} → {now.strftime('%Y-%m-%d')}")
        print()
        print("Zone distribution:")
        from collections import Counter
        zone_counts = Counter(d["zone"] for d in docs)
        for z, c in sorted(zone_counts.items()):
            bar = "█" * (c // 5)
            print(f"  {z}: {bar} {c}")
        print()
        print("Violation type breakdown:")
        type_counts = Counter(d["violation_type"] for d in docs)
        for t, c in sorted(type_counts.items()):
            print(f"  {t}: {c} ({round(c/len(docs)*100)}%)")
    else:
        print("No documents to insert")

    client.close()
    print()
    print("🎉 Done! Open /analytics to see the charts.")


if __name__ == "__main__":
    asyncio.run(seed())