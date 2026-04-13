import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { equipment, EQUIPMENT_CATEGORIES } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { parseI18n, stringifyI18n } from "@/lib/utils/i18n";

const i18nField = z.object({ de: z.string().min(1), en: z.string().min(1) }).optional();
const i18nOptional = z.object({ de: z.string(), en: z.string() }).optional();

const schema = z.object({
  name: i18nField,
  description: i18nOptional,
  imageUrl: z.string().optional(),
  category: z.enum(EQUIPMENT_CATEGORIES).nullable().optional(),
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

  const { name, description, ...rest } = parsed.data;
  const updated = await db
    .update(equipment)
    .set({
      ...rest,
      ...(name && { nameI18n: stringifyI18n(name) }),
      ...(description !== undefined && {
        descriptionI18n: description ? stringifyI18n(description) : null,
      }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(equipment.id, id))
    .returning();

  if (!updated.length)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...updated[0],
    name: parseI18n(updated[0].nameI18n),
    description: parseI18n(updated[0].descriptionI18n),
  });
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
