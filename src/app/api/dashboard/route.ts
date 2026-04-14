import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import {
  users,
  trainingPlans,
  scheduledEvents,
  muscleGroupLoadLog,
  aiAnalysisReports,
  workoutSessions,
} from "@/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { parseI18n } from "@/lib/utils/i18n";

function safeJsonArr(raw: string | null | undefined): string[] {
  try {
    const p = JSON.parse(raw ?? "[]");
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const cutoff14 = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const cutoff30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [userRow, activePlanRow, nextEventRow, loadRows, lastReportRow, recentSessionRows] =
    await Promise.all([
      // 1. User display name + locale
      db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { displayName: true, preferredLocale: true },
      }),

      // 2. Active training plan with days + exercise counts
      db.query.trainingPlans.findFirst({
        where: and(eq(trainingPlans.userId, userId), eq(trainingPlans.status, "active")),
        with: {
          days: {
            orderBy: (d, { asc }) => [asc(d.sortOrder)],
            with: { exercises: { columns: { id: true } } },
          },
        },
      }),

      // 3. Next scheduled training_day event (incomplete, today+)
      db.query.scheduledEvents.findFirst({
        where: and(
          eq(scheduledEvents.userId, userId),
          eq(scheduledEvents.eventType, "training_day"),
          eq(scheduledEvents.isCompleted, false),
          gte(scheduledEvents.scheduledDate, today),
        ),
        orderBy: (e, { asc }) => [asc(e.scheduledDate)],
        with: {
          trainingDay: {
            with: {
              exercises: {
                orderBy: (pe, { asc }) => [asc(pe.sortOrder)],
                with: { exercise: { columns: { nameI18n: true } } },
              },
            },
          },
        },
      }),

      // 4. Muscle group load log (last 14 days)
      db.select().from(muscleGroupLoadLog)
        .where(and(eq(muscleGroupLoadLog.userId, userId), gte(muscleGroupLoadLog.date, cutoff14)))
        .orderBy(desc(muscleGroupLoadLog.date)),

      // 5. Last AI report
      db.query.aiAnalysisReports.findFirst({
        where: eq(aiAnalysisReports.userId, userId),
        orderBy: (r, { desc }) => [desc(r.createdAt)],
      }),

      // 6. Recent completed sessions (last 30 days)
      db.select({
        totalVolumeKg: workoutSessions.totalVolumeKg,
        sessionRpeAvg: workoutSessions.sessionRpeAvg,
        completedAt: workoutSessions.completedAt,
      })
        .from(workoutSessions)
        .where(and(eq(workoutSessions.userId, userId), gte(workoutSessions.completedAt, cutoff30))),
    ]);

  const locale = (userRow?.preferredLocale ?? "de") as "de" | "en";

  // Active plan
  const activePlan = activePlanRow
    ? {
        id: activePlanRow.id,
        title: activePlanRow.title,
        aiGenerated: activePlanRow.aiGenerated,
        days: activePlanRow.days.map((d) => ({
          id: d.id,
          title: d.title,
          focus: d.focus ?? null,
          exerciseCount: d.exercises.length,
        })),
      }
    : null;

  // Next session
  const nextSession = nextEventRow
    ? {
        id: nextEventRow.id,
        scheduledDate: nextEventRow.scheduledDate,
        title: nextEventRow.title ?? null,
        trainingDay: nextEventRow.trainingDay
          ? {
              id: nextEventRow.trainingDay.id,
              title: nextEventRow.trainingDay.title,
              focus: nextEventRow.trainingDay.focus ?? null,
              estimatedDurationMin: nextEventRow.trainingDay.estimatedDurationMin ?? null,
              exercises: nextEventRow.trainingDay.exercises.map((pe) => {
                const names = parseI18n(pe.exercise?.nameI18n ?? "{}");
                return {
                  name: (locale === "en" ? names.en : names.de) || names.de || names.en || "",
                };
              }),
            }
          : null,
      }
    : null;

  // Recovery — latest row per muscle group
  const MUSCLE_LABELS_DE: Record<string, string> = {
    chest: "Brust",
    back: "Rücken",
    shoulders: "Schultern",
    biceps: "Bizeps",
    triceps: "Trizeps",
    forearms: "Unterarme",
    quadriceps: "Quadrizeps",
    hamstrings: "Hamstrings",
    glutes: "Gesäß",
    calves: "Waden",
    core: "Core",
    full_body: "Ganzkörper",
  };
  const MUSCLE_LABELS_EN: Record<string, string> = {
    chest: "Chest",
    back: "Back",
    shoulders: "Shoulders",
    biceps: "Biceps",
    triceps: "Triceps",
    forearms: "Forearms",
    quadriceps: "Quadriceps",
    hamstrings: "Hamstrings",
    glutes: "Glutes",
    calves: "Calves",
    core: "Core",
    full_body: "Full Body",
  };
  const muscleLabels = locale === "en" ? MUSCLE_LABELS_EN : MUSCLE_LABELS_DE;

  const latestByMuscle = new Map<string, (typeof loadRows)[number]>();
  for (const row of loadRows) {
    if (!latestByMuscle.has(row.muscleGroup)) latestByMuscle.set(row.muscleGroup, row);
  }
  const nowTs = Date.now();
  const recovery = Array.from(latestByMuscle.values())
    .map((row) => {
      const recovAt = row.fullyRecoveredAt ? new Date(row.fullyRecoveredAt).getTime() : 0;
      const recovered = recovAt <= nowTs;
      const hoursLeft = recovered ? 0 : Math.ceil((recovAt - nowTs) / 3_600_000);
      return {
        muscle: row.muscleGroup,
        label: muscleLabels[row.muscleGroup] ?? row.muscleGroup,
        recovered,
        hoursLeft,
        fullyRecoveredAt: row.fullyRecoveredAt ?? null,
      };
    })
    .sort((a, b) => Number(a.recovered) - Number(b.recovered));

  // Last report
  const lastReport = lastReportRow
    ? {
        id: lastReportRow.id,
        analysisType: lastReportRow.analysisType,
        createdAt: lastReportRow.createdAt,
        highlights: safeJsonArr(lastReportRow.highlights),
        warnings: safeJsonArr(lastReportRow.warnings),
        recommendations: safeJsonArr(lastReportRow.recommendations),
        nextSessionSuggestions: (() => {
          try {
            const r = JSON.parse(lastReportRow.report ?? "{}");
            return Array.isArray(r.nextSessionSuggestions) ? r.nextSessionSuggestions : [];
          } catch {
            return [];
          }
        })(),
      }
    : null;

  // Recent stats
  const completedRows = recentSessionRows.filter((r) => r.completedAt);
  const sessionsCount = completedRows.length;
  const totalVolumeKg = completedRows.reduce((s, r) => s + (r.totalVolumeKg ?? 0), 0);
  const rpeValues = completedRows
    .map((r) => r.sessionRpeAvg)
    .filter((v): v is number => v != null);
  const avgRpe = rpeValues.length
    ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length
    : null;

  return NextResponse.json({
    user: { displayName: userRow?.displayName ?? "" },
    activePlan,
    nextSession,
    recovery,
    lastReport,
    recentStats: {
      sessionsCount,
      totalVolumeKg: Math.round(totalVolumeKg),
      avgRpe: avgRpe ? Math.round(avgRpe * 10) / 10 : null,
    },
  });
}
