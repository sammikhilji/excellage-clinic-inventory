export default function StatusBadge({ status }: { status: string }) {
  let cls = "bg-slate-100 text-slate-700";
  if (status === "OK") cls = "bg-emerald-50 text-emerald-700";
  else if (status === "Expired") cls = "bg-rose-100 text-rose-800";
  else if (status === "Expires this month") cls = "bg-orange-100 text-orange-800";
  else if (status.startsWith("Expiring")) cls = "bg-amber-100 text-amber-800";
  else if (status === "No date") cls = "bg-slate-100 text-slate-500";

  return <span className={`badge ${cls}`}>{status}</span>;
}
