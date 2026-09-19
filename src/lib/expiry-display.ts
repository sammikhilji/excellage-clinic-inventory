/** Soft colorful chip classes for expiry dates, sized a bit larger for readability. */
export function expiryChipClass(status?: string | null): string {
  const base =
    "inline-flex items-center rounded-lg px-2 py-0.5 font-semibold";
  if (status === "Expired") {
    return `${base} bg-rose-50 text-rose-800 text-base`;
  }
  if (status === "Expires this month") {
    return `${base} bg-orange-50 text-orange-800 text-base`;
  }
  if (status && status.startsWith("Expiring")) {
    return `${base} bg-amber-50 text-amber-800 text-base`;
  }
  // OK / No date / unknown — still colorful amber, slightly larger
  return `${base} bg-amber-50 text-amber-800 text-base`;
}

/** Compact chip for list rows (still bigger than old 10px slate). */
export function expiryChipClassCompact(status?: string | null): string {
  const base =
    "inline-flex items-center rounded-md px-1.5 py-0.5 font-semibold text-xs";
  if (status === "Expired") {
    return `${base} bg-rose-50 text-rose-800`;
  }
  if (status === "Expires this month") {
    return `${base} bg-orange-50 text-orange-800`;
  }
  if (status && status.startsWith("Expiring")) {
    return `${base} bg-amber-50 text-amber-800`;
  }
  return `${base} bg-amber-50 text-amber-800`;
}
