
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from dotenv import load_dotenv
from time_utils import istnow

load_dotenv()

# ── Read email config from .env ───────────────────────────────
MAIL_USERNAME = os.getenv("MAIL_USERNAME", "")
MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")
MAIL_FROM     = os.getenv("MAIL_FROM", "")
MAIL_SERVER   = os.getenv("MAIL_SERVER", "smtp.gmail.com")
MAIL_PORT     = int(os.getenv("MAIL_PORT", "587"))

# Who receives the high-severity alert emails
# Can be a single address or comma-separated list
ALERT_RECIPIENTS = os.getenv("ALERT_RECIPIENTS", MAIL_USERNAME)

# Feature flag — set EMAIL_ALERTS_ENABLED=false in .env to disable
EMAIL_ENABLED = os.getenv("EMAIL_ALERTS_ENABLED", "true").lower() == "true"


def _is_configured() -> bool:
    """Check if email credentials are set in .env."""
    return bool(MAIL_USERNAME and MAIL_PASSWORD and MAIL_FROM
                and MAIL_USERNAME != "your_email@gmail.com")


def _build_html_email(alert: dict) -> str:
    """
    Build a professional HTML email body for a safety violation.
    Returns HTML string.
    """
    violation = alert.get("violation_type", "unknown").replace("_", " ").title()
    severity  = alert.get("severity", "high").upper()
    zone      = alert.get("zone", "Unknown Zone")
    camera    = alert.get("camera", "Camera 1")
    worker_id = alert.get("worker_id", "N/A")
    timestamp = alert.get("created_at", istnow())
    has_helmet = alert.get("has_helmet", False)
    has_vest   = alert.get("has_vest", False)
    source     = alert.get("source", "uploaded_video").replace("_", " ").title()

    # Format timestamp nicely
    if isinstance(timestamp, datetime):
        ts_str = timestamp.strftime("%B %d, %Y at %I:%M:%S %p IST")
    else:
        ts_str = str(timestamp)

    # PPE status
    helmet_status = "✅ Wearing Helmet" if has_helmet else "❌ No Helmet Detected"
    vest_status   = "✅ Wearing Vest"   if has_vest   else "❌ No Vest Detected"

    # Severity color
    sev_color = "#ef4444" if severity == "HIGH" else "#f97316"

    return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SafeSite AI — Safety Alert</title>
</head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

  <div style="max-width:600px;margin:0 auto;padding:24px;">

    <!-- Header -->
    <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px;margin-bottom:16px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">🦺</div>
      <div style="font-size:22px;font-weight:700;color:#e6edf3;margin-bottom:4px;">
        SafeSite <span style="color:#f97316;">AI</span>
      </div>
      <div style="font-size:13px;color:#8b949e;">Construction Site Safety Monitoring</div>
    </div>

    <!-- Alert banner -->
    <div style="background:{sev_color}18;border:1px solid {sev_color}40;border-left:4px solid {sev_color};border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="font-size:24px;">🚨</span>
        <div>
          <div style="font-size:18px;font-weight:700;color:{sev_color};">
            {severity} SEVERITY ALERT
          </div>
          <div style="font-size:14px;color:#e6edf3;margin-top:2px;">
            {violation} Detected
          </div>
        </div>
      </div>
      <div style="font-size:12px;color:#8b949e;">{ts_str}</div>
    </div>

    <!-- Details card -->
    <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="font-size:14px;font-weight:600;color:#e6edf3;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid #30363d;">
        📋 Incident Details
      </div>

      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;color:#8b949e;font-size:13px;width:140px;">📍 Zone</td>
          <td style="padding:8px 0;color:#e6edf3;font-size:13px;font-weight:600;">{zone}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#8b949e;font-size:13px;">📹 Camera</td>
          <td style="padding:8px 0;color:#e6edf3;font-size:13px;font-weight:600;">{camera}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#8b949e;font-size:13px;">👷 Worker ID</td>
          <td style="padding:8px 0;color:#e6edf3;font-size:13px;font-weight:600;">#{worker_id}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#8b949e;font-size:13px;">⚠️ Violation</td>
          <td style="padding:8px 0;font-size:13px;font-weight:600;color:{sev_color};">{violation}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#8b949e;font-size:13px;">📡 Source</td>
          <td style="padding:8px 0;color:#e6edf3;font-size:13px;font-weight:600;">{source}</td>
        </tr>
      </table>
    </div>

    <!-- PPE Status -->
    <div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="font-size:14px;font-weight:600;color:#e6edf3;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #30363d;">
        🦺 PPE Status
      </div>
      <div style="display:flex;gap:12px;">
        <div style="flex:1;padding:12px;background:#0d1117;border-radius:8px;border:1px solid {'#22c55e40' if has_helmet else '#ef444440'};text-align:center;">
          <div style="font-size:20px;margin-bottom:6px;">⛑️</div>
          <div style="font-size:12px;color:{'#22c55e' if has_helmet else '#ef4444'};font-weight:600;">{helmet_status}</div>
        </div>
        <div style="flex:1;padding:12px;background:#0d1117;border-radius:8px;border:1px solid {'#22c55e40' if has_vest else '#ef444440'};text-align:center;">
          <div style="font-size:20px;margin-bottom:6px;">🦺</div>
          <div style="font-size:12px;color:{'#22c55e' if has_vest else '#ef4444'};font-weight:600;">{vest_status}</div>
        </div>
      </div>
    </div>

    <!-- Action required -->
    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:12px;padding:18px;margin-bottom:16px;">
      <div style="font-size:14px;font-weight:700;color:#ef4444;margin-bottom:8px;">⚡ Immediate Action Required</div>
      <div style="font-size:13px;color:#8b949e;line-height:1.6;">
        A worker has been detected without required safety equipment.
        Please immediately dispatch a safety officer to <strong style="color:#e6edf3;">{zone}</strong>
        to ensure compliance and prevent potential accidents.
      </div>
    </div>

    <!-- CTA Button -->
    <div style="text-align:center;margin-bottom:20px;">
      <a href="http://localhost:5173/alerts"
         style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#ef4444,#dc2626);color:white;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">
        🔍 View Alert in Dashboard
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;font-size:11px;color:#8b949e;line-height:1.6;">
      This is an automated alert from SafeSite AI.<br>
      To manage your alert preferences, visit
      <a href="http://localhost:5173/settings" style="color:#6366f1;text-decoration:none;">Settings</a>.<br><br>
      © {istnow().year} SafeSite AI — Construction Site Safety Monitoring
    </div>

  </div>
