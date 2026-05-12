# ============================================================
# SafeSite AI — Main AI Detection Script
# File: ai-service/detect.py
#
# This is the BRAIN of the system.
# It reads a video file frame by frame, runs YOLOv8 on every
# Nth frame, detects safety violations, draws bounding boxes,
# saves an annotated output video, and sends results to the
# FastAPI backend.
#
# How to run:
#   python detect.py --video path/to/video.mp4 --video_id <mongo_id>
#
# How it works (step by step):
#   1. Load the YOLOv8 model
#   2. Open the video with OpenCV
#   3. Loop through every frame
#   4. SKIP frames that aren't multiples of FRAME_SAMPLE_RATE
#      (this makes it ~5x faster without losing much accuracy)
#   5. Run YOLOv8 on the sampled frame → get bounding boxes
#   6. Separate detections into: persons, helmets, vests
#   7. For each person, check if a helmet/vest is nearby
#   8. Classify the violation (none / no_helmet / no_vest / both)
#   9. Draw colored bounding boxes on the frame
#  10. Save violations to a results list
#  11. After processing, send all results to the backend API
# ============================================================

import cv2
import os
import json
import time
import argparse
import requests
import numpy as np
from datetime import datetime
from dotenv import load_dotenv
from ultralytics import YOLO

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

# Global variable to store PPE class indices for the loaded model
# This is set once when the model is loaded
MODEL_PPE_CLASSES = None

# Worker tracking state for event-based violation detection
_worker_stats = {}            # {stable_id: worker data}
_worker_next_id = 1           # Next stable ID to assign
_worker_track_history = {}    # {stable_id: [(cx, cy), ...]} for centroid tracking

# Event-based violation tracking
_active_violations = {}       # {stable_id: {type, start_frame}} - current active violation per worker
_violation_events = []        # List of ALL violation events: [{worker_id, type, start_frame, end_frame}]


def _get_bbox_center(bbox):
    """Get center point of a bounding box."""
    return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)


def _match_workers_to_tracks(person_boxes, frame_number, max_distance=150):
    """
    Match current frame's person boxes to previously tracked workers using
    centroid distance. Returns list of (stable_id, bbox) tuples.
    """
    global _worker_next_id, _worker_track_history

    matches = []  # [(stable_id, bbox)]
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
            # Use last known position
            prev_cx, prev_cy = prev_positions[-1]
            dist = ((cx - prev_cx) ** 2 + (cy - prev_cy) ** 2) ** 0.5

            # Also check if boxes overlap (more reliable)
            if stable_id in _worker_stats and _worker_stats[stable_id].get('last_bbox'):
                if boxes_overlap(bbox, _worker_stats[stable_id]['last_bbox'], threshold=0.1):
                    dist = 0  # Overlap means very likely same person

            if dist < best_dist and dist < max_distance:
                best_dist = dist
                best_id = stable_id

        if best_id is not None:
            matches.append((best_id, bbox))
            used_tracks.add(best_id)
            # Update tracking history
            if best_id not in _worker_track_history:
                _worker_track_history[best_id] = []
            _worker_track_history[best_id].append((cx, cy))
            if len(_worker_track_history[best_id]) > 10:
                _worker_track_history[best_id] = _worker_track_history[best_id][-10:]
        else:
            # New worker
            new_id = _worker_next_id
            _worker_next_id += 1
            matches.append((new_id, bbox))
            _worker_track_history[new_id] = [(cx, cy)]

    return matches


def _init_worker_stats(stable_id, bbox, frame_number):
    """Initialize stats for a new worker."""
    global _worker_stats
    _worker_stats[stable_id] = {
        'helmet_frames': 0,
        'vest_frames': 0,
        'total_frames': 0,
        'last_bbox': bbox,
        'first_seen': frame_number,
        'last_seen': frame_number,
        'consecutive_helmet_missing': 0,  # Consecutive processed frames without helmet
        'consecutive_vest_missing': 0,    # Consecutive processed frames without vest
        'consecutive_compliant_frames': 0,  # Hysteresis: frames with PPE (to end violation)
        'violation_confirmed': False,
        'violation_type': None,
    }


