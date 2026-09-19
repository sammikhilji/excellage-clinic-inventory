import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { generatePassword } from "@/lib/passwords";

export const dynamic = "force-dynamic";

/** Admin-only: return a candidate temporary password (not stored). */
export async function POST(req: NextRequest) {
  const username = req.cookies.get("clinic_user")?.value?.toLowerCase();
  if (!username) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const store = await getStore();
  const me = store.users.find((u) => u.username === username);
  if (!me || me.role !== "admin") {
    return NextResponse.json(
      { error: "Admin only (Mohamed)." },
      { status: 403 }
    );
  }
  return NextResponse.json({ password: generatePassword() });
}
