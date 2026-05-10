# ============================================================
# SafeSite AI — Sites Routes  (Phase 10)
# File: backend/routes/sites.py
# Endpoints:
#   GET    /sites              — list all sites
#   POST   /sites              — create a new site
#   GET    /sites/{id}         — get one site + its stats
#   PUT    /sites/{id}         — update site
#   DELETE /sites/{id}         — delete site
#   GET    /sites/summary      — total counts for stat cards
# ============================================================

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from database import db
from services.auth_service import get_current_user, require_admin
from bson import ObjectId
from datetime import datetime

router = APIRouter(prefix="/sites", tags=["Sites"])


# ── Request / Response models ─────────────────────────────────

class SiteCreate(BaseModel):
    name:             str
    location:         str
    status:           str = "active"   # active | inactive | maintenance
    project_manager:  str = ""
    description:      str = ""
    start_date:       Optional[str] = None
    end_date:         Optional[str] = None


class SiteUpdate(BaseModel):
    name:             Optional[str] = None
    location:         Optional[str] = None
    status:           Optional[str] = None
    project_manager:  Optional[str] = None
    description:      Optional[str] = None
    start_date:       Optional[str] = None
    end_date:         Optional[str] = None


def _fmt(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


# ── GET /sites/summary ────────────────────────────────────────
@router.get("/summary")
async def get_sites_summary(current_user: dict = Depends(get_current_user)):
    """Stat cards — total sites, active, cameras, zones, high-risk."""
    total        = await db["sites"].count_documents({})
    active       = await db["sites"].count_documents({"status": "active"})
    total_cam    = await db["cameras"].count_documents({}) if "cameras" in await db.list_collection_names() else 0
    total_zones  = await db["zones"].count_documents({})   if "zones"   in await db.list_collection_names() else 0
    # High risk = sites with compliance < 60 %
    high_risk    = await db["sites"].count_documents({"compliance_rate": {"$lt": 60}})
    return {
        "total_sites":   total,
        "active_sites":  active,
        "total_cameras": total_cam,
        "total_zones":   total_zones,
        "high_risk":     high_risk,
    }


# ── GET /sites ────────────────────────────────────────────────
@router.get("")
async def list_sites(
    status: str = "all",
    current_user: dict = Depends(get_current_user)
):
    """List all sites with their latest compliance stats."""
    query = {}
    if status != "all":
        query["status"] = status

    sites = []
    async for site in db["sites"].find(query).sort("created_at", -1):
        sid = str(site["_id"])
        # Enrich with alert count from today
        from datetime import datetime
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        alert_count = await db["alerts"].count_documents({
            "zone": {"$in": site.get("zones", [])},
            "created_at": {"$gte": today}
        })
        site["active_alerts"] = alert_count
        sites.append(_fmt(site))

    return {"sites": sites, "total": len(sites)}


# ── GET /sites/{site_id} ──────────────────────────────────────
@router.get("/{site_id}")
async def get_site(site_id: str, current_user: dict = Depends(get_current_user)):
    """Get full details + recent alerts for one site."""
    try:
        site = await db["sites"].find_one({"_id": ObjectId(site_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid site ID")
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    # Recent alerts for this site
    recent_alerts = []
    async for a in db["alerts"].find(
        {"zone": {"$in": site.get("zones", [])}}
    ).sort("created_at", -1).limit(5):
        a["id"] = str(a.pop("_id"))
        recent_alerts.append(a)

    site = _fmt(site)
    site["recent_alerts"] = recent_alerts
    return site


# ── POST /sites ───────────────────────────────────────────────
@router.post("", status_code=201)
async def create_site(
    body: SiteCreate,
    current_user: dict = Depends(require_admin)
):
    """Create a new construction site (admin only)."""
    doc = {
        **body.dict(),
        "cameras":         0,
        "zones":           [],
        "workers":         0,
        "compliance_rate": 0,
        "created_at":      datetime.utcnow(),
        "updated_at":      datetime.utcnow(),
    }
    result = await db["sites"].insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return {"message": "Site created", "site": doc}


# ── PUT /sites/{site_id} ──────────────────────────────────────
@router.put("/{site_id}")
async def update_site(
    site_id: str,
    body: SiteUpdate,
    current_user: dict = Depends(require_admin)
):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    updates["updated_at"] = datetime.utcnow()
    try:
        result = await db["sites"].update_one({"_id": ObjectId(site_id)}, {"$set": updates})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid site ID")
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Site not found")
    return {"message": "Site updated"}


# ── DELETE /sites/{site_id} ───────────────────────────────────
@router.delete("/{site_id}")
async def delete_site(
    site_id: str,
    current_user: dict = Depends(require_admin)
):
    try:
        result = await db["sites"].delete_one({"_id": ObjectId(site_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid site ID")
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Site not found")
    return {"message": "Site deleted"}