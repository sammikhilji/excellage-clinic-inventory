import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import {
  REPORT_ALLOWED_ROLES,
  buildMonthlyStaffReport,
  parseDateRange,
  parseYearMonth,
  reportToCsv,
} from "@/lib/monthly-staff-report";

export const dynamic = "force-dynamic";

function resolveRange(req: NextRequest): { from: string; to: string } | { error: string } {
  const fromQ = req.nextUrl.searchParams.get("from");
  const toQ = req.nextUrl.searchParams.get("to");
  if (fromQ || toQ) {
    return parseDateRange(fromQ, toQ);
  }
  const ym = parseYearMonth(
    req.nextUrl.searchParams.get("year"),
    req.nextUrl.searchParams.get("month")
  );
  if ("error" in ym) {
    return {
      error:
        "Provide from & to (YYYY-MM-DD), or year & month. " + ym.error,
    };
  }
  const from = `${ym.year}-${String(ym.month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
  const to = `${ym.year}-${String(ym.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export async function GET(req: NextRequest) {
  try {
    const username = req.cookies.get("clinic_user")?.value?.toLowerCase();
    if (!username) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const store = await getStore();
    const me = store.users.find((u) => u.username === username);
    if (!me || !REPORT_ALLOWED_ROLES.includes(me.role)) {
      return NextResponse.json(
        { error: "Forbidden — admin, manager, or head nurse only" },
        { status: 403 }
      );
    }

    const parsed = resolveRange(req);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const report = buildMonthlyStaffReport(store, parsed.from, parsed.to);
    const csv = reportToCsv(report);
    const filename = `staff-stock-${parsed.from}_to_${parsed.to}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
