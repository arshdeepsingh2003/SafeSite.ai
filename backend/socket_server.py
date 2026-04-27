import socketio

# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*"
)

# ── Events ─────────────────────────────────────────

@sio.event
async def connect(sid, environ):
    print(f"✅ Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"❌ Client disconnected: {sid}")


# ── Emit Functions ─────────────────────────────────

async def emit_system_status(data: dict):
    """
    Send system status to all connected clients
    """
    await sio.emit("system_status", data)


async def emit_new_alert(data: dict):
    """
    Send new alert event to frontend
    """
    await sio.emit("new_alert", data)