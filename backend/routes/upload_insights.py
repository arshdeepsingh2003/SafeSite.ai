# ============================================================
# SafeSite AI — Video Upload AI Insights Route
# File: backend/routes/upload_insights.py
#
# SEPARATE system from live monitoring insights.
# This route handles the static, report-style AI analysis
# for uploaded videos (not live streams).
# ============================================================

from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
from datetime import datetime
from database import db
from services.groq_service import generate_upload_insight
from services.auth_service import get_current_user

router = APIRouter(prefix="/upload-insights", tags=["Upload AI Insights"])


# ── POST /upload-insights/{video_id} ──────────────────────────
@router.post("/{video_id}")
async def generate_video_insight(
    video_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate a professional AI audit report for a completed video analysis.
    
    This is a SEPARATE system from live monitoring insights:
    - Aggregates YOLO detection results
    - Sends summarized analytics to Groq
    - Generates a static, detailed audit report
    - Stores the result in the video document
    
    Will NOT regenerate if a report already exists — use ?force=true to override.
    """
    try:
        oid = ObjectId(video_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID")

    video = await db["videos"].find_one({"_id": oid})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    if video.get("status") != "completed":
        raise HTTPException(
            status_code=400,
            detail="Video analysis must be completed before generating AI insights. Current status: " + video.get("status", "unknown")
        )

    # Check if already generated (avoid duplicate Groq calls)
    existing_report = video.get("ai_insight_report")
    if existing_report and existing_report.get("generated_by") == "groq":
        return {
            **existing_report,
            "from_cache": True,
            "video_id": video_id,
        }

    # ── Aggregate detection results from the video ─────────────
    analysis = video.get("analysis_result", {})
    summary  = analysis.get("summary", {})
    workers  = analysis.get("workers", [])
    violations = analysis.get("violations", [])
    video_info = analysis.get("video_info", {})

    # Build repeated offenders list
    worker_violation_counts = {}
    for v in violations:
        wid = v.get("worker_id")
        if wid is not None:
            worker_violation_counts[wid] = worker_violation_counts.get(wid, 0) + 1

    repeated_offenders = [
        {"worker_id": wid, "violation_count": count}
        for wid, count in sorted(worker_violation_counts.items(), key=lambda x: -x[1])
        if count >= 3
    ]

    # Count violation types
    helmet_violations = 0
    vest_violations = 0
    both_violations = 0
    for v in violations:
        vtype = v.get("violation", "")
        if vtype == "no_helmet":
            helmet_violations += 1
        elif vtype == "no_vest":
            vest_violations += 1
        elif vtype == "no_helmet_and_no_vest":
            both_violations += 1

    # Determine trend across frames
    frame_detections = analysis.get("frame_detections", [])
    trend = "stable"
    if len(frame_detections) > 5:
        first_half_violations = sum(
            f.get("violations", 0) for f in frame_detections[:len(frame_detections)//2]
        )
        second_half_violations = sum(
            f.get("violations", 0) for f in frame_detections[len(frame_detections)//2:]
        )
        if second_half_violations < first_half_violations * 0.8:
            trend = "improving"
        elif second_half_violations > first_half_violations * 1.2:
            trend = "worsening"

    # Calculate average detection confidence
    total_conf = 0
    conf_count = 0
    for v in violations:
        conf = v.get("confidence", 0)
        if conf:
            total_conf += conf
            conf_count += 1
    avg_confidence = (total_conf / conf_count * 100) if conf_count > 0 else 0

    # Determine severity
    compliance_rate = summary.get("compliance_rate", 0)
    if compliance_rate < 50:
        severity = "critical"
    elif compliance_rate < 70:
        severity = "high"
    elif compliance_rate < 85:
        severity = "medium"
    else:
        severity = "low"

    duration_sec = video_info.get("duration_sec", 0)
    total_frames = video_info.get("total_frames", 0)

    # ── Build the analytics payload ───────────────────────────
    analytics_payload = {
        "zone":                    video.get("zone", "Unknown Zone"),
        "total_workers_detected":  len(workers),
        "compliance_percentage":   compliance_rate,
        "peak_violations":         summary.get("peak_violations", 0),
        "total_violation_events":  summary.get("total_violation_events", 0),
        "helmet_violations":       helmet_violations,
        "vest_violations":         vest_violations,
        "both_violations":         both_violations,
        "repeated_offenders":      repeated_offenders,
        "unsafe_zones":            [],
        "avg_detection_confidence": avg_confidence,
        "trend_across_frames":     trend,
        "severity_level":          severity,
        "frames_analyzed":         total_frames,
        "duration_sec":            duration_sec,
    }

    # ── Send to Groq for AI analysis ──────────────────────────
    report = await generate_upload_insight(analytics_payload)

    # Store the report in the video document (cache it)
    await db["videos"].update_one(
        {"_id": oid},
        {"$set": {
            "ai_insight_report": report,
            "ai_insight_generated_at": datetime.utcnow(),
        }}
    )

    return {
        **report,
        "from_cache": False,
        "video_id": video_id,
    }


# ── GET /upload-insights/{video_id} ───────────────────────────
@router.get("/{video_id}")
async def get_saved_video_insight(
    video_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Retrieve a previously generated AI insight report for a video.
    Returns the cached report without re-calling Groq.
    """
    try:
        oid = ObjectId(video_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID")

    video = await db["videos"].find_one({"_id": oid})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    report = video.get("ai_insight_report")
    if not report:
        raise HTTPException(
            status_code=404,
            detail="No AI insight report found for this video. Generate one with POST /upload-insights/{video_id}",
        )

    return {
        **report,
        "from_cache": True,
        "video_id": video_id,
        "generated_at": str(video.get("ai_insight_generated_at", "")),
    }


# ── DELETE /upload-insights/{video_id} ────────────────────────
@router.delete("/{video_id}")
async def delete_video_insight(
    video_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Delete a cached AI insight report for a video.
    Useful if the user wants to regenerate the report.
    """
    try:
        oid = ObjectId(video_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID")

    result = await db["videos"].update_one(
        {"_id": oid},
        {"$unset": {"ai_insight_report": "", "ai_insight_generated_at": ""}}
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Video not found or no report to delete")

    return {"message": "AI insight report deleted successfully", "video_id": video_id}
