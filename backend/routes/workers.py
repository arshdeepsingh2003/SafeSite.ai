# ============================================================
# SafeSite AI — Workers Routes  (Phase 10)
# File: backend/routes/workers.py
# Endpoints:
#   GET    /workers            — list all workers (paginated, filtered)
#   POST   /workers            — register a new worker
#   GET    /workers/summary    — stat cards
#   GET    /workers/{id}       — worker detail + compliance history
#   PUT    /workers/{id}       — update worker
#   DELETE /workers/{id}       — remove worker
# ============================================================

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from database import db, alerts_collection
from services.auth_service import get_current_user, require_admin
from bson import ObjectId
from datetime import datetime, timedelta

router = APIRouter(prefix="/workers", tags=["Workers"])


class WorkerCreate(BaseModel):
    name:        str
    worker_code: str          # e.g. "WKR-1001"
    phone:       Optional[str] = ""
    role:        str = "Laborer"
    site:        str = "Main Site"
    zone:        str = "Zone A"
    nationality: Optional[str] = ""
    experience:  Optional[str] = ""
    status:      str = "active"   # active | inactive


class WorkerUpdate(BaseModel):
    name:        Optional[str] = None
    phone:       Optional[str] = None
    role:        Optional[str] = None
    site:        Optional[str] = None
    zone:        Optional[str] = None
    nationality: Optional[str] = None
    experience:  Optional[str] = None
    status:      Optional[str] = None


def _fmt(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


# ── GET /workers/summary ──────────────────────────────────────
@router.get("/summary")
async def get_workers_summary(current_user: dict = Depends(get_current_user)):
    """Stat cards for the Workers page header."""
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = today - timedelta(days=7)

    total    = await db["workers"].count_documents({})
    active   = await db["workers"].count_documents({"status": "active"})
    new_week = await db["workers"].count_documents({"created_at": {"$gte": week_ago}})

    # Non-compliant = workers who had a violation alert today
    pipeline = [
        {"$match": {"created_at": {"$gte": today}, "severity": {"$in": ["medium", "high"]}}},
        {"$group": {"_id": "$worker_id"}},
        {"$count": "count"}
    ]
    result = []
    async for r in alerts_collection.aggregate(pipeline):
        result.append(r)
    non_compliant = result[0]["count"] if result else 0

    compliant = max(0, active - non_compliant)

    return {
        "total":         total,
        "active":        active,
        "non_compliant": non_compliant,
        "compliant":     compliant,
        "new_this_week": new_week,
    }


# ── GET /workers ──────────────────────────────────────────────
@router.get("")
async def list_workers(
    site:       str = "all",
    status:     str = "all",
    compliance: str = "all",   # all | compliant | non_compliant
    search:     str = "",
    page:       int = Query(1, ge=1),
    limit:      int = Query(8, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """List workers with filters, search, and pagination."""
    query: dict = {}
    if site   != "all": query["site"]   = site
    if status != "all": query["status"] = status
    if search:
        query["$or"] = [
            {"name":        {"$regex": search, "$options": "i"}},
            {"worker_code": {"$regex": search, "$options": "i"}},
        ]

    skip  = (page - 1) * limit
    total = await db["workers"].count_documents(query)

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    workers = []
    async for w in db["workers"].find(query).sort("created_at", -1).skip(skip).limit(limit):
        wid = w.get("worker_code") or str(w["_id"])

        # Today's compliance status from alerts
        today_alert = await alerts_collection.find_one(
            {"worker_id": wid, "created_at": {"$gte": today}},
            sort=[("created_at", -1)]
        )
        if today_alert:
            vtype = today_alert.get("violation_type", "")
            if vtype == "no_helmet_and_no_vest":
                compliance_today = "No Helmet & No Vest"
                compliance_color = "high"
            elif vtype == "no_helmet":
                compliance_today = "No Helmet"
                compliance_color = "medium"
            else:
                compliance_today = "No Vest"
                compliance_color = "medium"
        else:
            compliance_today = "Compliant"
            compliance_color = "safe"

        w["compliance_today"] = compliance_today
        w["compliance_color"] = compliance_color
        w["last_detected"]    = today_alert.get("created_at") if today_alert else w.get("created_at")
        w["last_camera"]      = today_alert.get("camera", "—") if today_alert else "—"
        workers.append(_fmt(w))

    return {
        "workers":     workers,
        "total":       total,
        "page":        page,
        "total_pages": max(1, -(-total // limit)),  # ceiling division
    }


# ── GET /workers/{worker_id} ──────────────────────────────────
@router.get("/{worker_id}")
async def get_worker(worker_id: str, current_user: dict = Depends(get_current_user)):
    """Worker detail with 7-day compliance summary."""
    try:
        worker = await db["workers"].find_one({"_id": ObjectId(worker_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid worker ID")
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    wcode = worker.get("worker_code") or worker_id

    # Recent detections (last 10)
    recent = []
    async for a in alerts_collection.find(
        {"worker_id": wcode}
    ).sort("created_at", -1).limit(10):
        a["id"] = str(a.pop("_id"))
        recent.append(a)

    # 7-day compliance breakdown
    seven_ago = datetime.utcnow() - timedelta(days=7)
    pipeline = [
        {"$match": {"worker_id": wcode, "created_at": {"$gte": seven_ago}}},
        {"$group": {"_id": "$violation_type", "count": {"$sum": 1}}}
    ]
    breakdown = {}
    async for r in alerts_collection.aggregate(pipeline):
        breakdown[r["_id"]] = r["count"]

    worker = _fmt(worker)
    worker["recent_detections"]     = recent
    worker["compliance_breakdown"]  = breakdown
    return worker


# ── POST /workers ─────────────────────────────────────────────
@router.post("", status_code=201)
async def create_worker(
    body: WorkerCreate,
    current_user: dict = Depends(require_admin)
):
    # Check unique worker_code
    existing = await db["workers"].find_one({"worker_code": body.worker_code})
    if existing:
        raise HTTPException(status_code=400, detail=f"Worker code {body.worker_code} already exists")

    doc = {
        **body.dict(),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db["workers"].insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return {"message": "Worker registered", "worker": doc}


# ── PUT /workers/{worker_id} ──────────────────────────────────
@router.put("/{worker_id}")
async def update_worker(
    worker_id: str,
    body: WorkerUpdate,
    current_user: dict = Depends(require_admin)
):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    updates["updated_at"] = datetime.utcnow()
    try:
        result = await db["workers"].update_one({"_id": ObjectId(worker_id)}, {"$set": updates})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid worker ID")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Worker not found")
    return {"message": "Worker updated"}


# ── DELETE /workers/{worker_id} ───────────────────────────────
@router.delete("/{worker_id}")
async def delete_worker(
    worker_id: str,
    current_user: dict = Depends(require_admin)
):
    try:
        result = await db["workers"].delete_one({"_id": ObjectId(worker_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid worker ID")
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Worker not found")
    return {"message": "Worker removed"}