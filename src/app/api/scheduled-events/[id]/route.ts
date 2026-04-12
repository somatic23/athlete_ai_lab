import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { scheduledEvents } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isCompleted: z.boolean().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

// PATCH /api/scheduled-events/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  await db
    .update(scheduledEvents)
    .set({ ...parsed.data, updatedAt: new Date().toISOString() })
    .where(and(eq(scheduledEvents.id, id), eq(scheduledEvents.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}

// DELETE /api/scheduled-events/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await db
    .delete(scheduledEvents)
    .where(and(eq(scheduledEvents.id, id), eq(scheduledEvents.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}
