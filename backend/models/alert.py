# ============================================================
#It tells the backend:
#what fields an alert should contain,
#what type each field should be,
# values are allowed,
#and what data frontend/backend can exchange
# ============================================================

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class AlertSeverity(str, Enum):
    high   = "high"    # No helmet AND no vest
    medium = "medium"  # No helmet OR no vest
    low    = "low"     # Minor issue


class AlertStatus(str, Enum):
    new          = "new"           # Just created, not seen
    acknowledged = "acknowledged"  # Someone saw it
    resolved     = "resolved"      # Fixed / worker now compliant


class ViolationType(str, Enum):
    no_helmet          = "no_helmet"
    no_vest            = "no_vest"
    no_helmet_and_vest = "no_helmet_and_no_vest"


# ── What gets stored in MongoDB ──────────────────────────────
class AlertInDB(BaseModel):
    id:             Optional[str]  = None
    video_id:       Optional[str]  = None   # Which video triggered this
    worker_id:      Optional[int]  = None   # Worker number in the frame
    zone:           str            = "Zone A"
    camera:         str            = "Camera 1"
    violation_type: str
    severity:       AlertSeverity
    has_helmet:     bool           = False
    has_vest:       bool           = False
    frame_number:   Optional[int]  = None
    timestamp_sec:  Optional[float]= None
    bbox:           Optional[List[int]] = None
    source:         str            = "uploaded_video"  # or "live_stream"
    status:         AlertStatus    = AlertStatus.new
    resolved:       bool           = False
    created_at:     datetime       = Field(default_factory=datetime.utcnow)
    resolved_at:    Optional[datetime] = None


# ── What we send back to the frontend ───────────────────────
class AlertResponse(BaseModel):
    id:             str
    video_id:       Optional[str]  = None
    worker_id:      Optional[int]  = None
    zone:           str
    camera:         str
    violation_type: str
    severity:       str
    has_helmet:     bool
    has_vest:       bool
    source:         str
    status:         str
    resolved:       bool
    created_at:     datetime
    resolved_at:    Optional[datetime] = None


# ── What we receive to CREATE an alert ──────────────────────
class AlertCreate(BaseModel):
    worker_id:      Optional[int]  = None
    zone:           str            = "Zone A"
    camera:         str            = "Camera 1"
    violation_type: str
    severity:       str
    has_helmet:     bool           = False
    has_vest:       bool           = False
    source:         str            = "live_stream"


# ── What we receive to UPDATE an alert ──────────────────────
class AlertUpdate(BaseModel):
    status:   Optional[str] = None
    resolved: Optional[bool] = None