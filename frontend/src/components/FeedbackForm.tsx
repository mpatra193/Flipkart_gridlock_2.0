import { useState } from "react";
import { postFeedback } from "../api";
import type { Prediction } from "../types";

const inputClass = "w-full rounded-xl px-3 py-2 text-sm focus:outline-none transition-all duration-200";
const inputStyle = {
  background: "var(--input-bg)",
  border: "1px solid var(--input-border)",
  color: "var(--input-text)",
} as const;

export default function FeedbackForm({ p, onSaved }: { p: Prediction; onSaved: () => void }) {
  const [actual, setActual] = useState("");
  const [resources, setResources] = useState("");
  const [effective, setEffective] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!actual) return;
    setSaving(true);
    try {
      await postFeedback({
        junction: p.event.junction,
        event_cause: p.event.event_cause,
        hour: p.event.hour,
        weekday: p.event.weekday,
        predicted_p50: p.duration_hours,
        predicted_p90: p.planning_duration_hours ?? p.duration_hours,
        esi: p.esi,
        actual_hours: Number(actual),
        resources_used: resources ? Number(resources) : null,
        diversion_corridor: p.diversions.recommended[0]?.corridor ?? null,
        diversion_effective: effective || null,
        notes: notes || null,
      });
      setDone(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="glass p-5">
        <div className="text-sm font-semibold text-emerald-400 mb-1">Outcome logged ✓</div>
        <div className="text-xs t-text-muted leading-relaxed">
          Future predictions for <span className="t-text-2">{p.event.event_cause.replace(/_/g, " ")}</span> at{" "}
          <span className="t-text-2">{p.event.junction}</span> now calibrate to this. Re-running the simulation reflects it.
        </div>
        <button
          onClick={() => { setDone(false); setActual(""); setResources(""); setEffective(""); setNotes(""); }}
          className="mt-3 text-[11px] t-text-muted underline"
        >
          Log another outcome
        </button>
      </div>
    );
  }

  return (
    <div className="glass p-5 space-y-3">
      <div>
        <div className="text-sm font-semibold t-text">Post-event report</div>
        <div className="text-[11px] t-text-muted mt-0.5">Log what actually happened — it tunes future recommendations.</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1.5">Actual duration (h)</div>
          <input value={actual} onChange={(e) => setActual(e.target.value)} placeholder={`${p.duration_hours}`} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1.5">Officers used</div>
          <input value={resources} onChange={(e) => setResources(e.target.value)} placeholder="optional" className={inputClass} style={inputStyle} />
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1.5">Diversion effective?</div>
        <select value={effective} onChange={(e) => setEffective(e.target.value)} className={inputClass} style={inputStyle}>
          <option value="">— not applicable —</option>
          <option value="yes">Yes</option>
          <option value="partial">Partial</option>
          <option value="no">No</option>
        </select>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1.5">Notes</div>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" className={inputClass} style={inputStyle} />
      </div>

      <button
        onClick={submit}
        disabled={!actual || saving}
        className="w-full font-semibold rounded-xl py-2 text-sm disabled:opacity-50 transition-all duration-200"
        style={{ background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)" }}
      >
        {saving ? "Saving…" : "Submit outcome"}
      </button>
    </div>
  );
}
