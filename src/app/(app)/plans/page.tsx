"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

type TrainingDay = {
  id: string;
  title: string;
  focus: string | null;
  estimatedDurationMin: number | null;
  exercises: unknown[];
};

type Plan = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "active" | "scheduled" | "archived";
  aiGenerated: boolean;
  createdAt: string;
  days: TrainingDay[];
};

const STATUS_LABELS: Record<Plan["status"], string> = {
  draft: "Entwurf",
  active: "Aktiv",
  scheduled: "Geplant",
  archived: "Archiviert",
};

const STATUS_COLORS: Record<Plan["status"], string> = {
  draft:    "text-on-surface-variant/60",
  active:   "text-secondary",
  scheduled:"text-tertiary",
  archived: "text-on-surface-variant/35",
};

const STATUS_BG: Record<Plan["status"], React.CSSProperties> = {
  draft:    { background: "rgba(72,72,71,0.15)", border: "1px solid rgba(72,72,71,0.2)" },
  active:   { background: "rgba(0,227,253,0.1)", border: "1px solid rgba(0,227,253,0.2)" },
  scheduled:{ background: "rgba(252,224,71,0.1)", border: "1px solid rgba(252,224,71,0.2)" },
  archived: { background: "rgba(72,72,71,0.08)", border: "1px solid rgba(72,72,71,0.12)" },
};

function PlanCard({ plan, onDelete }: { plan: Plan; onDelete: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);

  async function handleActivate() {
    await fetch(`/api/plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: plan.status === "active" ? "draft" : "active" }),
    });
    window.location.reload();
  }

  async function handleDelete() {
    if (!confirm(`Plan "${plan.title}" wirklich loeschen?`)) return;
    setDeleting(true);
    await fetch(`/api/plans/${plan.id}`, { method: "DELETE" });
    onDelete(plan.id);
  }

  const totalExercises = plan.days.reduce((sum, d) => sum + d.exercises.length, 0);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl p-5 flex flex-col gap-4 transition-opacity",
        deleting && "opacity-50 pointer-events-none"
      )}
      style={{ background: "var(--color-surface-container)", border: "1px solid rgba(72,72,71,0.18)" }}
    >
      {/* Shine overlay for active plan */}
      {plan.status === "active" && (
        <div className="shine pointer-events-none absolute inset-0" />
      )}

      {/* Header */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={cn("chip font-bold", STATUS_COLORS[plan.status])}
              style={STATUS_BG[plan.status]}
            >
              {plan.status === "active" ? "◉ " : ""}{STATUS_LABELS[plan.status]}
            </span>
            {plan.aiGenerated && (
              <span
                className="chip text-primary-container"
                style={{ background: "rgba(202,253,0,0.08)", border: "1px solid rgba(202,253,0,0.15)" }}
              >
                ◈ AI
              </span>
            )}
          </div>
          <h3 className="display-text font-bold text-on-surface truncate">{plan.title}</h3>
          {plan.description && (
            <p className="text-sm text-on-surface-variant/70 mt-0.5 line-clamp-2">{plan.description}</p>
          )}
        </div>
      </div>

      {/* Active plan indicator bar */}
      {plan.status === "active" && (
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-surface-container-high">
          <div
            className="h-full w-3/4 rounded-full"
            style={{
              background: "linear-gradient(90deg, var(--color-primary-container), var(--color-secondary))",
              boxShadow: "0 0 8px rgba(202,253,0,0.3)",
            }}
          />
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-4 mono-text text-[11px] text-on-surface-variant/60">
        <span>{plan.days.length} Tage</span>
        <span>{totalExercises} Übungen</span>
        <span>{new Date(plan.createdAt).toLocaleDateString("de-DE")}</span>
      </div>

      {/* Days preview */}
      {plan.days.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {plan.days.map((day) => (
            <span
              key={day.id}
              className="rounded-md px-2 py-1 text-xs text-on-surface-variant/70 truncate max-w-40"
              style={{ background: "var(--color-surface-container-high)", border: "1px solid rgba(72,72,71,0.12)" }}
            >
              {day.title}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-outline-variant/10">
        <Link href={`/plans/${plan.id}`}>
          <Button variant="secondary" size="sm">Anzeigen</Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleActivate}
        >
          {plan.status === "active" ? "Deaktivieren" : "Aktivieren"}
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={handleDelete}>
          Loeschen
        </Button>
      </div>
    </div>
  );
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => r.json())
      .then(setPlans)
      .finally(() => setLoading(false));
  }, []);

  function handleDelete(id: string) {
    setPlans((prev) => prev.filter((p) => p.id !== id));
  }

  const active = plans.filter((p) => p.status === "active");
  const rest = plans.filter((p) => p.status !== "active");

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-headline text-2xl font-bold text-on-surface">Trainingsplaene</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">
              {plans.length === 0 ? "Noch kein Plan erstellt" : `${plans.length} ${plans.length === 1 ? "Plan" : "Plaene"}`}
            </p>
          </div>
          <Link
            href="/plans/new"
            className="btn-liquid flex items-center gap-1.5 rounded-[9px] px-4 py-2 text-sm font-bold text-on-primary"
          >
            ⚡ Neuer Plan
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Laden...</div>
        ) : plans.length === 0 ? (
          /* Empty state */
          <div className="rounded-xl bg-surface-container p-12 text-center">
            <div className="text-4xl mb-4">▦</div>
            <h3 className="font-headline font-bold text-on-surface mb-2">Kein Trainingsplan</h3>
            <p className="text-sm text-on-surface-variant mb-6">
              Lass Atlas einen personalisierten Plan fuer dich erstellen.
            </p>
            <Link href="/plans/new">
              <Button>Plan erstellen</Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {active.length > 0 && (
              <section>
                <h2 className="caption mb-3">Aktiv</h2>
                <div className="flex flex-col gap-3">
                  {active.map((p) => <PlanCard key={p.id} plan={p} onDelete={handleDelete} />)}
                </div>
              </section>
            )}
            {rest.length > 0 && (
              <section>
                {active.length > 0 && (
                  <h2 className="caption mb-3">Weitere</h2>
                )}
                <div className="flex flex-col gap-3">
                  {rest.map((p) => <PlanCard key={p.id} plan={p} onDelete={handleDelete} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
