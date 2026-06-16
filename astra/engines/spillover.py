from __future__ import annotations

import heapq
import math
from collections import Counter

import networkx as nx
import numpy as np
import pandas as pd

from .. import config
from ..geo import haversine_km

NON_CORRIDORS = {"Non-corridor", "non-corridor", ""}


def _same_corridor(a, b):
    return a is not None and a not in NON_CORRIDORS and a == b


def _dominant_corridor(events):
    valid = events[events["corridor"].notna() & (events["corridor"].astype("string").str.strip() != "")]
    mode = valid.groupby("junction")["corridor"].agg(
        lambda s: s.value_counts().index[0] if len(s) else None
    )
    return mode.to_dict()


def _cooccurrence_counts(events, max_interval_h=24.0):
    has_j = events["junction"].notna() & (events["junction"].astype("string").str.strip() != "")
    ev = events[has_j & events["duration_hours"].notna()].copy()
    ev = ev[["junction", "start_datetime", "duration_hours"]].dropna()
    ev["end"] = ev["start_datetime"] + pd.to_timedelta(
        np.minimum(ev["duration_hours"].to_numpy(), max_interval_h), unit="h"
    )
    ev = ev.sort_values("start_datetime")

    counts = Counter()
    active = []
    for row in ev.itertuples(index=False):
        start = row.start_datetime
        while active and active[0][0] <= start:
            heapq.heappop(active)
        for _, j in active:
            if j != row.junction:
                counts[frozenset((j, row.junction))] += 1
        heapq.heappush(active, (row.end, row.junction))
    return counts


def build_graph(events, registry):
    corridor_map = _dominant_corridor(events)
    cooc = _cooccurrence_counts(events)

    g = nx.Graph()
    for r in registry.itertuples(index=False):
        g.add_node(
            r.junction,
            lat=float(r.lat),
            lon=float(r.lon),
            corridor=corridor_map.get(r.junction),
            incidents=int(r.incident_count),
        )

    nodes = list(registry.itertuples(index=False))
    lats = np.array([n.lat for n in nodes], dtype="float64")
    lons = np.array([n.lon for n in nodes], dtype="float64")
    names = [n.junction for n in nodes]

    for i in range(len(nodes)):
        d = haversine_km(lats[i], lons[i], lats, lons)
        ci = corridor_map.get(names[i])
        for j in range(i + 1, len(nodes)):
            dist = float(d[j])
            cj = corridor_map.get(names[j])
            same = _same_corridor(ci, cj)
            if same and dist <= config.EDGE_SAME_CORRIDOR_KM:
                g.add_edge(names[i], names[j], weight=round(dist * config.CORRIDOR_FACTOR_SAME, 4), rule="A")
            elif not same and dist <= config.EDGE_CROSS_CORRIDOR_KM:
                g.add_edge(names[i], names[j], weight=round(dist * config.CORRIDOR_FACTOR_CROSS, 4), rule="B")

    name_set = set(names)
    coord = {n.junction: (n.lat, n.lon) for n in nodes}
    for pair, cnt in cooc.items():
        a, b = tuple(pair)
        if cnt < 2 or a not in name_set or b not in name_set or g.has_edge(a, b):
            continue
        dist = float(haversine_km(*coord[a], *coord[b]))
        factor = config.CORRIDOR_FACTOR_SAME if _same_corridor(corridor_map.get(a), corridor_map.get(b)) else config.CORRIDOR_FACTOR_CROSS
        g.add_edge(a, b, weight=round(dist * factor, 4), rule="C", cooccur=cnt)

    return g


def propagate(graph, source, kappa=None, threshold=None):
    if source not in graph:
        return {}
    kappa = kappa or config.DECAY_KAPPA
    threshold = threshold or config.PROPAGATION_THRESHOLD

    best = {source: 1.0}
    pq = [(-1.0, source)]
    while pq:
        neg, u = heapq.heappop(pq)
        c = -neg
        if c < best.get(u, 0.0):
            continue
        for v in graph.neighbors(u):
            w = graph[u][v]["weight"]
            cand = c * math.exp(-w / kappa)
            if cand >= threshold and cand > best.get(v, 0.0):
                best[v] = cand
                heapq.heappush(pq, (-cand, v))
    return best


def congestion_label(level):
    if level > config.SPILLOVER_HIGH:
        return "HIGH"
    if level >= config.SPILLOVER_MEDIUM:
        return "MEDIUM"
    return "LOW"


def affected_from_source(graph, source):
    levels = propagate(graph, source)
    out = []
    for junction, level in sorted(levels.items(), key=lambda kv: kv[1], reverse=True):
        out.append(
            {
                "junction": junction,
                "lat": graph.nodes[junction]["lat"],
                "lon": graph.nodes[junction]["lon"],
                "congestion": round(level, 3),
                "risk": congestion_label(level),
            }
        )
    return out
