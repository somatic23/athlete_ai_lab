import { streamText, convertToModelMessages } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import {
  users, aiProviders, equipment, userEquipment, exercises,
  trainingPlans, workoutSessions, muscleGroupLoadLog,
} from "@/db/schema";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { getDefaultModel } from "@/lib/ai/provider-registry";
import {
  buildCoachSystemPrompt,
  type TrainingContext,
  type RecentSessionSummary,
  type RecoveryStatusSummary,
  type ActivePlanSummary,
} from "@/lib/ai/system-prompts";
import { logger } from "@/lib/utils/logger";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { messages } = await req.json();

  // Resolve provider info for logging
  const activeProvider = await db.query.aiProviders.findFirst({
    where: and(eq(aiProviders.isDefault, true), eq(aiProviders.isActive, true)),
    columns: { provider: true, modelId: true, displayName: true },
  }) ?? await db.query.aiProviders.findFirst({
    where: eq(aiProviders.isActive, true),
    columns: { provider: true, modelId: true, displayName: true },
  });

  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
  const sevenDaysAgoDate = sevenDaysAgoIso.slice(0, 10);
  const nowIso = new Date().toISOString();

  const [user, userEquipmentRows, allExercises, activePlanRow, recentSessionRows, recoveryRows] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db
      .select({ eq: equipment })
      .from(userEquipment)
      .innerJoin(equipment, eq(userEquipment.equipmentId, equipment.id))
      .where(eq(userEquipment.userId, userId)),
    db.query.exercises.findMany({ where: eq(exercises.isActive, true) }),
    db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.userId, userId), eq(trainingPlans.status, "active")),
      with: {
        days: {
          orderBy: (d, { asc }) => [asc(d.sortOrder), asc(d.dayNumber)],
          columns: { title: true, focus: true, pendingAiSuggestion: true },
        },
      },
    }),
    db
      .select({
        title: workoutSessions.title,
        startedAt: workoutSessions.startedAt,
        durationSeconds: workoutSessions.durationSeconds,
        totalVolumeKg: workoutSessions.totalVolumeKg,
        muscleGroupsTrained: workoutSessions.muscleGroupsTrained,
        perceivedLoad: workoutSessions.perceivedLoad,
        satisfactionRating: workoutSessions.satisfactionRating,
      })
      .from(workoutSessions)
      .where(and(
        eq(workoutSessions.userId, userId),
        isNotNull(workoutSessions.completedAt),
      ))
      .orderBy(desc(workoutSessions.startedAt))
      .limit(3),
    db
      .select()
      .from(muscleGroupLoadLog)
      .where(and(
        eq(muscleGroupLoadLog.userId, userId),
        gte(muscleGroupLoadLog.date, sevenDaysAgoDate),
      ))
      .orderBy(desc(muscleGroupLoadLog.date)),
  ]);

  const userEquipmentList = userEquipmentRows.map((r) => r.eq);

  const userLocale = (user?.preferredLocale ?? "de") as "de" | "en";

  // JWT is valid but user no longer exists in DB (e.g. after a DB reset).
  // Force re-login so a fresh JWT is issued.
  if (!user) {
    await logger.warn("chat.user_not_found", {
      metadata: { userId },
    });
    return NextResponse.json(
      { error: "Session abgelaufen. Bitte neu einloggen." },
      { status: 401 }
    );
  }

  // Build training context: active plan + recent sessions + recovery
  const activePlan: ActivePlanSummary | null = activePlanRow
    ? {
        title: activePlanRow.title,
        days: activePlanRow.days.map((d) => ({
          dayName: d.title,
          focus: d.focus ?? null,
          hasPendingSuggestion: !!d.pendingAiSuggestion,
        })),
      }
    : null;

  const recentSessions: RecentSessionSummary[] = recentSessionRows.map((s) => {
    let muscleGroups: string[] = [];
    try { muscleGroups = JSON.parse(s.muscleGroupsTrained ?? "[]"); } catch {}
    return {
      date: s.startedAt.slice(0, 10),
      title: s.title,
      durationMin: s.durationSeconds ? Math.round(s.durationSeconds / 60) : 0,
      totalVolumeKg: s.totalVolumeKg ?? 0,
      muscleGroups,
      perceivedLoad: s.perceivedLoad ?? null,
      satisfactionRating: s.satisfactionRating ?? null,
    };
  });

  // Keep only the most recent recovery row per muscle group, and drop those
  // already fully recovered.
  const latestRecoveryByMuscle = new Map<string, typeof recoveryRows[number]>();
  for (const r of recoveryRows) {
    if (!latestRecoveryByMuscle.has(r.muscleGroup)) latestRecoveryByMuscle.set(r.muscleGroup, r);
  }
  const recovering: RecoveryStatusSummary[] = [];
  for (const [muscleGroup, row] of latestRecoveryByMuscle) {
    if (row.fullyRecoveredAt && row.fullyRecoveredAt > nowIso) {
      recovering.push({ muscleGroup, fullyRecoveredAt: row.fullyRecoveredAt });
    }
  }

  const trainingContext: TrainingContext = { activePlan, recentSessions, recovering };

  let model;
  try {
    model = await getDefaultModel();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Kein AI-Provider konfiguriert.";
    await logger.error("chat.provider_error", {
      userId,
      metadata: { error: message },
    });
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const systemPrompt = buildCoachSystemPrompt(
    user ?? null,
    userEquipmentList,
    allExercises,
    userLocale,
    null,
    trainingContext,
  );

  await logger.info("chat.request", {
    userId,
    metadata: {
      provider: activeProvider?.provider ?? "unknown",
      model: activeProvider?.modelId ?? "unknown",
      messageCount: messages?.length ?? 0,
      systemPrompt,
      messages,
    },
  });

  const requestedAt = Date.now();

  const result = streamText({
    model,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 2048,

    onFinish: async ({ text, usage, finishReason, warnings }) => {
      const durationMs = Date.now() - requestedAt;
      await logger.debug("chat.raw_response", {
        userId,
        metadata: { provider: activeProvider?.provider ?? "unknown", model: activeProvider?.modelId ?? "unknown", rawText: text },
      });
      await logger.info("chat.response", {
        userId,
        metadata: {
          provider: activeProvider?.provider ?? "unknown",
          model: activeProvider?.modelId ?? "unknown",
          finishReason,
          durationMs,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          responseText: text,
          warnings: warnings?.length ? warnings : undefined,
        },
      });
    },

    onError: async ({ error }) => {
      const durationMs = Date.now() - requestedAt;
      const message =
        error instanceof Error ? error.message : String(error);
      await logger.error("chat.stream_error", {
        userId,
        metadata: {
          provider: activeProvider?.provider ?? "unknown",
          model: activeProvider?.modelId ?? "unknown",
          durationMs,
          error: message,
          stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
        },
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
