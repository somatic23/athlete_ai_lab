import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { generateObject, generateText } from "ai";
import type { db as Db } from "@/db";
import {
  trainingDays, workoutSessions, workoutExerciseSummary, muscleGroupLoadLog,
} from "@/db/schema";
import { parseI18n } from "@/lib/utils/i18n";
import { logger } from "@/lib/utils/logger";
import { extractJsonObject } from "@/lib/utils/extract-json";
import { getDefaultModel } from "@/lib/ai/provider-registry";
import {
  buildCoachingSuggestionSystemPrompt,
  buildReasoningUserPrompt,
  type EngineDecisionForPrompt,
} from "@/lib/ai/coaching-suggestion-prompts";
import { aiReasonsSchema, lenientAiReasonsSchema, type CoachingSuggestion } from "@/lib/ai/coaching-suggestion-schema";
import { decide, isCompoundExercise, renderReason, type ProgressionInputs } from "@/lib/coaching/progression-engine";
import { getLatestTrend } from "@/lib/coaching/snapshots";

export type GenerateOptions = {
  /** When true, the resulting suggestion is tagged as auto-generated (post-workout trigger). */
  source?: "manual" | "auto";
};

export type GenerateResult =
  | { ok: true; suggestion: CoachingSuggestion }
  | { ok: false; error: string };

/**
 * Generates a coaching suggestion for a training day.
 *
 * Flow:
 *   1. Load current plan, performance data, recovery, trend
 *   2. Run deterministic engine to decide numbers per exercise
 *   3. Ask LLM ONLY for changeReason/notes/rationale text
 *   4. Fallback to i18n templates if LLM fails or is unconfigured
 *   5. Persist to trainingDays.pendingAiSuggestion
 */
