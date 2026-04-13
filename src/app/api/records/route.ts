import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { personalRecords, exercises } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { parseI18n } from "@/lib/utils/i18n";

// GET /api/records — best PRs per exercise for the current user
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const locale = req.nextUrl.searchParams.get("locale") ?? "de";

  const rows = await db
    .select({
      id: personalRecords.id,
      exerciseId: personalRecords.exerciseId,
      recordType: personalRecords.recordType,
      weightKg: personalRecords.weightKg,
      reps: personalRecords.reps,
      estimated1rm: personalRecords.estimated1rm,
      previousRecordValue: personalRecords.previousRecordValue,
      achievedAt: personalRecords.achievedAt,
      nameI18n: exercises.nameI18n,
      primaryMuscleGroup: exercises.primaryMuscleGroup,
    })
    .from(personalRecords)
    .innerJoin(exercises, eq(personalRecords.exerciseId, exercises.id))
    .where(
      and(
        eq(personalRecords.userId, session.user.id),
        eq(personalRecords.recordType, "1rm")
      )
    )
    .orderBy(desc(personalRecords.achievedAt));

  // Group by exercise — keep the record with the highest estimated_1rm
  const byExercise = new Map<string, typeof rows[0]>();
  for (const row of rows) {
    const existing = byExercise.get(row.exerciseId);
    const current1rm = row.estimated1rm ?? row.weightKg;
    const existing1rm = existing ? (existing.estimated1rm ?? existing.weightKg) : -1;
    if (!existing || current1rm > existing1rm) {
      byExercise.set(row.exerciseId, row);
    }
  }

  // Also collect recent PRs (last 30 days) for achievements timeline
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recentPrs = rows
    .filter((r) => r.achievedAt >= thirtyDaysAgo)
    .slice(0, 20);

  const bests = Array.from(byExercise.values())
    .sort((a, b) => (b.estimated1rm ?? b.weightKg) - (a.estimated1rm ?? a.weightKg))
    .map((r) => {
      const names = parseI18n(r.nameI18n);
      const name = locale === "en" ? (names.en || names.de) : (names.de || names.en);
      const val = r.estimated1rm ?? r.weightKg;
      const prev = r.previousRecordValue;
      const deltaPct = prev && prev > 0 ? ((val - prev) / prev) * 100 : null;
      return {
        exerciseId: r.exerciseId,
        name,
        primaryMuscleGroup: r.primaryMuscleGroup,
        estimated1rm: val,
        weightKg: r.weightKg,
        reps: r.reps,
        previousEstimated1rm: prev,
        deltaPct,
        achievedAt: r.achievedAt,
      };
    });

  const recent = recentPrs.map((r) => {
    const names = parseI18n(r.nameI18n);
    const name = locale === "en" ? (names.en || names.de) : (names.de || names.en);
    return {
      id: r.id,
      exerciseId: r.exerciseId,
      name,
      estimated1rm: r.estimated1rm ?? r.weightKg,
      weightKg: r.weightKg,
      reps: r.reps,
      previousRecordValue: r.previousRecordValue,
      achievedAt: r.achievedAt,
    };
  });

  return NextResponse.json({ bests, recent });
}
