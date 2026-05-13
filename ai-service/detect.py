import cv2
import os
import json
import time
import math
import argparse
import requests
import threading
import numpy as np
from datetime import datetime
from dotenv import load_dotenv
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from utils.violation_detector import (
    associate_ppe_with_workers,
    associate_ppe_with_workers_v2,
    summarize_detections,
    get_violation,
    PERSON_CLASS_ID,
    HELMET_KEYWORDS,
    VEST_KEYWORDS,
    get_ppe_class_indices,
    boxes_overlap,
    VIOLATION_NONE,
    VIOLATION_NO_HELMET,
    VIOLATION_NO_VEST,
    VIOLATION_NO_HELMET_VEST,
    SEVERITY_HIGH,
    SEVERITY_MEDIUM,
    SEVERITY_SAFE,
)
from utils.frame_annotator import annotate_frame

MODEL_PPE_CLASSES = None
_worker_stats = {}
_worker_next_id = 1
_worker_track_history = {}
_active_violations = {}
_violation_events = []

# ── Global model singleton ──
_global_model = None
_global_model_lock = threading.Lock()
_global_model_is_onnx = False

load_dotenv()

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
FRAME_SAMPLE_RATE = int(os.getenv("FRAME_SAMPLE_RATE", 2))
CONF_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", 0.5))
PPE_CONF_THRESHOLD = float(os.getenv("PPE_CONF_THRESHOLD", 0.35))
MODEL_PATH = os.getenv("MODEL_PATH", "model/yolov8n.onnx")
INFERENCE_SIZE = int(os.getenv("INFERENCE_SIZE", 416))
MAX_DET = int(os.getenv("MAX_DET", 100))

VIOLATION_CONFIRM_FRAMES = int(os.getenv("VIOLATION_CONFIRM_FRAMES", 8))
PPE_RATIO_THRESHOLD = float(os.getenv("PPE_RATIO_THRESHOLD", 0.7))
VIOLATION_END_FRAMES = int(os.getenv("VIOLATION_END_FRAMES", 5))

AI_SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(AI_SERVICE_DIR)
OUTPUT_DIR = os.path.join(BACKEND_DIR, "uploads", "annotated")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Thread pool for parallel I/O
_io_executor = ThreadPoolExecutor(max_workers=4)


def _get_bbox_center(bbox):
    return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)


def _match_workers_to_tracks(person_boxes, frame_number, max_distance=150):
    global _worker_next_id, _worker_track_history
    matches = []
    used_tracks = set()

    for bbox in person_boxes:
        cx, cy = _get_bbox_center(bbox)
        best_id = None
        best_dist = float('inf')

        for stable_id, prev_positions in _worker_track_history.items():
            if stable_id in used_tracks:
                continue
            if not prev_positions:
                continue
            prev_cx, prev_cy = prev_positions[-1]
            dist = ((cx - prev_cx) ** 2 + (cy - prev_cy) ** 2) ** 0.5

            if stable_id in _worker_stats and _worker_stats[stable_id].get('last_bbox'):
                if boxes_overlap(bbox, _worker_stats[stable_id]['last_bbox'], threshold=0.1):
                    dist = 0

            if dist < best_dist and dist < max_distance:
                best_dist = dist
                best_id = stable_id

        if best_id is not None:
            matches.append((best_id, bbox))
            used_tracks.add(best_id)
            if best_id not in _worker_track_history:
                _worker_track_history[best_id] = []
            _worker_track_history[best_id].append((cx, cy))
            if len(_worker_track_history[best_id]) > 10:
                _worker_track_history[best_id] = _worker_track_history[best_id][-10:]
        else:
            new_id = _worker_next_id
            _worker_next_id += 1
            matches.append((new_id, bbox))
            _worker_track_history[new_id] = [(cx, cy)]

    return matches


def _init_worker_stats(stable_id, bbox, frame_number):
    global _worker_stats
    _worker_stats[stable_id] = {
        'helmet_frames': 0,
        'vest_frames': 0,
        'total_frames': 0,
        'last_bbox': bbox,
        'first_seen': frame_number,
        'last_seen': frame_number,
        'consecutive_helmet_missing': 0,
        'consecutive_vest_missing': 0,
        'consecutive_compliant_frames': 0,
        'violation_confirmed': False,
        'violation_type': None,
    }


