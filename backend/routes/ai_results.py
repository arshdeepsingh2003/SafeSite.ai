# ============================================================
# SafeSite AI — AI Results Route  (v2 — dedup + state lock)
# File: backend/routes/ai_results.py
# ============================================================

from fastapi import APIRouter, HTTPException, BackgroundTasks
from database import db
from bson import ObjectId
from datetime import datetime
from time_utils import istnow
from services.alert_service import create_alert
import subprocess, os, sys

router = APIRouter(prefix="/ai", tags=["AI Detection"])

AI_SERVICE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../ai-service"))

# ── Processing state lock ────────────────────────────────────
# Prevents duplicate processing of the same video results.
_processing_videos: set[str] = set()

# ── Dedup: track last notification per video ─────────────────
# Hash-based dedup so we never emit the same notification twice.
_last_notification: dict[str, dict] = {}


def _make_notification_hash(video_id: str, notification_type: str, data: dict) -> str:
    """Create a deterministic hash for deduplication."""
    raw = f"{video_id}:{notification_type}:{data.get('compliance_rate', '')}:{data.get('alerts_created', '')}"
    return str(hash(raw))


# ── POST /ai/results/{video_id} ──────────────────────────────
# Called by detect.py after it finishes analyzing a video
@router.post("/results/{video_id}")
async def receive_ai_results(video_id: str, results: dict):
    """
    Receive analysis results from the AI service (detect.py).

    Consolidated behaviour:
      1. State lock + idempotency check — skip if already completed
      2. Saves results to the video document (status → completed)
      3. Creates ONE alert per unique (worker_id, violation_type)
         instead of one per violation event
      4. Emits a single "analysis_complete" socket event
      5. Deduplicates via notification hash
    """
    # ── Idempotency / state lock ──────────────────────────────
    if video_id in _processing_videos:
        print(f"⏭️  Skipping duplicate receive_ai_results for {video_id} (already processing)")
        return {"message": "Already processing results", "video_id": video_id}

    try:
        oid = ObjectId(video_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID")

    video = await db["videos"].find_one({"_id": oid})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # If already completed, skip entirely
    if video.get("status") == "completed":
        print(f"⏭️  Video {video_id} already completed — skipping duplicate results")
        return {
            "message": "Already completed",
            "video_id": video_id,
            "compliance_rate": results.get("summary", {}).get("compliance_rate"),
        }

    _processing_videos.add(video_id)

    try:
        # ── 1. Save results ───────────────────────────────────
        stored_results = results

        annotated_video_url = None
        output_filename = results.get("output_filename")
        if output_filename:
            annotated_video_url = f"/uploads/annotated/{output_filename}"

        await db["videos"].update_one(
            {"_id": oid},
            {"$set": {
                "status": "completed",
                "analysis_result": stored_results,
                "annotated_video_url": annotated_video_url,
                "output_filename": output_filename,
                "analyzed_at": istnow(),
            }}
        )

        # ── 2. Consolidated alerts (ONE per unique violation) ─
        violations = results.get("violations", [])
        zone = results.get("zone", "Zone A")
        summary = results.get("summary", {})
        compliance_rate = summary.get("compliance_rate", 0)

        # Dedup key: only one alert per (worker_id, violation_type)
        seen_violations: set[tuple] = set()
        alerts_created = 0

        print(f"📥 Received {len(violations)} violation event(s) — consolidating into unique alerts")

        for v in violations:
            worker_id = v.get("worker_id")
            vtype = v.get("violation", "")
            severity = v.get("severity", "high" if vtype == "no_helmet_and_no_vest" else "medium")

            if severity not in ("medium", "high"):
                continue

            dedup_key = (worker_id, vtype, zone)
            if dedup_key in seen_violations:
                continue
            seen_violations.add(dedup_key)

            alert_data = {
                "video_id":       video_id,
                "worker_id":      worker_id,
                "zone":           zone,
                "camera":         "Camera 1",
                "violation_type": vtype,
                "severity":       severity,
                "has_helmet":     v.get("has_helmet", False),
                "has_vest":       v.get("has_vest", False),
                "frame_number":   v.get("frame"),
                "timestamp_sec":  v.get("timestamp_sec"),
                "bbox":           v.get("bbox"),
                "source":         "uploaded_video",
            }

            created = await create_alert(alert_data)
            if created:
                alerts_created += 1

        print(f"📊 Video {video_id} | {len(seen_violations)} unique violations → {alerts_created} alerts created")

        # ── 3. Emit a SINGLE "analysis_complete" socket event ─
        notif_data = {
            "video_id": video_id,
            "compliance_rate": compliance_rate,
            "alerts_created": alerts_created,
            "total_violations": len(violations),
            "unique_violations": len(seen_violations),
            "zone": zone,
        }

        notif_hash = _make_notification_hash(video_id, "analysis_complete", notif_data)
        prev = _last_notification.get(video_id, {})

        # Only emit if this notification is different from the last one
        if prev.get("hash") != notif_hash:
            from socket_server import emit_analysis_complete
            await emit_analysis_complete(notif_data)
            _last_notification[video_id] = {"hash": notif_hash, "time": istnow()}
            print(f"📡 Emitted analysis_complete for {video_id}")
        else:
            print(f"⏭️  Duplicate analysis_complete suppressed for {video_id}")

        print(f"✅ Video {video_id}: completed | {alerts_created} alerts")

        return {
            "message":          "Results saved successfully",
            "video_id":         video_id,
            "alerts_created":   alerts_created,
            "compliance_rate":  compliance_rate,
        }

    finally:
        _processing_videos.discard(video_id)


# ── POST /ai/analyze/{video_id} ─────────────────────────────
# Frontend calls this to start analysis on an uploaded video
@router.post("/analyze/{video_id}")
async def trigger_analysis(video_id: str, background_tasks: BackgroundTasks):
    """
    Kick off AI analysis on an uploaded video.
    Runs detect.py as a background task so the API stays fast.
    """
    try:
        oid = ObjectId(video_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID")

    video = await db["videos"].find_one({"_id": oid})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    if video.get("status") == "processing":
        raise HTTPException(status_code=400, detail="This video is already being analyzed.")
    if video.get("type") == "stream":
        raise HTTPException(status_code=400, detail="Cannot analyze live streams via upload. Use live monitoring.")

    file_path = video.get("file_path")
    # Convert to absolute path if relative (video.py stores relative to backend)
    if file_path and not os.path.isabs(file_path):
        file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", file_path))
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video file not found on disk.")

    # Mark as processing immediately
    await db["videos"].update_one(
        {"_id": oid},
        {"$set": {"status": "processing", "processing_started_at": istnow()}}
    )

    # Run detect.py in background
    background_tasks.add_task(
        _run_detection_subprocess,
        file_path=file_path,
        video_id=video_id,
        zone=video.get("zone", "Zone A"),
    )

    return {
        "message":   "✅ Analysis started!",
        "video_id":  video_id,
        "status":    "processing",
        "note":      "Poll GET /ai/status/{video_id} to check progress.",
    }


async def _run_detection_subprocess(file_path: str, video_id: str, zone: str):
    """Run detect.py as a subprocess in the background."""
    detect_script = os.path.join(AI_SERVICE_DIR, "detect.py")
    python_exe    = sys.executable

    # Verify files exist before running
    if not os.path.exists(file_path):
        print(f"❌ Video file not found: {file_path}")
        await db["videos"].update_one(
            {"_id": ObjectId(video_id)},
            {"$set": {"status": "error", "error_message": f"Video file not found: {file_path}"}}
        )
        return
    if not os.path.exists(detect_script):
        print(f"❌ detect.py not found: {detect_script}")
        await db["videos"].update_one(
            {"_id": ObjectId(video_id)},
            {"$set": {"status": "error", "error_message": f"detect.py not found at {detect_script}"}}
        )
        return

    cmd = [
        python_exe, detect_script,
        "--video",    file_path,
        "--video_id", video_id,
        "--zone",     zone,
    ]

    print(f"🚀 Running detect.py for video {video_id}")
    print(f"   Command: {' '.join(cmd)}")
    print(f"   Working dir: {AI_SERVICE_DIR}")

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600, cwd=AI_SERVICE_DIR)
        if proc.returncode != 0:
            error_msg = proc.stderr[-1000:] if proc.stderr else "Unknown error (no stderr)"
            print(f"❌ detect.py failed with return code {proc.returncode}")
            print(f"   stderr: {error_msg}")
            await db["videos"].update_one(
                {"_id": ObjectId(video_id)},
                {"$set": {"status": "error", "error_message": error_msg}}
            )
        else:
            print(f"✅ detect.py finished successfully for video {video_id}")
            if proc.stdout:
                print(f"   Output: {proc.stdout[-500:]}")
    except subprocess.TimeoutExpired:
        print(f"⏰ detect.py timed out for {video_id}")
        await db["videos"].update_one(
            {"_id": ObjectId(video_id)},
            {"$set": {"status": "error", "error_message": "Processing timed out (10 min limit)"}}
        )


# ── POST /ai/progress/{video_id} ────────────────────────────
# Called by detect.py to report progress during processing
@router.post("/progress/{video_id}")
async def receive_progress(video_id: str, progress_data: dict):
    try:
        oid = ObjectId(video_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID")

    await db["videos"].update_one(
        {"_id": oid},
        {"$set": {
            "analysis_progress": progress_data,
        }}
    )
    return {"status": "ok"}


# ── GET /ai/status/{video_id} ────────────────────────────────
# Frontend polls this to check if analysis is complete
@router.get("/status/{video_id}")
async def get_analysis_status(video_id: str):
    """
    Check the processing status of a video.
    Frontend polls this every 3 seconds while status = "processing".
    When completed, returns full detection data for frontend canvas overlay.
    """
    try:
        video = await db["videos"].find_one({"_id": ObjectId(video_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID")

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    response = {
        "video_id":    video_id,
        "status":      video.get("status", "uploaded"),
        "zone":        video.get("zone"),
        "uploaded_at": str(video.get("uploaded_at", "")),
        "analysis_progress": video.get("analysis_progress"),
    }

    # Include annotated video URL if available
    if video.get("annotated_video_url"):
        response["annotated_video_url"] = video.get("annotated_video_url")

    # Include full detection data when done
    if video.get("status") == "completed" and video.get("analysis_result"):
        result = video["analysis_result"]
        response["summary"] = result.get("summary", {})
        response["analyzed_at"] = str(video.get("analyzed_at", ""))
        response["workers"] = result.get("workers", [])
        response["violations"] = result.get("violations", [])
        response["video_info"] = result.get("video_info", {})
        response["processing_time_sec"] = result.get("processing_time_sec")
        
        # Include frame_detections for canvas overlay (normalized coordinates)
        # This can be large, so frontend can request full details separately if needed
        frame_dets = result.get("frame_detections", [])
        if frame_dets:
            response["has_frame_detections"] = True
            response["frame_count"] = len(frame_dets)
            # Only include first 2 frames as preview - frontend should use /ai/results/{id} for full data
            response["frame_detections_preview"] = frame_dets[:2]

    if video.get("status") == "error":
        response["error_message"] = video.get("error_message", "Unknown error")

    return response


# ── GET /ai/results/{video_id} ────────────────────────────────
# Get full analysis results including all frame detections
@router.get("/results/{video_id}")
async def get_full_analysis_results(video_id: str):
    """
    Get complete analysis results for a video including:
    - All frame-by-frame detections (normalized coordinates for canvas)
    - Worker summary
    - Violation events
    - Annotated video URL
    """
    try:
        video = await db["videos"].find_one({"_id": ObjectId(video_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID")

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    result = video.get("analysis_result", {})
    
    response = {
        "video_id": video_id,
        "status": video.get("status", "uploaded"),
        "zone": video.get("zone"),
        "annotated_video_url": video.get("annotated_video_url"),
        "output_filename": video.get("output_filename"),
        "file_url": video.get("file_url"),
    }

    if result:
        response["summary"] = result.get("summary", {})
        response["workers"] = result.get("workers", [])
        response["violations"] = result.get("violations", [])
        response["video_info"] = result.get("video_info", {})
        response["frame_detections"] = result.get("frame_detections", [])
        response["processing_time_sec"] = result.get("processing_time_sec")
        response["analyzed_at"] = str(video.get("analyzed_at", ""))

    return response