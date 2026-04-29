import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import type { db as Db } from "@/db";
import { exercises, workoutSessions, workoutSets } from "@/db/schema";
import type { MuscleGroup } from "./landmarks";

/**
 * A set "counts as a work set" for volume tracking when it meets all of:
 *  - was actually performed (outcome != "skipped")
 *  - has weight & at least 5 reps (warmups/short feeler sets excluded)
 *  - either has no RPE (user didn't log) or RPE >= 6 (above warmup intensity)
 *
 * Secondary muscle groups receive 0.5x credit, matching the standard
 * "indirect work" convention used by Israetel/Helms.
 */
const MIN_WORK_SET_REPS = 5;
const MIN_WORK_SET_RPE = 6;
const SECONDARY_FACTOR = 0.5;

export type SetForVolume = {
  outcome: string | null;
  weightKg: number | null;
  repsCompleted: number | null;
  rpe: number | null;
  primaryMuscleGroup: MuscleGroup;
  /** Parsed JSON array from exercises.secondaryMuscleGroups, or empty. */
  secondaryMuscleGroups: MuscleGroup[];
};

export function isWorkSet(s: SetForVolume): boolean {
  if (s.outcome === "skipped") return false;
  if (!s.weightKg || !s.repsCompleted) return false;
  if (s.repsCompleted < MIN_WORK_SET_REPS) return false;
  if (s.rpe != null && s.rpe < MIN_WORK_SET_RPE) return false;
  return true;
}

/**
 * Pure aggregation: given the week's sets (already filtered to one user and
 * one weekStart…weekEnd window upstream), returns weighted set counts per
 * muscle group. Primary = 1.0, secondary = 0.5.
 *
 * The result is rounded to one decimal — half-sets are common and meaningful
 * (e.g. bench press contributes 0.5 sets to triceps), but more precision than
 * 0.1 is noise.
 */
export function aggregateWeeklyVolume(sets: SetForVolume[]): Map<MuscleGroup, number> {
  const totals = new Map<MuscleGroup, number>();
  for (const s of sets) {
    if (!isWorkSet(s)) continue;
    totals.set(s.primaryMuscleGroup, (totals.get(s.primaryMuscleGroup) ?? 0) + 1);
    for (const sec of s.secondaryMuscleGroups) {
      totals.set(sec, (totals.get(sec) ?? 0) + SECONDARY_FACTOR);
    }
  }
  for (const [k, v] of totals) totals.set(k, Math.round(v * 10) / 10);
  return totals;
}

function parseSecondaryMuscleGroups(json: string | null): MuscleGroup[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is MuscleGroup => typeof v === "string");
  } catch {
    return [];
  }
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Loads all completed-session sets in [weekStart, weekStart+6] for the user
 * and aggregates them by muscle group with primary/secondary weighting.
 */
export async function computeWeeklyVolume(
  database: typeof Db,
  userId: string,
  weekStart: string,
): Promise<Map<MuscleGroup, number>> {
  const weekEnd = addDays(weekStart, 6);

  const rows = await database
    .select({
      outcome: workoutSets.outcome,
      weightKg: workoutSets.weightKg,
      repsCompleted: workoutSets.repsCompleted,
      rpe: workoutSets.rpe,
      primaryMuscleGroup: exercises.primaryMuscleGroup,
      secondaryMuscleGroups: exercises.secondaryMuscleGroups,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .innerJoin(exercises, eq(workoutSets.exerciseId, exercises.id))
    .where(and(
      eq(workoutSessions.userId, userId),
      isNotNull(workoutSessions.completedAt),
      gte(workoutSessions.startedAt, weekStart),
      lte(workoutSessions.startedAt, `${weekEnd}T23:59:59.999Z`),
    ));

  const sets: SetForVolume[] = rows.map((r) => ({
    outcome: r.outcome,
    weightKg: r.weightKg,
    repsCompleted: r.repsCompleted,
    rpe: r.rpe,
    primaryMuscleGroup: r.primaryMuscleGroup as MuscleGroup,
    secondaryMuscleGroups: parseSecondaryMuscleGroups(r.secondaryMuscleGroups),
  }));

  return aggregateWeeklyVolume(sets);
}

/**
 * Same as `computeWeeklyVolume` but for an arbitrary muscle-group subset.
 * Returns 0 for groups with no work sets, so callers can iterate without
 * checking for `undefined`.
 */
export async function computeWeeklyVolumeFor(
  database: typeof Db,
  userId: string,
  weekStart: string,
  muscleGroups: MuscleGroup[],
): Promise<Map<MuscleGroup, number>> {
  if (muscleGroups.length === 0) return new Map();

  const weekEnd = addDays(weekStart, 6);

  const rows = await database
    .select({
      outcome: workoutSets.outcome,
      weightKg: workoutSets.weightKg,
      repsCompleted: workoutSets.repsCompleted,
      rpe: workoutSets.rpe,
      primaryMuscleGroup: exercises.primaryMuscleGroup,
      secondaryMuscleGroups: exercises.secondaryMuscleGroups,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .innerJoin(exercises, eq(workoutSets.exerciseId, exercises.id))
    .where(and(
      eq(workoutSessions.userId, userId),
      isNotNull(workoutSessions.completedAt),
      gte(workoutSessions.startedAt, weekStart),
      lte(workoutSessions.startedAt, `${weekEnd}T23:59:59.999Z`),
      inArray(exercises.primaryMuscleGroup, muscleGroups),
    ));

  const sets: SetForVolume[] = rows.map((r) => ({
    outcome: r.outcome,
    weightKg: r.weightKg,
    repsCompleted: r.repsCompleted,
    rpe: r.rpe,
    primaryMuscleGroup: r.primaryMuscleGroup as MuscleGroup,
    secondaryMuscleGroups: parseSecondaryMuscleGroups(r.secondaryMuscleGroups),
  }));

  const totals = aggregateWeeklyVolume(sets);
  for (const g of muscleGroups) {
    if (!totals.has(g)) totals.set(g, 0);
  }
  return totals;
}