def _update_worker_stats(stable_id, bbox, has_helmet, has_vest, frame_number):
    global _worker_stats, _active_violations, _violation_events

    if stable_id not in _worker_stats:
        _init_worker_stats(stable_id, bbox, frame_number)

    stats = _worker_stats[stable_id]
    stats['total_frames'] += 1
    stats['last_bbox'] = bbox
    stats['last_seen'] = frame_number

    is_compliant_this_frame = has_helmet and has_vest

    if has_helmet:
        stats['helmet_frames'] += 1
        stats['consecutive_helmet_missing'] = 0
    else:
        stats['consecutive_helmet_missing'] += 1

    if has_vest:
        stats['vest_frames'] += 1
        stats['consecutive_vest_missing'] = 0
    else:
        stats['consecutive_vest_missing'] += 1

    if is_compliant_this_frame:
        stats['consecutive_compliant_frames'] += 1
    else:
        stats['consecutive_compliant_frames'] = 0

    _check_violation_confirmation(stable_id, frame_number)


def _check_violation_confirmation(stable_id, frame_number):
    global _worker_stats, _active_violations, _violation_events

    stats = _worker_stats[stable_id]
    helmet_missing = stats['consecutive_helmet_missing']
    vest_missing = stats['consecutive_vest_missing']
    compliant_frames = stats['consecutive_compliant_frames']

    current_violation = None
    if helmet_missing >= VIOLATION_CONFIRM_FRAMES and vest_missing >= VIOLATION_CONFIRM_FRAMES:
        current_violation = VIOLATION_NO_HELMET_VEST
    elif helmet_missing >= VIOLATION_CONFIRM_FRAMES:
        current_violation = VIOLATION_NO_HELMET
    elif vest_missing >= VIOLATION_CONFIRM_FRAMES:
        current_violation = VIOLATION_NO_VEST

    if current_violation:
        if not stats['violation_confirmed']:
            stats['violation_confirmed'] = True
            stats['violation_type'] = current_violation
            _active_violations[stable_id] = {
                'type': current_violation,
                'start_frame': frame_number - VIOLATION_CONFIRM_FRAMES + 1,
            }
        stats['consecutive_compliant_frames'] = 0
    else:
        if stats['violation_confirmed'] and stable_id in _active_violations:
            if compliant_frames >= VIOLATION_END_FRAMES:
                viol = _active_violations.pop(stable_id)
                sev = "high" if viol['type'] == VIOLATION_NO_HELMET_VEST else "medium"
                _violation_events.append({
                    'worker_id': stable_id,
                    'type': viol['type'],
                    'severity': sev,
                    'start_frame': viol['start_frame'],
                    'end_frame': frame_number,
                })
                stats['violation_confirmed'] = False
                stats['violation_type'] = None
                stats['consecutive_compliant_frames'] = 0


def _get_worker_compliance(stable_id):
    if stable_id not in _worker_stats:
        return None, None, None, None, None, None, None, None

    stats = _worker_stats[stable_id]
    helmet_ratio = stats['helmet_frames'] / stats['total_frames'] if stats['total_frames'] > 0 else 0
    vest_ratio = stats['vest_frames'] / stats['total_frames'] if stats['total_frames'] > 0 else 0
    has_helmet = helmet_ratio >= PPE_RATIO_THRESHOLD
    has_vest = vest_ratio >= PPE_RATIO_THRESHOLD
    is_compliant = has_helmet and has_vest

    violation_type = None
    if stats['violation_confirmed'] and stats['violation_type']:
        violation_type = stats['violation_type']
    elif stable_id in _active_violations:
        violation_type = _active_violations[stable_id]['type']

    if is_compliant:
        return (True, has_helmet, has_vest, VIOLATION_NONE, SEVERITY_SAFE, "Compliant", (0, 255, 0), "#22c55e")

    if violation_type == VIOLATION_NO_HELMET_VEST:
        return (False, has_helmet, has_vest, VIOLATION_NO_HELMET_VEST, SEVERITY_HIGH, "No Helmet & No Vest", (0, 0, 255), "#ef4444")
    elif violation_type == VIOLATION_NO_HELMET:
        return (False, has_helmet, has_vest, VIOLATION_NO_HELMET, SEVERITY_MEDIUM, "No Helmet", (0, 165, 255), "#f97316")
    elif violation_type == VIOLATION_NO_VEST:
        return (False, has_helmet, has_vest, VIOLATION_NO_VEST, SEVERITY_MEDIUM, "No Vest", (0, 215, 255), "#eab308")
    else:
        if not has_helmet and not has_vest:
            return (False, has_helmet, has_vest, VIOLATION_NO_HELMET_VEST, SEVERITY_HIGH, "No Helmet & No Vest", (0, 0, 255), "#ef4444")
        elif not has_helmet:
            return (False, has_helmet, has_vest, VIOLATION_NO_HELMET, SEVERITY_MEDIUM, "No Helmet", (0, 165, 255), "#f97316")
        else:
            return (False, has_helmet, has_vest, VIOLATION_NO_VEST, SEVERITY_MEDIUM, "No Vest", (0, 215, 255), "#eab308")


