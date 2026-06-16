import math

import networkx as nx

from astra.engines.spillover import affected_from_source, congestion_label, propagate


def _toy_graph():
    g = nx.Graph()
    g.add_node("S", lat=12.9, lon=77.6)
    g.add_node("A", lat=12.91, lon=77.6)
    g.add_node("B", lat=12.92, lon=77.6)
    g.add_node("Far", lat=13.5, lon=78.0)
    g.add_edge("S", "A", weight=0.5)
    g.add_edge("A", "B", weight=0.5)
    return g


def test_propagation_decay():
    g = _toy_graph()
    levels = propagate(g, "S", kappa=2.0, threshold=0.10)
    assert levels["S"] == 1.0
    assert abs(levels["A"] - math.exp(-0.25)) < 1e-9
    assert abs(levels["B"] - math.exp(-0.25) ** 2) < 1e-9
    assert "Far" not in levels


def test_threshold_cutoff():
    g = nx.Graph()
    g.add_node("S", lat=0, lon=0)
    g.add_node("X", lat=0, lon=0)
    g.add_edge("S", "X", weight=10.0)
    levels = propagate(g, "S", kappa=2.0, threshold=0.10)
    assert "X" not in levels


def test_labels():
    assert congestion_label(0.9) == "HIGH"
    assert congestion_label(0.45) == "MEDIUM"
    assert congestion_label(0.15) == "LOW"


def test_affected_sorted_desc():
    g = _toy_graph()
    out = affected_from_source(g, "S")
    levels = [a["congestion"] for a in out]
    assert levels == sorted(levels, reverse=True)
    assert out[0]["junction"] == "S"
