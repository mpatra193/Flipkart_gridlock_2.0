from __future__ import annotations

import json
import time
from collections import Counter
from dataclasses import dataclass, field

import numpy as np

from .. import config

FIELDS = (
    "junction", "event_cause", "hour", "weekday",
    "predicted_p50", "predicted_p90", "esi",
    "actual_hours", "resources_used", "diversion_corridor",
    "diversion_effective", "notes", "delay_factors", "notes_summary", "ts",
)


@dataclass
class FeedbackStore:
    path: object = config.FEEDBACK_PATH
    records: list = field(default_factory=list)

    @classmethod
    def load(cls, path=config.FEEDBACK_PATH):
        store = cls(path=path, records=[])
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            store.records.append(json.loads(line))
                        except json.JSONDecodeError:
                            continue
        return store

    def add(self, record: dict) -> dict:
        clean = {k: record.get(k) for k in FIELDS}
        clean["ts"] = clean.get("ts") or time.time()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps(clean) + "\n")
        self.records.append(clean)
        return clean

    def _ratios(self, recs):
        out = []
        for r in recs:
            a, p = r.get("actual_hours"), r.get("predicted_p50")
            if a is not None and p:
                out.append(float(a) / max(float(p), 1e-6))
        return out

    def _shrunk(self, ratios):
        k = config.CALIBRATION_K
        n = len(ratios)
        mean = sum(ratios) / n
        factor = (n * mean + k * 1.0) / (n + k)
        return float(np.clip(factor, config.CALIBRATION_MIN, config.CALIBRATION_MAX))

    def duration_factor(self, cause, junction):
        jc = self._ratios([r for r in self.records if r.get("event_cause") == cause and r.get("junction") == junction])
        if len(jc) >= config.CALIBRATION_MIN_JC:
            return {"factor": round(self._shrunk(jc), 3), "n": len(jc), "scope": "junction+cause"}
        c = self._ratios([r for r in self.records if r.get("event_cause") == cause])
        if c:
            return {"factor": round(self._shrunk(c), 3), "n": len(c), "scope": "cause"}
        return {"factor": 1.0, "n": 0, "scope": "none"}

    def past_reports(self, cause, junction):
        recs = [r for r in self.records if r.get("event_cause") == cause and r.get("junction") == junction and r.get("actual_hours") is not None]
        if not recs:
            return {"count": 0, "avg_actual_hours": None}
        avg = sum(float(r["actual_hours"]) for r in recs) / len(recs)
        return {"count": len(recs), "avg_actual_hours": round(avg, 2)}

    def diversion_rate(self, corridor):
        recs = [r for r in self.records if r.get("diversion_corridor") == corridor and r.get("diversion_effective")]
        if not recs:
            return None
        score = {"yes": 1.0, "partial": 0.5, "no": 0.0}
        vals = [score.get(str(r["diversion_effective"]).lower(), 0.5) for r in recs]
        k = config.CALIBRATION_K
        n = len(vals)
        rate = (sum(vals) + k * 0.5) / (n + k)
        return {"rate": round(float(rate), 3), "n": n}

    def top_delay_factors(self, cause, junction, limit=4):
        def tally(recs):
            c = Counter()
            for r in recs:
                for f in (r.get("delay_factors") or []):
                    c[f] += 1
            return c

        jc = tally([r for r in self.records if r.get("event_cause") == cause and r.get("junction") == junction])
        use = jc if jc else tally([r for r in self.records if r.get("event_cause") == cause])
        return [{"factor": k, "count": v} for k, v in use.most_common(limit)]

    def summary(self):
        causes = {}
        for r in self.records:
            causes[r.get("event_cause")] = causes.get(r.get("event_cause"), 0) + 1
        return {"total": len(self.records), "by_cause": causes}