def _update_worker_stats(stable_id, bbox, has_helmet, has_vest, frame_number):
    """
    Update PPE stats for a worker.
    Tracks consecutive processed frames without PPE and only confirms violation after threshold.
    Uses hysteresis to prevent flickering - requires consistent PPE to end violation.
    """
    global _worker_stats, _active_violations, _violation_events

    if stable_id not in _worker_stats:
        _init_worker_stats(stable_id, bbox, frame_number)

    stats = _worker_stats[stable_id]
    stats['total_frames'] += 1  # Count processed frames
    stats['last_bbox'] = bbox
    stats['last_seen'] = frame_number

    is_compliant_this_frame = has_helmet and has_vest

    # Update helmet tracking
    if has_helmet:
        stats['helmet_frames'] += 1
        stats['consecutive_helmet_missing'] = 0  # Reset on detection
    else:
        stats['consecutive_helmet_missing'] += 1  # Increment consecutive missing

    # Update vest tracking
    if has_vest:
        stats['vest_frames'] += 1
        stats['consecutive_vest_missing'] = 0  # Reset on detection
    else:
        stats['consecutive_vest_missing'] += 1  # Increment consecutive missing

    # Track consecutive compliant frames for hysteresis
    if is_compliant_this_frame:
        stats['consecutive_compliant_frames'] += 1
    else:
        stats['consecutive_compliant_frames'] = 0  # Reset on any violation

    # Check if violation should be confirmed or ended
    _check_violation_confirmation(stable_id, frame_number)


def _check_violation_confirmation(stable_id, frame_number):
    """
    Check if a violation should be confirmed or ended based on consecutive frames.
    - Violation starts after VIOLATION_CONFIRM_FRAMES (8-10) consecutive missing PPE frames
    - Violation ends after VIOLATION_END_FRAMES (5) consecutive compliant frames (hysteresis)
    This prevents flickering from brief detection drops.

    Event-based: Each worker can only have ONE active violation at a time.
    Multiple violation events per worker are tracked in _violation_events list.
    """
    global _worker_stats, _active_violations, _violation_events

    stats = _worker_stats[stable_id]
    helmet_missing = stats['consecutive_helmet_missing']
    vest_missing = stats['consecutive_vest_missing']
    compliant_frames = stats['consecutive_compliant_frames']

    # Determine current violation type based on consecutive missing frames
    current_violation = None
    if helmet_missing >= VIOLATION_CONFIRM_FRAMES and vest_missing >= VIOLATION_CONFIRM_FRAMES:
        current_violation = VIOLATION_NO_HELMET_VEST
    elif helmet_missing >= VIOLATION_CONFIRM_FRAMES:
        current_violation = VIOLATION_NO_HELMET
    elif vest_missing >= VIOLATION_CONFIRM_FRAMES:
        current_violation = VIOLATION_NO_VEST

    if current_violation:
        # Potential violation detected (missing PPE for enough frames)
        if not stats['violation_confirmed']:
            # First time confirming - start a new violation event
            stats['violation_confirmed'] = True
            stats['violation_type'] = current_violation
            _active_violations[stable_id] = {
                'type': current_violation,
                'start_frame': frame_number - VIOLATION_CONFIRM_FRAMES + 1,
            }
        # Reset compliant frame counter when violation is active
        stats['consecutive_compliant_frames'] = 0
    else:
        # PPE detected - check hysteresis before ending violation
        if stats['violation_confirmed'] and stable_id in _active_violations:
            # Only end violation after VIOLATION_END_FRAMES consecutive compliant frames
            if compliant_frames >= VIOLATION_END_FRAMES:
                # End the violation event and add to events list
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
    """
    Get worker compliance based on PPE ratios (worker-level safety).

    LOGIC:
    - Worker is COMPLIANT if BOTH helmet_ratio AND vest_ratio > PPE_RATIO_THRESHOLD
    - Uses configurable threshold (default 0.5) to account for detection drops
    - Violation events are used for ALERTING only, not compliance calculation

    Returns (is_compliant, has_helmet, has_vest, violation_type, severity, label, color, color_hex)
    """
    if stable_id not in _worker_stats:
        return None, None, None, None, None, None, None, None

    stats = _worker_stats[stable_id]

    # Determine PPE status based on ratio (for compliance)
    # Use configurable threshold to account for detection drops
    helmet_ratio = stats['helmet_frames'] / stats['total_frames'] if stats['total_frames'] > 0 else 0
    vest_ratio = stats['vest_frames'] / stats['total_frames'] if stats['total_frames'] > 0 else 0
    has_helmet = helmet_ratio >= PPE_RATIO_THRESHOLD
    has_vest = vest_ratio >= PPE_RATIO_THRESHOLD

    # Compliance is based on ratio - worker is compliant if BOTH PPE are mostly worn
    is_compliant = has_helmet and has_vest

    # Get violation type from event-based tracking (for display and alerts only)
    violation_type = None
    if stats['violation_confirmed'] and stats['violation_type']:
        violation_type = stats['violation_type']
    elif stable_id in _active_violations:
        violation_type = _active_violations[stable_id]['type']

    # If compliant by ratio, return compliant status
    if is_compliant:
        return (True, has_helmet, has_vest, VIOLATION_NONE, SEVERITY_SAFE, "Compliant", (0, 255, 0), "#22c55e")

    # Non-compliant - return appropriate violation
    if violation_type == VIOLATION_NO_HELMET_VEST:
        return (False, has_helmet, has_vest, VIOLATION_NO_HELMET_VEST, SEVERITY_HIGH, "No Helmet & No Vest", (0, 0, 255), "#ef4444")
    elif violation_type == VIOLATION_NO_HELMET:
        return (False, has_helmet, has_vest, VIOLATION_NO_HELMET, SEVERITY_MEDIUM, "No Helmet", (0, 165, 255), "#f97316")
    elif violation_type == VIOLATION_NO_VEST:
        return (False, has_helmet, has_vest, VIOLATION_NO_VEST, SEVERITY_MEDIUM, "No Vest", (0, 215, 255), "#eab308")
    else:
        # No confirmed violation event, but ratio says non-compliant
        if not has_helmet and not has_vest:
            return (False, has_helmet, has_vest, VIOLATION_NO_HELMET_VEST, SEVERITY_HIGH, "No Helmet & No Vest", (0, 0, 255), "#ef4444")
        elif not has_helmet:
            return (False, has_helmet, has_vest, VIOLATION_NO_HELMET, SEVERITY_MEDIUM, "No Helmet", (0, 165, 255), "#f97316")
        else:
            return (False, has_helmet, has_vest, VIOLATION_NO_VEST, SEVERITY_MEDIUM, "No Vest", (0, 215, 255), "#eab308")


