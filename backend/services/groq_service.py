import os
import json
import traceback
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Use absolute path so .env is found regardless of working directory
dotenv_path = Path(__file__).resolve().parent.parent / ".env"
if dotenv_path.exists():
    load_dotenv(dotenv_path=dotenv_path)
    print(f"📄 Loaded .env from {dotenv_path}")
else:
    print(f"⚠️  .env not found at {dotenv_path}, falling back to CWD")
    load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama3-70b-8192")

# ── Startup log ──────────────────────────────────────────────
if GROQ_API_KEY and GROQ_API_KEY != "your_groq_api_key_here":
    print(f"✅ Groq API initialized successfully — model: {GROQ_MODEL}")
else:
    print(f"❌ Groq API key missing — AI features will use rule-based fallback")
    if not GROQ_API_KEY:
        print(f"   GROQ_API_KEY is empty — check backend/.env")
    elif GROQ_API_KEY == "your_groq_api_key_here":
        print(f"   GROQ_API_KEY still set to placeholder — update it in backend/.env")


def _is_configured() -> bool:
    return bool(GROQ_API_KEY and GROQ_API_KEY != "your_groq_api_key_here")


def _get_client():
    """Return a Groq client. Raises ValueError if not configured."""
    if not _is_configured():
        raise ValueError(
            "Groq API key not configured. "
            "Get a free key at https://console.groq.com and add it to backend/.env"
        )
    from groq import Groq
    return Groq(api_key=GROQ_API_KEY)


def _parse_json_response(raw: str) -> dict:
    """Parse JSON from LLM response, handling markdown code fences."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


async def analyze_detections(detection_summary: dict) -> dict:
    """
    Takes a detection summary and returns AI-powered safety analysis.
    Falls back to rule-based if Groq is unavailable or fails.
    """
    if not _is_configured():
        return _fallback_analysis(detection_summary)

    try:
        client = _get_client()

        zone       = detection_summary.get("zone", "Unknown Zone")
        total      = detection_summary.get("total_workers", 0)
        compliant  = detection_summary.get("compliant", 0)
        no_helmet  = detection_summary.get("no_helmet", 0)
        no_vest    = detection_summary.get("no_vest", 0)
        both       = detection_summary.get("no_helmet_and_no_vest", 0)
        rate       = detection_summary.get("compliance_rate", 0)

        prompt = f"""You are a construction site safety expert analyzing AI detection results.

Detection Results for {zone}:
- Total workers detected: {total}
- Compliant (helmet + vest): {compliant} ({rate:.1f}%)
- No helmet only: {no_helmet}
- No vest only: {no_vest}
- Missing both (HIGH RISK): {both}

Provide a safety analysis in this exact JSON format:
{{
  "insight": "2-3 sentence summary of the safety situation",
  "risk_level": "low|medium|high|critical",
  "top_concern": "single biggest safety issue in one sentence",
  "recommendations": ["action 1", "action 2", "action 3"]
}}

Rules:
- Be specific and actionable, not generic
- risk_level is "critical" if compliance < 50%, "high" if < 70%, "medium" if < 85%, "low" otherwise
- Recommendations must be concrete steps a site manager can take TODAY
- Keep insight under 60 words
- Return ONLY the JSON, no other text"""

        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400,
            temperature=0.3,
        )

        raw = response.choices[0].message.content.strip()
        result = _parse_json_response(raw)

        return {
            "insight":         result.get("insight", ""),
            "risk_level":      result.get("risk_level", "medium"),
            "top_concern":     result.get("top_concern", ""),
            "recommendations": result.get("recommendations", []),
            "generated_by":    "groq",
            "model":           GROQ_MODEL,
            "generated_at":    datetime.utcnow().isoformat(),
        }

    except Exception as e:
        print(f"⚠️  Groq analyze_detections FAILED:")
        print(f"    Exception: {e}")
        traceback.print_exc()
        return _fallback_analysis(detection_summary)


async def generate_daily_report(alerts_data: dict) -> dict:
    """
    Generate a full AI-powered daily/weekly safety report from alert data.

    Returns structured report with executive_summary, zone_analysis,
    trend_analysis, recommendations, etc.
    """
    if not _is_configured():
        return _fallback_report(alerts_data)

    try:
        client = _get_client()

        date       = alerts_data.get("date", datetime.utcnow().strftime("%Y-%m-%d"))
        total      = alerts_data.get("total_alerts", 0)
        no_helmet  = alerts_data.get("no_helmet", 0)
        no_vest    = alerts_data.get("no_vest", 0)
        both       = alerts_data.get("no_helmet_and_no_vest", 0)
        resolved   = alerts_data.get("resolved", 0)
        rate       = alerts_data.get("compliance_rate", 0)
        peak_hour  = alerts_data.get("peak_hour", "unknown")
        zones      = alerts_data.get("zones", {})

        # Build zone detail string with percentages
        total_zone_violations = sum(zones.values()) or 1
        zones_detail = []
        for z, c in sorted(zones.items(), key=lambda x: -x[1]):
            pct = round(c / total_zone_violations * 100, 1)
            zones_detail.append(f"  - {z}: {c} violations ({pct}%)")
        zones_str = "\n".join(zones_detail)

        prompt = f"""You are a construction site safety manager writing an official daily safety report.

