import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as { role?: string }).role !== "admin") return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const items = await db.query.users.findMany({
    orderBy: (u, { desc }) => [desc(u.createdAt)],
    columns: {
      id: true, email: true, displayName: true, role: true,
      onboardingCompleted: true, createdAt: true,
      experienceLevel: true, goals: true,
    },
  });
  return NextResponse.json(items);
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const schema = z.object({
    id: z.string(),
    role: z.enum(["user", "admin"]).optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Prevent removing own admin role
  if (parsed.data.id === session.user.id && parsed.data.role === "user")
    return NextResponse.json({ error: "Cannot remove own admin role" }, { status: 400 });

  const updated = await db
    .update(users)
    .set({ role: parsed.data.role, updatedAt: new Date().toISOString() })
    .where(eq(users.id, parsed.data.id))
    .returning({ id: users.id, role: users.role });

  return NextResponse.json(updated[0]);
}
