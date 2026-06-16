from __future__ import annotations

import pickle
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import pandas as pd

from astra import config
from astra.engines.spillover import affected_from_source, build_graph

GRAPH_PATH = config.PROCESSED_DIR / "spillover_graph.pkl"


def main():
    print("=" * 70)
    print("PHASE 6 - SPILLOVER PROPAGATION GRAPH")
    print("=" * 70)

    events = pd.read_parquet(config.EVENTS_CLEAN)
    registry = pd.read_parquet(config.JUNCTION_REGISTRY)

    graph = build_graph(events, registry)
    print(f"Nodes: {graph.number_of_nodes()}   Edges: {graph.number_of_edges()}")

    rule_counts = Counter(d["rule"] for _, _, d in graph.edges(data=True))
    print(f"Edge rules: A(same corridor)={rule_counts['A']}  "
          f"B(cross corridor)={rule_counts['B']}  C(co-occurrence)={rule_counts['C']}")

    degrees = [d for _, d in graph.degree()]
    isolated = sum(1 for d in degrees if d == 0)
    print(f"Avg degree: {sum(degrees)/len(degrees):.1f}   isolated nodes: {isolated}")

    source = "SilkBoardJunc" if "SilkBoardJunc" in graph else registry.iloc[0]["junction"]
    affected = affected_from_source(graph, source)
    print(f"\nPropagation from {source}: {len(affected)} junctions affected")
    for a in affected[:10]:
        print(f"  {a['junction']:<30} congestion={a['congestion']:.3f}  {a['risk']}")

    assert graph.number_of_nodes() == len(registry)
    assert graph.number_of_edges() > 0
    assert affected[0]["junction"] == source and affected[0]["congestion"] == 1.0
    assert all(0 <= a["congestion"] <= 1.0 for a in affected)

    with open(GRAPH_PATH, "wb") as f:
        pickle.dump(graph, f)
    print(f"\nSaved graph -> {GRAPH_PATH.relative_to(config.ROOT)}")
    print("PHASE 6 OK")


if __name__ == "__main__":
    main()
