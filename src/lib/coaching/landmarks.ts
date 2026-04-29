import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { db as Db } from "@/db";
import { muscleGroupLandmarks } from "@/db/schema";

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "quadriceps"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core"
  | "full_body";

export type Landmarks = {
  mv: number;
  mev: number;
  mav: number;
  mrv: number;
};

/**
 * Conservative Israetel-style beginner defaults — sets per muscle group per week.
 * Values intentionally lean low so the engine doesn't push too aggressively
 * before the adaptive tuning phase (Phase 3) has data to personalise them.
 *
 * `full_body` is a catch-all classification on exercises that don't have a
 * specific primary muscle. It's seeded with zeros so volume rules never fire
 * for it (the volume signal would be meaningless on a cross-cutting bucket).
 */
export const DEFAULT_LANDMARKS: Record<MuscleGroup, Landmarks> = {
  chest:      { mv: 4, mev: 8,  mav: 14, mrv: 22 },
  back:       { mv: 6, mev: 10, mav: 16, mrv: 25 },
  shoulders:  { mv: 4, mev: 8,  mav: 16, mrv: 26 },
  biceps:     { mv: 4, mev: 8,  mav: 14, mrv: 26 },
  triceps:    { mv: 4, mev: 6,  mav: 12, mrv: 18 },
  forearms:   { mv: 2, mev: 4,  mav: 10, mrv: 20 },
  quadriceps: { mv: 6, mev: 8,  mav: 14, mrv: 20 },
  hamstrings: { mv: 4, mev: 6,  mav: 12, mrv: 20 },
  glutes:     { mv: 0, mev: 4,  mav: 12, mrv: 16 },
  calves:     { mv: 6, mev: 8,  mav: 14, mrv: 22 },
  core:       { mv: 0, mev: 0,  mav: 16, mrv: 25 },
  full_body:  { mv: 0, mev: 0,  mav: 0,  mrv: 0  },
};

export const ALL_MUSCLE_GROUPS = Object.keys(DEFAULT_LANDMARKS) as MuscleGroup[];

export type VolumeStatus =
  | "below_mev"
  | "in_mav"
  | "above_mav"
  | "above_mrv"
  | "disabled"; // landmarks all zero (e.g. full_body) — never trigger volume rules

/**
 * Pure classification of a weekly set count against landmarks.
 *  - `disabled` when MAV+MRV are zero (catch-all bucket).
 *  - `below_mev` when sets < MEV — engine should add a set.
 *  - `in_mav`    when sets in [MEV, MAV] — normal progression.
 *  - `above_mav` when sets in (MAV, MRV] — progress weight only, hold sets.
 *  - `above_mrv` when sets > MRV — forced deload (drop sets).
 */
export function classifyVolumeStatus(weekSets: number, l: Landmarks): VolumeStatus {
  if (l.mav === 0 && l.mrv === 0) return "disabled";
  if (weekSets > l.mrv) return "above_mrv";
  if (weekSets > l.mav) return "above_mav";
  if (weekSets < l.mev) return "below_mev";
  return "in_mav";
}

/**
 * Inserts default landmark rows for every muscle group the user is missing.
 * Idempotent: existing rows are untouched (so manual/adapted overrides survive).
 *
 * Call this at user signup and lazily before any volume calculation, so newly
 * added muscle groups (or new users on an existing DB) always have defaults.
 */
export async function seedLandmarksForUser(
  database: typeof Db,
  userId: string,
): Promise<void> {
  const existing = await database
    .select({ muscleGroup: muscleGroupLandmarks.muscleGroup })
    .from(muscleGroupLandmarks)
    .where(eq(muscleGroupLandmarks.userId, userId));

  const have = new Set(existing.map((r) => r.muscleGroup));
  const missing = ALL_MUSCLE_GROUPS.filter((g) => !have.has(g));
  if (missing.length === 0) return;

  const now = new Date().toISOString();
  await database.insert(muscleGroupLandmarks).values(
    missing.map((muscleGroup) => ({
      id: randomUUID(),
      userId,
      muscleGroup,
      ...DEFAULT_LANDMARKS[muscleGroup],
      source: "default" as const,
      updatedAt: now,
    })),
  );
}

/**
 * Fetches landmarks for the requested muscle groups, lazily seeding any that
 * are missing. Returns a Map keyed by muscle group for O(1) lookup.
 */
export async function getLandmarksForUser(
  database: typeof Db,
  userId: string,
  muscleGroups: MuscleGroup[],
): Promise<Map<MuscleGroup, Landmarks>> {
  if (muscleGroups.length === 0) return new Map();

  let rows = await database
    .select({
      muscleGroup: muscleGroupLandmarks.muscleGroup,
      mv: muscleGroupLandmarks.mv,
      mev: muscleGroupLandmarks.mev,
      mav: muscleGroupLandmarks.mav,
      mrv: muscleGroupLandmarks.mrv,
    })
    .from(muscleGroupLandmarks)
    .where(and(
      eq(muscleGroupLandmarks.userId, userId),
      inArray(muscleGroupLandmarks.muscleGroup, muscleGroups),
    ));

  const have = new Set(rows.map((r) => r.muscleGroup));
  const missing = muscleGroups.filter((g) => !have.has(g));
  if (missing.length > 0) {
    await seedLandmarksForUser(database, userId);
    rows = await database
      .select({
        muscleGroup: muscleGroupLandmarks.muscleGroup,
        mv: muscleGroupLandmarks.mv,
        mev: muscleGroupLandmarks.mev,
        mav: muscleGroupLandmarks.mav,
        mrv: muscleGroupLandmarks.mrv,
      })
      .from(muscleGroupLandmarks)
      .where(and(
        eq(muscleGroupLandmarks.userId, userId),
        inArray(muscleGroupLandmarks.muscleGroup, muscleGroups),
      ));
  }

  const out = new Map<MuscleGroup, Landmarks>();
  for (const r of rows) {
    out.set(r.muscleGroup as MuscleGroup, {
      mv: r.mv, mev: r.mev, mav: r.mav, mrv: r.mrv,
    });
  }
  return out;
}
