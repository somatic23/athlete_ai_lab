import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { trainingPlans, trainingDays, planExercises } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";

type Params = { params: Promise<{ planId: string }> };

const contentUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  days: z.array(z.object({
    title: z.string().min(1).max(200),
    focus: z.string().max(200).optional(),
    estimatedDurationMin: z.number().int().min(1).max(600).optional(),
    exercises: z.array(z.object({
      exerciseId: z.string(),
      sets: z.number().int().min(1).max(100),
      repsMin: z.number().int().min(0).max(999).optional().nullable(),
      repsMax: z.number().int().min(1).max(999).optional().nullable(),
      durationSeconds: z.number().int().min(1).max(7200).optional().nullable(),
      restSeconds: z.number().int().min(0).max(3600).optional(),
      suggestedWeightKg: z.number().min(0).max(999).optional(),
      notes: z.string().max(500).optional(),
    })),
  })),
});

// GET /api/plans/[planId]
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId } = await params;

  const plan = await db.query.trainingPlans.findFirst({
    where: and(
      eq(trainingPlans.id, planId),
      eq(trainingPlans.userId, session.user.id)
    ),
    with: {
      days: {
        orderBy: (d, { asc }) => [asc(d.sortOrder)],
        with: {
          exercises: {
            orderBy: (e, { asc }) => [asc(e.sortOrder)],
            with: { exercise: true },
          },
        },
      },
    },
  });

  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(plan);
}

// PATCH /api/plans/[planId]
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId } = await params;
  const body = await req.json();
  const now = new Date().toISOString();

  // Ownership check
  const existing = await db.query.trainingPlans.findFirst({
    where: and(eq(trainingPlans.id, planId), eq(trainingPlans.userId, session.user.id)),
    columns: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Full content update (title + days + exercises) ──────────────────
  if (Array.isArray(body.days)) {
    const parsed = contentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 }
      );
    }

    // Update plan metadata
    const metaUpdates: Record<string, unknown> = { updatedAt: now };
    if (parsed.data.title) metaUpdates.title = parsed.data.title;
    if (parsed.data.description !== undefined) metaUpdates.description = parsed.data.description;

    await db.update(trainingPlans).set(metaUpdates).where(eq(trainingPlans.id, planId));

    // Delete all existing days (cascades to plan_exercises)
    await db.delete(trainingDays).where(eq(trainingDays.planId, planId));

    // Re-insert in new order
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
          repsMin: ex.repsMin ?? 8,
          repsMax: ex.repsMax ?? null,
          durationSeconds: ex.durationSeconds ?? null,
          restSeconds: ex.restSeconds ?? null,
          suggestedWeightKg: ex.suggestedWeightKg ?? null,
          notes: ex.notes ?? null,
          createdAt: now,
        });
      }
    }

    return NextResponse.json({ ok: true });
  }

  // ── Simple field update (status only) ──────────────────────────────
  const updates: Partial<{
    title: string;
    description: string;
    status: "draft" | "active" | "scheduled" | "archived";
  }> = {};
  if (typeof body.title === "string") updates.title = body.title;
  if (typeof body.description === "string") updates.description = body.description;
  if (["draft", "active", "scheduled", "archived"].includes(body.status)) {
    updates.status = body.status as "draft" | "active" | "scheduled" | "archived";
  }

  // Deactivate all other plans before activating this one
  if (updates.status === "active") {
    await db
      .update(trainingPlans)
      .set({ status: "draft", updatedAt: now })
      .where(
        and(
          eq(trainingPlans.userId, session.user.id),
          eq(trainingPlans.status, "active")
        )
      );
  }

  await db
    .update(trainingPlans)
    .set({ ...updates, updatedAt: now })
    .where(eq(trainingPlans.id, planId));

  return NextResponse.json({ ok: true });
}

// DELETE /api/plans/[planId]
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId } = await params;

  await db
    .delete(trainingPlans)
    .where(
      and(
        eq(trainingPlans.id, planId),
        eq(trainingPlans.userId, session.user.id)
      )
    );

  return NextResponse.json({ ok: true });
}
