import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { workoutSets, workoutSessions } from "@/db/schema";
import { and, eq, isNotNull, desc, asc } from "drizzle-orm";

type Params = { params: Promise<{ exerciseId: string }> };

// GET /api/exercises/[exerciseId]/last-sets
// Returns all sets of the most recent completed session that included this exercise
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { exerciseId } = await params;

  // Find the most recent completed session containing this exercise
  const lastSession = await db
    .select({ sessionId: workoutSets.sessionId, sessionDate: workoutSessions.startedAt })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .where(and(
      eq(workoutSessions.userId, session.user.id),
      eq(workoutSets.exerciseId, exerciseId),
      isNotNull(workoutSessions.completedAt)
    ))
    .orderBy(desc(workoutSessions.completedAt))
    .limit(1);

  if (lastSession.length === 0) return NextResponse.json({ sets: [] });

  const { sessionId, sessionDate } = lastSession[0];

  const sets = await db
    .select({
      setNumber: workoutSets.setNumber,
      weightKg: workoutSets.weightKg,
      repsCompleted: workoutSets.repsCompleted,
      durationSeconds: workoutSets.durationSeconds,
      rpe: workoutSets.rpe,
      outcome: workoutSets.outcome,
      sessionDate: workoutSessions.startedAt,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .where(and(
      eq(workoutSets.sessionId, sessionId),
      eq(workoutSets.exerciseId, exerciseId)
    ))
    .orderBy(asc(workoutSets.setNumber));

  return NextResponse.json({ sets, sessionDate });
}
