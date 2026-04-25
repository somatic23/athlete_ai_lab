import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import {
  users,
  userEquipment,
  trainingPlans,
  trainingDays,
  planExercises,
  scheduledEvents,
  workoutSessions,
  workoutSets,
  workoutExerciseSummary,
  personalRecords,
  chatConversations,
  chatMessages,
  muscleGroupLoadLog,
  progressionSnapshots,
  aiAnalysisReports,
  appLogs,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as { role?: string }).role !== "admin") return null;
  return session;
}

// DELETE /api/admin/users/[id] — hard-delete a user and all their data
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: targetId } = await params;

  // Prevent self-deletion
  if (targetId === session.user.id)
    return NextResponse.json({ error: "Eigenen Account nicht löschbar." }, { status: 400 });

  const target = await db.query.users.findFirst({
    where: eq(users.id, targetId),
    columns: { id: true, displayName: true },
  });
  if (!target) return NextResponse.json({ error: "User nicht gefunden." }, { status: 404 });

  // Explicit deletion in dependency order — avoids FK constraint violations from
  // workout_sets.plan_exercise_id (no onDelete) and app_logs.user_id (no onDelete).
  // Wrapped in a transaction so the user is either fully deleted or not at all.
  db.transaction((tx) => {
    // 1. Nullify app_logs.user_id — retain admin/debug logs but sever the link
    tx.update(appLogs).set({ userId: null }).where(eq(appLogs.userId, targetId)).run();

    // 2. workout_sets and workout_exercise_summary reference workout_sessions
    //    workout_sets also references plan_exercises (no onDelete) — must go first
    const sessionIds = tx
      .select({ id: workoutSessions.id })
      .from(workoutSessions)
      .where(eq(workoutSessions.userId, targetId))
      .all()
      .map((r) => r.id);

    // 3. Personal records reference workout_sets — must go before workout_sets
    tx.delete(personalRecords).where(eq(personalRecords.userId, targetId)).run();

    if (sessionIds.length > 0) {
      tx.delete(workoutSets).where(inArray(workoutSets.sessionId, sessionIds)).run();
      tx.delete(workoutExerciseSummary)
        .where(inArray(workoutExerciseSummary.sessionId, sessionIds))
        .run();
    }

    // 4. AI analysis reports reference both user and session
    tx.delete(aiAnalysisReports).where(eq(aiAnalysisReports.userId, targetId)).run();

    // 5. Workout sessions (now safe — sets/summaries already gone)
    tx.delete(workoutSessions).where(eq(workoutSessions.userId, targetId)).run();

    // 6. Chat messages → conversations
    const convIds = tx
      .select({ id: chatConversations.id })
      .from(chatConversations)
      .where(eq(chatConversations.userId, targetId))
      .all()
      .map((r) => r.id);

    if (convIds.length > 0) {
      tx.delete(chatMessages).where(inArray(chatMessages.conversationId, convIds)).run();
    }
    tx.delete(chatConversations).where(eq(chatConversations.userId, targetId)).run();

    // 7. plan_exercises → training_days → training_plans
    //    workout_sets (already deleted above) referenced plan_exercises, so this is now safe
    const planIds = tx
      .select({ id: trainingPlans.id })
      .from(trainingPlans)
      .where(eq(trainingPlans.userId, targetId))
      .all()
      .map((r) => r.id);

    if (planIds.length > 0) {
      const dayIds = tx
        .select({ id: trainingDays.id })
        .from(trainingDays)
        .where(inArray(trainingDays.planId, planIds))
        .all()
        .map((r) => r.id);

      if (dayIds.length > 0) {
        tx.delete(planExercises).where(inArray(planExercises.trainingDayId, dayIds)).run();
        tx.delete(trainingDays).where(inArray(trainingDays.planId, planIds)).run();
      }
      tx.delete(trainingPlans).where(inArray(trainingPlans.id, planIds)).run();
    }

    // 8. Scheduled events
    tx.delete(scheduledEvents).where(eq(scheduledEvents.userId, targetId)).run();

    // 9. Analytics
    tx.delete(muscleGroupLoadLog).where(eq(muscleGroupLoadLog.userId, targetId)).run();
    tx.delete(progressionSnapshots).where(eq(progressionSnapshots.userId, targetId)).run();

    // 10. User ↔ equipment join rows
    tx.delete(userEquipment).where(eq(userEquipment.userId, targetId)).run();

    // 11. The user itself
    tx.delete(users).where(eq(users.id, targetId)).run();
  });

  return NextResponse.json({ deleted: targetId, displayName: target.displayName });
}
