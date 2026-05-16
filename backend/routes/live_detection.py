from fastapi import APIRouter, HTTPException
from database import db
from datetime import datetime, timezone, timedelta
from services.alert_service import create_alert
import os, sys, uuid, asyncio, urllib.parse, time, math
import numpy as np
from concurrent.futures import ThreadPoolExecutor
import cv2

# Use detect.py's proper detection pipeline instead of duplicating broken logic
AI_SERVICE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../ai-service")
)
sys.path.insert(0, AI_SERVICE_DIR)

from detect import load_model as _load_detect_model, process_frame, reset_worker_tracking
from utils.violation_detector import get_ppe_class_indices

IST = timezone(timedelta(hours=5, minutes=30))
def istnow():
    return datetime.now(IST)

router = APIRouter(prefix="/ai", tags=["AI Live Detection"])

BACKEND_URL = "http://localhost:8000"
MODEL_PATH = os.path.join(AI_SERVICE_DIR, "model/ppe_model.pt")
INFERENCE_SIZE = 416
CONF_THRESHOLD = 0.15

_executor = ThreadPoolExecutor(max_workers=2)
_model = None
_model_lock = asyncio.Lock()
_active_sessions: dict[str, dict] = {}
_live_frame_counter = 0


def _get_model():
    global _model
    if _model is None:
        if not os.path.exists(MODEL_PATH):
            print(f"ERROR: PPE model not found at {MODEL_PATH}")
            fallback = os.path.join(AI_SERVICE_DIR, "model/yolov8n.pt")
            if os.path.exists(fallback):
                print(f"Falling back to {fallback}")
                _model = _load_detect_model(fallback)
            return _model
        print(f"Loading PPE model: {MODEL_PATH}")
        _model = _load_detect_model(MODEL_PATH)
    return _model


def _detect_on_frame(frame, model, width, height):
    """Run YOLO on a single frame using detect.py's v3 pipeline."""
    global _live_frame_counter
    _live_frame_counter += 1

    result = process_frame(model, frame, _live_frame_counter, INFERENCE_SIZE)

    raw_workers = result.get("detections", [])
    detections = []
    for w in raw_workers:
        bbox = w.get("bbox")
        norm_bbox = (
            [bbox[0]/width, bbox[1]/height, bbox[2]/width, bbox[3]/height]
            if bbox and len(bbox) == 4 else bbox
        )
        detections.append({
            "worker_id": w.get("worker_id", 0),
            "has_helmet": w.get("has_helmet", False),
            "has_vest": w.get("has_vest", False),
            "violation": w.get("violation", "none"),
            "severity": w.get("severity", "safe"),
            "label": w.get("label", "Unknown"),
            "bbox": norm_bbox,
            "color_hex": w.get("color_hex", "#22c55e"),
            "confidence": w.get("confidence", 0.5),
        })

    summary = result.get("summary", {})

    return detections, summary


