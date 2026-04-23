import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { users, userEquipment, equipment, workoutSessions } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
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

  // Training streak: consecutive weeks with at least one session, going backward from current week
  const cutoff52w = new Date(Date.now() - 364 * 86_400_000).toISOString();
  const recentSessions = await db
    .select({ completedAt: workoutSessions.completedAt })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, session.user.id), gte(workoutSessions.completedAt, cutoff52w)));

  const trainingStreak = (() => {
    const weekMonday = (iso: string) => {
      const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
      const day = d.getUTCDay();
      d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
      return d.toISOString().slice(0, 10);
    };
    const today = new Date().toISOString().slice(0, 10);
    const trainingWeeks = new Set(
      recentSessions.filter((s) => s.completedAt).map((s) => weekMonday(s.completedAt!))
    );
    let n = 0;
    const cursor = new Date(weekMonday(today) + "T00:00:00Z");
    while (trainingWeeks.has(cursor.toISOString().slice(0, 10))) {
      n++;
      cursor.setUTCDate(cursor.getUTCDate() - 7);
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
