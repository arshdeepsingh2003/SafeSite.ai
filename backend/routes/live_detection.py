from fastapi import APIRouter, HTTPException
from database import db
from datetime import datetime
from services.alert_service import create_alert

router = APIRouter(prefix="/ai", tags=["AI Live Detection"])


@router.post("/live-detection")
async def receive_live_detection(data: dict):
    zone = data.get("zone", "Zone A")
    camera = data.get("camera", "Camera 1")
    alerts_created = 0

    for det in data.get("detections", []):
        severity = det.get("severity")
        if severity not in ("medium", "high"):
            continue

        alert_data = {
            "worker_id": det.get("worker_id", 0),
            "zone": zone,
            "camera": camera,
            "violation_type": det.get("violation", "unknown"),
            "severity": severity,
            "has_helmet": det.get("has_helmet", False),
            "has_vest": det.get("has_vest", False),
            "frame_number": data.get("frame"),
            "source": "live_stream",
        }
        created = await create_alert(alert_data)
        if created:
            alerts_created += 1

    return {
        "message": "Live detection processed",
        "alerts_created": alerts_created,
    }


@router.post("/stream-started")
async def stream_started(data: dict):
    await db["stream_events"].insert_one({
        "event": "started",
        "camera": data.get("camera", "Camera 1"),
        "zone": data.get("zone", "Zone A"),
        "timestamp": datetime.utcnow(),
    })
    return {"message": "Stream started event recorded"}


@router.post("/stream-stopped")
async def stream_stopped(data: dict):
    await db["stream_events"].insert_one({
        "event": "stopped",
        "camera": data.get("camera", "Camera 1"),
        "zone": data.get("zone", "Zone A"),
        "timestamp": datetime.utcnow(),
    })
    return {"message": "Stream stopped event recorded"}
