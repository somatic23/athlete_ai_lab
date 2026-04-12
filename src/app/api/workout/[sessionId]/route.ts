import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { workoutSessions, aiAnalysisReports } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { parseI18n } from "@/lib/utils/i18n";

type Params = { params: Promise<{ sessionId: string }> };

const patchSchema = z.object({
  perceivedLoad: z.enum(["light", "moderate", "heavy", "very_heavy", "maximal"]).optional(),
  satisfactionRating: z.number().int().min(1).max(5).optional(),
  feedbackText: z.string().max(1000).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

// GET /api/workout/[sessionId] — full session with sets + AI report
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = await params;

  const row = await db.query.workoutSessions.findFirst({
    where: and(
      eq(workoutSessions.id, sessionId),
      eq(workoutSessions.userId, session.user.id)
    ),
    with: {
      sets: {
        with: { exercise: true },
        orderBy: (s, { asc }) => [asc(s.createdAt)],
      },
    },
  });

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Enrich sets with exercise name
  const setsWithName = (row.sets ?? []).map((s) => {
    const names = parseI18n(s.exercise?.nameI18n ?? "{}");
    return { ...s, exerciseName: names.de || names.en || "Übung" };
  });

  // Load AI analysis report if completed
  let aiReport = null;
  if (row.completedAt) {
    const report = await db.query.aiAnalysisReports.findFirst({
      where: and(
        eq(aiAnalysisReports.sessionId, sessionId),
        eq(aiAnalysisReports.analysisType, "post_workout")
      ),
    });
    if (report?.report) {
      try { aiReport = JSON.parse(report.report); } catch {}
    }
  }

  return NextResponse.json({ ...row, sets: setsWithName, aiReport });
}

// PATCH /api/workout/[sessionId] — update session-level fields
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }

  await db.update(workoutSessions)
    .set({ ...parsed.data })
    .where(and(
      eq(workoutSessions.id, sessionId),
      eq(workoutSessions.userId, session.user.id)
    ));

  return NextResponse.json({ ok: true });
}
