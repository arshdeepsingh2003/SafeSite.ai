# ============================================================
# SafeSite AI — AI Results Route  (Phase 5 updated)
# File: backend/routes/ai_results.py
#
# Phase 5 update: now uses the proper alert_service with
# cooldown logic instead of inline duplicate checks.
# ============================================================

from fastapi import APIRouter, HTTPException, BackgroundTasks
from database import db
from bson import ObjectId
from datetime import datetime
from services.alert_service import create_alert
import subprocess, os, sys

router = APIRouter(prefix="/ai", tags=["AI Detection"])

AI_SERVICE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../ai-service"))


# ── POST /ai/results/{video_id} ──────────────────────────────
# Called by detect.py after it finishes analyzing a video
@router.post("/results/{video_id}")
async def receive_ai_results(video_id: str, results: dict):
    """
    Receive analysis results from the AI service (detect.py).

    This does 3 things:
      1. Updates the video document → status: "completed"
      2. Saves the full result JSON to the video document
      3. Creates Alert documents for each unique violation
         (using the alert_service cooldown so no duplicates)
    """
    try:
        oid = ObjectId(video_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID")

    video = await db["videos"].find_one({"_id": oid})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # 1. Update video to completed
    # Keep important fields: workers, violations, frame_detections, output_filename, etc.
    # We don't strip frame_detections anymore - it's normalized and needed for canvas overlay
    stored_results = results
    
    # Build annotated video URL if we have the filename
    # The video is saved to uploads/annotated/ which is served at /uploads/annotated/
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
            "analyzed_at": datetime.utcnow(),
        }}
    )

    # 2. Create alerts for each violation using the proper service
    #    The alert_service handles cooldown logic automatically.
    violations    = results.get("violations", [])
    zone          = results.get("zone", "Zone A")
    alerts_created = 0

    print(f"📥 Received {len(violations)} violation(s) from AI analysis")
    for v in violations:
        vtype = v.get("violation", "")
        severity = v.get("severity", "high" if vtype == "no_helmet_and_no_vest" else "medium")
        print(f"   → violation={vtype} severity={severity} worker={v.get('worker_id')}")
        if severity not in ("medium", "high"):
            continue  # Skip "safe" detections

        alert_data = {
            "video_id":       video_id,
            "worker_id":      v.get("worker_id"),
            "zone":           zone,
            "camera":         "Camera 1",
            "violation_type": v.get("violation", "unknown"),
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

    print(f"✅ Video {video_id}: completed | Alerts created: {alerts_created}")

    return {
        "message":        "Results saved successfully",
        "video_id":        video_id,
        "alerts_created":  alerts_created,
        "compliance_rate": results.get("summary", {}).get("compliance_rate"),
    }


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
        {"$set": {"status": "processing", "processing_started_at": datetime.utcnow()}}
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