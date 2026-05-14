# ============================================================
# SafeSite AI — Socket.IO Server
# File: backend/socket_server.py
#
# This is the REAL-TIME engine.
# It creates a Socket.IO server that wraps FastAPI, so both
# HTTP (REST) and WebSocket connections work on port 8000.
#
# HOW SOCKET.IO WORKS (simple explanation):
#   - The frontend connects once when the app loads
#   - The backend can PUSH data to ALL connected frontends at any time
#   - No polling needed — instant delivery
#
# EVENTS we emit:
#   "new_alert"       → a new violation was detected
#   "alert_resolved"  → an alert was marked resolved
#   "system_status"   → heartbeat every 30s (cameras online, etc.)
#   "stats_update"    → updated dashboard stats
#   "ai_insight"      → real-time AI-generated safety insight (every 5-10s)
#
# EVENTS we receive:
#   "join_room"       → frontend joins a zone-specific room
#   "ping"            → frontend checks connection is alive
# ============================================================

import asyncio
import socketio
from datetime import datetime

from analytics.aggregate_detections import DetectionAggregator
from services.groq_service import analyze_detections

# ── Create the Socket.IO server ───────────────────────────────
# async_mode="asgi" makes it work with FastAPI (both are async)
# cors_allowed_origins allows our React frontend to connect
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    # logger=True,        # Uncomment to see all socket events in terminal
    # engineio_logger=True
)

# Track connected clients (just for logging)
connected_clients: set[str] = set()

# ── Detection Aggregator for AI insight generation ────────────
# Import this from other modules (e.g. live_detection.py) to feed data:
#   from socket_server import aggregator
#   aggregator.add_snapshot(detection_payload)
aggregator = DetectionAggregator(window_seconds=30, trend_window_seconds=120)
_insight_task_started = False


# ── Connection lifecycle events ───────────────────────────────

@sio.event
async def connect(sid, environ, auth):
    """
    Called when a frontend client connects.
    sid = unique session ID for this client connection.
    """
    connected_clients.add(sid)
    print(f"✅ Client connected: {sid} | Total: {len(connected_clients)}")

    # Send a welcome message so the frontend knows it's connected
    await sio.emit("connected", {
        "message": "Connected to SafeSite AI real-time server",
        "sid": sid,
        "timestamp": datetime.utcnow().isoformat(),
    }, to=sid)


@sio.event
async def disconnect(sid):
    """Called when a client disconnects (browser closed, etc.)."""
    connected_clients.discard(sid)
    print(f"❌ Client disconnected: {sid} | Total: {len(connected_clients)}")


# ── Events received FROM the frontend ────────────────────────

@sio.event
async def join_room(sid, data):
    """
    Frontend can join a zone-specific room.
    Then we can emit alerts only to clients watching a specific zone.

    Example:
        frontend emits: join_room({ "room": "Zone A" })
        backend can then: sio.emit("new_alert", data, room="Zone A")
    """
    room = data.get("room", "all")
    await sio.enter_room(sid, room)
    print(f"   Client {sid} joined room: {room}")
    await sio.emit("room_joined", {"room": room}, to=sid)


@sio.event
async def ping(sid, data):
    """Frontend can ping to verify connection is alive."""
    await sio.emit("pong", {
        "timestamp": datetime.utcnow().isoformat(),
        "connected_clients": len(connected_clients),
    }, to=sid)


# ── Functions called BY our backend routes ────────────────────
# These are imported and called from alerts.py, ai_results.py, etc.

async def emit_new_alert(alert: dict):
    """
    Broadcast a new alert to ALL connected frontend clients.

    Called from:
      - alert_service.create_alert()   (after saving to MongoDB)
      - routes/ai_results.py           (after AI analysis finishes)

    The frontend listens for "new_alert" and shows a toast notification.
    """
    # Format the alert nicely for the frontend
    payload = {
        "id":             str(alert.get("_id", alert.get("id", ""))),
        "worker_id":      alert.get("worker_id"),
        "zone":           alert.get("zone", "Unknown"),
        "camera":         alert.get("camera", "Camera 1"),
        "violation_type": alert.get("violation_type", "unknown"),
        "severity":       alert.get("severity", "medium"),
        "has_helmet":     alert.get("has_helmet", False),
        "has_vest":       alert.get("has_vest", False),
        "source":         alert.get("source", "uploaded_video"),
        "timestamp":      datetime.utcnow().isoformat(),
    }

    # Emit to ALL connected clients
    await sio.emit("new_alert", payload)

    # Also emit to zone-specific room (if frontend joined one)
    zone = alert.get("zone")
    if zone:
        await sio.emit("new_alert", payload, room=zone)

    print(f"📡 Emitted new_alert: {payload['violation_type']} | {payload['zone']} | severity={payload['severity']}")


