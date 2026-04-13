import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { muscleGroupLoadLog, aiAnalysisReports, workoutSessions } from "@/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";

const MUSCLE_LABELS: Record<string, { de: string; en: string }> = {
  chest:       { de: "Brust",         en: "Chest" },
  back:        { de: "Rücken",        en: "Back" },
  shoulders:   { de: "Schultern",     en: "Shoulders" },
  biceps:      { de: "Bizeps",        en: "Biceps" },
  triceps:     { de: "Trizeps",       en: "Triceps" },
  forearms:    { de: "Unterarme",     en: "Forearms" },
  quadriceps:  { de: "Quadrizeps",    en: "Quadriceps" },
  hamstrings:  { de: "Hamstrings",    en: "Hamstrings" },
  glutes:      { de: "Gesäß",         en: "Glutes" },
  calves:      { de: "Waden",         en: "Calves" },
  core:        { de: "Core",          en: "Core" },
  full_body:   { de: "Ganzkörper",    en: "Full Body" },
};

// GET /api/analytics/overview?locale=de&weeks=8
// Returns: muscle group volume by week, recovery status, recent AI reports
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const locale = req.nextUrl.searchParams.get("locale") ?? "de";
  const weeks = Math.min(parseInt(req.nextUrl.searchParams.get("weeks") ?? "8"), 24);
  const cutoff = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [loadRows, aiRows, sessionRows] = await Promise.all([
    db
      .select()
      .from(muscleGroupLoadLog)
      .where(
        and(
          eq(muscleGroupLoadLog.userId, session.user.id),
          gte(muscleGroupLoadLog.date, cutoff)
        )
      )
      .orderBy(desc(muscleGroupLoadLog.date)),

    db
      .select({
        id: aiAnalysisReports.id,
        sessionId: aiAnalysisReports.sessionId,
        analysisType: aiAnalysisReports.analysisType,
        report: aiAnalysisReports.report,
        highlights: aiAnalysisReports.highlights,
        warnings: aiAnalysisReports.warnings,
        recommendations: aiAnalysisReports.recommendations,
        plateauDetectedExercises: aiAnalysisReports.plateauDetectedExercises,
        overloadDetectedMuscles: aiAnalysisReports.overloadDetectedMuscles,
        createdAt: aiAnalysisReports.createdAt,
      })
      .from(aiAnalysisReports)
      .where(eq(aiAnalysisReports.userId, session.user.id))
      .orderBy(desc(aiAnalysisReports.createdAt))
      .limit(10),

    db
      .select({ id: workoutSessions.id, startedAt: workoutSessions.startedAt })
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, session.user.id),
          gte(workoutSessions.startedAt, cutoff)
        )
      )
      .orderBy(desc(workoutSessions.startedAt)),
  ]);

  // ── Muscle group volume by week ───────────────────────────────────────
  // Build week buckets
  type WeekData = { week: string; [muscle: string]: number | string };
  const weekMap = new Map<string, WeekData>();

  for (const row of loadRows) {
    const date = new Date(row.date);
    // ISO week start (Monday)
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(date.setDate(diff)).toISOString().slice(0, 10);

    if (!weekMap.has(weekStart)) {
      weekMap.set(weekStart, { week: weekStart });
    }
    const bucket = weekMap.get(weekStart)!;
    const key = locale === "en"
      ? (MUSCLE_LABELS[row.muscleGroup]?.en ?? row.muscleGroup)
      : (MUSCLE_LABELS[row.muscleGroup]?.de ?? row.muscleGroup);
    bucket[key] = ((bucket[key] as number) || 0) + (row.totalVolumeKg ?? 0);
  }

  const volumeByWeek = Array.from(weekMap.values()).sort((a, b) =>
    String(a.week).localeCompare(String(b.week))
  );

  // ── Recovery status (latest entry per muscle group) ───────────────────
  const now = new Date().toISOString();
  const recoveryMap = new Map<string, { muscle: string; label: string; recoveredAt: string | null; recovered: boolean; hoursLeft: number }>();

  for (const row of loadRows) {
    if (!recoveryMap.has(row.muscleGroup)) {
      const label = locale === "en"
        ? (MUSCLE_LABELS[row.muscleGroup]?.en ?? row.muscleGroup)
        : (MUSCLE_LABELS[row.muscleGroup]?.de ?? row.muscleGroup);

      const recoveredAt = row.fullyRecoveredAt;
      const recovered = !recoveredAt || recoveredAt <= now;
      const hoursLeft = recoveredAt && !recovered
        ? Math.ceil((new Date(recoveredAt).getTime() - Date.now()) / 3600000)
        : 0;

      recoveryMap.set(row.muscleGroup, {
        muscle: row.muscleGroup,
        label,
        recoveredAt,
        recovered,
        hoursLeft,
      });
    }
  }

  const recovery = Array.from(recoveryMap.values())
    .sort((a, b) => {
      if (a.recovered && !b.recovered) return 1;
      if (!a.recovered && b.recovered) return -1;
      return (b.hoursLeft) - (a.hoursLeft);
    });

  // ── AI reports (structured) ───────────────────────────────────────────
  const reports = aiRows.map((r) => {
    let reportData = null;
    try { reportData = JSON.parse(r.report ?? "{}"); } catch {}
    return {
      id: r.id,
      sessionId: r.sessionId,
      analysisType: r.analysisType,
      createdAt: r.createdAt,
      highlights: (() => { try { return JSON.parse(r.highlights ?? "[]"); } catch { return []; } })(),
      warnings: (() => { try { return JSON.parse(r.warnings ?? "[]"); } catch { return []; } })(),
      recommendations: (() => { try { return JSON.parse(r.recommendations ?? "[]"); } catch { return []; } })(),
      plateauDetectedExercises: (() => { try { return JSON.parse(r.plateauDetectedExercises ?? "[]"); } catch { return []; } })(),
      overloadDetectedMuscles: (() => { try { return JSON.parse(r.overloadDetectedMuscles ?? "[]"); } catch { return []; } })(),
      nextSessionSuggestions: reportData?.nextSessionSuggestions ?? [],
    };
  });

  // ── Training frequency (sessions per week) ────────────────────────────
  const freqMap = new Map<string, number>();
  for (const s of sessionRows) {
    const date = new Date(s.startedAt);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(date.setDate(diff)).toISOString().slice(0, 10);
    freqMap.set(weekStart, (freqMap.get(weekStart) ?? 0) + 1);
  }
  const frequency = Array.from(freqMap.entries())
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week));

  return NextResponse.json({ volumeByWeek, recovery, reports, frequency });
}
