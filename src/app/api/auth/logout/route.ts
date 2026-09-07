import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("clinic_auth", "", { path: "/", maxAge: 0 });
  res.cookies.set("clinic_user", "", { path: "/", maxAge: 0 });
  return res;
}
