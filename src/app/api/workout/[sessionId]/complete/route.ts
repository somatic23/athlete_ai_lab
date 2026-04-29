import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import {
  users, workoutSessions, workoutSets, workoutExerciseSummary,
  muscleGroupLoadLog, aiAnalysisReports, scheduledEvents, personalRecords,
  trainingDays,
} from "@/db/schema";
import { detectPrs, type DetectedPr } from "@/lib/coaching/pr-detection";
import { upsertWeeklySnapshot, weekStartOf } from "@/lib/coaching/snapshots";
import { generateSuggestionForDay } from "@/lib/coaching/generate-suggestion";
import { and, eq, ne, gte, inArray, desc, isNotNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { estimated1rm } from "@/lib/utils/1rm";
import { parseI18n } from "@/lib/utils/i18n";
import { getDefaultModel } from "@/lib/ai/provider-registry";
import { buildAnalysisSystemPrompt, buildAnalysisUserPrompt, type ExerciseAnalysisData, type ExerciseSessionHistory } from "@/lib/ai/system-prompts";
import { generateObject, generateText } from "ai";
import { logger } from "@/lib/utils/logger";
import { extractJsonObject } from "@/lib/utils/extract-json";

type Params = { params: Promise<{ sessionId: string }> };

const completeSchema = z.object({
  durationSeconds: z.number().int().min(0),
  perceivedLoad: z.enum(["light", "moderate", "heavy", "very_heavy", "maximal"]).optional(),
  satisfactionRating: z.number().int().min(1).max(5).optional(),
  feedbackText: z.string().max(1000).optional(),
});

const analysisSchema = z.object({
  highlights: z.array(z.string()),
  warnings: z.array(z.string()),
  recommendations: z.array(z.string()),
  plateauDetectedExercises: z.array(z.string()),
  overloadDetectedMuscles: z.array(z.string()),
  recoveryEstimates: z.record(z.string(), z.number()),
  nextSessionSuggestions: z.array(z.string()),
});

type Analysis = z.infer<typeof analysisSchema>;

// POST /api/workout/[sessionId]/complete
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = await params;

  const workoutSession = await db.query.workoutSessions.findFirst({
    where: and(
      eq(workoutSessions.id, sessionId),
      eq(workoutSessions.userId, session.user.id)
    ),
  });
  if (!workoutSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (workoutSession.completedAt) return NextResponse.json({ error: "Already completed" }, { status: 409 });

  const userRow = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { preferredLocale: true },
  });
  const locale = (userRow?.preferredLocale ?? "de") as "de" | "en";

  const body = await req.json();
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }

  const { durationSeconds, perceivedLoad, satisfactionRating, feedbackText } = parsed.data;
  const now = new Date().toISOString();
  const todayStr = now.slice(0, 10);

  // ── Load all sets ───────────────────────────────────────────────────
  const sets = await db.query.workoutSets.findMany({
    where: eq(workoutSets.sessionId, sessionId),
    with: { exercise: true },
  });

  // ── Aggregate per exercise ─────────────────────────────────────────
  type ExData = {
    exerciseId: string; name: string; primaryMuscle: string;
    sets: typeof sets;
  };
  const exerciseMap = new Map<string, ExData>();

  for (const s of sets) {
    if (!exerciseMap.has(s.exerciseId)) {
      const names = parseI18n(s.exercise?.nameI18n ?? "{}");
      exerciseMap.set(s.exerciseId, {
        exerciseId: s.exerciseId,
        name: (locale === "en" ? names.en : names.de) || names.de || names.en || "Exercise",
        primaryMuscle: s.exercise?.primaryMuscleGroup ?? "full_body",
        sets: [],
      });
    }
    exerciseMap.get(s.exerciseId)!.sets.push(s);
  }

  let totalVolumeKg = 0;
  let totalSets = 0;
  let totalReps = 0;
  const rpeValues: number[] = [];
  const muscleGroupsSet = new Set<string>();

  type ExSummary = {
    exerciseId: string; name: string; primaryMuscle: string;
    totalVolume: number; maxWeight: number; setCount: number;
    totalReps: number; avgRpe: number | null; best1rm: number | null;
  };
  const exerciseSummaries: ExSummary[] = [];

  for (const [, ex] of exerciseMap) {
    muscleGroupsSet.add(ex.primaryMuscle);
    const doneSets = ex.sets.filter((s) => s.outcome !== "skipped");

    const volume = doneSets.reduce((acc, s) => acc + (s.weightKg ?? 0) * (s.repsCompleted ?? 0), 0);
    const maxWeight = doneSets.reduce((max, s) => Math.max(max, s.weightKg ?? 0), 0);
    const repCount = doneSets.reduce((acc, s) => acc + (s.repsCompleted ?? 0), 0);
    const rpes = doneSets.filter((s) => s.rpe != null).map((s) => s.rpe!);
    const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;

    let best1rm: number | null = null;
    for (const s of doneSets) {
      if (s.weightKg && s.repsCompleted) {
        const e = estimated1rm(s.weightKg, s.repsCompleted, s.rpe);
        if (best1rm == null || e > best1rm) best1rm = e;
      }
    }

    const prev = await db
      .select({ estimated1rm: workoutExerciseSummary.estimated1rm })
      .from(workoutExerciseSummary)
      .innerJoin(workoutSessions, eq(workoutExerciseSummary.sessionId, workoutSessions.id))
      .where(and(
        eq(workoutSessions.userId, session.user.id),
        eq(workoutExerciseSummary.exerciseId, ex.exerciseId),
        isNotNull(workoutSessions.completedAt),
        ne(workoutSessions.id, sessionId),
      ))
      .orderBy(desc(workoutSessions.startedAt))
      .limit(1);

    const previousE1rm = prev[0]?.estimated1rm ?? null;
    const deltaPct = (previousE1rm && best1rm)
      ? ((best1rm - previousE1rm) / previousE1rm) * 100
      : null;

    totalVolumeKg += volume;
    totalSets += doneSets.length;
    totalReps += repCount;
    if (avgRpe != null) rpeValues.push(avgRpe);

    exerciseSummaries.push({
      exerciseId: ex.exerciseId, name: ex.name, primaryMuscle: ex.primaryMuscle,
      totalVolume: volume, maxWeight, setCount: doneSets.length,
      totalReps: repCount, avgRpe, best1rm,
    });

    await db.insert(workoutExerciseSummary).values({
      id: randomUUID(),
      sessionId,
      exerciseId: ex.exerciseId,
      totalVolumeKg: volume || null,
      maxWeightKg: maxWeight || null,
      totalReps: repCount || null,
      avgRpe,
      estimated1rm: best1rm,
      previousEstimated1rm: previousE1rm,
      performanceDeltaPct: deltaPct,
      createdAt: now,
    });
  }

  const sessionRpeAvg = rpeValues.length
    ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length
    : null;
  const muscleGroupsTrained = Array.from(muscleGroupsSet);

  // ── Weekly progression snapshots ───────────────────────────────────
  try {
    const week = weekStartOf(now);
    for (const ex of exerciseSummaries) {
      await upsertWeeklySnapshot(db, session.user.id, ex.exerciseId, week);
    }
    await logger.info("progression:snapshot:upsert", {
      userId: session.user.id,
      metadata: { sessionId, week, count: exerciseSummaries.length },
    });
  } catch (err) {
    await logger.warn("progression:snapshot:failed", {
      userId: session.user.id,
      metadata: { sessionId, error: String(err) },
    });
  }

  // ── Personal records ───────────────────────────────────────────────
  let detectedPrs: DetectedPr[] = [];
  try {
    detectedPrs = await detectPrs(db, session.user.id, exerciseSummaries, sets);
    for (const pr of detectedPrs) {
      await db.insert(personalRecords).values({
        id: randomUUID(),
        userId: session.user.id,
        exerciseId: pr.exerciseId,
        recordType: pr.recordType,
        weightKg: pr.weightKg,
        reps: pr.reps,
        estimated1rm: pr.estimated1rm,
        previousRecordValue: pr.previousValue,
        achievedAt: now,
        workoutSetId: pr.workoutSetId,
        createdAt: now,
      });
    }
    if (detectedPrs.length > 0) {
      await logger.info("progression:pr:detected", {
        userId: session.user.id,
        metadata: { sessionId, count: detectedPrs.length, prs: detectedPrs },
      });
    }
  } catch (err) {
    await logger.warn("progression:pr:failed", {
      userId: session.user.id,
      metadata: { sessionId, error: String(err) },
    });
  }

  // ── Muscle group load log ──────────────────────────────────────────
  for (const muscle of muscleGroupsTrained) {
    const muscleSummaries = exerciseSummaries.filter((e) => e.primaryMuscle === muscle);
    const muscleVolume = muscleSummaries.reduce((acc, e) => acc + e.totalVolume, 0);
    const muscleSets = muscleSummaries.reduce((acc, e) => acc + e.setCount, 0);
    const recoveryHours = muscleSets >= 4 ? 48 : muscleSets >= 2 ? 36 : 24;
    const recoveredAt = new Date(Date.now() + recoveryHours * 3_600_000).toISOString();

    await db.insert(muscleGroupLoadLog).values({
      id: randomUUID(),
      userId: session.user.id,
      date: todayStr,
      muscleGroup: muscle as typeof muscleGroupLoadLog.$inferInsert["muscleGroup"],
      totalVolumeKg: muscleVolume || null,
      totalSets: muscleSets || null,
      estimatedRecoveryHours: recoveryHours,
      fullyRecoveredAt: recoveredAt,
      createdAt: now,
    });
  }

  // ── Mark session complete ──────────────────────────────────────────
  await db.update(workoutSessions).set({
    completedAt: now,
    durationSeconds,
    perceivedLoad: perceivedLoad ?? null,
    satisfactionRating: satisfactionRating ?? null,
    feedbackText: feedbackText ?? null,
    totalVolumeKg,
    totalSets,
    totalReps,
    muscleGroupsTrained: JSON.stringify(muscleGroupsTrained),
    sessionRpeAvg,
  }).where(eq(workoutSessions.id, sessionId));

  // ── Mark linked calendar event as completed ────────────────────────
  if (workoutSession.scheduledEventId) {
    await db.update(scheduledEvents)
      .set({ isCompleted: true, updatedAt: now })
      .where(and(
        eq(scheduledEvents.id, workoutSession.scheduledEventId),
        eq(scheduledEvents.userId, session.user.id)
      ));
  }

  // ── AI Analysis ────────────────────────────────────────────────────
  let aiAnalysis: Analysis | null = null;

  try {
    const model = await getDefaultModel();

    // ── Fetch historical sets for progression context ────────────────
    const HISTORY_LIMIT = 5;
    const exerciseIds = exerciseSummaries.map((e) => e.exerciseId);

    type HistRow = {
      sessionId: string; exerciseId: string;
      weightKg: number | null; repsCompleted: number | null;
      rpe: number | null; outcome: string; sessionDate: string;
    };

    let historicalRows: HistRow[] = [];
    if (exerciseIds.length > 0) {
      historicalRows = await db
        .select({
          sessionId: workoutSets.sessionId,
          exerciseId: workoutSets.exerciseId,
          weightKg: workoutSets.weightKg,
          repsCompleted: workoutSets.repsCompleted,
          rpe: workoutSets.rpe,
          outcome: workoutSets.outcome,
          sessionDate: workoutSessions.startedAt,
        })
        .from(workoutSets)
        .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
        .where(
          and(
            inArray(workoutSets.exerciseId, exerciseIds),
            ne(workoutSets.sessionId, sessionId),
            eq(workoutSessions.userId, session.user.id),
            isNotNull(workoutSessions.completedAt)
          )
        )
        .orderBy(desc(workoutSessions.startedAt));
    }

    const historyMap = new Map<string, Map<string, HistRow[]>>();
    for (const row of historicalRows) {
      if (!historyMap.has(row.exerciseId)) historyMap.set(row.exerciseId, new Map());
      const bySession = historyMap.get(row.exerciseId)!;
      if (!bySession.has(row.sessionId)) {
        if (bySession.size >= HISTORY_LIMIT) continue;
        bySession.set(row.sessionId, []);
      }
      bySession.get(row.sessionId)!.push(row);
    }

    const exerciseAnalysisData: ExerciseAnalysisData[] = exerciseSummaries.map((e) => {
      const history: ExerciseSessionHistory[] = [];
      const bySession = historyMap.get(e.exerciseId);
      if (bySession) {
        for (const [, sessionRows] of bySession) {
          const completedRows = sessionRows.filter((r) => r.outcome !== "skipped");
          const hVol = completedRows.reduce((acc, r) => acc + (r.weightKg ?? 0) * (r.repsCompleted ?? 0), 0);
          const hMax = completedRows.reduce((max, r) => Math.max(max, r.weightKg ?? 0), 0);
          const hReps = completedRows.reduce((acc, r) => acc + (r.repsCompleted ?? 0), 0);
          let hEst1rm: number | null = null;
          for (const r of completedRows) {
            if (r.weightKg && r.repsCompleted) {
              const est = estimated1rm(r.weightKg, r.repsCompleted, r.rpe);
              if (hEst1rm == null || est > hEst1rm) hEst1rm = est;
            }
          }
          history.push({ date: sessionRows[0].sessionDate, totalVolumeKg: hVol, maxWeightKg: hMax, totalReps: hReps, setCount: completedRows.length, estimated1rm: hEst1rm });
        }
      }

      const exSets = sets.filter((s) => s.exerciseId === e.exerciseId);
      return {
        name: e.name,
        muscleGroup: e.primaryMuscle,
        currentSets: exSets.map((s) => ({
          setNumber: s.setNumber,
          weightKg: s.weightKg,
          repsCompleted: s.repsCompleted,
          rpe: s.rpe,
          outcome: s.outcome as ExerciseAnalysisData["currentSets"][number]["outcome"],
          notes: s.notes,
        })),
        totalVolume: e.totalVolume,
        maxWeight: e.maxWeight,
        avgRpe: e.avgRpe,
        best1rm: e.best1rm,
        history,
      };
    });

    const systemPrompt = buildAnalysisSystemPrompt(locale);
    const userPrompt = buildAnalysisUserPrompt(
      workoutSession.title,
      durationSeconds,
      totalVolumeKg,
      totalSets,
      totalReps,
      sessionRpeAvg,
      perceivedLoad,
      satisfactionRating,
      feedbackText,
      muscleGroupsTrained,
      exerciseAnalysisData,
      locale
    );

    await logger.info("ai_analysis:post_workout:prompt", {
      userId: session.user.id,
      metadata: { sessionId, system: systemPrompt, prompt: userPrompt },
    });

    let result: { object: Analysis } | null = null;
    try {
      result = await generateObject({ model, schema: analysisSchema, system: systemPrompt, prompt: userPrompt });
      await logger.debug("ai_analysis:post_workout:raw_response", {
        userId: session.user.id,
        metadata: { sessionId, response: result.object },
      });
    } catch (genObjErr) {
      await logger.warn("ai_analysis:post_workout:generateObject_failed", {
        userId: session.user.id,
        metadata: { sessionId, error: String(genObjErr) },
      });
      try {
        const textResult = await generateText({ model, system: systemPrompt, prompt: userPrompt });
        const rawText = textResult.text;
        await logger.debug("ai_analysis:post_workout:raw_response", {
          userId: session.user.id,
          metadata: { sessionId, rawText },
        });
        const jsonObj = extractJsonObject(rawText);
        if (jsonObj) {
          const lenient = z.object({
            highlights:               z.array(z.string()).optional().default([]),
            warnings:                 z.array(z.string()).optional().default([]),
            recommendations:          z.array(z.string()).optional().default([]),
            plateauDetectedExercises: z.array(z.string()).optional().default([]),
            overloadDetectedMuscles:  z.array(z.string()).optional().default([]),
            recoveryEstimates:        z.record(z.string(), z.number()).optional().default({}),
            nextSessionSuggestions:   z.array(z.string()).optional().default([]),
          });
          const p = lenient.safeParse(jsonObj);
          if (p.success) result = { object: p.data as Analysis };
          else await logger.warn("ai_analysis:post_workout:schema_mismatch", {
            userId: session.user.id,
            metadata: { sessionId, issues: p.error.issues.map((i) => i.message) },
          });
        } else {
          await logger.warn("ai_analysis:post_workout:no_json_in_response", {
            userId: session.user.id,
            metadata: { sessionId, rawText: rawText.slice(0, 500) },
          });
        }
      } catch (fallbackErr) {
        await logger.error("ai_analysis:post_workout:fallback_failed", {
          userId: session.user.id,
          metadata: { sessionId, error: String(fallbackErr) },
        });
      }
    }

    if (result) aiAnalysis = result.object;

    if (aiAnalysis) {
      await logger.info("ai_analysis:post_workout:response", {
        userId: session.user.id,
        metadata: { sessionId, response: aiAnalysis },
      });

      await db.insert(aiAnalysisReports).values({
        id: randomUUID(),
        sessionId,
        userId: session.user.id,
        analysisType: "post_workout",
        report: JSON.stringify(aiAnalysis),
        highlights: JSON.stringify(aiAnalysis.highlights),
        warnings: JSON.stringify(aiAnalysis.warnings),
        recommendations: JSON.stringify(aiAnalysis.recommendations),
        plateauDetectedExercises: JSON.stringify(aiAnalysis.plateauDetectedExercises),
        overloadDetectedMuscles: JSON.stringify(aiAnalysis.overloadDetectedMuscles),
        newPrs: JSON.stringify(detectedPrs.map((p) => ({
          exerciseId: p.exerciseId,
          recordType: p.recordType,
          weightKg: p.weightKg,
          reps: p.reps,
        }))),
        createdAt: now,
      });

      await db.update(workoutSessions)
        .set({ aiAnalysisCompleted: true })
        .where(eq(workoutSessions.id, sessionId));
    }
  } catch (err) {
    console.error("AI analysis failed:", err);
    await logger.error("ai_analysis:post_workout:failed", {
      userId: session.user.id,
      metadata: { sessionId, error: String(err) },
    });
  }

  // ── Auto-trigger suggestion for next planned occurrence ────────────
  try {
    if (workoutSession.trainingDayId) {
      const todayDate = todayStr;

      // 1. Try the next future scheduled occurrence of this trainingDay
      const nextScheduled = await db
        .select({ trainingDayId: scheduledEvents.trainingDayId })
        .from(scheduledEvents)
        .where(and(
          eq(scheduledEvents.userId, session.user.id),
          eq(scheduledEvents.trainingDayId, workoutSession.trainingDayId),
          eq(scheduledEvents.isCompleted, false),
          gte(scheduledEvents.scheduledDate, todayDate),
        ))
        .orderBy(scheduledEvents.scheduledDate)
        .limit(1);

      let targetDayId: string | null = nextScheduled[0]?.trainingDayId ?? null;

      // 2. Fallback: same trainingDay (same id) if no future schedule — keeps the cycle
      if (!targetDayId) targetDayId = workoutSession.trainingDayId;

      // Skip if a suggestion is already pending (don't overwrite manual or earlier auto)
      const targetDay = await db.query.trainingDays.findFirst({
        where: eq(trainingDays.id, targetDayId),
        columns: { id: true, pendingAiSuggestion: true },
      });

      if (targetDay && !targetDay.pendingAiSuggestion) {
        const result = await generateSuggestionForDay(db, session.user.id, targetDayId, locale, { source: "auto" });
        await logger.info("progression:auto_trigger:complete", {
          userId: session.user.id,
          metadata: { sessionId, targetDayId, ok: result.ok, error: result.ok ? null : result.error },
        });
      } else {
        await logger.info("progression:auto_trigger:skipped", {
          userId: session.user.id,
          metadata: { sessionId, targetDayId, reason: targetDay ? "already_pending" : "day_missing" },
        });
      }
    }
  } catch (err) {
    await logger.warn("progression:auto_trigger:failed", {
      userId: session.user.id,
      metadata: { sessionId, error: String(err) },
    });
  }

  return NextResponse.json({
    sessionId,
    totalVolumeKg,
    totalSets,
    totalReps,
    muscleGroupsTrained,
    aiAnalysis,
  });
}
