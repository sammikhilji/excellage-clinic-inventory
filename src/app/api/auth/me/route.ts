import { NextRequest, NextResponse } from "next/server";
import { getStore, toPublicUser } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const username = req.cookies.get("clinic_user")?.value?.toLowerCase();
  if (!username) {
    return NextResponse.json({ user: null });
  }
  const store = await getStore();
  const user = store.users.find((u) => u.username === username);
  if (!user) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({ user: toPublicUser(user) });
}
