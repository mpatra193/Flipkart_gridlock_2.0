# ASTRA — Design Specification

Full mathematical specification of every engine, with the exact formulas,
constants, tables, and derivations as implemented. Every constant below lives in
[`astra/config.py`](astra/config.py) — the single source of truth.

---

## 1. Dataset reality

8,173 incidents, 46 columns. The design is driven by these facts:

| Column | Fill rate | Implication |
|---|---|---|
| `event_cause` | 100% (16 values after normalization) | strongest severity signal — 40× spread in median duration |
| `requires_road_closure` | 100% (676 True) | binary closure flag |
| `corridor` | 99.8% (~22 values) | strong categorical; `Non-corridor` is a catch-all, not a road |
| `latitude` / `longitude` | ~100% | primary spatial signal |
| `closed_datetime` | 38.4% | the only duration label source |
| `zone` | 42.1% (10 values) | ESI fallback tier |
| `junction` | 30.7% (294 values) | too sparse to be a key — coordinates used instead |

Cause normalization folds case/label variants onto canonical keys
(`Debris`/`debris`→`debris`, `Fog / Low Visibility`→`fog_low_visibility`).

Duration label after cleaning (drop ≤0 h, drop >168 h): **2,711 usable rows.**

Physical start→end span: median **13 m**, 99th percentile 6.6 km. Useless as a
feature — the meaningful spatial quantity is the *modelled* impact radius.

---

## 2. Data foundation

### 2.1 Haversine

For points (φ₁,λ₁),(φ₂,λ₂) in radians, R = 6371 km:

```
a = sin²(Δφ/2) + cos φ₁ · cos φ₂ · sin²(Δλ/2)
d = 2R · arcsin(√a)
```

Used for all straight-line distances; road distances come from the MapMyIndia
layer when configured.

### 2.2 Time features

From `start_datetime`: `hour`∈0–23, `weekday`∈0–6 (Mon=0), `month`, `is_weekend`
= [weekday ≥ 5], `is_peak` = [hour ∈ {8,9,10,17,18,19,20}], `is_night` =
[hour ∈ {0–6,22,23}].

### 2.3 Duration label

```
duration_hours = (closed_datetime − start_datetime) / 3600
```

kept only if 0 < duration ≤ 168 h; otherwise nulled (row still used for risk
tables / heatmap, just not for training).

---

## 3. Risk tables (historical memory)

Per junction / zone / corridor. Each component is normalized, combined, scaled to
0–100. Low-count locations are protected from noise by **empirical-Bayes
shrinkage** toward the global prior:

```
shrunk(value) = (n · value + κ · prior) / (n + κ),   κ = 5
```

Risk score (weights 0.4 / 0.3 / 0.3):

```
score = 100 · [ 0.4 · minmax(log1p(incident_count))
              + 0.3 · minmax(shrunk(avg_duration))
              + 0.3 · minmax(shrunk(closure_rate)) ]
```

`log1p` on incident_count gives diminishing returns; shrinkage stops a single
freak 70 h event or lone closure from spiking a one-incident junction. Result:
high-frequency junctions (Veerannapalya, K R Circle, Hebbal) top the ranking, as
they should.

ESI junction component uses a cascade: **junction → zone → corridor → 50**
(neutral), handling the 70% / 58% missing junction / zone reality.

---

## 4. Event Severity Index (ESI)

```
ESI = 0.30·S_cause + 0.25·S_duration + 0.20·S_closure + 0.15·S_time + 0.10·S_junction
```

### 4.1 S_cause (disruption intensity, not just duration)

| cause | score | cause | score |
|---|---|---|---|
| vehicle_breakdown | 15 | tree_fall | 55 |
| accident | 25 | pot_holes | 60 |
| congestion | 35 | road_conditions | 65 |
| procession | 40 | construction | 70 |
| fog_low_visibility | 45 | water_logging | 85 |
| vip_movement / public_event / debris | 50 | others | 40 |
| protest | 55 | test_demo | 5 |

Potholes (longest median duration) score 60 not 90 — severity is disruption
*intensity*, and a pothole slows traffic while waterlogging stops it.

### 4.2 S_duration — from the percentile distribution

| hours | < 0.5 | 0.5–1 | 1–3 | 3–6 | 6–12 | 12–24 | >24 |
|---|---|---|---|---|---|---|---|
| score | 10 | 25 | 45 | 60 | 75 | 85 | 95 |

### 4.3 S_closure = 100 if road closed else 0.

### 4.4 S_time (Bangalore volume profile), ×0.6 on weekends

| 17–20 | 8–10 | 7,16 | 11–15 | 21–22 | 23–6 |
|---|---|---|---|---|---|
| 100 | 90 | 60 | 30 | 20 | 5 |

