"use client";

import { useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { estimated1rm, fmtKg } from "@/lib/utils/1rm";
import {
  useWorkoutStore,
  type LoggedSet,
  type SetOutcome,
  type WorkoutExercise,
} from "@/stores/workout-store";
import { ExerciseAlternativesModal, type ExerciseAlternative } from "@/components/exercise-alternatives-modal";

// ── Types ──────────────────────────────────────────────────────────────

type ExerciseOption = {
  id: string;
  nameI18n: string;
  primaryMuscleGroup: string;
};

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Brust", back: "Rücken", shoulders: "Schultern",
  biceps: "Bizeps", triceps: "Trizeps", forearms: "Unterarme",
  quadriceps: "Quadrizeps", hamstrings: "Hamstrings", glutes: "Gesäß",
  calves: "Waden", core: "Core", full_body: "Ganzkörper",
};

function parseName(nameI18n: string): string {
  try { const p = JSON.parse(nameI18n); return p.de || p.en || ""; } catch { return ""; }
}

// ── Exercise Picker Modal ─────────────────────────────────────────────

function ExercisePicker({
  onAdd,
  onClose,
}: {
  onAdd: (ex: ExerciseOption) => void;
  onClose: () => void;
}) {
  const [exercises, setExercises] = useState<ExerciseOption[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/exercises")
      .then((r) => r.ok ? r.json() : [])
      .then(setExercises)
      .finally(() => setLoading(false));
  }, []);

  const filtered = exercises.filter((ex) => {
    const name = parseName(ex.nameI18n).toLowerCase();
    const muscle = (MUSCLE_LABELS[ex.primaryMuscleGroup] ?? "").toLowerCase();
    const q = query.toLowerCase();
    return name.includes(q) || muscle.includes(q);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-surface/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-surface-container-high flex flex-col max-h-[80vh] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
          <h2 className="font-headline font-bold text-on-surface">Übung hinzufügen</h2>
          <button onClick={onClose} className="text-on-surface-variant/50 hover:text-on-surface transition-colors">✕</button>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <input
            type="text"
            autoFocus
            placeholder="Suche nach Name oder Muskelgruppe…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl bg-surface-container px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-1.5">
          {loading ? (
            <p className="text-center text-sm text-on-surface-variant/50 py-8">Laden…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-on-surface-variant/50 py-8">Keine Übungen gefunden.</p>
          ) : (
            filtered.map((ex) => (
              <button
                key={ex.id}
                onClick={() => onAdd(ex)}
                className="w-full rounded-xl bg-surface-container px-4 py-3 text-left hover:bg-surface-container-high transition-colors flex items-center justify-between gap-3"
              >
                <span className="text-sm font-medium text-on-surface">{parseName(ex.nameI18n)}</span>
                <span className="text-xs text-on-surface-variant/50 shrink-0">
                  {MUSCLE_LABELS[ex.primaryMuscleGroup] ?? ex.primaryMuscleGroup}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

type SetOutcomeOption = { value: SetOutcome; label: string; color: string };

const OUTCOMES: SetOutcomeOption[] = [
  { value: "completed", label: "Geschafft",  color: "bg-secondary-container/30 text-secondary border-secondary/30" },
  { value: "partial",   label: "Teilweise",  color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { value: "failure",   label: "Versagt",    color: "bg-error-container/20 text-error border-error/30" },
  { value: "skipped",   label: "Übersprungen", color: "bg-surface-container text-on-surface-variant border-outline-variant/20" },
];

const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const RIR_OPTIONS = [0, 1, 2, 3, 4];

function rirToRpe(rir: number): number {
  return 10 - rir;
}

// ── Stopwatch ─────────────────────────────────────────────────────────

function useStopwatch(startedAt: string | null) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const origin = new Date(startedAt).getTime();
    const update = () => setElapsed(Math.floor((Date.now() - origin) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const label = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
  return { elapsed, label };
}

// ── Rest Timer ────────────────────────────────────────────────────────

function RestTimerBar({ seconds, total, onSkip }: { seconds: number; total: number; onSkip: () => void }) {
  const pct = total > 0 ? Math.round((seconds / total) * 100) : 0;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface-container-high/95 backdrop-blur px-5 py-3 flex items-center gap-4 border-t border-outline-variant/10">
      <span className="text-secondary font-mono font-bold text-lg w-16 shrink-0 tabular-nums">
        {m}:{String(s).padStart(2, "0")}
      </span>
      <div className="flex-1 h-2 bg-surface-container rounded-full overflow-hidden">
        <div
          className="h-full bg-secondary rounded-full transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-on-surface-variant/60 shrink-0">Pause</span>
      <button
        onClick={onSkip}
        className="text-xs text-on-surface-variant/50 hover:text-on-surface transition-colors shrink-0 underline"
      >
        Skip
      </button>
    </div>
  );
}

// ── Set Input Form ────────────────────────────────────────────────────

function SetInputForm({
  setNumber,
  trackingType,
  suggested,
  prevSet,
  onLog,
  isLogging,
}: {
  setNumber: number;
  trackingType: "weight_reps" | "duration";
  suggested: { weightKg: number | null; repsMin: number; repsMax: number | null; targetDurationSeconds: number | null };
  prevSet: LoggedSet | null;
  onLog: (data: Omit<LoggedSet, "localId" | "savedId">) => void;
  isLogging: boolean;
}) {
  const [weight, setWeight] = useState(
    String(prevSet?.weightKg ?? suggested.weightKg ?? "")
  );
  const [reps, setReps] = useState(
    String(prevSet?.repsCompleted ?? suggested.repsMin ?? "")
  );
  const [durationMin, setDurationMin] = useState(
    prevSet?.durationSeconds != null
      ? String(prevSet.durationSeconds / 60)
      : suggested.targetDurationSeconds != null
        ? String(suggested.targetDurationSeconds / 60)
        : ""
  );
  const [rpe, setRpe] = useState<number | null>(prevSet?.rpe ?? null);
  const [outcome, setOutcome] = useState<SetOutcome>("completed");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [inputMode, setInputMode] = useState<"rpe" | "rir">("rpe");
  const [rirValue, setRirValue] = useState<number | null>(null);

  const wKg = parseFloat(weight) || null;
  const rNum = parseInt(reps) || null;
  const durSec = durationMin ? Math.round(parseFloat(durationMin) * 60) : null;
  const e1rm = wKg && rNum ? estimated1rm(wKg, rNum) : null;

  function adjustWeight(delta: number) {
    const current = parseFloat(weight) || 0;
    const next = Math.max(0, Math.round((current + delta) * 10) / 10);
    setWeight(String(next));
  }

  function adjustReps(delta: number) {
    const current = parseInt(reps) || 0;
    setReps(String(Math.max(1, current + delta)));
  }

  function adjustDuration(delta: number) {
    const current = parseFloat(durationMin) || 0;
    const next = Math.max(0.5, Math.round((current + delta) * 10) / 10);
    setDurationMin(String(next));
  }

  function handleLog() {
    const resolvedRpe = inputMode === "rir" && rirValue !== null ? rirToRpe(rirValue) : rpe;
    setRirValue(null);
    if (trackingType === "duration") {
      setDurationMin("");
      onLog({ setNumber, weightKg: null, repsCompleted: null, durationSeconds: durSec, rpe: resolvedRpe, outcome, notes, estimated1rm: undefined });
    } else {
      onLog({ setNumber, weightKg: wKg, repsCompleted: rNum, durationSeconds: null, rpe: resolvedRpe, outcome, notes, estimated1rm: e1rm ?? undefined });
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-surface-container p-4 flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <span className="text-xs font-mono text-on-surface-variant/50 w-5 shrink-0">{setNumber}</span>
        <span className="text-xs font-mono text-on-surface-variant/50">Satz {setNumber}</span>
        {e1rm && (
          <span className="ml-auto text-xs font-mono text-primary/70">~{e1rm} kg 1RM</span>
        )}
      </div>

      {/* Weight + Reps  OR  Duration */}
      {trackingType === "duration" ? (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-on-surface-variant/60 uppercase">
            Dauer (min){suggested.targetDurationSeconds ? ` · Ziel ${(suggested.targetDurationSeconds / 60).toFixed(1)} min` : ""}
          </label>
          <div className="flex items-center rounded-lg bg-surface-container-high overflow-hidden">
            <StepBtn onClick={() => adjustDuration(-0.5)}>−</StepBtn>
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              placeholder={suggested.targetDurationSeconds ? String(suggested.targetDurationSeconds / 60) : "1"}
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              className="flex-1 bg-transparent py-2.5 text-base font-medium text-center text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none no-spinner"
            />
            <StepBtn onClick={() => adjustDuration(0.5)}>+</StepBtn>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-mono text-on-surface-variant/60 uppercase">Gewicht (kg)</label>
            <div className="flex items-center rounded-lg bg-surface-container-high overflow-hidden">
              <StepBtn onClick={() => adjustWeight(-2.5)}>−</StepBtn>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                placeholder={suggested.weightKg ? `${suggested.weightKg}` : "0"}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="flex-1 bg-transparent py-2.5 text-base font-medium text-center text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none no-spinner"
              />
              <StepBtn onClick={() => adjustWeight(2.5)}>+</StepBtn>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-mono text-on-surface-variant/60 uppercase">
              Wdh {suggested.repsMin}{suggested.repsMax ? `–${suggested.repsMax}` : ""}
            </label>
            <div className="flex items-center rounded-lg bg-surface-container-high overflow-hidden">
              <StepBtn onClick={() => adjustReps(-1)}>−</StepBtn>
              <input
                type="number"
                inputMode="numeric"
                step="1"
                placeholder={`${suggested.repsMin}`}
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                className="flex-1 bg-transparent py-2.5 text-base font-medium text-center text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none no-spinner"
              />
              <StepBtn onClick={() => adjustReps(1)}>+</StepBtn>
            </div>
          </div>
        </div>
      )}

      {/* Outcome buttons */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-mono text-on-surface-variant/60 uppercase">Ergebnis</label>
        <div className="grid grid-cols-2 gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              onClick={() => setOutcome(o.value)}
              className={cn(
                "rounded-lg py-2 text-sm font-medium border transition-all",
                outcome === o.value ? o.color : "bg-transparent text-on-surface-variant/50 border-outline-variant/20 hover:border-outline-variant"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* RPE / RIR */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-on-surface-variant/60 uppercase">
            {inputMode === "rpe"
              ? `RPE ${rpe != null ? rpe : "— (optional)"}`
              : `RIR ${rirValue != null ? rirValue : "— (optional)"}`}
          </span>
          <div className="seg">
            <button
              type="button"
              className={cn(inputMode === "rpe" && "on")}
              onClick={() => { setInputMode("rpe"); setRirValue(null); }}
            >RPE</button>
            <button
              type="button"
              className={cn(inputMode === "rir" && "on")}
              onClick={() => { setInputMode("rir"); setRpe(null); }}
            >RIR</button>
          </div>
        </div>
        {inputMode === "rpe" ? (
          <div className="flex gap-1.5 flex-wrap">
            {RPE_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRpe(rpe === r ? null : r)}
                className={cn(
                  "flex-1 min-w-[2.5rem] rounded-lg py-1.5 text-sm font-mono transition-all",
                  rpe === r
                    ? "bg-primary/20 text-primary"
                    : "bg-surface-container-high text-on-surface-variant/50 hover:text-on-surface-variant"
                )}
              >
                {r}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex gap-1.5 flex-wrap items-center">
            {RIR_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRirValue(rirValue === r ? null : r)}
                className={cn(
                  "flex-1 min-w-[2.5rem] rounded-lg py-1.5 text-sm font-mono transition-all",
                  rirValue === r
                    ? "bg-secondary/20 text-secondary"
                    : "bg-surface-container-high text-on-surface-variant/50 hover:text-on-surface-variant"
                )}
              >
                {r}
              </button>
            ))}
            <span className="text-xs font-mono text-on-surface-variant/40 ml-1 shrink-0">Wdh. übrig</span>
          </div>
        )}
      </div>

      {/* Notes toggle */}
      {showNotes ? (
        <input
          type="text"
          placeholder="Notiz zum Satz…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-lg bg-surface-container-high px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      ) : (
        <button
          onClick={() => setShowNotes(true)}
          className="text-xs text-on-surface-variant/40 hover:text-on-surface-variant transition-colors text-left"
        >
          + Notiz hinzufügen
        </button>
      )}

      {/* Log button */}
      <button
        onClick={handleLog}
        disabled={isLogging}
        className="w-full rounded-xl bg-primary text-on-primary py-3 text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50"
      >
        {isLogging ? "Speichern…" : "Satz loggen"}
      </button>
    </div>
  );
}

// ── Logged Set Row ────────────────────────────────────────────────────

function LoggedSetRow({ set, onRemove }: { set: LoggedSet; onRemove: () => void }) {
  const outcome = OUTCOMES.find((o) => o.value === set.outcome);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-outline-variant/10 last:border-b-0">
      <span className="w-5 text-center text-xs font-mono text-on-surface-variant/40 shrink-0">
        {set.setNumber}
      </span>
      <div className="flex-1 flex items-center gap-3 min-w-0">
        {set.durationSeconds != null ? (
          <span className="text-base font-bold text-secondary tabular-nums">
            {(set.durationSeconds / 60).toFixed(1)} min
          </span>
        ) : (
          <>
            <span className="text-base font-bold text-on-surface tabular-nums">
              {fmtKg(set.weightKg)}
            </span>
            <span className="text-on-surface-variant/40 text-sm">×</span>
            <span className="text-base font-bold text-on-surface tabular-nums">
              {set.repsCompleted ?? "—"}
            </span>
          </>
        )}
        {set.rpe != null && (
          <span className="text-xs font-mono text-on-surface-variant/50 bg-surface-container px-1.5 py-0.5 rounded">
            RPE {set.rpe}
          </span>
        )}
        {set.estimated1rm && (
          <span className="text-xs font-mono text-primary/70">~{set.estimated1rm} kg</span>
        )}
        {set.isPR && (
          <span className="text-xs font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5">PR ✦</span>
        )}
      </div>
      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-lg border shrink-0", outcome?.color)}>
        {outcome?.label.slice(0, 5)}
      </span>
      <button
        onClick={onRemove}
        className="text-xs text-on-surface-variant/20 hover:text-error transition-colors shrink-0"
      >
        ✕
      </button>
    </div>
  );
}

// ── Exercise Card ─────────────────────────────────────────────────────

function ExerciseCard({
  exercise,
  exerciseIdx,
  sessionId,
  onSetLogged,
}: {
  exercise: WorkoutExercise;
  exerciseIdx: number;
  sessionId: string;
  onSetLogged: (exerciseIdx: number, restSeconds: number | null, set: LoggedSet) => void;
}) {
  const { addLoggedSet, removeLoggedSet, updateLoggedSet, replaceExercise } = useWorkoutStore();
  const [isLogging, setIsLogging] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showAltModal, setShowAltModal] = useState(false);

  function handleSelectAlternative(alt: ExerciseAlternative) {
    replaceExercise(exerciseIdx, {
      planExerciseId: null,
      exerciseId: alt.exerciseId,
      name: alt.exerciseName,
      primaryMuscleGroup: alt.primaryMuscleGroup,
      trackingType: "weight_reps",
      targetSets: alt.sets,
      repsMin: alt.repsMin,
      repsMax: alt.repsMax,
      targetDurationSeconds: null,
      targetRpe: null,
      restSeconds: exercise.restSeconds,
      suggestedWeightKg: alt.suggestedWeightKg,
      notes: null,
      loggedSets: [],
    });
    setShowAltModal(false);
  }

  const loggedSets = exercise.loggedSets ?? [];
  const nextSetNumber = loggedSets.length + 1;
  const allTargetSetsLogged = loggedSets.length >= exercise.targetSets;
  const prevSet = loggedSets[loggedSets.length - 1] ?? null;

  async function handleLog(data: Omit<LoggedSet, "localId" | "savedId">) {
    setIsLogging(true);
    const localId = `${Date.now()}-${Math.random()}`;
    const optimistic: LoggedSet = { ...data, localId };
    addLoggedSet(exerciseIdx, optimistic);

    try {
      const res = await fetch(`/api/workout/${sessionId}/sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId: exercise.exerciseId,
          planExerciseId: exercise.planExerciseId,
          setNumber: data.setNumber,
          weightKg: data.weightKg,
          repsCompleted: data.repsCompleted,
          durationSeconds: data.durationSeconds,
          rpe: data.rpe,
          outcome: data.outcome,
          notes: data.notes || undefined,
        }),
      });
      if (res.ok) {
        const { id, estimated1rm: e1rm, isPR } = await res.json();
        updateLoggedSet(exerciseIdx, localId, { savedId: id, estimated1rm: e1rm ?? undefined, isPR: isPR ?? false });
        onSetLogged(exerciseIdx, exercise.restSeconds, { ...optimistic, savedId: id, estimated1rm: e1rm, isPR });
      }
    } catch {
      removeLoggedSet(exerciseIdx, localId);
    } finally {
      setIsLogging(false);
    }
  }

  const doneCount = loggedSets.length;
  const isDone = allTargetSetsLogged;

  return (
    <div className="rounded-2xl bg-surface-container-low flex flex-col">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div
          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
          onClick={() => setCollapsed((v) => !v)}
        >
          <div className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            isDone
              ? "bg-secondary text-on-secondary"
              : "bg-surface-container text-on-surface-variant"
          )}>
            {isDone ? "✓" : exerciseIdx + 1}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-on-surface truncate">{exercise.name}</p>
            <p className="text-xs text-on-surface-variant/60 font-mono mt-0.5">
              {exercise.trackingType === "duration"
                ? `${exercise.targetSets} × ${exercise.targetDurationSeconds ? (exercise.targetDurationSeconds / 60).toFixed(1) : "?"} min`
                : `${exercise.targetSets} × ${exercise.repsMin}${exercise.repsMax ? `–${exercise.repsMax}` : ""} Wdh`}
              {exercise.trackingType !== "duration" && exercise.suggestedWeightKg ? ` · ${exercise.suggestedWeightKg} kg` : ""}
              {exercise.targetRpe ? ` · RPE ${exercise.targetRpe}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <button
            onClick={() => setShowAltModal(true)}
            className="text-xs font-mono text-secondary/70 hover:text-secondary transition-colors px-1.5 py-0.5 rounded hover:bg-secondary/10"
            title="KI-Alternative vorschlagen"
          >
            ⇄
          </button>
          <span
            className={cn(
              "text-xs font-mono font-bold px-2 py-0.5 rounded-full cursor-pointer",
              isDone ? "bg-secondary/20 text-secondary" : "bg-surface-container text-on-surface-variant/60"
            )}
            onClick={() => setCollapsed((v) => !v)}
          >
            {doneCount}/{exercise.targetSets}
          </span>
          <span className="text-on-surface-variant/40 text-xs cursor-pointer" onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? "▼" : "▲"}
          </span>
        </div>
      </div>

      {!collapsed && (
        <div className="px-5 pb-5 flex flex-col">
          {/* Logged sets list */}
          {loggedSets.length > 0 && (
            <div className="mb-2 rounded-xl bg-surface-container/50 px-3">
              {loggedSets.map((set) => (
                <LoggedSetRow
                  key={set.localId}
                  set={set}
                  onRemove={() => removeLoggedSet(exerciseIdx, set.localId)}
                />
              ))}
            </div>
          )}

          {/* Set input form — always show next set */}
          <SetInputForm
            setNumber={nextSetNumber}
            trackingType={exercise.trackingType}
            suggested={{
              weightKg: exercise.suggestedWeightKg,
              repsMin: exercise.repsMin,
              repsMax: exercise.repsMax,
              targetDurationSeconds: exercise.targetDurationSeconds,
            }}
            prevSet={prevSet}
            onLog={handleLog}
            isLogging={isLogging}
          />

          {exercise.restSeconds && (
            <p className="mt-2 text-center text-xs text-on-surface-variant/40 font-mono">
              Pause nach Satz: {exercise.restSeconds}s
            </p>
          )}
          {exercise.notes && (
            <p className="mt-1 text-xs text-on-surface-variant/50 italic">{exercise.notes}</p>
          )}
        </div>
      )}
      {showAltModal && (
        <ExerciseAlternativesModal
          exerciseId={exercise.exerciseId}
          exerciseName={exercise.name}
          primaryMuscleGroup={exercise.primaryMuscleGroup}
          sets={exercise.targetSets}
          repsMin={exercise.repsMin}
          repsMax={exercise.repsMax}
          suggestedWeightKg={exercise.suggestedWeightKg}
          onSelect={handleSelectAlternative}
          onClose={() => setShowAltModal(false)}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function WorkoutPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const {
    activeWorkout, startWorkout, clearWorkout, addExercise,
    restTimerSeconds, restTimerActive,
    startRestTimer, tickRestTimer, stopRestTimer,
  } = useWorkoutStore();

  const [loading, setLoading] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const restTotalRef = useRef(0);

  // Restore workout from API if not in store
  useEffect(() => {
    if (activeWorkout?.sessionId === sessionId) return;
    setLoading(true);
    fetch(`/api/workout/${sessionId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && !data.error) {
          startWorkout({
            sessionId: data.id,
            title: data.title,
            trainingDayId: data.trainingDayId,
            startedAt: data.startedAt,
            exercises: [],
          });
        }
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Rest timer countdown
  useEffect(() => {
    if (!restTimerActive) return;
    const id = setInterval(() => tickRestTimer(), 1000);
    return () => clearInterval(id);
  }, [restTimerActive, tickRestTimer]);

  const { elapsed, label: stopwatchLabel } = useStopwatch(activeWorkout?.startedAt ?? null);

  function handleSetLogged(_exerciseIdx: number, restSeconds: number | null, _set: LoggedSet) {
    if (restSeconds && restSeconds > 0) {
      restTotalRef.current = restSeconds;
      startRestTimer(restSeconds, _exerciseIdx);
    }
  }

  function handleAddExercise(ex: ExerciseOption) {
    addExercise({
      planExerciseId: null,
      exerciseId: ex.id,
      name: parseName(ex.nameI18n),
      primaryMuscleGroup: ex.primaryMuscleGroup,
      trackingType: (ex as { trackingType?: "weight_reps" | "duration" }).trackingType ?? "weight_reps",
      targetSets: 3,
      repsMin: 8,
      repsMax: 12,
      targetDurationSeconds: null,
      targetRpe: null,
      restSeconds: 90,
      suggestedWeightKg: null,
      notes: null,
      loggedSets: [],
    });
    setShowPicker(false);
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      await fetch(`/api/workout/${sessionId}`, { method: "DELETE" });
      clearWorkout();
      router.push("/workout/history");
    } finally {
      setCancelling(false);
    }
  }

  const workout = activeWorkout?.sessionId === sessionId ? activeWorkout : null;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-on-surface-variant/50 text-sm">Laden…</span>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* ── Sticky header ── */}
      <div className="shrink-0 flex items-center justify-between gap-4 border-b border-outline-variant/10 bg-surface-container-low px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-mono uppercase tracking-wider text-on-surface-variant/50">
            Aktives Training
          </p>
          <h1 className="font-headline text-lg font-bold text-on-surface truncate leading-tight mt-0.5">
            {workout?.title ?? "Training"}
          </h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-2xl font-bold text-primary tabular-nums">
            {stopwatchLabel}
          </span>
          <button
            onClick={() => setConfirmCancel(true)}
            className="rounded-xl bg-surface-container text-on-surface-variant/60 px-3 py-2.5 text-sm font-medium hover:bg-error-container/20 hover:text-error transition-all"
            title="Training abbrechen"
          >
            ✕
          </button>
          <button
            onClick={() => router.push(`/workout/${sessionId}/review?duration=${elapsed}`)}
            className="rounded-xl bg-secondary-container/30 text-secondary px-4 py-2.5 text-sm font-bold hover:bg-secondary-container/50 transition-all whitespace-nowrap"
          >
            Beenden
          </button>
        </div>
      </div>

      {/* ── Cancel confirm overlay ── */}
      {confirmCancel && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-surface/70 backdrop-blur-sm"
          onClick={() => setConfirmCancel(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-surface-container-high p-6 flex flex-col gap-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="font-headline font-bold text-on-surface mb-1">Training abbrechen?</h2>
              <p className="text-sm text-on-surface-variant">
                Das Training wird gelöscht und nicht gespeichert. Alle bisher geloggten Sätze gehen verloren.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmCancel(false)}
                className="flex-1 rounded-xl bg-surface-container text-on-surface-variant py-3 text-sm font-medium hover:bg-surface-container-high transition-all"
              >
                Weitermachen
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 rounded-xl bg-error text-white py-3 text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50"
              >
                {cancelling ? "Abbrechen…" : "Ja, abbrechen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Exercise list ── */}
      <div className="flex-1 overflow-y-auto">
        {!workout ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
            <p className="text-on-surface-variant/50 text-sm">Kein aktives Training gefunden.</p>
            <button
              onClick={() => router.push("/workout/history")}
              className="text-sm text-primary hover:underline"
            >
              Zurück zur Historie
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4 pb-24">
            {workout.exercises.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <p className="text-on-surface-variant/50 text-sm">
                  Noch keine Übungen. Füge deine erste Übung hinzu.
                </p>
              </div>
            )}
            {workout.exercises.map((exercise, idx) => (
              <ExerciseCard
                key={`${exercise.exerciseId}-${idx}`}
                exercise={exercise}
                exerciseIdx={idx}
                sessionId={sessionId}
                onSetLogged={handleSetLogged}
              />
            ))}
            {/* Add exercise button */}
            <button
              onClick={() => setShowPicker(true)}
              className="w-full rounded-2xl border border-dashed border-outline-variant/30 py-4 text-sm text-on-surface-variant/50 hover:border-primary/40 hover:text-primary transition-all flex items-center justify-center gap-2"
            >
              <span className="text-lg leading-none">+</span>
              Übung hinzufügen
            </button>
          </div>
        )}
      </div>

      {/* ── Rest timer ── */}
      {restTimerActive && (
        <RestTimerBar
          seconds={restTimerSeconds}
          total={restTotalRef.current || restTimerSeconds}
          onSkip={stopRestTimer}
        />
      )}

      {/* ── Exercise picker ── */}
      {showPicker && (
        <ExercisePicker
          onAdd={handleAddExercise}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ── StepBtn ───────────────────────────────────────────────────────────

function StepBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); onClick(); }}
      className="flex h-full w-12 shrink-0 items-center justify-center text-xl font-bold text-on-surface-variant active:bg-surface-bright select-none"
    >
      {children}
    </button>
  );
}