def get_all_worker_results():
    """
    Get final results for all tracked workers.
    Filters out workers with too few frames (< 10) to avoid noise.
    """
    results = []

    for stable_id, stats in _worker_stats.items():
        # Skip workers with too few frames (noise)
        if stats['total_frames'] < 10:
            continue

        is_compliant, has_helmet, has_vest, violation, severity, label, color, color_hex = _get_worker_compliance(stable_id)

        if is_compliant is None:
            continue

        helmet_ratio = stats['helmet_frames'] / stats['total_frames'] if stats['total_frames'] > 0 else 0
        vest_ratio = stats['vest_frames'] / stats['total_frames'] if stats['total_frames'] > 0 else 0

        # Count violation events for this worker
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
            'violation_count': len(worker_violations),  # Number of violation events for this worker
        })

    return results


def get_violation_events(end_frame=None):
    """
    Get list of confirmed violation events (for reporting).
    Each event is counted only ONCE, not per frame.
    If end_frame is provided, finalize active violations with that frame.
    """
    events = list(_violation_events)  # Copy confirmed events

    # Also include active violations that haven't ended yet
    for stable_id, viol in _active_violations.items():
        sev = "high" if viol['type'] == VIOLATION_NO_HELMET_VEST else "medium"
        events.append({
            'worker_id': stable_id,
            'violation': viol['type'],
            'severity': sev,
            'start_frame': viol['start_frame'],
            'end_frame': end_frame if end_frame else None,  # Use provided end_frame if available
            'duration_frames': (end_frame - viol['start_frame']) if end_frame else None,
        })

    return events


def reset_worker_tracking():
    """Reset all worker tracking state. Call before processing a new video."""
    global _worker_stats, _worker_next_id, _worker_track_history
    global _active_violations, _violation_events
    _worker_stats = {}
    _worker_next_id = 1
    _worker_track_history = {}
    _active_violations = {}
    _violation_events = []


from utils.frame_annotator import annotate_frame, save_annotated_frame

load_dotenv()

# ── Config from .env ──────────────────────────────────────────
BACKEND_URL        = os.getenv("BACKEND_URL", "http://localhost:8000")
FRAME_SAMPLE_RATE  = int(os.getenv("FRAME_SAMPLE_RATE", 1))
CONF_THRESHOLD     = float(os.getenv("CONFIDENCE_THRESHOLD", 0.5))
PPE_CONF_THRESHOLD = float(os.getenv("PPE_CONF_THRESHOLD", 0.35))
MODEL_PATH         = os.getenv("MODEL_PATH", "model/yolov8n.pt")

# Event-based violation config
VIOLATION_CONFIRM_FRAMES = int(os.getenv("VIOLATION_CONFIRM_FRAMES", 8))
PPE_RATIO_THRESHOLD     = float(os.getenv("PPE_RATIO_THRESHOLD", 0.7))

# Hysteresis: require PPE to be consistently detected before ending violation
VIOLATION_END_FRAMES = int(os.getenv("VIOLATION_END_FRAMES", 5))  # Frames with PPE needed to end violation

