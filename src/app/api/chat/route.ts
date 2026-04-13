import { streamText, convertToModelMessages } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { users, aiProviders, equipment, userEquipment, exercises } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getDefaultModel } from "@/lib/ai/provider-registry";
import { buildCoachSystemPrompt } from "@/lib/ai/system-prompts";
import { logger } from "@/lib/utils/logger";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { messages } = await req.json();
  const lastUserMessage: string =
    messages?.findLast?.((m: { role: string; parts?: { type: string; text?: string }[] }) =>
      m.role === "user"
    )?.parts?.find((p: { type: string; text?: string }) => p.type === "text")?.text ?? "(empty)";

  // Resolve provider info for logging
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

  const userEquipmentList = userEquipmentRows.map((r) => r.eq);

  const userLocale = (user?.preferredLocale ?? "de") as "de" | "en";

  await logger.info("chat.request", {
    userId,
    metadata: {
      provider: activeProvider?.provider ?? "unknown",
      model: activeProvider?.modelId ?? "unknown",
      messageCount: messages?.length ?? 0,
      lastUserMessage: lastUserMessage.slice(0, 200),
      locale: userLocale,
    },
  });

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

  const requestedAt = Date.now();

  const result = streamText({
    model,
    system: buildCoachSystemPrompt(user ?? null, userEquipmentList, allExercises, userLocale),
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 2048,

    onFinish: async ({ text, usage, finishReason, warnings }) => {
      const durationMs = Date.now() - requestedAt;
      await logger.info("chat.response", {
        userId,
        metadata: {
          provider: activeProvider?.provider ?? "unknown",
          model: activeProvider?.modelId ?? "unknown",
          finishReason,
          durationMs,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          responsePreview: text.slice(0, 300),
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
