import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { trainingPlans } from "@/db/schema";
import { and, eq } from "drizzle-orm";

type Params = { params: Promise<{ planId: string }> };

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

  await db
    .update(trainingPlans)
    .set({ ...updates, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(trainingPlans.id, planId),
        eq(trainingPlans.userId, session.user.id)
      )
    );

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