def get_all_worker_results():
    results = []
    for stable_id, stats in _worker_stats.items():
        if stats['total_frames'] < 10:
            continue

        is_compliant, has_helmet, has_vest, violation, severity, label, color, color_hex = _get_worker_compliance(stable_id)

        if is_compliant is None:
            continue

        helmet_ratio = stats['helmet_frames'] / stats['total_frames'] if stats['total_frames'] > 0 else 0
        vest_ratio = stats['vest_frames'] / stats['total_frames'] if stats['total_frames'] > 0 else 0
        worker_violations = [v for v in _violation_events if v['worker_id'] == stable_id]

        results.append({
            'worker_id': stable_id,
            'has_helmet': has_helmet,
            'has_vest': has_vest,
            'violation': violation,
            'severity': severity,
            'label': label,
            'bbox': [int(x) for x in stats['last_bbox']] if stats['last_bbox'] else None,
            'color': color,
            'color_hex': color_hex,
            'helmet_ratio': round(helmet_ratio, 3),
            'vest_ratio': round(vest_ratio, 3),
            'helmet_frames': stats['helmet_frames'],
            'vest_frames': stats['vest_frames'],
            'total_frames': stats['total_frames'],
            'first_seen': stats['first_seen'],
            'last_seen': stats['last_seen'],
            'violation_confirmed': stats['violation_confirmed'],
            'violation_count': len(worker_violations),
        })
    return results


def get_violation_events(end_frame=None):
    events = list(_violation_events)
    for stable_id, viol in _active_violations.items():
        sev = "high" if viol['type'] == VIOLATION_NO_HELMET_VEST else "medium"
        events.append({
            'worker_id': stable_id,
            'violation': viol['type'],
            'severity': sev,
            'start_frame': viol['start_frame'],
            'end_frame': end_frame if end_frame else None,
            'duration_frames': (end_frame - viol['start_frame']) if end_frame else None,
        })
    return events


def reset_worker_tracking():
    global _worker_stats, _worker_next_id, _worker_track_history
    global _active_violations, _violation_events
    _worker_stats = {}
    _worker_next_id = 1
    _worker_track_history = {}
    _active_violations = {}
    _violation_events = []


# ── Global model loader (singleton) ──

