import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import {
  workoutSessions, workoutSets, workoutExerciseSummary,
  muscleGroupLoadLog, aiAnalysisReports, scheduledEvents,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { estimated1rm } from "@/lib/utils/1rm";
import { parseI18n } from "@/lib/utils/i18n";
import { getDefaultModel } from "@/lib/ai/provider-registry";
import { generateObject, generateText } from "ai";

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

const LOAD_LABELS: Record<string, string> = {
  light: "leicht", moderate: "moderat", heavy: "schwer",
  very_heavy: "sehr schwer", maximal: "maximal",
};

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
        name: names.de || names.en || "Übung",
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
        const e = estimated1rm(s.weightKg, s.repsCompleted);
        if (best1rm == null || e > best1rm) best1rm = e;
      }
    }

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
      previousEstimated1rm: null,
      performanceDeltaPct: null,
      createdAt: now,
    });
  }

  const sessionRpeAvg = rpeValues.length
    ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length
    : null;
  const muscleGroupsTrained = Array.from(muscleGroupsSet);

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

    const exerciseContext = exerciseSummaries.map((e) => {
      let line = `- ${e.name}: ${e.totalReps} Wdh, ${e.totalVolume.toFixed(1)} kg Volumen`;
      if (e.maxWeight) line += `, max ${e.maxWeight} kg`;
      if (e.avgRpe != null) line += `, ⌀ RPE ${e.avgRpe.toFixed(1)}`;
      if (e.best1rm) line += `, est. 1RM ${e.best1rm} kg`;
      return line;
    }).join("\n");

    const systemPrompt = `Du bist Atlas, ein wissenschaftlich fundierter Krafttraining-Coach.
Analysiere die Trainingseinheit und liefere strukturiertes Feedback auf Deutsch. Sei präzise und umsetzbar.
Antworte NUR mit einem JSON-Objekt.`;

    const userPrompt = `TRAINING: ${workoutSession.title}
Dauer: ${Math.round(durationSeconds / 60)} min | Volumen: ${totalVolumeKg.toFixed(1)} kg | Sätze: ${totalSets} | Wdh: ${totalReps}
${sessionRpeAvg != null ? `⌀ RPE: ${sessionRpeAvg.toFixed(1)}` : ""}
${perceivedLoad ? `Belastung: ${LOAD_LABELS[perceivedLoad]}` : ""}
${satisfactionRating ? `Zufriedenheit: ${satisfactionRating}/5` : ""}
${feedbackText ? `Feedback: ${feedbackText}` : ""}

Muskelgruppen: ${muscleGroupsTrained.join(", ")}

Übungen:
${exerciseContext}

Erstelle eine Analyse mit highlights, warnings, recommendations, plateauDetectedExercises, overloadDetectedMuscles, recoveryEstimates (Muskel→Stunden), nextSessionSuggestions.`;

    const result = await generateObject({
      model,
      schema: analysisSchema,
      system: systemPrompt,
      prompt: userPrompt,
    }).catch(async () => {
      const text = await generateText({ model, system: systemPrompt, prompt: userPrompt });
      const m = text.text.match(/\{[\s\S]*\}/);
      if (m) {
        const p = analysisSchema.safeParse(JSON.parse(m[0]));
        if (p.success) return { object: p.data };
      }
      return null;
    });

    if (result) aiAnalysis = result.object;

    if (aiAnalysis) {
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
    }
  } catch (err) {
    console.error("AI analysis failed:", err);
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
