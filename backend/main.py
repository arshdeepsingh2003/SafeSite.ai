# ============================================================
# SafeSite AI — Backend Entry Point (Phase 6 — Real-Time)
# File: backend/main.py
#
# ⚠️  IMPORTANT: Start with:
#   uvicorn main:socket_app --reload --port 8000
#   (NOT "main:app" — you must use "main:socket_app")
# ============================================================

import asyncio
import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import connect_db, close_db
from routes.auth         import router as auth_router
from routes.video        import router as video_router
from routes.ai_results   import router as ai_router
from routes.alerts       import router as alerts_router
from routes.socket_test  import router as test_router
from socket_server       import sio, emit_system_status
import os

# ── FastAPI app ───────────────────────────────────────────────
app = FastAPI(
    title="SafeSite AI — Construction Safety API",
    description="Backend API for the Construction Site Safety Monitoring System",
    version="6.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads/videos",    exist_ok=True)
os.makedirs("uploads/annotated", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ── Lifecycle ─────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    await connect_db()
    asyncio.create_task(_heartbeat_task())
    print("🚀 SafeSite AI v6.0 — Socket.IO real-time active")
    print("   WebSocket: ws://localhost:8000/socket.io/")
    print("   REST API:  http://localhost:8000/docs")

@app.on_event("shutdown")
async def shutdown():
    await close_db()

# ── Heartbeat (every 30s) ─────────────────────────────────────
async def _heartbeat_task():
    """Push a system_status event to all clients every 30 seconds."""
    while True:
        await asyncio.sleep(30)
        try:
            await emit_system_status({
                "status":         "online",
                "cameras_online": 5,
                "cameras_total":  10,
                "message":        "All systems operational",
            })
        except Exception as e:
            print(f"Heartbeat error: {e}")

# ── Routes ────────────────────────────────────────────────────
app.include_router(auth_router)     # /auth/...
app.include_router(video_router)    # /video/...
app.include_router(ai_router)       # /ai/...
app.include_router(alerts_router)   # /alerts/...
app.include_router(test_router)     # /test/...  (dev only)

@app.get("/")
def root():
    return {
        "message": "SafeSite AI Backend is running!",
        "status":  "online",
        "version": "6.0.0",
        "docs":    "Visit /docs for the interactive API documentation",
        "socket":  "ws://localhost:8000/socket.io/",
        "routes":  ["/auth", "/video", "/ai", "/alerts", "/test"],
    }

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "SafeSite AI Backend", "version": "6.0.0", "socket": "active"}

# ── Combined ASGI app (FastAPI + Socket.IO) ───────────────────
# This wraps both into one server on port 8000.
# - HTTP requests  → FastAPI  (/auth, /video, /alerts, etc.)
# - WS connections → Socket.IO (/socket.io/)
socket_app = socketio.ASGIApp(
    socketio_server=sio,
    other_asgi_app=app,
    socketio_path="/socket.io",
)