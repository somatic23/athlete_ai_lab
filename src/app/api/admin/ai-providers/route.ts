import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { aiProviders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";

const PROVIDERS = ["openai", "anthropic", "gemini", "openrouter", "ollama"] as const;

const schema = z.object({
  provider: z.enum(PROVIDERS),
  displayName: z.string().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  modelId: z.string().min(1),
  isActive: z.boolean().optional().default(false),
  isDefault: z.boolean().optional().default(false),
  config: z.record(z.string(), z.unknown()).optional(),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as { role?: string }).role !== "admin") return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const items = await db.query.aiProviders.findMany({
    orderBy: (p, { asc }) => [asc(p.displayName)],
  });
  // Mask API keys in response
  return NextResponse.json(
    items.map((p) => ({ ...p, apiKey: p.apiKey ? "***" : null }))
  );
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { config, ...rest } = parsed.data;

  // If setting as default, unset others first
  if (rest.isDefault) {
    await db.update(aiProviders).set({ isDefault: false });
  }

  const item = await db
    .insert(aiProviders)
    .values({
      id: randomUUID(),
      ...rest,
      config: config ? JSON.stringify(config) : null,
    })
    .returning();

  return NextResponse.json({ ...item[0], apiKey: item[0].apiKey ? "***" : null }, { status: 201 });
}
