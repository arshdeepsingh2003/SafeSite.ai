# ============================================================
# SafeSite AI — Backend Entry Point  (Phase 11 — Analytics)
# File: backend/main.py
#
# ⚠️  Start with:
#   uvicorn main:socket_app --reload --port 8000
# ============================================================

import asyncio, socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import connect_db, close_db
from routes.auth        import router as auth_router
from routes.video       import router as video_router
from routes.ai_results      import router as ai_router
from routes.alerts      import router as alerts_router
from routes.socket_test import router as test_router
from routes.email       import router as email_router
from routes.llm         import router as llm_router
from routes.sites       import router as sites_router
from routes.workers     import router as workers_router
from routes.dashboard   import router as dashboard_router
from routes.analytics   import router as analytics_router   # ← Phase 11
from socket_server      import sio, emit_system_status
import os

app = FastAPI(
    title="SafeSite AI — Construction Safety API",
    description="Backend API for the Construction Site Safety Monitoring System",
    version="13.0.0"
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

@app.on_event("startup")
async def startup():
    await connect_db()
    asyncio.create_task(_heartbeat())
    print("🚀 SafeSite AI v13.0 — Analytics active")
    print("   REST:      http://localhost:8000/docs")
    print("   WebSocket: ws://localhost:8000/socket.io/")

@app.on_event("shutdown")
async def shutdown():
    await close_db()

async def _heartbeat():
    while True:
        await asyncio.sleep(30)
        try:
            await emit_system_status({"status": "online", "cameras_online": 5})
        except Exception:
            pass

# ── All route groups ──────────────────────────────────────────
app.include_router(auth_router)       # /auth/...
app.include_router(video_router)      # /video/...
app.include_router(ai_router)         # /ai/...
app.include_router(alerts_router)     # /alerts/...
app.include_router(test_router)       # /test/...
app.include_router(email_router)      # /email/...
app.include_router(llm_router)        # /llm/...
app.include_router(sites_router)      # /sites/...
app.include_router(workers_router)    # /workers/...
app.include_router(dashboard_router)  # /dashboard/...
from routes.reports   import router as reports_router
from routes.settings  import router as settings_router  # Phase 13
app.include_router(analytics_router)  # /analytics/...  ← Phase 11
app.include_router(reports_router)    # /reports/...  ← Phase 12
app.include_router(settings_router)   # /settings/... ← Phase 13

@app.get("/")
def root():
    return {
        "message": "SafeSite AI Backend is running!",
        "version": "13.0.0",
        "docs":    "http://localhost:8000/docs",
        "routes":  ["/auth","/video","/ai","/alerts","/email","/llm",
                    "/sites","/workers","/dashboard","/analytics"],
    }

@app.get("/health")
def health():
    return {"status": "healthy", "version": "13.0.0"}

# ── Combined ASGI app (FastAPI + Socket.IO on one port) ───────
socket_app = socketio.ASGIApp(
    socketio_server=sio,
    other_asgi_app=app,
    socketio_path="/socket.io",
)