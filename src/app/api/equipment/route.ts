import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { equipment } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getLocalized } from "@/lib/utils/i18n";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locale = req.nextUrl.searchParams.get("locale") ?? "de";

  const items = await db.query.equipment.findMany({
    where: eq(equipment.isActive, true),
  });

  // Return localized name/description, sorted alphabetically
  const localized = items
    .map((e) => ({
      id: e.id,
      name: getLocalized(e.nameI18n, locale),
      description: getLocalized(e.descriptionI18n, locale) || null,
      imageUrl: e.imageUrl,
      category: e.category,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  return NextResponse.json(localized);
}
