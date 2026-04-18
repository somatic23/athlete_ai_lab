"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils/cn";
import { useLocaleStore } from "@/stores/locale-store";

// ── Recharts — dynamic import to avoid SSR ───────────────────────────────
const LineChart       = dynamic(() => import("recharts").then((m) => m.LineChart),       { ssr: false });
const Line            = dynamic(() => import("recharts").then((m) => m.Line),             { ssr: false });
const BarChart        = dynamic(() => import("recharts").then((m) => m.BarChart),         { ssr: false });
const Bar             = dynamic(() => import("recharts").then((m) => m.Bar),              { ssr: false });
const XAxis           = dynamic(() => import("recharts").then((m) => m.XAxis),            { ssr: false });
const YAxis           = dynamic(() => import("recharts").then((m) => m.YAxis),            { ssr: false });
const Tooltip         = dynamic(() => import("recharts").then((m) => m.Tooltip),          { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });

// ── Types ────────────────────────────────────────────────────────────────

type PR = {
  exerciseId: string;
  name: string;
  primaryMuscleGroup: string;
  estimated1rm: number;
  weightKg: number;
  reps: number;
  previousEstimated1rm: number | null;
  deltaPct: number | null;
  achievedAt: string;
};

type RecentPR = {
  id: string;
  exerciseId: string;
  name: string;
  estimated1rm: number;
  weightKg: number;
  reps: number;
  previousRecordValue: number | null;
  achievedAt: string;
};

type ProgressionExercise = {
  exerciseId: string;
  name: string;
  primaryMuscleGroup: string;
  trend: "up" | "plateau" | "down" | "neutral";
  dataPoints: { date: string; estimated1rm: number | null; maxWeight: number | null; sessionTitle: string }[];
};

type RecoveryEntry = {
  muscle: string;
  label: string;
  recoveredAt: string | null;
  recovered: boolean;
  hoursLeft: number;
};

type AIReport = {
  id: string;
  sessionId: string | null;
  analysisType: string;
  createdAt: string;
  highlights: string[];
  warnings: string[];
  recommendations: string[];
  plateauDetectedExercises: string[];
  overloadDetectedMuscles: string[];
  nextSessionSuggestions: string[];
};

// ── Constants ────────────────────────────────────────────────────────────

const TREND_COLOR = {
  up:      "text-secondary",
  down:    "text-error",
  plateau: "text-amber-400",
  neutral: "text-on-surface-variant",
} as const;

const TREND_ICON = { up: "↑", down: "↓", plateau: "→", neutral: "–" } as const;

const MUSCLE_COLORS: Record<string, string> = {
  Brust: "#CCFF00", Rücken: "#00E5FF", Schultern: "#FF6B6B",
  Bizeps: "#FFB347", Trizeps: "#A78BFA", Unterarme: "#34D399",
  Quadrizeps: "#F472B6", Hamstrings: "#60A5FA", Gesäß: "#FBBF24",
  Waden: "#6EE7B7", Core: "#C084FC", Ganzkörper: "#94A3B8",
  Chest: "#CCFF00", Back: "#00E5FF", Shoulders: "#FF6B6B",
  Biceps: "#FFB347", Triceps: "#A78BFA", Forearms: "#34D399",
  Quadriceps: "#F472B6", Hamstrings2: "#60A5FA", Glutes: "#FBBF24",
  Calves: "#6EE7B7", "Full Body": "#94A3B8",
};

