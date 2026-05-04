# ============================================================
# SafeSite AI — Frame Annotator
# File: ai-service/utils/frame_annotator.py
#
# Draws coloured bounding boxes + labels on video frames
# so you can see exactly what the AI detected.
#
# This is kept separate from the main detect.py so you can
# easily change how the output looks without touching the logic.
# ============================================================

import cv2
import numpy as np


def draw_worker_box(frame: np.ndarray, worker: dict) -> np.ndarray:
    """
    Draw a bounding box + violation label for ONE worker on a frame.

    - Compliant worker  → GREEN box
    - No Helmet         → ORANGE box
    - No Vest           → YELLOW box
    - No Helmet & Vest  → RED box

    Args:
        frame:  The OpenCV image (numpy array, BGR format)
        worker: A worker dict from violation_detector.associate_ppe_with_workers()

    Returns:
        The frame with the box drawn on it (modified in place)
    """
    x1, y1, x2, y2 = worker["bbox"]
    color  = worker["color"]   # BGR tuple e.g. (0, 255, 0)
    label  = worker["label"]   # e.g. "No Helmet"

    # ── Bounding box ──────────────────────────────────────────
    thickness = 2
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)

    # ── Label background ──────────────────────────────────────
    # We draw a filled rectangle behind the text so it's readable
    font       = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.55
    font_thick = 1
    (text_w, text_h), baseline = cv2.getTextSize(label, font, font_scale, font_thick)

    # Position label at the top of the bounding box
    label_x1 = x1
    label_y1 = max(0, y1 - text_h - 8)   # don't go above the image
    label_x2 = x1 + text_w + 8
    label_y2 = y1

    cv2.rectangle(frame, (label_x1, label_y1), (label_x2, label_y2), color, -1)  # filled

    # ── Label text ────────────────────────────────────────────
    # Use white text for dark backgrounds, black for bright ones
    # (Simple heuristic: use white always — works fine in practice)
    text_color = (255, 255, 255)
    cv2.putText(
        frame,
        label,
        (label_x1 + 4, label_y2 - 4),
        font, font_scale, text_color, font_thick,
        cv2.LINE_AA
    )

    # ── Worker ID (small number in corner of box) ─────────────
    worker_id_text = f"#{worker['worker_id']}"
    cv2.putText(
        frame,
        worker_id_text,
        (x1 + 4, y2 - 6),
        font, 0.4, color, 1, cv2.LINE_AA
    )

    return frame


def annotate_frame(frame: np.ndarray, workers: list, frame_number: int = 0) -> np.ndarray:
    """
    Draw ALL worker bounding boxes + a summary overlay on a frame.

    Args:
        frame:        The raw video frame (numpy array)
        workers:      List of worker dicts from violation_detector
        frame_number: Current frame number (shown in corner)

    Returns:
        Annotated frame
    """
    # Draw each worker's box
    for worker in workers:
        draw_worker_box(frame, worker)

    # ── Summary overlay (top-left corner) ────────────────────
    total     = len(workers)
    violations = sum(1 for w in workers if w["severity"] != "safe")
    compliant  = total - violations

    summary_lines = [
        f"Frame: {frame_number}",
        f"Workers: {total}",
        f"Compliant: {compliant}",
        f"Violations: {violations}",
    ]

    overlay_x = 10
    overlay_y = 20
    font       = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.5
    line_height = 20

    # Draw semi-transparent background rectangle
    box_h = len(summary_lines) * line_height + 10
    box_w = 160
    overlay = frame.copy()
    cv2.rectangle(overlay, (overlay_x - 5, overlay_y - 15),
                  (overlay_x + box_w, overlay_y + box_h), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.5, frame, 0.5, 0, frame)

    for j, line in enumerate(summary_lines):
        y = overlay_y + j * line_height
        color = (255, 255, 255)
        if "Violations" in line and violations > 0:
            color = (0, 0, 255)  # Red for violations
        elif "Compliant" in line:
            color = (0, 255, 0)  # Green for compliant
        cv2.putText(frame, line, (overlay_x, y), font, font_scale, color, 1, cv2.LINE_AA)

    return frame


def save_annotated_frame(frame: np.ndarray, output_path: str) -> bool:
    """
    Save a single annotated frame as a JPEG image.
    Returns True if saved successfully.
    """
    return cv2.imwrite(output_path, frame)