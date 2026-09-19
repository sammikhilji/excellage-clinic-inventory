import { NextRequest, NextResponse } from "next/server";
import { ensureLocations, getStore } from "@/lib/db";
import { REPORT_ALLOWED_ROLES } from "@/lib/monthly-staff-report-types";
import {
  buildStockValueReport,
  parseAsOfDate,
  parseStockValueFilterParams,
  stockValueReportToCsv,
} from "@/lib/stock-value-report";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const username = req.cookies.get("clinic_user")?.value?.toLowerCase();
    if (!username) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const store = await getStore();
    ensureLocations(store);
    const me = store.users.find((u) => u.username === username);
    if (!me || !REPORT_ALLOWED_ROLES.includes(me.role)) {
      return NextResponse.json(
        { error: "Forbidden — admin, manager, or head nurse only" },
        { status: 403 }
      );
    }

    const asOf = parseAsOfDate(req.nextUrl.searchParams.get("date"));
    if ("error" in asOf) {
      return NextResponse.json({ error: asOf.error }, { status: 400 });
    }

    const filters = parseStockValueFilterParams(req.nextUrl.searchParams);
    if ("error" in filters) {
      return NextResponse.json({ error: filters.error }, { status: 400 });
    }

    if (filters.location && !store.locations.includes(filters.location)) {
      return NextResponse.json(
        { error: `Unknown department: ${filters.location}` },
        { status: 400 }
      );
    }

    const report = buildStockValueReport(store, asOf.date, filters);
    const csv = stockValueReportToCsv(report);
    const filename = `stock-value-${asOf.date}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "X-Report-Layout": "table-v2",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
