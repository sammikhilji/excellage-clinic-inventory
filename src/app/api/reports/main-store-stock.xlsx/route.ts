import { NextRequest, NextResponse } from "next/server";
import { ensureLocations, getStore, persistStore } from "@/lib/db";
import { REPORT_ALLOWED_ROLES } from "@/lib/monthly-staff-report-types";
import {
  buildMainStoreReport,
  mainStoreReportToXlsx,
  snapshotFromReport,
} from "@/lib/main-store-stock-report";
import { parseMainStoreReportParams } from "@/lib/main-store-stock-report-params";

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

    const parsed = parseMainStoreReportParams(req);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const report = buildMainStoreReport(store, parsed);
    let xlsxBytes: Buffer;
    try {
      xlsxBytes = await mainStoreReportToXlsx(report);
    } catch (buildErr) {
      console.error("Main Store XLSX build failed:", buildErr);
      const msg =
        buildErr instanceof Error ? buildErr.message : "XLSX build failed";
      return NextResponse.json(
        { error: `Excel build failed: ${msg}` },
        { status: 500 }
      );
    }

    store.main_store_report_snapshot = snapshotFromReport(report);
    await persistStore(store);

    const filename = `Main_Store_Stock_Report_${report.prev_date}_to_${report.snapshot_date}.xlsx`;
    return new NextResponse(new Uint8Array(xlsxBytes), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        "X-Report-Layout": "main-store-xlsx-v1",
        "X-Report-From": report.prev_date,
        "X-Report-To": report.snapshot_date,
      },
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
