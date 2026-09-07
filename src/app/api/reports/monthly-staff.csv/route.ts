import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import {
  REPORT_ALLOWED_ROLES,
  buildMonthlyStaffReport,
  parseYearMonth,
  reportToCsv,
} from "@/lib/monthly-staff-report";

export const dynamic = "force-dynamic";

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

    const parsed = parseYearMonth(
      req.nextUrl.searchParams.get("year"),
      req.nextUrl.searchParams.get("month")
    );
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const report = buildMonthlyStaffReport(store, parsed.year, parsed.month);
    const csv = reportToCsv(report);
    const filename = `monthly-staff-${parsed.year}-${String(parsed.month).padStart(2, "0")}.csv`;
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
