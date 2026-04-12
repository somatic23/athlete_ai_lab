"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useWorkoutStore } from "@/stores/workout-store";

type PlanDay = {
  id: string; title: string; focus: string | null;
  estimatedDurationMin: number | null; sortOrder: number;
};

type Plan = { id: string; title: string; status: string; days: PlanDay[] };

type Session = {
  id: string; title: string; startedAt: string; completedAt: string | null;
  durationSeconds: number | null; totalVolumeKg: number | null;
  totalSets: number | null; totalReps: number | null;
  muscleGroupsTrained: string | null; perceivedLoad: string | null;
  satisfactionRating: number | null;
};

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Brust", back: "Rücken", shoulders: "Schultern",
  biceps: "Bizeps", triceps: "Trizeps", forearms: "Unterarme",
  quadriceps: "Quadrizeps", hamstrings: "Hamstrings", glutes: "Gesäß",
  calves: "Waden", core: "Core", full_body: "Ganzkörper",
};

const LOAD_COLOR: Record<string, string> = {
  light: "text-emerald-400", moderate: "text-secondary", heavy: "text-amber-400",
  very_heavy: "text-orange-400", maximal: "text-error",
};
const LOAD_LABEL: Record<string, string> = {
  light: "Leicht", moderate: "Moderat", heavy: "Schwer",
  very_heavy: "Sehr schwer", maximal: "Maximal",
};

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

// ── Start Workout Modal ───────────────────────────────────────────────

