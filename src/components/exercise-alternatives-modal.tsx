"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

export type ExerciseAlternative = {
  exerciseId: string;
  exerciseName: string;
  primaryMuscleGroup: string;
  sets: number;
  repsMin: number;
  repsMax: number | null;
  suggestedWeightKg: number | null;
  reason: string;
};

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Brust", back: "Rücken", shoulders: "Schultern",
  biceps: "Bizeps", triceps: "Trizeps", forearms: "Unterarme",
  quadriceps: "Quadrizeps", hamstrings: "Hamstrings", glutes: "Gesäß",
  calves: "Waden", core: "Core", full_body: "Ganzkörper",
};

type Props = {
  exerciseId: string;
  exerciseName: string;
  primaryMuscleGroup: string;
  sets: number;
  repsMin: number;
  repsMax: number | null;
  suggestedWeightKg: number | null;
  onSelect: (alt: ExerciseAlternative) => void;
  onClose: () => void;
};

export function ExerciseAlternativesModal({
  exerciseId, exerciseName, primaryMuscleGroup,
  sets, repsMin, repsMax, suggestedWeightKg,
  onSelect, onClose,
}: Props) {
  const [alternatives, setAlternatives] = useState<ExerciseAlternative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai/exercise-alternatives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId, exerciseName, primaryMuscleGroup, sets, repsMin, repsMax, suggestedWeightKg }),
    })
      .then(async (res) => {
        const text = await res.text();
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(text) as Record<string, unknown>; } catch { throw new Error("Server-Fehler"); }
        if (!res.ok) throw new Error((data.error as string) ?? "Fehler");
        setAlternatives(data.alternatives as ExerciseAlternative[]);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Unbekannter Fehler"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fmtPlan(alt: ExerciseAlternative) {
    const reps = alt.repsMax ? `${alt.repsMin}–${alt.repsMax}` : String(alt.repsMin);
    const weight = alt.suggestedWeightKg != null ? ` · ${alt.suggestedWeightKg} kg` : "";
    return `${alt.sets} × ${reps} Wdh${weight}`;
  }

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
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10 shrink-0">
          <div>
            <p className="text-xs font-mono text-secondary">✦ KI-Alternative</p>
            <h2 className="font-headline font-bold text-on-surface mt-0.5">Alternative für: {exerciseName}</h2>
          </div>
          <button onClick={onClose} className="text-on-surface-variant/50 hover:text-on-surface transition-colors text-lg leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-6 h-6 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
              <p className="text-sm text-on-surface-variant/60">KI analysiert Alternativen…</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-error-container/20 px-4 py-3 text-sm text-error text-center">
              {error}
            </div>
          )}

          {!loading && !error && alternatives.map((alt, i) => (
            <div
              key={alt.exerciseId}
              className="rounded-xl bg-surface-container p-4 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-on-surface-variant/40">{i + 1}</span>
                    <p className="font-semibold text-on-surface text-sm">{alt.exerciseName}</p>
                    <span className="text-xs font-mono text-secondary px-1.5 py-0.5 rounded bg-secondary/10">
                      {MUSCLE_LABELS[alt.primaryMuscleGroup] ?? alt.primaryMuscleGroup}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-on-surface-variant mt-1">{fmtPlan(alt)}</p>
                  {alt.reason && (
                    <p className="text-xs text-on-surface-variant/60 mt-1 leading-relaxed">{alt.reason}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => onSelect(alt)}
                className={cn(
                  "w-full rounded-lg py-2.5 text-sm font-bold transition-all",
                  "bg-secondary/10 text-secondary hover:bg-secondary/20 active:scale-[0.98]"
                )}
              >
                Auswählen
              </button>
            </div>
          ))}

          {!loading && !error && alternatives.length === 0 && (
            <p className="text-center text-sm text-on-surface-variant/50 py-8">Keine Alternativen gefunden.</p>
          )}
        </div>
      </div>
    </div>
  );
}
