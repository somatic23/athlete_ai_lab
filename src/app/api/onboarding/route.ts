import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { users, userEquipment } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const onboardingSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: z.enum(["male", "female", "diverse"]).optional(),
  weightKg: z.number().min(20).max(500).optional(),
  heightCm: z.number().min(50).max(300).optional(),
  bodyFatPct: z.number().min(1).max(60).optional(),
  goals: z.string().optional(),
  experienceLevel: z
    .enum(["beginner", "intermediate", "advanced", "expert"])
    .optional(),
  injuriesLimitations: z.string().optional(),
  equipmentIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { equipmentIds, ...profileData } = parsed.data;

  await db
    .update(users)
    .set({
      ...profileData,
      onboardingCompleted: true,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, session.user.id));

  if (equipmentIds && equipmentIds.length > 0) {
    await db
      .delete(userEquipment)
      .where(eq(userEquipment.userId, session.user.id));

    await db.insert(userEquipment).values(
      equipmentIds.map((equipmentId) => ({
        userId: session.user.id,
        equipmentId,
      }))
    );
  }

  return NextResponse.json({ success: true });
}
