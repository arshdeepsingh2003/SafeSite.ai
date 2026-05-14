import cv2
import os
import sys
import json
import time
import signal
import argparse
import requests
import numpy as np
from datetime import datetime
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
from ultralytics import YOLO
from detect import (
    load_model,
    process_frame,
    reset_worker_tracking,
    FRAME_SAMPLE_RATE,
    INFERENCE_SIZE,
    OUTPUT_DIR,
)

load_dotenv()

_running = True


def signal_handler(sig, frame):
    global _running
    print("\nShutdown signal received, stopping stream detection...")
    _running = False


def normalize_bbox(bbox, width, height):
    if not bbox or len(bbox) < 4:
        return bbox
    return [
        bbox[0] / width,
        bbox[1] / height,
        bbox[2] / width,
        bbox[3] / height,
    ]


def send_detections(payload, backend_url):
    try:
        resp = requests.post(
            f"{backend_url}/ai/live-detection",
            json=payload,
            timeout=2.0,
        )
        if not resp.ok:
            print(f"  Backend returned {resp.status_code}")
        return resp.ok
    except requests.exceptions.ConnectionError:
        return False
    except requests.exceptions.Timeout:
        return False
    except requests.exceptions.RequestException as e:
        print(f"  Request error: {e}")
        return False


def try_open_stream(stream_url):
    print(f"Attempting to open stream with OpenCV...")
    cap = cv2.VideoCapture(stream_url)
    if cap.isOpened():
        print(f"OpenCV opened stream successfully")
        return cap

    print(f"OpenCV could not open stream URL directly")
    print(f"Trying with ffmpeg protocol hint...")
    cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
    if cap.isOpened():
        print(f"OpenCV + FFMPEG opened stream successfully")
        return cap

    return None


def main():
    global _running

    parser = argparse.ArgumentParser(
        description="SafeSite AI -- Live Stream Detection"
    )
    parser.add_argument("--stream-url", required=True, help="HLS stream URL")
    parser.add_argument("--zone", default="Zone A", help="Construction zone name")
    parser.add_argument("--camera", default="Camera 1", help="Camera name")
    parser.add_argument(
        "--backend-url", default="http://localhost:8000", help="Backend API URL"
    )
    parser.add_argument(
        "--model-path", default="model/ppe_model.pt", help="YOLO model path"
    )
    parser.add_argument(
        "--session-id", default=None, help="Session ID for stop control"
    )
    parser.add_argument(
        "--test-mode", action="store_true", help="Send test detections every 3 seconds"
    )
    args = parser.parse_args()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    BACKEND_URL = args.backend_url.rstrip("/")

    stop_flag = None
    if args.session_id:
        stop_flag = os.path.join(OUTPUT_DIR, f".stream_active_{args.session_id}")
        try:
            with open(stop_flag, "w") as f:
                f.write("1")
            print(f"Created stop flag: {stop_flag}")
        except Exception as e:
            print(f"Could not create stop flag: {e}")
            stop_flag = None

    if args.test_mode:
        print("TEST MODE: Sending synthetic detections every 3 seconds")
        _run_test_mode(BACKEND_URL, args.zone, args.camera, stop_flag)
        return

    model = load_model(args.model_path)
    print(f"Opening stream: {args.stream_url}")

    cap = try_open_stream(args.stream_url)
    if cap is None:
        print(f"FAILED to open stream with any method: {args.stream_url}")
        print("Exiting.")
        return

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    print(f"Stream: {width}x{height} @ {fps:.1f}fps")
    print("Stream detection running. Press Ctrl+C to stop.")

    reset_worker_tracking()

    frame_count = 0
    processed_count = 0
    consecutive_errors = 0
    last_send_ok = True

    while _running:
        if stop_flag and not os.path.exists(stop_flag):
            print("Stop signal received via flag file.")
            break

        ret, frame = cap.read()

        if not ret:
            consecutive_errors += 1
            if consecutive_errors > 60:
                print("Stream lost for 60+ consecutive reads. Exiting.")
                break
            if consecutive_errors == 1:
                print("Stream read failed, retrying...")
            time.sleep(0.5)
            continue

        consecutive_errors = 0
        frame_count += 1

        if frame_count % FRAME_SAMPLE_RATE != 0:
            continue

        try:
            result = process_frame(model, frame, frame_count, INFERENCE_SIZE)
        except Exception as e:
            print(f"Frame processing error at frame {frame_count}: {e}")
            continue

        raw_workers = result.get("detections", [])
        workers_clean = []
        for w in raw_workers:
            cw = {k: v for k, v in w.items() if k != "color"}
            bbox = cw.get("bbox")
            if bbox and len(bbox) == 4:
                cw["bbox"] = normalize_bbox(bbox, width, height)
            workers_clean.append(cw)

        summary = result.get("summary", {})

        payload = {
            "frame": frame_count,
            "detections": workers_clean,
            "summary": {
                "total_workers": summary.get("total_workers", 0),
                "compliant": summary.get("compliant", 0),
                "violations": summary.get("violations", 0),
                "no_helmet": summary.get("no_helmet", 0),
                "no_vest": summary.get("no_vest", 0),
                "no_helmet_and_no_vest": summary.get("no_helmet_and_no_vest", 0),
            },
            "zone": args.zone,
            "camera": args.camera,
            "timestamp": datetime.utcnow().isoformat(),
        }

        ok = send_detections(payload, BACKEND_URL)
        if ok and not last_send_ok:
            print("Backend connection restored.")
        if not ok and last_send_ok:
            print("Backend connection lost!")
        last_send_ok = ok

        processed_count += 1

        if processed_count % 30 == 0:
            print(
                f"Frame {frame_count} | Processed: {processed_count} | "
                f"Workers: {summary.get('total_workers', 0)} | "
                f"Violations: {summary.get('violations', 0)} | "
                f"Backend: {'OK' if ok else 'DOWN'}"
            )

    cap.release()
    if stop_flag and os.path.exists(stop_flag):
        try:
            os.remove(stop_flag)
        except Exception:
            pass
    print(f"Stream detection stopped. Processed {processed_count} frames.")


