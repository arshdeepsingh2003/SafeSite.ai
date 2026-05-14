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
    print(f"Loaded .env from {dotenv_path}")
else:
    print(f"⚠️  .env not found at {dotenv_path}, falling back to CWD")
    load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama3-70b-8192")

# ── Startup log ──────────────────────────────────────────────
if GROQ_API_KEY and GROQ_API_KEY != "your_groq_api_key_here":
    print(f"Groq API initialized successfully - model: {GROQ_MODEL}")
else:
    print(f"Groq API key missing - AI features will use rule-based fallback")
    if not GROQ_API_KEY:
        print(f"   GROQ_API_KEY is empty - check backend/.env")
    elif GROQ_API_KEY == "your_groq_api_key_here":
        print(f"   GROQ_API_KEY still set to placeholder - update it in backend/.env")


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
        violations = detection_summary.get("violations", 0)

        trend_dir  = detection_summary.get("trend_direction", "stable")
        trend_desc = detection_summary.get("trend_description", "")
        zones_obs  = detection_summary.get("zone_observations", [])

        zone_details = ""
        if zones_obs:
            for z in zones_obs:
                zone_details += f"  - {z.get('zone')}: ~{z.get('avg_workers', 0)} workers, {z.get('compliance_rate', 0)}% compliance\n"

        prompt = f"""You are a construction site safety expert analyzing real-time AI detection results from a live monitoring system.

REAL-TIME DETECTION DATA:
Zone: {zone}
- Total workers detected: {total}
- Compliant (helmet + vest): {compliant} ({rate:.1f}%)
- No helmet only: {no_helmet}
- No vest only: {no_vest}
- Missing both (HIGH RISK): {both}
- Total violations: {violations}

TREND: Violations are {trend_dir}. {trend_desc}

ZONE OBSERVATIONS:
{zone_details if zone_details else "  - Single zone active"}

Provide a safety analysis in this exact JSON format:
{{
  "insight": "2-3 sentence professional safety summary specific to this data",
  "risk_level": "low|medium|high|critical",
  "top_concern": "single biggest safety issue in one sentence",
  "recommended_action": "one specific action the site supervisor should take right now",
  "trend_analysis": "one sentence about how safety is trending based on the data",
  "compliance_percentage": "X%"
}}

Rules:
- Be specific and reference actual numbers from the data above
- risk_level is "critical" if compliance < 50%, "high" if < 70%, "medium" if < 85%, "low" otherwise
- Keep insight under 60 words
- recommended_action must be a concrete, actionable instruction
- Return ONLY the JSON, no other text"""

        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            temperature=0.3,
        )

        raw = response.choices[0].message.content.strip()
        result = _parse_json_response(raw)

        return {
            "insight":              result.get("insight", ""),
            "risk_level":           result.get("risk_level", "medium"),
            "top_concern":          result.get("top_concern", ""),
            "recommended_action":   result.get("recommended_action", ""),
            "trend_analysis":       result.get("trend_analysis", ""),
            "compliance_percentage": result.get("compliance_percentage", f"{rate:.1f}%"),
            "generated_by":         "groq",
            "model":                GROQ_MODEL,
            "generated_at":         datetime.utcnow().isoformat(),
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
  "conclusion": "2 sentence closing statement summarizing the path forward"
}}

RULES:
- Be professional, specific, and data-driven — ALWAYS reference actual numbers
- zone_analysis MUST discuss each zone individually with its specific violation count
- trend_analysis MUST identify which violation type dominates and any time-based patterns
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


async def generate_weekly_report(alerts_data: dict) -> dict:
    """Alias for weekly reports—same logic as daily, but context-aware."""
    return await generate_daily_report(alerts_data)