SAFETY DATA:
Date: {date}
Total violations detected: {total}
- No helmet: {no_helmet}
- No vest: {no_vest}
- Both missing (critical): {both}
- Resolved: {resolved}
Overall compliance rate: {rate:.1f}%
Peak violation hour: {peak_hour}

ZONE BREAKDOWN:
{zones_str}

Write a professional safety report in this exact JSON format. Be detailed and data-driven — reference the actual numbers above:

{{
  "executive_summary": "3-4 sentence executive summary covering overall safety posture, key risks, and required action",
  "key_findings": [
    "finding 1 — include a specific number from the data",
    "finding 2 — include a specific number from the data",
    "finding 3 — highlight the most critical pattern"
  ],
  "zone_analysis": "Detailed paragraph analyzing EACH zone's performance. Reference specific violation counts per zone. Identify which zones need immediate attention and why.",
  "trend_analysis": "Paragraph analyzing patterns: which violation type is most common, what time of day sees the most violations, whether the compliance rate is improving or declining. Be specific.",
  "immediate_actions": [
    "Urgent action 1 — specific to the data above",
    "Urgent action 2 — specific to the data above"
  ],
  "recommendations": [
    "Recommendation 1 — targeted intervention based on the data",
    "Recommendation 2 — systemic improvement suggestion",
    "Recommendation 3 — preventive measure for the future"
  ],
  "conclusion": "2 sentence closing statement summarizing the path forward"
}}

