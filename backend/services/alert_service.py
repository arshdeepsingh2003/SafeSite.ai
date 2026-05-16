# ============================================================
# SafeSite AI — Alert Service  (Phase 8 — Email integrated)
# File: backend/services/alert_service.py
#
# Phase 8 change: create_alert() now calls send_high_alert_email()
# automatically when severity == "high".
# ============================================================

from database import alerts_collection, db
from datetime import datetime, timedelta
from bson import ObjectId
from time_utils import istnow
import hashlib, json

# Default — overridden at runtime by the value saved in Settings
COOLDOWN_SECONDS = 60

# ── Notification dedup ───────────────────────────────────────
# Prevents emitting the exact same notification twice within 30s.
_last_notification_hashes: dict[str, dict] = {}
NOTIFICATION_DEDUP_SECONDS = 30


def _compute_notification_hash(alert_data: dict) -> str:
    """Deterministic hash of the notification-significant fields."""
    core = {
        "worker_id":      alert_data.get("worker_id"),
        "zone":           alert_data.get("zone"),
        "violation_type": alert_data.get("violation_type"),
        "severity":       alert_data.get("severity"),
        "source":         alert_data.get("source"),
    }
    raw = json.dumps(core, sort_keys=True, default=str)
    return hashlib.md5(raw.encode()).hexdigest()


async def _is_duplicate_notification(alert_hash: str) -> bool:
    """Returns True if the same notification was sent within N seconds."""
    now = istnow()
    prev = _last_notification_hashes.get(alert_hash)
    if prev:
        elapsed = (now - prev["time"]).total_seconds()
        if elapsed < NOTIFICATION_DEDUP_SECONDS:
            return True
    _last_notification_hashes[alert_hash] = {"time": now}
    return False


async def _get_cooldown_seconds() -> int:
    """Read cooldown from saved settings, fall back to 60s."""
    try:
        doc = await db["settings"].find_one({"_id": "global_settings"})
        if doc and "alert_cooldown_secs" in doc:
            return int(doc["alert_cooldown_secs"])
    except Exception:
        pass
    return COOLDOWN_SECONDS


async def check_cooldown(worker_id: int, zone: str, violation_type: str) -> bool:
    """
    Returns True  → cooldown active (skip alert).
    Returns False → OK to create alert.
    Cooldown duration is read live from the Settings collection.
    """
    cooldown = await _get_cooldown_seconds()
    cutoff = istnow() - timedelta(seconds=cooldown)
    existing = await alerts_collection.find_one(
        {
            "worker_id":      worker_id,
            "zone":           zone,
            "violation_type": violation_type,
            "created_at":     {"$gte": cutoff},
        },
        sort=[("created_at", -1)]
    )
    return existing is not None


async def create_alert(alert_data: dict) -> dict | None:
    """
    Save a new alert to MongoDB, emit via Socket.IO,
    and (if HIGH severity) send an email notification.

    Returns the created alert dict, or None if cooldown is active.
    """
    worker_id      = alert_data.get("worker_id", 0)
    zone           = alert_data.get("zone", "Zone A")
    violation_type = alert_data.get("violation_type", "unknown")
    severity       = alert_data.get("severity", "medium")

    # ── Cooldown check ────────────────────────────────────────
    if await check_cooldown(worker_id, zone, violation_type):
        return None

    # ── Build and insert document ─────────────────────────────
    doc = {
        "video_id":       alert_data.get("video_id"),
        "worker_id":      worker_id,
        "zone":           zone,
        "camera":         alert_data.get("camera", "Camera 1"),
        "violation_type": violation_type,
        "severity":       severity,
        "has_helmet":     alert_data.get("has_helmet", False),
        "has_vest":       alert_data.get("has_vest", False),
        "frame_number":   alert_data.get("frame_number"),
        "timestamp_sec":  alert_data.get("timestamp_sec"),
        "bbox":           alert_data.get("bbox"),
        "source":         alert_data.get("source", "uploaded_video"),
        "status":         "new",
        "resolved":       False,
        "created_at":     istnow(),
        "resolved_at":    None,
        "email_sent":     False,    # Track if email was sent
    }

    result = await alerts_collection.insert_one(doc)
    doc["_id"] = result.inserted_id

    # ── Notification dedup check ─────────────────────────────
    notif_hash = _compute_notification_hash(doc)
    if await _is_duplicate_notification(notif_hash):
        print(f"⏭️  Suppressed duplicate socket emit: worker={worker_id} type={violation_type}")
    else:
        # ── Emit via Socket.IO ───────────────────────────────
        try:
            from socket_server import emit_new_alert
            await emit_new_alert(doc)
        except Exception as e:
            print(f"⚠️  Socket emit failed (alert still saved): {e}")

    # ── Phase 8: Send email for all violations ─────────────────
    print(f"📧 create_alert: severity={severity} | violation={violation_type} | zone={zone}")
    if severity in ("medium", "high"):
        try:
            from services.email_service import send_high_alert_email
            print(f"📧 Attempting to send email for alert (severity={severity})...")
            email_sent = await send_high_alert_email(doc)
            print(f"📧 Email send result: {email_sent}")
            # Mark email_sent in the document
            if email_sent:
                await alerts_collection.update_one(
                    {"_id": result.inserted_id},
                    {"$set": {"email_sent": True}}
                )
                doc["email_sent"] = True
        except Exception as e:
            # Never let email failure break the alert creation
            print(f"⚠️  Email send failed (alert still saved): {e}")

    return doc


