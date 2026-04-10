import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { trainingPlans, trainingDays, planExercises } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import type { GeneratedPlan } from "@/lib/ai/plan-schema";
import { randomUUID } from "crypto";

// GET /api/plans — list user's training plans
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plans = await db.query.trainingPlans.findMany({
    where: eq(trainingPlans.userId, session.user.id),
    orderBy: [desc(trainingPlans.createdAt)],
    with: {
      days: {
        orderBy: (d, { asc }) => [asc(d.sortOrder)],
        with: {
          exercises: { orderBy: (e, { asc }) => [asc(e.sortOrder)] },
        },
      },
    },
  });

  return NextResponse.json(plans);
}

// POST /api/plans — save a generated plan
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: GeneratedPlan = await req.json();
  const userId = session.user.id;

  // Parse a reps string like "8-12" or "5" into { min, max }
  function parseReps(reps: string): { min: number; max: number | null } {
    const parts = reps.split("-").map((s) => parseInt(s.trim(), 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { min: parts[0], max: parts[1] };
    }
    const n = parseInt(reps, 10);
    return { min: isNaN(n) ? 1 : n, max: null };
  }

  const planId = randomUUID();
  const now = new Date().toISOString();

  // Insert training plan
  await db.insert(trainingPlans).values({
    id: planId,
    userId,
    title: body.planName,
    description: body.goal,
    status: "draft",
    aiGenerated: true,
    planData: JSON.stringify(body),
    createdAt: now,
    updatedAt: now,
  });

  // Insert training days + exercises
  for (let i = 0; i < body.trainingDays.length; i++) {
    const day = body.trainingDays[i];
    const dayId = randomUUID();

    await db.insert(trainingDays).values({
      id: dayId,
      planId,
      dayNumber: i + 1,
      title: day.dayName,
      focus: day.focus,
      estimatedDurationMin: day.estimatedDurationMinutes,
      sortOrder: i,
      createdAt: now,
    });

    for (let j = 0; j < day.exercises.length; j++) {
      const ex = day.exercises[j];
      const { min, max } = parseReps(ex.reps);

      await db.insert(planExercises).values({
        id: randomUUID(),
        trainingDayId: dayId,
        exerciseId: ex.exerciseId,
        sortOrder: j,
        sets: ex.sets,
        repsMin: min,
        repsMax: max,
        restSeconds: ex.restSeconds,
        notes: ex.notes || ex.weightSuggestion || null,
        createdAt: now,
      });
    }
  }

  const saved = await db.query.trainingPlans.findFirst({
    where: eq(trainingPlans.id, planId),
    with: {
      days: {
        orderBy: (d, { asc }) => [asc(d.sortOrder)],
        with: {
          exercises: { orderBy: (e, { asc }) => [asc(e.sortOrder)] },
        },
      },
    },
  });

  return NextResponse.json(saved, { status: 201 });
}
