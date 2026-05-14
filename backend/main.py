# ============================================================
# SafeSite AI — Backend Entry Point  (Phase 11 — Analytics)
# File: backend/main.py
#
# ⚠️  Start with:
#   uvicorn main:socket_app --reload --port 8000
# ============================================================

import asyncio, os, sys, socketio
from fastapi import FastAPI

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import connect_db, close_db
from routes.auth        import router as auth_router
from routes.video       import router as video_router
from routes.ai_results      import router as ai_router
from routes.live_detection   import router as live_detection_router  # Live stream boxes
from routes.alerts      import router as alerts_router
from routes.socket_test import router as test_router
from routes.email       import router as email_router
from routes.llm         import router as llm_router
from routes.dashboard   import router as dashboard_router
from routes.analytics   import router as analytics_router   # ← Phase 11
from routes.reports     import router as reports_router     # ← Phase 12
from routes.proxy            import router as proxy_router, close_client as close_proxy_client  # HLS proxy
from routes.upload_insights  import router as upload_insights_router   # Upload AI insights
from socket_server      import sio, emit_system_status, start_insight_loop

app = FastAPI(
    title="SafeSite AI — Construction Safety API",
    description="Backend API for the Construction Site Safety Monitoring System",
    version="13.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"],
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
    start_insight_loop()
    print("SafeSite AI v13.0 - Analytics active")
    print("   REST:      http://localhost:8000/docs")
    print("   WebSocket: ws://localhost:8000/socket.io/")

@app.on_event("shutdown")
async def shutdown():
    await close_db()
    await close_proxy_client()

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
app.include_router(live_detection_router)  # /ai/live-detection, /ai/stream-started/stopped
app.include_router(alerts_router)     # /alerts/...
app.include_router(test_router)       # /test/...
app.include_router(email_router)      # /email/...
app.include_router(llm_router)        # /llm/...
app.include_router(dashboard_router)  # /dashboard/...
app.include_router(analytics_router)  # /analytics/...  ← Phase 11
app.include_router(reports_router)    # /reports/...  ← Phase 12
app.include_router(proxy_router)      # /proxy/hls...
app.include_router(upload_insights_router)  # /upload-insights/...

@app.get("/")
def root():
    return {
        "message": "SafeSite AI Backend is running!",
        "version": "13.0.0",
        "docs":    "http://localhost:8000/docs",
        "routes":  ["/auth","/video","/ai","/alerts","/email","/llm",
                    "/dashboard","/analytics","/reports"],
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