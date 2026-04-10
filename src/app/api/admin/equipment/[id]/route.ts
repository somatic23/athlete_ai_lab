import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { equipment } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  isActive: z.boolean().optional(),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as { role?: string }).role !== "admin") return null;
  return session;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const updated = await db
    .update(equipment)
    .set({ ...parsed.data, updatedAt: new Date().toISOString() })
    .where(eq(equipment.id, id))
    .returning();

  if (!updated.length)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(updated[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await db.delete(equipment).where(eq(equipment.id, id));
  return NextResponse.json({ success: true });
}
