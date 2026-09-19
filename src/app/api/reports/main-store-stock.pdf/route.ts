import { NextRequest, NextResponse } from "next/server";
import { ensureLocations, getStore, persistStore } from "@/lib/db";
import { REPORT_ALLOWED_ROLES } from "@/lib/monthly-staff-report-types";
import {
  buildMainStoreReport,
  snapshotFromReport,
} from "@/lib/main-store-stock-report";
import { mainStoreReportToPdf } from "@/lib/main-store-stock-report-pdf";

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

    const date = req.nextUrl.searchParams.get("date");
    const report = buildMainStoreReport(store, date);
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await mainStoreReportToPdf(report);
    } catch (buildErr) {
      console.error("Main Store PDF build failed:", buildErr);
      const msg =
        buildErr instanceof Error ? buildErr.message : "PDF build failed";
      return NextResponse.json(
        { error: `PDF build failed: ${msg}` },
        { status: 500 }
      );
    }

    // Persist this snapshot as prev for next run
    store.main_store_report_snapshot = snapshotFromReport(report);
    await persistStore(store);

    const filename = `Main_Store_Stock_Report_${report.snapshot_date}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        "X-Report-Layout": "main-store-9page-v1",
        "X-Report-Pages": "9",
      },
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