### 4.5 S_junction — risk-table cascade (§3).

### 4.6 Risk labels

| ESI | 0–30 | 31–60 | 61–80 | 81–100 |
|---|---|---|---|---|
| label | LOW | MEDIUM | HIGH | CRITICAL |

### 4.7 Worked example

Procession, Silk Board, 6 PM Fri, road closed, duration 2.5 h, S_junction 72:

```
0.30·40 + 0.25·45 + 0.20·100 + 0.15·100 + 0.10·72 = 65.45  → HIGH
```

Same event 2 AM Sun, no closure: `12 + 11.25 + 0 + 0.15·(5·0.6) + 7.2 = 30.9` → MEDIUM.

---

## 5. Duration model (the only ML)

**Target:** `log1p(duration_hours)`; predictions are `expm1` and clipped to [0,168].

**Features (8):** `event_cause`, `corridor` (categorical, native LightGBM);
`road_closure`, `priority_high`, `hour`, `weekday`, `latitude`, `longitude`.
Excluded: `junction` (too sparse), `affected_distance` (~0 variance), free text,
`status` (leaks the label).

**Model:** LightGBM, **objective = L1 (MAE) in log space** → predicts the
conditional median of log-duration. Chosen in an objective bake-off over
L2 / Tweedie(1.2,1.5,1.8) / Gamma / raw-L1 — L1-log won on log-R², Median-AE, and
within-2×.

**Split:** time-ordered 80/20 (oldest train, newest test); early stopping on a
validation tail of the train portion.

**Why MAE is not the headline:** the global-median constant is the MAE-optimal
predictor for this sharply-peaked target, and duration has a large *irreducible*
tail (a few 100 h+ events no feature can predict). Honest metrics:

| metric | value | meaning |
|---|---|---|
| Median AE | 0.89 h | typical error, robust to the tail |
| within-2× | ~37% | predictions within a factor of 2 of actual |
| log-R² | 0.17 | variance explained in log space (a constant gives 0) |
| log-MAE | 0.772 | vs per-cause baseline 0.871 (beats by 11%) and global-median 0.763 |

**Feature importance:** gain importance is cardinality-biased (inflates lat/lon).
**Permutation importance** (unbiased, on the test set) shows `event_cause`
overwhelmingly dominant (+0.314 Δlog-MAE) with everything else near zero — the
design's expectation, confirmed by an independent measure.

---

## 6. Impact radius

```
impact_radius = min( base(duration) · M_closure · M_peak · M_cause , 10 km )
```

Multiplicative because the mechanisms compound. Capped at 10 km (Bangalore ≈ 40 km
across).

base(duration):

| hours | <0.5 | 0.5–1 | 1–3 | 3–6 | 6–12 | ≥12 |
|---|---|---|---|---|---|---|
| km | 0.3 | 0.8 | 1.5 | 3.0 | 5.0 | 7.0 |

`M_closure` = 1.8 if closed else 1.0 (data: closed events run 1.45× longer ×
~1.25 forced-rerouting). `M_peak` = 1.6 if peak else 1.0 (same blockage displaces
far more vehicles at capacity; durations are equal peak/off-peak — only *spread*
differs). `M_cause` ∈ [1.0, 1.6] (width/area of blockage: breakdown 1.0 →
waterlogging 1.5 → protest 1.6).

Concentric rings: 0–⅓ R = HIGH (red), ⅓–⅔ = MEDIUM (orange), ⅔–1 = LOW (yellow).

Worked: procession, 2.5 h, closed, peak → `1.5 · 1.8 · 1.6 · 1.4 = 6.05 km`.
Off-peak, open → `1.5 · 1.4 = 2.1 km`.

---

## 7. Spillover propagation graph

Nodes = 294 junctions (median coords + dominant corridor). Edges from 3 rules:

- **A** same real corridor & Haversine ≤ 3 km → weight = d · 0.5
- **B** different corridor & ≤ 1.5 km → weight = d · 1.0
- **C** historical time co-occurrence (≥ 2 overlapping events, sweep line, 24 h
  cap) → weight = d · factor

`Non-corridor` is excluded from rule A (it is a catch-all label, not a road).
Result: 1,795 edges, avg degree 12.2.

Propagation = Dijkstra-style max-congestion with exponential decay (κ = 2):

```
congestion(j) = max over paths of  congestion(i) · e^(−weight(i,j)/κ)
```

starting at 1.0 at the source, cut off below 0.10. Labels: >0.60 HIGH,
0.30–0.60 MEDIUM, else LOW. Silk Board → 73 junctions, decaying correctly into
HSR / BTM / Koramangala / Bommanahalli.

