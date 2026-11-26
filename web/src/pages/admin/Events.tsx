import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, Pause, Play, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { useEvents, useRetryDelivery } from "../../api/hooks";
import type { DeliveryStatus, EventRow, EventType } from "../../api/types";
import { Avatar, Button, DeliveryBadge, Select, Skeleton } from "../../components/ui";
import { cn, EVENT_LABEL, EVENT_TYPES, fullTime, shortId, timeAgo } from "../../lib/utils";

const DELIVERY: DeliveryStatus[] = ["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "DEAD"];

function rollup(e: EventRow): DeliveryStatus {
  const s = e.deliveries.map((d) => d.status);
  for (const k of ["DEAD", "FAILED", "RUNNING", "PENDING"] as const) if (s.includes(k)) return k;
  return "SUCCEEDED";
}
const dot: Record<DeliveryStatus, string> = { SUCCEEDED: "bg-ok", PENDING: "bg-fg-3", RUNNING: "bg-info live-dot", FAILED: "bg-warn", DEAD: "bg-bad" };

/** Minimal JSON syntax colouring; payloads are small and always valid JSON. */
function Json({ value }: { value: unknown }) {
  const html = JSON.stringify(value, null, 2)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g, (m, str, colon, lit, num) =>
      str ? (colon ? `<span class="text-accent-2">${str}</span>${colon}` : `<span class="text-ok">${str}</span>`) : lit ? `<span class="text-warn">${lit}</span>` : num ? `<span class="text-info">${num}</span>` : m);
  return <pre className="overflow-x-auto rounded-lg border border-line bg-ink-0 p-4 font-mono text-[12.5px] leading-relaxed text-fg-2" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Detail({ ev, onClose }: { ev: EventRow; onClose: () => void }) {
  const retry = useRetryDelivery();
  const [copied, setCopied] = useState(false);
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col border-l border-line-2 bg-ink-1 shadow-2xl shadow-black/60 data-[state=open]:animate-[slide-in_.28s_var(--ease-out-quint)]">
          <header className="flex items-start justify-between gap-4 border-b border-line p-6">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold">{EVENT_LABEL[ev.type]}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-fg-3">
                <span className="font-mono">#{ev.seq}</span> · {fullTime(ev.createdAt)}
              </Dialog.Description>
            </div>
            <Dialog.Close className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-ink-3 hover:text-fg" aria-label="Close"><X className="size-4" /></Dialog.Close>
          </header>
          <div className="flex-1 space-y-8 overflow-y-auto p-6">
            <dl className="grid grid-cols-[88px_1fr] gap-y-3 text-sm">
              <dt className="text-fg-3">Actor</dt><dd>{ev.actor ? <span className="inline-flex items-center gap-2"><Avatar name={ev.actor.name} admin={ev.actor.role === "ADMIN"} size={20} />{ev.actor.name}<span className="text-xs text-fg-3">{ev.actor.role.toLowerCase()}</span></span> : <span className="text-fg-3">System</span>}</dd>
              <dt className="text-fg-3">Ticket</dt><dd>{ev.ticket ? <Link className="text-accent-2 hover:underline" to={`/admin/tickets/${ev.ticket.id}`}>{ev.ticket.title}</Link> : "—"}</dd>
              <dt className="text-fg-3">Event id</dt><dd className="font-mono text-xs text-fg-2">{ev.id}</dd>
            </dl>

            <section>
              <h3 className="mb-3 text-sm font-semibold text-fg-2">Delivery trace</h3>
              <ul className="space-y-2.5">
                {ev.deliveries.map((d) => (
                  <li key={d.id} className="rounded-lg border border-line bg-ink-2 p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3"><span className="font-mono text-[13px]">{d.handler}</span><DeliveryBadge status={d.status} /></div>
                      {(d.status === "FAILED" || d.status === "DEAD") && (
                        <Button size="sm" loading={retry.isPending && retry.variables === d.id} onClick={() => retry.mutate(d.id, { onSuccess: () => toast.success("Delivery re-queued"), onError: (e) => toast.error((e as Error).message) })}><RotateCw className="size-3.5" />Retry</Button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-fg-3">{d.attempts} attempt{d.attempts === 1 ? "" : "s"}{d.durationMs != null && ` · ${d.durationMs} ms`}{d.status === "FAILED" && ` · next try ${timeAgo(d.nextAttemptAt)}`}</p>
                    {d.lastError && <p className="mt-2 break-words rounded-md bg-bad/10 px-2.5 py-1.5 font-mono text-xs text-bad">{d.lastError}</p>}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-fg-2">Payload</h3>
                <button className="flex items-center gap-1.5 text-xs text-fg-3 hover:text-fg" onClick={() => { void navigator.clipboard.writeText(JSON.stringify(ev.payload, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                  {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}{copied ? "Copied" : "Copy"}
                </button>
              </div>
              <Json value={ev.payload} />
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Events() {
  const [sp, setSp] = useSearchParams();
  const type = (sp.get("type") ?? "") as EventType | "";
  const status = (sp.get("status") ?? "") as DeliveryStatus | "";
  const page = Number(sp.get("page") ?? 1);
  const [live, setLive] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useEvents({ type, status, page, limit: 30 }, live);
  const set = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); n.delete("page"); return n; }, { replace: true });
  const open = data?.items.find((e) => e.id === openId);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-8 py-5">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold tracking-tight">Event Inspector</h1>
          <p className="mt-0.5 text-sm text-fg-3">Every change the system recorded, and what happened to each delivery.</p>
        </div>
        <Select className="h-9 w-44 text-[13px]" value={type} onChange={(e) => set("type", e.target.value)} aria-label="Event type"><option value="">All events</option>{EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_LABEL[t]}</option>)}</Select>
        <Select className="h-9 w-40 text-[13px]" value={status} onChange={(e) => set("status", e.target.value)} aria-label="Delivery status"><option value="">Any delivery</option>{DELIVERY.map((t) => <option key={t} value={t}>{t.toLowerCase()}</option>)}</Select>
        <Button size="sm" onClick={() => setLive((l) => !l)} aria-pressed={live}>
          {live ? <><span className="size-1.5 rounded-full bg-ok live-dot" />Live<Pause className="size-3.5" /></> : <><Play className="size-3.5" />Paused</>}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-ink-0 text-xs text-fg-3">
            <tr className="border-b border-line"><th className="w-16 px-8 py-2.5 font-medium">Seq</th><th className="py-2.5 font-medium">Event</th><th className="py-2.5 font-medium">Ticket</th><th className="py-2.5 font-medium">Actor</th><th className="py-2.5 font-medium">Handlers</th><th className="px-8 py-2.5 text-right font-medium">When</th></tr>
          </thead>
          <tbody>
            {isLoading && [0, 1, 2, 3, 4, 5].map((i) => <tr key={i}><td colSpan={6} className="px-8 py-2"><Skeleton className="h-8" /></td></tr>)}
            {data?.items.length === 0 && <tr><td colSpan={6} className="px-8 py-16 text-center text-fg-3">No events match these filters.</td></tr>}
            {data?.items.map((e) => (
              <tr key={e.id} tabIndex={0} onClick={() => setOpenId(e.id)} onKeyDown={(k) => k.key === "Enter" && setOpenId(e.id)} className="cursor-pointer border-b border-line transition-colors hover:bg-ink-2 focus-visible:bg-ink-2">
                <td className="px-8 py-3 font-mono text-xs text-fg-3">{e.seq}</td>
                <td className="py-3"><span className="inline-flex items-center gap-2.5 font-medium"><span className={cn("size-2 rounded-full", dot[rollup(e)])} title={`Overall: ${rollup(e).toLowerCase()}`} />{EVENT_LABEL[e.type]}</span></td>
                <td className="max-w-56 truncate py-3 text-fg-2">{e.ticket?.title ?? "—"}</td>
                <td className="py-3 text-fg-2">{e.actor?.name ?? "System"}</td>
                <td className="py-3"><span className="flex gap-1.5">{e.deliveries.map((d) => <span key={d.id} className="inline-flex items-center gap-1.5 rounded-md bg-ink-3 px-1.5 py-0.5 font-mono text-[11px] text-fg-2"><span className={cn("size-1.5 rounded-full", dot[d.status])} />{d.handler}</span>)}</span></td>
                <td className="px-8 py-3 text-right text-xs text-fg-3" title={fullTime(e.createdAt)}>{timeAgo(e.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && pages > 1 && (
          <div className="flex items-center justify-between px-8 py-4 text-xs text-fg-3">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => set("page", String(page - 1))}>Newer</Button>
            <span>{data.total} events · page {page} of {pages}</span>
            <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => set("page", String(page + 1))}>Older</Button>
          </div>
        )}
      </div>
      {open && <Detail ev={open} onClose={() => setOpenId(null)} />}
      <span className="sr-only">{shortId("")}</span>
    </div>
  );
}
