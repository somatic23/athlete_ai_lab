import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import {
  users, workoutSessions, workoutExerciseSummary, exercises,
  muscleGroupLoadLog, aiAnalysisReports,
} from "@/db/schema";
import { and, eq, gte, desc, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { parseI18n } from "@/lib/utils/i18n";
import { getDefaultModel } from "@/lib/ai/provider-registry";
import {
  buildPeriodAnalysisSystemPrompt,
  buildPeriodAnalysisUserPrompt,
} from "@/lib/ai/system-prompts";
import { generateObject, generateText } from "ai";
import { logger } from "@/lib/utils/logger";
import { extractJsonObject } from "@/lib/utils/extract-json";

const bodySchema = z.object({
  type: z.enum(["weekly", "monthly"]),
});

// Strict schema used with generateObject (model must return exact shape)
const analysisSchema = z.object({
  highlights: z.array(z.string()),
  warnings: z.array(z.string()),
  recommendations: z.array(z.string()),
  plateauDetectedExercises: z.array(z.string()),
  overloadDetectedMuscles: z.array(z.string()),
  recoveryEstimates: z.record(z.string(), z.number()),
  nextSessionSuggestions: z.array(z.string()),
});

// Lenient schema used when parsing raw generateText output — all fields optional with defaults
const lenientAnalysisSchema = z.object({
  highlights:               z.array(z.string()).optional().default([]),
  warnings:                 z.array(z.string()).optional().default([]),
  recommendations:          z.array(z.string()).optional().default([]),
  plateauDetectedExercises: z.array(z.string()).optional().default([]),
  overloadDetectedMuscles:  z.array(z.string()).optional().default([]),
  recoveryEstimates:        z.record(z.string(), z.number()).optional().default({}),
  nextSessionSuggestions:   z.array(z.string()).optional().default([]),
});


const MUSCLE_LABELS_DE: Record<string, string> = {
  chest: "Brust", back: "Rücken", shoulders: "Schultern",
  biceps: "Bizeps", triceps: "Trizeps", forearms: "Unterarme",
  quadriceps: "Quadrizeps", hamstrings: "Hamstrings", glutes: "Gesäß",
  calves: "Waden", core: "Core", full_body: "Ganzkörper",
};

const MUSCLE_LABELS_EN: Record<string, string> = {
  chest: "Chest", back: "Back", shoulders: "Shoulders",
  biceps: "Biceps", triceps: "Triceps", forearms: "Forearms",
  quadriceps: "Quadriceps", hamstrings: "Hamstrings", glutes: "Glutes",
  calves: "Calves", core: "Core", full_body: "Full Body",
};

// POST /api/analytics/generate
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "type must be 'weekly' or 'monthly'" }, { status: 400 });
  }
  const { type } = parsed.data;

  // Date range
  const days = type === "weekly" ? 7 : 30;
  const cutoff = new Date(Date.now() - days * 24 * 3_600_000).toISOString();
  const cutoffDate = cutoff.slice(0, 10);
  const now = new Date().toISOString();

  // Load user locale
  const userRow = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { preferredLocale: true },
  });
  const locale = (userRow?.preferredLocale ?? "de") as "de" | "en";
  const muscleLabels = locale === "en" ? MUSCLE_LABELS_EN : MUSCLE_LABELS_DE;

  // Load completed sessions in range
  const sessionRows = await db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, session.user.id),
        gte(workoutSessions.startedAt, cutoff)
      )
    )
    .orderBy(desc(workoutSessions.startedAt));

  const completedSessions = sessionRows.filter((s) => s.completedAt);

  if (completedSessions.length === 0) {
    return NextResponse.json(
      { error: locale === "en" ? "No completed sessions in the selected period." : "Keine abgeschlossenen Einheiten im Zeitraum." },
      { status: 422 }
    );
  }

  const sessionIds = completedSessions.map((s) => s.id);

  // Load exercise summaries for those sessions
  const summaryRows = await db
    .select({
      sessionId: workoutExerciseSummary.sessionId,
      exerciseId: workoutExerciseSummary.exerciseId,
      totalVolumeKg: workoutExerciseSummary.totalVolumeKg,
      maxWeightKg: workoutExerciseSummary.maxWeightKg,
      estimated1rm: workoutExerciseSummary.estimated1rm,
      nameI18n: exercises.nameI18n,
      primaryMuscleGroup: exercises.primaryMuscleGroup,
    })
    .from(workoutExerciseSummary)
    .leftJoin(exercises, eq(workoutExerciseSummary.exerciseId, exercises.id))
    .where(inArray(workoutExerciseSummary.sessionId, sessionIds));

  // Load muscle group load log for range
  const loadRows = await db
    .select()
    .from(muscleGroupLoadLog)
    .where(
      and(
        eq(muscleGroupLoadLog.userId, session.user.id),
        gte(muscleGroupLoadLog.date, cutoffDate)
      )
    );

  // Load existing post_workout reports in range for context warnings
  const priorReports = await db
    .select({ warnings: aiAnalysisReports.warnings })
    .from(aiAnalysisReports)
    .where(
      and(
        eq(aiAnalysisReports.userId, session.user.id),
        gte(aiAnalysisReports.createdAt, cutoff)
      )
    )
    .orderBy(desc(aiAnalysisReports.createdAt))
    .limit(10);

  // Collect unique warnings from prior reports
  const seenWarnings = new Set<string>();
  const existingWarnings: string[] = [];
  for (const r of priorReports) {
    let ws: string[] = [];
    try { ws = JSON.parse(r.warnings ?? "[]"); } catch {}
    for (const w of ws) {
      if (!seenWarnings.has(w)) { seenWarnings.add(w); existingWarnings.push(w); }
    }
  }

  // Build muscle volume map (aggregate from load log)
  const muscleVolumeMap: Record<string, number> = {};
  for (const row of loadRows) {
    const label = muscleLabels[row.muscleGroup] ?? row.muscleGroup;
    muscleVolumeMap[label] = (muscleVolumeMap[label] ?? 0) + (row.totalVolumeKg ?? 0);
  }

  // Build per-session summaries
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionSummaries: any[] = completedSessions.map((s) => {
    const sessionExSummaries = summaryRows.filter((r) => r.sessionId === s.id);
    const exList = sessionExSummaries.map((e) => {
      const names = parseI18n(e.nameI18n ?? "{}");
      return {
        name: (locale === "en" ? names.en : names.de) || names.de || names.en || "Exercise",
        volumeKg: e.totalVolumeKg ?? 0,
        maxWeightKg: e.maxWeightKg ?? 0,
        estimated1rm: e.estimated1rm ?? null,
      };
    });

    let muscleGroups: string[] = [];
    try { muscleGroups = JSON.parse(s.muscleGroupsTrained ?? "[]"); } catch {}

    return {
      title: s.title,
      date: s.startedAt.slice(0, 10),
      durationMin: s.durationSeconds ? Math.round(s.durationSeconds / 60) : 0,
      totalVolumeKg: s.totalVolumeKg ?? 0,
      totalSets: s.totalSets ?? 0,
      perceivedLoad: s.perceivedLoad ?? null,
      satisfactionRating: s.satisfactionRating ?? null,
      muscleGroups,
      exercises: exList,
    };
  });

  // Generate analysis via AI
  let model;
  try {
    model = await getDefaultModel();
  } catch (err) {
    console.error("No AI model configured:", err);
    return NextResponse.json(
      { error: locale === "en" ? "No AI provider configured." : "Kein AI-Provider konfiguriert." },
      { status: 503 }
    );
  }

  const systemPrompt = buildPeriodAnalysisSystemPrompt(type, locale);
  const userPrompt = buildPeriodAnalysisUserPrompt(type, sessionSummaries, muscleVolumeMap, existingWarnings, locale);

  await logger.info(`ai_analysis:${type}:prompt`, {
    userId: session.user.id,
    metadata: { type, system: systemPrompt, prompt: userPrompt, sessionCount: completedSessions.length },
  });

  type Analysis = z.infer<typeof analysisSchema>;
  let result: { object: Analysis } | null = null;
  try {
    // mode: "json" injects the schema into the prompt instead of using tool calls —
    // compatible with any model, including those without function-calling support.
    result = await generateObject({
      model,
      schema: analysisSchema,
      mode: "json",
      system: systemPrompt,
      prompt: userPrompt,
    });
  } catch (genObjErr) {
    await logger.warn(`ai_analysis:${type}:generateObject_failed`, {
      userId: session.user.id,
      metadata: { type, error: String(genObjErr) },
    });
    // Fallback: generateText + manual JSON extraction
    try {
      const textResult = await generateText({ model, system: systemPrompt, prompt: userPrompt });
      const rawText = textResult.text;

      await logger.info(`ai_analysis:${type}:generateText_raw`, {
        userId: session.user.id,
        metadata: { type, rawText: rawText.slice(0, 2000) },
      });

      // Extract the outermost JSON object (find last closing brace to avoid
      // greedy match swallowing trailing prose)
      const jsonMatch = extractJsonObject(rawText);
      if (jsonMatch) {
        const parsed = lenientAnalysisSchema.safeParse(jsonMatch);
        if (parsed.success) {
          result = { object: parsed.data as Analysis };
        } else {
          await logger.warn(`ai_analysis:${type}:schema_mismatch`, {
            userId: session.user.id,
            metadata: { type, issues: parsed.error.issues.map((i) => i.message), rawText: rawText.slice(0, 500) },
          });
        }
      } else {
        await logger.warn(`ai_analysis:${type}:no_json_in_response`, {
          userId: session.user.id,
          metadata: { type, rawText: rawText.slice(0, 500) },
        });
      }
    } catch (fallbackErr) {
      await logger.error(`ai_analysis:${type}:fallback_failed`, {
        userId: session.user.id,
        metadata: { type, error: String(fallbackErr) },
      });
    }
  }

  if (!result) {
    return NextResponse.json(
      { error: locale === "en" ? "AI analysis failed. Check provider configuration." : "AI-Analyse fehlgeschlagen. Provider-Konfiguration prüfen." },
      { status: 502 }
    );
  }

  const analysis = result.object;

  await logger.info(`ai_analysis:${type}:response`, {
    userId: session.user.id,
    metadata: { type, response: analysis },
  });
  const reportId = randomUUID();

  await db.insert(aiAnalysisReports).values({
    id: reportId,
    sessionId: null,
    userId: session.user.id,
    analysisType: type,
    report: JSON.stringify(analysis),
    highlights: JSON.stringify(analysis.highlights),
    warnings: JSON.stringify(analysis.warnings),
    recommendations: JSON.stringify(analysis.recommendations),
    plateauDetectedExercises: JSON.stringify(analysis.plateauDetectedExercises),
    overloadDetectedMuscles: JSON.stringify(analysis.overloadDetectedMuscles),
    newPrs: JSON.stringify([]),
    createdAt: now,
  });

  return NextResponse.json({
    id: reportId,
    sessionId: null,
    analysisType: type,
    createdAt: now,
    highlights: analysis.highlights,
    warnings: analysis.warnings,
    recommendations: analysis.recommendations,
    plateauDetectedExercises: analysis.plateauDetectedExercises,
    overloadDetectedMuscles: analysis.overloadDetectedMuscles,
    nextSessionSuggestions: analysis.nextSessionSuggestions ?? [],
  });
}
