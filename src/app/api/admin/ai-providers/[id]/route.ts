import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { aiProviders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const schema = z.object({
  displayName: z.string().min(1).optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  modelId: z.string().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
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

  if (parsed.data.isDefault) {
    await db.update(aiProviders).set({ isDefault: false });
  }

  const updated = await db
    .update(aiProviders)
    .set(parsed.data)
    .where(eq(aiProviders.id, id))
    .returning();

  if (!updated.length)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ...updated[0], apiKey: updated[0].apiKey ? "***" : null });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await db.delete(aiProviders).where(eq(aiProviders.id, id));
  return NextResponse.json({ success: true });
}
