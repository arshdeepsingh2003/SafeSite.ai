from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from bson import ObjectId
from services.groq_service import (
    analyze_detections,
    generate_daily_report,
    generate_alert_insight,
    get_groq_status,
)
from services.auth_service import get_current_user
from database import alerts_collection, db
from datetime import datetime, timedelta

router = APIRouter(prefix="/llm", tags=["LLM / AI Insights"])


# ── Request models ────────────────────────────────────────────

class DetectionSummary(BaseModel):
    zone:                    str   = "Zone A"
    total_workers:           int   = 0
    compliant:               int   = 0
    no_helmet:               int   = 0
    no_vest:                 int   = 0
    no_helmet_and_no_vest:   int   = 0
    compliance_rate:         float = 0.0
    frames_analyzed:         int   = 0

class AlertInsightRequest(BaseModel):
    violation_type: str
    severity:       str
    zone:           str
    worker_id:      int = 0
    has_helmet:     bool = True
    has_vest:       bool = True


# ── GET /llm/status ───────────────────────────────────────────
@router.get("/status")
async def llm_status(current_user: dict = Depends(get_current_user)):
    """Check if Groq API is configured."""
    return get_groq_status()


# ── POST /llm/analyze ─────────────────────────────────────────
@router.post("/analyze")
async def analyze(
    summary: DetectionSummary,
    current_user: dict = Depends(get_current_user),
):
    """
    Send a detection summary to Groq and get back:
    - A human-readable safety insight paragraph
    - Risk level (low/medium/high/critical)
    - Top concern

    Used by:
    - VideoUploadPage after analysis completes
    - LiveMonitoringPage AI Safety Insight panel
    """
    result = await analyze_detections(summary.dict())
    return result


