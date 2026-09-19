import { NextRequest, NextResponse } from "next/server";
import { ensureLocations, getStore } from "@/lib/db";
import { REPORT_ALLOWED_ROLES } from "@/lib/monthly-staff-report-types";
import {
  buildStockValueReport,
  parseAsOfDate,
  parseStockValueFilterParams,
} from "@/lib/stock-value-report";
import { stockValueReportToPdf } from "@/lib/stock-value-report-pdf";

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
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await stockValueReportToPdf(report);
    } catch (buildErr) {
      console.error("PDF build failed:", buildErr);
      const msg =
        buildErr instanceof Error ? buildErr.message : "PDF build failed";
      return NextResponse.json(
        { error: `PDF build failed: ${msg}` },
        { status: 500 }
      );
    }
    const filename = `stock-value-${asOf.date}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "X-Report-Layout": "pivot-v3",
      },
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
