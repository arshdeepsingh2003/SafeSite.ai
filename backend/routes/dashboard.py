from fastapi import APIRouter, Depends
from database import alerts_collection
from services.auth_service import get_current_user
from datetime import datetime, timedelta

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """
    Returns dashboard statistics:
    - total_workers: unique workers detected
    - compliant: workers with helmet AND vest
    - no_helmet: violation count
    - no_vest: violation count
    - both_missing: no helmet AND no vest
    - compliance_rate: percentage compliant
    - change_pct: change vs yesterday
    """
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)

    # Get today's alerts
    today_alerts = await alerts_collection.find({
        "created_at": {"$gte": today_start}
    }).to_list(length=None)

    # Get yesterday's alerts for comparison
    yesterday_alerts = await alerts_collection.find({
        "created_at": {"$gte": yesterday_start, "$lt": today_start}
    }).to_list(length=None)

    # Count today's violations by type
    no_helmet = sum(1 for a in today_alerts if a.get("violation_type") == "no_helmet")
    no_vest = sum(1 for a in today_alerts if a.get("violation_type") == "no_vest")
    both_missing = sum(1 for a in today_alerts if a.get("violation_type") == "no_helmet_and_no_vest")

    # Count unique workers today
    total_workers = len(set(
        str(a.get("worker_id", "")) for a in today_alerts if a.get("worker_id")
    ))

    # Calculate compliant workers (those with helmet AND vest in alerts)
    compliant = sum(1 for a in today_alerts if a.get("has_helmet") and a.get("has_vest"))

    # Calculate compliance rate
    compliance_rate = round((compliant / total_workers * 100) if total_workers > 0 else 0, 1)

    # Calculate change percentage vs yesterday
    yesterday_total = len(set(
        str(a.get("worker_id", "")) for a in yesterday_alerts if a.get("worker_id")
    ))
    if yesterday_total > 0:
        change_pct = round(((total_workers - yesterday_total) / yesterday_total) * 100, 1)
    else:
        change_pct = 0

    # Get recent alerts for dashboard
    recent_alerts = await alerts_collection.find({
        "created_at": {"$gte": today_start}
    }).sort("created_at", -1).limit(6).to_list(length=6)

    # ── Zone breakdown (top zones) ────────────────────────────
    zone_pipeline = [
        {"$match": {"created_at": {"$gte": today_start}}},
        {"$group": {"_id": "$zone", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5},
    ]
    top_zones = []
    async for doc in alerts_collection.aggregate(zone_pipeline):
        top_zones.append({"zone": doc["_id"] or "Unknown", "count": doc["count"]})

    # ── Hourly trend data ─────────────────────────────────────
    hour_pipeline = [
        {"$match": {"created_at": {"$gte": today_start}}},
        {"$group": {
            "_id": {"$hour": "$created_at"},
            "no_helmet": {"$sum": {"$cond": [{"$eq": ["$violation_type", "no_helmet"]}, 1, 0]}},
            "no_vest": {"$sum": {"$cond": [{"$eq": ["$violation_type", "no_vest"]}, 1, 0]}},
            "both": {"$sum": {"$cond": [{"$eq": ["$violation_type", "no_helmet_and_no_vest"]}, 1, 0]}},
        }},
        {"$sort": {"_id": 1}},
    ]
    trend_data = []
    async for doc in alerts_collection.aggregate(hour_pipeline):
        trend_data.append({
            "hour": f"{doc['_id']:02d}:00",
            "no_helmet": doc["no_helmet"],
            "no_vest": doc["no_vest"],
            "both": doc["both"],
        })

    # Convert ObjectId to string for JSON serialization
    for alert in recent_alerts:
        alert["_id"] = str(alert["_id"])
        if "created_at" in alert and isinstance(alert["created_at"], datetime):
            alert["created_at"] = alert["created_at"].isoformat()

    return {
        "stats": {
            "total_workers": total_workers,
            "compliant": compliant,
            "no_helmet": no_helmet,
            "no_vest": no_vest,
            "both_missing": both_missing,
            "compliance_rate": compliance_rate,
            "change_pct": change_pct,
        },
        "recent_alerts": recent_alerts,
        "top_zones": top_zones,
        "trend_data": trend_data,
    }
