import pytest

pytest.importorskip("httpx")
from fastapi.testclient import TestClient

from astra.api.main import app


def test_endpoints():
    with TestClient(app) as client:
        assert client.get("/api/health").json()["status"] == "ok"

        r = client.post(
            "/api/predict",
            json={
                "event_cause": "procession",
                "junction": "SilkBoardJunc",
                "hour": 18,
                "weekday": 4,
                "road_closure": True,
                "priority_high": True,
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert 0 <= body["esi"] <= 100
        assert body["risk_level"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
        assert body["impact_radius_km"] > 0
        assert body["resources"]["police"]["recommended"] > 0
        assert len(body["affected_junctions"]) > 0

        bad = client.post("/api/predict", json={"event_cause": "accident", "hour": 9, "weekday": 1})
        assert bad.status_code in (400, 422)

        assert len(client.get("/api/junctions").json()) == 294
        assert client.get("/api/stats/overview").json()["total_events"] == 8173

        status = client.get("/api/mappls/status").json()
        assert "configured" in status
        if not status["configured"]:
            assert client.get("/api/mappls/token").status_code == 503
