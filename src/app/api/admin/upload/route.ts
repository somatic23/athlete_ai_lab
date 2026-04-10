import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as { role?: string }).role !== "admin") return null;
  return session;
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const folder = (formData.get("folder") as string) || "misc";

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!validTypes.includes(file.type))
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });

  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });

  const ext = file.name.split(".").pop();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", folder);

  await mkdir(uploadDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, filename), buffer);

  return NextResponse.json({ url: `/uploads/${folder}/${filename}` });
}
