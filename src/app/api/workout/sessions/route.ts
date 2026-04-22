import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import {
  workoutSessions, trainingDays,
} from "@/db/schema";
import { and, eq, desc, gte, lte, isNull, isNotNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { parseI18n } from "@/lib/utils/i18n";

const startSchema = z.object({
  title: z.string().min(1).max(200),
  trainingDayId: z.string().nullable().optional(),
  scheduledEventId: z.string().nullable().optional(),
});

// GET /api/workout/sessions?scheduledEventId=xxx — list or lookup by event
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scheduledEventId = req.nextUrl.searchParams.get("scheduledEventId");

  if (scheduledEventId) {
    // Return the single session linked to this calendar event
    const row = await db.query.workoutSessions.findFirst({
      where: and(
        eq(workoutSessions.userId, session.user.id),
        eq(workoutSessions.scheduledEventId, scheduledEventId)
      ),
    });
    return NextResponse.json(row ?? null);
  }

  const from = req.nextUrl.searchParams.get("from");
  const to   = req.nextUrl.searchParams.get("to");

  // Date-range query: return completed free sessions (no scheduledEventId) for calendar display
  if (from && to) {
    const conditions = [
      eq(workoutSessions.userId, session.user.id),
      isNotNull(workoutSessions.completedAt),
      isNull(workoutSessions.scheduledEventId),
      gte(workoutSessions.startedAt, from),
      lte(workoutSessions.startedAt, to + "T23:59:59.999Z"),
    ];
    const rows = await db.query.workoutSessions.findMany({
      where: and(...conditions),
      orderBy: [desc(workoutSessions.startedAt)],
    });
    return NextResponse.json(rows);
  }

  const rows = await db.query.workoutSessions.findMany({
    where: eq(workoutSessions.userId, session.user.id),
    orderBy: [desc(workoutSessions.startedAt)],
    limit: 50,
  });

  return NextResponse.json(rows);
}

// POST /api/workout/sessions — start a new workout
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }

  const { title, trainingDayId, scheduledEventId } = parsed.data;
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(workoutSessions).values({
    id,
    userId: session.user.id,
    title,
    trainingDayId: trainingDayId ?? null,
    scheduledEventId: scheduledEventId ?? null,
    startedAt: now,
    createdAt: now,
  });

  // Load plan exercises for this training day (if provided)
  let planExerciseList: {
    planExerciseId: string;
    exerciseId: string;
    name: string;
    primaryMuscleGroup: string;
    trackingType: "weight_reps" | "duration";
    targetSets: number;
    repsMin: number;
    repsMax: number | null;
    targetDurationSeconds: number | null;
    targetRpe: number | null;
    restSeconds: number | null;
    suggestedWeightKg: number | null;
    notes: string | null;
  }[] = [];

  if (trainingDayId) {
    const day = await db.query.trainingDays.findFirst({
      where: eq(trainingDays.id, trainingDayId),
      with: {
        exercises: {
          with: { exercise: true },
          orderBy: (pe, { asc }) => [asc(pe.sortOrder)],
        },
      },
    });

    if (day) {
      planExerciseList = day.exercises.map((pe) => {
        const names = parseI18n(pe.exercise.nameI18n);
        return {
          planExerciseId: pe.id,
          exerciseId: pe.exerciseId,
          name: names.de || names.en || "Übung",
          primaryMuscleGroup: pe.exercise.primaryMuscleGroup ?? "full_body",
          trackingType: pe.exercise.trackingType as "weight_reps" | "duration",
          targetSets: pe.sets,
          repsMin: pe.repsMin ?? 8,
          repsMax: pe.repsMax ?? null,
          targetDurationSeconds: pe.durationSeconds ?? null,
          targetRpe: pe.targetRpe ?? null,
          restSeconds: pe.restSeconds ?? null,
          suggestedWeightKg: pe.suggestedWeightKg ?? null,
          notes: pe.notes ?? null,
        };
      });
    }
  }

  return NextResponse.json({ id, title, trainingDayId, startedAt: now, exercises: planExerciseList }, { status: 201 });
}
