import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { exercises } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const MUSCLE_GROUPS = [
  "chest","back","shoulders","biceps","triceps","forearms",
  "quadriceps","hamstrings","glutes","calves","core","full_body",
] as const;

const schema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  primaryMuscleGroup: z.enum(MUSCLE_GROUPS).optional(),
  secondaryMuscleGroups: z.array(z.string()).optional(),
  requiredEquipmentIds: z.array(z.string()).optional(),
  instructions: z.string().optional(),
  isActive: z.boolean().optional(),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as { role?: string }).role !== "admin") return null;
  return session;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { secondaryMuscleGroups, requiredEquipmentIds, ...rest } = parsed.data;
  const updated = await db
    .update(exercises)
    .set({
      ...rest,
      ...(secondaryMuscleGroups !== undefined && {
        secondaryMuscleGroups: JSON.stringify(secondaryMuscleGroups),
      }),
      ...(requiredEquipmentIds !== undefined && {
        requiredEquipmentIds: JSON.stringify(requiredEquipmentIds),
      }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(exercises.id, id))
    .returning();

  if (!updated.length)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(updated[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await db.delete(exercises).where(eq(exercises.id, id));
  return NextResponse.json({ success: true });
}