def load_model(model_path: str):
    global _global_model, _global_model_is_onnx, MODEL_PPE_CLASSES

    with _global_model_lock:
        if _global_model is not None:
            return _global_model

        abs_path = os.path.abspath(model_path)
        is_onnx = abs_path.endswith('.onnx')

        if is_onnx:
            print(f"Loading ONNX model: {abs_path}")
            try:
                import onnxruntime as ort
                providers = ['OpenVINOExecutionProvider', 'CPUExecutionProvider']
                available = [p for p in providers if p in ort.get_available_providers()]
                if not available:
                    available = ['CPUExecutionProvider']
                print(f"ONNX Runtime providers: {available}")
                sess = ort.InferenceSession(abs_path, providers=available)
                _global_model = sess
                _global_model_is_onnx = True

                input_name = sess.get_inputs()[0].name
                input_shape = sess.get_inputs()[0].shape
                print(f"ONNX input: {input_name} shape={input_shape}")

                MODEL_PPE_CLASSES = {
                    'helmet': set(),
                    'no_helmet': set(),
                    'vest': set(),
                    'no_vest': set(),
                    'person': {0}
                }
                print("Using YOLOv8n COCO model with person class only.")
                print("PPE detection relies on positive/negative class logic.")
            except Exception as e:
                print(f"ONNX load failed: {e}")
                print("Falling back to PyTorch YOLO...")
                _global_model = None
                is_onnx = False

        if not is_onnx or _global_model is None:
            from ultralytics import YOLO
            print(f"Loading PyTorch model: {abs_path}")
            if not os.path.exists(model_path):
                alt = model_path.replace('.onnx', '.pt')
                if os.path.exists(alt):
                    model_path = alt
                    abs_path = os.path.abspath(alt)
                    print(f"Trying alternate path: {abs_path}")

            model = YOLO(model_path)
            print(f"Model loaded. Classes: {model.names}")
            _global_model = model
            _global_model_is_onnx = False

            MODEL_PPE_CLASSES = get_ppe_class_indices(model.names)
            has_helmet = len(MODEL_PPE_CLASSES['helmet']) > 0 or len(MODEL_PPE_CLASSES['no_helmet']) > 0
            has_vest = len(MODEL_PPE_CLASSES['vest']) > 0 or len(MODEL_PPE_CLASSES['no_vest']) > 0
            if not has_helmet or not has_vest:
                print(f"WARNING: Model may not have PPE classes. Using COCO person class (ID 0).")
            else:
                print("PPE classes detected - model is suitable for safety detection")

        return _global_model


def _letterbox_resize(frame: np.ndarray, target_size: int) -> Tuple[np.ndarray, float, float]:
    h, w = frame.shape[:2]
    scale = target_size / max(h, w)
    new_w = int(w * scale)
    new_h = int(h * scale)
    resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    dw = target_size - new_w
    dh = target_size - new_h
    top, bottom = dh // 2, dh - dh // 2
    left, right = dw // 2, dw - dw // 2
    padded = cv2.copyMakeBorder(resized, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(114, 114, 114))
    return padded, scale, (left, top)


def _onnx_inference(sess, frame: np.ndarray, conf_threshold: float) -> list:
    input_name = sess.get_inputs()[0].name

    blob = frame.transpose(2, 0, 1)[np.newaxis, ...].astype(np.float32) / 255.0
    outputs = sess.run(None, {input_name: blob})[0]
    outputs = outputs[0].transpose()
    boxes = []
    scores = []
    class_ids = []

    for pred in outputs:
        score = float(pred[4:].max())
        if score < conf_threshold:
            continue
        class_id = int(pred[4:].argmax())
        cx, cy, w, h = float(pred[0]), float(pred[1]), float(pred[2]), float(pred[3])
        x1 = cx - w / 2
        y1 = cy - h / 2
        x2 = cx + w / 2
        y2 = cy + h / 2
        boxes.append([x1, y1, x2, y2])
        scores.append(score)
        class_ids.append(class_id)

    indices = cv2.dnn.NMSBoxes(boxes, scores, conf_threshold, 0.45)
    if len(indices) > 0:
        indices = indices.flatten()
        indices = indices[:MAX_DET]
        return [(class_ids[i], scores[i], boxes[i]) for i in indices]
    return []


def run_inference(model, frame: np.ndarray, conf: float) -> list:
    global _global_model_is_onnx
    if _global_model_is_onnx:
        return _onnx_inference(model, frame, conf)

    results = model(frame, conf=conf, verbose=False, max_det=MAX_DET)
    detections = []
    for box in results[0].boxes:
        detections.append((int(box.cls[0]), float(box.conf[0]), box.xyxy[0].tolist()))
    return detections