async def emit_alert_resolved(alert_id: str, zone: str = None):
    """
    Tell all frontends that an alert was resolved.
    Frontends use this to remove the alert from their live list.
    """
    payload = {
        "alert_id":  alert_id,
        "zone":      zone,
        "timestamp": datetime.utcnow().isoformat(),
    }
    await sio.emit("alert_resolved", payload)
    print(f"📡 Emitted alert_resolved: {alert_id}")


async def emit_stats_update(stats: dict):
    """
    Push updated dashboard stats to all frontends.
    Called periodically or after significant events.
    """
    await sio.emit("stats_update", {
        **stats,
        "timestamp": datetime.utcnow().isoformat(),
    })
    print(f"📡 Emitted stats_update")


async def emit_system_status(status: dict):
    """
    Push system heartbeat (cameras online, etc.).
    Called by the periodic heartbeat task.
    """
    await sio.emit("system_status", {
        **status,
        "timestamp": datetime.utcnow().isoformat(),
    })


# ── AI Insight generation task ─────────────────────────────────
async def _run_ai_insight_loop():
    """
    Periodically aggregate detection data and generate AI insights.
    Runs every 8 seconds, accumulates data from the aggregator,
    sends to Groq, and emits 'ai_insight' to all connected clients.
    """
    global _insight_task_started
    _insight_task_started = True
    print("🧠 AI Insight loop started — generating insights every ~8s")
    while True:
        await asyncio.sleep(8)
        try:
            if not aggregator.has_data:
                continue

            if not aggregator.should_regenerate(min_interval=8):
                continue

            payload = aggregator.build_groq_payload()
            if not payload:
                continue

            # Add previous insight for trend comparison
            insight = await analyze_detections(payload)

            if insight:
                insight["note"] = "Real-time AI insight"
                aggregator.set_last_insight(insight)
                await sio.emit("ai_insight", insight)
                print(f"🧠 Emitted ai_insight | risk={insight.get('risk_level')} | "
                      f"workers={payload.get('total_workers')} | "
                      f"compliance={payload.get('compliance_rate')}%")
        except Exception as e:
            print(f"⚠️  AI insight loop error: {e}")


async def emit_ai_insight(insight: dict):
    """
    Manually emit an AI insight to all connected clients.
    Can be called from other routes if needed.
    """
    await sio.emit("ai_insight", insight)
    print(f"📡 Emitted ai_insight (manual)")


def start_insight_loop():
    """Start the background insight generation loop (called from main.py)."""
    if not _insight_task_started:
        asyncio.create_task(_run_ai_insight_loop())


# ── live_detection event ──────────────────────────────────────
# Fired by live_detect.py every time it processes a frame.
# We forward the payload to ALL connected browser clients
# AND accumulate it for AI insight generation.
@sio.event
async def live_detection(sid, data):
    """
    Receive a detection payload from the AI service (live_detect.py)
    and broadcast it to all connected frontend clients.

    The frontend canvas overlay listens for this event and draws
    bounding boxes based on the normalized bbox coordinates.
    """
    # Accumulate for AI insight generation
    aggregator.add_snapshot(data)

    # Forward to all browser clients in the default room
    await sio.emit("live_detection", data, skip_sid=sid)

    # Also create an alert for high-severity detections
    # (respects the 60-second cooldown so no duplicates)
    try:
        from services.alert_service import create_alert
        for det in data.get("detections", []):
            if det.get("severity") in ("medium", "high"):
                await create_alert({
                    "worker_id":      det.get("worker_id", 0),
                    "zone":           data.get("zone", "Zone A"),
                    "camera":         data.get("camera", "Camera 1"),
                    "violation_type": det.get("violation", "unknown"),
                    "severity":       det.get("severity", "medium"),
                    "has_helmet":     det.get("has_helmet", False),
                    "has_vest":       det.get("has_vest", False),
                    "source":         "live_stream",
                    "frame_number":   data.get("frame"),
                })
    except Exception as e:
        pass   # Never let alert creation crash the socket handler