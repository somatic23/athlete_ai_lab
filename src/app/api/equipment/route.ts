import { NextResponse } from "next/server";
import { db } from "@/db";
import { equipment } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const items = await db.query.equipment.findMany({
    where: eq(equipment.isActive, true),
    orderBy: (e, { asc }) => [asc(e.name)],
  });
  return NextResponse.json(items);
}