def get_class_name(model, class_id):
    if _global_model_is_onnx:
        names = {0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 4: 'airplane',
                 5: 'bus', 6: 'train', 7: 'truck', 8: 'boat', 9: 'traffic light',
                 10: 'fire hydrant', 11: 'stop sign', 12: 'parking meter', 13: 'bench',
                 14: 'bird', 15: 'cat', 16: 'dog', 17: 'horse', 18: 'sheep', 19: 'cow',
                 20: 'elephant', 21: 'bear', 22: 'zebra', 23: 'giraffe', 24: 'backpack',
                 25: 'umbrella', 26: 'handbag', 27: 'tie', 28: 'suitcase', 29: 'frisbee',
                 30: 'skis', 31: 'snowboard', 32: 'sports ball', 33: 'kite', 34: 'baseball bat',
                 35: 'baseball glove', 36: 'skateboard', 37: 'surfboard', 38: 'tennis racket',
                 39: 'bottle', 40: 'wine glass', 41: 'cup', 42: 'fork', 43: 'knife', 44: 'spoon',
                 45: 'bowl', 46: 'banana', 47: 'apple', 48: 'sandwich', 49: 'orange',
                 50: 'broccoli', 51: 'carrot', 52: 'hot dog', 53: 'pizza', 54: 'donut',
                 55: 'cake', 56: 'chair', 57: 'couch', 58: 'potted plant', 59: 'bed',
                 60: 'dining table', 61: 'toilet', 62: 'tv', 63: 'laptop', 64: 'mouse',
                 65: 'remote', 66: 'keyboard', 67: 'cell phone', 68: 'microwave', 69: 'oven',
                 70: 'toaster', 71: 'sink', 72: 'refrigerator', 73: 'book', 74: 'clock',
                 75: 'vase', 76: 'scissors', 77: 'teddy bear', 78: 'hair drier', 79: 'toothbrush'}
        return names.get(class_id, f"class_{class_id}")
    return model.names.get(class_id, "").lower()


def is_person(class_id, class_name=None):
    if MODEL_PPE_CLASSES and MODEL_PPE_CLASSES.get('person'):
        return class_id in MODEL_PPE_CLASSES['person']
    return class_id == 0 or class_name == "person"


def is_helmet(class_id, class_name=None):
    if MODEL_PPE_CLASSES and MODEL_PPE_CLASSES.get('helmet'):
        return class_id in MODEL_PPE_CLASSES['helmet']
    if class_name:
        return any(kw in class_name for kw in ['helmet', 'hardhat', 'hat'])
    return False


def is_no_helmet(class_id, class_name=None):
    if MODEL_PPE_CLASSES and MODEL_PPE_CLASSES.get('no_helmet'):
        return class_id in MODEL_PPE_CLASSES['no_helmet']
    if class_name:
        return any(kw in class_name for kw in ['nohat', 'no_hat', 'no-helmet', 'missing helmet'])
    return False


def is_vest(class_id, class_name=None):
    if MODEL_PPE_CLASSES and MODEL_PPE_CLASSES.get('vest'):
        return class_id in MODEL_PPE_CLASSES['vest']
    if class_name:
        return any(kw in class_name for kw in VEST_KEYWORDS)
    return False


def is_no_vest(class_id, class_name=None):
    if MODEL_PPE_CLASSES and MODEL_PPE_CLASSES.get('no_vest'):
        return class_id in MODEL_PPE_CLASSES['no_vest']
    if class_name:
        return any(kw in class_name for kw in ['novest', 'no_vest', 'no-vest', 'missing vest'])
    return False


