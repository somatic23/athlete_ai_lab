"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

type PlanExercise = {
  id: string;
  sortOrder: number;
  sets: number;
  repsMin: number;
  repsMax: number | null;
  restSeconds: number | null;
  notes: string | null;
  exercise: {
    id: string;
    nameI18n: string;
    primaryMuscleGroup: string;
  };
};

type TrainingDay = {
  id: string;
  dayNumber: number;
  title: string;
  focus: string | null;
  estimatedDurationMin: number | null;
  sortOrder: number;
  exercises: PlanExercise[];
};

type Plan = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "active" | "scheduled" | "archived";
  aiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
  days: TrainingDay[];
};

const STATUS_LABELS: Record<Plan["status"], string> = {
  draft: "Entwurf",
  active: "Aktiv",
  scheduled: "Geplant",
  archived: "Archiviert",
};

const STATUS_COLORS: Record<Plan["status"], string> = {
  draft:    "text-on-surface-variant bg-surface-container-high",
  active:   "text-secondary bg-secondary-container/30",
  scheduled:"text-tertiary bg-tertiary-container/30",
  archived: "text-on-surface-variant/50 bg-surface-container",
};

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Brust", back: "Ruecken", shoulders: "Schultern",
  biceps: "Bizeps", triceps: "Trizeps", forearms: "Unterarme",
  quadriceps: "Quadrizeps", hamstrings: "Hamstrings", glutes: "Gesaess",
  calves: "Waden", core: "Core", full_body: "Ganzkörper",
};

function parseName(nameI18n: string, locale = "de"): string {
  try {
    const parsed = JSON.parse(nameI18n);
    return parsed[locale] ?? parsed.de ?? parsed.en ?? nameI18n;
  } catch {
    return nameI18n;
  }
}

function repsLabel(min: number, max: number | null): string {
  return max ? `${min}–${max}` : String(min);
}

function DaySection({ day }: { day: TrainingDay }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl bg-surface-container overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface-container-high transition-colors"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-on-surface-variant/50">Tag {day.dayNumber}</span>
            {day.focus && (
              <span className="text-xs font-mono text-secondary">{day.focus}</span>
            )}
          </div>
          <h4 className="font-headline font-bold text-on-surface mt-0.5">{day.title}</h4>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-mono text-on-surface-variant">
            {day.exercises.length} Uebungen
            {day.estimatedDurationMin && ` · ${day.estimatedDurationMin} Min`}
          </span>
          <span className={cn("text-on-surface-variant transition-transform", open && "rotate-180")}>▾</span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-4">
          {day.exercises.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-2">Keine Uebungen</p>
          ) : (
            <>
              <div className="flex items-center gap-3 pb-2 text-xs font-mono text-on-surface-variant/50">
                <span className="flex-1">Uebung</span>
                <span className="w-16 text-right">Sets×Wdh</span>
                <span className="w-12 text-right">Pause</span>
                <span className="w-24 text-right">Muskelgruppe</span>
              </div>
              {day.exercises.map((ex) => (
                <div
                  key={ex.id}
                  className="flex items-center gap-3 py-2.5 border-b border-outline-variant/5 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface">
                      {parseName(ex.exercise.nameI18n)}
                    </p>
                    {ex.notes && (
                      <p className="text-xs text-on-surface-variant mt-0.5 truncate">{ex.notes}</p>
                    )}
                  </div>
                  <span className="w-16 text-right text-xs font-mono text-on-surface-variant">
                    {ex.sets}×{repsLabel(ex.repsMin, ex.repsMax)}
                  </span>
                  <span className="w-12 text-right text-xs font-mono text-on-surface-variant">
                    {ex.restSeconds ? `${ex.restSeconds}s` : "—"}
                  </span>
                  <span className="w-24 text-right text-xs font-mono text-secondary">
                    {MUSCLE_LABELS[ex.exercise.primaryMuscleGroup] ?? ex.exercise.primaryMuscleGroup}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  useEffect(() => {
    fetch(`/api/plans/${planId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Plan nicht gefunden");
        return r.json();
      })
      .then(setPlan)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [planId]);

  async function cycleStatus() {
    if (!plan) return;
    const next: Plan["status"] =
      plan.status === "draft" ? "active" :
      plan.status === "active" ? "archived" :
      "draft";

    setStatusUpdating(true);
    await fetch(`/api/plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setPlan((p) => p ? { ...p, status: next } : p);
    setStatusUpdating(false);
  }

  async function deletePlan() {
    if (!plan || !confirm(`Plan "${plan.title}" wirklich loeschen?`)) return;
    await fetch(`/api/plans/${planId}`, { method: "DELETE" });
    router.push("/plans");
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-on-surface-variant">
        Laden...
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-on-surface-variant">{error ?? "Plan nicht gefunden"}</p>
        <Button variant="ghost" onClick={() => router.push("/plans")}>Zurueck</Button>
      </div>
    );
  }

  const totalExercises = plan.days.reduce((sum, d) => sum + d.exercises.length, 0);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        {/* Back */}
        <button
          onClick={() => router.push("/plans")}
          className="text-xs font-mono text-on-surface-variant hover:text-on-surface transition-colors mb-5 flex items-center gap-1"
        >
          ← Alle Plaene
        </button>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                "text-xs font-mono font-bold uppercase px-2 py-0.5 rounded-full",
                STATUS_COLORS[plan.status]
              )}>
                {STATUS_LABELS[plan.status]}
              </span>
              {plan.aiGenerated && (
                <span className="text-xs font-mono text-on-surface-variant/50">KI-Generiert</span>
              )}
            </div>
            <h1 className="font-headline text-2xl font-bold text-on-surface">{plan.title}</h1>
            {plan.description && (
              <p className="text-sm text-on-surface-variant mt-1">{plan.description}</p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-6 mb-6 text-xs font-mono text-on-surface-variant">
          <div>
            <span className="text-on-surface-variant/50">Trainingstage</span>
            <p className="text-on-surface">{plan.days.length}</p>
          </div>
          <div>
            <span className="text-on-surface-variant/50">Uebungen gesamt</span>
            <p className="text-on-surface">{totalExercises}</p>
          </div>
          <div>
            <span className="text-on-surface-variant/50">Erstellt</span>
            <p className="text-on-surface">{new Date(plan.createdAt).toLocaleDateString("de-DE")}</p>
          </div>
        </div>

        {/* Days */}
        <div className="flex flex-col gap-3 mb-6">
          {plan.days.map((day) => (
            <DaySection key={day.id} day={day} />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pb-6">
          <Button
            variant="secondary"
            onClick={cycleStatus}
            isLoading={statusUpdating}
          >
            {plan.status === "active" ? "Deaktivieren" :
             plan.status === "archived" ? "Als Entwurf" :
             "Aktivieren"}
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={deletePlan}>Loeschen</Button>
        </div>
      </div>
    </div>
  );
}