def _run_test_mode(backend_url, zone, camera, stop_flag):
    import random

    print("Test mode: sending synthetic detection data...")
    frame = 0
    while _running:
        if stop_flag and not os.path.exists(stop_flag):
            break

        frame += 1
        payload = {
            "frame": frame,
            "detections": [
                {
                    "worker_id": 1,
                    "has_helmet": False,
                    "has_vest": True,
                    "violation": "no_helmet",
                    "severity": "medium",
                    "label": "No Helmet",
                    "bbox": [0.15, 0.2, 0.35, 0.55],
                    "color_hex": "#f97316",
                    "confidence": 0.92,
                },
                {
                    "worker_id": 2,
                    "has_helmet": True,
                    "has_vest": False,
                    "violation": "no_vest",
                    "severity": "medium",
                    "label": "No Vest",
                    "bbox": [0.55, 0.25, 0.78, 0.6],
                    "color_hex": "#eab308",
                    "confidence": 0.88,
                },
                {
                    "worker_id": 3,
                    "has_helmet": False,
                    "has_vest": False,
                    "violation": "no_helmet_and_no_vest",
                    "severity": "high",
                    "label": "No Helmet & No Vest",
                    "bbox": [0.3, 0.5, 0.5, 0.85],
                    "color_hex": "#ef4444",
                    "confidence": 0.95,
                },
            ],
            "summary": {
                "total_workers": 3,
                "compliant": 0,
                "violations": 3,
                "no_helmet": 1,
                "no_vest": 1,
                "no_helmet_and_no_vest": 1,
            },
            "zone": zone,
            "camera": camera,
            "timestamp": datetime.utcnow().isoformat(),
        }

        ok = send_detections(payload, backend_url)
        if ok and frame % 10 == 1:
            print(f"Test frame {frame} sent OK")
        elif not ok:
            print(f"Test frame {frame} FAILED")

        for _ in range(30):
            if not _running:
                break
            time.sleep(0.1)

    print("Test mode stopped.")


if __name__ == "__main__":
    main()
