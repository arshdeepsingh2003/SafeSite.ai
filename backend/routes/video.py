from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Form
from fastapi.responses import FileResponse
from database import db
from services.auth_service import get_current_user
from models.video import VideoInDB, VideoResponse, VideoStatus, VideoType
from bson import ObjectId
from datetime import datetime
from typing import Optional
import os, shutil, uuid, aiofiles

router = APIRouter(prefix="/video", tags=["Video"])

# Where uploaded videos are stored on the server
UPLOAD_DIR = "uploads/videos"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Allowed video formats
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv"}
MAX_FILE_SIZE_MB = 2048  # 2 GB


def allowed_file(filename: str) -> bool:
    ext = os.path.splitext(filename)[1].lower()
    return ext in ALLOWED_EXTENSIONS


# -------------------------------------------------------
# POST /video/upload
# -------------------------------------------------------
@router.post("/upload", status_code=201, response_model=dict)
async def upload_video(
    file: UploadFile = File(...),
    site_id: str = Form(default="main"),
    zone: str = Form(default="Zone A"),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload a video file for safety analysis.
    - Validates file type and size
    - Saves to disk
    - Saves metadata to MongoDB using VideoInDB model
    - Returns video_id to track analysis progress
    """
    # Validate file type
    if not allowed_file(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Supported: MP4, MOV, AVI, MKV"
        )

    # Generate a unique filename to avoid conflicts
    ext = os.path.splitext(file.filename)[1].lower()
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    # Save file to disk in chunks (handles large files efficiently)
    total_size = 0
    async with aiofiles.open(file_path, "wb") as out_file:
        while chunk := await file.read(1024 * 1024):  # Read 1MB at a time
            total_size += len(chunk)
            # Check size limit
            if total_size > MAX_FILE_SIZE_MB * 1024 * 1024:
                os.remove(file_path)
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB"
                )
            await out_file.write(chunk)

    # Create VideoInDB model instance
    video_in_db = VideoInDB(
        original_name=file.filename,
        stored_name=unique_name,
        file_path=file_path,
        file_size_mb=round(total_size / (1024 * 1024), 2),
        site_id=site_id,
        zone=zone,
        uploaded_by=current_user.get("sub"),
        status=VideoStatus.uploaded,
        type=VideoType.uploaded,
        analysis_result=None
    )

    # Save metadata to MongoDB
    video_dict = video_in_db.model_dump(exclude_none=True)
    video_dict["uploaded_at"] = datetime.utcnow()

    result = await db["videos"].insert_one(video_dict)
    video_id = str(result.inserted_id)

    return {
        "message": "✅ Video uploaded successfully!",
        "video_id": video_id,
        "filename": file.filename,
        "file_size_mb": video_in_db.file_size_mb,
        "status": VideoStatus.uploaded,
        "next_step": f"Send to AI service: POST /ai/analyze/{video_id}"
    }


# -------------------------------------------------------
# POST /video/stream-url
# -------------------------------------------------------
@router.post("/stream-url", status_code=201, response_model=dict)
async def register_stream(
    url: str = Form(...),
    camera_name: str = Form(default="Camera 1"),
    zone: str = Form(default="Zone A"),
    current_user: dict = Depends(get_current_user)
):
    """
    Register a live HLS stream URL (.m3u8) for monitoring.
    The URL is saved so the frontend can play it via hls.js.
    """
    # Basic validation — must look like a URL
    if not (url.startswith("http://") or url.startswith("https://") or url.startswith("rtsp://")):
        raise HTTPException(
            status_code=400,
            detail="Invalid URL. Must start with http://, https://, or rtsp://"
        )

    # Create VideoInDB model instance for stream
    video_in_db = VideoInDB(
        url=url,
        camera_name=camera_name,
        zone=zone,
        uploaded_by=current_user.get("sub"),
        status=VideoStatus.uploaded,
        type=VideoType.stream,
        analysis_result=None
    )

    # Save to MongoDB
    stream_dict = video_in_db.model_dump(exclude_none=True)
    stream_dict["uploaded_at"] = datetime.utcnow()

    result = await db["videos"].insert_one(stream_dict)

    return {
        "message": "✅ Live stream registered!",
        "stream_id": str(result.inserted_id),
        "camera_name": camera_name,
        "url": url
    }


# -------------------------------------------------------
# GET /video/list
# -------------------------------------------------------
@router.get("/list", response_model=dict)
async def list_videos(current_user: dict = Depends(get_current_user)):
    """Return all uploaded videos and registered streams."""
    videos = []
    async for video in db["videos"].find().sort("uploaded_at", -1).limit(50):
        video["id"] = str(video["_id"])
        # Remove the full file path for security
        video.pop("file_path", None)
        video.pop("_id", None)
        # Convert to VideoResponse model
        try:
            video_response = VideoResponse(**video)
            videos.append(video_response.model_dump(exclude_none=True))
        except Exception:
            # Skip invalid entries
            pass
    return {"videos": videos, "count": len(videos)}


# -------------------------------------------------------
# GET /video/{video_id}
# -------------------------------------------------------
@router.get("/{video_id}", response_model=VideoResponse)
async def get_video(video_id: str, current_user: dict = Depends(get_current_user)):
    """Get metadata for a specific video."""
    try:
        video = await db["videos"].find_one({"_id": ObjectId(video_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID format")

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    video["id"] = str(video["_id"])
    video.pop("file_path", None)
    video.pop("_id", None)

    return VideoResponse(**video)


# -------------------------------------------------------
# DELETE /video/delete-all  (must be before /{video_id})
# -------------------------------------------------------
@router.delete("/delete-all")
async def delete_all_videos(current_user: dict = Depends(get_current_user)):
    """Delete ALL videos, their files, and associated alerts."""
    # Delete all video files from disk
    videos = db["videos"].find()
    deleted_count = 0
    async for video in videos:
        file_path = video.get("file_path")
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        deleted_count += 1

    # Remove all video records
    await db["videos"].delete_many({})

    # Also remove associated alerts
    await db["alerts"].delete_many({})

    return {
        "message": f"✅ Deleted {deleted_count} videos and all associated alerts",
        "deleted_count": deleted_count
    }


# -------------------------------------------------------
# DELETE /video/{video_id}
# -------------------------------------------------------
@router.delete("/{video_id}")
async def delete_video(video_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a video file and its metadata."""
    try:
        video = await db["videos"].find_one({"_id": ObjectId(video_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid video ID format")

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Delete the file from disk
    file_path = video.get("file_path")
    if file_path and os.path.exists(file_path):
        os.remove(file_path)

    # Remove from database
    await db["videos"].delete_one({"_id": ObjectId(video_id)})

    return {"message": "✅ Video deleted successfully"}