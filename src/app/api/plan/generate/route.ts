import { generateObject, generateText } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { users, equipment, exercises, userEquipment } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getDefaultModel } from "@/lib/ai/provider-registry";
import { buildPlanGenerationPrompt } from "@/lib/ai/system-prompts";
import { generatedPlanSchema } from "@/lib/ai/plan-schema";
import { logger } from "@/lib/utils/logger";

/**
 * Strip markdown fences and find the outermost JSON object in a string.
 * Handles cases where the model wraps the response in ```json ... ``` blocks
 * or adds explanatory text before/after the JSON.
 */
function extractJson(raw: string): string {
  // Remove markdown code fences
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Find the outermost { ... }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) return raw.slice(start, end + 1);

  return raw.trim();
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Load user's equipment
  const userEquipmentRows = await db
    .select({ eq: equipment })
    .from(userEquipment)
    .innerJoin(equipment, eq(userEquipment.equipmentId, equipment.id))
    .where(eq(userEquipment.userId, userId));

  const userEquipmentList = userEquipmentRows.map((r) => r.eq);

  // Load full exercise catalog
  const allExercises = await db.query.exercises.findMany({
    where: eq(exercises.isActive, true),
  });

  let model;
  try {
    model = await getDefaultModel();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No AI provider configured";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const prompt = buildPlanGenerationPrompt(user, userEquipmentList, allExercises);

  await logger.info("plan.generate.request", {
    userId,
    metadata: {
      exercisesAvailable: allExercises.length,
      equipmentCount: userEquipmentList.length,
      goal: user.goals?.slice(0, 100),
      experience: user.experienceLevel,
      prompt,
    },
  });

  const startedAt = Date.now();

  // ── Attempt 1: generateObject with schema enforcement ──────────────────────
  try {
    const { object } = await generateObject({
      model,
      schema: generatedPlanSchema,
      prompt,
    });

    await logger.info("plan.generate.success", {
      userId,
      metadata: {
        attempt: 1,
        durationMs: Date.now() - startedAt,
        planName: object.planName,
        trainingDays: object.trainingDays.length,
        durationWeeks: object.durationWeeks,
      },
    });

    return NextResponse.json(object);
  } catch (firstErr) {
    const firstMessage = firstErr instanceof Error ? firstErr.message : String(firstErr);

    await logger.warn("plan.generate.attempt1_failed", {
      userId,
      metadata: { durationMs: Date.now() - startedAt, error: firstMessage },
    });
  }

  // ── Attempt 2: generateText + manual extraction ────────────────────────────
  // Ask the model to correct itself: output raw JSON only, no markdown.
  const retryPrompt =
    `${prompt}\n\n` +
    `IMPORTANT: Your previous response could not be parsed as valid JSON.\n` +
    `Output ONLY the raw JSON object — no markdown, no backticks, no code fences, no explanation.\n` +
    `Your response must start with { and end with }.`;

  try {
    const { text } = await generateText({
      model,
      prompt: retryPrompt,
      maxOutputTokens: 4096,
    });

    const extracted = extractJson(text);
    const parsed = JSON.parse(extracted);
    const validated = generatedPlanSchema.parse(parsed);

    await logger.info("plan.generate.success", {
      userId,
      metadata: {
        attempt: 2,
        durationMs: Date.now() - startedAt,
        planName: validated.planName,
        trainingDays: validated.trainingDays.length,
        durationWeeks: validated.durationWeeks,
      },
    });

    return NextResponse.json(validated);
  } catch (retryErr) {
    const message = retryErr instanceof Error ? retryErr.message : String(retryErr);

    await logger.error("plan.generate.error", {
      userId,
      metadata: {
        durationMs: Date.now() - startedAt,
        error: message,
        stack: retryErr instanceof Error ? retryErr.stack?.slice(0, 500) : undefined,
      },
    });

    return NextResponse.json(
      { error: "Trainingsplan konnte nicht generiert werden.", detail: message },
      { status: 500 }
    );
  }
}
