# ============================================================
# SafeSite AI — Seed Reports  (Phase 12)
# File: backend/seed_reports.py
# Run with: python seed_reports.py
#
# Creates sample saved reports in MongoDB so the
# Generated Reports table shows data immediately.
# ============================================================

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os

load_dotenv()

MONGODB_URL   = os.getenv("MONGO_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME")

SAMPLE_REPORTS = [
    {
        "name":       "Daily Safety Report",
        "type":       "daily",
        "date_range": datetime.utcnow().strftime("%B %d, %Y"),
        "site":       "Main Construction Site",
        "zone":       "all",
        "stats": {
            "total_workers": 128, "compliant": 85,
            "no_helmet": 24, "no_vest": 13, "no_helmet_and_no_vest": 6,
            "total_violations": 43, "compliance_rate": 66.4,
            "high_risk_alerts": 6,
        },
        "top_zones": [
            {"zone": "Zone B", "count": 28},
            {"zone": "Zone C", "count": 17},
            {"zone": "Zone A", "count": 11},
            {"zone": "Zone D", "count": 5},
        ],
        "llm_summary": (
            "Today, 43 safety violations were detected across all zones. "
            "Zone B had the highest number (28), mostly workers without helmets. "
            "Compliance rate stands at 66.4%, which is below the 75% target. "
            "Immediate supervisory action is recommended for Zone B. "
            "Vest compliance improved by 3.2% compared to yesterday."
        ),
    },
    {
        "name":       "Weekly Safety Report",
        "type":       "weekly",
        "date_range": f"{(datetime.utcnow()-timedelta(days=7)).strftime('%b %d')} - {datetime.utcnow().strftime('%b %d, %Y')}",
        "site":       "Main Construction Site",
        "zone":       "all",
        "stats": {
            "total_workers": 892, "compliant": 595,
            "no_helmet": 168, "no_vest": 92, "no_helmet_and_no_vest": 37,
            "total_violations": 297, "compliance_rate": 66.7,
            "high_risk_alerts": 37,
        },
        "top_zones": [
            {"zone": "Zone A", "count": 168},
            {"zone": "Zone B", "count": 112},
            {"zone": "Zone C", "count": 78},
            {"zone": "Zone D", "count": 48},
        ],
        "llm_summary": (
            "This week's analysis reveals 297 total violations across all monitored zones. "
            "Zone A continues to lead with 168 violations (41.4% of total), primarily helmet-related. "
            "Compliance improved from 60.2% to 66.7% over the week, indicating positive trend. "
            "High-risk incidents (workers missing both PPE items) numbered 37 — each requires immediate response. "
            "Recommend increased morning briefings and spot checks in Zone A."
        ),
    },
    {
        "name":       "Zone A Safety Report",
        "type":       "zone",
        "date_range": f"{(datetime.utcnow()-timedelta(days=7)).strftime('%b %d')} - {datetime.utcnow().strftime('%b %d, %Y')}",
        "site":       "Main Construction Site",
        "zone":       "Zone A",
        "stats": {
            "total_workers": 412, "compliant": 238,
            "no_helmet": 78, "no_vest": 54, "no_helmet_and_no_vest": 42,
            "total_violations": 174, "compliance_rate": 57.8,
            "high_risk_alerts": 42,
        },
        "top_zones": [{"zone": "Zone A", "count": 174}],
        "llm_summary": (
            "Zone A has a compliance rate of only 57.8%, significantly below site average. "
            "42 high-risk incidents (both PPE missing) require urgent management attention. "
            "Helmet compliance is the primary issue — 78 workers detected without helmets. "
            "Recommend: mandatory PPE check at zone entry, additional safety officer deployment, "
            "and daily zone briefings until compliance exceeds 75%."
        ),
    },
    {
        "name":       "Monthly Safety Report",
        "type":       "monthly",
        "date_range": f"{(datetime.utcnow()-timedelta(days=30)).strftime('%b %d')} - {datetime.utcnow().strftime('%b %d, %Y')}",
        "site":       "all",
        "zone":       "all",
        "stats": {
            "total_workers": 3840, "compliant": 2597,
            "no_helmet": 712, "no_vest": 396, "no_helmet_and_no_vest": 135,
            "total_violations": 1243, "compliance_rate": 67.6,
            "high_risk_alerts": 135,
        },
        "top_zones": [
            {"zone": "Zone A", "count": 512},
            {"zone": "Zone B", "count": 341},
            {"zone": "Zone C", "count": 228},
            {"zone": "Zone D", "count": 162},
        ],
        "llm_summary": (
            "Monthly analysis shows 1,243 violations with an overall compliance rate of 67.6%. "
            "This represents a 5.3% improvement from last month (62.3%). "
            "No-helmet violations remain the dominant issue at 57.3% of all incidents. "
            "High-risk incidents decreased by 18% — indicating improved awareness for the most serious violations. "
            "Target for next month: achieve 72% compliance across all zones. "
            "Recommended actions: helmet distribution campaign in Zone A and B, "
            "and supervisor accountability program for zones below 65% compliance."
        ),
    },
    {
        "name":       "Custom Report",
        "type":       "custom",
        "date_range": f"{(datetime.utcnow()-timedelta(days=3)).strftime('%b %d')} - {datetime.utcnow().strftime('%b %d, %Y')}",
        "site":       "Main Construction Site",
        "zone":       "Zone B, Zone C",
        "stats": {
            "total_workers": 326, "compliant": 226,
            "no_helmet": 48, "no_vest": 28, "no_helmet_and_no_vest": 24,
            "total_violations": 100, "compliance_rate": 69.3,
            "high_risk_alerts": 24,
        },
        "top_zones": [
            {"zone": "Zone B", "count": 58},
            {"zone": "Zone C", "count": 42},
        ],
        "llm_summary": (
            "Custom 3-day report for Zone B and Zone C shows combined compliance of 69.3%. "
            "Zone B (58 violations) outpaces Zone C (42 violations) in non-compliance. "
            "Vest compliance is particularly low in Zone B at 8.6%. "
            "Recommend targeted vest distribution and morning PPE checks for both zones."
        ),
    },
]