def process_frame(model, frame: np.ndarray, frame_number: int, inference_size: int) -> dict:
    h_orig, w_orig = frame.shape[:2]

    padded, scale, pad = _letterbox_resize(frame, inference_size)

    detections = run_inference(model, padded, conf=0.1)

    person_boxes = []
    helmet_boxes = []
    no_helmet_boxes = []
    vest_boxes = []
    no_vest_boxes = []

    for class_id, conf, bbox in detections:
        class_name = get_class_name(model, class_id)

        x1, y1, x2, y2 = bbox
        x1 = (x1 - pad[0]) / max(scale, 1e-6)
        y1 = (y1 - pad[1]) / max(scale, 1e-6)
        x2 = (x2 - pad[0]) / max(scale, 1e-6)
        y2 = (y2 - pad[1]) / max(scale, 1e-6)
        x1 = max(0, min(w_orig, x1))
        y1 = max(0, min(h_orig, y1))
        x2 = max(0, min(w_orig, x2))
        y2 = max(0, min(h_orig, y2))
        orig_bbox = [x1, y1, x2, y2]

        if is_person(class_id, class_name):
            if conf >= CONF_THRESHOLD:
                person_boxes.append(orig_bbox)
        elif is_helmet(class_id, class_name):
            if conf >= PPE_CONF_THRESHOLD:
                helmet_boxes.append(orig_bbox)
        elif is_no_helmet(class_id, class_name):
            if conf >= PPE_CONF_THRESHOLD:
                no_helmet_boxes.append(orig_bbox)
        elif is_vest(class_id, class_name):
            if conf >= PPE_CONF_THRESHOLD:
                vest_boxes.append(orig_bbox)
        elif is_no_vest(class_id, class_name):
            if conf >= PPE_CONF_THRESHOLD:
                no_vest_boxes.append(orig_bbox)

    has_no_helmet_class = MODEL_PPE_CLASSES and len(MODEL_PPE_CLASSES.get('no_helmet', set())) > 0
    has_no_vest_class = MODEL_PPE_CLASSES and len(MODEL_PPE_CLASSES.get('no_vest', set())) > 0

    if has_no_helmet_class or has_no_vest_class:
        workers = associate_ppe_with_workers_v2(
            person_boxes, helmet_boxes, no_helmet_boxes, vest_boxes, no_vest_boxes, frame_number
        )
    else:
        workers = associate_ppe_with_workers(person_boxes, helmet_boxes, vest_boxes, frame_number)

    worker_matches = _match_workers_to_tracks(person_boxes, frame_number)

    for (stable_id, bbox), frame_worker in zip(worker_matches, workers):
        _update_worker_stats(stable_id, bbox, frame_worker["has_helmet"], frame_worker["has_vest"], frame_number)
        is_compliant, has_helmet, has_vest, violation, severity, label, color, color_hex = _get_worker_compliance(stable_id)
        frame_worker["worker_id"] = stable_id
        frame_worker["_stable_id"] = stable_id
        frame_worker["cumulative_violation"] = violation
        frame_worker["cumulative_severity"] = severity
        frame_worker["cumulative_label"] = label
        if violation is not None:
            frame_worker["violation"] = violation
            frame_worker["severity"] = severity
            frame_worker["label"] = label
            frame_worker["color"] = color
            frame_worker["color_hex"] = color_hex

    summary = summarize_detections(workers)
    annotate_frame(frame, workers, frame_number)

    clean_workers = []
    for w in workers:
        cw = {k: v for k, v in w.items() if k != "color"}
        clean_workers.append(cw)

    return {
        "frame": frame_number,
        "detections": clean_workers,
        "summary": summary,
        "_workers_with_color": workers,
        "inference_time_ms": 0,
    }


def _send_progress(video_id: str, progress: float, processed: int, total: int, fps: float, inference_fps: float, elapsed: float):
    try:
        payload = {
            "video_id": video_id,
            "progress": round(progress, 1),
            "processed_frames": processed,
            "total_frames": total,
            "fps": round(fps, 1),
            "inference_fps": round(inference_fps, 1),
            "elapsed_sec": round(elapsed, 1),
        }
        requests.post(f"{BACKEND_URL}/ai/progress/{video_id}", json=payload, timeout=5)
    except Exception:
        pass


# ── Main video processing function ──

