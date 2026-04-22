import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { users, workoutSessions, workoutSets, aiAnalysisReports } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { estimated1rm } from "@/lib/utils/1rm";
import { parseI18n } from "@/lib/utils/i18n";
import { getDefaultModel } from "@/lib/ai/provider-registry";
import { buildAnalysisSystemPrompt, buildAnalysisUserPrompt } from "@/lib/ai/system-prompts";
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
  });

  type ExData = { exerciseId: string; name: string; sets: typeof sets };
  const exerciseMap = new Map<string, ExData>();

  for (const s of sets) {
    if (!exerciseMap.has(s.exerciseId)) {
      const names = parseI18n(s.exercise?.nameI18n ?? "{}");
      exerciseMap.set(s.exerciseId, {
        exerciseId: s.exerciseId,
        name: (locale === "en" ? names.en : names.de) || names.de || names.en || "Exercise",
        sets: [],
      });
    }
    exerciseMap.get(s.exerciseId)!.sets.push(s);
  }

  type ExSummary = {
    name: string; totalVolume: number; maxWeight: number;
    totalReps: number; avgRpe: number | null; best1rm: number | null;
  };
  const exerciseSummaries: ExSummary[] = [];
  const muscleGroupsSet = new Set<string>();

  for (const [, ex] of exerciseMap) {
    const primaryMuscle = ex.sets[0]?.exercise?.primaryMuscleGroup ?? "full_body";
    muscleGroupsSet.add(primaryMuscle);
    const doneSets = ex.sets.filter((s) => s.outcome !== "skipped");
    const volume = doneSets.reduce((acc, s) => acc + (s.weightKg ?? 0) * (s.repsCompleted ?? 0), 0);
    const maxWeight = doneSets.reduce((max, s) => Math.max(max, s.weightKg ?? 0), 0);
    const repCount = doneSets.reduce((acc, s) => acc + (s.repsCompleted ?? 0), 0);
    const rpes = doneSets.filter((s) => s.rpe != null).map((s) => s.rpe!);
    const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
    let best1rm: number | null = null;
    for (const s of doneSets) {
      if (s.weightKg && s.repsCompleted) {
        const e = estimated1rm(s.weightKg, s.repsCompleted);
        if (best1rm == null || e > best1rm) best1rm = e;
      }
    }
    exerciseSummaries.push({ name: ex.name, totalVolume: volume, maxWeight, totalReps: repCount, avgRpe, best1rm });
  }

  const exerciseContext = exerciseSummaries.map((e) => {
    let line = `- ${e.name}: ${e.totalReps} Wdh, ${e.totalVolume.toFixed(1)} kg Volumen`;
    if (e.maxWeight) line += `, max ${e.maxWeight} kg`;
    if (e.avgRpe != null) line += `, ⌀ RPE ${e.avgRpe.toFixed(1)}`;
    if (e.best1rm) line += `, est. 1RM ${e.best1rm} kg`;
    return line;
  }).join("\n");

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
      exerciseContext,
      locale
    );

    await logger.info("ai_analysis:manual:prompt", {
      userId: session.user.id,
      metadata: { sessionId, system: systemPrompt, prompt: userPrompt },
    });

    let result: { object: Analysis } | null = null;
    try {
      result = await generateObject({ model, schema: analysisSchema, system: systemPrompt, prompt: userPrompt });
    } catch (genObjErr) {
      await logger.warn("ai_analysis:manual:generateObject_failed", {
        userId: session.user.id,
        metadata: { sessionId, error: String(genObjErr) },
      });
      try {
        const textResult = await generateText({ model, system: systemPrompt, prompt: userPrompt });
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
