import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { exercises } from "@/db/schema";
import { z } from "zod";
import { randomUUID } from "crypto";
import { parseI18n, stringifyI18n } from "@/lib/utils/i18n";

const MUSCLE_GROUPS = [
  "chest","back","shoulders","biceps","triceps","forearms",
  "quadriceps","hamstrings","glutes","calves","core","full_body",
] as const;

const i18nField = z.object({ de: z.string().min(1), en: z.string().min(1) });
const i18nOptional = z.object({ de: z.string(), en: z.string() }).optional();

const schema = z.object({
  name: i18nField,
  description: i18nOptional,
  imageUrl: z.string().optional(),
  primaryMuscleGroup: z.enum(MUSCLE_GROUPS),
  secondaryMuscleGroups: z.array(z.string()).optional(),
  requiredEquipmentIds: z.array(z.string()).optional(),
  instructions: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as { role?: string }).role !== "admin") return null;
  return session;
}

export async function GET() {
  const items = await db.query.exercises.findMany();
  return NextResponse.json(
    items
      .map((e) => ({
        ...e,
        name: parseI18n(e.nameI18n),
        description: parseI18n(e.descriptionI18n),
      }))
      .sort((a, b) => a.name.de.localeCompare(b.name.de, "de"))
  );
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { name, description, secondaryMuscleGroups, requiredEquipmentIds, ...rest } = parsed.data;
  const item = await db
    .insert(exercises)
    .values({
      id: randomUUID(),
      nameI18n: stringifyI18n(name),
      descriptionI18n: description ? stringifyI18n(description) : null,
      secondaryMuscleGroups: JSON.stringify(secondaryMuscleGroups ?? []),
      requiredEquipmentIds: JSON.stringify(requiredEquipmentIds ?? []),
      ...rest,
    })
    .returning();

  return NextResponse.json(
    { ...item[0], name: parseI18n(item[0].nameI18n), description: parseI18n(item[0].descriptionI18n) },
    { status: 201 }
  );
}