---

## 8. Similar event engine

Weighted distance to every labelled historical event:

```
D = 0.35·[cause≠] + 0.25·loc + 0.20·[closure≠] + 0.12·hour + 0.08·weekday
```

`loc` = min(geo_km/10, 1); `hour` and `weekday` use **circular** distance
(min(|Δ|, period−|Δ|)) normalized by 12 and 3.5. Similarity = (1−D)·100.

Take the k=15 nearest with D ≤ **0.40** (raised from 0.30: common causes are
capped at k regardless, but rare causes — procession has only 13 labelled events,
nearest at 0.316 — would otherwise return nothing).

**Confidence** = 100·[0.4·f_count + 0.4·f_consistency + 0.2·f_alignment]:

- f_count: 14+→1.0, 10+→0.8, 5+→0.6, 2+→0.4, else 0.2
- f_consistency: by CV = σ/μ of matched durations (<0.3→1.0 … >1.0→0.2)
- f_alignment: predicted duration inside [min,max]→1.0, within 1.5× span→0.7, else 0.3
  (renormalized over the first two factors when no prediction is supplied)

---

## 9. Diversion engine (3 layers)

**Layer 1 — corridor scoring.** Candidates = corridors with a junction within
2× the impact radius (excluding the blocked one).

```
corridor_score = 0.4·load + 0.3·reliability + 0.3·capacity
```

load (active incidents: 0→1.0, 1→0.7, 2→0.4, 3+→0.1); reliability =
1 − incident_count/max; capacity = junction_count/max.

**Layer 2 — junction avoidance** from the spillover graph: congestion > 0.60 →
AVOID, 0.30–0.60 → CAUTION.

**Layer 3 — historical reliability** feeds confidence:

```
confidence = 100·[ 0.30·corridor_score + 0.25·reliability + 0.20·spillover_safety
                 + 0.15·proximity + 0.10·similarity_count ]
```

`spillover_safety` = 1 − (fraction of the corridor's junctions inside the affected
set); `proximity` = max(0, 1 − d_min/reach). Proximity was added after review —
without it, a clear-but-distant corridor (e.g. NW Bangalore for a SE event) could
outrank an adjacent one. With it, Silk Board → ORR West 1 / Old Airport Road /
Old Madras Road, all geographically sensible.

---

## 10. Resource planner

**Police** = point_duty + perimeter + site, capped at 50:

```
point_duty = 2·#HIGH + 1·#MEDIUM + 0·#LOW
perimeter  = ⌈2π·R / 1.5⌉           (one officer per ~1.5 km of perimeter road)
site       = SITE_OFFICERS[cause]    (breakdown 1 … protest/VIP 6)
```

**Barricades** = site + diversion: site = 4 if closed else 1; diversion = ⌈R·4⌉
(≈ 4 roads cross each km of perimeter).

**Patrol vehicles** = min(⌈π R² / 8⌉, 8), doubled if duration > 8 h.

**Deployment priority** per junction = congestion · (junction_risk/100) ·
road_importance (1.5 for ORR / Hosur / Bellary, else 1.0); officers assigned
top-down within the point-duty budget.

---

## 11. Pipeline & API

`AstraPipeline.analyze(event)` resolves location (junction→coords), predicts (or
overrides) duration, computes ESI, impact radius, affected junctions (spillover
graph if the event is at a known junction, else the impact circle), similar
events, diversions, and resources — **~13 ms** after a 0.3 s startup load.

FastAPI endpoints: `/api/predict`, `/api/junctions`, `/api/corridors`,
`/api/events`, `/api/stats/overview`, `/api/health`, and the optional
`/api/mappls/{status,token,directions,matrix}`.

---

## 12. MapMyIndia integration (optional)

Mirrors the Mappls OAuth pattern: `client_credentials` → token from
`outpost.mappls.com`, cached and refreshed 60 s early. Directions
(`route_adv/driving`, lng,lat order) give diversion polylines; Distance Matrix
gives real road distances for graph edges. Absent credentials, the system runs
fully on Haversine and the frontend draws an SVG impact map. The frontend loads
the Mappls vector SDK (`map_sdk?layer=vector&v=3.0`) only when
`/api/mappls/status` reports configured.

---

## 13. Frontend

React + TypeScript + Vite + Tailwind. Simulator tab: event form → `/api/predict`
→ ESI gauge, duration/radius/confidence, resource cards, deployment plan,
diversion list, similar-event cards, and the map (Mappls or SVG fallback).
Overview tab: KPIs, risk distribution, top risk junctions. Typed end-to-end via
`src/types.ts` mirroring the backend contract.