async def _run_stream_session(session_id: str, stream_url: str, zone: str, camera: str):
    loop = asyncio.get_event_loop()
    session = _active_sessions.get(session_id)
    if not session:
        return

    try:
        model = await loop.run_in_executor(_executor, _get_model)
        await loop.run_in_executor(_executor, reset_worker_tracking)
    except Exception as e:
        print(f"Model load failed: {e}")
        if session_id in _active_sessions:
            _active_sessions[session_id]["error"] = str(e)
            _active_sessions[session_id]["running"] = False
        return

    _live_frame_counter = 0
    print(f"Opening stream: {stream_url}")
    cap = await loop.run_in_executor(
        _executor, lambda: _try_open_stream(stream_url)
    )
    if cap is None:
        msg = f"Could not open stream: {stream_url}"
        print(msg)
        if session_id in _active_sessions:
            _active_sessions[session_id]["error"] = msg
            _active_sessions[session_id]["running"] = False
        return

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    print(f"Stream opened: {width}x{height} @ {fps:.1f}fps")

    FRAME_SAMPLE = 3
    frame_count = 0
    processed = 0
    consecutive_errors = 0

    while True:
        if session_id not in _active_sessions:
            break
        if not _active_sessions[session_id].get("running", True):
            break

        ret, frame = await loop.run_in_executor(_executor, cap.read)

        if not ret:
            consecutive_errors += 1
            if consecutive_errors > 60:
                print("Stream lost. Exiting session.")
                break
            await asyncio.sleep(0.5)
            continue

        consecutive_errors = 0
        frame_count += 1

        if frame_count % FRAME_SAMPLE != 0:
            continue

        try:
            detections, summary = await loop.run_in_executor(
                _executor, _detect_on_frame, frame, model, width, height
            )
        except Exception as e:
            print(f"Detection error: {e}")
            continue

        processed += 1

        payload = {
            "frame": frame_count,
            "detections": detections,
            "summary": summary,
            "zone": zone,
            "camera": camera,
            "timestamp": istnow().isoformat(),
        }

        try:
            from socket_server import sio, aggregator
            aggregator.add_snapshot(payload)
            await sio.emit("live_detection", payload)
        except Exception as e:
            print(f"socket emit: {e}")

        for d in detections:
            if d["severity"] in ("medium", "high"):
                try:
                    await create_alert({
                        "worker_id": d.get("worker_id", 0),
                        "zone": zone,
                        "camera": camera,
                        "violation_type": d["violation"],
                        "severity": d["severity"],
                        "has_helmet": d.get("has_helmet", False),
                        "has_vest": d.get("has_vest", False),
                        "source": "live_stream",
                        "frame_number": frame_count,
                    })
                except Exception:
                    pass

        if processed % 30 == 0:
            print(
                f"Session {session_id[:8]} | Frame {frame_count} | "
                f"Workers: {summary['total_workers']} | "
                f"Violations: {summary['violations']}"
            )

    cap.release()
    if session_id in _active_sessions:
        _active_sessions[session_id]["running"] = False
        _active_sessions[session_id]["stopped_at"] = istnow().isoformat()
    print(f"Session {session_id[:8]} ended. Processed {processed} frames.")


def _try_open_stream(url):
    cap = cv2.VideoCapture(url)
    if cap.isOpened():
        return cap
    cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
    if cap.isOpened():
        return cap
    return None


def _proxy_url(original_url: str) -> str:
    if "/proxy/hls" in original_url and "localhost" in original_url:
        return original_url
    encoded = urllib.parse.quote(original_url, safe="")
    return f"{BACKEND_URL}/proxy/hls?url={encoded}"


@router.post("/live-detection")
async def receive_live_detection(data: dict):
    zone = data.get("zone", "Zone A")
    camera = data.get("camera", "Camera 1")
    detections = data.get("detections", [])
    frame = data.get("frame", 0)
    alerts_created = 0

    for det in detections:
        sev = det.get("severity")
        if sev not in ("medium", "high"):
            continue
        created = await create_alert({
            "worker_id": det.get("worker_id", 0),
            "zone": zone,
            "camera": camera,
            "violation_type": det.get("violation", "unknown"),
            "severity": sev,
            "has_helmet": det.get("has_helmet", False),
            "has_vest": det.get("has_vest", False),
            "frame_number": frame,
            "source": "live_stream",
        })
        if created:
            alerts_created += 1

    try:
        from socket_server import sio, aggregator
        aggregator.add_snapshot(data)
        await sio.emit("live_detection", data)
    except Exception as e:
        print(f"socket: {e}")

    return {
        "message": "Live detection processed",
        "alerts_created": alerts_created,
        "detections_count": len(detections),
    }


@router.post("/stream-started")
async def stream_started(data: dict):
    await db["stream_events"].insert_one({
        "event": "started",
        "camera": data.get("camera", "Camera 1"),
        "zone": data.get("zone", "Zone A"),
        "timestamp": istnow(),
    })
    return {"message": "Stream started event recorded"}


