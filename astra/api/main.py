from __future__ import annotations

import math
from contextlib import asynccontextmanager

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .. import config
from ..integrations import mappls
from ..pipeline import AstraPipeline
from .schemas import DirectionsRequest, EventInput, FeedbackInput, MatrixRequest

state: dict = {}


def _records(df):
    return df.astype(object).where(df.notna(), None).to_dict(orient="records")


def _clean(obj):
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean(v) for v in obj]
    return obj


def _dominant_attr(df, col):
    if col not in df.columns or "junction" not in df.columns:
        return {}
    tmp = pd.DataFrame({
        "junction": df["junction"].astype("string").str.strip(),
        "val": df[col].astype("string").str.strip(),
    })
    tmp = tmp[(tmp["junction"].notna()) & (tmp["junction"] != "") & (tmp["val"].notna()) & (tmp["val"] != "")]
    if tmp.empty:
        return {}
    return tmp.groupby("junction")["val"].agg(lambda s: s.mode().iloc[0]).to_dict()


@asynccontextmanager
async def lifespan(app: FastAPI):
    state["pipeline"] = AstraPipeline.load()
    junctions = pd.read_parquet(config.JUNCTION_RISK)
    clean = pd.read_parquet(config.EVENTS_CLEAN)
    junctions["police_station"] = junctions["junction"].map(_dominant_attr(clean, "police_station"))
    junctions["zone"] = junctions["junction"].map(_dominant_attr(clean, "zone"))
    state["junctions"] = junctions
    state["corridors"] = pd.read_parquet(config.CORRIDOR_RISK)
    state["events"] = pd.read_parquet(config.EVENTS_SCORED)
    yield
    state.clear()


app = FastAPI(title="ASTRA API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "loaded": "pipeline" in state}


@app.post("/api/predict")
def predict(event: EventInput):
    try:
        return _clean(state["pipeline"].analyze(event.model_dump()))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/feedback")
def add_feedback(fb: FeedbackInput):
    store = state["pipeline"].feedback
    store.add(fb.model_dump())
    return {"saved": True, "summary": store.summary()}


@app.get("/api/feedback/summary")
def feedback_summary():
    return state["pipeline"].feedback.summary()


@app.get("/api/junctions")
def junctions():
    df = state["junctions"]
    cols = ["junction", "lat", "lon", "incident_count", "avg_duration", "road_closure_rate", "risk_score", "police_station", "zone"]
    return _records(df[[c for c in cols if c in df.columns]])


@app.get("/api/corridors")
def corridors():
    return _records(state["corridors"])


@app.get("/api/events")
def events(limit: int = 2000):
    df = state["events"]
    cols = ["id", "latitude", "longitude", "event_cause", "esi", "risk_level", "start_datetime"]
    sub = df[[c for c in cols if c in df.columns]].copy()
    sub = sub.sort_values("start_datetime", ascending=False).head(limit)
    sub["start_datetime"] = sub["start_datetime"].astype(str)
    return _records(sub)


@app.get("/api/mappls/status")
def mappls_status():
    return {"configured": mappls.configured()}


@app.get("/api/mappls/token")
def mappls_token():
    if not mappls.configured():
        raise HTTPException(status_code=503, detail="MapMyIndia credentials not configured")
    try:
        return {"token": mappls.get_token()}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.post("/api/mappls/directions")
def mappls_directions(req: DirectionsRequest):
    if not mappls.configured():
        raise HTTPException(status_code=503, detail="MapMyIndia credentials not configured")
    try:
        return mappls.directions(req.source, req.destination)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.post("/api/mappls/matrix")
def mappls_matrix(req: MatrixRequest):
    if not mappls.configured():
        raise HTTPException(status_code=503, detail="MapMyIndia credentials not configured")
    try:
        return mappls.distance_matrix(req.sources, req.destinations)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.get("/api/stats/overview")
def overview():
    df = state["events"]
    counts = df["risk_level"].value_counts().to_dict()
    top = _records(
        state["junctions"]
        .sort_values("risk_score", ascending=False)
        .head(10)[["junction", "incident_count", "risk_score"]]
    )
    return {
        "total_events": int(len(df)),
        "by_risk": {k: int(counts.get(k, 0)) for k in ("LOW", "MEDIUM", "HIGH", "CRITICAL")},
        "mean_esi": round(float(df["esi"].mean()), 1),
        "junction_count": int(len(state["junctions"])),
        "corridor_count": int(len(state["corridors"])),
        "top_junctions": top,
    }
