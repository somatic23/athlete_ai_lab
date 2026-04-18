import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { users, userEquipment, equipment, workoutSessions } from "@/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";

const profileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  email: z.string().email().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  gender: z.enum(["male", "female", "diverse"]).nullable().optional(),
  weightKg: z.number().min(20).max(500).nullable().optional(),
  heightCm: z.number().int().min(50).max(300).nullable().optional(),
  bodyFatPct: z.number().min(1).max(60).nullable().optional(),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced", "expert"]).nullable().optional(),
  goals: z.string().max(1000).nullable().optional(),
  injuriesLimitations: z.string().max(1000).nullable().optional(),
  preferredLocale: z.enum(["de", "en"]).optional(),
  coachPersonality: z.enum(["atlas", "kai", "mira", "sarge", "rex"]).optional(),
  equipmentIds: z.array(z.string()).optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Mindestens 8 Zeichen"),
});

// GET /api/profile — current user's profile + their equipment IDs
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      id: true, email: true, displayName: true,
      birthDate: true, gender: true, weightKg: true, heightCm: true,
      bodyFatPct: true, experienceLevel: true, goals: true,
      injuriesLimitations: true, preferredLocale: true, coachPersonality: true, avatarUrl: true, createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Load user's equipment IDs
  const equipmentRows = await db
    .select({ id: equipment.id })
    .from(userEquipment)
    .innerJoin(equipment, eq(userEquipment.equipmentId, equipment.id))
    .where(eq(userEquipment.userId, session.user.id));

  // Training streak: consecutive days with completed sessions going backward
  const cutoff30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const recentSessions = await db
    .select({ completedAt: workoutSessions.completedAt })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, session.user.id), gte(workoutSessions.completedAt, cutoff30)))
    .orderBy(desc(workoutSessions.completedAt));

  const trainingStreak = (() => {
    const sessionDates = new Set(recentSessions.map((s) => s.completedAt?.slice(0, 10)).filter(Boolean));
    let n = 0;
    const now = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      if (sessionDates.has(dateStr)) n++;
      else if (i > 0) break; // allow today to be empty (in-progress day)
    }
    return n;
  })();

  return NextResponse.json({
    ...user,
    equipmentIds: equipmentRows.map((r) => r.id),
    trainingStreak,
  });
}

// PATCH /api/profile — update profile fields + equipment
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Password change sub-action
  if ("currentPassword" in body) {
    const parsed = passwordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Ungueltige Eingabe" },
        { status: 400 }
      );
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { passwordHash: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Aktuelles Passwort ist falsch" }, { status: 400 });
    }

    const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date().toISOString() })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ ok: true });
  }

  // Profile + equipment update
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungueltige Eingabe" },
      { status: 400 }
    );
  }

  const { equipmentIds, ...profileData } = parsed.data;

  if (Object.keys(profileData).length > 0) {
    await db
      .update(users)
      .set({ ...profileData, updatedAt: new Date().toISOString() })
      .where(eq(users.id, session.user.id));
  }

  if (equipmentIds !== undefined) {
    await db.delete(userEquipment).where(eq(userEquipment.userId, session.user.id));
    if (equipmentIds.length > 0) {
      await db.insert(userEquipment).values(
        equipmentIds.map((equipmentId) => ({ userId: session.user.id, equipmentId }))
      );
    }
  }

  return NextResponse.json({ ok: true });
}
