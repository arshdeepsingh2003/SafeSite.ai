# ============================================================
# SafeSite AI — Violation Detector
# File: ai-service/utils/violation_detector.py
#
# This module contains all the LOGIC for deciding:
#   "Given the objects detected in a frame, which workers
#    have safety violations, and how severe are they?"
#
# It is kept separate from detect.py so the logic is easy
# to read, test, and change without touching the main script.
# ============================================================

# ── Violation type constants ──────────────────────────────────
VIOLATION_NO_HELMET      = "no_helmet"
VIOLATION_NO_VEST        = "no_vest"
VIOLATION_NO_HELMET_VEST = "no_helmet_and_no_vest"
VIOLATION_NONE           = "compliant"

# ── Severity constants ────────────────────────────────────────
SEVERITY_HIGH   = "high"    # No helmet AND no vest — most dangerous
SEVERITY_MEDIUM = "medium"  # Either no helmet OR no vest
SEVERITY_LOW    = "low"     # Minor issue (future use)
SEVERITY_SAFE   = "safe"    # Fully compliant — no violation

# ── YOLO class names we care about ───────────────────────────
# These are the class IDs in the standard COCO model (yolov8n.pt)
# We will use these to filter detections.
PERSON_CLASS_ID = 0         # "person" in COCO dataset

# For the safety-specific model (custom trained):
# These class IDs will be different. We handle both below.
# These are now used as fallback keywords only
HELMET_KEYWORDS    = {"helmet", "hard hat", "hardhat", "safety helmet", "hat"}
VEST_KEYWORDS      = {"vest", "safety vest", "high-vis", "hi-vis", "reflective vest"}


def get_ppe_class_indices(model_names: dict) -> dict:
    """
    Dynamically identify helmet and vest class indices from model's class names.
    Returns dict with 'helmet', 'no_helmet', 'vest', 'no_vest', 'person' keys.

    For models like yolo11m_safety.pt, the classes are:
    - 'hat' = person wearing helmet (positive)
    - 'nohat' = person NOT wearing helmet (violation)
    - 'novest' = person NOT wearing vest (violation)
    - 'person' = person
    - 'vest' = person wearing vest (positive)

    This function:
    1. Takes the model.names dict (class_id -> class_name mapping)
    2. Checks each class name against helmet/vest keywords
    3. Returns the class IDs that match

    This ensures we use the ACTUAL class names from the loaded model,
    not hardcoded assumptions.
    """
    helmet_indices = set()      # Classes that represent wearing helmet
    no_helmet_indices = set()   # Classes that represent NOT wearing helmet
    vest_indices = set()        # Classes that represent wearing vest
    no_vest_indices = set()     # Classes that represent NOT wearing vest
    person_indices = set()

    for class_id, class_name in model_names.items():
        class_name_lower = class_name.lower()

        # Check for person
        if class_name_lower == 'person':
            person_indices.add(class_id)

        # Check for helmet-related classes (wearing helmet)
        elif any(kw in class_name_lower for kw in ['hat', 'helmet', 'hardhat']):
            if 'no' in class_name_lower or 'missing' in class_name_lower:
                no_helmet_indices.add(class_id)
            else:
                helmet_indices.add(class_id)

        # Check for vest-related classes (wearing vest)
        elif any(kw in class_name_lower for kw in VEST_KEYWORDS):
            if 'no' in class_name_lower or 'missing' in class_name_lower:
                no_vest_indices.add(class_id)
            else:
                vest_indices.add(class_id)

        # Handle special case: 'nohat' = not wearing helmet
        elif 'nohat' in class_name_lower or 'no_hat' in class_name_lower:
            no_helmet_indices.add(class_id)

        # Handle special case: 'novest' = not wearing vest
        elif 'novest' in class_name_lower or 'no_vest' in class_name_lower:
            no_vest_indices.add(class_id)

    return {
        'helmet': helmet_indices,
        'no_helmet': no_helmet_indices,
        'vest': vest_indices,
        'no_vest': no_vest_indices,
        'person': person_indices if person_indices else {0}  # Default to 0 if not found
    }


