
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from services.email_service import (
    send_test_email,
    send_high_alert_email,
    get_email_config_status,
)
from services.auth_service import get_current_user, require_admin
from database import alerts_collection
from bson import ObjectId

router = APIRouter(prefix="/email", tags=["Email Alerts"])


# ── Request body models ───────────────────────────────────────

class TestEmailRequest(BaseModel):
    recipient: EmailStr  # Who to send the test email to


# ── GET /email/status ─────────────────────────────────────────
@router.get("/status")
async def email_status(current_user: dict = Depends(get_current_user)):
    """
    Returns the current email configuration status.
    The frontend Settings page uses this to show if email is configured.
    Does NOT expose passwords — only shows if configured, server, port.
    """
    return get_email_config_status()


# ── POST /email/test ──────────────────────────────────────────
@router.post("/test")
async def test_email(
    body: TestEmailRequest,
    current_user: dict = Depends(require_admin),   # Admin only
):
    """
    Send a test email with a fake HIGH alert to verify configuration.
    Only admins can trigger this.

    Usage (from Settings page):
      POST /email/test
      { "recipient": "admin@company.com" }
    """
    result = await send_test_email(body.recipient)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


# ── POST /email/send-alert/{alert_id} ────────────────────────
@router.post("/send-alert/{alert_id}")
async def resend_alert_email(
    alert_id: str,
    current_user: dict = Depends(require_admin),
):
    """
    Manually resend the email for a specific alert.
    Useful if the original email failed to send.
    """
    try:
        oid = ObjectId(alert_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid alert ID")

    alert = await alerts_collection.find_one({"_id": oid})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    # Convert ObjectId to string for the email builder
    alert["id"] = str(alert.pop("_id"))

    success = await send_high_alert_email(alert)

    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to send email. Check backend/.env email credentials and the server console."
        )

    return {
        "success": True,
        "message": f"Email resent for alert {alert_id}",
        "alert_id": alert_id,
    }