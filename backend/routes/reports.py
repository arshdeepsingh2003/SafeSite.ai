from fastapi import APIRouter, Depends, HTTPException, Query
from database import alerts_collection, reports_collection
from services.auth_service import get_current_user
from services.groq_service import generate_daily_report
from datetime import datetime, timedelta
from bson import ObjectId
from fastapi.responses import PlainTextResponse

router = APIRouter(prefix="/reports", tags=["Reports"])


# ── GET /reports ─────────────────────────────────────────────
@router.get("")
async def list_reports(
    type_filter: str = Query(default="all", alias="type"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=5, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    """List saved reports with pagination and type filter."""
    query = {}
    if type_filter and type_filter != "all":
        query["type"] = type_filter

    total = await reports_collection.count_documents(query)
    cursor = reports_collection.find(query).sort("created_at", -1).skip((page - 1) * limit).limit(limit)
    reports = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        reports.append(doc)

    return {
        "reports": reports,
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": max(1, -(-total // limit)),
    }


# ── GET /reports/summary ─────────────────────────────────────
@router.get("/summary")
async def reports_summary(current_user: dict = Depends(get_current_user)):
    """Summary stats for the Reports page header."""
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=6)

    total_reports = await reports_collection.count_documents({})
    recent_reports = await reports_collection.count_documents({"created_at": {"$gte": week_start}})

    today_alerts = await alerts_collection.count_documents({"created_at": {"$gte": today_start}})
    week_alerts = await alerts_collection.count_documents({"created_at": {"$gte": week_start}})

    total_workers_today = len(await alerts_collection.distinct("worker_id", {"created_at": {"$gte": today_start}}))
    high_risk_today = await alerts_collection.count_documents({
        "created_at": {"$gte": today_start},
        "violation_type": "no_helmet_and_no_vest",
    })
    # Count all violations as distinct workers with any violation today
    violation_workers_today = len(await alerts_collection.distinct("worker_id", {
        "created_at": {"$gte": today_start},
        "violation_type": {"$ne": None},
    }))

    prev_week_start = week_start - timedelta(days=7)
    prev_week_violations = await alerts_collection.count_documents({
        "created_at": {"$gte": prev_week_start, "$lt": week_start},
    })

    change_pct = 0
    if prev_week_violations > 0:
        change_pct = round(((week_alerts - prev_week_violations) / prev_week_violations) * 100, 1)

    compliance_rate = max(0, 100 - (today_alerts * 3)) if today_alerts > 0 else 95.0

    # Zone breakdown for reports summary
    zone_pipeline = [
        {"$match": {"created_at": {"$gte": today_start}}},
        {"$group": {"_id": "$zone", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    zones_list = []
    async for doc in alerts_collection.aggregate(zone_pipeline):
        zones_list.append(doc["_id"])

    return {
        "total_reports": total_reports,
        "compliance_rate": compliance_rate,
        "total_violations": today_alerts,
        "workers_detected": max(total_workers_today, 1),
        "high_risk_alerts": high_risk_today,
        "total_cameras": 5,
        "zones_affected": zones_list,
        "top_violation_zone": zones_list[0] if zones_list else "Unknown",
        "changes": {
            "compliance_rate": 0,
            "total_violations": change_pct,
            "workers_detected": 0,
            "high_risk_alerts": 0,
        },
    }


# ── POST /reports/generate ───────────────────────────────────
@router.post("/generate")
async def generate_report(
    type: str = Query(default="daily"),
    zone: str = Query(default="all"),
    site: str = Query(default="all"),
    current_user: dict = Depends(get_current_user),
):
    """Generate a safety report (daily/weekly) via Groq and save it."""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if type == "weekly":
        period_start = today_start - timedelta(days=6)
        date_range = f"{period_start.strftime('%b %d')} – {now.strftime('%b %d, %Y')}"
        report_name = f"Weekly Safety Report — {period_start.strftime('%b %d')} to {now.strftime('%b %d')}"
    else:
        period_start = today_start
        date_range = today_start.strftime("%b %d, %Y")
        report_name = f"Daily Safety Report — {today_start.strftime('%b %d, %Y')}"

    # Build match filter
    match_filter = {"created_at": {"$gte": period_start, "$lt": now}}
    if zone and zone != "all":
        match_filter["zone"] = zone
    if site and site != "all":
        match_filter["site"] = site

    # Aggregate violations
    pipeline = [
        {"$match": match_filter},
        {"$group": {"_id": "$violation_type", "count": {"$sum": 1}}},
    ]
    counts = {"no_helmet": 0, "no_vest": 0, "no_helmet_and_no_vest": 0}
    total_alerts = 0
    async for doc in alerts_collection.aggregate(pipeline):
        vtype = doc["_id"]
        count = doc["count"]
        total_alerts += count
        if vtype in counts:
            counts[vtype] = count

    # Zone breakdown
    zone_pipeline = [
        {"$match": match_filter},
        {"$group": {"_id": "$zone", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    zones = {}
    async for doc in alerts_collection.aggregate(zone_pipeline):
        zones[doc["_id"]] = doc["count"]

    resolved = await alerts_collection.count_documents({**match_filter, "resolved": True})
    compliance_rate = max(0, 100 - (total_alerts * 2)) if total_alerts > 0 else 95.0

    alerts_data = {
        "date": date_range,
        "total_alerts": total_alerts,
        "no_helmet": counts["no_helmet"],
        "no_vest": counts["no_vest"],
        "no_helmet_and_no_vest": counts["no_helmet_and_no_vest"],
        "resolved": resolved,
        "zones": zones,
        "peak_hour": "N/A",
        "compliance_rate": compliance_rate,
    }

    groq_result = await generate_daily_report(alerts_data)

    # Build top_zones array
    top_zones = [{"zone": z, "count": c} for z, c in sorted(zones.items(), key=lambda x: -x[1])]

    report_doc = {
        "name": report_name,
        "type": type,
        "zone": zone,
        "site": site,
        "date_range": date_range,
        "stats": {
            "total_workers": total_alerts or 1,
            "compliance_rate": compliance_rate,
            "total_violations": total_alerts,
            "high_risk_alerts": counts["no_helmet_and_no_vest"],
        },
        "llm_summary": groq_result.get("executive_summary", ""),
        "llm_full": groq_result,
        "top_zones": top_zones,
        "created_at": now,
        "generated_by": groq_result.get("generated_by", "groq"),
    }

    result = await reports_collection.insert_one(report_doc)
    report_doc["id"] = str(result.inserted_id)
    del report_doc["_id"]

    return report_doc


# ── GET /reports/{id} ────────────────────────────────────────
@router.get("/{report_id}")
async def get_report(
    report_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a single report by ID."""
    try:
        doc = await reports_collection.find_one({"_id": ObjectId(report_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid report ID format")

    if not doc:
        raise HTTPException(status_code=404, detail="Report not found")

    doc["id"] = str(doc.pop("_id"))
    return doc


# ── GET /reports/{id}/download ───────────────────────────────
@router.get("/{report_id}/download")
async def download_report(
    report_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Download a report as a .txt file."""
    try:
        doc = await reports_collection.find_one({"_id": ObjectId(report_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid report ID format")

    if not doc:
        raise HTTPException(status_code=404, detail="Report not found")

    llm = doc.get("llm_full", {})
    stats = doc.get("stats", {})

    lines = [
        f"{'='*60}",
        f"  SafeSite AI — Safety Report",
        f"  {doc.get('name', 'Report')}",
        f"{'='*60}",
        f"",
        f"  Date Range:     {doc.get('date_range', 'N/A')}",
        f"  Type:           {doc.get('type', 'daily').title()}",
        f"  Site:           {doc.get('site', 'All Sites')}",
        f"  Zone:           {doc.get('zone', 'All Zones')}",
        f"  Generated:      {doc.get('created_at', 'N/A')}",
        f"  Generated By:   {doc.get('generated_by', 'N/A')}",
        f"",
        f"{'─'*60}",
        f"  EXECUTIVE SUMMARY",
        f"{'─'*60}",
        f"  {llm.get('executive_summary', 'N/A')}",
        f"",
        f"{'─'*60}",
        f"  KEY STATISTICS",
        f"{'─'*60}",
        f"  Total Workers:      {stats.get('total_workers', 0)}",
        f"  Compliance Rate:    {stats.get('compliance_rate', 0)}%",
        f"  Total Violations:   {stats.get('total_violations', 0)}",
        f"  High Risk Alerts:   {stats.get('high_risk_alerts', 0)}",
        f"",
        f"{'─'*60}",
        f"  KEY FINDINGS",
        f"{'─'*60}",
    ]

    for finding in llm.get("key_findings", []):
        lines.append(f"  • {finding}")

    lines += [
        f"",
        f"{'─'*60}",
        f"  ZONE ANALYSIS",
        f"{'─'*60}",
        f"  {llm.get('zone_analysis', 'N/A')}",
        f"",
        f"{'─'*60}",
        f"  TREND ANALYSIS",
        f"{'─'*60}",
        f"  {llm.get('trend_analysis', 'N/A')}",
        f"",
        f"{'─'*60}",
        f"  TOP VIOLATION ZONES",
        f"{'─'*60}",
    ]

    for z in doc.get("top_zones", []):
        lines.append(f"  • {z['zone']}: {z['count']} violations")

    lines += [
        f"",
        f"{'─'*60}",
        f"  IMMEDIATE ACTIONS",
        f"{'─'*60}",
    ]
    for action in llm.get("immediate_actions", []):
        lines.append(f"  □ {action}")

    lines += [
        f"",
        f"{'─'*60}",
        f"  RECOMMENDATIONS",
        f"{'─'*60}",
    ]
    for rec in llm.get("recommendations", []):
        lines.append(f"  → {rec}")

    lines += [
        f"",
        f"{'─'*60}",
        f"  CONCLUSION",
        f"{'─'*60}",
        f"  {llm.get('conclusion', 'N/A')}",
        f"",
        f"{'='*60}",
        f"  SafeSite AI — Construction Safety Monitoring",
        f"  Generated on {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        f"{'='*60}",
    ]

    text = "\n".join(lines)
    filename = f"safesite_report_{doc.get('type', 'report')}_{doc.get('date_range', 'unknown').replace(' ', '_').replace('–', 'to')}.txt"

    return PlainTextResponse(
        content=text,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── DELETE /reports/{id} ─────────────────────────────────────
@router.delete("/{report_id}")
async def delete_report(
    report_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a report."""
    try:
        result = await reports_collection.delete_one({"_id": ObjectId(report_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid report ID format")

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")

    return {"message": "Report deleted"}