# Where to save annotated output videos
# Save to backend's uploads/annotated folder so it's served via static files
AI_SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(AI_SERVICE_DIR)
OUTPUT_DIR = os.path.join(BACKEND_DIR, "uploads", "annotated")
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ── Model loader ──────────────────────────────────────────────

def load_model(model_path: str) -> YOLO:
    """
    Load the YOLOv8 model and print class names for verification.
    Also sets the global MODEL_PPE_CLASSES for dynamic PPE detection.
    """
    global MODEL_PPE_CLASSES

    abs_path = os.path.abspath(model_path)
    print(f"📦 Loading model from: {abs_path}")

    if not os.path.exists(model_path):
        print(f"   ⚠️  Model file not found locally!")
        print(f"   YOLOv8 will try to download or use default model.")
        print(f"   For PPE detection, ensure you have a trained PPE model.")

    model = YOLO(model_path)

    # Print model info for verification
    print(f"✅ Model loaded successfully")
    print(f"   Model path: {abs_path}")
    print(f"   Class names: {model.names}")

    # Dynamically identify PPE class indices from the model
    MODEL_PPE_CLASSES = get_ppe_class_indices(model.names)

    # Check if model has PPE classes
    has_helmet = len(MODEL_PPE_CLASSES['helmet']) > 0 or len(MODEL_PPE_CLASSES['no_helmet']) > 0
    has_vest = len(MODEL_PPE_CLASSES['vest']) > 0 or len(MODEL_PPE_CLASSES['no_vest']) > 0

    if not has_helmet or not has_vest:
        print(f"   ⚠️  WARNING: Model may not have PPE classes!")
        print(f"   Helmet class IDs: {MODEL_PPE_CLASSES['helmet']}")
        print(f"   No-Helmet class IDs: {MODEL_PPE_CLASSES['no_helmet']}")
        print(f"   Vest class IDs: {MODEL_PPE_CLASSES['vest']}")
        print(f"   No-Vest class IDs: {MODEL_PPE_CLASSES['no_vest']}")
        print(f"   This model appears to be a standard COCO model, not a PPE model.")
        print(f"   PPE detection will not work correctly!")
        print(f"   Please download a PPE model like yolo11m_safety.pt")
    else:
        print(f"   ✅ PPE classes detected - model is suitable for safety detection")
        print(f"   Person class IDs: {MODEL_PPE_CLASSES['person']}")
        print(f"   Helmet class IDs (wearing): {MODEL_PPE_CLASSES['helmet']}")
        print(f"   No-Helmet class IDs (violation): {MODEL_PPE_CLASSES['no_helmet']}")
        print(f"   Vest class IDs (wearing): {MODEL_PPE_CLASSES['vest']}")
        print(f"   No-Vest class IDs (violation): {MODEL_PPE_CLASSES['no_vest']}")

    return model


# ── Class identification helpers ──────────────────────────────

def get_class_name(model: YOLO, class_id: int) -> str:
    """Return the human-readable name for a class ID."""
    return model.names.get(class_id, "").lower()


def is_person(class_id: int, class_name: str = None) -> bool:
    """
    Check if a detected object is a person.
    Uses class_id for speed, falls back to name check.
    """
    if MODEL_PPE_CLASSES and MODEL_PPE_CLASSES.get('person'):
        return class_id in MODEL_PPE_CLASSES['person']
    # Fallback to name check
    return class_name == "person" if class_name else False


def is_helmet(class_id: int, class_name: str = None) -> bool:
    """
    Check if a detected object is a helmet/hardhat (wearing helmet).
    Uses dynamic class IDs from the loaded model.
    """
    if MODEL_PPE_CLASSES and MODEL_PPE_CLASSES.get('helmet'):
        return class_id in MODEL_PPE_CLASSES['helmet']
    # Fallback to keyword matching
    if class_name:
        return any(kw in class_name for kw in ['helmet', 'hardhat', 'hat'])
    return False


def is_no_helmet(class_id: int, class_name: str = None) -> bool:
    """
    Check if a detected object is a 'no helmet' violation class.
    For models like yolo11m_safety.pt, 'nohat' class indicates
    a person NOT wearing a helmet.
    """
    if MODEL_PPE_CLASSES and MODEL_PPE_CLASSES.get('no_helmet'):
        return class_id in MODEL_PPE_CLASSES['no_helmet']
    # Fallback to keyword matching
    if class_name:
        return any(kw in class_name for kw in ['nohat', 'no_hat', 'no-helmet', 'missing helmet'])
    return False


