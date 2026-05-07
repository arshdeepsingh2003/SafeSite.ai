# ============================================================
# SafeSite AI — Socket.IO Test Route
# File: backend/routes/socket_test.py
#
# This is ONLY for development/testing.
# It lets you manually fire a real-time alert via the API
# so you can see the Socket.IO toast on the frontend
# WITHOUT needing a real video or camera.
#
# Endpoints:
#   POST /test/fire-alert          — fire a fake alert instantly
#   POST /test/fire-high-alert     — fire a high-severity alert
#   GET  /test/socket-status       — how many clients connected?
# ============================================================

from fastapi import APIRouter, Depends
from services.auth_service import get_current_user
from services.alert_service import create_alert
from socket_server import sio, emit_new_alert, emit_stats_update
from datetime import datetime
import random

router = APIRouter(prefix="/test", tags=["Testing"])

ZONES   = ["Zone A", "Zone B", "Zone C", "Zone D"]
CAMERAS = ["Camera 1", "Camera 2", "Camera 3", "Camera 4"]

VIOLATIONS = [
    {"violation_type": "no_helmet",             "severity": "medium", "has_helmet": False, "has_vest": True},
    {"violation_type": "no_vest",               "severity": "medium", "has_helmet": True,  "has_vest": False},
    {"violation_type": "no_helmet_and_no_vest", "severity": "high",   "has_helmet": False, "has_vest": False},
]


@router.post("/fire-alert")
async def fire_random_alert(current_user: dict = Depends(get_current_user)):
    """
    Fire a random violation alert through the full pipeline:
      1. Saves it to MongoDB (via alert_service, with cooldown)
      2. Emits it via Socket.IO (happens inside alert_service)
      3. Frontend receives it instantly as a toast notification

    Use this button on the dashboard to test real-time!
    """
    v = random.choice(VIOLATIONS)

    alert_data = {
        "worker_id":      random.randint(1000, 1099),
        "zone":           random.choice(ZONES),
        "camera":         random.choice(CAMERAS),
        "violation_type": v["violation_type"],
        "severity":       v["severity"],
        "has_helmet":     v["has_helmet"],
        "has_vest":       v["has_vest"],
        "source":         "live_stream",
    }

    result = await create_alert(alert_data)

    if result is None:
        return {"message": "Alert skipped (cooldown active for this worker+zone)", "cooldown": True}

    return {
        "message":        "✅ Alert fired! Check the frontend for the real-time toast.",
        "alert_id":       str(result["_id"]),
        "violation_type": alert_data["violation_type"],
        "severity":       alert_data["severity"],
        "zone":           alert_data["zone"],
        "cooldown":       False,
    }


@router.post("/fire-high-alert")
async def fire_high_alert(current_user: dict = Depends(get_current_user)):
    """
    Fire a guaranteed HIGH severity alert.
    Bypasses cooldown by using a unique worker ID each time.
    Good for testing the alarm sound (Phase 7).
    """
    alert_data = {
        "worker_id":      random.randint(2000, 2999),  # Different range = bypasses cooldown
        "zone":           random.choice(ZONES),
        "camera":         random.choice(CAMERAS),
        "violation_type": "no_helmet_and_no_vest",
        "severity":       "high",
        "has_helmet":     False,
        "has_vest":       False,
        "source":         "live_stream",
    }

    result = await create_alert(alert_data)

    return {
        "message":   "🚨 HIGH alert fired! You should see a red toast on the frontend.",
        "alert_id":  str(result["_id"]) if result else None,
        "severity":  "high",
        "zone":      alert_data["zone"],
    }


@router.get("/socket-status")
async def socket_status(current_user: dict = Depends(get_current_user)):
    """
    Check how many frontend clients are currently connected via Socket.IO.
    Useful for debugging.
    """
    from socket_server import connected_clients
    return {
        "connected_clients": len(connected_clients),
        "client_ids":        list(connected_clients),
        "timestamp":         datetime.utcnow().isoformat(),
    }


@router.post("/emit-raw")
async def emit_raw_event(current_user: dict = Depends(get_current_user)):
    """
    Emit a raw Socket.IO event directly (skips MongoDB).
    For quick frontend testing only.
    """
    fake_alert = {
        "_id":            "test_direct_emit",
        "id":             "test_direct_emit",
        "worker_id":      9999,
        "zone":           "Zone A",
        "camera":         "Camera 1",
        "violation_type": "no_helmet_and_no_vest",
        "severity":       "high",
        "has_helmet":     False,
        "has_vest":       False,
        "source":         "live_stream",
    }
    await emit_new_alert(fake_alert)
    return {"message": "Raw event emitted directly to all connected clients"}