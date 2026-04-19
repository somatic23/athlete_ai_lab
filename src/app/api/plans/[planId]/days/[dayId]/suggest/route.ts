import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import {
  users, trainingPlans, trainingDays, planExercises, exercises,
  workoutSessions, workoutExerciseSummary, muscleGroupLoadLog,
} from "@/db/schema";
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { parseI18n } from "@/lib/utils/i18n";
import { getDefaultModel } from "@/lib/ai/provider-registry";
import {
  buildCoachingSuggestionSystemPrompt,
  buildCoachingSuggestionUserPrompt,
  type CurrentExercise,
  type RecentPerformance,
  type RecoveryStatus,
} from "@/lib/ai/coaching-suggestion-prompts";
import {
  coachingSuggestionAiSchema,
  lenientSuggestionSchema,
  type CoachingSuggestion,
} from "@/lib/ai/coaching-suggestion-schema";
import { generateObject, generateText } from "ai";
import { logger } from "@/lib/utils/logger";
import { extractJsonObject } from "@/lib/utils/extract-json";

type Params = { params: Promise<{ planId: string; dayId: string }> };

// POST /api/plans/[planId]/days/[dayId]/suggest — Generate suggestion
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { planId, dayId } = await params;

  // Ownership check + load plan with the target day
  const plan = await db.query.trainingPlans.findFirst({
    where: and(eq(trainingPlans.id, planId), eq(trainingPlans.userId, session.user.id)),
    columns: { id: true },
    with: {
      days: {
        where: eq(trainingDays.id, dayId),
        with: {
          exercises: {
            orderBy: (e, { asc }) => [asc(e.sortOrder)],
            with: { exercise: true },
          },
        },
      },
    },
  });

  if (!plan || plan.days.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const day = plan.days[0];

  // Return cached suggestion if already generated (idempotent)
  if (day.pendingAiSuggestion) {
    try {
      return NextResponse.json({ suggestion: JSON.parse(day.pendingAiSuggestion) });
    } catch {
      // Corrupted — continue to regenerate
    }
  }

  // User locale
  const userRow = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { preferredLocale: true },
  });
  const locale = (userRow?.preferredLocale ?? "de") as "de" | "en";

  // Build current exercises list
  const exerciseIds = day.exercises.map((e) => e.exerciseId);
  const currentExercises: CurrentExercise[] = day.exercises.map((e) => {
    const names = parseI18n(e.exercise?.nameI18n ?? "{}");
    return {
      exerciseId: e.exerciseId,
      exerciseName: (locale === "en" ? names.en : names.de) || names.de || names.en || "Exercise",
      primaryMuscleGroup: e.exercise?.primaryMuscleGroup ?? "full_body",
      sets: e.sets,
      repsMin: e.repsMin,
      repsMax: e.repsMax ?? null,
      suggestedWeightKg: e.suggestedWeightKg ?? null,
      notes: e.notes ?? null,
    };
  });

  // Recent performance for these exercises (last 3 sessions for this training day)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3_600_000).toISOString();

  let recentPerformance: RecentPerformance[] = [];
  if (exerciseIds.length > 0) {
    const perfRows = await db
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
        eq(workoutSessions.userId, session.user.id),
        isNotNull(workoutSessions.completedAt),
        gte(workoutSessions.startedAt, ninetyDaysAgo),
        inArray(workoutExerciseSummary.exerciseId, exerciseIds)
      ))
      .orderBy(desc(workoutSessions.startedAt))
      .limit(exerciseIds.length * 3);

    recentPerformance = perfRows.map((r) => ({
      exerciseId: r.exerciseId,
      sessionDate: r.sessionDate.slice(0, 10),
      maxWeightKg: r.maxWeightKg ?? null,
      totalReps: r.totalReps ?? null,
      avgRpe: r.avgRpe ?? null,
      estimated1rm: r.estimated1rm ?? null,
      performanceDeltaPct: r.performanceDeltaPct ?? null,
    }));
  }

  // Recovery status for muscle groups of this day's exercises
  const muscleGroups = [...new Set(currentExercises.map((e) => e.primaryMuscleGroup))];
  const loadRows = await db
    .select()
    .from(muscleGroupLoadLog)
    .where(and(
      eq(muscleGroupLoadLog.userId, session.user.id),
      gte(muscleGroupLoadLog.date, sevenDaysAgo.slice(0, 10))
    ))
    .orderBy(desc(muscleGroupLoadLog.date));

  // Keep latest row per muscle group, filter to this day's muscles
  const latestByMuscle = new Map<string, typeof loadRows[number]>();
  for (const row of loadRows) {
    if (!latestByMuscle.has(row.muscleGroup)) latestByMuscle.set(row.muscleGroup, row);
  }
  const recoveryStatus: RecoveryStatus[] = muscleGroups.map((mg) => {
    const row = latestByMuscle.get(mg);
    return { muscleGroup: mg, fullyRecoveredAt: row?.fullyRecoveredAt ?? null };
  });

  // AI call
  let model;
  try {
    model = await getDefaultModel();
  } catch (err) {
    await logger.error("ai:coaching_suggestion:no_model", {
      userId: session.user.id,
      metadata: { dayId, error: String(err) },
    });
    return NextResponse.json(
      { error: locale === "en" ? "No AI provider configured." : "Kein AI-Provider konfiguriert." },
      { status: 503 }
    );
  }

  const systemPrompt = buildCoachingSuggestionSystemPrompt(locale);
  const userPrompt = buildCoachingSuggestionUserPrompt(
    day.title, day.focus ?? null, currentExercises, recentPerformance, recoveryStatus, locale
  );

  await logger.info("ai:coaching_suggestion:prompt", {
    userId: session.user.id,
    metadata: { dayId, system: systemPrompt, prompt: userPrompt },
  });

  type AiResult = { object: z.infer<typeof coachingSuggestionAiSchema> };
  let result: AiResult | null = null;

  try {
    result = await generateObject({ model, schema: coachingSuggestionAiSchema, system: systemPrompt, prompt: userPrompt });
  } catch (genObjErr) {
    await logger.warn("ai:coaching_suggestion:generateObject_failed", {
      userId: session.user.id,
      metadata: { dayId, error: String(genObjErr) },
    });
    try {
      const textResult = await generateText({ model, system: systemPrompt, prompt: userPrompt });
      const rawText = textResult.text;
      await logger.info("ai:coaching_suggestion:generateText_raw", {
        userId: session.user.id,
        metadata: { dayId, rawText: rawText.slice(0, 2000) },
      });
      const jsonObj = extractJsonObject(rawText);
      if (jsonObj) {
        const parsed = lenientSuggestionSchema.safeParse(jsonObj);
        if (parsed.success) {
          result = { object: parsed.data as z.infer<typeof coachingSuggestionAiSchema> };
        } else {
          await logger.warn("ai:coaching_suggestion:schema_mismatch", {
            userId: session.user.id,
            metadata: { dayId, issues: parsed.error.issues.map((i) => i.message) },
          });
        }
      } else {
        await logger.warn("ai:coaching_suggestion:no_json_in_response", {
          userId: session.user.id,
          metadata: { dayId, rawText: rawText.slice(0, 500) },
        });
      }
    } catch (fallbackErr) {
      await logger.error("ai:coaching_suggestion:fallback_failed", {
        userId: session.user.id,
        metadata: { dayId, error: String(fallbackErr) },
      });
    }
  }

  if (!result) {
    return NextResponse.json(
      { error: locale === "en" ? "AI analysis failed. Check provider configuration." : "KI-Analyse fehlgeschlagen. Provider-Konfiguration prüfen." },
      { status: 502 }
    );
  }

  const now = new Date().toISOString();
  const suggestion: CoachingSuggestion = { ...result.object, generatedAt: now };

  await db.update(trainingDays)
    .set({ pendingAiSuggestion: JSON.stringify(suggestion) })
    .where(eq(trainingDays.id, dayId));

  await logger.info("ai:coaching_suggestion:response", {
    userId: session.user.id,
    metadata: { dayId, suggestion },
  });

  return NextResponse.json({ suggestion });
}

