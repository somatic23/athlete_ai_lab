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

// ── Types ─────────────────────────────────────────────────────────────────

type WeekDay = {
  date: string;
  dayShort: string;
  dayNum: number;
  isToday: boolean;
  title: string | null;
  isRest: boolean;
  isCompleted: boolean;
  rpe: number | null;
};

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
    pct: number;
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
  trainingStreak: number;
  weekSchedule: WeekDay[];
};

// ── Helpers ───────────────────────────────────────────────────────────────

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

function muscleColor(pct: number): string {
  if (pct >= 95) return "var(--color-secondary)";
  if (pct >= 50) return "var(--color-tertiary-container)";
  return "var(--color-error)";
}

// ── Sparkline ─────────────────────────────────────────────────────────────

function Sparkline({
  data,
  accent = "var(--color-primary-container)",
  width = 80,
  height = 24,
}: {
  data: number[];
  accent?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - 2 - (v / max) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const [lastX, lastY] = pts[pts.length - 1].split(",");
  return (
    <svg width={width} height={height} className="overflow-visible shrink-0">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={accent}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
      <circle cx={lastX} cy={lastY} r="2.5" fill={accent} />
    </svg>
  );
}

// ── HeroNextSession ───────────────────────────────────────────────────────

function HeroNextSession({
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
    return <div className="rounded-2xl bg-surface-container h-48 animate-pulse" />;
  }

  if (!session || !session.trainingDay) {
    return (
      <div
        className="relative overflow-hidden rounded-2xl p-6 flex flex-col gap-3"
        style={{
          background: "var(--color-surface-container)",
          border: "1px solid rgba(72,72,71,0.2)",
          minHeight: 140,
        }}
      >
        <span className="caption">{locale === "en" ? "Next Session" : "Nächste Einheit"}</span>
        <p className="text-sm text-on-surface-variant/50">
          {locale === "en" ? "No sessions scheduled." : "Keine Einheit geplant."}
        </p>
        <Link href="/calendar" className="mono-text text-xs text-primary-container hover:underline">
          {locale === "en" ? "Open calendar →" : "Kalender öffnen →"}
        </Link>
      </div>
    );
  }

  const { trainingDay, scheduledDate } = session;
  const exercises = trainingDay.exercises.slice(0, 6);

  return (
    <div
      className="relative overflow-hidden rounded-2xl radial-heat glow-primary"
      style={{ border: "1px solid rgba(202,253,0,0.16)" }}
    >
      {/* Dot grid overlay */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]"
        aria-hidden
      >
        <defs>
          <pattern id="dot-grid" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="var(--color-primary-container)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid)" />
      </svg>

      {/* Decorative date numeral */}
      <span
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 display-text font-bold select-none leading-none"
        style={{ fontSize: "clamp(80px,18vw,148px)", color: "rgba(202,253,0,0.04)" }}
        aria-hidden
      >
        {String(new Date(scheduledDate + "T00:00:00").getDate()).padStart(2, "0")}
      </span>

      <div className="relative flex flex-col gap-4 p-6 lg:flex-row lg:items-start">
        {/* Left column */}
        <div className="flex flex-1 flex-col gap-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="caption">{locale === "en" ? "Next Session" : "Nächste Einheit"}</span>
            <span
              className="chip text-primary-container"
              style={{
                background: "rgba(202,253,0,0.1)",
                border: "1px solid rgba(202,253,0,0.2)",
              }}
            >
              {fmtRelativeDate(scheduledDate, locale)}
            </span>
          </div>

          <h2
            className="grad-text display-text font-bold leading-tight"
            style={{ fontSize: "clamp(22px,4.5vw,36px)" }}
          >
            {trainingDay.title}
          </h2>

          {trainingDay.focus && (
            <span
              className="chip self-start text-secondary"
              style={{
                background: "rgba(0,227,253,0.08)",
                border: "1px solid rgba(0,227,253,0.15)",
              }}
            >
              {trainingDay.focus}
            </span>
          )}

          <div className="flex flex-wrap gap-5 mt-1">
            {trainingDay.estimatedDurationMin && (
              <div className="flex flex-col gap-0.5">
                <span className="mono-text text-[10px] text-on-surface-variant/50">
                  {locale === "en" ? "Duration" : "Dauer"}
                </span>
                <span className="display-text text-sm font-bold text-on-surface">
                  {trainingDay.estimatedDurationMin} min
                </span>
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <span className="mono-text text-[10px] text-on-surface-variant/50">
                {locale === "en" ? "Exercises" : "Übungen"}
              </span>
              <span className="display-text text-sm font-bold text-on-surface">
                {trainingDay.exercises.length}
              </span>
            </div>
          </div>

          <button
            onClick={() => onStart(trainingDay.id, trainingDay.title)}
            disabled={starting}
            className="btn-liquid mt-1 self-start rounded-xl px-8 py-3 text-sm font-bold text-on-primary transition-all hover:opacity-90 disabled:opacity-40"
          >
            {starting
              ? locale === "en"
                ? "Starting…"
                : "Starte…"
              : locale === "en"
                ? "⚡ Begin Session"
                : "⚡ Training starten"}
          </button>
        </div>

        {/* Right column: exercise list */}
        {exercises.length > 0 && (
          <div className="flex flex-col gap-1.5 lg:w-52 lg:shrink-0">
            <span className="caption mb-0.5">{locale === "en" ? "Exercises" : "Übungen"}</span>
            {exercises.map((ex, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="mono-text text-[10px] text-on-surface-variant/30 w-4 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-xs text-on-surface/75 truncate">{ex.name}</span>
              </div>
            ))}
            {trainingDay.exercises.length > 6 && (
              <span className="mono-text text-[10px] text-on-surface-variant/35 mt-0.5">
                +{trainingDay.exercises.length - 6} {locale === "en" ? "more" : "weitere"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── StatChip ──────────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  sub,
  sparkData,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  sparkData?: number[];
  accent?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl p-4 flex flex-col gap-1.5"
      style={{
        background: "var(--color-surface-container)",
        border: "1px solid rgba(72,72,71,0.18)",
      }}
    >
      <span className="caption">{label}</span>
      <span className="display-text text-[26px] font-bold text-on-surface leading-none">
        {value}
      </span>
      {sub && (
        <span className="mono-text text-[10px] text-on-surface-variant/45 leading-none">
          {sub}
        </span>
      )}
      {sparkData && sparkData.length > 1 && (
        <div className="absolute bottom-3 right-3 opacity-70">
          <Sparkline
            data={sparkData}
            accent={accent ?? "var(--color-primary-container)"}
            width={56}
            height={18}
          />
        </div>
      )}
    </div>
  );
}

// ── ConsistencyRing ───────────────────────────────────────────────────────

function ConsistencyRing({
  sessionsCount,
  label,
  sublabel,
}: {
  sessionsCount: number;
  label: string;
  sublabel: string;
}) {
  const target = 20;
  const pct = Math.min(1, sessionsCount / target);
  const r = 26;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;

  return (
    <div
      className="relative overflow-hidden rounded-xl p-4 flex flex-col items-center justify-center gap-1"
      style={{
        background: "var(--color-surface-container)",
        border: "1px solid rgba(72,72,71,0.18)",
      }}
    >
      <span className="caption text-center">{label}</span>
      <div className="relative flex items-center justify-center" style={{ width: 68, height: 68 }}>
        <svg width="68" height="68" className="-rotate-90">
          <circle
            cx="34"
            cy="34"
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="5"
          />
          <circle
            cx="34"
            cy="34"
            r={r}
            fill="none"
            stroke="var(--color-primary-container)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="display-text text-[22px] font-bold text-on-surface leading-none">
            {sessionsCount}
          </span>
          <span className="mono-text text-[8px] text-on-surface-variant/45 mt-0.5">
            /{target}
          </span>
        </div>
      </div>
      <span className="mono-text text-[9px] text-on-surface-variant/35 text-center">{sublabel}</span>
    </div>
  );
}

// ── Schedule7d ────────────────────────────────────────────────────────────

function Schedule7d({
  schedule,
  loading,
  locale,
}: {
  schedule: WeekDay[];
  loading: boolean;
  locale: string;
}) {
  if (loading) return <div className="rounded-xl bg-surface-container h-20 animate-pulse" />;
  if (!schedule?.length) return null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid rgba(72,72,71,0.18)" }}
    >
      <div className="flex">
        {schedule.map((day) => {
          const isTraining = !day.isRest && !!day.title;
          return (
            <div
              key={day.date}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-3 px-1",
                "border-r border-outline-variant/10 last:border-r-0 transition-colors"
              )}
              style={
                day.isToday
                  ? { background: "rgba(202,253,0,0.06)" }
                  : { background: "var(--color-surface-container)" }
              }
            >
              <span
                className={cn(
                  "mono-text text-[9px] uppercase tracking-wider",
                  day.isToday ? "text-primary-container" : "text-on-surface-variant/35"
                )}
              >
                {day.dayShort}
              </span>
              <span
                className={cn(
                  "display-text text-sm font-bold leading-none",
                  day.isToday ? "text-primary-container" : "text-on-surface/70"
                )}
              >
                {day.dayNum}
              </span>
              <div className="flex min-h-[24px] flex-col items-center justify-center gap-0.5">
                {day.isCompleted ? (
                  <span className="text-[13px] leading-none text-secondary">✓</span>
                ) : isTraining ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: day.isToday
                        ? "var(--color-primary-container)"
                        : "var(--color-on-surface-variant)",
                      opacity: 0.45,
                    }}
                  />
                ) : day.isRest ? (
                  <span className="mono-text text-[8px] text-on-surface-variant/20">rest</span>
                ) : (
                  <span className="h-1 w-1 rounded-full bg-outline-variant/15" />
                )}
                {day.rpe != null && (
                  <span className="mono-text text-[8px] text-secondary/60">
                    {day.rpe}
                  </span>
                )}
              </div>
              {day.title && (
                <span className="mono-text hidden text-center text-[8px] leading-tight text-on-surface-variant/35 sm:block max-w-[44px] truncate">
                  {day.title}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── BodyMap ───────────────────────────────────────────────────────────────

type MusclePatch =
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { type: "rect"; x: number; y: number; w: number; h: number; r?: number };

const BODY_MUSCLES: Record<string, MusclePatch[]> = {
  shoulders: [
    { type: "ellipse", cx: 25, cy: 35, rx: 9, ry: 7 },
    { type: "ellipse", cx: 75, cy: 35, rx: 9, ry: 7 },
  ],
  chest: [{ type: "ellipse", cx: 50, cy: 46, rx: 15, ry: 11 }],
  back: [{ type: "rect", x: 36, y: 29, w: 28, h: 30, r: 3 }],
  biceps: [
    { type: "rect", x: 16, y: 42, w: 9, h: 20, r: 3 },
    { type: "rect", x: 75, y: 42, w: 9, h: 20, r: 3 },
  ],
  triceps: [
    { type: "rect", x: 16, y: 42, w: 9, h: 20, r: 3 },
    { type: "rect", x: 75, y: 42, w: 9, h: 20, r: 3 },
  ],
  forearms: [
    { type: "rect", x: 14, y: 62, w: 9, h: 18, r: 3 },
    { type: "rect", x: 77, y: 62, w: 9, h: 18, r: 3 },
  ],
  core: [{ type: "rect", x: 38, y: 57, w: 24, h: 22, r: 3 }],
  glutes: [{ type: "rect", x: 37, y: 82, w: 26, h: 10, r: 3 }],
  quadriceps: [
    { type: "rect", x: 37, y: 89, w: 11, h: 28, r: 3 },
    { type: "rect", x: 52, y: 89, w: 11, h: 28, r: 3 },
  ],
  hamstrings: [
    { type: "rect", x: 37, y: 89, w: 11, h: 28, r: 3 },
    { type: "rect", x: 52, y: 89, w: 11, h: 28, r: 3 },
  ],
  calves: [
    { type: "rect", x: 38, y: 120, w: 10, h: 22, r: 3 },
    { type: "rect", x: 52, y: 120, w: 10, h: 22, r: 3 },
  ],
  full_body: [{ type: "rect", x: 28, y: 26, w: 44, h: 120, r: 6 }],
};

function renderPatch(patch: MusclePatch, color: string, key: string) {
  if (patch.type === "ellipse") {
    return (
      <ellipse
        key={key}
        cx={patch.cx}
        cy={patch.cy}
        rx={patch.rx}
        ry={patch.ry}
        fill={color}
        opacity={0.55}
      />
    );
  }
  return (
    <rect
      key={key}
      x={patch.x}
      y={patch.y}
      width={patch.w}
      height={patch.h}
      rx={patch.r ?? 2}
      fill={color}
      opacity={0.55}
    />
  );
}

function BodyMap({
  recovery,
  loading,
  locale,
}: {
  recovery: DashboardData["recovery"];
  loading: boolean;
  locale: string;
}) {
  if (loading) return <div className="rounded-2xl bg-surface-container h-64 animate-pulse" />;

  const pctMap = new Map(
    recovery.map((r) => [r.muscle, r.pct ?? (r.recovered ? 100 : 0)])
  );

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{
        background: "var(--color-surface-container)",
        border: "1px solid rgba(72,72,71,0.15)",
      }}
    >
      <span className="caption">{locale === "en" ? "Recovery Map" : "Erholungskarte"}</span>

      {recovery.length === 0 ? (
        <p className="py-4 text-sm text-on-surface-variant/40">
          {locale === "en" ? "No training data yet." : "Noch keine Trainingsdaten."}
        </p>
      ) : (
        <div className="flex gap-4">
          {/* SVG silhouette */}
          <div className="shrink-0 self-start">
            <svg viewBox="0 0 100 180" width={88} height={158}>
              {/* Silhouette shapes */}
              <ellipse cx="50" cy="11" rx="9" ry="10" fill="rgba(255,255,255,0.05)" />
              <rect x="46" y="20" width="8" height="8" rx="2" fill="rgba(255,255,255,0.04)" />
              <rect x="33" y="27" width="34" height="56" rx="5" fill="rgba(255,255,255,0.04)" />
              <rect x="15" y="29" width="19" height="52" rx="5" fill="rgba(255,255,255,0.04)" />
              <rect x="66" y="29" width="19" height="52" rx="5" fill="rgba(255,255,255,0.04)" />
              <rect x="35" y="81" width="13" height="68" rx="4" fill="rgba(255,255,255,0.04)" />
              <rect x="52" y="81" width="13" height="68" rx="4" fill="rgba(255,255,255,0.04)" />

              {/* Muscle overlays */}
              {Array.from(pctMap.entries()).flatMap(([muscle, pct]) => {
                const patches = BODY_MUSCLES[muscle];
                if (!patches) return [];
                const color = muscleColor(pct);
                return patches.map((patch, i) =>
                  renderPatch(patch, color, `${muscle}-${i}`)
                );
              })}
            </svg>
          </div>

          {/* Legend */}
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto no-scrollbar" style={{ maxHeight: 160 }}>
            {recovery.map((r) => {
              const pct = r.pct ?? (r.recovered ? 100 : 0);
              const color = muscleColor(pct);
              return (
                <div key={r.muscle} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="text-xs text-on-surface/80">{r.label}</span>
                    </div>
                    <span className="mono-text text-[10px] text-on-surface-variant/45 shrink-0 ml-2">
                      {r.recovered ? "✓" : `${r.hoursLeft}h`}
                    </span>
                  </div>
                  <div className="h-0.5 overflow-hidden rounded-full bg-surface-container-high">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AICard ────────────────────────────────────────────────────────────────

function AICard({
  report,
  loading,
  locale,
}: {
  report: DashboardData["lastReport"] | null;
  loading: boolean;
  locale: string;
}) {
  if (loading) return <div className="rounded-2xl bg-surface-container h-64 animate-pulse" />;

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{
        background: "var(--color-surface-container)",
        border: "1px solid rgba(72,72,71,0.15)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, #cafd00 0%, #beee00 50%, #00e3fd 140%)",
              boxShadow: "0 0 16px -2px rgba(202,253,0,0.38)",
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 20 20"
              fill="none"
              stroke="#0e0e0e"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 14 10 4l6 10M7 11h6" />
            </svg>
            <span
              className="pulse-dot absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-container bg-secondary"
              style={{ borderColor: "var(--color-surface-container)" }}
            />
          </div>
          <div className="flex flex-col">
            <span className="text-[12.5px] font-bold leading-none text-on-surface">Atlas</span>
            <span className="mono-text text-[9.5px] text-on-surface-variant/50">AI Coach</span>
          </div>
        </div>
        {report && (
          <Link
            href="/coach"
            className="chip text-primary-container transition-opacity hover:opacity-80"
            style={{
              background: "rgba(202,253,0,0.1)",
              border: "1px solid rgba(202,253,0,0.2)",
            }}
          >
            ASK ↗
          </Link>
        )}
      </div>

      <span className="caption">{locale === "en" ? "Last Analysis" : "Letzte Analyse"}</span>

      {!report ? (
        <div className="flex flex-1 flex-col gap-2 py-2">
          <p className="text-sm text-on-surface-variant/50">
            {locale === "en" ? "No analysis yet." : "Noch keine Analyse."}
          </p>
          <Link href="/coach" className="mono-text text-xs text-primary-container hover:underline">
            {locale === "en" ? "Chat with Atlas →" : "Mit Atlas chatten →"}
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span
              className="chip text-primary-container"
              style={{
                background: "rgba(202,253,0,0.08)",
                border: "1px solid rgba(202,253,0,0.15)",
              }}
            >
              {fmtAnalysisType(report.analysisType, locale)}
            </span>
            <span className="mono-text text-[10px] text-on-surface-variant/40">
              {fmtRelativeTime(report.createdAt, locale)}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {report.highlights.slice(0, 2).map((h, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background: "var(--color-secondary)",
                    boxShadow: "0 0 8px rgba(0,227,253,0.55)",
                  }}
                />
                <span className="text-xs text-on-surface/80">{h}</span>
              </div>
            ))}
            {report.warnings.slice(0, 2).map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background: "var(--color-error)",
                    boxShadow: "0 0 8px rgba(255,115,81,0.45)",
                  }}
                />
                <span className="text-xs text-on-surface/80">{w}</span>
              </div>
            ))}
          </div>

          {report.recommendations[0] && (
            <div
              className="mt-1 rounded-lg px-3 py-2"
              style={{
                background: "rgba(0,227,253,0.06)",
                border: "1px solid rgba(0,227,253,0.12)",
              }}
            >
              <span className="mono-text text-[9.5px] text-secondary/70 mr-1.5">REC →</span>
              <span className="text-xs text-on-surface/70">{report.recommendations[0]}</span>
            </div>
          )}

          <Link
            href="/records"
            className="mono-text mt-auto text-[10px] text-on-surface-variant/40 transition-colors hover:text-primary-container"
          >
            {locale === "en" ? "All analyses →" : "Alle Analysen →"}
          </Link>
        </>
      )}
    </div>
  );
}

// ── TrainingLoadChart ─────────────────────────────────────────────────────

type LoadMode = "volume" | "duration" | "muscles";
type LoadDay = { date: string; volumeKg: number; sets: number; durationMin: number };
type MuscleDay = { date: string; [muscle: string]: number | string };

const ALL_MUSCLES = [
  "chest", "back", "shoulders", "biceps", "triceps", "forearms",
  "quadriceps", "hamstrings", "glutes", "calves", "core", "full_body",
] as const;

const MUSCLE_COLORS: Record<string, string> = {
  chest: "#60a5fa",
  back: "#34d399",
  shoulders: "#a78bfa",
  biceps: "#fb923c",
  triceps: "#f472b6",
  forearms: "#94a3b8",
  quadriceps: "#4ade80",
  hamstrings: "#facc15",
  glutes: "#f87171",
  calves: "#2dd4bf",
  core: "#c084fc",
  full_body: "#e2e8f0",
};

const MUSCLE_LABELS_SHORT_DE: Record<string, string> = {
  chest: "Brust", back: "Rücken", shoulders: "Schultern", biceps: "Bizeps",
  triceps: "Trizeps", forearms: "Unterarme", quadriceps: "Quadri",
  hamstrings: "Hamstr.", glutes: "Gesäß", calves: "Waden", core: "Core", full_body: "Ganzk.",
};
const MUSCLE_LABELS_SHORT_EN: Record<string, string> = {
  chest: "Chest", back: "Back", shoulders: "Shoulders", biceps: "Biceps",
  triceps: "Triceps", forearms: "Forearms", quadriceps: "Quads",
  hamstrings: "Hamstr.", glutes: "Glutes", calves: "Calves", core: "Core", full_body: "Full Body",
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
        <p className="mono-text text-on-surface-variant/60 mb-1.5">{dateLabel}</p>
        <div className="flex flex-col gap-0.5">
          {muscles.map((p: { name: string; value: number; fill: string }) => (
            <div key={p.name} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ background: p.fill }}
                />
                <span style={{ color: p.fill }}>{muscleLabels[p.name] ?? p.name}</span>
              </span>
              <span className="mono-text text-on-surface/80">{p.value}</span>
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
      <p className="mono-text text-on-surface-variant/60 mb-1">{dateLabel}</p>
      {mode === "volume" && (
        <>
          <p className="font-bold text-on-surface">{d.volumeKg.toLocaleString()} kg</p>
          {d.sets > 0 && (
            <p className="text-on-surface-variant/50">
              {d.sets} {locale === "en" ? "sets" : "Sätze"}
            </p>
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
    volume: locale === "en" ? "Volume" : "Volumen",
    duration: locale === "en" ? "Time" : "Zeit",
    muscles: locale === "en" ? "Muscles" : "Muskeln",
  };

  const tickFormatter = (dateStr: string, idx: number) => {
    if (idx % 5 !== 0 && idx !== loadData.length - 1) return "";
    return fmtAxisDate(dateStr, locale);
  };

  const activeMuscles = ALL_MUSCLES.filter((m) =>
    muscleData.some((d) => (d[m] as number) > 0)
  );
  const muscleLabels = locale === "en" ? MUSCLE_LABELS_SHORT_EN : MUSCLE_LABELS_SHORT_DE;

  const hasVolumeData = loadData.some((d) => d.volumeKg > 0);
  const hasDurationData = loadData.some((d) => d.durationMin > 0);
  const hasMuscleData = activeMuscles.length > 0;
  const hasAnyData =
    mode === "volume" ? hasVolumeData : mode === "duration" ? hasDurationData : hasMuscleData;

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{
        background: "var(--color-surface-container)",
        border: "1px solid rgba(72,72,71,0.15)",
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="caption">
          {locale === "en" ? "Training Load · 30d" : "Trainingsbelastung · 30T"}
        </span>
        <div className="seg">
          {(["volume", "duration", "muscles"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn(mode === m && "on")}>
              {modeLabels[m]}
            </button>
          ))}
        </div>
      </div>

      {!hasAnyData ? (
        <p className="py-6 text-center text-sm text-on-surface-variant/40">
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
                    <Bar
                      key={m}
                      dataKey={m}
                      stackId="a"
                      fill={MUSCLE_COLORS[m]}
                      radius={[0, 0, 0, 0]}
                      maxBarSize={20}
                    />
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

          {mode === "muscles" && activeMuscles.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {activeMuscles.map((m) => (
                <span key={m} className="flex items-center gap-1 text-[10px] text-on-surface-variant/55">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: MUSCLE_COLORS[m] }}
                  />
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

// ── Dashboard Page ────────────────────────────────────────────────────────

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

  // Sparkline data: last 14 days of volume
  const volumeSpark = data?.trainingLoad.slice(-14).map((d) => d.volumeKg) ?? [];
  const sessionsSpark = data?.trainingLoad.slice(-14).map((d) => (d.volumeKg > 0 ? 1 : 0)) ?? [];

  const now = new Date();

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 pb-10 fade-up">
        {/* Greeting */}
        <header className="flex flex-col gap-0.5">
          <p className="mono-text text-[11px] text-on-surface-variant/40">
            {now.toLocaleDateString(locale === "en" ? "en-GB" : "de-DE", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <h1 className="display-text text-2xl font-bold text-on-surface">
            {loading
              ? "…"
              : `${getGreeting(now.getHours(), locale)}, ${data?.user.displayName ?? ""}`}
          </h1>
        </header>

        {/* Hero: next session */}
        <HeroNextSession
          session={data?.nextSession ?? null}
          loading={loading}
          locale={locale}
          onStart={handleStartWorkout}
          starting={starting}
        />

        {/* Stats chips */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip
            label={locale === "en" ? "Sessions" : "Einheiten"}
            value={data?.recentStats.sessionsCount ?? "—"}
            sub={locale === "en" ? "last 30 days" : "letzte 30 Tage"}
            sparkData={sessionsSpark}
          />
          <StatChip
            label={locale === "en" ? "Volume" : "Volumen"}
            value={
              data?.recentStats.totalVolumeKg
                ? `${(data.recentStats.totalVolumeKg / 1000).toFixed(1)}t`
                : "—"
            }
            sub={locale === "en" ? "total, 30d" : "gesamt, 30T"}
            sparkData={volumeSpark}
          />
          <ConsistencyRing
            sessionsCount={data?.recentStats.sessionsCount ?? 0}
            label={locale === "en" ? "Consistency" : "Konstanz"}
            sublabel={locale === "en" ? "/ 20 sessions" : "/ 20 Einh."}
          />
          <StatChip
            label={locale === "en" ? "Avg RPE" : "Ø RPE"}
            value={data?.recentStats.avgRpe?.toFixed(1) ?? "—"}
            sub={locale === "en" ? "intensity" : "Intensität"}
            accent="var(--color-secondary)"
          />
        </div>

        {/* Training load chart */}
        <TrainingLoadChart
          loadData={data?.trainingLoad ?? []}
          muscleData={data?.muscleLoad ?? []}
          loading={loading}
          locale={locale}
        />

        {/* 7-day schedule strip */}
        <Schedule7d
          schedule={data?.weekSchedule ?? []}
          loading={loading}
          locale={locale}
        />

        {/* Recovery map + AI report */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BodyMap recovery={data?.recovery ?? []} loading={loading} locale={locale} />
          <AICard report={data?.lastReport ?? null} loading={loading} locale={locale} />
        </div>
      </div>
    </div>
  );
}
