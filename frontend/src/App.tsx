import { useEffect, useState } from "react";
import { getJunctions, getOverview, predict } from "./api";
import type { EventInput, Junction, Overview, Prediction } from "./types";
import EventForm from "./components/EventForm";
import PredictionPanel from "./components/PredictionPanel";
import ResourcePanel from "./components/ResourcePanel";
import DiversionPanel from "./components/DiversionPanel";
import SimilarPanel from "./components/SimilarPanel";
import MapView from "./components/MapView";
import OverviewView from "./components/Overview";

export default function App() {
  const [tab, setTab] = useState<"simulator" | "overview">("simulator");
  const [junctions, setJunctions] = useState<Junction[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJunctions().then(setJunctions).catch(() => setError("Backend not reachable on /api"));
    getOverview().then(setOverview).catch(() => {});
  }, []);

  async function runPredict(input: EventInput) {
    setLoading(true);
    setError(null);
    try {
      setPrediction(await predict(input));
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Prediction failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🚦</div>
          <div>
            <div className="text-lg font-bold tracking-wide">ASTRA</div>
            <div className="text-[11px] text-slate-400 -mt-1">Autonomous Strategic Traffic Response Assistant</div>
          </div>
        </div>
        <nav className="flex gap-1 text-sm">
          {(["simulator", "overview"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg capitalize transition ${
                tab === t ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="bg-red-500/10 text-red-300 text-sm px-6 py-2 border-b border-red-500/20">{error}</div>
      )}

      {tab === "simulator" ? (
        <div className="flex-1 grid grid-cols-12 gap-3 p-3 overflow-hidden">
          <div className="col-span-3 overflow-y-auto">
            <EventForm junctions={junctions} loading={loading} onSubmit={runPredict} />
          </div>
          <div className="col-span-5 min-h-0">
            <MapView prediction={prediction} />
          </div>
          <div className="col-span-4 overflow-y-auto space-y-3">
            {prediction ? (
              <>
                <PredictionPanel p={prediction} />
                <ResourcePanel r={prediction.resources} />
                <DiversionPanel d={prediction.diversions} />
                <SimilarPanel s={prediction.similar} />
              </>
            ) : (
              <div className="glass p-6 text-slate-400 text-sm">
                Configure an event and run the simulation to see severity, impact spread, resource
                deployment, and diversions.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <OverviewView overview={overview} />
        </div>
      )}
    </div>
  );
}