function getMuscleColor(label: string) {
  return MUSCLE_COLORS[label] ?? "#94A3B8";
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

function fmtDateShort(iso: string) {
  return iso.slice(5); // MM-DD
}

// ── Sub-components ────────────────────────────────────────────────────────


function PRCard({ pr }: { pr: PR }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-4 flex flex-col gap-2">
      <p className="text-xs font-mono text-on-surface-variant/60 truncate">{pr.name}</p>
      <div className="flex items-end gap-2">
        <span className="font-headline text-3xl font-bold text-on-surface leading-none">
          {pr.estimated1rm.toFixed(1)}
        </span>
        <span className="text-xs font-mono text-on-surface-variant mb-1">kg est. 1RM</span>
      </div>
      <div className="flex items-center gap-3 text-xs font-mono">
        <span className="text-on-surface-variant/60">
          {pr.weightKg} kg × {pr.reps}
        </span>
        {pr.deltaPct != null && (
          <span className={cn(
            "font-bold",
            pr.deltaPct > 0 ? "text-secondary" : pr.deltaPct < 0 ? "text-error" : "text-amber-400"
          )}>
            {pr.deltaPct > 0 ? "+" : ""}{pr.deltaPct.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-xs text-on-surface-variant/40 font-mono">{fmtDate(pr.achievedAt)}</p>
    </div>
  );
}

function TrendBadge({ trend }: { trend: "up" | "plateau" | "down" | "neutral" }) {
  const labels = { up: "Progression", plateau: "Plateau", down: "Rückgang", neutral: "–" };
  return (
    <span className={cn("text-xs font-mono font-bold", TREND_COLOR[trend])}>
      {TREND_ICON[trend]} {labels[trend]}
    </span>
  );
}

function RecoveryBar({ entry }: { entry: RecoveryEntry }) {
  const pct = entry.recovered ? 100 : Math.max(5, 100 - (entry.hoursLeft / 72) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-on-surface-variant truncate">{entry.label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            entry.recovered ? "bg-secondary" : entry.hoursLeft < 12 ? "bg-amber-400" : "bg-error/60"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn(
        "w-20 shrink-0 text-right text-xs font-mono",
        entry.recovered ? "text-secondary" : "text-on-surface-variant/60"
      )}>
        {entry.recovered ? "Erholt" : `${entry.hoursLeft}h`}
      </span>
    </div>
  );
}

function ReportCard({ report }: { report: AIReport }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-surface-container-low overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-surface-container transition-colors text-left"
      >
        <div>
          <p className="text-xs font-mono uppercase text-on-surface-variant/60">
            {report.analysisType === "post_workout"
              ? "Post-Workout"
              : report.analysisType === "weekly"
              ? "Wochenanalyse"
              : report.analysisType === "monthly"
              ? "Monatsanalyse"
              : report.analysisType}
          </p>
          <p className="text-sm font-medium text-on-surface mt-0.5">{fmtDate(report.createdAt)}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {report.warnings.length > 0 && (
            <span className="text-xs font-mono text-error">{report.warnings.length} ⚠</span>
          )}
          {report.highlights.length > 0 && (
            <span className="text-xs font-mono text-secondary">{report.highlights.length} ✓</span>
          )}
          <span className="text-on-surface-variant/40">{open ? "↑" : "↓"}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-4">
          {report.highlights.length > 0 && (
            <div>
              <p className="text-xs font-mono uppercase text-secondary mb-2">Highlights</p>
              <ul className="space-y-1">
                {report.highlights.map((h, i) => (
                  <li key={i} className="text-sm text-on-surface flex gap-2">
                    <span className="text-secondary shrink-0">✓</span>{h}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.warnings.length > 0 && (
            <div>
              <p className="text-xs font-mono uppercase text-error mb-2">Warnungen</p>
              <ul className="space-y-1">
                {report.warnings.map((w, i) => (
                  <li key={i} className="text-sm text-on-surface flex gap-2">
                    <span className="text-error shrink-0">⚠</span>{w}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-mono uppercase text-on-surface-variant/60 mb-2">Empfehlungen</p>
              <ul className="space-y-1">
                {report.recommendations.map((r, i) => (
                  <li key={i} className="text-sm text-on-surface flex gap-2">
                    <span className="text-primary shrink-0">→</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.nextSessionSuggestions.length > 0 && (
            <div>
              <p className="text-xs font-mono uppercase text-on-surface-variant/60 mb-2">Nächste Session</p>
              <ul className="space-y-1">
                {report.nextSessionSuggestions.map((s, i) => (
                  <li key={i} className="text-sm text-on-surface/80">{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Custom chart tooltip ──────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-surface-container-highest px-3 py-2 text-xs shadow-lg">
      <p className="text-on-surface-variant font-mono mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-bold" style={{ color: p.name === "estimated1rm" ? "#CCFF00" : "#00E5FF" }}>
          {p.value?.toFixed(1)} kg
        </p>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

type Tab = "prs" | "progression" | "volume" | "ai";

export default function RecordsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const [tab, setTab] = useState<Tab>("prs");

  // PRs
  const [bests, setBests] = useState<PR[]>([]);
  const [recentPrs, setRecentPrs] = useState<RecentPR[]>([]);
  const [prsLoading, setPrsLoading] = useState(true);

  // Progression
  const [progression, setProgression] = useState<ProgressionExercise[]>([]);
  const [progressionLoading, setProgressionLoading] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);

  // Overview (volume + recovery + AI)
  const [volumeByWeek, setVolumeByWeek] = useState<Record<string, number | string>[]>([]);
  const [recovery, setRecovery] = useState<RecoveryEntry[]>([]);
  const [aiReports, setAiReports] = useState<AIReport[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewLoaded, setOverviewLoaded] = useState(false);

  // Generate analysis
  const [generating, setGenerating] = useState<"weekly" | "monthly" | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Load PRs on mount
  useEffect(() => {
    fetch(`/api/records?locale=${locale}`)
      .then((r) => r.json())
      .then((d) => { setBests(d.bests ?? []); setRecentPrs(d.recent ?? []); })
      .finally(() => setPrsLoading(false));
  }, [locale]);

  // Load progression when tab becomes active
  useEffect(() => {
    if (tab !== "progression" || progression.length > 0) return;
    setProgressionLoading(true);
    fetch(`/api/analytics/progression?weeks=16&locale=${locale}`)
      .then((r) => r.json())
      .then((d) => {
        setProgression(Array.isArray(d) ? d : []);
        if (d.length > 0) setSelectedExerciseId(d[0].exerciseId);
      })
      .finally(() => setProgressionLoading(false));
  }, [tab, locale, progression.length]);

  // Load overview when volume or ai tab becomes active
  useEffect(() => {
    if ((tab !== "volume" && tab !== "ai") || overviewLoaded) return;
    setOverviewLoading(true);
    fetch(`/api/analytics/overview?locale=${locale}&weeks=8`)
      .then((r) => r.json())
      .then((d) => {
        setVolumeByWeek(d.volumeByWeek ?? []);
        setRecovery(d.recovery ?? []);
        setAiReports(d.reports ?? []);
        setOverviewLoaded(true);
      })
      .finally(() => setOverviewLoading(false));
  }, [tab, locale, overviewLoaded]);

  const selectedExercise = useMemo(
    () => progression.find((e) => e.exerciseId === selectedExerciseId),
    [progression, selectedExerciseId]
  );

  // All muscle groups that appear in the volume data
  const muscleKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of volumeByWeek) {
      for (const k of Object.keys(row)) {
        if (k !== "week") keys.add(k);
      }
    }
    return Array.from(keys);
  }, [volumeByWeek]);

  async function triggerAnalysis(type: "weekly" | "monthly") {
    setGenerating(type);
    setGenerateError(null);
    // Ensure overview is loaded so we can prepend
    if (!overviewLoaded) {
      const d = await fetch(`/api/analytics/overview?locale=${locale}&weeks=8`).then((r) => r.json());
      setVolumeByWeek(d.volumeByWeek ?? []);
      setRecovery(d.recovery ?? []);
      setAiReports(d.reports ?? []);
      setOverviewLoaded(true);
    }
    try {
      const res = await fetch("/api/analytics/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(text); } catch {
        setGenerateError("Server-Fehler. Prüfe die AI-Provider-Konfiguration.");
        setGenerating(null);
        return;
      }
      if (!res.ok) {
        setGenerateError((data.error as string) ?? "Fehler beim Generieren");
      } else {
        setAiReports((prev) => [data as unknown as AIReport, ...prev]);
      }
    } catch {
      setGenerateError("Verbindungsfehler.");
    }
    setGenerating(null);
  }

  // Active AI warnings across all reports (deduplicated)
  const activeWarnings = useMemo(() => {
    const seen = new Set<string>();
    return aiReports.flatMap((r) => r.warnings).filter((w) => {
      if (seen.has(w)) return false;
      seen.add(w);
      return true;
    }).slice(0, 5);
  }, [aiReports]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-outline-variant/10 px-5 py-4">
        <h1 className="font-headline text-xl font-bold text-on-surface">Bestleistungen & Analytics</h1>

        {/* Tabs */}
        <div className="seg mt-3 overflow-x-auto no-scrollbar" style={{ display: "inline-flex" }}>
          <button className={cn(tab === "prs" && "on")} onClick={() => setTab("prs")}>PRs</button>
          <button className={cn(tab === "progression" && "on")} onClick={() => setTab("progression")}>Progression</button>
          <button className={cn(tab === "volume" && "on")} onClick={() => setTab("volume")}>Volumen</button>
          <button className={cn(tab === "ai" && "on")} onClick={() => setTab("ai")}>KI-Analyse</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">

        {/* ── Tab: PRs ───────────────────────────────────────────────── */}
        {tab === "prs" && (
          <div className="flex flex-col gap-6">
            {prsLoading ? (
              <p className="text-sm text-on-surface-variant/50 text-center py-10">Laden…</p>
            ) : bests.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-on-surface-variant/50 text-sm">Noch keine Bestleistungen erfasst.</p>
                <p className="text-xs text-on-surface-variant/30 mt-2">Trainings abschließen um PRs zu generieren.</p>
              </div>
            ) : (
              <>
                {/* Hero PR card — top result */}
                {bests.length > 0 && (() => {
                  const top = bests[0];
                  return (
                    <div
                      className="relative overflow-hidden rounded-2xl p-6"
                      style={{
                        background: "radial-gradient(120% 80% at 0% 0%, rgba(252,224,71,0.1), transparent 60%), var(--color-surface-container)",
                        border: "1px solid rgba(252,224,71,0.22)",
                      }}
                    >
                      <div className="shine pointer-events-none absolute inset-0" />
                      <div className="relative flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-2 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="caption">◆ {locale === "en" ? "Top PR" : "Bester PR"}</span>
                            <span
                              className="chip"
                              style={{ background: "rgba(252,224,71,0.1)", color: "var(--color-tertiary-container)", border: "1px solid rgba(252,224,71,0.2)" }}
                            >
                              {fmtDate(top.achievedAt)}
                            </span>
                          </div>
                          <h2 className="display-text text-xl font-bold text-on-surface truncate">{top.name}</h2>
                          <p className="mono-text text-sm text-on-surface-variant/60">
                            {top.weightKg} kg × {top.reps} {locale === "en" ? "reps" : "Wdh"}
                          </p>
                          <p className="mono-text text-xs text-on-surface-variant/40">
                            {top.primaryMuscleGroup}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span
                            className="display-text font-bold leading-none"
                            style={{ fontSize: "clamp(40px,8vw,64px)", color: "var(--color-tertiary-container)" }}
                          >
                            {top.estimated1rm.toFixed(1)}
                          </span>
                          <p className="mono-text text-[10px] text-on-surface-variant/45 mt-0.5">kg est. 1RM</p>
                          {top.deltaPct != null && top.deltaPct > 0 && (
                            <p className="mono-text text-sm font-bold mt-1" style={{ color: "var(--color-tertiary-container)" }}>
                              +{top.deltaPct.toFixed(1)}%
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Top PRs grid */}
                {bests.length > 1 && (
                  <div>
                    <p className="caption mb-3">
                      {locale === "en" ? "Top Records" : "Top Bestleistungen"}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {bests.slice(1, 7).map((pr) => <PRCard key={pr.exerciseId} pr={pr} />)}
                    </div>
                  </div>
                )}

                {/* Recent achievements */}
                {recentPrs.length > 0 && (
                  <div>
                    <p className="caption mb-3">
                      {locale === "en" ? "Last 30 Days" : "Letzte 30 Tage"}
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {recentPrs.map((pr) => (
                        <div
                          key={pr.id}
                          className="flex items-center gap-4 rounded-xl px-4 py-3 transition-colors hover:bg-surface-container-high"
                          style={{ background: "var(--color-surface-container-low)", border: "1px solid rgba(72,72,71,0.1)" }}
                        >
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mono-text text-[10px] font-bold text-secondary"
                            style={{ background: "rgba(0,227,253,0.1)", border: "1px solid rgba(0,227,253,0.15)" }}
                          >
                            PR
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-on-surface truncate">{pr.name}</p>
                            <p className="text-xs font-mono text-on-surface-variant/60">
                              {pr.estimated1rm.toFixed(1)} kg est. 1RM ({pr.weightKg} kg × {pr.reps})
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            {pr.previousRecordValue && (
                              <p className="text-xs font-mono text-secondary font-bold">
                                +{((pr.estimated1rm - pr.previousRecordValue) / pr.previousRecordValue * 100).toFixed(1)}%
                              </p>
                            )}
                            <p className="text-xs text-on-surface-variant/40 font-mono">{fmtDate(pr.achievedAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All PRs table */}
                <div>
                  <p className="caption mb-3">
                    {locale === "en" ? `All Exercises (${bests.length})` : `Alle Übungen (${bests.length})`}
                  </p>
                  <div className="flex flex-col gap-1">
                    {bests.map((pr) => (
                      <div
                        key={pr.exerciseId}
                        className="flex items-center gap-4 rounded-xl px-4 py-3 transition-colors hover:bg-surface-container"
                        style={{ background: "var(--color-surface-container-low)" }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-on-surface truncate">{pr.name}</p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="text-sm font-bold font-mono text-on-surface">
                            {pr.estimated1rm.toFixed(1)} kg
                          </span>
                          {pr.deltaPct != null && (
                            <span className={cn(
                              "text-xs font-mono font-bold w-14 text-right",
                              pr.deltaPct > 0 ? "text-secondary" : pr.deltaPct < 0 ? "text-error" : "text-amber-400"
                            )}>
                              {pr.deltaPct > 0 ? "+" : ""}{pr.deltaPct.toFixed(1)}%
                            </span>
                          )}
                          <span className="text-xs text-on-surface-variant/40 font-mono w-16 text-right">
                            {fmtDate(pr.achievedAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Tab: Progression ───────────────────────────────────────── */}
        {tab === "progression" && (
          <div className="flex flex-col gap-5">
            {progressionLoading ? (
              <p className="text-sm text-on-surface-variant/50 text-center py-10">Laden…</p>
            ) : progression.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-on-surface-variant/50 text-sm">Noch keine Progressionsdaten.</p>
                <p className="text-xs text-on-surface-variant/30 mt-2">Nach dem ersten abgeschlossenen Training verfügbar.</p>
              </div>
            ) : (
              <>
                {/* Exercise selector */}
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-on-surface-variant/60 mb-2">
                    Übung auswählen
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {progression.map((ex) => (
                      <button
                        key={ex.exerciseId}
                        onClick={() => setSelectedExerciseId(ex.exerciseId)}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-medium transition-all flex items-center gap-1.5",
                          selectedExerciseId === ex.exerciseId
                            ? "bg-primary text-on-primary"
                            : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                        )}
                      >
                        <span className={cn("font-bold", TREND_COLOR[ex.trend])}>
                          {TREND_ICON[ex.trend]}
                        </span>
                        {ex.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 1RM Chart */}
                {selectedExercise && (
                  <div className="rounded-xl bg-surface-container-low p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-medium text-on-surface">{selectedExercise.name}</p>
                        <TrendBadge trend={selectedExercise.trend} />
                      </div>
                      {selectedExercise.dataPoints.length > 0 && (() => {
                        const pts = selectedExercise.dataPoints.filter((p) => p.estimated1rm != null);
                        if (pts.length < 1) return null;
                        const latest = pts[pts.length - 1];
                        return (
                          <div className="text-right">
                            <p className="font-headline text-2xl font-bold text-on-surface">
                              {latest.estimated1rm?.toFixed(1)} kg
                            </p>
                            <p className="text-xs font-mono text-on-surface-variant/60">est. 1RM</p>
                          </div>
                        );
                      })()}
                    </div>

                    {selectedExercise.dataPoints.length < 2 ? (
                      <p className="text-xs text-on-surface-variant/50 text-center py-4">
                        Mindestens 2 Sessions für Chart benötigt
                      </p>
                    ) : (
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={selectedExercise.dataPoints}>
                            <XAxis
                              dataKey="date"
                              tickFormatter={fmtDateShort}
                              tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              domain={["auto", "auto"]}
                              tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }}
                              axisLine={false}
                              tickLine={false}
                              width={40}
                              tickFormatter={(v) => `${v}`}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Line
                              type="monotone"
                              dataKey="estimated1rm"
                              stroke="#CCFF00"
                              strokeWidth={2}
                              dot={{ r: 3, fill: "#CCFF00", strokeWidth: 0 }}
                              connectNulls
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}

                {/* All exercises summary */}
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-on-surface-variant/60 mb-3">
                    Übersicht
                  </p>
                  <div className="flex flex-col gap-2">
                    {progression.map((ex) => {
                      const pts = ex.dataPoints.filter((p) => p.estimated1rm != null);
                      const latest = pts[pts.length - 1];
                      const first = pts[0];
                      const delta = latest && first && first.estimated1rm
                        ? ((latest.estimated1rm! - first.estimated1rm) / first.estimated1rm) * 100
                        : null;
                      return (
                        <button
                          key={ex.exerciseId}
                          onClick={() => { setSelectedExerciseId(ex.exerciseId); }}
                          className="flex items-center gap-4 rounded-lg bg-surface-container-low px-4 py-3 text-left hover:bg-surface-container transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-on-surface truncate">{ex.name}</p>
                            <p className="text-xs text-on-surface-variant/50 font-mono">{ex.dataPoints.length} Sessions</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <TrendBadge trend={ex.trend} />
                            {latest?.estimated1rm && (
                              <span className="text-sm font-mono font-bold text-on-surface">
                                {latest.estimated1rm.toFixed(1)} kg
                              </span>
                            )}
                            {delta != null && (
                              <span className={cn(
                                "text-xs font-mono font-bold w-14 text-right",
                                delta > 0 ? "text-secondary" : delta < 0 ? "text-error" : "text-amber-400"
                              )}>
                                {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Tab: Volumen ───────────────────────────────────────────── */}
        {tab === "volume" && (
          <div className="flex flex-col gap-6">
            {overviewLoading ? (
              <p className="text-sm text-on-surface-variant/50 text-center py-10">Laden…</p>
            ) : (
              <>
                {/* Volume by muscle group stacked bar */}
                {volumeByWeek.length > 0 && muscleKeys.length > 0 ? (
                  <div className="rounded-xl bg-surface-container-low p-4">
                    <p className="text-xs font-mono uppercase tracking-widest text-on-surface-variant/60 mb-4">
                      Volumen pro Muskelgruppe (letzte 8 Wochen)
                    </p>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={volumeByWeek} barSize={14}>
                          <XAxis
                            dataKey="week"
                            tickFormatter={fmtDateShort}
                            tick={{ fontSize: 9, fill: "var(--color-on-surface-variant)" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 9, fill: "var(--color-on-surface-variant)" }}
                            axisLine={false}
                            tickLine={false}
                            width={35}
                            tickFormatter={(v) => `${Math.round(v)}`}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "var(--color-surface-container-highest)",
                              border: "none",
                              borderRadius: "8px",
                              fontSize: "11px",
                            }}
                            labelFormatter={(l) => `Woche ${String(l).slice(5)}`}
                          />
                          {muscleKeys.map((key) => (
                            <Bar
                              key={key}
                              dataKey={key}
                              stackId="vol"
                              fill={getMuscleColor(key)}
                              opacity={0.85}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                      {muscleKeys.map((key) => (
                        <div key={key} className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full" style={{ background: getMuscleColor(key) }} />
                          <span className="text-xs text-on-surface-variant/60">{key}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl bg-surface-container-low p-6 text-center">
                    <p className="text-sm text-on-surface-variant/50">Noch keine Volumendaten.</p>
                  </div>
                )}

                {/* Recovery status */}
                {recovery.length > 0 && (
                  <div className="rounded-xl bg-surface-container-low p-4">
                    <p className="text-xs font-mono uppercase tracking-widest text-on-surface-variant/60 mb-4">
                      Recovery-Status
                    </p>
                    <div className="flex flex-col gap-3">
                      {recovery.map((e) => (
                        <RecoveryBar key={e.muscle} entry={e} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Tab: KI-Analyse ────────────────────────────────────────── */}
        {tab === "ai" && (
          <div className="flex flex-col gap-5">

            {/* Trigger buttons */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-mono uppercase tracking-widest text-on-surface-variant/60">
                Analyse manuell starten
              </p>
              <div className="flex gap-3">
                {(["weekly", "monthly"] as const).map((type) => {
                  const isActive = generating === type;
                  const label = type === "weekly"
                    ? (locale === "en" ? "Weekly Analysis" : "Wochenanalyse")
                    : (locale === "en" ? "Monthly Analysis" : "Monatsanalyse");
                  const period = type === "weekly"
                    ? (locale === "en" ? "Last 7 days" : "Letzte 7 Tage")
                    : (locale === "en" ? "Last 30 days" : "Letzte 30 Tage");
                  return (
                    <button
                      key={type}
                      onClick={() => triggerAnalysis(type)}
                      disabled={generating !== null}
                      className={cn(
                        "flex-1 rounded-xl border-2 p-4 text-left transition-all",
                        isActive
                          ? "border-primary bg-primary/5 animate-pulse cursor-wait"
                          : generating !== null
                          ? "border-transparent bg-surface-container-low opacity-40 cursor-not-allowed"
                          : "border-transparent bg-surface-container-low hover:border-primary/30 hover:bg-surface-container"
                      )}
                    >
                      <p className="text-sm font-semibold text-on-surface">
                        {isActive ? (locale === "en" ? "Generating…" : "Generiere…") : label}
                      </p>
                      <p className="text-xs text-on-surface-variant/50 mt-0.5 font-mono">{period}</p>
                    </button>
                  );
                })}
              </div>
              {generateError && (
                <p className="text-xs text-error rounded-lg bg-error/10 px-3 py-2">{generateError}</p>
              )}
            </div>

            {overviewLoading ? (
              <p className="text-sm text-on-surface-variant/50 text-center py-10">Laden…</p>
            ) : aiReports.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-on-surface-variant/50 text-sm">Noch keine KI-Analysen vorhanden.</p>
                <p className="text-xs text-on-surface-variant/30 mt-2">Training abschließen oder Analyse oben starten.</p>
              </div>
            ) : (
              <>
                {/* Active warnings summary */}
                {activeWarnings.length > 0 && (
                  <div className="rounded-xl bg-error/5 border border-error/20 p-4">
                    <p className="text-xs font-mono uppercase tracking-widest text-error mb-3">
                      {locale === "en" ? "Active Warnings" : "Aktive Warnungen"}
                    </p>
                    <ul className="flex flex-col gap-2">
                      {activeWarnings.map((w, i) => (
                        <li key={i} className="flex gap-2 text-sm text-on-surface">
                          <span className="text-error shrink-0">⚠</span>{w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Reports list */}
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-on-surface-variant/60 mb-3">
                    {locale === "en" ? `Analyses (${aiReports.length})` : `Analysen (${aiReports.length})`}
                  </p>
                  <div className="flex flex-col gap-2">
                    {aiReports.map((r) => <ReportCard key={r.id} report={r} />)}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