def is_vest(class_id: int, class_name: str = None) -> bool:
    """
    Check if a detected object is a safety vest (wearing vest).
    Uses dynamic class IDs from the loaded model.
    """
    if MODEL_PPE_CLASSES and MODEL_PPE_CLASSES.get('vest'):
        return class_id in MODEL_PPE_CLASSES['vest']
    # Fallback to keyword matching
    if class_name:
        return any(kw in class_name for kw in VEST_KEYWORDS)
    return False


def is_no_vest(class_id: int, class_name: str = None) -> bool:
    """
    Check if a detected object is a 'no vest' violation class.
    For models like yolo11m_safety.pt, 'novest' class indicates
    a person NOT wearing a vest.
    """
    if MODEL_PPE_CLASSES and MODEL_PPE_CLASSES.get('no_vest'):
        return class_id in MODEL_PPE_CLASSES['no_vest']
    # Fallback to keyword matching
    if class_name:
        return any(kw in class_name for kw in ['novest', 'no_vest', 'no-vest', 'missing vest'])
    return False


# ── Frame processor ───────────────────────────────────────────

def process_frame(model: YOLO, frame: np.ndarray, frame_number: int) -> dict:
    """
    Run YOLOv8 on a single frame and return structured detection results.

    Args:
        model:        The loaded YOLO model
        frame:        Raw video frame (numpy BGR array from OpenCV)
        frame_number: Which frame number this is (for logging)

    Returns dict like:
    {
        "frame": 15,
        "detections": [
            {
                "worker_id": 1,
                "has_helmet": False,
                "has_vest": True,
                "violation": "no_helmet",
                "severity": "medium",
                "label": "No Helmet",
                "bbox": [x1, y1, x2, y2],
                "color_hex": "#f97316"
            },
            ...
        ],
        "summary": {
            "total_workers": 3,
            "compliant": 1,
            "violations": 2,
            ...
        }
    }
    """
    # ── Step 1: Run inference ──────────────────────────────────
    # verbose=False suppresses per-frame console spam
    # Use lower threshold to capture more PPE detections, then filter by class-specific thresholds
    results = model(frame, conf=0.1, verbose=False)

    # ── Step 2: Sort detections by class with class-specific confidence thresholds ──────────────────────
    person_boxes = []
    helmet_boxes = []       # Wearing helmet (positive)
    no_helmet_boxes = []   # NOT wearing helmet (violation class like 'nohat')
    vest_boxes = []         # Wearing vest (positive)
    no_vest_boxes = []     # NOT wearing vest (violation class like 'novest')

    # results[0].boxes contains all detections for this frame
    for box in results[0].boxes:
        class_id   = int(box.cls[0])
        conf       = float(box.conf[0])
        class_name = get_class_name(model, class_id)
        bbox       = box.xyxy[0].tolist()  # [x1, y1, x2, y2] in pixels

        # Use class_id for faster lookup, with class_name as fallback
        if is_person(class_id, class_name):
            if conf >= CONF_THRESHOLD:
                person_boxes.append(bbox)
        elif is_helmet(class_id, class_name):
            if conf >= PPE_CONF_THRESHOLD:
                helmet_boxes.append(bbox)
            if os.getenv("DEBUG_DETECTIONS", "false").lower() == "true":
                print(f"      PPE Debug: helmet class={class_id} ({class_name}) conf={conf:.3f} -> {'ACCEPTED' if conf >= PPE_CONF_THRESHOLD else 'REJECTED'}")
        elif is_no_helmet(class_id, class_name):
            if conf >= PPE_CONF_THRESHOLD:
                no_helmet_boxes.append(bbox)
            if os.getenv("DEBUG_DETECTIONS", "false").lower() == "true":
                print(f"      PPE Debug: no_helmet class={class_id} ({class_name}) conf={conf:.3f} -> {'ACCEPTED' if conf >= PPE_CONF_THRESHOLD else 'REJECTED'}")
        elif is_vest(class_id, class_name):
            if conf >= PPE_CONF_THRESHOLD:
                vest_boxes.append(bbox)
            if os.getenv("DEBUG_DETECTIONS", "false").lower() == "true":
                print(f"      PPE Debug: vest class={class_id} ({class_name}) conf={conf:.3f} -> {'ACCEPTED' if conf >= PPE_CONF_THRESHOLD else 'REJECTED'}")
        elif is_no_vest(class_id, class_name):
            if conf >= PPE_CONF_THRESHOLD:
                no_vest_boxes.append(bbox)
            if os.getenv("DEBUG_DETECTIONS", "false").lower() == "true":
                print(f"      PPE Debug: no_vest class={class_id} ({class_name}) conf={conf:.3f} -> {'ACCEPTED' if conf >= PPE_CONF_THRESHOLD else 'REJECTED'}")
        else:
            if os.getenv("DEBUG_DETECTIONS", "false").lower() == "true":
                print(f"      PPE Debug: unknown class={class_id} ({class_name}) conf={conf:.3f}")

    # Debug output (controlled by .env DEBUG_DETECTIONS)
    if os.getenv("DEBUG_DETECTIONS", "false").lower() == "true":
        print(f"   Frame {frame_number}: Persons={len(person_boxes)}, "
              f"Helmets(wearing)={len(helmet_boxes)}, NoHelmets(violation)={len(no_helmet_boxes)}, "
              f"Vests(wearing)={len(vest_boxes)}, NoVests(violation)={len(no_vest_boxes)}")

    # ── Step 3: Associate PPE with workers (per-frame detection) ──
    # This is where the safety logic runs (see violation_detector.py)
    # PPE detection is PER PERSON - each person evaluated independently

    # Choose the right association function based on model classes
    # Models like yolo11m_safety.pt have 'nohat'/'novest' violation classes
    has_no_helmet_class = MODEL_PPE_CLASSES and len(MODEL_PPE_CLASSES.get('no_helmet', set())) > 0
    has_no_vest_class = MODEL_PPE_CLASSES and len(MODEL_PPE_CLASSES.get('no_vest', set())) > 0

    if has_no_helmet_class or has_no_vest_class:
        # Model has 'nohat'/'novest' style violation classes
        if os.getenv("DEBUG_DETECTIONS", "false").lower() == "true":
            print(f"   Using v2 PPE association (model has violation classes)")
        workers = associate_ppe_with_workers_v2(
            person_boxes,
            helmet_boxes,
            no_helmet_boxes,
            vest_boxes,
            no_vest_boxes,
            frame_number
        )
    else:
        # Model has separate helmet/vest objects (old style, like detecting helmet as object)
        if os.getenv("DEBUG_DETECTIONS", "false").lower() == "true":
            print(f"   Using v1 PPE association (model has PPE as separate objects)")
        workers = associate_ppe_with_workers(person_boxes, helmet_boxes, vest_boxes, frame_number)

    # ── Step 3b: Update worker-level tracking with cumulative stats ──
    # Match current workers to tracked workers across frames
    worker_matches = _match_workers_to_tracks(person_boxes, frame_number)

    for (stable_id, bbox), frame_worker in zip(worker_matches, workers):
        # Update cumulative PPE stats for this worker
        _update_worker_stats(stable_id, bbox, frame_worker["has_helmet"], frame_worker["has_vest"], frame_number)

        # Get worker's overall compliance status (for annotation)
        is_compliant, has_helmet, has_vest, violation, severity, label, color, color_hex = _get_worker_compliance(stable_id)

        # Update worker dict with stable ID and cumulative status
        frame_worker["worker_id"] = stable_id
        frame_worker["_stable_id"] = stable_id
        frame_worker["cumulative_violation"] = violation
        frame_worker["cumulative_severity"] = severity
        frame_worker["cumulative_label"] = label

        # Use cumulative status for annotation (more stable across frames)
        if violation is not None:
            frame_worker["violation"] = violation
            frame_worker["severity"] = severity
            frame_worker["label"] = label
            frame_worker["color"] = color
            frame_worker["color_hex"] = color_hex

    # ── Step 4: Build summary (per-frame, for debugging only) ────────────────────────────────
    summary = summarize_detections(workers)

    # ── Step 5: Draw bounding boxes on the frame ──────────────
    # Use cumulative compliance status for annotation (more stable)
    annotate_frame(frame, workers, frame_number)

    # Remove the color tuple (not JSON-serializable) before returning
    clean_workers = []
    for w in workers:
        cw = {k: v for k, v in w.items() if k != "color"}
        clean_workers.append(cw)

    return {
        "frame": frame_number,
        "detections": clean_workers,
        "summary": summary,
        "_workers_with_color": workers,  # Keep original for video annotation
    }