def process_video(video_path: str, video_id: str = None, zone: str = "Zone A") -> dict:
    print("=" * 60)
    print(f"Starting video analysis (CPU-optimized)")
    print(f"   Video:   {video_path}")
    print(f"   Zone:    {zone}")
    print(f"   Model:   {MODEL_PATH}")
    print(f"   Inference size: {INFERENCE_SIZE}x{INFERENCE_SIZE}")
    print(f"   Sampling every {FRAME_SAMPLE_RATE} frames")
    print("=" * 60)

    start_time = time.time()

    reset_worker_tracking()
    model = load_model(MODEL_PATH)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {video_path}")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration_sec = total_frames / fps

    print(f"Video info: {width}x{height} @ {fps:.1f}fps | {total_frames} frames | {duration_sec:.1f}s")
    print(f"Expected processed frames: ~{total_frames // FRAME_SAMPLE_RATE}")

    base_name = os.path.splitext(os.path.basename(video_path))[0]
    if video_id:
        output_filename = f"annotated_{video_id}_{base_name}.mp4"
    else:
        output_filename = f"annotated_{base_name}.mp4"
    output_path = os.path.join(OUTPUT_DIR, output_filename)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    frame_results = []
    frame_detections = []
    frame_count = 0
    processed_count = 0
    last_frame_detections = []
    inference_times = deque(maxlen=50)
    last_progress_send = time.time()

    print(f"Processing... (every {FRAME_SAMPLE_RATE}th frame at {INFERENCE_SIZE}x{INFERENCE_SIZE})")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1
        timestamp_sec = (frame_count - 1) / fps if fps > 0 else 0

        if frame_count % FRAME_SAMPLE_RATE == 0:
            infer_start = time.time()
            frame_result = process_frame(model, frame, frame_count, INFERENCE_SIZE)
            infer_elapsed = (time.time() - infer_start) * 1000
            inference_times.append(infer_elapsed)

            frame_result["inference_time_ms"] = round(infer_elapsed, 1)
            frame_results.append(frame_result)
            last_frame_detections = frame_result.get("_workers_with_color") or frame_result["detections"]
            processed_count += 1

            normalized_dets = []
            for det in frame_result["detections"]:
                bbox = det.get("bbox")
                if bbox and len(bbox) == 4:
                    nx1 = round(bbox[0] / width, 6)
                    ny1 = round(bbox[1] / height, 6)
                    nx2 = round(bbox[2] / width, 6)
                    ny2 = round(bbox[3] / height, 6)
                    normalized_dets.append({
                        "worker_id": det.get("worker_id"),
                        "label": det.get("label"),
                        "violation": det.get("violation"),
                        "severity": det.get("severity"),
                        "color_hex": det.get("color_hex"),
                        "bbox": [nx1, ny1, nx2, ny2],
                        "has_helmet": det.get("has_helmet"),
                        "has_vest": det.get("has_vest"),
                    })

            frame_detections.append({
                "frame": frame_count,
                "timestamp_sec": round(timestamp_sec, 3),
                "detections": normalized_dets,
                "total_workers": frame_result["summary"].get("total_workers", 0),
                "violations": frame_result["summary"].get("violations", 0),
            })

            if processed_count % 30 == 0:
                elapsed = time.time() - start_time
                progress = (frame_count / total_frames) * 100
                avg_infer = sum(inference_times) / max(len(inference_times), 1)
                processed_fps = processed_count / max(elapsed, 0.1)
                print(f"   Progress: {progress:.1f}% | Frame {frame_count}/{total_frames} | "
                      f"Infer: {avg_infer:.0f}ms | Proc FPS: {processed_fps:.1f} | "
                      f"Elapsed: {elapsed:.0f}s")

                if video_id and (time.time() - last_progress_send) >= 3:
                    _io_executor.submit(
                        _send_progress,
                        video_id, progress, processed_count, total_frames,
                        fps, processed_fps, elapsed
                    )
                    last_progress_send = time.time()
        else:
            if last_frame_detections:
                annotate_frame(frame, last_frame_detections, frame_count)

        out.write(frame)

    cap.release()
    out.release()

    elapsed = time.time() - start_time
    avg_infer = sum(inference_times) / max(len(inference_times), 1) if inference_times else 0
    processed_fps = processed_count / max(elapsed, 0.1)

    print(f"Processing complete in {elapsed:.1f}s")
    print(f"   Sampled frames: {processed_count} out of {total_frames}")
    print(f"   Avg inference: {avg_infer:.0f}ms per frame")
    print(f"   Processing FPS: {processed_fps:.1f}")
    print(f"   Output saved: {output_path}")

    all_workers = get_all_worker_results()
    total_workers = len(all_workers)
    compliant_workers = sum(1 for w in all_workers if w['violation'] == VIOLATION_NONE)
    violation_workers = total_workers - compliant_workers
    compliance_rate = (compliant_workers / total_workers * 100) if total_workers > 0 else 0

    no_helmet_count = sum(1 for w in all_workers if w['violation'] == VIOLATION_NO_HELMET)
    no_vest_count = sum(1 for w in all_workers if w['violation'] == VIOLATION_NO_VEST)
    both_count = sum(1 for w in all_workers if w['violation'] == VIOLATION_NO_HELMET_VEST)
    all_violations = get_violation_events(end_frame=total_frames)

    avg_workers_per_frame = 0
    avg_violations_per_frame = 0
    peak_violations = 0
    peak_workers = 0
    if frame_results:
        workers_per_frame = [fr['summary']['total_workers'] for fr in frame_results if 'summary' in fr]
        violations_per_frame = [fr['summary']['violations'] for fr in frame_results if 'summary' in fr]
        if workers_per_frame:
            avg_workers_per_frame = round(sum(workers_per_frame) / len(workers_per_frame), 1)
            peak_workers = max(workers_per_frame)
        if violations_per_frame:
            avg_violations_per_frame = round(sum(violations_per_frame) / len(violations_per_frame), 1)
            peak_violations = max(violations_per_frame)

    final_result = {
        "video_id": video_id,
        "video_path": video_path,
        "output_path": output_path,
        "output_filename": output_filename,
        "zone": zone,
        "analyzed_at": datetime.utcnow().isoformat(),
        "processing_time_sec": round(elapsed, 2),
        "avg_inference_time_ms": round(avg_infer, 1),
        "processing_fps": round(processed_fps, 1),
        "video_info": {
            "width": width,
            "height": height,
            "fps": fps,
            "total_frames": total_frames,
            "duration_sec": round(duration_sec, 2),
            "sampled_frames": processed_count,
        },
        "frame_detections": frame_detections,
        "summary": {
            "total_workers": total_workers,
            "compliant_workers": compliant_workers,
            "violation_workers": violation_workers,
            "compliance_rate": round(compliance_rate, 1),
            "no_helmet_workers": no_helmet_count,
            "no_vest_workers": no_vest_count,
            "no_helmet_and_vest_workers": both_count,
            "total_violation_events": len(all_violations),
            "avg_workers_per_frame": avg_workers_per_frame,
            "avg_violations_per_frame": avg_violations_per_frame,
            "peak_violations": peak_violations,
            "peak_workers": peak_workers,
        },
        "workers": all_workers,
        "violations": all_violations,
        "frame_results": frame_results,
    }

    if video_id:
        _send_results_to_backend(video_id, final_result)

    print("=" * 60)
    print("ANALYSIS SUMMARY (Worker-Based)")
    print(f"   Total workers tracked: {total_workers}")
    print(f"   Compliant workers:    {compliant_workers} ({compliance_rate:.1f}%)")
    print(f"   Violation workers:    {violation_workers}")
    print(f"   - No helmet:          {no_helmet_count}")
    print(f"   - No vest:            {no_vest_count}")
    print(f"   - Both missing:       {both_count}")
    print(f"   Avg inference:        {avg_infer:.0f}ms")
    print(f"   Processing FPS:       {processed_fps:.1f}")
    print("=" * 60)

    return final_result


