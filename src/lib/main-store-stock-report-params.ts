import type { NextRequest } from "next/server";
import type { MainStoreReportOptions } from "./main-store-stock-report";

/** Parse from/to (+ legacy date) and optional filters from query string. */
export function parseMainStoreReportParams(
  req: NextRequest
): MainStoreReportOptions | { error: string } {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to") || sp.get("date");
  const category = sp.get("category");
  const group = sp.get("group") ?? sp.get("scope");
  const location = sp.get("location") || sp.get("department");

  const ymd = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

  if (from && !ymd(from)) {
    return { error: "from must be YYYY-MM-DD" };
  }
  if (to && !ymd(to)) {
    return { error: "to must be YYYY-MM-DD" };
  }
  if (from && to && from > to) {
    return { error: "From must be on or before To" };
  }

  const asFilter = (s: string | null) => {
    if (!s) return null;
    const trimmed = s.trim();
    if (!trimmed || trimmed.toLowerCase() === "all") return null;
    return trimmed;
  };

  return {
    from: from || null,
    to: to || null,
    category: asFilter(category),
    // Missing → products default; empty string → All
    group: group == null ? "products" : group,
    location: asFilter(location),
  };
}