async def seed():
    client = AsyncIOMotorClient(MONGODB_URL)
    db     = client[DATABASE_NAME]
    reports_col = db["reports"]

    # Remove old sample reports
    deleted = await reports_col.delete_many({"_seeded": True})
    print(f"🗑  Removed {deleted.deleted_count} old seed records")

    now = datetime.utcnow()
    docs = []
    for i, r in enumerate(SAMPLE_REPORTS):
        doc = {
            **r,
            "generated_on": now - timedelta(hours=i * 2),
            "generated_by": "seed_script",
            "_seeded": True,
            "full_text": "\n".join([
                f"SafeSite AI — {r['type'].title()} Safety Report",
                f"Period: {r['date_range']}",
                f"Site: {r['site']}  |  Zone: {r['zone']}",
                "=" * 60,
                "",
                "EXECUTIVE SUMMARY",
                "-" * 40,
                r["llm_summary"],
                "",
                "VIOLATION STATISTICS",
                "-" * 40,
                f"Total Workers Detected:    {r['stats']['total_workers']}",
                f"Total Violations:          {r['stats']['total_violations']}",
                f"  No Helmet:               {r['stats']['no_helmet']}",
                f"  No Vest:                 {r['stats']['no_vest']}",
                f"  No Helmet & No Vest:     {r['stats']['no_helmet_and_no_vest']}",
                f"Compliance Rate:           {r['stats']['compliance_rate']}%",
                f"High Risk Alerts:          {r['stats']['high_risk_alerts']}",
                "",
                "TOP VIOLATION ZONES",
                "-" * 40,
            ] + [f"  {z['zone']}: {z['count']} violations" for z in r["top_zones"]] + [
                "",
                "=" * 60,
                "Generated by SafeSite AI — Powered by Groq LLaMA 3",
            ]),
        }
        docs.append(doc)

    if docs:
        await reports_col.insert_many(docs)
        print(f"✅ Seeded {len(docs)} sample reports")
        print()
        for r in docs:
            print(f"  📄 {r['name']} ({r['type']}) — {r['date_range']}")

    client.close()
    print()
    print("🎉 Done! Open /reports to see the table.")


if __name__ == "__main__":
    asyncio.run(seed())