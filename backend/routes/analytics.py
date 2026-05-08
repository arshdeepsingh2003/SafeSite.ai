from fastapi import APIRouter, Depends, Query
from database import alerts_collection
from services.auth_service import get_current_user
from datetime import datetime, timedelta

router = APIRouter(prefix="/analytics", tags=["Analytics"])


# ── GET /analytics/trend ─────────────────────────────────────
@router.get("/trend")
async def get_trend(
    range: str = Query(default="week"),
    granularity: str = Query(default="daily"),
    current_user: dict = Depends(get_current_user),
):
    """Return violation trend data grouped by day or hour."""
    now = datetime.utcnow()

    if range == "week":
        start = now - timedelta(days=6)
    elif range == "month":
        start = now - timedelta(days=29)
    else:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    start = start.replace(hour=0, minute=0, second=0, microsecond=0)

    if granularity == "hourly":
        group_id = {"$hour": "$created_at"}
        sort_key = "_id"
        label_expr = {"$concat": [{"$toString": "$_id"}, ":00"]}
    else:
        group_id = {
            "year": {"$year": "$created_at"},
            "month": {"$month": "$created_at"},
            "day": {"$dayOfMonth": "$created_at"},
        }
        sort_key = "_id"
        label_expr = {
            "$concat": [
                {"$toString": "$_id.month"}, "/",
                {"$toString": "$_id.day"},
            ]
        }

    pipeline = [
        {"$match": {"created_at": {"$gte": start}}},
        {"$group": {
            "_id": group_id,
            "no_helmet": {"$sum": {"$cond": [{"$eq": ["$violation_type", "no_helmet"]}, 1, 0]}},
            "no_vest": {"$sum": {"$cond": [{"$eq": ["$violation_type", "no_vest"]}, 1, 0]}},
            "both": {"$sum": {"$cond": [{"$eq": ["$violation_type", "no_helmet_and_no_vest"]}, 1, 0]}},
        }},
        {"$sort": {sort_key: 1}},
    ]

    trend_data = []
    async for doc in alerts_collection.aggregate(pipeline):
        label = doc["_id"]
        if isinstance(label, dict):
            label = f"{label['month']}/{label['day']}"
        elif isinstance(label, int):
            label = f"{label:02d}:00"
        else:
            label = str(label)

        trend_data.append({
            "label": label,
            "no_helmet": doc["no_helmet"],
            "no_vest": doc["no_vest"],
            "both": doc["both"],
        })

    return trend_data
