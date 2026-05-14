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

    Debug overlays (when available):
    - Head region (blue outline)
    - Torso region (green outline)
    - PPE status checklist per worker

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
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

    # ── Head and Torso region overlays (debug) ──────────────
    if "head_region" in worker:
        hx1, hy1, hx2, hy2 = worker["head_region"]
        cv2.rectangle(frame, (int(hx1), int(hy1)), (int(hx2), int(hy2)), (255, 128, 0), 1)

    if "torso_region" in worker:
        tx1, ty1, tx2, ty2 = worker["torso_region"]
        cv2.rectangle(frame, (int(tx1), int(ty1)), (int(tx2), int(ty2)), (0, 255, 128), 1)

    # ── Label background ──────────────────────────────────────
    font       = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.55
    font_thick = 1
    (text_w, text_h), baseline = cv2.getTextSize(label, font, font_scale, font_thick)

    label_x1 = x1
    label_y1 = max(0, y1 - text_h - 8)
    label_x2 = x1 + text_w + 8
    label_y2 = y1

    cv2.rectangle(frame, (label_x1, label_y1), (label_x2, label_y2), color, -1)

    # ── Label text ────────────────────────────────────────────
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

    # ── PPE Status Info Panel (right side of bbox) ──────────
    has_helmet = worker.get("has_helmet", False)
    has_vest = worker.get("has_vest", False)

    info_lines = [
        f"Worker #{worker['worker_id']}",
        f"Helmet: {'YES' if has_helmet else 'NO'}",
        f"Vest: {'YES' if has_vest else 'NO'}",
        f"Status: {label}",
    ]

    line_h = 14
    info_font_scale = 0.4
    info_font_thick = 1
    max_line_w = 0
    for line in info_lines:
        (tw, _), _ = cv2.getTextSize(line, font, info_font_scale, info_font_thick)
        max_line_w = max(max_line_w, tw)

    panel_w = max_line_w + 10
    panel_h = len(info_lines) * line_h + 6

    # Place panel to RIGHT of bbox; if near right edge, place to LEFT
    panel_x = x2 + 6
    if panel_x + panel_w > frame.shape[1] - 10:
        panel_x = max(4, x1 - panel_w - 6)

    panel_y = y1

    # Semi-transparent background
    overlay = frame.copy()
    cv2.rectangle(
        overlay,
        (panel_x, panel_y),
        (panel_x + panel_w, panel_y + panel_h),
        (0, 0, 0), -1
    )
    cv2.addWeighted(overlay, 0.35, frame, 0.65, 0, frame)

    # Draw each line
    for j, line in enumerate(info_lines):
        y_pos = panel_y + j * line_h + 11
        x_pos = panel_x + 4

        if "Worker" in line:
            cv2.putText(frame, line, (x_pos, y_pos), font, info_font_scale, color, info_font_thick, cv2.LINE_AA)
        elif "Helmet" in line:
            c = (0, 255, 0) if has_helmet else (0, 0, 255)
            cv2.putText(frame, line, (x_pos, y_pos), font, info_font_scale, c, info_font_thick, cv2.LINE_AA)
        elif "Vest" in line:
            c = (0, 255, 0) if has_vest else (0, 0, 255)
            cv2.putText(frame, line, (x_pos, y_pos), font, info_font_scale, c, info_font_thick, cv2.LINE_AA)
        elif "Status" in line:
            status_color = color
            cv2.putText(frame, line, (x_pos, y_pos), font, info_font_scale, status_color, info_font_thick, cv2.LINE_AA)

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
    helmet_count = sum(1 for w in workers if w.get("has_helmet"))
    vest_count = sum(1 for w in workers if w.get("has_vest"))

    summary_lines = [
        f"Frame: {frame_number}",
        f"Workers: {total}",
        f"Helmets: {helmet_count}/{total}",
        f"Vests: {vest_count}/{total}",
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
    box_w = 170
    overlay = frame.copy()
    cv2.rectangle(overlay, (overlay_x - 5, overlay_y - 15),
                  (overlay_x + box_w, overlay_y + box_h), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.5, frame, 0.5, 0, frame)

    for j, line in enumerate(summary_lines):
        y = overlay_y + j * line_height
        color = (255, 255, 255)
        if "Violations" in line and violations > 0:
            color = (0, 0, 255)
        elif "Compliant" in line:
            color = (0, 255, 0)
        elif "Helmets" in line:
            color = (255, 128, 0)  # Orange for helmet count
        elif "Vests" in line:
            color = (0, 255, 128)  # Teal for vest count
        cv2.putText(frame, line, (overlay_x, y), font, font_scale, color, 1, cv2.LINE_AA)

    return frame


def save_annotated_frame(frame: np.ndarray, output_path: str) -> bool:
    """
    Save a single annotated frame as a JPEG image.
    Returns True if saved successfully.
    """
    return cv2.imwrite(output_path, frame)