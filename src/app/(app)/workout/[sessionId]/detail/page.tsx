"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { fmtKg } from "@/lib/utils/1rm";

type Params = { params: Promise<{ sessionId: string }> };

// ── Types ──────────────────────────────────────────────────────────────

type SetOutcome = "completed" | "failure" | "partial" | "skipped";

type WorkoutSet = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  weightKg: number | null;
  repsCompleted: number | null;
  rpe: number | null;
  outcome: SetOutcome;
  notes: string | null;
};

type Session = {
  id: string;
  title: string;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  totalVolumeKg: number | null;
  totalSets: number | null;
  totalReps: number | null;
  muscleGroupsTrained: string | null;
  perceivedLoad: string | null;
  satisfactionRating: number | null;
  feedbackText: string | null;
  sessionRpeAvg: number | null;
  aiAnalysisCompleted: boolean;
  sets: WorkoutSet[];
  aiReport: AiReport | null;
};

type AiReport = {
  highlights: string[];
  warnings: string[];
  recommendations: string[];
  plateauDetectedExercises: string[];
  overloadDetectedMuscles: string[];
  recoveryEstimates: Record<string, number>;
  nextSessionSuggestions: string[];
};

// ── Constants ──────────────────────────────────────────────────────────

const OUTCOME_STYLE: Record<SetOutcome, string> = {
  completed: "bg-secondary-container/20 text-secondary",
  partial:   "bg-amber-500/15 text-amber-400",
  failure:   "bg-error-container/15 text-error",
  skipped:   "bg-surface-container text-on-surface-variant/50",
};
const OUTCOME_LABEL: Record<SetOutcome, string> = {
  completed: "✓", partial: "~", failure: "✗", skipped: "—",
};

const LOAD_LABEL: Record<string, string> = {
  light: "Leicht", moderate: "Moderat", heavy: "Schwer",
  very_heavy: "Sehr schwer", maximal: "Maximal",
};
const MUSCLE_LABELS: Record<string, string> = {
  chest: "Brust", back: "Rücken", shoulders: "Schultern",
  biceps: "Bizeps", triceps: "Trizeps", forearms: "Unterarme",
  quadriceps: "Quadrizeps", hamstrings: "Hamstrings", glutes: "Gesäß",
  calves: "Waden", core: "Core", full_body: "Ganzkörper",
};

// ── Helpers ────────────────────────────────────────────────────────────

