# ============================================================
# SafeSite AI — AI Service Test Script
# File: ai-service/test_detection.py
#
# Run this BEFORE using a real video to verify:
#   1. YOLOv8 is installed and can load a model
#   2. The violation logic works correctly
#   3. OpenCV can read and write images
#
# Run with: python test_detection.py
# ============================================================

import sys
import numpy as np

print("=" * 55)
print("🧪 SafeSite AI — AI Service Tests")
print("=" * 55)

all_passed = True

# ── Test 1: Import checks ─────────────────────────────────────
print("\n📦 Test 1: Checking library imports...")
try:
    import cv2
    print(f"   ✅ OpenCV {cv2.__version__}")
except ImportError:
    print("   ❌ OpenCV not installed — run: pip install opencv-python")
    all_passed = False

try:
    import numpy as np
    print(f"   ✅ NumPy {np.__version__}")
except ImportError:
    print("   ❌ NumPy not installed — run: pip install numpy")
    all_passed = False

try:
    from ultralytics import YOLO
    print("   ✅ YOLOv8 (ultralytics)")
except ImportError:
    print("   ❌ YOLOv8 not installed — run: pip install ultralytics")
    all_passed = False

# ── Test 2: Violation logic ───────────────────────────────────
print("\n🧠 Test 2: Testing violation detection logic...")
try:
    from utils.violation_detector import get_violation, associate_ppe_with_workers, summarize_detections

    # Case 1: Both helmet and vest → Compliant
    result = get_violation(has_helmet=True, has_vest=True)
    assert result["severity"] == "safe", "Should be safe"
    assert result["violation"] == "compliant"
    print("   ✅ Case 1: Both PPE → Compliant ✓")

    # Case 2: No helmet, has vest → Medium
    result = get_violation(has_helmet=False, has_vest=True)
    assert result["severity"] == "medium"
    assert result["violation"] == "no_helmet"
    print("   ✅ Case 2: No helmet → Medium severity ✓")

    # Case 3: Has helmet, no vest → Medium
    result = get_violation(has_helmet=True, has_vest=False)
    assert result["severity"] == "medium"
    assert result["violation"] == "no_vest"
    print("   ✅ Case 3: No vest → Medium severity ✓")

    # Case 4: No helmet AND no vest → High
    result = get_violation(has_helmet=False, has_vest=False)
    assert result["severity"] == "high"
    assert result["violation"] == "no_helmet_and_no_vest"
    print("   ✅ Case 4: No PPE at all → High severity ✓")

    # Case 5: Multiple workers
    person_boxes = [
        [100, 50, 200, 400],   # Worker 1
        [300, 50, 400, 400],   # Worker 2
    ]
    # Helmet near worker 1's head
    helmet_boxes = [[115, 50, 185, 100]]
    # Vest near worker 1's torso
    vest_boxes   = [[110, 150, 190, 280]]

    workers = associate_ppe_with_workers(person_boxes, helmet_boxes, vest_boxes)
    assert len(workers) == 2, f"Expected 2 workers, got {len(workers)}"
    print(f"   ✅ Case 5: Multi-worker association → {len(workers)} workers detected ✓")

    summary = summarize_detections(workers)
    print(f"   ✅ Summary: {summary['total_workers']} workers, "
          f"{summary['compliance_rate']}% compliance ✓")

except Exception as e:
    print(f"   ❌ Violation logic test failed: {e}")
    all_passed = False

# ── Test 3: OpenCV frame annotation ──────────────────────────
print("\n🖼️  Test 3: Testing frame annotation...")
try:
    from utils.frame_annotator import annotate_frame, save_annotated_frame

    # Create a dummy frame (black 640x480 image)
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

    # Mock workers
    mock_workers = [
        {
            "worker_id": 1, "has_helmet": False, "has_vest": True,
            "violation": "no_helmet", "severity": "medium",
            "label": "No Helmet", "bbox": [50, 50, 200, 400],
            "color": (0, 165, 255), "color_hex": "#f97316"
        },
        {
            "worker_id": 2, "has_helmet": True, "has_vest": True,
            "violation": "compliant", "severity": "safe",
            "label": "Compliant", "bbox": [250, 50, 400, 400],
            "color": (0, 255, 0), "color_hex": "#22c55e"
        },
    ]

    annotated = annotate_frame(dummy_frame.copy(), mock_workers, frame_number=15)
    assert annotated is not None
    print("   ✅ Frame annotation works ✓")

    # Save to disk
    import os
    os.makedirs("output", exist_ok=True)
    save_annotated_frame(annotated, "output/test_frame.jpg")
    print("   ✅ Frame saved to output/test_frame.jpg ✓")

except Exception as e:
    print(f"   ❌ Annotation test failed: {e}")
    all_passed = False

# ── Test 4: YOLOv8 model load ─────────────────────────────────
print("\n🤖 Test 4: Loading YOLOv8 model (may download ~6MB on first run)...")
try:
    from ultralytics import YOLO
    # yolov8n.pt = nano model, downloads automatically if not present
    model = YOLO("yolov8n.pt")
    print(f"   ✅ Model loaded: {len(model.names)} classes available")
    print(f"   ✅ Sample classes: {list(model.names.values())[:5]}")

    # Run inference on the dummy frame
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    results = model(dummy_frame, verbose=False)
    print(f"   ✅ Inference on dummy frame OK (found {len(results[0].boxes)} detections in blank image)")

except Exception as e:
    print(f"   ⚠️  YOLOv8 model test failed: {e}")
    print(f"   This is OK if you're offline. Try again with internet.")
    all_passed = False

# ── Final result ──────────────────────────────────────────────
print("\n" + "=" * 55)
if all_passed:
    print("🎉 ALL TESTS PASSED — AI Service is ready!")
    print("\nNext step: Run the full detection on a video:")
    print("  python detect.py --video path/to/your/video.mp4")
else:
    print("⚠️  SOME TESTS FAILED — fix the issues above and retry.")
print("=" * 55)