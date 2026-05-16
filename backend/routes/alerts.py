# ============================================================
# SafeSite AI — Alert Routes
# File: backend/routes/alerts.py
#
# Endpoints:
#   GET    /alerts              — list all alerts (with filters)
#   POST   /alerts              — create a new alert (with cooldown)
#   GET    /alerts/summary      — stat cards (total, by type, today)
#   GET    /alerts/{id}         — get one alert
#   PATCH  /alerts/{id}/status  — update status (acknowledge/resolve)
#   POST   /alerts/resolve-all  — mark all as resolved
#   DELETE /alerts/{id}         — delete an alert (admin only)
# ============================================================

from fastapi import APIRouter, HTTPException, Depends, Query
from database import alerts_collection
from models.alert import AlertCreate, AlertUpdate
from services.alert_service import (
    create_alert,
    get_alerts,
    get_alert_count,
    update_alert_status,
    resolve_all_alerts,
    get_alert_summary,
)
from services.auth_service import get_current_user, require_admin
from bson import ObjectId
from datetime import datetime

router = APIRouter(prefix="/alerts", tags=["Alerts"])


# ── GET /alerts/summary — MUST be before /alerts/{id} ───────
@router.get("/summary")
async def alert_summary(current_user: dict = Depends(get_current_user)):
    """
    Returns today's alert counts grouped by violation type.
    Used for the 4 stat cards at the top of the Alerts page.

    Response:
    {
        "total": 12,
        "no_helmet": 5,
        "no_vest": 3,
        "no_helmet_and_no_vest": 4
    }
    """
    summary = await get_alert_summary()
    return summary


# ── GET /alerts ──────────────────────────────────────────────
@router.get("")
async def list_alerts(
    zone:      str = Query(default="all", description="Filter by zone"),
    severity:  str = Query(default="all", description="Filter by severity: high, medium"),
    status:    str = Query(default="all", description="Filter by status: new, acknowledged, resolved"),
    violation: str = Query(default="all", description="Filter by violation type"),
    date:      str = Query(default="",    description="Filter by date (YYYY-MM-DD)"),
    limit:     int = Query(default=20,    ge=1, le=100),
    skip:      int = Query(default=0,     ge=0),
    current_user: dict = Depends(get_current_user),
):
    """
    List all alerts with optional filters and pagination.

    Example calls:
        GET /alerts                           → all alerts
        GET /alerts?severity=high             → only high severity
        GET /alerts?zone=Zone+A&status=new    → new alerts in Zone A
        GET /alerts?limit=10&skip=10          → page 2
    """
    alerts = await get_alerts(
        zone=zone, severity=severity,
        status=status, violation=violation,
        date=date, limit=limit, skip=skip,
    )
    total = await get_alert_count(zone=zone, severity=severity, status=status, date=date)

    return {
        "alerts": alerts,
        "total": total,
        "limit": limit,
        "skip": skip,
        "pages": max(1, -(-total // limit)),  # ceiling division
    }


# ── POST /alerts — create a new alert ───────────────────────
@router.post("", status_code=201)
async def create_new_alert(
    data: AlertCreate,
    current_user: dict = Depends(get_current_user),
):
    """
    Create a new alert manually (e.g. from live stream detection).
    Cooldown logic runs inside create_alert() — if same worker+zone
    had this violation within 60 seconds, the alert is silently skipped.

    Returns the created alert, or a cooldown message.
    """
    alert_doc = await create_alert(data.dict())

    if alert_doc is None:
        # Cooldown is active — not an error, just informational
        return {
            "message": "Alert skipped — cooldown active (60 seconds)",
            "cooldown": True,
        }

    alert_doc["id"] = str(alert_doc.pop("_id"))
    return {"message": "Alert created", "alert": alert_doc, "cooldown": False}


# ── GET /alerts/{id} — get one alert ────────────────────────
@router.get("/{alert_id}")
async def get_alert(
    alert_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get details for a single alert by its MongoDB ID."""
    try:
        alert = await alerts_collection.find_one({"_id": ObjectId(alert_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid alert ID format")

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert["id"] = str(alert.pop("_id"))
    return alert


# ── PATCH /alerts/{id}/status — update status ───────────────
@router.patch("/{alert_id}/status")
async def update_status(
    alert_id: str,
    data: AlertUpdate,
    current_user: dict = Depends(get_current_user),
):
    """
    Update an alert's status.

    Allowed transitions:
        new → acknowledged   (someone saw it)
        acknowledged → resolved  (issue fixed)
        any → resolved       (direct resolve)

    Body: { "status": "acknowledged" }
          { "status": "resolved" }
    """
    if not data.status:
        raise HTTPException(status_code=400, detail="'status' field is required")

    allowed = {"new", "acknowledged", "resolved"}
    if data.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {allowed}"
        )

    try:
        updated = await update_alert_status(alert_id, data.status)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid alert ID format")

    if not updated:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"message": f"Alert marked as '{data.status}'", "alert_id": alert_id}


# ── POST /alerts/resolve-all ─────────────────────────────────
@router.post("/resolve-all")
async def resolve_all(current_user: dict = Depends(get_current_user)):
    """
    Mark ALL unresolved alerts as resolved.
    Useful for "Mark all as read" button on the Alerts page.
    """
    count = await resolve_all_alerts()
    return {
        "message": f"✅ {count} alert(s) marked as resolved",
        "count": count,
    }


# ── DELETE /alerts/{id} — admin only ────────────────────────
@router.delete("/{alert_id}")
async def delete_alert(
    alert_id: str,
    current_user: dict = Depends(require_admin),  # Admin only!
):
    """Delete an alert permanently. Admin only."""
    try:
        result = await alerts_collection.delete_one({"_id": ObjectId(alert_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid alert ID format")

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"message": "Alert deleted"}