def get_violation(has_helmet: bool, has_vest: bool) -> dict:
    """
    Given whether a worker has a helmet and/or vest,
    return their violation type and severity level.

    Returns:
        dict with keys: violation, severity, color (for bounding box)
    """
    if has_helmet and has_vest:
        return {
            "violation": VIOLATION_NONE,
            "severity": SEVERITY_SAFE,
            "label": "Compliant",
            "color": (0, 255, 0),        # Green bounding box
            "color_hex": "#22c55e",
        }
    elif not has_helmet and not has_vest:
        return {
            "violation": VIOLATION_NO_HELMET_VEST,
            "severity": SEVERITY_HIGH,
            "label": "No Helmet & No Vest",
            "color": (0, 0, 255),        # Red bounding box  (BGR for OpenCV)
            "color_hex": "#ef4444",
        }
    elif not has_helmet:
        return {
            "violation": VIOLATION_NO_HELMET,
            "severity": SEVERITY_MEDIUM,
            "label": "No Helmet",
            "color": (0, 165, 255),      # Orange bounding box
            "color_hex": "#f97316",
        }
    else:  # not has_vest
        return {
            "violation": VIOLATION_NO_VEST,
            "severity": SEVERITY_MEDIUM,
            "label": "No Vest",
            "color": (0, 215, 255),      # Yellow bounding box
            "color_hex": "#eab308",
        }


