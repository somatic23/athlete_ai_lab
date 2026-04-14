  "use client";

  import { useEffect, useState } from "react";
  import { useRouter } from "next/navigation";
  import Link from "next/link";
  import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
  } from "recharts";
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
    trainingLoad: { date: string; volumeKg: number; sets: number; durationMin: number }[];
    muscleLoad: { date: string; [muscle: string]: number | string }[];
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

  // ── TrainingLoadChart ─────────────────────────────────────────────────

  type LoadMode = "volume" | "duration" | "muscles";

  type LoadDay = { date: string; volumeKg: number; sets: number; durationMin: number };
  type MuscleDay = { date: string; [muscle: string]: number | string };

  const ALL_MUSCLES = [
    "chest", "back", "shoulders", "biceps", "triceps", "forearms",
    "quadriceps", "hamstrings", "glutes", "calves", "core", "full_body",
  ] as const;

  const MUSCLE_COLORS: Record<string, string> = {
    chest:       "#60a5fa",
    back:        "#34d399",
    shoulders:   "#a78bfa",
    biceps:      "#fb923c",
    triceps:     "#f472b6",
    forearms:    "#94a3b8",
    quadriceps:  "#4ade80",
    hamstrings:  "#facc15",
    glutes:      "#f87171",
    calves:      "#2dd4bf",
    core:        "#c084fc",
    full_body:   "#e2e8f0",
  };

  const MUSCLE_LABELS_SHORT_DE: Record<string, string> = {
    chest: "Brust", back: "Rücken", shoulders: "Schultern", biceps: "Bizeps",
    triceps: "Trizeps", forearms: "Unterarme", quadriceps: "Quadri", hamstrings: "Hamstr.",
    glutes: "Gesäß", calves: "Waden", core: "Core", full_body: "Ganzk.",
  };
  const MUSCLE_LABELS_SHORT_EN: Record<string, string> = {
    chest: "Chest", back: "Back", shoulders: "Shoulders", biceps: "Biceps",
    triceps: "Triceps", forearms: "Forearms", quadriceps: "Quads", hamstrings: "Hamstr.",
    glutes: "Glutes", calves: "Calves", core: "Core", full_body: "Full Body",
  };

  function fmtAxisDate(dateStr: string, locale: string): string {
    const d = new Date(dateStr + "T00:00:00");
    return locale === "en"
      ? `${d.getDate()}/${d.getMonth() + 1}`
      : `${d.getDate()}.${d.getMonth() + 1}.`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function LoadTooltip({ active, payload, locale, mode }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as LoadDay & MuscleDay;
    const dateLabel = new Date(d.date + "T00:00:00").toLocaleDateString(
      locale === "en" ? "en-GB" : "de-DE",
      { weekday: "short", day: "numeric", month: "short" }
    );
    const muscleLabels = locale === "en" ? MUSCLE_LABELS_SHORT_EN : MUSCLE_LABELS_SHORT_DE;

    if (mode === "muscles") {
      const muscles = payload.filter((p: { value: number }) => p.value > 0);
      if (!muscles.length) return null;
      return (
        <div className="rounded-xl bg-surface-container-high border border-outline-variant/20 px-3 py-2 text-xs shadow-lg max-w-[160px]">
          <p className="font-mono text-on-surface-variant/60 mb-1.5">{dateLabel}</p>
          <div className="flex flex-col gap-0.5">
            {muscles.map((p: { name: string; value: number; fill: string }) => (
              <div key={p.name} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: p.fill }} />
                  <span style={{ color: p.fill }}>{muscleLabels[p.name] ?? p.name}</span>
                </span>
                <span className="font-mono text-on-surface/80">{p.value}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (mode === "volume" && d.volumeKg === 0) return null;
    if (mode === "duration" && d.durationMin === 0) return null;

    return (
      <div className="rounded-xl bg-surface-container-high border border-outline-variant/20 px-3 py-2 text-xs shadow-lg">
        <p className="font-mono text-on-surface-variant/60 mb-1">{dateLabel}</p>
        {mode === "volume" && (
          <>
            <p className="font-bold text-on-surface">{d.volumeKg.toLocaleString()} kg</p>
            {d.sets > 0 && (
              <p className="text-on-surface-variant/50">{d.sets} {locale === "en" ? "sets" : "Sätze"}</p>
            )}
          </>
        )}
        {mode === "duration" && (
          <p className="font-bold text-on-surface">{d.durationMin} min</p>
        )}
      </div>
    );
  }

  function TrainingLoadChart({
    loadData,
    muscleData,
    loading,
    locale,
  }: {
    loadData: LoadDay[];
    muscleData: MuscleDay[];
    loading: boolean;
    locale: string;
  }) {
    const [mode, setMode] = useState<LoadMode>("volume");

    if (loading) {
      return <div className="rounded-2xl bg-surface-container h-52 animate-pulse" />;
    }

    const today = new Date().toISOString().slice(0, 10);

    const modeLabels: Record<LoadMode, string> = {
      volume:   locale === "en" ? "Volume" : "Volumen",
      duration: locale === "en" ? "Time" : "Zeit",
      muscles:  locale === "en" ? "Sets per Musclegroup" : "Sätze/Muskelgruppe",
    };

    const tickFormatter = (dateStr: string, idx: number) => {
      if (idx % 5 !== 0 && idx !== loadData.length - 1) return "";
      return fmtAxisDate(dateStr, locale);
    };

    // Muscles present in the 30-day window
    const activeMuscles = ALL_MUSCLES.filter((m) =>
      muscleData.some((d) => (d[m] as number) > 0)
    );
    const muscleLabels = locale === "en" ? MUSCLE_LABELS_SHORT_EN : MUSCLE_LABELS_SHORT_DE;

    const hasVolumeData  = loadData.some((d) => d.volumeKg > 0);
    const hasDurationData = loadData.some((d) => d.durationMin > 0);
    const hasMuscleData  = activeMuscles.length > 0;
    const hasAnyData = mode === "volume" ? hasVolumeData : mode === "duration" ? hasDurationData : hasMuscleData;

    return (
      <div className="bg-surface-container rounded-2xl p-5 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-mono uppercase text-on-surface-variant/50 tracking-wide">
            {locale === "en" ? "Training Load (30d)" : "Trainingsbelastung (30T)"}
          </p>
          {/* Mode toggle */}
          <div className="flex gap-0.5 bg-surface-container-high rounded-lg p-0.5">
            {(["volume", "duration", "muscles"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[10px] font-mono transition-all",
                  mode === m
                    ? "bg-surface-container text-on-surface shadow-sm"
                    : "text-on-surface-variant/50 hover:text-on-surface-variant"
                )}
              >
                {modeLabels[m]}
              </button>
            ))}
          </div>
        </div>

        {/* Chart area */}
        {!hasAnyData ? (
          <p className="text-sm text-on-surface-variant/40 py-6 text-center">
            {locale === "en" ? "No data yet." : "Noch keine Daten."}
          </p>
        ) : (
          <>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                {mode === "muscles" ? (
                  <BarChart data={muscleData} barCategoryGap="20%">
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 9, fill: "var(--color-on-surface-variant)", opacity: 0.4 }}
                      tickFormatter={tickFormatter}
                      interval={0}
                    />
                    <YAxis hide />
                    <Tooltip
                      content={<LoadTooltip locale={locale} mode={mode} />}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    {activeMuscles.map((m) => (
                      <Bar key={m} dataKey={m} stackId="a" fill={MUSCLE_COLORS[m]} radius={[0, 0, 0, 0]} maxBarSize={20} />
                    ))}
                  </BarChart>
                ) : (
                  <BarChart data={loadData} barCategoryGap="20%">
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 9, fill: "var(--color-on-surface-variant)", opacity: 0.4 }}
                      tickFormatter={tickFormatter}
                      interval={0}
                    />
                    <YAxis hide />
                    <Tooltip
                      content={<LoadTooltip locale={locale} mode={mode} />}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    <Bar
                      dataKey={mode === "volume" ? "volumeKg" : "durationMin"}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={20}
                    >
                      {loadData.map((entry) => {
                        const val = mode === "volume" ? entry.volumeKg : entry.durationMin;
                        return (
                          <Cell
                            key={entry.date}
                            fill={
                              entry.date === today
                                ? "var(--color-primary)"
                                : val > 0
                                  ? "var(--color-secondary)"
                                  : "rgba(255,255,255,0.06)"
                            }
                            opacity={val > 0 ? 1 : 0.3}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Muscle legend */}
            {mode === "muscles" && activeMuscles.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {activeMuscles.map((m) => (
                  <span key={m} className="flex items-center gap-1 text-[10px] text-on-surface-variant/60">
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: MUSCLE_COLORS[m] }} />
                    {muscleLabels[m]}
                  </span>
                ))}
              </div>
            )}
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
        <div className="max-w-4xl mx-auto px-4 py-6 pb-8 flex flex-col gap-6">
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

          {/* Training load chart */}
          <TrainingLoadChart
            loadData={data?.trainingLoad ?? []}
            muscleData={data?.muscleLoad ?? []}
            loading={loading}
            locale={locale}
          />

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
