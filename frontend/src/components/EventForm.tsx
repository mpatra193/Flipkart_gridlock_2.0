import { useState } from "react";
import type { EventInput, Junction } from "../types";

const CAUSES = [
  "vehicle_breakdown", "accident", "congestion", "procession", "vip_movement",
  "public_event", "protest", "tree_fall", "pot_holes", "road_conditions",
  "construction", "water_logging", "debris", "fog_low_visibility", "others",
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const [junction, setJunction] = useState("SilkBoardJunc");
  const [hour, setHour] = useState(18);
  const [weekday, setWeekday] = useState(4);
  const [closure, setClosure] = useState(true);
  const [highPriority, setHighPriority] = useState(true);
  const [override, setOverride] = useState("");

  const peak = [8, 9, 10, 17, 18, 19, 20].includes(hour);

  function submit() {
    onSubmit({
      event_cause: cause,
      junction,
      hour,
      weekday,
      road_closure: closure,
      priority_high: highPriority,
      duration_override: override ? Number(override) : null,
    });
  }

  return (
    <div className="glass p-4 space-y-4">
      <div className="text-sm font-semibold text-slate-200">Event Simulator</div>

      <label className="block text-xs text-slate-400">
        Cause
        <select
          value={cause}
          onChange={(e) => setCause(e.target.value)}
          className="mt-1 w-full bg-slate-800/60 rounded-lg px-2 py-1.5 text-sm text-slate-100"
        >
          {CAUSES.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs text-slate-400">
        Junction
        <select
          value={junction}
          onChange={(e) => setJunction(e.target.value)}
          className="mt-1 w-full bg-slate-800/60 rounded-lg px-2 py-1.5 text-sm text-slate-100"
        >
          {junctions.map((j) => (
            <option key={j.junction} value={j.junction}>
              {j.junction} ({j.incident_count})
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs text-slate-400">
        Hour: <span className="text-slate-200">{hour}:00</span>{" "}
        {peak && <span className="text-orange-400">peak</span>}
        <input
          type="range"
          min={0}
          max={23}
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          className="mt-1 w-full accent-cyan-400"
        />
      </label>

      <label className="block text-xs text-slate-400">
        Day
        <select
          value={weekday}
          onChange={(e) => setWeekday(Number(e.target.value))}
          className="mt-1 w-full bg-slate-800/60 rounded-lg px-2 py-1.5 text-sm text-slate-100"
        >
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center justify-between text-xs text-slate-300">
        <span>Road closure</span>
        <button
          onClick={() => setClosure(!closure)}
          className={`px-3 py-1 rounded-lg ${closure ? "bg-red-500/30 text-red-300" : "bg-slate-700/50"}`}
        >
          {closure ? "YES" : "NO"}
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-300">
        <span>High priority</span>
        <button
          onClick={() => setHighPriority(!highPriority)}
          className={`px-3 py-1 rounded-lg ${highPriority ? "bg-cyan-500/30 text-cyan-300" : "bg-slate-700/50"}`}
        >
          {highPriority ? "HIGH" : "LOW"}
        </button>
      </div>

      <label className="block text-xs text-slate-400">
        Duration override (h, optional)
        <input
          value={override}
          onChange={(e) => setOverride(e.target.value)}
          placeholder="ML predicts if blank"
          className="mt-1 w-full bg-slate-800/60 rounded-lg px-2 py-1.5 text-sm text-slate-100"
        />
      </label>

      <button
        onClick={submit}
        disabled={loading}
        className="w-full bg-cyan-500/80 hover:bg-cyan-500 text-slate-900 font-semibold rounded-lg py-2 text-sm disabled:opacity-50"
      >
        {loading ? "Analysing…" : "Run Simulation"}
      </button>
    </div>
  );
}
