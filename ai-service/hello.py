# ============================================================
# SafeSite AI — AI Service Hello World
# File: ai-service/hello.py
# Run with: python hello.py
# ============================================================

# This file just confirms that your Python environment
# is set up correctly for the AI service.

print("=" * 50)
print("👷 SafeSite AI — AI Service is ready!")
print("=" * 50)

# Check if key libraries are available
libraries_ok = True

try:
    import cv2
    print(f"✅ OpenCV version: {cv2.__version__}")
except ImportError:
    print("❌ OpenCV NOT installed — run: pip install opencv-python")
    libraries_ok = False

try:
    import numpy as np
    print(f"✅ NumPy version: {np.__version__}")
except ImportError:
    print("❌ NumPy NOT installed — run: pip install numpy")
    libraries_ok = False

try:
    from ultralytics import YOLO
    print("✅ YOLOv8 (ultralytics) is installed")
except ImportError:
    print("❌ YOLOv8 NOT installed — run: pip install ultralytics")
    libraries_ok = False

print("=" * 50)
if libraries_ok:
    print("🎉 All AI libraries are installed correctly!")
else:
    print("⚠️  Some libraries are missing. Install them and run again.")
print("=" * 50)