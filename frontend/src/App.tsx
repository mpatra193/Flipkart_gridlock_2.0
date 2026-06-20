import { useEffect, useMemo, useState } from "react";
import { getJunctions, getOverview, predict } from "./api";
import type { EventInput, Junction, Overview, Prediction } from "./types";
import { combinePredictions } from "./combine";
import { warmEscapeRoutes } from "./routeCache";
import EventForm from "./components/EventForm";
import PredictionPanel from "./components/PredictionPanel";
import WhyPanel from "./components/WhyPanel";
import ResourcePanel from "./components/ResourcePanel";
import DiversionPanel from "./components/DiversionPanel";
import SpilloverTimeline from "./components/SpilloverTimeline";
import SimilarPanel from "./components/SimilarPanel";
import FeedbackForm from "./components/FeedbackForm";
import MapView from "./components/MapView";
import OverviewView from "./components/Overview";
import CompareView from "./components/CompareView";
import InterventionView from "./components/InterventionView";
import WhatIfView from "./components/WhatIfView";
import EmergencyView from "./components/EmergencyView";

function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 t-text-3 hover:t-text"
      style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)' }}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

export default function App() {
  const [tab, setTab] = useState<"simulator" | "compare" | "interventions" | "whatif" | "emergency" | "overview">("simulator");
  const [junctions, setJunctions] = useState<Junction[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [committed, setCommitted] = useState<{ input: EventInput; pred: Prediction }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prediction = useMemo<Prediction | null>(
    () => (committed.length ? combinePredictions(committed.map((c) => c.pred)) : null),
    [committed]
  );
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("astra-theme");
    return saved ? saved === "dark" : true;
  });

  useEffect(() => {
    getJunctions().then(setJunctions).catch(() => setError("Backend not reachable on /api"));
    getOverview().then(setOverview).catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem("astra-theme", dark ? "dark" : "light");
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [dark]);

  async function addEvent(input: EventInput) {
    setLoading(true);
    setError(null);
    try {
      const pred = await predict(input);
      warmEscapeRoutes(pred);
      setCommitted((prev) => [...prev, { input, pred }]);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Prediction failed");
    } finally {
      setLoading(false);
    }
  }

  function clearEvents() {
    setCommitted([]);
  }

  async function refreshLast() {
    if (!committed.length) return;
    const last = committed[committed.length - 1];
    try {
      const pred = await predict(last.input);
      setCommitted((prev) => prev.map((c, i) => (i === prev.length - 1 ? { input: last.input, pred } : c)));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="h-full flex flex-col t-bg theme-transition">
      {/* ── Header ── */}
      <header
        className="flex items-center justify-between px-6 py-3 backdrop-blur-sm"
        style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--accent-glow)', border: '1px solid var(--border-subtle)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="t-accent">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold tracking-wide t-text">ASTRA</div>
            <div className="text-[10px] t-text-muted font-medium tracking-wider uppercase -mt-0.5">Traffic Response AI</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <nav className="flex items-end gap-1">
            {(["simulator", "compare", "interventions", "whatif", "emergency", "overview"] as const).map((t) => {
              const active = tab === t;
              const labels = { simulator: "Simulator", compare: "ASTRA Impact", interventions: "Interventions", whatif: "What-If", emergency: "Emergency", overview: "Overview" } as const;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 rounded-t-lg text-[13px] font-semibold transition-all duration-200 ${active ? "t-accent py-2" : "t-text-muted py-1.5"}`}
                  style={
                    active
                      ? {
                          background: "var(--accent-glow)",
                          borderTop: "1px solid var(--border-subtle)",
                          borderLeft: "1px solid var(--border-subtle)",
                          borderRight: "1px solid var(--border-subtle)",
                          boxShadow: "0 -2px 8px rgba(0,0,0,0.06)",
                        }
                      : { background: "var(--bg-card-inner)" }
                  }
                >
                  {labels[t]}
                </button>
              );
            })}
          </nav>
          <ThemeToggle dark={dark} onToggle={() => setDark(!dark)} />
        </div>
      </header>

      {/* ── Error Banner ── */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 text-red-400 text-sm px-6 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <span className="text-red-400 font-bold">!</span>
          {error}
        </div>
      )}

      {/* ── Content ── */}
      {tab === "simulator" && (
        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* Left sidebar */}
          <div className="w-72 shrink-0 overflow-y-auto pb-4 custom-scroll">
            <EventForm
              junctions={junctions}
              loading={loading}
              committed={committed.map((c) => c.input)}
              onSubmit={addEvent}
              onClear={clearEvents}
            />
          </div>

          {/* Map */}
          <div
            className="flex-1 min-w-0 relative rounded-2xl overflow-hidden shadow-2xl"
            style={{ border: '1px solid var(--border-subtle)' }}
          >
            <MapView prediction={prediction} />
          </div>

          {/* Right sidebar */}
          <div className="w-80 shrink-0 overflow-y-auto pb-4 space-y-3 custom-scroll">
            {prediction ? (
              <>
                <PredictionPanel p={prediction} />
                <WhyPanel p={prediction} />
                <ResourcePanel r={prediction.resources} />
                <DiversionPanel d={prediction.diversions} />
                <SpilloverTimeline p={prediction} />
                <SimilarPanel s={prediction.similar} />
                <FeedbackForm p={prediction} onSaved={refreshLast} />
              </>
            ) : (
              <div className="glass p-8 text-center">
                <div className="text-sm font-medium t-text-2 mb-1">No Simulation Running</div>
                <div className="text-xs t-text-muted leading-relaxed">
                  Configure an event and run the simulation to see severity, impact spread, resource
                  deployment, and diversions.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {tab === "compare" && (
        <div className="flex-1 p-4 overflow-hidden">
          <CompareView prediction={prediction} />
        </div>
      )}
      {tab === "interventions" && (
        <div className="flex-1 p-4 overflow-hidden">
          <InterventionView prediction={prediction} />
        </div>
      )}
      {tab === "whatif" && (
        <div className="flex-1 p-4 overflow-hidden">
          <WhatIfView prediction={prediction} />
        </div>
      )}
      {tab === "emergency" && (
        <div className="flex-1 p-4 overflow-hidden">
          <EmergencyView prediction={prediction} junctions={junctions} />
        </div>
      )}
      {tab === "overview" && (
        <div className="flex-1 overflow-y-auto p-4 custom-scroll">
          <OverviewView overview={overview} />
        </div>
      )}
    </div>
  );
}
