"""
SafeSite AI — PPE Detection Debug Script
==========================================
Step-by-step debug of the full PPE detection pipeline.

Run: python debug_ppe.py --video <path_to_video.mp4> [--frame 1]

This will:
  1. Load model and print class names
  2. Process one frame with raw YOLO detections logged
  3. Show PPE association per worker
  4. Save debug frames with ALL raw detections visualized
  5. Print the violation output for each worker
"""

import cv2
import os
import sys
import argparse
import numpy as np
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

sys.path.insert(0, os.path.dirname(__file__))
from detect import (
    load_model, process_frame, reset_worker_tracking,
    MODEL_PATH, INFERENCE_SIZE, CONF_THRESHOLD, PPE_CONF_THRESHOLD, MAX_DET,
    _get_bbox_center,
)
from utils.violation_detector import (
    associate_ppe_with_workers_v3, get_violation,
    get_head_region, get_torso_region, get_ppe_class_indices, boxes_iou,
    VIOLATION_NONE, VIOLATION_NO_HELMET, VIOLATION_NO_VEST, VIOLATION_NO_HELMET_VEST,
)

DEBUG_DIR = os.path.join(os.path.dirname(__file__), "debug_frames")
os.makedirs(DEBUG_DIR, exist_ok=True)

COLORS = {
    'person': (255, 0, 0),
    'helmet': (0, 255, 0),
    'no_helmet': (0, 165, 255),
    'vest': (0, 255, 255),
    'no_vest': (0, 0, 255),
    'head_region': (255, 128, 0),
    'torso_region': (0, 255, 128),
}


def draw_raw_detections(frame, detections, model):
    """Draw ALL raw YOLO detections with labels and confidence scores."""
    overlay = frame.copy()
    font = cv2.FONT_HERSHEY_SIMPLEX

    for class_id, conf, bbox in detections:
        class_name = get_class_name_direct(model, class_id)
        x1, y1, x2, y2 = [int(v) for v in bbox]

        if is_person_class(class_name):
            color = COLORS['person']
            label = f"person {conf:.2f}"
        elif is_helmet_class(class_name):
            color = COLORS['helmet']
            label = f"helmet({class_name}) {conf:.2f}"
        elif is_no_helmet_class(class_name):
            color = COLORS['no_helmet']
            label = f"no_helmet({class_name}) {conf:.2f}"
        elif is_vest_class(class_name):
            color = COLORS['vest']
            label = f"vest({class_name}) {conf:.2f}"
        elif is_no_vest_class(class_name):
            color = COLORS['no_vest']
            label = f"no_vest({class_name}) {conf:.2f}"
        else:
            color = (128, 128, 128)
            label = f"{class_name} {conf:.2f}"

        cv2.rectangle(overlay, (x1, y1), (x2, y2), color, 2)
        (tw, th), _ = cv2.getTextSize(label, font, 0.4, 1)
        cv2.rectangle(overlay, (x1, y1 - th - 4), (x1 + tw + 4, y1), color, -1)
        cv2.putText(overlay, label, (x1 + 2, y1 - 2), font, 0.4, (255, 255, 255), 1, cv2.LINE_AA)

    return overlay


def get_class_name_direct(model, class_id):
    """Get class name directly from model.names."""
    if hasattr(model, 'names'):
        return model.names.get(class_id, f"class_{class_id}")
    # ONNX fallback
    names = {0: 'person'}
    return names.get(class_id, f"class_{class_id}")


def is_person_class(class_name):
    return class_name == 'person'


def is_helmet_class(class_name):
    return class_name in ('hat',)


def is_no_helmet_class(class_name):
    return class_name in ('nohat',)


def is_vest_class(class_name):
    return class_name in ('vest',)


def is_no_vest_class(class_name):
    return class_name in ('novest',)


