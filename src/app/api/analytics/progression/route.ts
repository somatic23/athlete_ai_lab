import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { workoutExerciseSummary, workoutSessions, exercises } from "@/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { parseI18n } from "@/lib/utils/i18n";

// GET /api/analytics/progression?weeks=16&locale=de
// Returns 1RM progression per exercise (data points for line chart)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const weeks = Math.min(parseInt(req.nextUrl.searchParams.get("weeks") ?? "16"), 52);
  const locale = req.nextUrl.searchParams.get("locale") ?? "de";
  const cutoff = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();

  const rows = await db
    .select({
      exerciseId: workoutExerciseSummary.exerciseId,
      estimated1rm: workoutExerciseSummary.estimated1rm,
      maxWeightKg: workoutExerciseSummary.maxWeightKg,
      totalVolumeKg: workoutExerciseSummary.totalVolumeKg,
      totalReps: workoutExerciseSummary.totalReps,
      performanceDeltaPct: workoutExerciseSummary.performanceDeltaPct,
      startedAt: workoutSessions.startedAt,
      sessionTitle: workoutSessions.title,
      nameI18n: exercises.nameI18n,
      primaryMuscleGroup: exercises.primaryMuscleGroup,
    })
    .from(workoutExerciseSummary)
    .innerJoin(workoutSessions, eq(workoutExerciseSummary.sessionId, workoutSessions.id))
    .innerJoin(exercises, eq(workoutExerciseSummary.exerciseId, exercises.id))
    .where(
      and(
        eq(workoutSessions.userId, session.user.id),
        gte(workoutSessions.startedAt, cutoff)
      )
    )
    .orderBy(desc(workoutSessions.startedAt));

  // Group by exercise
  type DataPoint = { date: string; estimated1rm: number | null; maxWeight: number | null; sessionTitle: string };
  const exerciseMap = new Map<string, {
    exerciseId: string;
    name: string;
    primaryMuscleGroup: string;
    dataPoints: DataPoint[];
  }>();

  for (const row of rows) {
    if (!exerciseMap.has(row.exerciseId)) {
      const names = parseI18n(row.nameI18n);
      exerciseMap.set(row.exerciseId, {
        exerciseId: row.exerciseId,
        name: locale === "en" ? (names.en || names.de) : (names.de || names.en),
        primaryMuscleGroup: row.primaryMuscleGroup,
        dataPoints: [],
      });
    }
    exerciseMap.get(row.exerciseId)!.dataPoints.push({
      date: row.startedAt.slice(0, 10),
      estimated1rm: row.estimated1rm,
      maxWeight: row.maxWeightKg,
      sessionTitle: row.sessionTitle,
    });
  }

  // Sort data points chronologically (they came in DESC)
  const exercises_list = Array.from(exerciseMap.values()).map((ex) => ({
    ...ex,
    dataPoints: ex.dataPoints.reverse(),
    // Determine trend: compare last vs first data point
    trend: (() => {
      const pts = ex.dataPoints.filter((p) => p.estimated1rm != null);
      if (pts.length < 2) return "neutral" as const;
      const first = pts[0].estimated1rm!;
      const last = pts[pts.length - 1].estimated1rm!;
      const delta = ((last - first) / first) * 100;
      if (delta > 2) return "up" as const;
      if (delta < -2) return "down" as const;
      return "plateau" as const;
    })(),
  }));

  // Sort: most data points first (most trained exercises on top)
  exercises_list.sort((a, b) => b.dataPoints.length - a.dataPoints.length);

  return NextResponse.json(exercises_list);
}
