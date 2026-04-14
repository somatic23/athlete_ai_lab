"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { useLocaleStore } from "@/stores/locale-store";
import { useWorkoutStore } from "@/stores/workout-store";

type DashboardData = {
  user: { displayName: string };
  activePlan: {
    id: string;
    title: string;
    aiGenerated: boolean;
    days: { id: string; title: string; focus: string | null; exerciseCount: number }[];
  } | null;
  nextSession: {
    id: string;
    scheduledDate: string;
    title: string | null;
    trainingDay: {
      id: string;
      title: string;
      focus: string | null;
      estimatedDurationMin: number | null;
      exercises: { name: string }[];
    } | null;
  } | null;
  recovery: {
    muscle: string;
    label: string;
    recovered: boolean;
    hoursLeft: number;
    fullyRecoveredAt: string | null;
  }[];
  lastReport: {
    id: string;
    analysisType: string;
    createdAt: string;
    highlights: string[];
    warnings: string[];
    recommendations: string[];
    nextSessionSuggestions: string[];
  } | null;
  recentStats: { sessionsCount: number; totalVolumeKg: number; avgRpe: number | null };
};

function getGreeting(hour: number, locale: string): string {
  if (locale === "en")
    return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return hour < 12 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
}

function fmtRelativeDate(dateStr: string, locale: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return locale === "en" ? "Today" : "Heute";
  if (diff === 1) return locale === "en" ? "Tomorrow" : "Morgen";
  if (diff === 2) return locale === "en" ? "In 2 days" : "Übermorgen";
  return d.toLocaleDateString(locale === "en" ? "en-GB" : "de-DE", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

function fmtAnalysisType(type: string, locale: string): string {
  const map: Record<string, [string, string]> = {
    post_workout: ["Training", "Workout"],
    weekly: ["Wochenanalyse", "Weekly"],
    monthly: ["Monatsanalyse", "Monthly"],
  };
  const [de, en] = map[type] ?? [type, type];
  return locale === "en" ? en : de;
}

function fmtRelativeTime(isoStr: string, locale: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return locale === "en" ? "Today" : "Heute";
  if (days === 1) return locale === "en" ? "Yesterday" : "Gestern";
  return locale === "en" ? `${days} days ago` : `vor ${days} Tagen`;
}

// ── StatsStrip ────────────────────────────────────────────────────────

function StatsStrip({
  stats,
  loading,
  locale,
}: {
  stats: DashboardData["recentStats"] | undefined;
  loading: boolean;
  locale: string;
}) {
  if (loading) {
    return (
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex-1 rounded-xl bg-surface-container h-16 animate-pulse" />
        ))}
      </div>
    );
  }
  const chips = [
    {
      value: stats?.sessionsCount ?? 0,
      label: locale === "en" ? "Sessions (30d)" : "Einheiten (30T)",
    },
    {
      value: (stats?.totalVolumeKg ?? 0).toLocaleString() + " kg",
      label: locale === "en" ? "Volume" : "Volumen",
    },
    {
      value: stats?.avgRpe?.toFixed(1) ?? "—",
      label: "⌀ RPE",
    },
  ];
  return (
    <div className="flex gap-3">
      {chips.map((chip) => (
        <div
          key={chip.label}
          className="flex-1 bg-surface-container rounded-xl px-3 py-2.5 flex flex-col gap-0.5"
        >
          <span className="font-mono font-bold text-on-surface text-sm leading-none">
            {chip.value}
          </span>
          <span className="text-[10px] text-on-surface-variant/50 leading-none">{chip.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── NextSessionCard ───────────────────────────────────────────────────

function NextSessionCard({
  session,
  loading,
  locale,
  onStart,
  starting,
}: {
  session: DashboardData["nextSession"] | null;
  loading: boolean;
  locale: string;
  onStart: (trainingDayId: string, title: string) => void;
  starting: boolean;
}) {
  if (loading) {
    return <div className="rounded-2xl bg-surface-container h-44 animate-pulse" />;
  }
  return (
    <div className="bg-surface-container rounded-2xl p-5 flex flex-col gap-3 min-h-[180px]">
      <p className="text-[10px] font-mono uppercase text-on-surface-variant/50 tracking-wide">
        {locale === "en" ? "Next Session" : "Nächste Einheit"}
      </p>
      {!session || !session.trainingDay ? (
        <div className="flex-1 flex flex-col justify-center gap-2">
          <p className="text-sm text-on-surface-variant/50">
            {locale === "en" ? "No sessions scheduled." : "Keine Einheit geplant."}
          </p>
          <Link href="/calendar" className="text-xs font-mono text-primary hover:underline">
            {locale === "en" ? "Open calendar →" : "Kalender öffnen →"}
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-xs text-on-surface-variant/60">
              {fmtRelativeDate(session.scheduledDate, locale)}
            </p>
            <p className="font-headline font-bold text-on-surface leading-tight">
              {session.trainingDay.title}
            </p>
            {session.trainingDay.focus && (
              <span className="self-start bg-secondary/10 text-secondary text-[10px] font-mono rounded-full px-2 py-0.5">
                {session.trainingDay.focus}
              </span>
            )}
          </div>
          {session.trainingDay.exercises.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {session.trainingDay.exercises.slice(0, 4).map((ex, i) => (
                <p key={i} className="text-xs text-on-surface-variant/70 truncate">
                  {ex.name}
                </p>
              ))}
              {session.trainingDay.exercises.length > 4 && (
                <p className="text-xs text-on-surface-variant/40">
                  +{session.trainingDay.exercises.length - 4}{" "}
                  {locale === "en" ? "more" : "weitere"}
                </p>
              )}
            </div>
          )}
          {session.trainingDay.estimatedDurationMin && (
            <p className="font-mono text-xs text-on-surface-variant/40">
              ≈ {session.trainingDay.estimatedDurationMin} min
            </p>
          )}
          <button
            onClick={() => onStart(session.trainingDay!.id, session.trainingDay!.title)}
            disabled={starting}
            className="mt-auto w-full rounded-xl bg-primary text-on-primary py-2.5 text-sm font-bold hover:opacity-90 transition-all disabled:opacity-40"
          >
            {starting
              ? locale === "en"
                ? "Starting…"
                : "Starte…"
              : locale === "en"
                ? "Start workout →"
                : "Training starten →"}
          </button>
        </>
      )}
    </div>
  );
}

// ── ActivePlanCard ────────────────────────────────────────────────────

function ActivePlanCard({
  plan,
  loading,
  locale,
}: {
  plan: DashboardData["activePlan"] | null;
  loading: boolean;
  locale: string;
}) {
  if (loading) {
    return <div className="rounded-2xl bg-surface-container h-44 animate-pulse" />;
  }
  return (
    <div className="bg-surface-container rounded-2xl p-5 flex flex-col gap-3 min-h-[180px]">
      <p className="text-[10px] font-mono uppercase text-on-surface-variant/50 tracking-wide">
        {locale === "en" ? "Active Plan" : "Aktiver Plan"}
      </p>
      {!plan ? (
        <div className="flex-1 flex flex-col justify-center gap-2">
          <p className="text-sm text-on-surface-variant/50">
            {locale === "en" ? "No active plan." : "Kein aktiver Plan."}
          </p>
          <Link href="/plans" className="text-xs font-mono text-primary hover:underline">
            {locale === "en" ? "Browse plans →" : "Pläne ansehen →"}
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <p className="font-headline font-bold text-on-surface leading-tight flex-1 min-w-0">
              {plan.title}
            </p>
            {plan.aiGenerated && (
              <span className="shrink-0 bg-primary/10 text-primary text-[10px] font-mono rounded-full px-2 py-0.5">
                AI
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {plan.days.slice(0, 5).map((day, i) => (
              <div key={day.id} className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] text-on-surface-variant/40 shrink-0 w-4">
                  {i + 1}
                </span>
                <span className="text-xs text-on-surface truncate flex-1">{day.title}</span>
                {day.focus && (
                  <span className="text-[10px] text-on-surface-variant/50 truncate max-w-[60px]">
                    {day.focus}
                  </span>
                )}
                <span className="font-mono text-[10px] text-on-surface-variant/40 shrink-0">
                  {day.exerciseCount}×
                </span>
              </div>
            ))}
            {plan.days.length > 5 && (
              <p className="font-mono text-[10px] text-on-surface-variant/40">
                +{plan.days.length - 5} {locale === "en" ? "more days" : "weitere Tage"}
              </p>
            )}
          </div>
          <Link
            href={`/plans/${plan.id}`}
            className="mt-auto text-xs font-mono text-primary hover:underline"
          >
            {locale === "en" ? "View plan →" : "Plan anzeigen →"}
          </Link>
        </>
      )}
    </div>
  );
}

// ── RecoveryCard ──────────────────────────────────────────────────────

function RecoveryCard({
  recovery,
  loading,
  locale,
}: {
  recovery: DashboardData["recovery"];
  loading: boolean;
  locale: string;
}) {
  if (loading) {
    return <div className="rounded-2xl bg-surface-container h-32 animate-pulse" />;
  }
  return (
    <div className="bg-surface-container rounded-2xl p-5 flex flex-col gap-3">
      <p className="text-[10px] font-mono uppercase text-on-surface-variant/50 tracking-wide">
        {locale === "en" ? "Recovery" : "Erholung"}
      </p>
      {recovery.length === 0 ? (
        <p className="text-sm text-on-surface-variant/40">
          {locale === "en" ? "No data yet." : "Keine Daten."}
        </p>
      ) : recovery.every((r) => r.recovered) ? (
        <p className="text-sm text-secondary font-medium">
          {locale === "en" ? "✓ Fully recovered" : "✓ Vollständig erholt"}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {recovery.map((r) => (
            <div
              key={r.muscle}
              className={cn(
                "rounded-xl px-3 py-2 flex items-center justify-between gap-1",
                r.recovered ? "bg-secondary/10 text-secondary" : "bg-amber-500/10 text-amber-400"
              )}
            >
              <span className="text-xs font-medium truncate">
                {r.recovered ? "✓ " : "⏱ "}
                {r.label}
              </span>
              {!r.recovered && (
                <span className="font-mono text-[10px] shrink-0">{r.hoursLeft}h</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AIReportCard ──────────────────────────────────────────────────────

function AIReportCard({
  report,
  loading,
  locale,
}: {
  report: DashboardData["lastReport"] | null;
  loading: boolean;
  locale: string;
}) {
  if (loading) {
    return <div className="rounded-2xl bg-surface-container h-48 animate-pulse" />;
  }
  return (
    <div className="bg-surface-container rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-mono uppercase text-on-surface-variant/50 tracking-wide">
          ✦ {locale === "en" ? "Last AI Analysis" : "Letzte KI-Analyse"}
        </p>
        {report && (
          <div className="flex items-center gap-2">
            <span className="bg-primary/10 text-primary text-[10px] font-mono rounded-full px-2 py-0.5">
              {fmtAnalysisType(report.analysisType, locale)}
            </span>
            <span className="font-mono text-[10px] text-on-surface-variant/40">
              {fmtRelativeTime(report.createdAt, locale)}
            </span>
          </div>
        )}
      </div>
      {!report ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-on-surface-variant/50">
            {locale === "en" ? "No analysis yet." : "Noch keine Analyse."}
          </p>
          <Link href="/records" className="text-xs font-mono text-primary hover:underline">
            {locale === "en" ? "View records →" : "Bestleistungen →"}
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {report.highlights.slice(0, 2).map((h, i) => (
              <p key={i} className="text-sm text-secondary">
                ✓ {h}
              </p>
            ))}
            {report.warnings.slice(0, 2).map((w, i) => (
              <p key={i} className="text-sm text-error">
                ⚠ {w}
              </p>
            ))}
          </div>
          {report.recommendations[0] && (
            <p className="text-xs text-on-surface-variant/60 border-t border-outline-variant/10 pt-3">
              → {report.recommendations[0]}
            </p>
          )}
          <Link href="/records" className="text-xs font-mono text-primary hover:underline">
            {locale === "en" ? "All analyses →" : "Alle Analysen →"}
          </Link>
        </>
      )}
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { startWorkout } = useWorkoutStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.text())
      .then((t) => {
        try {
          setData(JSON.parse(t));
        } catch {
          // ignore parse errors
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleStartWorkout(trainingDayId: string, title: string) {
    setStarting(true);
    try {
      const res = await fetch("/api/workout/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, trainingDayId }),
      });
      if (!res.ok) return;
      const sessionData = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exercises = (sessionData.exercises ?? []).map((ex: any) => ({ ...ex, loggedSets: [] }));
      startWorkout({
        sessionId: sessionData.id,
        title: sessionData.title,
        trainingDayId: sessionData.trainingDayId ?? null,
        startedAt: sessionData.startedAt,
        exercises,
      });
      router.push(`/workout/${sessionData.id}`);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-8 flex flex-col gap-6">
        {/* Header */}
        <header className="flex flex-col gap-1">
          <p className="text-xs font-mono text-on-surface-variant/50">
            {new Date().toLocaleDateString(locale === "en" ? "en-GB" : "de-DE", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <h1 className="font-headline text-2xl font-bold text-on-surface">
            {loading
              ? "…"
              : `${getGreeting(new Date().getHours(), locale)}, ${data?.user.displayName ?? ""}`}
          </h1>
        </header>

        {/* Stats strip */}
        <StatsStrip stats={data?.recentStats} loading={loading} locale={locale} />

        {/* 2-col grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NextSessionCard
            session={data?.nextSession ?? null}
            loading={loading}
            locale={locale}
            onStart={handleStartWorkout}
            starting={starting}
          />
          <ActivePlanCard plan={data?.activePlan ?? null} loading={loading} locale={locale} />
        </div>

        {/* Recovery */}
        <RecoveryCard recovery={data?.recovery ?? []} loading={loading} locale={locale} />

        {/* Last AI Analysis */}
        <AIReportCard report={data?.lastReport ?? null} loading={loading} locale={locale} />
      </div>
    </div>
  );
}