// PATCH /api/plans/[planId]/days/[dayId]/suggest — Accept suggestion
export async function PATCH(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { planId, dayId } = await params;

  // Ownership check
  const plan = await db.query.trainingPlans.findFirst({
    where: and(eq(trainingPlans.id, planId), eq(trainingPlans.userId, session.user.id)),
    columns: { id: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const day = await db.query.trainingDays.findFirst({
    where: and(eq(trainingDays.id, dayId), eq(trainingDays.planId, planId)),
    columns: { id: true, pendingAiSuggestion: true },
  });
  if (!day?.pendingAiSuggestion) {
    return NextResponse.json({ error: "No pending suggestion" }, { status: 404 });
  }

  let suggestion: CoachingSuggestion;
  try {
    const raw = JSON.parse(day.pendingAiSuggestion);
    const parsed = lenientSuggestionSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: "Invalid suggestion data" }, { status: 422 });
    suggestion = parsed.data as CoachingSuggestion;
  } catch {
    return NextResponse.json({ error: "Failed to parse suggestion" }, { status: 422 });
  }

  // Apply each exercise update
  for (const ex of suggestion.exercises) {
    await db.update(planExercises)
      .set({
        sets: ex.sets,
        repsMin: ex.repsMin,
        repsMax: ex.repsMax ?? null,
        suggestedWeightKg: ex.suggestedWeightKg ?? null,
        notes: ex.notes || null,
      })
      .where(and(
        eq(planExercises.trainingDayId, dayId),
        eq(planExercises.exerciseId, ex.exerciseId)
      ));
  }

  // Clear suggestion
  await db.update(trainingDays)
    .set({ pendingAiSuggestion: null })
    .where(eq(trainingDays.id, dayId));

  await logger.info("ai:coaching_suggestion:accepted", {
    userId: session.user.id,
    metadata: { dayId },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/plans/[planId]/days/[dayId]/suggest — Reject suggestion
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { planId, dayId } = await params;

  // Ownership check (plan level only)
  const plan = await db.query.trainingPlans.findFirst({
    where: and(eq(trainingPlans.id, planId), eq(trainingPlans.userId, session.user.id)),
    columns: { id: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.update(trainingDays)
    .set({ pendingAiSuggestion: null })
    .where(and(
      eq(trainingDays.id, dayId),
      eq(trainingDays.planId, planId)
    ));

  await logger.info("ai:coaching_suggestion:rejected", {
    userId: session.user.id,
    metadata: { dayId },
  });

  return NextResponse.json({ ok: true });
}
