import { NextRequest, NextResponse } from "next/server";
import { getStore, persistStore } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const adminUsername = String(body.adminUsername || "")
      .trim()
      .toLowerCase();
    const targetUsername = String(body.targetUsername || "")
      .trim()
      .toLowerCase();
    const newPassword = String(body.newPassword || "");

    if (!adminUsername || !targetUsername || !newPassword) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const store = await getStore();
    const admin = store.users.find((u) => u.username === adminUsername);
    if (!admin || admin.role !== "admin") {
      return NextResponse.json({ error: "Only Admin can reset passwords" }, { status: 403 });
    }
    const target = store.users.find((u) => u.username === targetUsername);
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    target.password_hash = hashPassword(newPassword);
    await persistStore(store);
    return NextResponse.json({ ok: true, username: target.username });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not reset password" }, { status: 500 });
  }
}