function fmtDuration(s: number | null): string {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}min`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ── Editable Set Row ──────────────────────────────────────────────────

function SetRow({
  set,
  editMode,
  onSave,
  onDelete,
}: {
  set: WorkoutSet;
  editMode: boolean;
  onSave: (id: string, data: Partial<WorkoutSet>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [weight, setWeight] = useState(String(set.weightKg ?? ""));
  const [reps, setReps] = useState(String(set.repsCompleted ?? ""));
  const [rpe, setRpe] = useState(String(set.rpe ?? ""));
  const [outcome, setOutcome] = useState<SetOutcome>(set.outcome);
  const [notes, setNotes] = useState(set.notes ?? "");
  const [saving, setSaving] = useState(false);

  const dirty =
    weight !== String(set.weightKg ?? "") ||
    reps !== String(set.repsCompleted ?? "") ||
    rpe !== String(set.rpe ?? "") ||
    outcome !== set.outcome ||
    notes !== (set.notes ?? "");

  async function handleSave() {
    setSaving(true);
    await onSave(set.id, {
      weightKg: parseFloat(weight) || null,
      repsCompleted: parseInt(reps) || null,
      rpe: parseFloat(rpe) || null,
      outcome,
      notes: notes || null,
    });
    setSaving(false);
  }

  if (!editMode) {
    return (
      <div className="flex items-center gap-3 py-2 border-b border-outline-variant/10 last:border-0">
        <span className="w-5 text-xs font-mono text-on-surface-variant/40 shrink-0 text-center">
          {set.setNumber}
        </span>
        <span className="text-sm font-bold text-on-surface tabular-nums w-20">
          {fmtKg(set.weightKg)}
        </span>
        <span className="text-on-surface-variant/40 text-xs">×</span>
        <span className="text-sm font-bold text-on-surface tabular-nums w-8">
          {set.repsCompleted ?? "—"}
        </span>
        {set.rpe != null && (
          <span className="text-xs font-mono text-on-surface-variant/50 bg-surface-container px-1.5 py-0.5 rounded">
            RPE {set.rpe}
          </span>
        )}
        <span className={cn("ml-auto text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full", OUTCOME_STYLE[set.outcome])}>
          {OUTCOME_LABEL[set.outcome]}
        </span>
        {set.notes && (
          <span className="text-xs text-on-surface-variant/50 italic truncate max-w-24">{set.notes}</span>
        )}
      </div>
    );
  }

  return (
    <div className="py-3 border-b border-outline-variant/10 last:border-0 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="w-5 text-xs font-mono text-on-surface-variant/40 shrink-0 text-center">
          {set.setNumber}
        </span>
        <input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="kg"
          className="w-20 rounded-lg bg-surface-container px-2.5 py-1.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <span className="text-on-surface-variant/40 text-xs">×</span>
        <input
          type="number"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder="Wdh"
          className="w-16 rounded-lg bg-surface-container px-2.5 py-1.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <input
          type="number"
          value={rpe}
          onChange={(e) => setRpe(e.target.value)}
          placeholder="RPE"
          step="0.5"
          className="w-16 rounded-lg bg-surface-container px-2.5 py-1.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <div className="flex gap-1 ml-auto">
          {(["completed", "partial", "failure", "skipped"] as SetOutcome[]).map((o) => (
            <button
              key={o}
              onClick={() => setOutcome(o)}
              className={cn(
                "w-7 h-7 rounded-lg text-xs font-bold transition-all",
                outcome === o ? OUTCOME_STYLE[o] : "text-on-surface-variant/30"
              )}
            >
              {OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 pl-6">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notiz…"
          className="flex-1 rounded-lg bg-surface-container px-2.5 py-1.5 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs text-primary hover:text-primary/80 font-medium shrink-0 disabled:opacity-50"
          >
            {saving ? "…" : "Speichern"}
          </button>
        )}
        <button
          onClick={() => onDelete(set.id)}
          className="text-xs text-on-surface-variant/30 hover:text-error transition-colors shrink-0"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Exercise Group ─────────────────────────────────────────────────────

function ExerciseGroup({
  name,
  sets,
  editMode,
  onSave,
  onDelete,
}: {
  name: string;
  sets: WorkoutSet[];
  editMode: boolean;
  onSave: (id: string, data: Partial<WorkoutSet>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const volume = sets
    .filter((s) => s.outcome !== "skipped")
    .reduce((acc, s) => acc + (s.weightKg ?? 0) * (s.repsCompleted ?? 0), 0);

  return (
    <div className="rounded-xl bg-surface-container-low p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="font-semibold text-on-surface">{name}</p>
        <p className="text-xs font-mono text-on-surface-variant/50">
          {sets.length} Sätze · {volume.toFixed(0)} kg
        </p>
      </div>
      {sets.map((s) => (
        <SetRow key={s.id} set={s} editMode={editMode} onSave={onSave} onDelete={onDelete} />
      ))}
    </div>
  );
}

// ── AI Section ─────────────────────────────────────────────────────────

function AnalysisSection({ title, items, color, icon }: {
  title: string; items: string[]; color: string; icon: string;
}) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl bg-surface-container-low p-4">
      <p className="text-xs font-mono uppercase tracking-wider text-on-surface-variant/60 mb-3">{title}</p>
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-on-surface">
            <span className={cn("shrink-0 font-bold", color)}>{icon}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────

export default function WorkoutDetailPage({ params }: Params) {
  const { sessionId } = use(params);
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [analyzingAi, setAnalyzingAi] = useState(false);

  // Session-level edit state
  const [perceivedLoad, setPerceivedLoad] = useState<string>("");
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => {
    fetch(`/api/workout/${sessionId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: Session | null) => {
        if (data) {
          setSession(data);
          setPerceivedLoad(data.perceivedLoad ?? "");
          setSatisfaction(data.satisfactionRating ?? null);
          setFeedbackText(data.feedbackText ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  async function handleSaveSet(setId: string, data: Partial<WorkoutSet>) {
    await fetch(`/api/workout/${sessionId}/sets/${setId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSession((prev) => prev ? {
      ...prev,
      sets: prev.sets.map((s) => s.id === setId ? { ...s, ...data } : s),
    } : prev);
  }

  async function handleDeleteSet(setId: string) {
    await fetch(`/api/workout/${sessionId}/sets/${setId}`, { method: "DELETE" });
    setSession((prev) => prev ? {
      ...prev,
      sets: prev.sets.filter((s) => s.id !== setId),
    } : prev);
  }

  async function handleRunAnalysis() {
    setAnalyzingAi(true);
    const res = await fetch(`/api/workout/${sessionId}/analyze`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setSession((prev) => prev ? { ...prev, aiReport: data.aiAnalysis, aiAnalysisCompleted: true } : prev);
    }
    setAnalyzingAi(false);
  }

  async function handleSaveMeta() {
    setSavingMeta(true);
    await fetch(`/api/workout/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        perceivedLoad: perceivedLoad || null,
        satisfactionRating: satisfaction,
        feedbackText: feedbackText || null,
      }),
    });
    setSession((prev) => prev ? {
      ...prev,
      perceivedLoad: perceivedLoad || null,
      satisfactionRating: satisfaction,
      feedbackText: feedbackText || null,
    } : prev);
    setSavingMeta(false);
    setEditMode(false);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-on-surface-variant/50 text-sm">Laden…</span>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-error text-sm">Training nicht gefunden.</span>
      </div>
    );
  }

  // Group sets by exercise
  const exerciseGroups: Record<string, { name: string; sets: WorkoutSet[] }> = {};
  for (const s of session.sets) {
    if (!exerciseGroups[s.exerciseId]) {
      exerciseGroups[s.exerciseId] = { name: s.exerciseName, sets: [] };
    }
    exerciseGroups[s.exerciseId].sets.push(s);
  }

  const muscles: string[] = (() => {
    try { return JSON.parse(session.muscleGroupsTrained ?? "[]"); } catch { return []; }
  })();

  const LOAD_OPTIONS = ["light", "moderate", "heavy", "very_heavy", "maximal"];
  const LOAD_COLOR: Record<string, string> = {
    light: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    moderate: "bg-secondary-container/30 text-secondary border-secondary/30",
    heavy: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    very_heavy: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    maximal: "bg-error-container/20 text-error border-error/30",
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-outline-variant/10 bg-surface-container-low px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.back()}
            className="text-on-surface-variant/60 hover:text-on-surface transition-colors shrink-0"
          >
            ←
          </button>
          <div className="min-w-0">
            <h1 className="font-headline font-bold text-on-surface truncate">{session.title}</h1>
            <p className="text-xs text-on-surface-variant/60 font-mono mt-0.5">{fmtDate(session.startedAt)}</p>
          </div>
        </div>
        <button
          onClick={() => editMode ? handleSaveMeta() : setEditMode(true)}
          disabled={savingMeta}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-bold transition-all shrink-0 disabled:opacity-50",
            editMode
              ? "bg-primary text-on-primary hover:opacity-90"
              : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
          )}
        >
          {savingMeta ? "Speichern…" : editMode ? "Speichern" : "Bearbeiten"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-5 pb-10">

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Dauer",   value: fmtDuration(session.durationSeconds) },
              { label: "Volumen", value: session.totalVolumeKg ? `${session.totalVolumeKg.toFixed(0)} kg` : "—" },
              { label: "Sätze",  value: String(session.totalSets ?? "—") },
              { label: "⌀ RPE",  value: session.sessionRpeAvg ? session.sessionRpeAvg.toFixed(1) : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-surface-container-low p-3 text-center">
                <p className="text-xs font-mono text-on-surface-variant/50 mb-0.5">{label}</p>
                <p className="font-headline text-base font-bold text-primary tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {/* Muscle groups */}
          {muscles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {muscles.map((mg) => (
                <span key={mg} className="rounded-full bg-surface-container px-2.5 py-0.5 text-xs text-on-surface-variant">
                  {MUSCLE_LABELS[mg] ?? mg}
                </span>
              ))}
            </div>
          )}

          {/* Session meta edit */}
          {editMode && (
            <div className="rounded-xl bg-surface-container-low p-4 flex flex-col gap-4">
              <p className="text-xs font-mono uppercase text-on-surface-variant/60">Bewertung</p>

              <div>
                <p className="text-xs text-on-surface-variant/70 mb-2">Belastung</p>
                <div className="flex flex-wrap gap-2">
                  {LOAD_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setPerceivedLoad(perceivedLoad === opt ? "" : opt)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium border transition-all",
                        perceivedLoad === opt
                          ? LOAD_COLOR[opt]
                          : "border-outline-variant/20 text-on-surface-variant/60 hover:border-outline-variant"
                      )}
                    >
                      {LOAD_LABEL[opt]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-on-surface-variant/70 mb-2">Zufriedenheit</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setSatisfaction(satisfaction === n ? null : n)}
                      className={cn(
                        "flex-1 rounded-lg py-2 text-base transition-all",
                        satisfaction === n ? "bg-primary/20" : "bg-surface-container"
                      )}
                    >
                      {["😞", "😕", "😐", "😊", "🔥"][n - 1]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-on-surface-variant/70 mb-1.5">Notizen</p>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Wie lief das Training?"
                  rows={3}
                  className="w-full rounded-xl bg-surface-container px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
                />
              </div>
            </div>
          )}

          {/* Session meta display */}
          {!editMode && (session.perceivedLoad || session.satisfactionRating || session.feedbackText) && (
            <div className="rounded-xl bg-surface-container-low p-4 flex flex-wrap gap-4">
              {session.perceivedLoad && (
                <div>
                  <p className="text-xs font-mono text-on-surface-variant/50 mb-0.5">Belastung</p>
                  <p className="text-sm font-medium text-on-surface">{LOAD_LABEL[session.perceivedLoad] ?? session.perceivedLoad}</p>
                </div>
              )}
              {session.satisfactionRating && (
                <div>
                  <p className="text-xs font-mono text-on-surface-variant/50 mb-0.5">Zufriedenheit</p>
                  <p className="text-base">{["😞", "😕", "😐", "😊", "🔥"][session.satisfactionRating - 1]}</p>
                </div>
              )}
              {session.feedbackText && (
                <div className="w-full">
                  <p className="text-xs font-mono text-on-surface-variant/50 mb-0.5">Notizen</p>
                  <p className="text-sm text-on-surface">{session.feedbackText}</p>
                </div>
              )}
            </div>
          )}

          {/* Exercise sets */}
          {Object.keys(exerciseGroups).length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-mono uppercase tracking-wider text-on-surface-variant/60">
                Übungen & Sätze
              </h2>
              {Object.values(exerciseGroups).map((group) => (
                <ExerciseGroup
                  key={group.name}
                  name={group.name}
                  sets={group.sets}
                  editMode={editMode}
                  onSave={handleSaveSet}
                  onDelete={handleDeleteSet}
                />
              ))}
            </div>
          )}

          {/* AI Analysis — manual trigger */}
          {session.completedAt && !session.aiReport && (
            <div className="rounded-xl bg-surface-container-low p-4 flex flex-col gap-3">
              <p className="text-xs font-mono uppercase tracking-wider text-on-surface-variant/60 flex items-center gap-2">
                <span className="text-on-surface-variant/40">◈</span> Atlas-Analyse
              </p>
              <p className="text-sm text-on-surface-variant/60">
                Die KI-Analyse wurde nicht automatisch durchgeführt.
              </p>
              <button
                onClick={handleRunAnalysis}
                disabled={analyzingAi}
                className="self-start rounded-xl bg-primary/10 border border-primary/20 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analyzingAi ? "Analyse läuft…" : "Analyse jetzt starten"}
              </button>
            </div>
          )}

          {/* AI Analysis */}
          {session.aiReport && (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-mono uppercase tracking-wider text-on-surface-variant/60 flex items-center gap-2">
                <span className="text-primary">◈</span> Atlas-Analyse
              </h2>
              <AnalysisSection title="Highlights" items={session.aiReport.highlights} color="text-primary" icon="✦" />
              <AnalysisSection title="Hinweise" items={session.aiReport.warnings} color="text-amber-400" icon="⚠" />
              <AnalysisSection title="Empfehlungen" items={session.aiReport.recommendations} color="text-secondary" icon="→" />
              <AnalysisSection title="Nächstes Training" items={session.aiReport.nextSessionSuggestions} color="text-on-surface-variant" icon="◦" />

              {/* Recovery */}
              {Object.keys(session.aiReport.recoveryEstimates).length > 0 && (
                <div className="rounded-xl bg-surface-container-low p-4">
                  <p className="text-xs font-mono uppercase text-on-surface-variant/60 mb-3">Erholung</p>
                  <div className="flex flex-col gap-2">
                    {Object.entries(session.aiReport.recoveryEstimates).map(([muscle, hours]) => (
                      <div key={muscle} className="flex items-center gap-3">
                        <span className="text-sm text-on-surface w-28 shrink-0">{MUSCLE_LABELS[muscle] ?? muscle}</span>
                        <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
                          <div className="h-full bg-primary/50 rounded-full" style={{ width: `${Math.min(100, (hours / 72) * 100)}%` }} />
                        </div>
                        <span className="text-xs font-mono text-on-surface-variant/50 w-10 text-right">{hours}h</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Plateau / Overload warnings */}
              {(session.aiReport.plateauDetectedExercises.length > 0 || session.aiReport.overloadDetectedMuscles.length > 0) && (
                <div className="rounded-xl bg-error-container/10 border border-error/20 p-4 flex flex-col gap-3">
                  {session.aiReport.plateauDetectedExercises.length > 0 && (
                    <div>
                      <p className="text-xs font-mono text-error/70 mb-1.5">Plateau erkannt</p>
                      <div className="flex flex-wrap gap-1.5">
                        {session.aiReport.plateauDetectedExercises.map((ex) => (
                          <span key={ex} className="rounded bg-error/10 px-2 py-0.5 text-xs text-error">{ex}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {session.aiReport.overloadDetectedMuscles.length > 0 && (
                    <div>
                      <p className="text-xs font-mono text-error/70 mb-1.5">Überlastung</p>
                      <div className="flex flex-wrap gap-1.5">
                        {session.aiReport.overloadDetectedMuscles.map((mg) => (
                          <span key={mg} className="rounded bg-error/10 px-2 py-0.5 text-xs text-error">{MUSCLE_LABELS[mg] ?? mg}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
