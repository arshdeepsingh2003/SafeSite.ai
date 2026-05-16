import time
from collections import deque
from datetime import datetime
from time_utils import istnow


class DetectionAggregator:
    """
    Accumulates detection snapshots over rolling time windows
    and computes trends, zone stats, and significant changes.
    """

    def __init__(self, window_seconds=30, trend_window_seconds=120):
        self.window_seconds = window_seconds
        self.trend_window_seconds = trend_window_seconds
        self._snapshots: deque[dict] = deque()
        self._last_insight: dict | None = None
        self._last_insight_time: float = 0.0

    def add_snapshot(self, data: dict):
        now = time.time()
        summary = data.get("summary", {})
        zone = data.get("zone", "Unknown")
        camera = data.get("camera", "Unknown")
        detections = data.get("detections", [])

        snapshot = {
            "_time": now,
            "zone": zone,
            "camera": camera,
            "total_workers": summary.get("total_workers", 0),
            "compliant": summary.get("compliant", 0),
            "no_helmet": summary.get("no_helmet", 0),
            "no_vest": summary.get("no_vest", 0),
            "no_helmet_and_no_vest": summary.get("no_helmet_and_no_vest", 0),
            "violations": summary.get("violations", 0),
            "detection_count": len(detections),
        }

        self._snapshots.append(snapshot)
        self._trim()

    def _trim(self):
        cutoff = time.time() - self.trend_window_seconds
        while self._snapshots and self._snapshots[0]["_time"] < cutoff:
            self._snapshots.popleft()

    @property
    def has_data(self) -> bool:
        return len(self._snapshots) > 0

    @property
    def latest(self) -> dict | None:
        return self._snapshots[-1] if self._snapshots else None

    def get_current_aggregate(self) -> dict:
        if not self._snapshots:
            return {}

        recent = list(self._snapshots)
        total = len(recent)
        avg = lambda key: round(sum(s.get(key, 0) for s in recent) / total, 1)

        latest = recent[-1]

        return {
            "total_workers": int(avg("total_workers")),
            "compliant": int(avg("compliant")),
            "no_helmet": int(avg("no_helmet")),
            "no_vest": int(avg("no_vest")),
            "no_helmet_and_no_vest": int(avg("no_helmet_and_no_vest")),
            "violations": int(avg("violations")),
            "compliance_rate": round(
                (avg("compliant") / max(avg("total_workers"), 1)) * 100, 1
            ),
            "zone": latest.get("zone", "Unknown"),
            "camera": latest.get("camera", "Unknown"),
        }

    def get_trend(self) -> dict:
        if len(self._snapshots) < 4:
            return {"direction": "stable", "description": "Insufficient data for trend analysis"}

        snapshots = list(self._snapshots)
        half = len(snapshots) // 2
        older = snapshots[:half]
        newer = snapshots[half:]

        old_violations = sum(s.get("violations", 0) for s in older) / max(len(older), 1)
        new_violations = sum(s.get("violations", 0) for s in newer) / max(len(newer), 1)

        delta = new_violations - old_violations

        if delta > 1.5:
            direction = "increasing"
            desc = f"Violations rising: +{delta:.1f} avg increase in recent period"
        elif delta < -1.5:
            direction = "decreasing"
            desc = f"Violations falling: {abs(delta):.1f} avg decrease — safety improving"
        else:
            direction = "stable"
            desc = "Violation levels are stable"

        old_compliant = sum(s.get("compliant", 0) for s in older) / max(len(older), 1)
        new_compliant = sum(s.get("compliant", 0) for s in newer) / max(len(newer), 1)
        old_rate = old_compliant / max(old_compliant + old_violations, 1) * 100
        new_rate = new_compliant / max(new_compliant + new_violations, 1) * 100

        return {
            "direction": direction,
            "description": desc,
            "delta": round(delta, 2),
            "old_avg_violations": round(old_violations, 1),
            "new_avg_violations": round(new_violations, 1),
            "old_compliance_rate": round(old_rate, 1),
            "new_compliance_rate": round(new_rate, 1),
        }

    def get_zone_observations(self) -> list[dict]:
        if not self._snapshots:
            return []

        snapshots = list(self._snapshots)
        zones: dict[str, dict] = {}
        for s in snapshots:
            z = s.get("zone", "Unknown")
            if z not in zones:
                zones[z] = {"zone": z, "total_workers": 0, "violations": 0, "samples": 0}
            zones[z]["total_workers"] += s.get("total_workers", 0)
            zones[z]["violations"] += s.get("violations", 0)
            zones[z]["samples"] += 1

        result = []
        for z, data in zones.items():
            samples = max(data["samples"], 1)
            avg_workers = data["total_workers"] / samples
            avg_violations = data["violations"] / samples
            rate = round((1 - avg_violations / max(avg_workers, 1)) * 100, 1) if avg_workers > 0 else 100
            result.append({
                "zone": z,
                "avg_workers": round(avg_workers, 1),
                "avg_violations": round(avg_violations, 1),
                "compliance_rate": rate,
                "samples": data["samples"],
            })

        result.sort(key=lambda x: x["avg_violations"], reverse=True)
        return result

    def has_changed_significantly(self, threshold_pct=15) -> bool:
        if not self._last_insight or len(self._snapshots) < 4:
            return True

        current = self.get_current_aggregate()
        if not current:
            return False

        last_total = self._last_insight.get("total_workers", 0)
        curr_total = current.get("total_workers", 0)
        last_rate = self._last_insight.get("compliance_rate", 100)
        curr_rate = current.get("compliance_rate", 100)

        worker_delta = abs(curr_total - last_total) / max(last_total, 1) * 100
        rate_delta = abs(curr_rate - last_rate) / max(last_rate, 1) * 100

        return worker_delta > threshold_pct or rate_delta > threshold_pct

    def set_last_insight(self, insight: dict):
        agg = self.get_current_aggregate()
        self._last_insight = agg
        self._last_insight_time = time.time()

    def should_regenerate(self, min_interval=8) -> bool:
        if not self._last_insight:
            return True
        if time.time() - self._last_insight_time < min_interval:
            return False
        return self.has_changed_significantly()

    def build_groq_payload(self) -> dict:
        agg = self.get_current_aggregate()
        trend = self.get_trend()
        zones = self.get_zone_observations()

        if not agg:
            return {}

        payload = {
            "zone": agg.get("zone", "Unknown"),
            "total_workers": agg.get("total_workers", 0),
            "compliant": agg.get("compliant", 0),
            "no_helmet": agg.get("no_helmet", 0),
            "no_vest": agg.get("no_vest", 0),
            "no_helmet_and_no_vest": agg.get("no_helmet_and_no_vest", 0),
            "compliance_rate": agg.get("compliance_rate", 0),
            "violations": agg.get("violations", 0),
            "trend_direction": trend.get("direction", "stable"),
            "trend_description": trend.get("description", ""),
            "zone_observations": zones,
            "generated_at": istnow().isoformat(),
        }
        return payload