async def generate_upload_insight(video_analytics: dict) -> dict:
    """
    Generate a professional AI audit report for an uploaded (completed) video.
    This is a SEPARATE system from the live monitoring insights.
    
    Takes aggregated analytics from YOLO detection results and produces
    a detailed, static audit report. Generated once per video.
    Falls back to rule-based if Groq is unavailable or fails.
    """
    if not _is_configured():
        return _fallback_upload_insight(video_analytics)

    try:
        client = _get_client()

        zone               = video_analytics.get("zone", "Unknown Zone")
        total_workers      = video_analytics.get("total_workers_detected", 0)
        compliance_pct     = video_analytics.get("compliance_percentage", 0)
        peak_violations    = video_analytics.get("peak_violations", 0)
        total_violations   = video_analytics.get("total_violation_events", 0)
        no_helmet          = video_analytics.get("helmet_violations", 0)
        no_vest            = video_analytics.get("vest_violations", 0)
        both               = video_analytics.get("both_violations", 0)
        repeated           = video_analytics.get("repeated_offenders", [])
        unsafe_zones       = video_analytics.get("unsafe_zones", [])
        avg_confidence     = video_analytics.get("avg_detection_confidence", 0)
        trend              = video_analytics.get("trend_across_frames", "stable")
        severity           = video_analytics.get("severity_level", "medium")
        frames_analyzed    = video_analytics.get("frames_analyzed", 0)
        duration_sec       = video_analytics.get("duration_sec", 0)

        repeated_str = ""
        if repeated:
            for r in repeated[:5]:
                repeated_str += f"  - Worker #{r.get('worker_id')}: {r.get('violation_count')} violations\n"
        else:
            repeated_str = "  - None identified"

        zones_str = ""
        if unsafe_zones:
            for z in unsafe_zones[:5]:
                zones_str += f"  - {z.get('zone')}: {z.get('violation_count')} violations\n"
        else:
            zones_str = "  - Single zone monitored"

        prompt = f"""You are a professional construction safety auditor generating an official AI safety audit report for an uploaded video inspection.

VIDEO ANALYSIS DATA:
Zone monitored: {zone}
Duration analyzed: {duration_sec}s across {frames_analyzed} frames
Total unique workers detected: {total_workers}
Overall compliance rate: {compliance_pct}%
Total violation events: {total_violations}
Peak concurrent violations in a single frame: {peak_violations}

VIOLATION BREAKDOWN:
- No helmet only: {no_helmet}
- No vest only: {no_vest}
- Missing both helmet AND vest (HIGH RISK): {both}

DETECTION QUALITY:
Average detection confidence: {avg_confidence:.1f}%

TREND ACROSS FRAMES: {trend}

REPEATED OFFENDERS (workers with 3+ violations):
{repeated_str}

UNSAFE ZONES:
{zones_str}

Generate a comprehensive audit report in this exact JSON format. This is a FINAL REPORT, not a live update.

{{
  "executive_summary": "3-4 sentence professional executive summary covering overall safety posture, key compliance metrics, and critical risks identified in this video analysis. Be specific with numbers.",
  "risk_score": "low|medium|high|critical",
  "compliance_score": {compliance_pct},
  "key_violations": [
    {{
      "type": "no_helmet|no_vest|both_missing",
      "count": N,
      "severity": "low|medium|high|critical",
      "description": "One sentence describing this violation pattern in the video"
    }},
    {{
      "type": "...",
      "count": N,
      "severity": "...",
      "description": "..."
    }}
  ],
  "recommendations": [
    "Specific, actionable recommendation 1 — reference actual data",
    "Specific, actionable recommendation 2 — reference actual data",
    "Specific, actionable recommendation 3 — reference actual data"
  ],
  "trend_analysis": "Paragraph analyzing the violation trend across frames — whether safety compliance improved, worsened, or stayed consistent throughout the video duration. Reference the specific trend direction and violation counts.",
  "severity_level": "{severity}",
  "ai_confidence": "high|medium|low",
  "detection_quality_note": "One sentence about the quality/reliability of the detections based on average confidence of {avg_confidence:.1f}%",
  "repeated_offenders_analysis": "Analysis of repeat violation patterns — mention how many unique workers were repeat offenders and what this suggests about site safety culture"
}}

RULES:
- risk_score is "critical" if compliance_score < 50, "high" if < 70, "medium" if < 85, "low" otherwise
- ai_confidence is "high" if avg_confidence >= 85, "medium" if >= 70, "low" otherwise
- Every recommendation must be specific and data-backed
- Keep executive_summary under 120 words
- Return ONLY valid JSON — no markdown, no code fences, no extra text
- This is a STATIC final report, not a real-time update"""

        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1200,
            temperature=0.3,
        )

        raw = response.choices[0].message.content.strip()
        result = _parse_json_response(raw)

        return {
            **result,
            "generated_by": "groq",
            "model": GROQ_MODEL,
            "generated_at": datetime.utcnow().isoformat(),
            "report_type": "uploaded_video_audit",
        }

    except Exception as e:
        print(f"⚠️  Groq generate_upload_insight FAILED:")
        print(f"    Exception: {e}")
        traceback.print_exc()
        return _fallback_upload_insight(video_analytics)


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
    violations = data.get("violations", no_h + no_v + both)
    trend_dir  = data.get("trend_direction", "stable")

    if rate < 50:
        level = "critical"
    elif rate < 70:
        level = "high"
    elif rate < 85:
        level = "medium"
    else:
        level = "low"

    action = (
        "Send supervisor to enforce PPE compliance immediately."
        if level in ("high", "critical")
        else "Continue monitoring and conduct a safety brief."
    )

    return {
        "insight": (
            f"Safety analysis for {zone}: {total} workers detected, {rate:.1f}% compliance. "
            f"{no_h} missing helmets, {no_v} missing vests, {both} missing both."
        ),
        "risk_level":           level,
        "top_concern":          f"{both} workers missing both helmet and vest" if both > 0 else "General PPE non-compliance",
        "recommended_action":   action,
        "trend_analysis":       f"Violations are {trend_dir} in this zone based on recent detections.",
        "compliance_percentage": f"{rate:.1f}%",
        "generated_by":         "rule_based",
        "model":                "none",
        "generated_at":         datetime.utcnow().isoformat(),
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
        "conclusion": (
            f"Safety compliance at {rate:.1f}% requires immediate attention. "
            f"Consistent enforcement and regular safety briefings are essential to reduce violations."
        ),
        "date":              date,
        "generated_by":      "rule_based",
        "model":             "none",
        "generated_at":      datetime.utcnow().isoformat(),
        "raw_data":          data,
    }


