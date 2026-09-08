/** Friendlier activity type labels for UI (colors stay caller-side). */
export function activityTypeLabel(type: string): string {
  switch (type) {
    case "receive":
      return "Added";
    case "transfer":
      return "Transfer";
    case "consumption":
      return "Use";
    case "sale":
      return "Sale";
    case "adjust":
      return "Adjust";
    default:
      return type;
  }
}

/** YYYY-MM-DD from stored created_at ("YYYY-MM-DD HH:MM:SS" or ISO). */
export function dateOnly(createdAt: string): string {
  if (!createdAt) return "";
  return createdAt.slice(0, 10);
}

/** Optional time HH:MM (or HH:MM:SS) after the date portion. */
export function timeOnly(createdAt: string): string | null {
  if (!createdAt || createdAt.length < 16) return null;
  const rest = createdAt.slice(11).trim();
  if (!rest) return null;
  // Prefer HH:MM for readability
  return rest.length >= 5 ? rest.slice(0, 5) : rest;
}

/** Primary label: "Date: YYYY-MM-DD". */
export function formatDateLabel(createdAt: string): string {
  const d = dateOnly(createdAt);
  return d ? `Date: ${d}` : "Date: —";
}
