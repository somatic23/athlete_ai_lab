import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { users, aiProviders, equipment, userEquipment, exercises } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getDefaultModel } from "@/lib/ai/provider-registry";
import { buildPlanCreationSystemPrompt } from "@/lib/ai/system-prompts";
import { proposeTrainingPlanTool } from "@/lib/ai/plan-tool";
import { logger } from "@/lib/utils/logger";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { messages } = await req.json();

  const activeProvider = await db.query.aiProviders.findFirst({
    where: and(eq(aiProviders.isDefault, true), eq(aiProviders.isActive, true)),
    columns: { provider: true, modelId: true, displayName: true },
  }) ?? await db.query.aiProviders.findFirst({
    where: eq(aiProviders.isActive, true),
    columns: { provider: true, modelId: true, displayName: true },
  });

  const [user, userEquipmentRows, allExercises] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db
      .select({ eq: equipment })
      .from(userEquipment)
      .innerJoin(equipment, eq(userEquipment.equipmentId, equipment.id))
      .where(eq(userEquipment.userId, userId)),
    db.query.exercises.findMany({ where: eq(exercises.isActive, true) }),
  ]);

  if (!user) {
    return NextResponse.json(
      { error: "Session abgelaufen. Bitte neu einloggen." },
      { status: 401 }
    );
  }

  const userEquipmentList = userEquipmentRows.map((r) => r.eq);
  const userLocale = (user.preferredLocale ?? "de") as "de" | "en";

  let model;
  try {
    model = await getDefaultModel();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kein AI-Provider konfiguriert.";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const systemPrompt = buildPlanCreationSystemPrompt(
    user,
    userEquipmentList,
    allExercises,
    userLocale,
  );

  await logger.info("plan.chat.request", {
    userId,
    metadata: {
      provider: activeProvider?.provider ?? "unknown",
      model: activeProvider?.modelId ?? "unknown",
      messageCount: messages?.length ?? 0,
      locale: userLocale,
      systemPrompt,
      messages,
    },
  });

  const requestedAt = Date.now();

  const result = streamText({
    model,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: { proposeTrainingPlan: proposeTrainingPlanTool },
    stopWhen: stepCountIs(2),
    maxOutputTokens: 4096,

    onFinish: async ({ text, usage, finishReason, warnings }) => {
      await logger.info("plan.chat.response", {
        userId,
        metadata: {
          provider: activeProvider?.provider ?? "unknown",
          model: activeProvider?.modelId ?? "unknown",
          finishReason,
          durationMs: Date.now() - requestedAt,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          responseText: text,
          warnings: warnings?.length ? warnings : undefined,
        },
      });
    },

    onError: async ({ error }) => {
      const message = error instanceof Error ? error.message : String(error);
      await logger.error("plan.chat.stream_error", {
        userId,
        metadata: {
          provider: activeProvider?.provider ?? "unknown",
          model: activeProvider?.modelId ?? "unknown",
          durationMs: Date.now() - requestedAt,
          error: message,
          stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
        },
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
