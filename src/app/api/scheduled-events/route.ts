import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { scheduledEvents } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";

const createSchema = z.object({
  eventType: z.enum(["training_day", "rest", "cardio", "custom"]),
  trainingDayId: z.string().nullable().optional(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

// GET /api/scheduled-events?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const from = req.nextUrl.searchParams.get("from");
  const to   = req.nextUrl.searchParams.get("to");

  const conditions = [eq(scheduledEvents.userId, session.user.id)];
  if (from) conditions.push(gte(scheduledEvents.scheduledDate, from));
  if (to)   conditions.push(lte(scheduledEvents.scheduledDate, to));

  const rows = await db.query.scheduledEvents.findMany({
    where: and(...conditions),
    with: { trainingDay: true },
    orderBy: (e, { asc }) => [asc(e.scheduledDate)],
  });

  return NextResponse.json(rows);
}

// POST /api/scheduled-events
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  await db.insert(scheduledEvents).values({
    id,
    userId: session.user.id,
    eventType: parsed.data.eventType,
    trainingDayId: parsed.data.trainingDayId ?? null,
    scheduledDate: parsed.data.scheduledDate,
    title: parsed.data.title ?? null,
    notes: parsed.data.notes ?? null,
    isCompleted: false,
    createdAt: now,
    updatedAt: now,
  });

  const created = await db.query.scheduledEvents.findFirst({
    where: eq(scheduledEvents.id, id),
    with: { trainingDay: true },
  });

  return NextResponse.json(created, { status: 201 });
}
