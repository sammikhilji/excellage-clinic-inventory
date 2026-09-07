import { NextRequest, NextResponse } from "next/server";
import { getStore, toPublicUser } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const username = req.cookies.get("clinic_user")?.value?.toLowerCase();
  const store = await getStore();
  const me = username
    ? store.users.find((u) => u.username === username)
    : undefined;
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return NextResponse.json({
    users: store.users.map(toPublicUser),
  });
}
