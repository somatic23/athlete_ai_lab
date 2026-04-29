import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { db as Db } from "@/db";
import { progressionSnapshots, workoutExerciseSummary, workoutSessions } from "@/db/schema";

export type TrendDirection = "up" | "plateau" | "down";

const UP_THRESHOLD_PCT = 1.5;
const DOWN_THRESHOLD_PCT = -2.0;
const TREND_LOOKBACK_WEEKS = 3;
/**
 * If no snapshot exists exactly TREND_LOOKBACK_WEEKS ago, walk back up to this
 * many additional weeks to find one. Avoids treating training breaks as a
 * plateau (would otherwise trigger false-positive plateau-deloads after gaps).
 */
const BASELINE_FALLBACK_WEEKS = 3;
const MAX_WEEKS_IN_TREND = 12;

/** Returns ISO date (YYYY-MM-DD) for the Monday of the week that contains the given ISO date. */
export function weekStartOf(isoDate: string): string {
  const d = new Date(isoDate);
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function classifyTrend(currentAvg1rm: number | null, baselineAvg1rm: number | null): TrendDirection | null {
  if (currentAvg1rm == null || baselineAvg1rm == null || baselineAvg1rm === 0) return null;
  const deltaPct = ((currentAvg1rm - baselineAvg1rm) / baselineAvg1rm) * 100;
  if (deltaPct >= UP_THRESHOLD_PCT) return "up";
  if (deltaPct <= DOWN_THRESHOLD_PCT) return "down";
  return "plateau";
}

export type SnapshotForTrend = {
  weekStart: string;
  avg1rm: number | null;
  trendDirection: TrendDirection | null;
  weeksInTrend: number | null;
};

export type TrendUpdate = {
  direction: TrendDirection | null;
  weeksInTrend: number | null;
};

/**
 * Pure trend derivation. Given prior snapshots (asc by weekStart), the current
 * weekStart, and the current week's avg1rm, returns the direction + streak.
 *
 * Baseline lookup walks back from `weekStart - TREND_LOOKBACK_WEEKS` up to
 * BASELINE_FALLBACK_WEEKS further to tolerate training gaps. If no usable
 * baseline is found, direction is null and weeksInTrend is null (no streak).
 */
export function deriveTrendUpdate(
  recentSnapshots: SnapshotForTrend[],
  weekStart: string,
  avg1rm: number | null,
): TrendUpdate {
  const baselineWeekStart = addDays(weekStart, -TREND_LOOKBACK_WEEKS * 7);
  const baselineMinWeekStart = addDays(weekStart, -(TREND_LOOKBACK_WEEKS + BASELINE_FALLBACK_WEEKS) * 7);
  const baseline = recentSnapshots
    .filter((s) =>
      s.weekStart <= baselineWeekStart &&
      s.weekStart >= baselineMinWeekStart &&
      s.avg1rm != null,
    )
    .pop();
  const direction = classifyTrend(avg1rm, baseline?.avg1rm ?? null);

  if (direction == null) return { direction: null, weeksInTrend: null };

  const lastSnapshot = recentSnapshots
    .filter((s) => s.weekStart < weekStart)
    .pop();
  let weeksInTrend = 1;
  if (lastSnapshot?.trendDirection === direction && lastSnapshot.weeksInTrend != null) {
    weeksInTrend = Math.min(lastSnapshot.weeksInTrend + 1, MAX_WEEKS_IN_TREND);
  }
  return { direction, weeksInTrend };
}

/**
 * Aggregate this week's avg 1RM and total volume for (userId, exerciseId), then
 * compare to the snapshot 3 weeks earlier to derive a trend direction. Updates
 * weeksInTrend by extending the previous week's run if the direction matches.
 *
 * Idempotent within a week (upsert via select-then-update-or-insert because
 * SQLite needs the unique index to be present — see migration 0008).
 */
export async function upsertWeeklySnapshot(
  database: typeof Db,
  userId: string,
  exerciseId: string,
  weekStart: string,
): Promise<void> {
  const weekEnd = addDays(weekStart, 6);

  const summaries = await database
    .select({
      estimated1rm: workoutExerciseSummary.estimated1rm,
      totalVolumeKg: workoutExerciseSummary.totalVolumeKg,
    })
    .from(workoutExerciseSummary)
    .innerJoin(workoutSessions, eq(workoutExerciseSummary.sessionId, workoutSessions.id))
    .where(and(
      eq(workoutSessions.userId, userId),
      eq(workoutExerciseSummary.exerciseId, exerciseId),
      isNotNull(workoutSessions.completedAt),
      gte(workoutSessions.startedAt, weekStart),
      lte(workoutSessions.startedAt, `${weekEnd}T23:59:59.999Z`),
    ));

  if (summaries.length === 0) return;

  const e1rms = summaries.map((s) => s.estimated1rm).filter((v): v is number => v != null);
  const avg1rm = e1rms.length ? e1rms.reduce((a, b) => a + b, 0) / e1rms.length : null;
  const totalVolume = summaries.reduce((acc, s) => acc + (s.totalVolumeKg ?? 0), 0);

  const recentSnapshots = await database
    .select()
    .from(progressionSnapshots)
    .where(and(
      eq(progressionSnapshots.userId, userId),
      eq(progressionSnapshots.exerciseId, exerciseId),
    ))
    .orderBy(asc(progressionSnapshots.weekStart))
    .limit(50);

  const { direction, weeksInTrend } = deriveTrendUpdate(
    recentSnapshots.map((s) => ({
      weekStart: s.weekStart,
      avg1rm: s.avg1rm,
      trendDirection: (s.trendDirection as TrendDirection | null) ?? null,
      weeksInTrend: s.weeksInTrend,
    })),
    weekStart,
    avg1rm,
  );

  const existing = recentSnapshots.find((s) => s.weekStart === weekStart);
  if (existing) {
    await database.update(progressionSnapshots)
      .set({ avg1rm, totalVolume, trendDirection: direction, weeksInTrend })
      .where(eq(progressionSnapshots.id, existing.id));
  } else {
    await database.insert(progressionSnapshots).values({
      id: randomUUID(),
      userId,
      exerciseId,
      weekStart,
      avg1rm,
      totalVolume,
      trendDirection: direction,
      weeksInTrend,
    });
  }
}

export type LatestTrend = {
  direction: TrendDirection | null;
  weeksInTrend: number | null;
};

/** Returns the trend from the most recent snapshot for the given exercise, or nulls. */
export async function getLatestTrend(
  database: typeof Db,
  userId: string,
  exerciseId: string,
): Promise<LatestTrend> {
  const rows = await database
    .select({
      trendDirection: progressionSnapshots.trendDirection,
      weeksInTrend: progressionSnapshots.weeksInTrend,
    })
    .from(progressionSnapshots)
    .where(and(
      eq(progressionSnapshots.userId, userId),
      eq(progressionSnapshots.exerciseId, exerciseId),
    ))
    .orderBy(asc(progressionSnapshots.weekStart));

  const latest = rows[rows.length - 1];
  return {
    direction: (latest?.trendDirection as TrendDirection | null) ?? null,
    weeksInTrend: latest?.weeksInTrend ?? null,
  };
}