# ── POST /llm/analyze-video/{video_id} ────────────────────────
@router.post("/analyze-video/{video_id}")
async def analyze_video_insights(
    video_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate Groq AI insights for a completed video analysis.
    Fetches the analysis results from the video document,
    builds a detection summary, and sends it to Groq for safety insights.

    Returns the same format as POST /llm/analyze including:
    insight, risk_level, top_concern
    """
    try:
        video = await db["videos"].find_one({"_id": ObjectId(video_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID")

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    result = video.get("analysis_result", {})
    if not result:
        raise HTTPException(status_code=400, detail="Video has not been analyzed yet")

    summary = result.get("summary", {})

    detection_summary = {
        "zone":                 video.get("zone", "Unknown Zone"),
        "total_workers":        summary.get("total_workers", 0),
        "compliant":            summary.get("compliant_workers", 0),
        "no_helmet":            summary.get("no_helmet", 0),
        "no_vest":              summary.get("no_vest", 0),
        "no_helmet_and_no_vest": summary.get("no_helmet_and_no_vest", 0),
        "compliance_rate":      summary.get("compliance_rate", 0),
        "frames_analyzed":      result.get("video_info", {}).get("total_frames", 0),
    }

    insight = await analyze_detections(detection_summary)
    return insight


# ── GET /llm/report/daily ─────────────────────────────────────
@router.get("/report/daily")
async def daily_report(
    date: str = Query(default=None, description="Date in YYYY-MM-DD format. Defaults to today."),
    current_user: dict = Depends(get_current_user),
):
    """
    Generate a full daily safety report for a given date.
    Fetches real alert data from MongoDB, sends to Groq, returns report.
    """
    # Parse date (default = today)
    if date:
        try:
            report_date = datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        report_date = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    day_start = report_date.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end   = day_start + timedelta(days=1)

    # ── Aggregate today's alerts from MongoDB ──────────────────
    pipeline = [
        {"$match": {"created_at": {"$gte": day_start, "$lt": day_end}}},
        {"$group": {
            "_id": "$violation_type",
            "count": {"$sum": 1},
        }}
    ]

    counts = {
        "no_helmet":              0,
        "no_vest":                0,
        "no_helmet_and_no_vest":  0,
    }
    total_alerts = 0
    async for doc in alerts_collection.aggregate(pipeline):
        vtype = doc["_id"]
        count = doc["count"]
        total_alerts += count
        if vtype in counts:
            counts[vtype] = count

    # Zone breakdown
    zone_pipeline = [
        {"$match": {"created_at": {"$gte": day_start, "$lt": day_end}}},
        {"$group": {"_id": "$zone", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    zones = {}
    async for doc in alerts_collection.aggregate(zone_pipeline):
        zones[doc["_id"]] = doc["count"]

    # Peak hour
    hour_pipeline = [
        {"$match": {"created_at": {"$gte": day_start, "$lt": day_end}}},
        {"$group": {
            "_id": {"$hour": "$created_at"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}},
        {"$limit": 1},
    ]
    peak_hour = "unknown"
    async for doc in alerts_collection.aggregate(hour_pipeline):
        peak_hour = f"{doc['_id']:02d}:00"

    # Resolved count
    resolved = await alerts_collection.count_documents({
        "created_at": {"$gte": day_start, "$lt": day_end},
        "resolved": True,
    })

    # Compliance rate (from video analysis results if available)
    # Rough estimate based on alerts
    # In production this would be from actual frame data
    compliance_rate = max(0, 100 - (total_alerts * 3)) if total_alerts > 0 else 95.0

    alerts_data = {
        "date":                   report_date.strftime("%Y-%m-%d"),
        "total_alerts":           total_alerts,
        "no_helmet":              counts["no_helmet"],
        "no_vest":                counts["no_vest"],
        "no_helmet_and_no_vest":  counts["no_helmet_and_no_vest"],
        "resolved":               resolved,
        "zones":                  zones,
        "peak_hour":              peak_hour,
        "compliance_rate":        compliance_rate,
    }

    report = await generate_daily_report(alerts_data)
    return report


# ── GET /llm/report/weekly ────────────────────────────────────
@router.get("/report/weekly")
async def weekly_report(current_user: dict = Depends(get_current_user)):
    """
    Generate a 7-day summary report.
    Aggregates data for the last 7 days and sends to Groq.
    """
    week_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
    week_end   = datetime.utcnow()

    pipeline = [
        {"$match": {"created_at": {"$gte": week_start, "$lt": week_end}}},
        {"$group": {
            "_id": "$violation_type",
            "count": {"$sum": 1},
        }}
    ]

    counts        = {"no_helmet": 0, "no_vest": 0, "no_helmet_and_no_vest": 0}
    total_alerts  = 0
    async for doc in alerts_collection.aggregate(pipeline):
        vtype = doc["_id"]
        count = doc["count"]
        total_alerts += count
        if vtype in counts:
            counts[vtype] = count

    zone_pipeline = [
        {"$match": {"created_at": {"$gte": week_start, "$lt": week_end}}},
        {"$group": {"_id": "$zone", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    zones = {}
    async for doc in alerts_collection.aggregate(zone_pipeline):
        zones[doc["_id"]] = doc["count"]

    resolved = await alerts_collection.count_documents({
        "created_at": {"$gte": week_start, "$lt": week_end},
        "resolved":   True,
    })

    compliance_rate = max(0, 100 - (total_alerts * 2)) if total_alerts > 0 else 95.0

    alerts_data = {
        "date":                   f"{week_start.strftime('%b %d')} – {week_end.strftime('%b %d, %Y')}",
        "total_alerts":           total_alerts,
        "no_helmet":              counts["no_helmet"],
        "no_vest":                counts["no_vest"],
        "no_helmet_and_no_vest":  counts["no_helmet_and_no_vest"],
        "resolved":               resolved,
        "zones":                  zones,
        "peak_hour":              "N/A",
        "compliance_rate":        compliance_rate,
    }

    report = await generate_daily_report(alerts_data)
    report["report_type"] = "weekly"
    return report


# ── POST /llm/alert-insight ───────────────────────────────────
@router.post("/alert-insight")
async def alert_insight(
    body: AlertInsightRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate a one-sentence insight for a single alert.
    Used in the Alerts list to show AI context under each alert.
    """
    insight = await generate_alert_insight(body.dict())
    return {"insight": insight}