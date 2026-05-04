from datetime import datetime, timedelta
from database import db
from bson import ObjectId

# Cooldown period: prevent duplicate alerts for the same violation/worker/zone
ALERT_COOLDOWN_MINUTES = 10


async def create_alert(alert_data: dict) -> bool:
    """
    Create an alert with cooldown logic to prevent duplicates.
    
    Returns True if alert was created, False if it was suppressed by cooldown.
    """
    violation_type = alert_data.get("violation_type")
    worker_id = alert_data.get("worker_id")
    zone = alert_data.get("zone")
    
    if not violation_type or not worker_id:
        return False
    
    # Check for recent duplicate alerts (cooldown)
    cooldown_threshold = datetime.utcnow() - timedelta(minutes=ALERT_COOLDOWN_MINUTES)
    
    recent_alert = await db["alerts"].find_one({
        "violation_type": violation_type,
        "worker_id": worker_id,
        "zone": zone,
        "created_at": {"$gte": cooldown_threshold},
        "status": {"$ne": "resolved"}
    })
    
    if recent_alert:
        print(f"⏭️  Alert suppressed (cooldown): {violation_type} for worker {worker_id}")
        return False
    
    # Create new alert
    alert_doc = {
        "video_id": alert_data.get("video_id"),
        "worker_id": worker_id,
        "zone": zone,
        "camera": alert_data.get("camera", "Camera 1"),
        "violation_type": violation_type,
        "severity": alert_data.get("severity", "medium"),
        "has_helmet": alert_data.get("has_helmet", False),
        "has_vest": alert_data.get("has_vest", False),
        "frame_number": alert_data.get("frame_number"),
        "timestamp_sec": alert_data.get("timestamp_sec"),
        "bbox": alert_data.get("bbox"),
        "source": alert_data.get("source", "uploaded_video"),
        "status": "active",
        "created_at": datetime.utcnow(),
        "resolved_at": None,
    }
    
    result = await db["alerts"].insert_one(alert_doc)
    print(f"🚨 Alert created: {violation_type} for worker {worker_id} (ID: {result.inserted_id})")
    return True