def _fallback_alert_insight(alert: dict) -> str:
    violation = alert.get("violation_type", "unknown").replace("_", " ")
    zone      = alert.get("zone", "site")
    severity  = alert.get("severity", "medium")
    if severity == "high":
        return f"Critical: Worker in {zone} has no helmet and no vest — send safety officer immediately."
    return f"Worker in {zone} detected with {violation} — requires immediate PPE compliance check."


def _fallback_upload_insight(data: dict) -> dict:
    """Rule-based fallback for uploaded video audit report."""
    compliance_pct   = data.get("compliance_percentage", 0)
    total_workers    = data.get("total_workers_detected", 0)
    total_violations = data.get("total_violation_events", 0)
    no_h             = data.get("helmet_violations", 0)
    no_v             = data.get("vest_violations", 0)
    both             = data.get("both_violations", 0)
    zone             = data.get("zone", "Unknown Zone")
    peak             = data.get("peak_violations", 0)
    trend            = data.get("trend_across_frames", "stable")
    repeated         = data.get("repeated_offenders", [])
    severity         = data.get("severity_level", "medium")

    if compliance_pct < 50:
        risk = "critical"
    elif compliance_pct < 70:
        risk = "high"
    elif compliance_pct < 85:
        risk = "medium"
    else:
        risk = "low"

    key_violations_list = []
    if no_h > 0:
        key_violations_list.append({
            "type": "no_helmet", "count": no_h,
            "severity": "high" if no_h > 5 else "medium",
            "description": f"{no_h} workers detected without hard hats in {zone}"
        })
    if no_v > 0:
        key_violations_list.append({
            "type": "no_vest", "count": no_v,
            "severity": "high" if no_v > 5 else "medium",
            "description": f"{no_v} workers detected without safety vests in {zone}"
        })
    if both > 0:
        key_violations_list.append({
            "type": "both_missing", "count": both,
            "severity": "critical",
            "description": f"{both} workers missing BOTH helmet and vest in {zone}"
        })

    recommendations = [
        f"Conduct mandatory PPE training for all {total_workers} workers in {zone}",
        f"Increase supervisor presence during peak violation periods",
    ]
    if both > 0:
        recommendations.append("Implement zero-tolerance policy for missing both helmet and vest")
    if no_h > no_v:
        recommendations.append("Prioritize helmet compliance — distribute replacements and enforce usage")
    elif no_v > no_h:
        recommendations.append("Prioritize safety vest compliance — ensure adequate supply and visibility")

    return {
        "executive_summary": (
            f"Safety audit of {zone} analyzed {total_workers} workers across the video duration. "
            f"Overall compliance rate was {compliance_pct}% with {total_violations} total violations "
            f"({no_h} no helmet, {no_v} no vest, {both} both missing). "
            f"Peak violations reached {peak} in a single frame. "
            f"{len(repeated)} repeat offender(s) identified."
        ),
        "risk_score": risk,
        "compliance_score": compliance_pct,
        "key_violations": key_violations_list,
        "recommendations": recommendations,
        "trend_analysis": (
            f"Violation trend across the video was {trend}. "
            f"Total violation events: {total_violations} with a peak of {peak} concurrent violations. "
            f"The most common violation type was {'no helmet' if no_h >= no_v else 'no vest'}."
        ),
        "severity_level": severity,
        "ai_confidence": "medium",
        "detection_quality_note": "Rule-based analysis — detection confidence not available without Groq API",
        "repeated_offenders_analysis": (
            f"{len(repeated)} worker(s) were identified as repeat offenders. "
            "This suggests insufficient safety enforcement and a need for targeted interventions."
        ),
        "generated_by": "rule_based",
        "model": "none",
        "generated_at": datetime.utcnow().isoformat(),
        "report_type": "uploaded_video_audit",
    }


def get_groq_status() -> dict:
    """Return Groq configuration status (for Settings page)."""
    return {
        "configured": _is_configured(),
        "model":      GROQ_MODEL,
        "note":       "Get a free API key at https://console.groq.com",
    }
