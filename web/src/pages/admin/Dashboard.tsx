import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useStats } from "../../api/hooks";
import { Skeleton } from "../../components/ui";
import { cn, PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, STATUSES } from "../../lib/utils";

const statusBar: Record<string, string> = { OPEN: "bg-fg-2", IN_PROGRESS: "bg-info", RESOLVED: "bg-ok", CLOSED: "bg-fg-3" };
const prioBar: Record<string, string> = { LOW: "bg-fg-3", MEDIUM: "bg-fg-2", HIGH: "bg-warn", URGENT: "bg-bad" };

function Bars({ rows, tone, total }: { rows: { key: string; label: string; n: number }[]; tone: Record<string, string>; total: number }) {
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1.5 flex justify-between text-[13px]"><span className="text-fg-2">{r.label}</span><span className="tabular-nums text-fg">{r.n}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-3"><div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", tone[r.key])} style={{ width: `${total ? (r.n / total) * 100 : 0}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function Dashboard() {
  const { data: s, isLoading } = useStats();
  if (isLoading || !s) return <div className="space-y-6 p-10"><Skeleton className="h-10 w-48" /><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;
  const active = s.byStatus.OPEN + s.byStatus.IN_PROGRESS;
  const max = Math.max(1, ...s.createdLast7Days.map((d) => d.count));
  const hrs = s.avgResolutionHours;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-10 py-10">
        <h1 className="text-[28px] font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-fg-2">What's in the queue and how it's moving.</p>

        <dl className="mt-10 grid grid-cols-2 gap-x-10 gap-y-8 border-y border-line py-8 md:grid-cols-4">
          {[
            ["Total tickets", s.total],
            ["Needs attention", active],
            ["Avg. time to resolve", hrs === null ? "—" : hrs < 48 ? `${hrs.toFixed(1)}h` : `${(hrs / 24).toFixed(1)}d`],
            ["Failed deliveries", s.failedDeliveries],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-[13px] text-fg-3">{k}</dt>
              <dd className={cn("mt-1.5 text-[34px] font-semibold leading-none tracking-tight tabular-nums", k === "Failed deliveries" && (v as number) > 0 && "text-bad")}>{v}</dd>
              {k === "Failed deliveries" && (v as number) > 0 && <Link to="/admin/events?status=DEAD" className="mt-2 inline-flex items-center gap-1 text-xs text-bad hover:underline"><AlertTriangle className="size-3" />Review in inspector</Link>}
            </div>
          ))}
        </dl>

        <div className="mt-10 grid gap-12 md:grid-cols-2">
          <section><h2 className="mb-5 text-sm font-semibold text-fg-2">By status</h2><Bars total={s.total} tone={statusBar} rows={STATUSES.map((k) => ({ key: k, label: STATUS_LABEL[k], n: s.byStatus[k] }))} /></section>
          <section><h2 className="mb-5 text-sm font-semibold text-fg-2">By priority</h2><Bars total={s.total} tone={prioBar} rows={PRIORITIES.map((k) => ({ key: k, label: PRIORITY_LABEL[k], n: s.byPriority[k] }))} /></section>
        </div>

        <section className="mt-12">
          <h2 className="mb-5 text-sm font-semibold text-fg-2">Created in the last 7 days</h2>
          <div className="flex items-end gap-3 border-t border-line pt-5">
            {s.createdLast7Days.map((d) => (
              <div key={d.date} className="group flex flex-1 flex-col items-center gap-2">
                <span className="text-xs tabular-nums text-fg-2">{d.count}</span>
                <div className="flex h-24 w-full items-end justify-center"><div className="w-full max-w-10 rounded-md bg-fg/25 transition-colors group-hover:bg-fg/50" style={{ height: `${Math.max(4, (d.count / max) * 100)}%`, opacity: d.count ? 1 : 0.25 }} /></div>
                <span className="text-[11px] text-fg-3">{new Date(d.date + "T00:00").toLocaleDateString("en", { weekday: "short" })}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