</body>
</html>
"""


async def send_high_alert_email(alert: dict) -> bool:
    """
    Send a HIGH severity alert email.

    Called automatically by alert_service.create_alert()
    when severity == "high".

    Returns True if sent successfully, False otherwise.
    Errors are caught and logged — they never crash the app.
    """
    if not EMAIL_ENABLED:
        print("📧 Email alerts disabled (EMAIL_ALERTS_ENABLED=false in .env)")
        return False

    if not _is_configured():
        print("📧 Email not configured — skipping. Add credentials to backend/.env")
        print("   MAIL_USERNAME=your_email@gmail.com")
        print("   MAIL_PASSWORD=your_gmail_app_password")
        return False

    try:
        # Build the email
        msg = MIMEMultipart("alternative")
        msg["Subject"] = (
            f"🚨 HIGH ALERT — {alert.get('violation_type','Violation').replace('_',' ').title()} "
            f"| {alert.get('zone','Zone')} | SafeSite AI"
        )
        msg["From"]    = f"SafeSite AI <{MAIL_FROM}>"
        msg["To"]      = ALERT_RECIPIENTS

        # Plain-text fallback (for email clients that don't support HTML)
        plain = (
            f"SafeSite AI — HIGH SEVERITY ALERT\n\n"
            f"Violation: {alert.get('violation_type','').replace('_',' ').title()}\n"
            f"Zone:      {alert.get('zone', 'N/A')}\n"
            f"Camera:    {alert.get('camera', 'N/A')}\n"
            f"Worker ID: #{alert.get('worker_id', 'N/A')}\n"
            f"Helmet:    {'YES' if alert.get('has_helmet') else 'NO'}\n"
            f"Vest:      {'YES' if alert.get('has_vest') else 'NO'}\n\n"
            f"Immediate action required. Visit http://localhost:5173/alerts\n"
        )

        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(_build_html_email(alert), "html"))

        # Send via SMTP (Gmail uses STARTTLS on port 587)
        with smtplib.SMTP(MAIL_SERVER, MAIL_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()          # Encrypt the connection
            server.ehlo()
            server.login(MAIL_USERNAME, MAIL_PASSWORD)
            server.sendmail(
                MAIL_FROM,
                [r.strip() for r in ALERT_RECIPIENTS.split(",")],
                msg.as_string()
            )

        print(f"📧 Email sent → {ALERT_RECIPIENTS} | violation={alert.get('violation_type')} | zone={alert.get('zone')}")
        return True

    except smtplib.SMTPAuthenticationError:
        print("📧 ❌ Email auth failed. Check MAIL_USERNAME and MAIL_PASSWORD in .env")
        print("   Remember: use a Gmail App Password, not your normal Gmail password!")
        return False

    except smtplib.SMTPConnectError:
        print(f"📧 ❌ Could not connect to {MAIL_SERVER}:{MAIL_PORT}. Check your internet connection.")
        return False

    except Exception as e:
        print(f"📧 ❌ Email failed: {type(e).__name__}: {e}")
        return False


async def send_test_email(recipient: str) -> dict:
    """
    Send a test email to verify configuration.
    Called from POST /email/test endpoint.
    """
    if not _is_configured():
        return {
            "success": False,
            "message": "Email not configured. Add MAIL_USERNAME and MAIL_PASSWORD to backend/.env"
        }

    # Build a fake alert for the test email
    fake_alert = {
        "violation_type": "no_helmet_and_no_vest",
        "severity":       "high",
        "zone":           "Zone A",
        "camera":         "Camera 1",
        "worker_id":      1001,
        "has_helmet":     False,
        "has_vest":       False,
        "source":         "test",
        "created_at":     istnow(),
    }

    # Temporarily override recipient
    original = os.environ.get("ALERT_RECIPIENTS", "")
    os.environ["ALERT_RECIPIENTS"] = recipient

    success = await send_high_alert_email(fake_alert)

    os.environ["ALERT_RECIPIENTS"] = original

    return {
        "success": success,
        "message": f"✅ Test email sent to {recipient}" if success else "❌ Failed to send. Check console for details.",
        "recipient": recipient,
    }


def get_email_config_status() -> dict:
    """Return current email config status (for the settings page)."""
    return {
        "configured":   _is_configured(),
        "enabled":      EMAIL_ENABLED,
        "mail_server":  MAIL_SERVER,
        "mail_port":    MAIL_PORT,
        "mail_from":    MAIL_FROM if _is_configured() else "not set",
        "recipients":   ALERT_RECIPIENTS if _is_configured() else "not set",
    }