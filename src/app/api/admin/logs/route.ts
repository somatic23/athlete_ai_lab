import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { appLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as { role?: string }).role !== "admin") return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const level = searchParams.get("level");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);

  const logs = await db.query.appLogs.findMany({
    orderBy: desc(appLogs.createdAt),
    limit,
    where: level ? eq(appLogs.level, level as "debug" | "info" | "warn" | "error") : undefined,
  });

  return NextResponse.json(logs);
}

export async function POST(req: NextRequest) {
  // Internal logging endpoint - no admin required (app can log events)
  const body = await req.json();
  const { level = "info", message, metadata, userId } = body;

  await db.insert(appLogs).values({
    level,
    message,
    metadata: metadata ? JSON.stringify(metadata) : null,
    userId: userId ?? null,
  });

  return NextResponse.json({ success: true });
}
