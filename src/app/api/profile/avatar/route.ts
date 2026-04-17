import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type))
      return NextResponse.json({ error: "Nur JPEG, PNG oder WebP" }, { status: 400 });

    if (file.size > 3 * 1024 * 1024)
      return NextResponse.json({ error: "Maximal 3 MB" }, { status: 400 });

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filename = `${session.user.id}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");

    await mkdir(uploadDir, { recursive: true });

    // Remove old avatar files for this user (different extension)
    for (const oldExt of ["jpg", "png", "webp"]) {
      if (oldExt !== ext) {
        try { await unlink(path.join(uploadDir, `${session.user.id}.${oldExt}`)); } catch {}
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, filename), buffer);

    const avatarUrl = `/uploads/avatars/${filename}?t=${Date.now()}`;

    await db
      .update(users)
      .set({ avatarUrl, updatedAt: new Date().toISOString() })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ avatarUrl });
  } catch (err) {
    console.error("Avatar upload error:", err);
    return NextResponse.json({ error: "Upload fehlgeschlagen" }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");
    for (const ext of ["jpg", "png", "webp"]) {
      try { await unlink(path.join(uploadDir, `${session.user.id}.${ext}`)); } catch {}
    }

    await db
      .update(users)
      .set({ avatarUrl: null, updatedAt: new Date().toISOString() })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Avatar delete error:", err);
    return NextResponse.json({ error: "Löschen fehlgeschlagen" }, { status: 500 });
  }
}
