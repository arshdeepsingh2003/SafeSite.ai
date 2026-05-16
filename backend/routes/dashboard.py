# ============================================================
# SafeSite AI — Dashboard Routes  (Phase 10)
# File: backend/routes/dashboard.py
#
# Single endpoint that returns all data the Dashboard needs:
#   - Stat cards (workers, compliance counts)
#   - Recent alerts list
#   - Violations trend data (hourly)
#   - Top violation zones
#   - Safety compliance donut data
# ============================================================

from fastapi import APIRouter, Depends
from database import db, alerts_collection
from services.auth_service import get_current_user
from datetime import datetime, timedelta
from time_utils import istnow

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """
    All data needed to render the Dashboard page in one call.
    Reduces frontend API calls from 5 → 1.
    """
    today   = istnow().replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)

    # ── Stat cards ───────────────────────────────────────────
    today_alerts = await alerts_collection.count_documents({"created_at": {"$gte": today}})
    yesterday_alerts = await alerts_collection.count_documents({
        "created_at": {"$gte": yesterday, "$lt": today}
    })

    no_helmet      = await alerts_collection.count_documents({"created_at": {"$gte": today}, "violation_type": "no_helmet"})
    no_vest        = await alerts_collection.count_documents({"created_at": {"$gte": today}, "violation_type": "no_vest"})
    both_missing   = await alerts_collection.count_documents({"created_at": {"$gte": today}, "violation_type": "no_helmet_and_no_vest"})
    total_workers  = max(today_alerts, 1) * 3   # Estimated (real in Phase 11 analytics)
    compliant      = max(0, total_workers - no_helmet - no_vest - both_missing)
    compliance_pct = round((compliant / total_workers * 100), 1) if total_workers > 0 else 0

    # Change vs yesterday
    yesterday_total = max(yesterday_alerts, 1)
    change_pct = round(((total_workers - yesterday_total) / yesterday_total) * 100, 1)

    # ── Recent alerts (last 8) ───────────────────────────────
    recent_alerts = []
    async for a in alerts_collection.find().sort("created_at", -1).limit(8):
        recent_alerts.append({
            "id":             str(a["_id"]),
            "violation_type": a.get("violation_type", "unknown"),
            "zone":           a.get("zone", "—"),
            "camera":         a.get("camera", "—"),
            "severity":       a.get("severity", "medium"),
            "created_at":     a["created_at"].isoformat() if a.get("created_at") else None,
        })

    # ── Hourly trend data (24 hours) ─────────────────────────
    trend = []
    for h in range(24):
        hour_start = today + timedelta(hours=h)
        hour_end   = hour_start + timedelta(hours=1)
        nh = await alerts_collection.count_documents({"created_at": {"$gte": hour_start, "$lt": hour_end}, "violation_type": "no_helmet"})
        nv = await alerts_collection.count_documents({"created_at": {"$gte": hour_start, "$lt": hour_end}, "violation_type": "no_vest"})
        bm = await alerts_collection.count_documents({"created_at": {"$gte": hour_start, "$lt": hour_end}, "violation_type": "no_helmet_and_no_vest"})
        trend.append({"time": f"{h:02d}:00", "no_helmet": nh, "no_vest": nv, "both": bm})

    # ── Top violation zones ──────────────────────────────────
    pipeline = [
        {"$match": {"created_at": {"$gte": today}}},
        {"$group": {"_id": "$zone", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5},
    ]
    zones = []
    async for z in alerts_collection.aggregate(pipeline):
        zones.append({"zone": z["_id"], "count": z["count"]})

    # ── Safety compliance donut ──────────────────────────────
    compliance_data = [
        {"label": "Compliant",          "value": compliant,    "color": "#22c55e"},
        {"label": "No Helmet",          "value": no_helmet,    "color": "#f97316"},
        {"label": "No Vest",            "value": no_vest,      "color": "#eab308"},
        {"label": "No Helmet & No Vest","value": both_missing, "color": "#a855f7"},
    ]

    return {
        "stats": {
            "total_workers":   total_workers,
            "compliant":       compliant,
            "no_helmet":       no_helmet,
            "no_vest":         no_vest,
            "both_missing":    both_missing,
            "compliance_rate": compliance_pct,
            "change_pct":      change_pct,
        },
        "recent_alerts":   recent_alerts,
        "trend":           trend,
        "top_zones":       zones,
        "compliance_data": compliance_data,
    }