function StartWorkoutModal({
  plans,
  onStart,
  onClose,
}: {
  plans: Plan[];
  onStart: (trainingDayId: string | null, title: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"plan" | "free">("plan");
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [freeTitle, setFreeTitle] = useState("Freies Training");

  const activePlan = plans.find((p) => p.status === "active");

  function handleStart() {
    if (mode === "free") {
      onStart(null, freeTitle || "Freies Training");
    } else if (selectedDayId) {
      const day = activePlan?.days.find((d) => d.id === selectedDayId);
      onStart(selectedDayId, day?.title ?? "Training");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface/60 backdrop-blur" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-surface-container-high p-6 flex flex-col gap-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-headline font-bold text-on-surface">Training starten</h2>
          <button onClick={onClose} className="text-on-surface-variant/50 hover:text-on-surface transition-colors">✕</button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 rounded-lg bg-surface-container p-1">
          {(["plan", "free"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 rounded py-1.5 text-sm font-medium transition-all",
                mode === m ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant/60"
              )}
            >
              {m === "plan" ? "Aus Plan" : "Freies Training"}
            </button>
          ))}
        </div>

        {mode === "plan" ? (
          <div className="flex flex-col gap-2">
            {!activePlan ? (
              <p className="text-sm text-on-surface-variant/50 text-center py-4">
                Kein aktiver Trainingsplan. Aktiviere einen Plan unter Trainingspläne.
              </p>
            ) : (
              <>
                <p className="text-xs text-on-surface-variant/60 font-mono">{activePlan.title}</p>
                {activePlan.days.map((day) => (
                  <button
                    key={day.id}
                    onClick={() => setSelectedDayId(day.id)}
                    className={cn(
                      "w-full rounded-xl p-3 text-left border transition-all",
                      selectedDayId === day.id
                        ? "bg-primary-container/20 border-primary/30 text-primary"
                        : "bg-surface-container border-transparent hover:border-outline-variant/20 text-on-surface"
                    )}
                  >
                    <p className="text-sm font-medium">{day.title}</p>
                    {day.focus && (
                      <p className="text-xs text-on-surface-variant/60 mt-0.5">{day.focus}</p>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        ) : (
          <div>
            <label className="text-xs font-mono uppercase text-on-surface-variant/60 mb-1.5 block">
              Titel
            </label>
            <input
              type="text"
              value={freeTitle}
              onChange={(e) => setFreeTitle(e.target.value)}
              className="w-full rounded-xl bg-surface-container px-4 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={mode === "plan" && !selectedDayId}
          className="w-full rounded-xl bg-primary text-on-primary py-3 font-bold text-sm hover:opacity-90 transition-all disabled:opacity-40"
        >
          Training starten
        </button>
      </div>
    </div>
  );
}

// ── Session Card ──────────────────────────────────────────────────────

function SessionCard({ session }: { session: Session }) {
  const muscles: string[] = (() => {
    try { return JSON.parse(session.muscleGroupsTrained ?? "[]"); } catch { return []; }
  })();

  return (
    <div className="rounded-xl bg-surface-container-low p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-on-surface truncate">{session.title}</p>
          <p className="text-xs text-on-surface-variant/60 font-mono mt-0.5">{fmtDate(session.startedAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {session.satisfactionRating && (
            <span className="text-base">
              {["😞", "😕", "😐", "😊", "🔥"][session.satisfactionRating - 1]}
            </span>
          )}
          {session.perceivedLoad && (
            <span className={cn("text-xs font-mono", LOAD_COLOR[session.perceivedLoad])}>
              {LOAD_LABEL[session.perceivedLoad]}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-4 text-xs font-mono text-on-surface-variant/70">
        <span>{fmtDuration(session.durationSeconds)}</span>
        {session.totalVolumeKg != null && <span>{session.totalVolumeKg.toFixed(0)} kg</span>}
        {session.totalSets != null && <span>{session.totalSets} Sätze</span>}
      </div>

      {muscles.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {muscles.map((mg) => (
            <span key={mg} className="rounded bg-surface-container px-1.5 py-0.5 text-xs text-on-surface-variant/60">
              {MUSCLE_LABELS[mg] ?? mg}
            </span>
          ))}
        </div>
      )}

      {!session.completedAt && (
        <span className="text-xs text-amber-400 font-mono">● Nicht abgeschlossen</span>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function WorkoutHistoryPage() {
  const router = useRouter();
  const { activeWorkout, startWorkout } = useWorkoutStore();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/workout/sessions").then((r) => r.json()),
      fetch("/api/plans").then((r) => r.json()),
    ])
      .then(([s, p]) => {
        setSessions(Array.isArray(s) ? s : []);
        setPlans(Array.isArray(p) ? p : []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleStartWorkout(trainingDayId: string | null, title: string) {
    setStarting(true);
    setShowModal(false);
    try {
      const res = await fetch("/api/workout/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, trainingDayId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exercises = (data.exercises ?? []).map((ex: any) => ({ ...ex, loggedSets: [] }));
      startWorkout({
        sessionId: data.id,
        title: data.title,
        trainingDayId: data.trainingDayId ?? null,
        startedAt: data.startedAt,
        exercises,
      });
      router.push(`/workout/${data.id}`);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between border-b border-outline-variant/10 px-5 py-4">
        <h1 className="font-headline text-xl font-bold text-on-surface">Trainingshistorie</h1>
        <button
          onClick={() => setShowModal(true)}
          disabled={starting}
          className="rounded-xl bg-primary text-on-primary px-4 py-2 text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50"
        >
          {starting ? "Starten…" : "+ Training"}
        </button>
      </div>

      {/* Active workout banner */}
      {activeWorkout && (
        <div className="shrink-0 mx-4 mt-3 rounded-xl bg-primary/10 border border-primary/20 p-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-mono text-primary/70 uppercase">Aktives Training</p>
            <p className="text-sm font-medium text-on-surface">{activeWorkout.title}</p>
          </div>
          <button
            onClick={() => router.push(`/workout/${activeWorkout.sessionId}`)}
            className="rounded-lg bg-primary/15 text-primary px-3 py-1.5 text-sm font-medium hover:bg-primary/25 transition-all shrink-0"
          >
            Fortsetzen →
          </button>
        </div>
      )}

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {loading ? (
          <p className="text-sm text-on-surface-variant/50 text-center py-10">Laden…</p>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-on-surface-variant/50 text-sm">Noch keine Trainingseinheiten.</p>
            <button
              onClick={() => setShowModal(true)}
              className="text-sm text-primary hover:underline"
            >
              Erstes Training starten
            </button>
          </div>
        ) : (
          sessions.map((s) => <SessionCard key={s.id} session={s} />)
        )}
      </div>

      {showModal && (
        <StartWorkoutModal
          plans={plans}
          onStart={handleStartWorkout}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
