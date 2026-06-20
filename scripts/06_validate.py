from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import networkx as nx
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, median_absolute_error, roc_auc_score

from astra import config
from astra.engines.spillover import _cooccurrence_counts, _dominant_corridor, build_graph, propagate
from astra.models.duration_model import DurationModel, _load_valid, build_features

PEAK = [8, 9, 10, 17, 18, 19, 20]
LINES: list[str] = []


def log(s=""):
    print(s)
    LINES.append(s)


def section(t):
    log("\n" + "=" * 72)
    log(t)
    log("=" * 72)


def derived_multipliers():
    section("1. DATA-DERIVED MULTIPLIERS  (median duration ratios)")
    v = _load_valid()
    f = build_features(v)
    f["duration_hours"] = v["duration_hours"].astype(float).values
    g = float(f["duration_hours"].median())
    log(f"global median duration        : {g:.2f} h   (n={len(f)})")

    def ratio(mask_name, mask):
        a = f.loc[mask, "duration_hours"].median()
        b = f.loc[~mask, "duration_hours"].median()
        log(f"  {mask_name:<28}: {a / b:.2f}x   ({a:.2f}h vs {b:.2f}h, n_true={int(mask.sum())})")
        return a / b

    ratio("peak-hour vs off-peak", f["is_peak"] == 1)
    ratio("road-closure vs open", f["road_closure"] == 1)
    ratio("night vs day", f["is_night"] == 1)
    ratio("weekend vs weekday", f["is_weekend"] == 1)

    log("\n  cause multipliers (cause median / global median, causes with n>=20):")
    grp = f.groupby("event_cause")["duration_hours"].agg(["median", "count"]).sort_values("median", ascending=False)
    for cause, row in grp.iterrows():
        if row["count"] >= 20:
            log(f"    {cause:<22}: {row['median'] / g:.2f}x   ({row['median']:.2f}h, n={int(row['count'])})")


def spillover_validation():
    section("2. SPILLOVER GRAPH VALIDATION  (co-occurrence hit-rate)")
    events = pd.read_parquet(config.EVENTS_CLEAN)
    registry = pd.read_parquet(config.JUNCTION_REGISTRY)
    g = build_graph(events, registry)

    ab = nx.Graph()
    ab.add_nodes_from(g.nodes(data=True))
    for u, v, d in g.edges(data=True):
        if d.get("rule") in ("A", "B"):
            ab.add_edge(u, v, **d)

    sources = [n for n in g.nodes if g.degree(n) > 0]

    def ranked(graph):
        out = {}
        for s in sources:
            if s not in graph:
                out[s] = []
                continue
            lv = propagate(graph, s)
            out[s] = [j for j, _ in sorted(((j, v) for j, v in lv.items() if j != s), key=lambda kv: kv[1], reverse=True)]
        return out

    rk_full = ranked(g)
    rk_ab = ranked(ab)
    breadth = np.mean([len(v) for v in rk_full.values()])
    log(f"graph: {g.number_of_nodes()} nodes, {g.number_of_edges()} edges, avg degree {2 * g.number_of_edges() / g.number_of_nodes():.1f}")
    log(f"sources tested: {len(sources)}   avg junctions reached/source: {breadth:.0f}")

    n = len(registry)
    pairs = n * (n - 1) / 2

    def hr(rkmap, cooc, K):
        hits = total = 0
        for s, lst in rkmap.items():
            pick = lst if K is None else lst[:K]
            for j in pick:
                total += 1
                if cooc.get(frozenset((s, j)), 0) >= 1:
                    hits += 1
        return (hits / total if total else 0.0), total

    for win in (24.0, 3.0):
        cooc = _cooccurrence_counts(events, max_interval_h=win)
        chance = sum(1 for x in cooc.values() if x >= 1) / pairs
        log(f"\n  co-occurrence window = {int(win)}h   (chance pair rate {chance:.4f})")
        for K in (3, 10, None):
            h, t = hr(rk_full, cooc, K)
            lab = "all" if K is None else f"top-{K}"
            log(f"    full A+B+C {lab:<6} hit {h:.3f}  ({h / chance:.1f}x chance, n={t})")
        h, t = hr(rk_ab, cooc, 10)
        log(f"    corridor A+B top-10  hit {h:.3f}  ({h / chance:.1f}x chance, n={t})   [non-circular]")
    log("\nA+B = non-circular test (geographic corridors predict pairs that independently")
    log("co-occur); Rule C edges are built from co-occurrence so they are excluded there.")


