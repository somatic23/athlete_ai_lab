import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import {
  users, trainingPlans, trainingDays, planExercises,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { lenientSuggestionSchema, type CoachingSuggestion } from "@/lib/ai/coaching-suggestion-schema";
import { generateSuggestionForDay } from "@/lib/coaching/generate-suggestion";
import { logger } from "@/lib/utils/logger";

type Params = { params: Promise<{ planId: string; dayId: string }> };

// POST /api/plans/[planId]/days/[dayId]/suggest — Generate suggestion
export async function POST(_req: NextRequest, { params }: Params) {
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
  if (!day) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Idempotent: return cached pending suggestion if present
  if (day.pendingAiSuggestion) {
    try {
      return NextResponse.json({ suggestion: JSON.parse(day.pendingAiSuggestion) });
    } catch {
      // Corrupted — regenerate
    }
  }

  const userRow = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { preferredLocale: true },
  });
  const locale = (userRow?.preferredLocale ?? "de") as "de" | "en";

  const result = await generateSuggestionForDay(db, session.user.id, dayId, locale, { source: "manual" });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: 502 },
    );
  }

  return NextResponse.json({ suggestion: result.suggestion });
}

// PATCH /api/plans/[planId]/days/[dayId]/suggest — Accept suggestion
export async function PATCH(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { planId, dayId } = await params;

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
        eq(planExercises.exerciseId, ex.exerciseId),
      ));
  }

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

  const plan = await db.query.trainingPlans.findFirst({
    where: and(eq(trainingPlans.id, planId), eq(trainingPlans.userId, session.user.id)),
    columns: { id: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.update(trainingDays)
    .set({ pendingAiSuggestion: null })
    .where(and(
      eq(trainingDays.id, dayId),
      eq(trainingDays.planId, planId),
    ));

  await logger.info("ai:coaching_suggestion:rejected", {
    userId: session.user.id,
    metadata: { dayId },
  });

  return NextResponse.json({ ok: true });
}