def debug_frame(model, frame, frame_number, inference_size):
    """Process one frame with full debug output."""
    h_orig, w_orig = frame.shape[:2]
    print(f"\n{'='*70}")
    print(f"FRAME {frame_number} | {w_orig}x{h_orig}")
    print(f"Model path: {MODEL_PATH}")
    print(f"Inference size: {inference_size}")
    print(f"Person conf threshold: {CONF_THRESHOLD}")
    print(f"PPE conf threshold: {PPE_CONF_THRESHOLD}")
    print(f"{'='*70}")

    # Step 1: Run raw inference with very low threshold
    print(f"\n--- STEP 1: RAW YOLO DETECTIONS (conf >= 0.1) ---")
    from detect import run_inference, _letterbox_resize, get_class_name, is_person, is_helmet, is_no_helmet, is_vest, is_no_vest, MODEL_PPE_CLASSES

    padded, scale, pad = _letterbox_resize(frame, inference_size)
    detections = run_inference(model, padded, conf=0.1)

    if not detections:
        print("  NO DETECTIONS at conf >= 0.1")
        return frame

    raw_frame = draw_raw_detections(frame.copy(), detections, model)

    # Step 2: Show EVERY raw detection
    print(f"\n  {'class_id':<10} {'class_name':<20} {'confidence':<12} {'bbox':<40}")
    print(f"  {'-'*82}")
    for class_id, conf, bbox in detections:
        class_name = get_class_name(model, class_id)
        x1, y1, x2, y2 = [f"{v:.1f}" for v in bbox]
        print(f"  {class_id:<10} {class_name:<20} {conf:<12.4f} [{x1}, {y1}, {x2}, {y2}]")

    # Step 3: Categorize by class with thresholds
    print(f"\n--- STEP 2: CATEGORIZED DETECTIONS (filtered by class thresholds) ---")
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
            person_boxes.append(orig_bbox)
            print(f"  PERSON: conf={conf:.4f} (threshold={CONF_THRESHOLD}) {'ACCEPTED' if conf >= CONF_THRESHOLD else 'REJECTED'}")
        elif is_helmet(class_id, class_name):
            helmet_boxes.append(orig_bbox)
            print(f"  HELMET({class_name}): conf={conf:.4f} (threshold={PPE_CONF_THRESHOLD}) {'ACCEPTED' if conf >= PPE_CONF_THRESHOLD else 'REJECTED'}")
        elif is_no_helmet(class_id, class_name):
            no_helmet_boxes.append(orig_bbox)
            print(f"  NO_HELMET({class_name}): conf={conf:.4f} (threshold={PPE_CONF_THRESHOLD}) {'ACCEPTED' if conf >= PPE_CONF_THRESHOLD else 'REJECTED'}")
        elif is_vest(class_id, class_name):
            vest_boxes.append(orig_bbox)
            print(f"  VEST({class_name}): conf={conf:.4f} (threshold={PPE_CONF_THRESHOLD}) {'ACCEPTED' if conf >= PPE_CONF_THRESHOLD else 'REJECTED'}")
        elif is_no_vest(class_id, class_name):
            no_vest_boxes.append(orig_bbox)
            print(f"  NO_VEST({class_name}): conf={conf:.4f} (threshold={PPE_CONF_THRESHOLD}) {'ACCEPTED' if conf >= PPE_CONF_THRESHOLD else 'REJECTED'}")

    print(f"\n  Summary: {len(person_boxes)} persons, {len(helmet_boxes)} helmets, "
          f"{len(no_helmet_boxes)} no-helmets, {len(vest_boxes)} vests, {len(no_vest_boxes)} no-vests")

    # Step 4: Per-person association
    print(f"\n--- STEP 3: PER-PERSON PPE ASSOCIATION (v3) ---")

    has_no_helmet_class = MODEL_PPE_CLASSES and len(MODEL_PPE_CLASSES.get('no_helmet', set())) > 0
    has_no_vest_class = MODEL_PPE_CLASSES and len(MODEL_PPE_CLASSES.get('no_vest', set())) > 0
    has_helmet_class = MODEL_PPE_CLASSES and len(MODEL_PPE_CLASSES.get('helmet', set())) > 0
    has_vest_class = MODEL_PPE_CLASSES and len(MODEL_PPE_CLASSES.get('vest', set())) > 0
    has_ppe_capability = has_helmet_class or has_no_helmet_class or has_vest_class or has_no_vest_class

    if not has_ppe_capability:
        print("  ⚠️  MODEL HAS NO PPE CLASSES - all persons = No Helmet & No Vest")
        print("  Use ppe_model.pt instead of yolov8n.onnx")

    workers = associate_ppe_with_workers_v3(
        person_boxes, helmet_boxes, no_helmet_boxes, vest_boxes, no_vest_boxes,
        frame_number,
        has_negative_classes=has_no_helmet_class or has_no_vest_class,
        has_ppe_capability=has_ppe_capability,
    )

    # Step 5: Per-worker detail with region info
    print(f"\n--- STEP 4: WORKER DETAIL ---")
    for i, w in enumerate(workers):
        person_box = w['bbox']
        head_region = w.get('head_region', [0, 0, 0, 0])
        torso_region = w.get('torso_region', [0, 0, 0, 0])

        print(f"\n  Worker #{w['worker_id']}:")
        print(f"    Person box:        ({person_box[0]:.0f}, {person_box[1]:.0f}) -> ({person_box[2]:.0f}, {person_box[3]:.0f})")
        print(f"    Head region:       ({head_region[0]:.0f}, {head_region[1]:.0f}) -> ({head_region[2]:.0f}, {head_region[3]:.0f})")
        print(f"    Torso region:      ({torso_region[0]:.0f}, {torso_region[1]:.0f}) -> ({torso_region[2]:.0f}, {torso_region[3]:.0f})")

        # Show which PPE boxes matched this worker
        person_cx, person_cy = _get_bbox_center(person_box)
        print(f"    Person center:     ({person_cx:.0f}, {person_cy:.0f})")

        # Check each helmet box against this person's head region
        for j, hb in enumerate(helmet_boxes):
            from utils.violation_detector import ppe_matches_person_region
            hc_x, hc_y = _get_bbox_center(hb)
            match = ppe_matches_person_region(hb, head_region)
            print(f"    Helmet box {j}: center=({hc_x:.0f},{hc_y:.0f}) in_head_region={match}")

        for j, nb in enumerate(no_helmet_boxes):
            nc_x, nc_y = _get_bbox_center(nb)
            match = ppe_matches_person_region(nb, head_region)
            print(f"    No-Helmet box {j}: center=({nc_x:.0f},{nc_y:.0f}) in_head_region={match}")

        for j, vb in enumerate(vest_boxes):
            vc_x, vc_y = _get_bbox_center(vb)
            match = ppe_matches_person_region(vb, torso_region)
            print(f"    Vest box {j}: center=({vc_x:.0f},{vc_y:.0f}) in_torso_region={match}")

        for j, nvb in enumerate(no_vest_boxes):
            nvc_x, nvc_y = _get_bbox_center(nvb)
            match = ppe_matches_person_region(nvb, torso_region)
            print(f"    No-Vest box {j}: center=({nvc_x:.0f},{nvc_y:.0f}) in_torso_region={match}")

        print(f"    Helmet: {'YES' if w['has_helmet'] else 'NO'}")
        print(f"    Vest:   {'YES' if w['has_vest'] else 'NO'}")
        print(f"    Status: {w['label']}")

    # Step 6: Build debug visualization frame
    print(f"\n--- STEP 5: SAVING DEBUG FRAME ---")
    debug_img = frame.copy()

    # Draw ALL raw detections with thin boxes
    for class_id, conf, bbox in detections:
        class_name = get_class_name(model, class_id)
        x1, y1, x2, y2 = [int(v) for v in bbox]

        if is_person_class(class_name):
            cv2.rectangle(debug_img, (x1, y1), (x2, y2), (255, 0, 0), 1)
        elif is_helmet_class(class_name):
            cv2.rectangle(debug_img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        elif is_no_helmet_class(class_name):
            cv2.rectangle(debug_img, (x1, y1), (x2, y2), (0, 165, 255), 2)
        elif is_vest_class(class_name):
            cv2.rectangle(debug_img, (x1, y1), (x2, y2), (0, 255, 255), 2)
        elif is_no_vest_class(class_name):
            cv2.rectangle(debug_img, (x1, y1), (x2, y2), (0, 0, 255), 2)

    # Draw head and torso regions per worker
    for w in workers:
        if 'head_region' in w:
            hx1, hy1, hx2, hy2 = [int(v) for v in w['head_region']]
            cv2.rectangle(debug_img, (hx1, hy1), (hx2, hy2), COLORS['head_region'], 1)
        if 'torso_region' in w:
            tx1, ty1, tx2, ty2 = [int(v) for v in w['torso_region']]
            cv2.rectangle(debug_img, (tx1, ty1), (tx2, ty2), COLORS['torso_region'], 1)

    # Draw worker status labels
    from utils.frame_annotator import draw_worker_box
    for w in workers:
        draw_worker_box(debug_img, w)

    # Add summary overlay
    font = cv2.FONT_HERSHEY_SIMPLEX
    status_lines = [
        f"Model: {os.path.basename(MODEL_PATH)}",
        f"Frame: {frame_number}",
        f"Person conf: {CONF_THRESHOLD}  PPE conf: {PPE_CONF_THRESHOLD}",
        f"Persons: {len(person_boxes)}  Helmets: {len(helmet_boxes)}  Vests: {len(vest_boxes)}",
        f"No-Helmets: {len(no_helmet_boxes)}  No-Vests: {len(no_vest_boxes)}",
    ]

    overlay = debug_img.copy()
    y_start = 20
    for j, line in enumerate(status_lines):
        y = y_start + j * 22
        cv2.putText(overlay, line, (10, y), font, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.addWeighted(overlay, 0.7, debug_img, 0.3, 0, debug_img)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    debug_path = os.path.join(DEBUG_DIR, f"debug_frame_{frame_number}_{timestamp}.jpg")
    cv2.imwrite(debug_path, debug_img)
    print(f"  Debug frame saved: {debug_path}")
    print(f"  Open this file to visually verify detections.")

    test_frame_path = os.path.join(DEBUG_DIR, f"frame_{frame_number}_raw.jpg")
    cv2.imwrite(test_frame_path, frame)
    print(f"  Original frame saved: {test_frame_path}")

    return debug_img


def main():
    parser = argparse.ArgumentParser(description="PPE Detection Debug Tool")
    parser.add_argument("--video", required=True, help="Path to video file")
    parser.add_argument("--frame", type=int, default=1, help="Frame number to debug (1-indexed)")
    parser.add_argument("--output", default=None, help="Output image path for debug frame")
    args = parser.parse_args()

    if not os.path.exists(args.video):
        print(f"ERROR: Video not found: {args.video}")
        sys.exit(1)

    print(f"Loading model: {MODEL_PATH}")
    model = load_model(MODEL_PATH)
    print(f"Model loaded successfully")

    # Show class names from model
    if hasattr(model, 'names'):
        print(f"\nModel class names:")
        for cid, cname in model.names.items():
            print(f"  {cid}: {cname}")
    else:
        print(f"\nUsing ONNX model (COCO classes)")

    # Check PPE capability
    from detect import MODEL_PPE_CLASSES
    if MODEL_PPE_CLASSES:
        has_ppe = any(len(v) > 0 for k, v in MODEL_PPE_CLASSES.items() if k != 'person')
        if has_ppe:
            print(f"\nPPE class mapping:")
            for k, v in MODEL_PPE_CLASSES.items():
                print(f"  {k}: {v}")
        else:
            print(f"\n⚠️  WARNING: Model has NO PPE classes!")
            print(f"  All persons will be classified as 'No Helmet & No Vest'")
            print(f"  Use model/ppe_model.pt instead.")

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(f"ERROR: Could not open video: {args.video}")
        sys.exit(1)

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"\nVideo: {width}x{height} @ {fps:.1f}fps, {total_frames} frames")
    print(f"Debug frame: {args.frame}")

    # Seek to target frame
    cap.set(cv2.CAP_PROP_POS_FRAMES, args.frame - 1)
    ret, frame = cap.read()
    if not ret:
        print(f"ERROR: Could not read frame {args.frame}")
        cap.release()
        sys.exit(1)

    cap.release()

    print(f"\nProcessing frame {args.frame}...")
    debug_img = debug_frame(model, frame, args.frame, INFERENCE_SIZE)

    if args.output:
        cv2.imwrite(args.output, debug_img)
        print(f"\nOutput saved: {args.output}")

    print(f"\n{'='*70}")
    print(f"DEBUG COMPLETE")
    print(f"Debug frames directory: {DEBUG_DIR}")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()
