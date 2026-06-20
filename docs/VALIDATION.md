# ASTRA — Validation & Calibration Appendix

Every coefficient below is **empirically derived or sensitivity-tested**, and every
metric is reported **honestly against a baseline**. Reproduce with:

```
python scripts/06_validate.py      # prints + writes docs/validation_output.txt
```

Dataset: 2,711 events with valid start/clear timestamps (0 < duration ≤ 168 h);
294 junctions; time-ordered 80/20 split (543 test events).

---

## 1. Coefficients are derived from the data, not asserted

Median-duration ratios over the event log (not hand-picked constants):

| Factor | Multiplier | Evidence |
|---|---|---|
| Road closure vs open | **1.46×** | 1.22 h vs 0.84 h (n=212 closed) |
| Peak-hour vs off-peak | 1.03× | 0.89 h vs 0.86 h — **weak**, peak barely moves *duration* |
| Night vs day | 0.78× | 0.78 h vs 0.99 h |
| Weekend vs weekday | 0.95× | 0.84 h vs 0.88 h |

Per-cause multipliers (cause median ÷ global median 0.87 h, causes with n ≥ 20):

| Cause | × | Cause | × |
|---|---|---|---|
| pot_holes | **28.6×** | tree_fall | 4.2× |
| water_logging | **15.8×** | others | 2.2× |
| road_conditions | 14.9× | congestion | 1.4× |
| construction | 8.2× | vehicle_breakdown | 0.8× |
| | | accident | 0.8× |

> "We chose 1.45" → "the data shows closure events run **1.46×** longer." Cause is by
> far the strongest duration driver; the hour-of-day matters far less than usually assumed.

---

## 2. The spread model is validated against held-out co-occurrence

Almost no team validates their spread. We do. **Hit-rate** = fraction of the junctions
the propagation flags as *affected* that actually **co-occur** with the source in history
(two incidents within the window). Graph: 294 nodes, 1,795 edges, avg degree 12.2.

| Prediction set | 24 h window | 3 h window |
|---|---|---|
| Top-3 affected | **1.4× chance** | **1.6× chance** |
| Top-10 affected | 1.3× | 1.4× |
| Corridor-only A+B, top-10 *(non-circular)* | 1.2× | 1.3× |
| All ~84 reached | 0.8× | 0.8× |

Reading it honestly:
- The model's **high-confidence (top-K) predictions co-occur above chance**, and the
  signal **strengthens at the tighter 3 h window** — i.e. the closer in time, the better
  the spatial match. That is the right direction for a spread model.
- It **survives the non-circular test**: corridor edges (Rules A/B), built *without*
  co-occurrence, still predict pairs that independently co-occur (1.2–1.3×). Rule C is
  excluded there to avoid circularity.
- The full ~84-junction reach dilutes to chance → propagation spreads broadly, so we
  **rank by congestion level and act on the top-K**, never the whole set.

---

## 3. κ is stable — rankings don't flip (sensitivity analysis)

Varying the decay constant κ by ±50% (2.0 → 1.0 / 3.0), over 287 sources:

| Comparison | Top-10 affected Jaccard | Top-1 junction unchanged |
|---|---|---|
| κ 2.0 vs 1.0 | **0.91** | **100%** |
| κ 2.0 vs 3.0 | **0.99** | **100%** |

The affected/diversion rankings are stable to large changes in κ → the choice is
**calibrated, not arbitrary**.

---

## 4. Duration: a calibrated interval, not a false-precision point

We **do not** sell the 0.67 h point metric. Segmented by duration band vs a
"predict the global median (0.86 h)" baseline (test n=543):

| Band | n | Model MedAE | Base MedAE | Model MAE | Base MAE | p10–p90 coverage |
|---|---|---|---|---|---|---|
| short ≤1 h | 286 | 0.51 | **0.43** | 1.84 | **0.42** | 69% |
| medium 1–6 h | 169 | 0.75 | 0.76 | 1.83 | **1.02** | 91% |
| long >6 h | 88 | **36.5** | 43.2 | **47.3** | 52.3 | 90% |

**Honest verdict:** on the short/medium majority the point model **does not beat the
naive median** — the median is near-optimal there, and we say so. Where the model
genuinely wins:

- **Long-event (>6 h) detection: ROC-AUC 0.870.**
- **p10–p90 interval coverage: 79% overall** (target ~80%) — a calibrated risk band.

This is *why the product never relies on the P50 point estimate*: ESI, impact radius
and resourcing are all driven by the **P90 planning duration**, and the UI surfaces the
**P10–P90 band + long-event probability**, not a single number.

---

### Credibility summary
- Every coefficient is **data-derived** (§1) or **sensitivity-tested** (§3).
- The spread model is **validated** against independent co-occurrence (§2).
- Duration accuracy is **reported against a baseline, by band** (§4) — we lead with
  calibration and long-event detection, the parts that are genuinely strong.