def sensitivity_kappa():
    section("3. SENSITIVITY ANALYSIS  (decay kappa +/- 50%)")
    events = pd.read_parquet(config.EVENTS_CLEAN)
    registry = pd.read_parquet(config.JUNCTION_REGISTRY)
    g = build_graph(events, registry)
    sources = [n for n in g.nodes if g.degree(n) > 0]

    def topset(s, k, top=10):
        levels = propagate(g, s, kappa=k)
        ranked = sorted([(j, lv) for j, lv in levels.items() if j != s], key=lambda kv: kv[1], reverse=True)
        return [j for j, _ in ranked[:top]]

    def compare(kref, kalt):
        jac = []
        top1 = 0
        n = 0
        for s in sources:
            a = topset(s, kref)
            b = topset(s, kalt)
            if not a:
                continue
            n += 1
            sa, sb = set(a), set(b)
            jac.append(len(sa & sb) / len(sa | sb) if sa | sb else 1.0)
            if a[0] == b[0]:
                top1 += 1
        return float(np.mean(jac)), top1 / n

    for kalt in (1.0, 3.0):
        jac, t1 = compare(config.DECAY_KAPPA, kalt)
        log(f"kappa {config.DECAY_KAPPA} vs {kalt:<4}: top-10 affected Jaccard {jac:.3f} | top-1 junction unchanged {100 * t1:.0f}%")
    log("high overlap => affected/diversion rankings do not flip with kappa.")


def duration_bands():
    section("4. DURATION ERROR BY BAND  (model vs global-median baseline)")
    valid = _load_valid()
    X = build_features(valid)
    y = valid["duration_hours"].astype(float).values
    cut = int(len(X) * 0.80)
    Xte, yte = X.iloc[cut:], y[cut:]

    model = DurationModel.load()
    b = model.bundle
    s = b["settings"]
    Xf = Xte[b["features"]]
    raw_p50 = np.clip(np.expm1(b["model_p50_raw"].predict(Xf)), 0, 168)
    p10 = np.clip(np.expm1(b["model_p10"].predict(Xf)), 0, 168)
    p90q = np.clip(np.expm1(b["model_p90"].predict(Xf)), 0, 168)
    long_prob = b["model_long_clf"].predict_proba(Xf)[:, 1]
    w = np.clip((long_prob - s["blend_start"]) / s["blend_width"], 0, 1)
    p50 = np.clip((1 - w) * s["anchor_hours"] + w * raw_p50, 0, 168)
    p10 = np.minimum(p10, p50)
    p90 = np.clip(np.maximum(p90q * s["p90_multiplier"] + long_prob * s["p90_risk_boost"], p50), 0, 168)
    base = np.full_like(yte, s["anchor_hours"])

    bands = [("short  <=1h", yte <= 1), ("medium 1-6h", (yte > 1) & (yte <= 6)), ("long   >6h", yte > 6)]
    log(f"test rows={len(yte)}   baseline=predict global median ({s['anchor_hours']:.2f}h)\n")
    log(f"{'band':<12}{'n':>5}{'model MedAE':>13}{'base MedAE':>12}{'model MAE':>11}{'base MAE':>10}{'p10-p90 hit':>13}")
    for name, m in bands:
        if m.sum() == 0:
            continue
        yt, pt, bt = yte[m], p50[m], base[m]
        cov = np.mean((yt >= p10[m]) & (yt <= p90[m]))
        log(f"{name:<12}{int(m.sum()):>5}{median_absolute_error(yt, pt):>13.2f}{median_absolute_error(yt, bt):>12.2f}"
            f"{mean_absolute_error(yt, pt):>11.2f}{mean_absolute_error(yt, bt):>10.2f}{100 * cov:>12.0f}%")

    yl = (yte > 6).astype(int)
    log(f"\nlong-event (>6h) classifier ROC-AUC : {roc_auc_score(yl, long_prob):.3f}")
    log(f"overall p10-p90 interval coverage   : {100 * np.mean((yte >= p10) & (yte <= p90)):.0f}%  (target ~80%)")
    log("read: the model barely beats the median on SHORT point-error (the median IS")
    log("      near-optimal there); it wins on long-event detection + interval calibration.")


def main():
    derived_multipliers()
    spillover_validation()
    sensitivity_kappa()
    duration_bands()
    out = config.ROOT / "docs" / "validation_output.txt"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(LINES).strip() + "\n")
    log(f"\nwrote {out.relative_to(config.ROOT)}  (curated appendix: docs/VALIDATION.md)")


if __name__ == "__main__":
    main()
