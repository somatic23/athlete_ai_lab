import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { equipment } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as { role?: string }).role !== "admin") return null;
  return session;
}

export async function GET() {
  const items = await db.query.equipment.findMany({
    orderBy: (e, { asc }) => [asc(e.name)],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const item = await db
    .insert(equipment)
    .values({ id: randomUUID(), ...parsed.data })
    .returning();

  return NextResponse.json(item[0], { status: 201 });
}