# ── Main video processing function ────────────────────────────

def process_video(video_path: str, video_id: str = None, zone: str = "Zone A") -> dict:
    """
    Process an entire video file for safety violations.

    This is the main function that ties everything together.

    Args:
        video_path: Path to the video file on disk
        video_id:   MongoDB ID of the video (to update its status)
        zone:       Which construction zone this video is from

    Returns:
        Full analysis results dict
    """
    print("=" * 60)
    print(f"🎬 Starting video analysis")
    print(f"   Video:   {video_path}")
    print(f"   Zone:    {zone}")
    print(f"   Sampling every {FRAME_SAMPLE_RATE} frames")
    print(f"   PPE conf threshold: {PPE_CONF_THRESHOLD}")
    print(f"   PPE ratio threshold: {PPE_RATIO_THRESHOLD}")
    print("=" * 60)

    start_time = time.time()

    # ── Reset worker tracking for new video ────────────────────
    reset_worker_tracking()

    # ── Load model ────────────────────────────────────────────
    model = load_model(MODEL_PATH)

    # ── Open video ────────────────────────────────────────────
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {video_path}")

    # Video properties
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps          = cap.get(cv2.CAP_PROP_FPS) or 30
    width        = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height       = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration_sec = total_frames / fps

    print(f"📹 Video info: {width}x{height} @ {fps:.1f}fps | {total_frames} frames | {duration_sec:.1f}s")

    # ── Set up output video writer ────────────────────────────
    # We'll save an annotated copy of the video with bounding boxes
    # Use video_id in filename for unique identification
    base_name = os.path.splitext(os.path.basename(video_path))[0]
    if video_id:
        output_filename = f"annotated_{video_id}_{base_name}.mp4"
    else:
        output_filename = f"annotated_{base_name}.mp4"
    output_path = os.path.join(OUTPUT_DIR, output_filename)

    # Use mp4v codec (MPEG-4) - widely supported. For H.264, OpenCV needs to be built with H.264 support.
    # Fallback: if mp4v fails, try other codecs
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out    = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    # ── Process frames ────────────────────────────────────────
    frame_results  = []       # Results for every SAMPLED frame
    frame_detections = []      # Normalized detections for frontend canvas overlay
    frame_count    = 0
    processed_count = 0
    last_frame_detections = []  # Keep the last result for non-sampled frames

    print(f"⚙️  Processing... (every {FRAME_SAMPLE_RATE}th frame)")

    while True:
        ret, frame = cap.read()
        if not ret:
            break  # End of video

        frame_count += 1
        timestamp_sec = (frame_count - 1) / fps if fps > 0 else 0

        # ── FRAME SAMPLING ────────────────────────────────────
        if frame_count % FRAME_SAMPLE_RATE == 0:
            # Run AI detection on this frame
            frame_result = process_frame(model, frame, frame_count)
            frame_results.append(frame_result)
            # Save original workers with color for annotation on non-sampled frames
            last_frame_detections = frame_result.get("_workers_with_color") or frame_result["detections"]
            processed_count += 1

            # Build normalized detections for frontend canvas (convert to 0-1 range)
            normalized_dets = []
            for det in frame_result["detections"]:
                bbox = det.get("bbox")
                if bbox and len(bbox) == 4:
                    # Normalize absolute pixel coordinates to 0-1 range
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

            # Store this frame's detections for frontend overlay
            frame_detections.append({
                "frame": frame_count,
                "timestamp_sec": round(timestamp_sec, 3),
                "detections": normalized_dets,
                "total_workers": frame_result["summary"].get("total_workers", 0),
                "violations": frame_result["summary"].get("violations", 0),
            })

            # Print progress every 50 processed frames
            if processed_count % 50 == 0:
                progress = (frame_count / total_frames) * 100
                print(f"   Progress: {progress:.1f}% | Frame {frame_count}/{total_frames}")
        else:
            # For non-sampled frames, re-draw the last known detections
            if last_frame_detections:
                annotate_frame(frame, last_frame_detections, frame_count)

        # Write this frame (annotated or not) to the output video
        out.write(frame)

    # Clean up
    cap.release()
    out.release()

    elapsed = time.time() - start_time
    print(f"✅ Processing complete in {elapsed:.1f}s")
    print(f"   Sampled frames: {processed_count} out of {total_frames}")
    print(f"   Output saved: {output_path}")

    # ── Build WORKER-BASED summary ────────────────────────────
    # Get final compliance status for each tracked worker
    all_workers = get_all_worker_results()

    total_workers = len(all_workers)
    compliant_workers = sum(1 for w in all_workers if w['violation'] == VIOLATION_NONE)
    violation_workers = total_workers - compliant_workers

    # Compliance rate = % of workers who are compliant (no violation events)
    compliance_rate = (compliant_workers / total_workers * 100) if total_workers > 0 else 0

    # Count violation types
    no_helmet_count = sum(1 for w in all_workers if w['violation'] == VIOLATION_NO_HELMET)
    no_vest_count = sum(1 for w in all_workers if w['violation'] == VIOLATION_NO_VEST)
    both_count = sum(1 for w in all_workers if w['violation'] == VIOLATION_NO_HELMET_VEST)

    # Build violations list (EVENT-BASED, not per-frame)
    # Pass total_frames to finalize any active violations
    all_violations = get_violation_events(end_frame=total_frames)

    # Calculate avg_workers_per_frame, avg_violations_per_frame and peak_violations from frame_results
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
        "video_id":        video_id,
        "video_path":      video_path,
        "output_path":     output_path,
        "output_filename": output_filename,
        "zone":            zone,
        "analyzed_at":     datetime.utcnow().isoformat(),
        "processing_time_sec": round(elapsed, 2),
        "video_info": {
            "width":         width,
            "height":        height,
            "fps":           fps,
            "total_frames":  total_frames,
            "duration_sec":  round(duration_sec, 2),
            "sampled_frames": processed_count,
        },
        "frame_detections": frame_detections,
        "summary": {
            "total_workers":            total_workers,
            "compliant_workers":        compliant_workers,
            "violation_workers":        violation_workers,
            "compliance_rate":          round(compliance_rate, 1),
            "no_helmet_workers":       no_helmet_count,
            "no_vest_workers":         no_vest_count,
            "no_helmet_and_vest_workers": both_count,
            "total_violation_events":  len(all_violations),
            "avg_workers_per_frame":   avg_workers_per_frame,
            "avg_violations_per_frame": avg_violations_per_frame,
            "peak_violations":         peak_violations,
            "peak_workers":            peak_workers,
        },
        "workers":        all_workers,    # Worker-based results
        "violations":     all_violations,
        "frame_results":  frame_results,  # Keep for debugging
    }

    # ── Send results to backend ───────────────────────────────
    if video_id:
        _send_results_to_backend(video_id, final_result)

    # Print summary
    print("=" * 60)
    print("📊 ANALYSIS SUMMARY (Worker-Based)")
    print(f"   Total workers tracked: {total_workers}")
    print(f"   Compliant workers:    {compliant_workers} ({compliance_rate:.1f}%)")
    print(f"   Violation workers:    {violation_workers}")
    print(f"   - No helmet:          {no_helmet_count}")
    print(f"   - No vest:            {no_vest_count}")
    print(f"   - Both missing:       {both_count}")
    print("=" * 60)

    return final_result


