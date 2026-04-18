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
import { eq, and, gte, lte, desc } from "drizzle-orm";
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
  const cutoff30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const cutoff30Date = cutoff30.slice(0, 10);

  // Current week Mon–Sun for 7-day schedule strip
  const weekDay = now.getDay(); // 0=Sun
  const daysToMon = weekDay === 0 ? -6 : 1 - weekDay;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + daysToMon);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const [userRow, activePlanRow, nextEventRow, loadRows, lastReportRow, recentSessionRows, weekEventRows] =
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

      // 4. Muscle group load log (last 30 days — used for both recovery card and chart)
      db.select().from(muscleGroupLoadLog)
        .where(and(eq(muscleGroupLoadLog.userId, userId), gte(muscleGroupLoadLog.date, cutoff30Date)))
        .orderBy(desc(muscleGroupLoadLog.date)),

      // 5. Last AI report
      db.query.aiAnalysisReports.findFirst({
        where: eq(aiAnalysisReports.userId, userId),
        orderBy: (r, { desc }) => [desc(r.createdAt)],
      }),

      // 6. Recent completed sessions (last 30 days)
      db.select({
        totalVolumeKg: workoutSessions.totalVolumeKg,
        totalSets: workoutSessions.totalSets,
        durationSeconds: workoutSessions.durationSeconds,
        sessionRpeAvg: workoutSessions.sessionRpeAvg,
        completedAt: workoutSessions.completedAt,
      })
        .from(workoutSessions)
        .where(and(eq(workoutSessions.userId, userId), gte(workoutSessions.completedAt, cutoff30))),

      // 7. This week's scheduled events (Mon–Sun) for 7-day strip
      db.query.scheduledEvents.findMany({
        where: and(
          eq(scheduledEvents.userId, userId),
          gte(scheduledEvents.scheduledDate, weekStartStr),
          lte(scheduledEvents.scheduledDate, weekEndStr),
        ),
        columns: {
          scheduledDate: true,
          title: true,
          eventType: true,
          isCompleted: true,
        },
        orderBy: (e, { asc }) => [asc(e.scheduledDate)],
      }),
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
      // pct: 100 = fully recovered, 0 = freshly trained. Assumes 72h max window.
      const pct = recovered ? 100 : Math.max(0, Math.round(100 - (hoursLeft / 72) * 100));
      return {
        muscle: row.muscleGroup,
        label: muscleLabels[row.muscleGroup] ?? row.muscleGroup,
        recovered,
        hoursLeft,
        pct,
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

  // Build 30-day training load series (volume, duration, total sets)
  const byDay = new Map<string, { volumeKg: number; sets: number; durationSec: number }>();
  for (const row of completedRows) {
    if (!row.completedAt) continue;
    const day = row.completedAt.slice(0, 10);
    const existing = byDay.get(day) ?? { volumeKg: 0, sets: 0, durationSec: 0 };
    byDay.set(day, {
      volumeKg: existing.volumeKg + (row.totalVolumeKg ?? 0),
      sets: existing.sets + (row.totalSets ?? 0),
      durationSec: existing.durationSec + (row.durationSeconds ?? 0),
    });
  }
  const trainingLoad = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    const entry = byDay.get(dateStr);
    return {
      date: dateStr,
      volumeKg: entry ? Math.round(entry.volumeKg) : 0,
      sets: entry?.sets ?? 0,
      durationMin: entry ? Math.round(entry.durationSec / 60) : 0,
    };
  });

  // Build 30-day sets-per-muscle-group series (for stacked chart)
  const ALL_MUSCLES = [
    "chest", "back", "shoulders", "biceps", "triceps", "forearms",
    "quadriceps", "hamstrings", "glutes", "calves", "core", "full_body",
  ] as const;
  const muscleSetsByDay = new Map<string, Map<string, number>>();
  for (const row of loadRows) {
    if (!muscleSetsByDay.has(row.date)) muscleSetsByDay.set(row.date, new Map());
    const prev = muscleSetsByDay.get(row.date)!.get(row.muscleGroup) ?? 0;
    muscleSetsByDay.get(row.date)!.set(row.muscleGroup, prev + (row.totalSets ?? 0));
  }
  const muscleLoad = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    const dayData = muscleSetsByDay.get(dateStr);
    const entry: Record<string, number | string> = { date: dateStr };
    for (const m of ALL_MUSCLES) {
      entry[m] = dayData?.get(m) ?? 0;
    }
    return entry;
  });

  // Training streak: consecutive non-rest days going backward from today
  const trainingStreak = (() => {
    let n = 0;
    for (let i = trainingLoad.length - 1; i >= 0; i--) {
      if (trainingLoad[i].volumeKg > 0) n++;
      else break;
    }
    return n;
  })();

  // 7-day schedule strip
  const weekSchedule = (() => {
    const days: {
      date: string;
      dayShort: string;
      dayNum: number;
      isToday: boolean;
      title: string | null;
      isRest: boolean;
      isCompleted: boolean;
      rpe: number | null;
    }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const event = weekEventRows.find((e) => e.scheduledDate === dateStr);
      days.push({
        date: dateStr,
        dayShort: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()],
        dayNum: d.getDate(),
        isToday: dateStr === today,
        title: event?.title ?? null,
        isRest: event?.eventType === "rest",
        isCompleted: event?.isCompleted ?? false,
        rpe: null,
      });
    }
    return days;
  })();

  return NextResponse.json({
    user: { displayName: userRow?.displayName ?? "" },
    activePlan,
    nextSession,
    recovery,
    lastReport,
    trainingLoad,
    muscleLoad,
    trainingStreak,
    weekSchedule,
    recentStats: {
      sessionsCount,
      totalVolumeKg: Math.round(totalVolumeKg),
      avgRpe: avgRpe ? Math.round(avgRpe * 10) / 10 : null,
    },
  });
}