def boxes_overlap(box1: list, box2: list, threshold: float = 0.3) -> bool:
    """
    Check if two bounding boxes overlap enough to be associated.
    We use this to figure out: "Is this helmet near this person?"

    box format: [x1, y1, x2, y2]
    threshold: how much overlap is needed (0.3 = 30% intersection over union)

    How it works:
    - Find the overlapping rectangle between box1 and box2
    - Calculate what % of the smaller box is covered
    - If > threshold, they overlap enough
    """
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])

    # No overlap if the rectangles don't intersect
    if x2 <= x1 or y2 <= y1:
        return False

    intersection = (x2 - x1) * (y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    smaller_area = min(area1, area2)

    if smaller_area == 0:
        return False

    return (intersection / smaller_area) >= threshold


def helmet_is_above_person(person_box: list, helmet_box: list) -> bool:
    """
    A helmet should be in the TOP HALF of a person's bounding box
    (i.e., on their head, not at their feet).
    This prevents false associations.
    """
    person_mid_y = (person_box[1] + person_box[3]) / 2
    helmet_center_y = (helmet_box[1] + helmet_box[3]) / 2
    return helmet_center_y < person_mid_y  # Helmet must be above person's midpoint


def vest_is_in_torso(person_box: list, vest_box: list) -> bool:
    """
    A safety vest should overlap with the middle portion of a person.
    """
    return boxes_overlap(person_box, vest_box, threshold=0.2)


def associate_ppe_with_workers(
    person_boxes: list,
    helmet_boxes: list,
    vest_boxes: list,
    frame_number: int = None,
) -> list:
    """
    The MAIN LOGIC FUNCTION.

    Given lists of detected bounding boxes for:
      - persons
      - helmets
      - safety vests

    Determine for each person:
      - Do they have a helmet? (is there a helmet box near their head?)
      - Do they have a vest?   (is there a vest box near their torso?)
      - What is their violation type and severity?

    PPE detection is PER PERSON (not global) - each person is evaluated
    independently based on whether PPE is detected near them.

    Returns a list of worker dicts, one per detected person.

    Example output:
    [
        {
            "worker_id": 1,
            "has_helmet": True,
            "has_vest": False,
            "violation": "no_vest",
            "severity": "medium",
            "label": "No Vest",
            "bbox": [120, 80, 240, 420],
            "color": (0, 215, 255),
            "color_hex": "#eab308"
        },
        ...
    ]
    """
    workers = []

    if frame_number:
        print(f"   Frame {frame_number}: Processing {len(person_boxes)} persons for PPE")

    for i, person_box in enumerate(person_boxes):
        # ── Does this person have a helmet nearby? ──
        has_helmet = False
        for h_box in helmet_boxes:
            if boxes_overlap(person_box, h_box) and helmet_is_above_person(person_box, h_box):
                has_helmet = True
                if frame_number:
                    print(f"      Person {i+1}: Helmet detected nearby")
                break  # Found one — no need to check more

        # ── Does this person have a vest nearby? ──
        has_vest = False
        for v_box in vest_boxes:
            if vest_is_in_torso(person_box, v_box):
                has_vest = True
                if frame_number:
                    print(f"      Person {i+1}: Vest detected nearby")
                break

        # ── Determine violation ──
        violation_info = get_violation(has_helmet, has_vest)

        if frame_number and not has_helmet and not has_vest:
            print(f"      Person {i+1}: VIOLATION - {violation_info['label']}")

        workers.append({
            "worker_id": i + 1,
            "has_helmet": has_helmet,
            "has_vest": has_vest,
            "violation": violation_info["violation"],
            "severity": violation_info["severity"],
            "label": violation_info["label"],
            "bbox": [int(x) for x in person_box],
            "color": violation_info["color"],
            "color_hex": violation_info["color_hex"],
        })

    return workers


def associate_ppe_with_workers_v2(
    person_boxes: list,
    helmet_boxes: list,      # Wearing helmet (positive class like 'hat')
    no_helmet_boxes: list,    # NOT wearing helmet (violation class like 'nohat')
    vest_boxes: list,         # Wearing vest (positive class like 'vest')
    no_vest_boxes: list,      # NOT wearing vest (violation class like 'novest')
    frame_number: int = None,
) -> list:
    """
    PPE association for models that have separate classes for
    wearing PPE vs NOT wearing PPE.

    For example, yolo11m_safety.pt has:
    - 'hat' = person wearing helmet (positive)
    - 'nohat' = person NOT wearing helmet (violation)
    - 'vest' = person wearing vest (positive)
    - 'novest' = person NOT wearing vest (violation)

    For each person detected:
    1. Check if there's a 'nohat' box overlapping with them -> no helmet
    2. Otherwise check if there's a 'hat' box overlapping -> has helmet
    3. Similarly for vest/novest

    PPE detection is PER PERSON - each person is evaluated independently.
    """
    workers = []

    if frame_number:
        print(f"   Frame {frame_number}: Processing {len(person_boxes)} persons for PPE")

    for i, person_box in enumerate(person_boxes):
        # ── Check helmet status ──
        # Default: assume COMPLIANT (has helmet) to avoid false violations
        has_helmet = True
        has_no_helmet_violation = False

        # First check if there's a 'nohat' box near this person (explicit violation)
        for no_helmet_box in no_helmet_boxes:
            if boxes_overlap(person_box, no_helmet_box, threshold=0.1):
                has_no_helmet_violation = True
                break

        if has_no_helmet_violation:
            has_helmet = False  # Confirmed violation
        else:
            # No violation detected - check if there's a 'hat' box (positive confirmation)
            found_helmet = False
            for helmet_box in helmet_boxes:
                if boxes_overlap(person_box, helmet_box, threshold=0.1):
                    found_helmet = True
                    break
            # If no helmet detection at all (neither nohat nor hat), assume compliant
            # This prevents false violations from missed detections
            if found_helmet:
                has_helmet = True
            # else: keep has_helmet = True (assume compliant when no detection)

        # ── Check vest status ──
        # Default: assume COMPLIANT (has vest) to avoid false violations
        has_vest = True
        has_no_vest_violation = False

        # First check if there's a 'novest' box near this person (explicit violation)
        for no_vest_box in no_vest_boxes:
            if boxes_overlap(person_box, no_vest_box, threshold=0.1):
                has_no_vest_violation = True
                break

        if has_no_vest_violation:
            has_vest = False  # Confirmed violation
        else:
            # No violation detected - check if there's a 'vest' box (positive confirmation)
            found_vest = False
            for vest_box in vest_boxes:
                if boxes_overlap(person_box, vest_box, threshold=0.1):
                    found_vest = True
                    break
            # If no vest detection at all, assume compliant
            if found_vest:
                has_vest = True
            # else: keep has_vest = True (assume compliant when no detection)

        # ── Determine violation ──
        violation_info = get_violation(has_helmet, has_vest)

        if frame_number:
            status = "COMPLIANT" if violation_info['violation'] == VIOLATION_NONE else f"VIOLATION: {violation_info['label']}"
            print(f"      Person {i+1}: Helmet={has_helmet}, Vest={has_vest} -> {status}")

        workers.append({
            "worker_id": i + 1,
            "has_helmet": has_helmet,
            "has_vest": has_vest,
            "violation": violation_info["violation"],
            "severity": violation_info["severity"],
            "label": violation_info["label"],
            "bbox": [int(x) for x in person_box],
            "color": violation_info["color"],
            "color_hex": violation_info["color_hex"],
        })

    return workers


# ── Region-Based PPE Matching (v3) ──────────────────────────

def get_head_region(person_box, expand_ratio=0.1):
    """
    Extract head region from person bounding box.
    Head region = top 25% of box height, slightly widened for side-angle views.
    """
    x1, y1, x2, y2 = person_box
    height = y2 - y1
    width = x2 - x1
    head_bottom = y1 + height * 0.25
    expand = width * expand_ratio
    return [x1 - expand, y1, x2 + expand, head_bottom]


def get_torso_region(person_box):
    """
    Extract torso region from person bounding box.
    Torso region = middle 50% of box height (20%-70%).
    Covers the chest/torso area where a safety vest would be worn.
    Flexible for sitting/crouching postures.
    """
    x1, y1, x2, y2 = person_box
    height = y2 - y1
    width = x2 - x1
    torso_top = y1 + height * 0.2
    torso_bottom = y1 + height * 0.7
    expand = width * 0.05
    return [x1 - expand, torso_top, x2 + expand, torso_bottom]


def get_bbox_center(bbox):
    """Return (cx, cy) center point of a bounding box."""
    return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)


