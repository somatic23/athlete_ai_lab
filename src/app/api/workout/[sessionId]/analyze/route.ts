import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { users, workoutSessions, workoutSets, aiAnalysisReports } from "@/db/schema";
import { and, eq, ne, inArray, desc, isNotNull } from "drizzle-orm";
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

// POST /api/workout/[sessionId]/analyze — manually trigger AI analysis
export async function POST(_req: NextRequest, { params }: Params) {
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
  if (!workoutSession.completedAt) return NextResponse.json({ error: "Workout not completed" }, { status: 409 });

  const existingReport = await db.query.aiAnalysisReports.findFirst({
    where: and(
      eq(aiAnalysisReports.sessionId, sessionId),
      eq(aiAnalysisReports.analysisType, "post_workout")
    ),
  });
  if (existingReport) return NextResponse.json({ error: "Analysis already exists" }, { status: 409 });

  const userRow = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { preferredLocale: true },
  });
  const locale = (userRow?.preferredLocale ?? "de") as "de" | "en";

  const sets = await db.query.workoutSets.findMany({
    where: eq(workoutSets.sessionId, sessionId),
    with: { exercise: true },
    orderBy: (s, { asc }) => [asc(s.exerciseId), asc(s.setNumber)],
  });

  type ExData = { exerciseId: string; name: string; muscleGroup: string; sets: typeof sets };
  const exerciseMap = new Map<string, ExData>();

  for (const s of sets) {
    if (!exerciseMap.has(s.exerciseId)) {
      const names = parseI18n(s.exercise?.nameI18n ?? "{}");
      exerciseMap.set(s.exerciseId, {
        exerciseId: s.exerciseId,
        name: (locale === "en" ? names.en : names.de) || names.de || names.en || "Exercise",
        muscleGroup: s.exercise?.primaryMuscleGroup ?? "full_body",
        sets: [],
      });
    }
    exerciseMap.get(s.exerciseId)!.sets.push(s);
  }

  const muscleGroupsSet = new Set<string>();
  for (const [, ex] of exerciseMap) muscleGroupsSet.add(ex.muscleGroup);

  // ── Historical data: last 5 sessions per exercise ─────────────────────
  const exerciseIds = Array.from(exerciseMap.keys());
  const HISTORY_LIMIT = 5;

  type HistoricalSetRow = {
    sessionId: string;
    exerciseId: string;
    weightKg: number | null;
    repsCompleted: number | null;
    rpe: number | null;
    outcome: string;
    sessionDate: string;
  };

  let historicalRows: HistoricalSetRow[] = [];
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

  // Group historical rows: exerciseId → sessionId → rows (keep newest HISTORY_LIMIT sessions)
  const historyMap = new Map<string, Map<string, HistoricalSetRow[]>>();
  for (const row of historicalRows) {
    if (!historyMap.has(row.exerciseId)) historyMap.set(row.exerciseId, new Map());
    const bySession = historyMap.get(row.exerciseId)!;
    if (!bySession.has(row.sessionId)) {
      if (bySession.size >= HISTORY_LIMIT) continue; // already have enough sessions
      bySession.set(row.sessionId, []);
    }
    bySession.get(row.sessionId)!.push(row);
  }

  // ── Build ExerciseAnalysisData array ──────────────────────────────────
  const exerciseAnalysisData: ExerciseAnalysisData[] = [];

  for (const [, ex] of exerciseMap) {
    const doneSets = ex.sets.filter((s) => s.outcome !== "skipped");
    const volume = doneSets.reduce((acc, s) => acc + (s.weightKg ?? 0) * (s.repsCompleted ?? 0), 0);
    const maxWeight = doneSets.reduce((max, s) => Math.max(max, s.weightKg ?? 0), 0);
    const rpes = doneSets.filter((s) => s.rpe != null).map((s) => s.rpe!);
    const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
    let best1rm: number | null = null;
    for (const s of doneSets) {
      if (s.weightKg && s.repsCompleted) {
        const e = estimated1rm(s.weightKg, s.repsCompleted);
        if (best1rm == null || e > best1rm) best1rm = e;
      }
    }

    const history: ExerciseSessionHistory[] = [];
    const bySession = historyMap.get(ex.exerciseId);
    if (bySession) {
      for (const [, sessionRows] of bySession) {
        const completedRows = sessionRows.filter((r) => r.outcome !== "skipped");
        const hVol = completedRows.reduce((acc, r) => acc + (r.weightKg ?? 0) * (r.repsCompleted ?? 0), 0);
        const hMax = completedRows.reduce((max, r) => Math.max(max, r.weightKg ?? 0), 0);
        const hReps = completedRows.reduce((acc, r) => acc + (r.repsCompleted ?? 0), 0);
        let hEst1rm: number | null = null;
        for (const r of completedRows) {
          if (r.weightKg && r.repsCompleted) {
            const e = estimated1rm(r.weightKg, r.repsCompleted);
            if (hEst1rm == null || e > hEst1rm) hEst1rm = e;
          }
        }
        history.push({
          date: sessionRows[0].sessionDate,
          totalVolumeKg: hVol,
          maxWeightKg: hMax,
          totalReps: hReps,
          setCount: completedRows.length,
          estimated1rm: hEst1rm,
        });
      }
    }

    exerciseAnalysisData.push({
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      currentSets: ex.sets.map((s) => ({
        setNumber: s.setNumber,
        weightKg: s.weightKg,
        repsCompleted: s.repsCompleted,
        rpe: s.rpe,
        outcome: s.outcome as ExerciseAnalysisData["currentSets"][number]["outcome"],
        notes: s.notes,
      })),
      totalVolume: volume,
      maxWeight,
      avgRpe,
      best1rm,
      history,
    });
  }

  const muscleGroupsTrained = workoutSession.muscleGroupsTrained
    ? (() => { try { return JSON.parse(workoutSession.muscleGroupsTrained); } catch { return Array.from(muscleGroupsSet); } })()
    : Array.from(muscleGroupsSet);

  const now = new Date().toISOString();

  try {
    const model = await getDefaultModel();
    const systemPrompt = buildAnalysisSystemPrompt(locale);
    const userPrompt = buildAnalysisUserPrompt(
      workoutSession.title,
      workoutSession.durationSeconds ?? 0,
      workoutSession.totalVolumeKg ?? 0,
      workoutSession.totalSets ?? 0,
      workoutSession.totalReps ?? 0,
      workoutSession.sessionRpeAvg ?? null,
      workoutSession.perceivedLoad ?? undefined,
      workoutSession.satisfactionRating ?? undefined,
      workoutSession.feedbackText ?? undefined,
      muscleGroupsTrained,
      exerciseAnalysisData,
      locale
    );

    await logger.info("ai_analysis:manual:prompt", {
      userId: session.user.id,
      metadata: { sessionId, system: systemPrompt, prompt: userPrompt },
    });

    let result: { object: Analysis } | null = null;
    try {
      result = await generateObject({ model, schema: analysisSchema, system: systemPrompt, prompt: userPrompt });
      await logger.debug("ai_analysis:manual:raw_response", {
        userId: session.user.id,
        metadata: { sessionId, response: result.object },
      });
    } catch (genObjErr) {
      await logger.warn("ai_analysis:manual:generateObject_failed", {
        userId: session.user.id,
        metadata: { sessionId, error: String(genObjErr) },
      });
      try {
        const textResult = await generateText({ model, system: systemPrompt, prompt: userPrompt });
        await logger.debug("ai_analysis:manual:raw_response", {
          userId: session.user.id,
          metadata: { sessionId, rawText: textResult.text },
        });
        const jsonObj = extractJsonObject(textResult.text);
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
        }
      } catch (fallbackErr) {
        await logger.error("ai_analysis:manual:fallback_failed", {
          userId: session.user.id,
          metadata: { sessionId, error: String(fallbackErr) },
        });
      }
    }

    if (!result) {
      return NextResponse.json({ error: "AI analysis failed" }, { status: 502 });
    }

    const aiAnalysis = result.object;

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
      newPrs: JSON.stringify([]),
      createdAt: now,
    });

    await db.update(workoutSessions)
      .set({ aiAnalysisCompleted: true })
      .where(eq(workoutSessions.id, sessionId));

    return NextResponse.json({ aiAnalysis });
  } catch (err) {
    await logger.error("ai_analysis:manual:failed", {
      userId: session.user.id,
      metadata: { sessionId, error: String(err) },
    });
    return NextResponse.json({ error: "AI analysis failed" }, { status: 502 });
  }
}
