import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { workoutSets, workoutSessions } from "@/db/schema";
import { and, eq, isNotNull, desc, asc } from "drizzle-orm";

type Params = { params: Promise<{ exerciseId: string }> };

// GET /api/exercises/[exerciseId]/last-sets
// Returns the last 5 individual sets for this exercise across all completed sessions
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { exerciseId } = await params;

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
      eq(workoutSessions.userId, session.user.id),
      eq(workoutSets.exerciseId, exerciseId),
      isNotNull(workoutSessions.completedAt)
    ))
    .orderBy(desc(workoutSessions.completedAt), asc(workoutSets.setNumber))
    .limit(5);

  return NextResponse.json({ sets });
}
