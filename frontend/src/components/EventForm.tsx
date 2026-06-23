import { useEffect, useState } from "react";
import type { EventInput, Junction } from "../types";

const CAUSES = [
  "vehicle_breakdown", "accident", "congestion", "procession", "vip_movement",
  "public_event", "protest", "tree_fall", "pot_holes", "road_conditions",
  "construction", "water_logging", "debris", "fog_low_visibility", "others",
];

const VEH_TYPES = [
  "unknown", "bmtc_bus", "heavy_vehicle", "lcv", "private_bus",
  "private_car", "truck", "taxi", "others",
];

const PLANNED_CAUSES = new Set(["procession", "public_event", "vip_movement", "construction"]);
const VEHICLE_CAUSES = new Set(["vehicle_breakdown", "accident"]);

function deriveEventType(cause: string) {
  return PLANNED_CAUSES.has(cause) ? "planned" : "unplanned";
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const selectClass = "w-full rounded-xl px-3 py-2 text-sm focus:outline-none transition-all duration-200";
const selectStyle = {
  background: "var(--input-bg)",
  border: "1px solid var(--input-border)",
  color: "var(--input-text)",
} as const;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium t-text-muted uppercase tracking-wider mb-1.5">{children}</div>;
}

function CommittedCard({ e, index }: { e: EventInput; index: number }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
      style={{ background: "var(--bg-card-inner)", border: "1px solid var(--border-subtle)" }}
    >
      <div
        className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold t-accent mt-0.5"
        style={{ background: "var(--accent-glow)" }}
      >
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold t-text capitalize truncate">
          {e.event_cause.replace(/_/g, " ")}
          <span className="t-text-muted font-normal"> · {e.junction}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1">
          <span className="text-[9px] px-1.5 py-0.5 rounded t-text-3" style={{ background: "var(--bg-card)" }}>
            {e.hour}:00 · {DAYS[e.weekday] ?? "—"}
          </span>
          {e.road_closure && (
            <span className="text-[9px] px-1.5 py-0.5 rounded text-red-400" style={{ background: "rgba(239,68,68,0.1)" }}>
              closure
            </span>
          )}
          {e.priority_high && (
            <span className="text-[9px] px-1.5 py-0.5 rounded text-cyan-400" style={{ background: "rgba(14,165,233,0.1)" }}>
              high priority
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EventForm({
  junctions,
  loading,
  committed,
  onSubmit,
  onClear,
}: {
  junctions: Junction[];
  loading: boolean;
  committed: EventInput[];
  onSubmit: (e: EventInput) => void;
  onClear: () => void;
}) {
  const [cause, setCause] = useState("procession");
  const [vehType, setVehType] = useState("unknown");
  const [junction, setJunction] = useState("SilkBoardJunc");
  const [hour, setHour] = useState(18);
  const [weekday, setWeekday] = useState(4);
  const [closure, setClosure] = useState(true);
  const [priority, setPriority] = useState<"High" | "Low">("High");
  const [override, setOverride] = useState("");
  const [expanded, setExpanded] = useState(true);

  const hasCommitted = committed.length > 0;

  useEffect(() => {
    if (committed.length === 0) setExpanded(true);
  }, [committed.length]);

  useEffect(() => {
    if (committed.length > 0) {
      setHour(committed[0].hour);
      setWeekday(committed[0].weekday);
    }
  }, [committed]);

  const timeLocked = committed.length > 0;

  const peak = [8, 9, 10, 17, 18, 19, 20].includes(hour);
  const selected = junctions.find((j) => j.junction === junction);
  const policeStation = selected?.police_station ?? null;
  const zone = selected?.zone ?? null;
  const eventType = deriveEventType(cause);
  const vehicleRelevant = VEHICLE_CAUSES.has(cause);

  function submit() {
    onSubmit({
      event_cause: cause,
      junction,
      zone,
      hour,
      weekday,
      road_closure: closure,
      priority_high: priority === "High",
      duration_override: override ? Number(override) : null,
      veh_type: vehicleRelevant ? vehType : "unknown",
      event_type: eventType,
      police_station: policeStation,
    });
    setExpanded(false);
  }

  return (
    <div className="glass p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold t-text">Event Simulator</div>
        {hasCommitted && (
          <button onClick={onClear} className="text-[10px] t-text-muted underline shrink-0">
            clear all
          </button>
        )}
      </div>

      {hasCommitted && (
        <div className="space-y-1.5">
          {committed.map((e, i) => (
            <CommittedCard key={i} e={e} index={i} />
          ))}
          <div className="text-[10px] t-text-muted italic pt-0.5">
            Impact of {committed.length} event{committed.length > 1 ? "s" : ""} combined across the map and metrics.
          </div>
        </div>
      )}

      <div className="h-px" style={{ background: "var(--border-subtle)" }} />

      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="w-full font-semibold rounded-xl py-2.5 text-sm transition-all duration-200 flex items-center justify-center gap-2"
          style={{ background: "var(--bg-card-inner)", border: "1px dashed var(--border-subtle)", color: "var(--text-2, currentColor)" }}
        >
          <span className="text-base leading-none">+</span> Add another event
        </button>
      ) : (
        <>
          {hasCommitted && (
            <div className="text-[11px] font-semibold t-text-2 -mb-1">Add another event</div>
          )}

          <div>
            <FieldLabel>
              Cause
              <span
                className={`ml-2 normal-case text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                  eventType === "planned" ? "text-cyan-400 bg-cyan-500/10" : "text-amber-400 bg-amber-500/10"
                }`}
              >
                {eventType}
              </span>
            </FieldLabel>
            <select value={cause} onChange={(e) => setCause(e.target.value)} className={selectClass} style={selectStyle}>
              {CAUSES.map((c) => (
                <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

          {vehicleRelevant && (
            <div>
              <FieldLabel>Vehicle type</FieldLabel>
              <select value={vehType} onChange={(e) => setVehType(e.target.value)} className={selectClass} style={selectStyle}>
                {VEH_TYPES.map((v) => (
                  <option key={v} value={v}>{v.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <FieldLabel>Junction</FieldLabel>
            <select value={junction} onChange={(e) => setJunction(e.target.value)} className={selectClass} style={selectStyle}>
              {junctions.map((j) => (
                <option key={j.junction} value={j.junction}>{j.junction} ({j.incident_count})</option>
              ))}
            </select>
            {(policeStation || zone) && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {policeStation && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md t-text-2" style={{ background: "var(--bg-card-inner)" }}>
                    PS · {policeStation}
                  </span>
                )}
                {zone && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md t-text-2" style={{ background: "var(--bg-card-inner)" }}>
                    Zone · {zone}
                  </span>
                )}
              </div>
            )}
          </div>

          <div>
            <FieldLabel>
              Hour: <span className="t-text-2 normal-case">{hour}:00</span>
              {peak && <span className="ml-2 text-orange-400 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-orange-500/10">PEAK</span>}
            </FieldLabel>
            <input
              type="range"
              min={0}
              max={23}
              value={hour}
              disabled={timeLocked}
              onChange={(e) => setHour(Number(e.target.value))}
              className={`w-full mt-1 ${timeLocked ? "opacity-80 cursor-not-allowed" : ""}`}
            />
            <div className="flex justify-between text-[9px] t-text-muted mt-1">
              <span>12 AM</span><span>12 PM</span><span>11 PM</span>
            </div>
          </div>

          <div>
            <FieldLabel>Day</FieldLabel>
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  onClick={() => !timeLocked && setWeekday(i)}
                  disabled={timeLocked}
                  className={`py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 ${
                    weekday === i
                      ? "text-cyan-300 border border-cyan-500/30"
                      : "t-text-muted border border-transparent"
                  } ${timeLocked ? "opacity-80 cursor-not-allowed" : ""}`}
                  style={{
                    background: weekday === i ? "var(--accent-glow)" : "var(--bg-card-inner)",
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Road closure</FieldLabel>
              <button
                onClick={() => setClosure(!closure)}
                className={`w-full py-2 rounded-xl text-xs font-semibold transition-all duration-200 border ${
                  closure ? "bg-red-500/10 text-red-400 border-red-500/20" : "t-text-muted"
                }`}
                style={!closure ? { background: "var(--bg-card-inner)", borderColor: "var(--border-subtle)" } : undefined}
              >
                {closure ? "ON" : "OFF"}
              </button>
            </div>
            <div>
              <FieldLabel>Priority</FieldLabel>
              <select value={priority} onChange={(e) => setPriority(e.target.value as "High" | "Low")} className={selectClass} style={selectStyle}>
                <option value="High">High</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <FieldLabel>Duration override (h, optional)</FieldLabel>
            <input
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder="ML predicts if blank"
              className={selectClass}
              style={selectStyle}
            />
          </div>

          <button
            onClick={submit}
            disabled={loading}
            className="w-full font-semibold rounded-xl py-2.5 text-sm disabled:opacity-50 transition-all duration-200"
            style={{ background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)" }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Analysing…
              </span>
            ) : hasCommitted ? "Add event" : "Run Simulation"}
          </button>
        </>
      )}
    </div>
  );
}
