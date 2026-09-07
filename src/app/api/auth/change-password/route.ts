import { NextRequest, NextResponse } from "next/server";
import { getStore, persistStore } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/passwords";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = String(body.username || "")
      .trim()
      .toLowerCase();
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");

    if (!username || !currentPassword || !newPassword) {
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
    const user = store.users.find((u) => u.username === username);
    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
      );
    }

    user.password_hash = hashPassword(newPassword);
    await persistStore(store);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not save password" }, { status: 500 });
  }
}