RULES:
- Be professional, specific, and data-driven — ALWAYS reference actual numbers
- zone_analysis MUST discuss each zone individually with its specific violation count
- trend_analysis MUST identify which violation type dominates and any time-based patterns
- immediate_actions MUST be urgent steps that can be taken today
- Keep executive_summary under 100 words
- Return ONLY valid JSON — no markdown, no code fences, no extra text"""

        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1200,
            temperature=0.4,
        )

        raw = response.choices[0].message.content.strip()
        result = _parse_json_response(raw)

        return {
            **result,
            "date":         date,
            "generated_by": "groq",
            "model":        GROQ_MODEL,
            "generated_at": datetime.utcnow().isoformat(),
            "raw_data":     alerts_data,
        }

    except Exception as e:
        print(f"⚠️  Groq generate_daily_report FAILED:")
        print(f"    Exception: {e}")
        traceback.print_exc()
        return _fallback_report(alerts_data)


async def generate_alert_insight(alert: dict) -> str:
    """
    Generate a one-line human-readable explanation for a single alert.
    Used in the Alerts list to show an AI insight under each alert row.

    Returns a plain string (not JSON).
    """
    if not _is_configured():
        return _fallback_alert_insight(alert)

    try:
        client    = _get_client()
        violation = alert.get("violation_type", "unknown").replace("_", " ")
        zone      = alert.get("zone", "unknown zone")
        severity  = alert.get("severity", "medium")
        worker_id = alert.get("worker_id", "unknown")

        prompt = (
            f"A construction worker (ID #{worker_id}) was detected in {zone} "
            f"with a {severity} safety violation: {violation}. "
            f"Write one short, urgent sentence (max 20 words) explaining the risk "
            f"and what a site supervisor should do right now. Be direct."
        )

        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=60,
            temperature=0.5,
        )

        return response.choices[0].message.content.strip().strip('"')

    except Exception as e:
        print(f"⚠️  Groq alert insight FAILED:")
        print(f"    Exception: {e}")
        traceback.print_exc()
        return _fallback_alert_insight(alert)


# ── Fallback responses (when Groq is not configured) ─────────
# These use rule-based logic instead of AI

def _fallback_analysis(data: dict) -> dict:
    rate    = data.get("compliance_rate", 0)
    both    = data.get("no_helmet_and_no_vest", 0)
    total   = data.get("total_workers", 0)
    zone    = data.get("zone", "this zone")
    no_h    = data.get("no_helmet", 0)
    no_v    = data.get("no_vest", 0)

    if rate < 50:
        level = "critical"
    elif rate < 70:
        level = "high"
    elif rate < 85:
        level = "medium"
    else:
        level = "low"

    return {
        "insight": (
            f"Safety analysis for {zone}: {total} workers detected, {rate:.1f}% compliance. "
            f"{no_h} missing helmets, {no_v} missing vests, {both} missing both."
        ),
        "risk_level":      level,
        "top_concern":     f"{both} workers missing both helmet and vest" if both > 0 else "General PPE non-compliance",
        "recommendations": [
            "Immediately dispatch a safety officer to the violation zone",
            "Halt work for non-compliant workers until PPE is worn",
            "Conduct a mandatory safety briefing at the next shift change",
        ],
        "generated_by": "rule_based",
        "model":        "none",
        "generated_at": datetime.utcnow().isoformat(),
        "note":         "Add GROQ_API_KEY to backend/.env for AI-powered insights",
    }


def _fallback_report(data: dict) -> dict:
    rate  = data.get("compliance_rate", 0)
    total = data.get("total_alerts", 0)
    date  = data.get("date", datetime.utcnow().strftime("%Y-%m-%d"))
    no_h  = data.get("no_helmet", 0)
    no_v  = data.get("no_vest", 0)
    both  = data.get("no_helmet_and_no_vest", 0)
    zones = data.get("zones", {})
    top_zone = max(zones, key=zones.get) if zones else "N/A"

    return {
        "executive_summary": (
            f"On {date}, the construction site recorded {total} safety violations "
            f"({no_h} no helmet, {no_v} no vest, {both} both missing) "
            f"with an overall compliance rate of {rate:.1f}%. "
            f"The most affected zone was {top_zone}. "
            f"Immediate corrective actions are recommended to improve site safety."
        ),
        "key_findings": [
            f"Total violations: {total}",
            f"Compliance rate: {rate:.1f}%",
            f"High-risk incidents (missing both PPE): {both}",
            f"Worst zone: {top_zone} ({zones.get(top_zone, 0)} violations)",
        ],
        "zone_analysis": (
            f"Zone-by-zone breakdown: {', '.join([f'{z}: {c} violations' for z, c in sorted(zones.items(), key=lambda x: -x[1])])}. "
            f"The highest violation zone is {top_zone} with {zones.get(top_zone, 0)} incidents, "
            f"requiring immediate supervisor attention and targeted safety interventions."
        ),
        "trend_analysis": (
            f"No helmet violations account for {no_h} of {total} total incidents "
            f"({round(no_h/total*100,1) if total else 0}%), making it the most common violation type. "
            f"No vest violations follow at {no_v} ({round(no_v/total*100,1) if total else 0}%). "
            f"Combined PPE violations (both missing) total {both} high-risk events. "
            f"Reinforcing helmet compliance would yield the greatest safety improvement."
        ),
        "immediate_actions": [
            f"Send safety supervisor to {top_zone} for immediate inspection",
            "Review all unresolved violations and assign responsibility",
            "Brief all shift workers on PPE requirements before next shift",
        ],
        "recommendations": [
            "Schedule mandatory PPE compliance training for all workers",
            "Increase supervision in high-violation zones during peak hours",
            "Configure Groq API key for AI-powered detailed report analysis",
        ],
        "conclusion": (
            f"Safety compliance at {rate:.1f}% requires immediate attention. "
            f"Consistent enforcement and regular safety briefings are essential to reduce violations."
        ),
        "date":              date,
        "generated_by":      "rule_based",
        "model":             "none",
        "generated_at":      datetime.utcnow().isoformat(),
        "note":              "Add GROQ_API_KEY to backend/.env for AI-powered reports",
        "raw_data":          data,
    }


def _fallback_alert_insight(alert: dict) -> str:
    violation = alert.get("violation_type", "unknown").replace("_", " ")
    zone      = alert.get("zone", "site")
    severity  = alert.get("severity", "medium")
    if severity == "high":
        return f"Critical: Worker in {zone} has no helmet and no vest — send safety officer immediately."
    return f"Worker in {zone} detected with {violation} — requires immediate PPE compliance check."


def get_groq_status() -> dict:
    """Return Groq configuration status (for Settings page)."""
    return {
        "configured": _is_configured(),
        "model":      GROQ_MODEL,
        "note":       "Get a free API key at https://console.groq.com",
    }
