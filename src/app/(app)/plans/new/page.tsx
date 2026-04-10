"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import type { GeneratedPlan } from "@/lib/ai/plan-schema";

type Step = "idle" | "generating" | "review" | "saving";

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Brust", back: "Ruecken", shoulders: "Schultern",
  biceps: "Bizeps", triceps: "Trizeps", forearms: "Unterarme",
  quadriceps: "Quadrizeps", hamstrings: "Hamstrings", glutes: "Gesaess",
  calves: "Waden", core: "Core", full_body: "Ganzkörper",
};

function GeneratingState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl">◈</span>
        </div>
      </div>
      <div className="text-center">
        <p className="font-headline font-bold text-on-surface">Plan wird erstellt...</p>
        <p className="text-sm text-on-surface-variant mt-1">Atlas analysiert dein Profil und generiert einen personalisierten Plan</p>
      </div>
    </div>
  );
}

function ExerciseRow({ ex }: {
  ex: {
    exerciseId: string;
    exerciseName: string;
    sets: number;
    reps: string;
    weightSuggestion: string;
    restSeconds: number;
    notes: string;
  }
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-outline-variant/5 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-on-surface">{ex.exerciseName}</p>
        {ex.notes && (
          <p className="text-xs text-on-surface-variant mt-0.5">{ex.notes}</p>
        )}
      </div>
      <div className="flex gap-3 text-xs font-mono text-on-surface-variant shrink-0">
        <span className="w-12 text-right">{ex.sets}×{ex.reps}</span>
        <span className="w-20 text-right text-secondary">{ex.weightSuggestion}</span>
        <span className="w-12 text-right">{ex.restSeconds}s</span>
      </div>
    </div>
  );
}

function DayCard({ day, index }: {
  day: GeneratedPlan["trainingDays"][number];
  index: number;
}) {
  const [open, setOpen] = useState(index === 0);

  return (
    <div className="rounded-xl bg-surface-container overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface-container-high transition-colors"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-on-surface-variant/50">Tag {index + 1}</span>
            <span className="text-xs font-mono text-secondary">{day.focus}</span>
          </div>
          <h4 className="font-headline font-bold text-on-surface mt-0.5">{day.dayName}</h4>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-mono text-on-surface-variant">{day.exercises.length} Uebungen · {day.estimatedDurationMinutes} Min</span>
          <span className={cn("text-on-surface-variant transition-transform", open && "rotate-180")}>▾</span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-4">
          {/* Column headers */}
          <div className="flex items-center gap-3 pb-2 text-xs font-mono text-on-surface-variant/50">
            <span className="flex-1">Uebung</span>
            <span className="w-12 text-right">Sets×Wdh</span>
            <span className="w-20 text-right">Gewicht</span>
            <span className="w-12 text-right">Pause</span>
          </div>
          {day.exercises.map((ex) => (
            <ExerciseRow key={ex.exerciseId} ex={ex} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanReview({
  plan,
  onAccept,
  onReject,
  saving,
}: {
  plan: GeneratedPlan;
  onAccept: () => void;
  onReject: () => void;
  saving: boolean;
}) {
  const expLabels: Record<string, string> = {
    beginner: "Anfaenger", intermediate: "Fortgeschritten",
    advanced: "Erfahren", expert: "Experte",
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Plan header */}
      <div className="rounded-xl bg-primary-container/10 border border-primary/10 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-headline text-xl font-bold text-on-surface">{plan.planName}</h2>
            <p className="text-sm text-on-surface-variant mt-1">{plan.goal}</p>
          </div>
          <span className="shrink-0 text-xs font-mono uppercase text-primary bg-primary-container/30 px-2 py-1 rounded-full">
            KI-Generiert
          </span>
        </div>

        <div className="flex flex-wrap gap-4 mt-4 text-sm font-mono">
          <div>
            <span className="text-on-surface-variant/60 text-xs">Dauer</span>
            <p className="text-on-surface font-medium">{plan.durationWeeks} Wochen</p>
          </div>
          <div>
            <span className="text-on-surface-variant/60 text-xs">Trainingstage</span>
            <p className="text-on-surface font-medium">{plan.trainingDaysPerWeek}× / Woche</p>
          </div>
          <div>
            <span className="text-on-surface-variant/60 text-xs">Level</span>
            <p className="text-on-surface font-medium">{expLabels[plan.experienceLevel] ?? plan.experienceLevel}</p>
          </div>
        </div>
      </div>

      {/* Training days */}
      <div className="flex flex-col gap-3">
        {plan.trainingDays.map((day, i) => (
          <DayCard key={i} day={day} index={i} />
        ))}
      </div>

      {/* Actions */}
      <div className="sticky bottom-0 rounded-xl bg-surface-container/90 backdrop-blur-sm p-4 flex gap-3 border-t border-outline-variant/10">
        <Button onClick={onAccept} isLoading={saving} className="flex-1">
          Plan speichern
        </Button>
        <Button variant="ghost" onClick={onReject} disabled={saving}>
          Verwerfen
        </Button>
      </div>
    </div>
  );
}

export default function NewPlanPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generatePlan() {
    setStep("generating");
    setError(null);

    try {
      const res = await fetch("/api/plan/generate", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Fehler beim Generieren");
      }
      const data: GeneratedPlan = await res.json();
      setPlan(data);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("idle");
    }
  }

  async function savePlan() {
    if (!plan) return;
    setStep("saving");

    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Fehler beim Speichern");
      }
      const saved = await res.json();
      router.push(`/plans/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("review");
    }
  }

  function reject() {
    setPlan(null);
    setStep("idle");
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        {/* Back link + title */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/plans")}
            className="text-xs font-mono text-on-surface-variant hover:text-on-surface transition-colors mb-3 flex items-center gap-1"
          >
            ← Zurueck
          </button>
          <h1 className="font-headline text-2xl font-bold text-on-surface">Neuer Trainingsplan</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Atlas erstellt einen Plan basierend auf deinem Profil, Equipment und Zielen.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-error-container/20 border border-error/20 px-4 py-3 text-sm text-error mb-6">
            {error}
          </div>
        )}

        {step === "idle" && (
          <div className="rounded-xl bg-surface-container p-8 text-center">
            <div className="text-5xl mb-5">◈</div>
            <h3 className="font-headline font-bold text-on-surface text-lg mb-2">
              Plan generieren lassen
            </h3>
            <p className="text-sm text-on-surface-variant mb-6 max-w-sm mx-auto">
              Atlas analysiert dein Profil, verfuegbares Equipment und deine Trainingsziele
              und erstellt einen strukturierten Plan.
            </p>
            <Button size="lg" onClick={generatePlan}>Plan erstellen</Button>
          </div>
        )}

        {step === "generating" && <GeneratingState />}

        {(step === "review" || step === "saving") && plan && (
          <PlanReview
            plan={plan}
            onAccept={savePlan}
            onReject={reject}
            saving={step === "saving"}
          />
        )}
      </div>
    </div>
  );
}
