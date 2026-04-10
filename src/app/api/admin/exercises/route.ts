import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { exercises } from "@/db/schema";
import { z } from "zod";
import { randomUUID } from "crypto";

const MUSCLE_GROUPS = [
  "chest","back","shoulders","biceps","triceps","forearms",
  "quadriceps","hamstrings","glutes","calves","core","full_body",
] as const;

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  primaryMuscleGroup: z.enum(MUSCLE_GROUPS),
  secondaryMuscleGroups: z.array(z.string()).optional(),
  requiredEquipmentIds: z.array(z.string()).optional(),
  instructions: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as { role?: string }).role !== "admin") return null;
  return session;
}

export async function GET() {
  const items = await db.query.exercises.findMany({
    orderBy: (e, { asc }) => [asc(e.name)],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { secondaryMuscleGroups, requiredEquipmentIds, ...rest } = parsed.data;
  const item = await db
    .insert(exercises)
    .values({
      id: randomUUID(),
      ...rest,
      secondaryMuscleGroups: JSON.stringify(secondaryMuscleGroups ?? []),
      requiredEquipmentIds: JSON.stringify(requiredEquipmentIds ?? []),
    })
    .returning();

  return NextResponse.json(item[0], { status: 201 });
}
