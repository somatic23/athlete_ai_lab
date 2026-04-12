import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { trainingPlans, trainingDays, planExercises } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import type { GeneratedPlan } from "@/lib/ai/plan-schema";
import { randomUUID } from "crypto";
import { z } from "zod";

const manualPlanSchema = z.object({
  manual: z.literal(true),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  days: z.array(z.object({
    title: z.string().min(1).max(200),
    focus: z.string().max(200).optional(),
    estimatedDurationMin: z.number().int().min(1).max(600).optional(),
    exercises: z.array(z.object({
      exerciseId: z.string(),
      sets: z.number().int().min(1).max(100),
      repsMin: z.number().int().min(1).max(999),
      repsMax: z.number().int().min(1).max(999).optional(),
      restSeconds: z.number().int().min(0).max(3600).optional(),
      notes: z.string().max(500).optional(),
    })),
  })),
});

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

// POST /api/plans — save a generated or manual plan
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const userId = session.user.id;
  const now = new Date().toISOString();

  // ── Manual plan ────────────────────────────────────────────────────────
  if (body.manual === true) {
    const parsed = manualPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 }
      );
    }

    const planId = randomUUID();

    await db.insert(trainingPlans).values({
      id: planId,
      userId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      status: "draft",
      aiGenerated: false,
      planData: null,
      createdAt: now,
      updatedAt: now,
    });

    for (let i = 0; i < parsed.data.days.length; i++) {
      const day = parsed.data.days[i];
      const dayId = randomUUID();

      await db.insert(trainingDays).values({
        id: dayId,
        planId,
        dayNumber: i + 1,
        title: day.title,
        focus: day.focus ?? null,
        estimatedDurationMin: day.estimatedDurationMin ?? null,
        sortOrder: i,
        createdAt: now,
      });

      for (let j = 0; j < day.exercises.length; j++) {
        const ex = day.exercises[j];

        await db.insert(planExercises).values({
          id: randomUUID(),
          trainingDayId: dayId,
          exerciseId: ex.exerciseId,
          sortOrder: j,
          sets: ex.sets,
          repsMin: ex.repsMin,
          repsMax: ex.repsMax ?? null,
          restSeconds: ex.restSeconds ?? null,
          notes: ex.notes ?? null,
          createdAt: now,
        });
      }
    }

    const saved = await db.query.trainingPlans.findFirst({
      where: eq(trainingPlans.id, planId),
      with: {
        days: {
          orderBy: (d, { asc }) => [asc(d.sortOrder)],
          with: { exercises: { orderBy: (e, { asc }) => [asc(e.sortOrder)] } },
        },
      },
    });

    return NextResponse.json(saved, { status: 201 });
  }

  // ── AI-generated plan ──────────────────────────────────────────────────
  const aiBody: GeneratedPlan = body;

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

  await db.insert(trainingPlans).values({
    id: planId,
    userId,
    title: aiBody.planName,
    description: aiBody.goal,
    status: "draft",
    aiGenerated: true,
    planData: JSON.stringify(aiBody),
    createdAt: now,
    updatedAt: now,
  });

  for (let i = 0; i < aiBody.trainingDays.length; i++) {
    const day = aiBody.trainingDays[i];
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
        with: { exercises: { orderBy: (e, { asc }) => [asc(e.sortOrder)] } },
      },
    },
  });

  return NextResponse.json(saved, { status: 201 });
}
