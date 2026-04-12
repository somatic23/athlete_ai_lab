import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { workoutSessions, workoutSets } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

type Params = { params: Promise<{ sessionId: string; setId: string }> };

const patchSchema = z.object({
  weightKg: z.number().positive().nullable().optional(),
  repsCompleted: z.number().int().min(0).nullable().optional(),
  rpe: z.number().min(1).max(10).nullable().optional(),
  outcome: z.enum(["completed", "failure", "partial", "skipped"]).optional(),
  notes: z.string().max(500).nullable().optional(),
});

// PATCH /api/workout/[sessionId]/sets/[setId]
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId, setId } = await params;

  // Verify session ownership
  const workoutSession = await db.query.workoutSessions.findFirst({
    where: and(
      eq(workoutSessions.id, sessionId),
      eq(workoutSessions.userId, session.user.id)
    ),
  });
  if (!workoutSession) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }

  await db.update(workoutSets)
    .set(parsed.data)
    .where(and(
      eq(workoutSets.id, setId),
      eq(workoutSets.sessionId, sessionId)
    ));

  return NextResponse.json({ ok: true });
}

// DELETE /api/workout/[sessionId]/sets/[setId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId, setId } = await params;

  const workoutSession = await db.query.workoutSessions.findFirst({
    where: and(
      eq(workoutSessions.id, sessionId),
      eq(workoutSessions.userId, session.user.id)
    ),
  });
  if (!workoutSession) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(workoutSets).where(and(
    eq(workoutSets.id, setId),
    eq(workoutSets.sessionId, sessionId)
  ));

  return NextResponse.json({ ok: true });
}
