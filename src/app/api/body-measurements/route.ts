import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { bodyMeasurements, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const createSchema = z.object({
  measuredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum"),
  weightKg:   z.number().min(20).max(500),
  bodyFatPct: z.number().min(1).max(60).nullable().optional(),
  waistCm:    z.number().min(30).max(200).nullable().optional(),
  chestCm:    z.number().min(40).max(200).nullable().optional(),
  hipCm:      z.number().min(40).max(200).nullable().optional(),
  armCm:      z.number().min(15).max(80).nullable().optional(),
  thighCm:    z.number().min(20).max(100).nullable().optional(),
  notes:      z.string().max(500).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.userId, session.user.id))
    .orderBy(desc(bodyMeasurements.measuredAt), desc(bodyMeasurements.createdAt));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID();
  const data = parsed.data;

  await db.insert(bodyMeasurements).values({
    id,
    userId: session.user.id,
    measuredAt: data.measuredAt,
    weightKg: data.weightKg,
    bodyFatPct: data.bodyFatPct ?? null,
    waistCm: data.waistCm ?? null,
    chestCm: data.chestCm ?? null,
    hipCm: data.hipCm ?? null,
    armCm: data.armCm ?? null,
    thighCm: data.thighCm ?? null,
    notes: data.notes ?? null,
  });

  const userPatch: Record<string, unknown> = {
    weightKg: data.weightKg,
    updatedAt: new Date().toISOString(),
  };
  if (data.bodyFatPct != null) userPatch.bodyFatPct = data.bodyFatPct;

  await db.update(users).set(userPatch).where(eq(users.id, session.user.id));

  const [created] = await db
    .select()
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.id, id));

  return NextResponse.json(created, { status: 201 });
}
