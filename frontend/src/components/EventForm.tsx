import { useState } from "react";
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

export default function EventForm({
  junctions,
  loading,
  onSubmit,
}: {
  junctions: Junction[];
  loading: boolean;
  onSubmit: (e: EventInput) => void;
}) {
  const [cause, setCause] = useState("procession");
  const [vehType, setVehType] = useState("unknown");
  const [junction, setJunction] = useState("SilkBoardJunc");
  const [hour, setHour] = useState(18);
  const [weekday, setWeekday] = useState(4);
  const [closure, setClosure] = useState(true);
  const [priority, setPriority] = useState<"High" | "Low">("High");
  const [override, setOverride] = useState("");

  const peak = [8, 9, 10, 17, 18, 19, 20].includes(hour);
  const selected = junctions.find((j) => j.junction === junction);
  const policeStation = selected?.police_station ?? null;
  const zone = selected?.zone ?? null;
  const eventType = deriveEventType(cause);

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
      veh_type: vehType,
      event_type: eventType,
      police_station: policeStation,
    });
  }

  return (
    <div className="glass p-5 space-y-5">
      <div className="text-sm font-semibold t-text">Event Simulator</div>

      <div className="h-px" style={{ background: "var(--border-subtle)" }} />

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

      <div>
        <FieldLabel>Vehicle type</FieldLabel>
        <select value={vehType} onChange={(e) => setVehType(e.target.value)} className={selectClass} style={selectStyle}>
          {VEH_TYPES.map((v) => (
            <option key={v} value={v}>{v.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

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
          onChange={(e) => setHour(Number(e.target.value))}
          className="w-full mt-1"
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
              onClick={() => setWeekday(i)}
              className={`py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 ${
                weekday === i
                  ? "text-cyan-300 border border-cyan-500/30"
                  : "t-text-muted border border-transparent"
              }`}
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
        ) : "Run Simulation"}
      </button>
    </div>
  );
}
