import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { workoutSessions, workoutSets, personalRecords } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { estimated1rm } from "@/lib/utils/1rm";

type Params = { params: Promise<{ sessionId: string }> };

const setSchema = z.object({
  exerciseId: z.string(),
  planExerciseId: z.string().nullable().optional(),
  setNumber: z.number().int().min(1),
  weightKg: z.number().positive().nullable().optional(),
  repsCompleted: z.number().int().min(0).nullable().optional(),
  rpe: z.number().min(1).max(10).nullable().optional(),
  outcome: z.enum(["completed", "failure", "partial", "skipped"]).default("completed"),
  notes: z.string().max(500).optional(),
  restBeforeSeconds: z.number().int().nullable().optional(),
});

// POST /api/workout/[sessionId]/sets — log a set
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = await params;

  // Verify session ownership
  const workoutSession = await db.query.workoutSessions.findFirst({
    where: and(
      eq(workoutSessions.id, sessionId),
      eq(workoutSessions.userId, session.user.id)
    ),
  });
  if (!workoutSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (workoutSession.completedAt) return NextResponse.json({ error: "Session already completed" }, { status: 409 });

  const body = await req.json();
  const parsed = setSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }

  const { exerciseId, planExerciseId, setNumber, weightKg, repsCompleted, rpe, outcome, notes, restBeforeSeconds } = parsed.data;
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(workoutSets).values({
    id,
    sessionId,
    exerciseId,
    planExerciseId: planExerciseId ?? null,
    setNumber,
    weightKg: weightKg ?? null,
    repsCompleted: repsCompleted ?? null,
    targetReps: null,
    rpe: rpe ?? null,
    outcome,
    notes: notes ?? null,
    restBeforeSeconds: restBeforeSeconds ?? null,
    createdAt: now,
  });

  // Calculate estimated 1RM
  let e1rm: number | null = null;
  let isPR = false;

  if (weightKg && repsCompleted && outcome !== "skipped") {
    e1rm = estimated1rm(weightKg, repsCompleted);

    // Check for PR (estimated 1RM)
    const existingPR = await db.query.personalRecords.findFirst({
      where: and(
        eq(personalRecords.userId, session.user.id),
        eq(personalRecords.exerciseId, exerciseId),
        eq(personalRecords.recordType, "1rm")
      ),
      orderBy: [desc(personalRecords.estimated1rm)],
    });

    if (!existingPR || (existingPR.estimated1rm ?? 0) < e1rm) {
      isPR = true;
      const prId = randomUUID();
      await db.insert(personalRecords).values({
        id: prId,
        userId: session.user.id,
        exerciseId,
        recordType: "1rm",
        weightKg: weightKg,
        reps: repsCompleted,
        estimated1rm: e1rm,
        previousRecordValue: existingPR?.estimated1rm ?? null,
        achievedAt: now,
        workoutSetId: id,
        createdAt: now,
      });
    }
  }

  return NextResponse.json({ id, estimated1rm: e1rm, isPR }, { status: 201 });
}