# ── Backend communication ─────────────────────────────────────

def _send_results_to_backend(video_id: str, results: dict):
    """
    Send the analysis results to the FastAPI backend.
    The backend will:
      1. Update the video document status to "completed"
      2. Save the results
      3. Create Alert documents for high-severity violations
    """
    url = f"{BACKEND_URL}/ai/results/{video_id}"
    # Exclude:
    #   - frame_results — huge, not needed, contains non-serializable tuples
    #   - _workers_with_color — internal only
    # Keep:
    #   - frame_detections — NEW: normalized per-frame detections for frontend canvas
    #   - output_filename, output_path — for annotated video serving
    keys_to_exclude = {"frame_results", "_workers_with_color"}
    payload = {k: v for k, v in results.items() if k not in keys_to_exclude}
    try:
        response = requests.post(url, json=payload, timeout=60)
        if response.status_code == 200:
            print(f"✅ Results sent to backend successfully")
            print(f"   Annotated video: {payload.get('output_filename', 'N/A')}")
            print(f"   Frame detections: {len(payload.get('frame_detections', []))} sampled frames")
        else:
            print(f"⚠️  Backend returned status {response.status_code}: {response.text}")
    except requests.exceptions.ConnectionError:
        print(f"⚠️  Could not connect to backend at {url}")
        print(f"   Results were NOT saved. Is the backend running?")
    except Exception as e:
        print(f"⚠️  Error sending results: {e}")


# ── CLI entry point ───────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="SafeSite AI — Analyze a video for safety violations"
    )
    parser.add_argument(
        "--video",
        required=True,
        help="Path to the video file (e.g. ../backend/uploads/videos/myvideo.mp4)"
    )
    parser.add_argument(
        "--video_id",
        default=None,
        help="MongoDB video ID (optional — if given, results are saved to backend)"
    )
    parser.add_argument(
        "--zone",
        default="Zone A",
        help="Construction zone name (e.g. 'Zone B')"
    )

    args = parser.parse_args()

    # Run the detection
    results = process_video(
        video_path=args.video,
        video_id=args.video_id,
        zone=args.zone
    )

    # Save results to a local JSON file as well (useful for debugging)
    output_json = os.path.join(OUTPUT_DIR, "last_result.json")
    with open(output_json, "w") as f:
        # frame_results can be huge — only save summary + violations
        results_to_save = {k: v for k, v in results.items() if k != "frame_results"}
        json.dump(results_to_save, f, indent=2, default=str)
    print(f"📄 Results saved to: {output_json}")