def point_in_box(px, py, box):
    """Check if point (px, py) is inside box [x1, y1, x2, y2]."""
    x1, y1, x2, y2 = box
    tol = 1e-6
    return (x1 - tol) <= px <= (x2 + tol) and (y1 - tol) <= py <= (y2 + tol)


def boxes_iou(box1, box2):
    """
    Calculate Intersection over Union between two bounding boxes.
    box format: [x1, y1, x2, y2]
    """
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])

    if x2 <= x1 or y2 <= y1:
        return 0.0

    intersection = (x2 - x1) * (y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = area1 + area2 - intersection

    if union <= 0:
        return 0.0

    return intersection / union


def ppe_matches_person_region(ppe_box, region_box, iou_threshold=0.05):
    """
    Check if a PPE detection matches a person's body region.
    Uses TWO criteria for robustness:
    1. Centroid check: PPE box center is inside the region
    2. IoU check: PPE box overlaps with the region

    Two criteria ensures matching works for:
    - Small PPE boxes (hat) whose centroid falls in head region
    - Partial occlusions where only part of PPE is visible
    - Side/crouching angles where alignment is imperfect
    """
    cx, cy = get_bbox_center(ppe_box)

    # Criterion 1: centroid inside region
    if point_in_box(cx, cy, region_box):
        return True

    # Criterion 2: IoU overlap
    iou = boxes_iou(ppe_box, region_box)
    if iou >= iou_threshold:
        return True

    return False


def associate_ppe_with_workers_v3(
    person_boxes, helmet_boxes, no_helmet_boxes,
    vest_boxes, no_vest_boxes, frame_number=None,
    has_negative_classes=False, has_ppe_capability=True,
):
    """
    Person-centric PPE matching with region-based validation.

    For each detected person:
    1. Compute head region (top 25% of person box)
    2. Compute torso region (middle 50% of person box)
    3. Match helmet: centroid inside head region OR IoU overlap
    4. Match vest: centroid inside torso region OR IoU overlap

    Logic per person:
    - If model has negative classes (nohat/novest):
        no_helmet in head_region  -> has_helmet = False
        helmet in head_region     -> has_helmet = True
        no detection              -> has_helmet = True  (default compliant)
    - If model has only positive classes (hat/vest):
        helmet in head_region     -> has_helmet = True
        no detection              -> has_helmet = False
    - If model has NO PPE classes (COCO):
        has_helmet = False  (model can't detect PPE)

    Same logic applies for vest with torso_region.

    This ensures:
    - Helmet only  -> "No Vest"
    - Vest only    -> "No Helmet"
    - Both         -> "Compliant"
    - None         -> "No Helmet & No Vest"
    """
    workers = []

    if frame_number:
        print(f"   Frame {frame_number}: {len(person_boxes)} persons detected")
        if has_ppe_capability:
            print(f"      Helmets: {len(helmet_boxes)} pos + {len(no_helmet_boxes)} neg | "
                  f"Vests: {len(vest_boxes)} pos + {len(no_vest_boxes)} neg")
        else:
            print(f"      WARNING: No PPE classes in model - all persons classified as violations")

    for i, person_box in enumerate(person_boxes):
        head_region = get_head_region(person_box)
        torso_region = get_torso_region(person_box)

        # ── Determine helmet status ──────────────────────────
        if not has_ppe_capability:
            has_helmet = False  # Model cannot detect helmets
        else:
            no_helmet_in_head = any(
                ppe_matches_person_region(b, head_region) for b in no_helmet_boxes
            )
            helmet_in_head = any(
                ppe_matches_person_region(b, head_region) for b in helmet_boxes
            )

            if no_helmet_in_head:
                has_helmet = False
            elif helmet_in_head:
                has_helmet = True
            elif has_negative_classes:
                # Model has explicit negative classes but neither fired
                # Assume compliant to avoid false positives from missed detections
                has_helmet = True
            else:
                # Only positive classes exist and none detected
                has_helmet = False

        # ── Determine vest status ────────────────────────────
        if not has_ppe_capability:
            has_vest = False  # Model cannot detect vests
        else:
            no_vest_in_torso = any(
                ppe_matches_person_region(b, torso_region) for b in no_vest_boxes
            )
            vest_in_torso = any(
                ppe_matches_person_region(b, torso_region) for b in vest_boxes
            )

            if no_vest_in_torso:
                has_vest = False
            elif vest_in_torso:
                has_vest = True
            elif has_negative_classes:
                has_vest = True
            else:
                has_vest = False

        violation_info = get_violation(has_helmet, has_vest)

        if frame_number:
            h = 'Y' if has_helmet else 'N'
            v = 'Y' if has_vest else 'N'
            print(f"      Person {i+1}: Helmet={h} Vest={v} -> {violation_info['label']}")

        workers.append({
            "worker_id": i + 1,
            "has_helmet": has_helmet,
            "has_vest": has_vest,
            "violation": violation_info["violation"],
            "severity": violation_info["severity"],
            "label": violation_info["label"],
            "bbox": [int(x) for x in person_box],
            "color": violation_info["color"],
            "color_hex": violation_info["color_hex"],
            "head_region": [int(x) for x in head_region],
            "torso_region": [int(x) for x in torso_region],
        })

    return workers


def summarize_detections(workers: list) -> dict:
    """
    Count up the results from a list of worker detections.
    Used for reporting and analytics.
    """
    total     = len(workers)
    compliant = sum(1 for w in workers if w["severity"] == SEVERITY_SAFE)
    no_helmet = sum(1 for w in workers if w["violation"] == VIOLATION_NO_HELMET)
    no_vest   = sum(1 for w in workers if w["violation"] == VIOLATION_NO_VEST)
    both      = sum(1 for w in workers if w["violation"] == VIOLATION_NO_HELMET_VEST)
    violations = total - compliant

    compliance_rate = round((compliant / total * 100), 1) if total > 0 else 0.0

    return {
        "total_workers": total,
        "compliant": compliant,
        "violations": violations,
        "no_helmet": no_helmet,
        "no_vest": no_vest,
        "no_helmet_and_no_vest": both,
        "compliance_rate": compliance_rate,
    }