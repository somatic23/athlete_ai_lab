import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/db";
import { personalRecords, workoutSets } from "@/db/schema";
import { estimated1rm } from "@/lib/utils/1rm";

export type DetectedPr = {
  exerciseId: string;
  recordType: "1rm" | "volume" | "reps";
  weightKg: number;
  reps: number;
  estimated1rm: number | null;
  previousValue: number | null;
  workoutSetId: string | null;
};

type SetRow = typeof workoutSets.$inferSelect;

type ExerciseSummary = {
  exerciseId: string;
  best1rm: number | null;
};

/**
 * Detect personal records in a freshly completed session by comparing against
 * existing personal_records rows. Returns rows that beat the prior best for
 * each (userId, exerciseId, recordType) bucket.
 *
 * Three record types:
 *  - 1rm:    highest estimated_1rm in the session
 *  - volume: highest single-set volume (weightKg * repsCompleted)
 *  - reps:   most reps performed at the same weight bucket (reps PR is per weightKg)
 */
export async function detectPrs(
  database: typeof Db,
  userId: string,
  exerciseSummaries: ExerciseSummary[],
  sets: SetRow[],
): Promise<DetectedPr[]> {
  const detected: DetectedPr[] = [];

  // Group sets by exercise (only completed/partial — skipped excluded)
  const setsByExercise = new Map<string, SetRow[]>();
  for (const s of sets) {
    if (s.outcome === "skipped") continue;
    if (!s.weightKg || !s.repsCompleted) continue;
    if (!setsByExercise.has(s.exerciseId)) setsByExercise.set(s.exerciseId, []);
    setsByExercise.get(s.exerciseId)!.push(s);
  }

  for (const ex of exerciseSummaries) {
    const exSets = setsByExercise.get(ex.exerciseId) ?? [];
    if (exSets.length === 0) continue;

    const prevRecords = await database
      .select({
        recordType: personalRecords.recordType,
        weightKg: personalRecords.weightKg,
        reps: personalRecords.reps,
        estimated1rm: personalRecords.estimated1rm,
      })
      .from(personalRecords)
      .where(and(
        eq(personalRecords.userId, userId),
        eq(personalRecords.exerciseId, ex.exerciseId),
      ));

    const prevBest1rm = prevRecords
      .filter((r) => r.recordType === "1rm")
      .reduce<number>((max, r) => Math.max(max, r.estimated1rm ?? 0), 0);

    const prevBestVolume = prevRecords
      .filter((r) => r.recordType === "volume")
      .reduce<number>((max, r) => Math.max(max, (r.weightKg ?? 0) * (r.reps ?? 0)), 0);

    // reps PRs are per weight bucket: map weight -> max reps ever achieved
    const prevRepsByWeight = new Map<number, number>();
    for (const r of prevRecords) {
      if (r.recordType !== "reps") continue;
      const w = r.weightKg;
      const cur = prevRepsByWeight.get(w) ?? 0;
      if (r.reps > cur) prevRepsByWeight.set(w, r.reps);
    }

    // 1RM candidate
    let best1rmSet: SetRow | null = null;
    let best1rmValue = 0;
    for (const s of exSets) {
      const e = estimated1rm(s.weightKg!, s.repsCompleted!, s.rpe);
      if (e > best1rmValue) {
        best1rmValue = e;
        best1rmSet = s;
      }
    }
    if (best1rmSet && best1rmValue > prevBest1rm + 0.05) {
      detected.push({
        exerciseId: ex.exerciseId,
        recordType: "1rm",
        weightKg: best1rmSet.weightKg!,
        reps: best1rmSet.repsCompleted!,
        estimated1rm: best1rmValue,
        previousValue: prevBest1rm > 0 ? prevBest1rm : null,
        workoutSetId: best1rmSet.id,
      });
    }

    // Volume candidate
    let bestVolSet: SetRow | null = null;
    let bestVolValue = 0;
    for (const s of exSets) {
      const v = s.weightKg! * s.repsCompleted!;
      if (v > bestVolValue) {
        bestVolValue = v;
        bestVolSet = s;
      }
    }
    if (bestVolSet && bestVolValue > prevBestVolume + 0.05) {
      detected.push({
        exerciseId: ex.exerciseId,
        recordType: "volume",
        weightKg: bestVolSet.weightKg!,
        reps: bestVolSet.repsCompleted!,
        estimated1rm: estimated1rm(bestVolSet.weightKg!, bestVolSet.repsCompleted!, bestVolSet.rpe),
        previousValue: prevBestVolume > 0 ? prevBestVolume : null,
        workoutSetId: bestVolSet.id,
      });
    }

    // Reps PRs per weight bucket
    const bestRepsByWeight = new Map<number, SetRow>();
    for (const s of exSets) {
      const w = s.weightKg!;
      const cur = bestRepsByWeight.get(w);
      if (!cur || s.repsCompleted! > cur.repsCompleted!) {
        bestRepsByWeight.set(w, s);
      }
    }
    for (const [weight, set] of bestRepsByWeight) {
      const prev = prevRepsByWeight.get(weight) ?? 0;
      if (set.repsCompleted! > prev) {
        detected.push({
          exerciseId: ex.exerciseId,
          recordType: "reps",
          weightKg: weight,
          reps: set.repsCompleted!,
          estimated1rm: estimated1rm(weight, set.repsCompleted!, set.rpe),
          previousValue: prev > 0 ? prev : null,
          workoutSetId: set.id,
        });
      }
    }
  }

  return detected;
}