export async function generateSuggestionForDay(
  database: typeof Db,
  userId: string,
  dayId: string,
  locale: "de" | "en",
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const source = options.source ?? "manual";

  const day = await database.query.trainingDays.findFirst({
    where: eq(trainingDays.id, dayId),
    with: {
      exercises: {
        orderBy: (e, { asc }) => [asc(e.sortOrder)],
        with: { exercise: true },
      },
    },
  });

  if (!day) return { ok: false, error: "Day not found" };
  if (day.exercises.length === 0) return { ok: false, error: "No exercises on this day" };

  const exerciseIds = day.exercises.map((e) => e.exerciseId);

  // ── Recent performance per exercise (last 3 sessions, 90-day window) ──
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3_600_000).toISOString();

  const perfRows = await database
    .select({
      exerciseId: workoutExerciseSummary.exerciseId,
      sessionDate: workoutSessions.startedAt,
      maxWeightKg: workoutExerciseSummary.maxWeightKg,
      totalReps: workoutExerciseSummary.totalReps,
      avgRpe: workoutExerciseSummary.avgRpe,
      estimated1rm: workoutExerciseSummary.estimated1rm,
      performanceDeltaPct: workoutExerciseSummary.performanceDeltaPct,
    })
    .from(workoutExerciseSummary)
    .innerJoin(workoutSessions, eq(workoutExerciseSummary.sessionId, workoutSessions.id))
    .where(and(
      eq(workoutSessions.userId, userId),
      isNotNull(workoutSessions.completedAt),
      gte(workoutSessions.startedAt, ninetyDaysAgo),
      inArray(workoutExerciseSummary.exerciseId, exerciseIds),
    ))
    .orderBy(desc(workoutSessions.startedAt));

  // Map per exerciseId, keep newest first, limit 5
  const histByExercise = new Map<string, typeof perfRows>();
  for (const r of perfRows) {
    if (!histByExercise.has(r.exerciseId)) histByExercise.set(r.exerciseId, []);
    const bucket = histByExercise.get(r.exerciseId)!;
    if (bucket.length < 5) bucket.push(r);
  }

  // ── Recovery status ────────────────────────────────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString().slice(0, 10);
  const loadRows = await database
    .select()
    .from(muscleGroupLoadLog)
    .where(and(
      eq(muscleGroupLoadLog.userId, userId),
      gte(muscleGroupLoadLog.date, sevenDaysAgo),
    ))
    .orderBy(desc(muscleGroupLoadLog.date));

  const latestByMuscle = new Map<string, typeof loadRows[number]>();
  for (const row of loadRows) {
    if (!latestByMuscle.has(row.muscleGroup)) latestByMuscle.set(row.muscleGroup, row);
  }

  // ── Engine decisions per exercise ──────────────────────────────────
  const decisionsForPrompt: EngineDecisionForPrompt[] = [];
  const enginePerExercise = new Map<string, ReturnType<typeof decide>>();

  for (const planEx of day.exercises) {
    const names = parseI18n(planEx.exercise?.nameI18n ?? "{}");
    const exerciseName = (locale === "en" ? names.en : names.de) || names.de || names.en || "Exercise";
    const muscleGroup = planEx.exercise?.primaryMuscleGroup ?? "full_body";
    const recovery = latestByMuscle.get(muscleGroup);
    const trend = await getLatestTrend(database, userId, planEx.exerciseId);

    const inputs: ProgressionInputs = {
      exercise: {
        id: planEx.exerciseId,
        primaryMuscleGroup: muscleGroup,
        isCompound: isCompoundExercise(exerciseName, muscleGroup),
      },
      current: {
        sets: planEx.sets,
        repsMin: planEx.repsMin,
        repsMax: planEx.repsMax ?? null,
        suggestedWeightKg: planEx.suggestedWeightKg ?? null,
      },
      history: (histByExercise.get(planEx.exerciseId) ?? []).map((r) => ({
        sessionDate: r.sessionDate.slice(0, 10),
        maxWeightKg: r.maxWeightKg ?? null,
        totalReps: r.totalReps ?? null,
        avgRpe: r.avgRpe ?? null,
        estimated1rm: r.estimated1rm ?? null,
        performanceDeltaPct: r.performanceDeltaPct ?? null,
      })),
      recovery: { fullyRecoveredAt: recovery?.fullyRecoveredAt ?? null },
      trend: { direction: trend.direction, weeksInTrend: trend.weeksInTrend },
    };

    const decision = decide(inputs);
    enginePerExercise.set(planEx.exerciseId, decision);

    decisionsForPrompt.push({
      exerciseId: planEx.exerciseId,
      exerciseName,
      changeType: decision.changeType,
      fromSets: planEx.sets,
      fromRepsMin: planEx.repsMin,
      fromRepsMax: planEx.repsMax ?? null,
      fromWeightKg: planEx.suggestedWeightKg ?? null,
      toSets: decision.sets,
      toRepsMin: decision.repsMin,
      toRepsMax: decision.repsMax,
      toWeightKg: decision.suggestedWeightKg,
      reasonKey: decision.reasonKey,
      reasonInputs: decision.reasonInputs,
    });

    await logger.info("progression:engine:decision", {
      userId,
      metadata: {
        dayId,
        exerciseId: planEx.exerciseId,
        decision,
      },
    });
  }

  // ── Build LLM-only justification (with fallback) ───────────────────
  const reasonsByExercise = new Map<string, { changeReason: string; notes: string }>();
  let rationale = "";

  let model;
  try {
    model = await getDefaultModel();
  } catch (err) {
    await logger.warn("ai:coaching_suggestion:no_model", {
      userId,
      metadata: { dayId, error: String(err) },
    });
  }

  if (model) {
    const systemPrompt = buildCoachingSuggestionSystemPrompt(locale);
    const userPrompt = buildReasoningUserPrompt(day.title, day.focus ?? null, decisionsForPrompt, locale);

    await logger.info("ai:coaching_suggestion:prompt", {
      userId,
      metadata: { dayId, system: systemPrompt, prompt: userPrompt },
    });

    type AiResult = { object: { exercises: { exerciseId: string; changeReason: string; notes?: string }[]; rationale: string } };
    let result: AiResult | null = null;

    try {
      result = await generateObject({ model, schema: aiReasonsSchema, system: systemPrompt, prompt: userPrompt }) as AiResult;
    } catch (genObjErr) {
      await logger.warn("ai:coaching_suggestion:generateObject_failed", {
        userId,
        metadata: { dayId, error: String(genObjErr) },
      });
      try {
        const textResult = await generateText({ model, system: systemPrompt, prompt: userPrompt });
        const jsonObj = extractJsonObject(textResult.text);
        if (jsonObj) {
          const parsed = lenientAiReasonsSchema.safeParse(jsonObj);
          if (parsed.success) result = { object: parsed.data as AiResult["object"] };
        }
      } catch (fallbackErr) {
        await logger.error("ai:coaching_suggestion:fallback_failed", {
          userId,
          metadata: { dayId, error: String(fallbackErr) },
        });
      }
    }

    if (result) {
      for (const r of result.object.exercises) {
        reasonsByExercise.set(r.exerciseId, {
          changeReason: r.changeReason ?? "",
          notes: r.notes ?? "",
        });
      }
      rationale = result.object.rationale ?? "";
    }
  }

  // Fallback for any exercise the LLM didn't return — use i18n template
  for (const d of decisionsForPrompt) {
    if (!reasonsByExercise.has(d.exerciseId)) {
      reasonsByExercise.set(d.exerciseId, {
        changeReason: renderReason(
          d.reasonKey as Parameters<typeof renderReason>[0],
          d.reasonInputs,
          locale,
        ),
        notes: "",
      });
    }
  }

  if (!rationale) {
    rationale = locale === "en"
      ? "Adjustments derived from recent performance and recovery."
      : "Anpassungen basierend auf letzter Leistung und Erholung.";
  }

  // ── Compose final CoachingSuggestion (DB-format) ───────────────────
  const now = new Date().toISOString();
  const suggestion: CoachingSuggestion = {
    exercises: decisionsForPrompt.map((d) => {
      const reason = reasonsByExercise.get(d.exerciseId)!;
      return {
        exerciseId: d.exerciseId,
        exerciseName: d.exerciseName,
        sets: d.toSets,
        repsMin: d.toRepsMin,
        repsMax: d.toRepsMax,
        suggestedWeightKg: d.toWeightKg,
        notes: reason.notes,
        changeType: d.changeType,
        changeReason: reason.changeReason,
      };
    }),
    rationale,
    generatedAt: now,
    source,
  };

  await database.update(trainingDays)
    .set({ pendingAiSuggestion: JSON.stringify(suggestion) })
    .where(eq(trainingDays.id, dayId));

  await logger.info("ai:coaching_suggestion:response", {
    userId,
    metadata: { dayId, source, suggestion },
  });

  return { ok: true, suggestion };
}
