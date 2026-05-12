from fastapi import APIRouter, HTTPException
from database import db
from datetime import datetime
from services.alert_service import create_alert
import os, uuid, asyncio, urllib.parse, time, math
import numpy as np
from concurrent.futures import ThreadPoolExecutor
import cv2

router = APIRouter(prefix="/ai", tags=["AI Live Detection"])

AI_SERVICE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../ai-service")
)
BACKEND_URL = "http://localhost:8000"
MODEL_PATH = os.path.join(AI_SERVICE_DIR, "model/ppe_model.pt")

_executor = ThreadPoolExecutor(max_workers=2)

_model = None
_model_lock = asyncio.Lock()

_active_sessions: dict[str, dict] = {}

PERSON_KEYWORDS = ["person"]
HELMET_KEYWORDS = ["helmet", "hardhat", "hat", "helm"]
VEST_KEYWORDS = ["vest"]
NO_HELMET_KEYWORDS = ["nohat", "no_hat", "no-helmet", "nohelmet"]
NO_VEST_KEYWORDS = ["novest", "no_vest", "no-vest", "novest"]
CONF_THRESHOLD = 0.15


def _get_model():
    global _model
    if _model is None:
        from ultralytics import YOLO
        abs_path = os.path.abspath(MODEL_PATH)
        print(f"Loading YOLO model: {abs_path}")
        _model = YOLO(abs_path)
        print(f"Model loaded. Classes: {_model.names}")
    return _model


def _categorize(class_id: int, class_name: str):
    name = class_name.lower()
    cid = class_id
    is_person = any(k in name for k in PERSON_KEYWORDS)
    is_helmet = any(k in name for k in HELMET_KEYWORDS)
    is_vest = any(k in name for k in VEST_KEYWORDS)
    is_no_helmet = any(k in name for k in NO_HELMET_KEYWORDS)
    is_no_vest = any(k in name for k in NO_VEST_KEYWORDS)
    return is_person, is_helmet, is_vest, is_no_helmet, is_no_vest


def _boxes_overlap(a, b, iou_thresh=0.05):
    x1 = max(a[0], b[0])
    y1 = max(a[1], b[1])
    x2 = min(a[2], b[2])
    y2 = min(a[3], b[3])
    if x2 <= x1 or y2 <= y1:
        return False
    inter = (x2 - x1) * (y2 - y1)
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    union = area_a + area_b - inter
    if union <= 0:
        return False
    return (inter / union) > iou_thresh


def _normalize_bbox(bbox, width, height):
    if not bbox or len(bbox) < 4:
        return bbox
    return [bbox[0] / width, bbox[1] / height, bbox[2] / width, bbox[3] / height]


def _detect_on_frame(frame, model, width, height):
    """Run YOLO on a single frame, return detections + summary."""
    results = model(frame, conf=CONF_THRESHOLD, verbose=False, device="cpu")
    persons = []
    helmets = []
    vests = []
    no_helmets = []
    no_vests = []

    for box in results[0].boxes:
        cid = int(box.cls[0])
        conf = float(box.conf[0])
        bbox_px = box.xyxy[0].tolist()
        name = model.names.get(cid, "")

        is_p, is_h, is_v, is_nh, is_nv = _categorize(cid, name)

        if is_nh:
            no_helmets.append(bbox_px)
        elif is_nv:
            no_vests.append(bbox_px)
        elif is_p:
            persons.append((bbox_px, conf))
        elif is_h:
            helmets.append(bbox_px)
        elif is_v:
            vests.append(bbox_px)

    detections = []
    for pid, (pbox, pconf) in enumerate(persons, 1):
        has_helmet = any(_boxes_overlap(pbox, hb) for hb in helmets)
        has_vest = any(_boxes_overlap(pbox, vb) for vb in vests)
        no_helmet_violation = any(_boxes_overlap(pbox, nb) for nb in no_helmets)
        no_vest_violation = any(_boxes_overlap(pbox, nb) for nb in no_vests)

        effective_no_helmet = (not has_helmet) or no_helmet_violation
        effective_no_vest = (not has_vest) or no_vest_violation

        if effective_no_helmet and effective_no_vest:
            label = "No Helmet & No Vest"
            color = "#ef4444"
            vio = "no_helmet_and_no_vest"
            sev = "high"
        elif effective_no_helmet:
            label = "No Helmet"
            color = "#f97316"
            vio = "no_helmet"
            sev = "medium"
        elif effective_no_vest:
            label = "No Vest"
            color = "#eab308"
            vio = "no_vest"
            sev = "medium"
        else:
            label = "Compliant"
            color = "#22c55e"
            vio = "none"
            sev = "safe"

        detections.append({
            "worker_id": pid,
            "has_helmet": has_helmet,
            "has_vest": has_vest,
            "violation": vio,
            "severity": sev,
            "label": label,
            "bbox": _normalize_bbox(pbox, width, height),
            "color_hex": color,
            "confidence": round(pconf, 3),
        })

    total = len(detections)
    compliant = sum(1 for d in detections if d["violation"] == "none")
    violations = total - compliant
    no_h = sum(1 for d in detections if d["violation"] == "no_helmet")
    no_v = sum(1 for d in detections if d["violation"] == "no_vest")
    no_b = sum(1 for d in detections if d["violation"] == "no_helmet_and_no_vest")

    summary = {
        "total_workers": total,
        "compliant": compliant,
        "violations": violations,
        "no_helmet": no_h,
        "no_vest": no_v,
        "no_helmet_and_no_vest": no_b,
    }

    return detections, summary


async def _run_stream_session(session_id: str, stream_url: str, zone: str, camera: str):
    loop = asyncio.get_event_loop()
    session = _active_sessions.get(session_id)
    if not session:
        return

    try:
        model = await loop.run_in_executor(_executor, _get_model)
    except Exception as e:
        print(f"Model load failed: {e}")
        if session_id in _active_sessions:
            _active_sessions[session_id]["error"] = str(e)
            _active_sessions[session_id]["running"] = False
        return

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
            "timestamp": datetime.utcnow().isoformat(),
        }

        try:
            from socket_server import sio
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
        _active_sessions[session_id]["stopped_at"] = datetime.utcnow().isoformat()
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
        from socket_server import sio
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
        "started_at": datetime.utcnow().isoformat(),
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
        "timestamp": datetime.utcnow().isoformat(),
    }
    try:
        from socket_server import sio
        await sio.emit("live_detection", fake)
    except Exception as e:
        print(f"socket test: {e}")
    return {"message": "Test detections sent", "detections": 3}


import cv2
