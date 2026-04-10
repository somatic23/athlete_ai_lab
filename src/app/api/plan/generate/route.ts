import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { users, equipment, exercises, userEquipment } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getDefaultModel } from "@/lib/ai/provider-registry";
import { buildPlanGenerationPrompt } from "@/lib/ai/system-prompts";
import { generatedPlanSchema } from "@/lib/ai/plan-schema";
import { logger } from "@/lib/utils/logger";

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

  try {
    const { object } = await generateObject({
      model,
      schema: generatedPlanSchema,
      prompt,
    });

    await logger.info("plan.generate.success", {
      userId,
      metadata: {
        durationMs: Date.now() - startedAt,
        planName: object.planName,
        trainingDays: object.trainingDays.length,
        durationWeeks: object.durationWeeks,
      },
    });

    return NextResponse.json(object);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logger.error("plan.generate.error", {
      userId,
      metadata: {
        durationMs: Date.now() - startedAt,
        error: message,
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      },
    });

    return NextResponse.json(
      { error: "Trainingsplan konnte nicht generiert werden.", detail: message },
      { status: 500 }
    );
  }
}