def _send_results_to_backend(video_id: str, results: dict):
    url = f"{BACKEND_URL}/ai/results/{video_id}"
    keys_to_exclude = {"frame_results", "_workers_with_color"}
    payload = {k: v for k, v in results.items() if k not in keys_to_exclude}
    try:
        response = requests.post(url, json=payload, timeout=60)
        if response.status_code == 200:
            print(f"Results sent to backend successfully")
            print(f"   Annotated video: {payload.get('output_filename', 'N/A')}")
            print(f"   Frame detections: {len(payload.get('frame_detections', []))} sampled frames")
        else:
            print(f"Backend returned status {response.status_code}: {response.text}")
    except requests.exceptions.ConnectionError:
        print(f"Could not connect to backend at {url}")
    except Exception as e:
        print(f"Error sending results: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SafeSite AI — CPU-Optimized Video Analysis")
    parser.add_argument("--video", required=True, help="Path to the video file")
    parser.add_argument("--video_id", default=None, help="MongoDB video ID")
    parser.add_argument("--zone", default="Zone A", help="Construction zone name")
    args = parser.parse_args()

    results = process_video(
        video_path=args.video,
        video_id=args.video_id,
        zone=args.zone
    )

    output_json = os.path.join(OUTPUT_DIR, "last_result.json")
    with open(output_json, "w") as f:
        results_to_save = {k: v for k, v in results.items() if k != "frame_results"}
        json.dump(results_to_save, f, indent=2, default=str)
    print(f"Results saved to: {output_json}")
