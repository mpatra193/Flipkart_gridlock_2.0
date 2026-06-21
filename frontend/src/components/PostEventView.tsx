import { useState } from "react";
import { postFeedback } from "../api";
import type { Prediction } from "../types";

const inputClass = "w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-all duration-200";
const inputStyle = {
  background: "var(--input-bg)",
  border: "1px solid var(--input-border)",
  color: "var(--input-text)",
} as const;

type Insight = { delay_factors?: string[]; notes_summary?: string; inferred_effective?: string };
type Meta = {
  ingested?: boolean;
  retraining?: boolean;
  structured?: { event_cause?: string; veh_type?: string; requires_road_closure?: boolean; description?: string } | null;
};

function Ref({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="t-text-muted">{label}</span>
      <span className="t-text-2 font-semibold">{value}</span>
    </div>
  );
}

export default function PostEventView({ prediction, onSaved }: { prediction: Prediction | null; onSaved: () => void }) {
  const [actual, setActual] = useState("");
  const [resources, setResources] = useState("");
  const [effective, setEffective] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  if (!prediction) {
    return (
      <div className="glass h-full flex items-center justify-center t-text-muted text-sm">
        Run a simulation first, then log what actually happened here.
      </div>
    );
  }
  const p = prediction;

  async function submit() {
    if (!actual) return;
    setSaving(true);
    try {
      const res = await postFeedback({
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
      setInsight(res.insight || null);
      setMeta({ ingested: res.ingested, retraining: res.retraining, structured: res.structured ?? null });
      setDone(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setDone(false);
    setInsight(null);
    setMeta(null);
    setActual("");
    setResources("");
    setEffective("");
    setNotes("");
  }

  return (
    <div className="glass p-6 h-full overflow-y-auto custom-scroll">
      <div className="mb-5">
        <div className="text-base font-bold t-text">Post-event report</div>
        <div className="text-[12px] t-text-muted">
          Log what actually happened for <span className="t-text-2">{p.event.event_cause.replace(/_/g, " ")}</span> at{" "}
          <span className="t-text-2">{p.event.junction}</span> — it calibrates future predictions and feeds the training set.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 max-w-4xl">
        {/* ── Inputs ── */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1.5">Actual duration (h)</div>
              <input value={actual} onChange={(e) => setActual(e.target.value)} placeholder={`predicted ${p.duration_hours}`} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1.5">Officers used</div>
              <input value={resources} onChange={(e) => setResources(e.target.value)} placeholder={`planned ${p.resources.police.recommended}`} className={inputClass} style={inputStyle} />
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1.5">Was the diversion effective?</div>
            <select value={effective} onChange={(e) => setEffective(e.target.value)} className={inputClass} style={inputStyle}>
              <option value="">— not applicable —</option>
              <option value="yes">Yes</option>
              <option value="partial">Partial</option>
              <option value="no">No</option>
            </select>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1.5">Field notes</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              placeholder="e.g. Heavy rain, tow truck arrived late; rerouted via Sarjapur which cleared well. Took about 3 hours."
              className={inputClass}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <div className="text-[10px] t-text-muted mt-1.5 italic">Gemini reads these notes — richer detail means better extracted tags and a cleaner dataset row.</div>
          </div>

          <button
            onClick={submit}
            disabled={!actual || saving}
            className="w-full font-semibold rounded-xl py-2.5 text-sm disabled:opacity-50 transition-all duration-200"
            style={{ background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)" }}
          >
            {saving ? "Saving…" : "Submit outcome"}
          </button>
        </div>

        {/* ── Context / results ── */}
        <div>
          {!done ? (
            <div className="rounded-2xl p-4 space-y-2.5" style={{ background: "var(--bg-card-inner)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1">What ASTRA predicted</div>
              <Ref label="Expected duration (P50)" value={`${p.duration_hours} h`} />
              <Ref label="Contingency (P90)" value={`${p.planning_duration_hours ?? p.duration_hours} h`} />
              <Ref label="Severity (ESI)" value={`${p.esi.toFixed(1)} · ${p.risk_level}`} />
              {p.long_event_probability != null && <Ref label="Long-event risk" value={`${Math.round(p.long_event_probability * 100)}%`} />}
              <Ref label="Top diversion" value={p.diversions.recommended[0]?.corridor ?? "—"} />
              <Ref label="Recommended officers" value={`${p.resources.police.recommended}`} />
            </div>
          ) : (
            <div className="rounded-2xl p-4" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}>
              <div className="text-sm font-bold text-emerald-400 mb-1">Outcome logged ✓</div>
              <div className="text-[12px] t-text-muted leading-relaxed">
                Future predictions for this cause + junction now calibrate to this. Re-running reflects it.
              </div>

              {insight && (insight.notes_summary || (insight.delay_factors && insight.delay_factors.length > 0)) && (
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <div className="text-[10px] uppercase tracking-wider t-text-muted font-medium mb-1.5">AI extracted from notes</div>
                  {insight.notes_summary && <div className="text-[12px] t-text-3 mb-1.5">{insight.notes_summary}</div>}
                  {insight.delay_factors && insight.delay_factors.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {insight.delay_factors.map((f) => (
                        <span key={f} className="text-[10px] px-2 py-0.5 rounded-md text-cyan-300" style={{ background: "rgba(34,211,238,0.1)" }}>
                          {f.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {meta?.ingested && (
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <div className="text-[12px] font-semibold text-emerald-400 mb-1">
                    {meta.retraining ? "↻ Added to dataset · pipeline retraining" : "✓ Added to the training dataset"}
                  </div>
                  <div className="text-[10px] t-text-muted leading-relaxed mb-2">
                    Gemini structured your note into a dataset row{meta.retraining ? " and the ML pipeline is rebuilding on it in the background." : "."}
                  </div>
                  {meta.structured && (
                    <div className="flex flex-wrap gap-1">
                      {meta.structured.event_cause && <span className="text-[10px] px-2 py-0.5 rounded-md t-text-2" style={{ background: "var(--bg-card-inner)" }}>cause · {meta.structured.event_cause.replace(/_/g, " ")}</span>}
                      {meta.structured.veh_type && meta.structured.veh_type !== "unknown" && <span className="text-[10px] px-2 py-0.5 rounded-md t-text-2" style={{ background: "var(--bg-card-inner)" }}>vehicle · {meta.structured.veh_type.replace(/_/g, " ")}</span>}
                      {meta.structured.requires_road_closure != null && <span className="text-[10px] px-2 py-0.5 rounded-md t-text-2" style={{ background: "var(--bg-card-inner)" }}>closure · {meta.structured.requires_road_closure ? "yes" : "no"}</span>}
                    </div>
                  )}
                </div>
              )}

              <button onClick={reset} className="mt-3 text-[11px] t-text-muted underline">Log another outcome</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
