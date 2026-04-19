import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { exercises } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/exercises — active exercises for pickers (no admin required)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await db.query.exercises.findMany({
    where: eq(exercises.isActive, true),
    columns: {
      id: true,
      nameI18n: true,
      primaryMuscleGroup: true,
      trackingType: true,
    },
  });

  // Sort by German name
  items.sort((a, b) => {
    const nameA = (() => { try { return JSON.parse(a.nameI18n).de ?? ""; } catch { return ""; } })();
    const nameB = (() => { try { return JSON.parse(b.nameI18n).de ?? ""; } catch { return ""; } })();
    return nameA.localeCompare(nameB, "de");
  });

  return NextResponse.json(items);
}
