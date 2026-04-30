# ============================================================
# SafeSite AI — Video Model (schema definitions)
# File: backend/models/video.py
# ============================================================

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class VideoStatus(str, Enum):
    uploaded   = "uploaded"    # Just uploaded, waiting to be processed
    processing = "processing"  # AI service is analyzing it right now
    completed  = "completed"   # Analysis done, results available
    error      = "error"       # Something went wrong during analysis


class VideoType(str, Enum):
    uploaded = "uploaded"   # A file the user uploaded
    stream   = "stream"     # A live .m3u8 / RTSP URL


# --- What we store in MongoDB ---
class VideoInDB(BaseModel):
    id: Optional[str] = None
    original_name: Optional[str] = None   # e.g. "site_walkthrough.mp4"
    stored_name: Optional[str] = None     # UUID-based filename on disk
    file_path: Optional[str] = None       # Full path on the server
    file_size_mb: Optional[float] = None
    url: Optional[str] = None             # For stream type
    camera_name: Optional[str] = None
    site_id: str = "main"
    zone: str = "Zone A"
    type: VideoType = VideoType.uploaded
    status: VideoStatus = VideoStatus.uploaded
    uploaded_by: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    analysis_result: Optional[dict] = None  # Filled by AI service in Phase 4


# --- What we send back to the frontend ---
class VideoResponse(BaseModel):
    id: str
    original_name: Optional[str] = None
    file_size_mb: Optional[float] = None
    camera_name: Optional[str] = None
    site_id: str
    zone: str
    type: VideoType
    status: VideoStatus
    uploaded_at: datetime
    analysis_result: Optional[dict] = None