@router.post("/stream-stopped")
async def stream_stopped(data: dict):
    await db["stream_events"].insert_one({
        "event": "stopped",
        "camera": data.get("camera", "Camera 1"),
        "zone": data.get("zone", "Zone A"),
        "timestamp": istnow(),
    })
    return {"message": "Stream stopped event recorded"}


@router.post("/stream/start")
async def start_stream_analysis(data: dict):
    stream_url = data.get("stream_url")
    if not stream_url:
        raise HTTPException(status_code=400, detail="stream_url is required")

    zone = data.get("zone", "Zone A")
    camera = data.get("camera", "Camera 1")
    proxied = _proxy_url(stream_url)

    for sid, sinfo in list(_active_sessions.items()):
        if sinfo.get("running"):
            sinfo["running"] = False

    session_id = str(uuid.uuid4())
    _active_sessions[session_id] = {
        "running": True,
        "stream_url": stream_url,
        "proxied_url": proxied,
        "zone": zone,
        "camera": camera,
        "started_at": istnow().isoformat(),
        "error": None,
        "last_detection_at": None,
    }

    asyncio.create_task(
        _run_stream_session(session_id, proxied, zone, camera)
    )

    print(f"Stream analysis started: session={session_id} url={proxied}")
    return {
        "session_id": session_id,
        "status": "started",
        "zone": zone,
        "camera": camera,
    }


@router.post("/stream/stop")
async def stop_stream_analysis(data: dict):
    session_id = data.get("session_id") if data else None

    if session_id and session_id in _active_sessions:
        _active_sessions[session_id]["running"] = False
        await asyncio.sleep(0.5)
        _active_sessions.pop(session_id, None)
    else:
        for sid in list(_active_sessions.keys()):
            _active_sessions[sid]["running"] = False
        _active_sessions.clear()

    return {"status": "stopped"}


@router.get("/stream/status")
async def get_stream_status():
    sessions = []
    for sid, info in _active_sessions.items():
        sessions.append({
            "session_id": sid,
            "stream_url": info.get("stream_url"),
            "zone": info.get("zone"),
            "camera": info.get("camera"),
            "started_at": info.get("started_at"),
            "running": info.get("running", False),
            "error": info.get("error"),
            "last_detection_at": info.get("last_detection_at"),
        })
    return {"active_sessions": sessions, "count": len(sessions)}


@router.post("/stream/test-detections")
async def inject_test_detections():
    fake = {
        "frame": 1,
        "detections": [
            {"worker_id": 1, "has_helmet": False, "has_vest": True,
             "violation": "no_helmet", "severity": "medium", "label": "No Helmet",
             "bbox": [0.15, 0.2, 0.35, 0.55], "color_hex": "#f97316", "confidence": 0.92},
            {"worker_id": 2, "has_helmet": True, "has_vest": False,
             "violation": "no_vest", "severity": "medium", "label": "No Vest",
             "bbox": [0.55, 0.25, 0.78, 0.6], "color_hex": "#eab308", "confidence": 0.88},
            {"worker_id": 3, "has_helmet": False, "has_vest": False,
             "violation": "no_helmet_and_no_vest", "severity": "high",
             "label": "No Helmet & No Vest",
             "bbox": [0.3, 0.5, 0.5, 0.85], "color_hex": "#ef4444", "confidence": 0.95},
        ],
        "summary": {"total_workers": 3, "compliant": 0, "violations": 3,
                    "no_helmet": 1, "no_vest": 1, "no_helmet_and_no_vest": 1},
        "zone": "Zone A", "camera": "Camera 1",
        "timestamp": istnow().isoformat(),
    }
    try:
        from socket_server import sio
        await sio.emit("live_detection", fake)
    except Exception as e:
        print(f"socket test: {e}")
    return {"message": "Test detections sent", "detections": 3}


import cv2