async def get_alerts(
    zone:      str = None,
    severity:  str = None,
    status:    str = None,
    violation: str = None,
    date:      str = None,
    limit:     int = 50,
    skip:      int = 0,
) -> list:
    """Fetch alerts with optional filters, newest first."""
    query = {}
    if zone      and zone      != "all": query["zone"]           = zone
    if severity  and severity  != "all": query["severity"]       = severity
    if status    and status    != "all": query["status"]         = status
    if violation and violation != "all": query["violation_type"] = violation
    if date:
        from time_utils import IST
        day = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=IST)
        query["created_at"] = {
            "$gte": day,
            "$lt":  day + timedelta(days=1),
        }

    cursor = alerts_collection.find(query) \
        .sort("created_at", -1) \
        .skip(skip) \
        .limit(limit)

    alerts = []
    async for alert in cursor:
        alert["id"] = str(alert.pop("_id"))
        alerts.append(alert)
    return alerts


async def get_alert_count(zone=None, severity=None, status=None, date=None) -> int:
    query = {}
    if zone     and zone     != "all": query["zone"]     = zone
    if severity and severity != "all": query["severity"] = severity
    if status   and status   != "all": query["status"]   = status
    if date:
        from time_utils import IST
        day = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=IST)
        query["created_at"] = {"$gte": day, "$lt": day + timedelta(days=1)}
    return await alerts_collection.count_documents(query)


async def update_alert_status(alert_id: str, status: str) -> bool:
    update_fields = {"status": status}
    if status == "resolved":
        update_fields["resolved"]    = True
        update_fields["resolved_at"] = istnow()

    result = await alerts_collection.update_one(
        {"_id": ObjectId(alert_id)},
        {"$set": update_fields}
    )

    if result.modified_count > 0 and status == "resolved":
        try:
            from socket_server import emit_alert_resolved
            alert = await alerts_collection.find_one({"_id": ObjectId(alert_id)})
            zone  = alert.get("zone") if alert else None
            await emit_alert_resolved(alert_id, zone)
        except Exception as e:
            print(f"⚠️  Socket emit_resolved failed: {e}")

    return result.modified_count > 0


async def resolve_all_alerts() -> int:
    result = await alerts_collection.update_many(
        {"resolved": False},
        {"$set": {
            "status":      "resolved",
            "resolved":    True,
            "resolved_at": istnow(),
        }}
    )
    return result.modified_count


async def get_alert_summary() -> dict:
    """Today's unresolved alert counts grouped by violation type, plus zone breakdown."""
    today_start = istnow().replace(hour=0, minute=0, second=0, microsecond=0)
    match = {"created_at": {"$gte": today_start}, "status": {"$ne": "resolved"}}

    # Violation type counts
    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$violation_type", "count": {"$sum": 1}}}
    ]
    counts = {"total": 0, "no_helmet": 0, "no_vest": 0, "no_helmet_and_no_vest": 0}
    async for doc in alerts_collection.aggregate(pipeline):
        vtype = doc["_id"]
        count = doc["count"]
        counts["total"] += count
        if vtype in counts:
            counts[vtype] = count

    # Zone breakdown
    zone_pipeline = [
        {"$match": match},
        {"$group": {"_id": "$zone", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    zones = []
    async for doc in alerts_collection.aggregate(zone_pipeline):
        zones.append(doc["_id"])
    counts["zones_affected"] = zones
    counts["top_violation_zone"] = zones[0] if zones else "Unknown"

    return counts