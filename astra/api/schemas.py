from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class EventInput(BaseModel):
    event_cause: str
    junction: str | None = None
    corridor: str | None = None
    zone: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    hour: int = Field(ge=0, le=23)
    weekday: int = Field(ge=0, le=6)
    road_closure: bool = False
    priority_high: bool = True
    duration_override: float | None = Field(default=None, ge=0, le=168)
    veh_type: str | None = None
    event_type: str | None = None
    police_station: str | None = None

    @model_validator(mode="after")
    def _need_location(self):
        if not self.junction and (self.latitude is None or self.longitude is None):
            raise ValueError("provide either junction or latitude+longitude")
        return self


class FeedbackInput(BaseModel):
    junction: str | None = None
    event_cause: str
    hour: int | None = None
    weekday: int | None = None
    predicted_p50: float | None = None
    predicted_p90: float | None = None
    esi: float | None = None
    actual_hours: float = Field(ge=0, le=168)
    resources_used: int | None = Field(default=None, ge=0)
    diversion_corridor: str | None = None
    diversion_effective: str | None = None
    notes: str | None = None


class DirectionsRequest(BaseModel):
    source: str
    destination: str


class MatrixRequest(BaseModel):
    sources: list[str]
    destinations: list[str]
