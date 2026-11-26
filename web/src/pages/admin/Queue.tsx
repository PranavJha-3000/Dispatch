import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Inbox, MessageSquare, Search } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "../../api/client";
import { useChangeStatus, useTicket, useTickets, useUpdateTicket } from "../../api/hooks";
import type { Priority, TicketStatus } from "../../api/types";
import { Avatar, Button, Empty, Input, PriorityMark, Select, Skeleton, StatusBadge } from "../../components/ui";
import { Conversation, Timeline } from "../../components/ticket";
import { cn, CATEGORY_LABEL, fullTime, PRIORITIES, PRIORITY_LABEL, shortId, STATUS_LABEL, STATUSES, timeAgo } from "../../lib/utils";

export function AdminQueue() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  useEffect(() => {
    const t = setTimeout(() => setSp((p) => { const n = new URLSearchParams(p); q ? n.set("q", q) : n.delete("q"); n.delete("page"); return n; }, { replace: true }), 300);
    return () => clearTimeout(t);
  }, [q, setSp]);
  const status = (sp.get("status") ?? "") as TicketStatus | "";
  const priority = (sp.get("priority") ?? "") as Priority | "";
  const sort = (sp.get("sort") ?? "updatedAt") as "createdAt" | "updatedAt" | "priority" | "status";
  const page = Number(sp.get("page") ?? 1);
  const { data, isLoading } = useTickets({ status, priority, q: sp.get("q") ?? "", sort, order: "desc", page, limit: 25 }, { refetchInterval: 15_000 });
  const set = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); n.delete("page"); return n; }, { replace: true });
  const keep = sp.toString() ? `?${sp.toString()}` : "";
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="flex h-full">
      <section className="flex w-full flex-col border-r border-line md:w-[380px] md:shrink-0" aria-label="Ticket queue">
        <header className="border-b border-line p-4">
          <div className="flex items-baseline justify-between"><h1 className="text-lg font-semibold tracking-tight">Tickets</h1><span className="text-xs text-fg-3">{data ? `${data.total} total` : ""}</span></div>
          <div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" /><Input className="h-9 pl-9" placeholder="Search title or description" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tickets" /></div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Select className="h-9 text-[13px]" value={status} onChange={(e) => set("status", e.target.value)} aria-label="Status"><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
            <Select className="h-9 text-[13px]" value={priority} onChange={(e) => set("priority", e.target.value)} aria-label="Priority"><option value="">Any priority</option>{PRIORITIES.map((s) => <option key={s} value={s}>{PRIORITY_LABEL[s]}</option>)}</Select>
            <Select className="h-9 text-[13px]" value={sort} onChange={(e) => set("sort", e.target.value)} aria-label="Sort by"><option value="updatedAt">Recent</option><option value="createdAt">Newest</option><option value="priority">Priority</option><option value="status">Status</option></Select>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          {isLoading && [0, 1, 2, 3, 4].map((i) => <div key={i} className="border-b border-line p-4"><Skeleton className="h-4 w-3/4" /><Skeleton className="mt-3 h-3 w-1/2" /></div>)}
          {data?.items.length === 0 && <Empty icon={<Inbox className="size-5" />} title="Nothing in the queue" hint="No tickets match these filters." />}
          {data?.items.map((t) => (
            <Link key={t.id} to={`/admin/tickets/${t.id}${keep}`} aria-current={t.id === id ? "true" : undefined}
              className={cn("relative block border-b border-line px-4 py-3.5 transition-colors hover:bg-ink-2", t.id === id && "bg-ink-2 before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-accent")}>
              <div className="flex items-start justify-between gap-3"><p className="line-clamp-1 text-sm font-medium">{t.title}</p><PriorityMark priority={t.priority} label={false} /></div>
              <div className="mt-2 flex items-center gap-2 text-xs text-fg-3">
                <StatusBadge status={t.status} className="py-0 text-[11px]" />
                <span className="truncate">{t.createdBy.name}</span>
                <span className="ml-auto flex shrink-0 items-center gap-2">{t.commentCount > 0 && <span className="flex items-center gap-1"><MessageSquare className="size-3" />{t.commentCount}</span>}{timeAgo(t.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
        {data && pages > 1 && (
          <footer className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-fg-3">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => set("page", String(page - 1))}>Prev</Button>
            <span>{page} / {pages}</span>
            <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => set("page", String(page + 1))}>Next</Button>
          </footer>
        )}
      </section>
      <div className={cn("min-w-0 flex-1", !id && "hidden md:block")}>{id ? <Outlet /> : <Empty icon={<Inbox className="size-5" />} title="Select a ticket" hint="Pick one from the queue to read the thread and take action." />}</div>
    </div>
  );
}

export function AdminTicketPane() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: t, isLoading, error } = useTicket(id);
  const status = useChangeStatus(id!);
  const prio = useUpdateTicket(id!);
  if (isLoading) return <div className="space-y-4 p-8"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-32" /></div>;
  if (error || !t) return <Empty icon={<Inbox className="size-5" />} title="Ticket not found" hint="It may have been deleted." />;
  const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Something went wrong");

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 py-3">
        <button onClick={() => nav(`/admin${location.search}`)} className="text-sm text-fg-3 hover:text-fg md:hidden">← Queue</button>
        <span className="font-mono text-xs text-fg-3">#{shortId(t.id)}</span>
        <div className="ml-auto flex items-center gap-2">
          <Select className="h-9 w-40 text-[13px]" aria-label="Status" value={t.status} disabled={status.isPending}
            onChange={(e) => status.mutate(e.target.value as TicketStatus, { onSuccess: () => toast.success(`Status set to ${STATUS_LABEL[e.target.value as TicketStatus]}`), onError: fail })}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
          <Select className="h-9 w-32 text-[13px]" aria-label="Priority" value={t.priority} disabled={prio.isPending}
            onChange={(e) => prio.mutate({ priority: e.target.value as Priority }, { onSuccess: () => toast.success("Priority updated"), onError: fail })}>
            {PRIORITIES.map((s) => <option key={s} value={s}>{PRIORITY_LABEL[s]}</option>)}
          </Select>
        </div>
      </header>
      <div className="grid flex-1 overflow-hidden xl:grid-cols-[1fr_280px]">
        <div className="overflow-y-auto px-8 py-7">
          <h2 className="text-2xl font-semibold leading-tight tracking-tight">{t.title}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3"><StatusBadge status={t.status} /><PriorityMark priority={t.priority} /><span className="text-xs text-fg-3">{CATEGORY_LABEL[t.category]}</span></div>
          <div className="mt-6 flex items-center gap-3 text-sm"><Avatar name={t.createdBy.name} /><div><p className="font-medium">{t.createdBy.name}</p><p className="text-xs text-fg-3" title={fullTime(t.createdAt)}>opened {timeAgo(t.createdAt)}</p></div></div>
          <p className="mt-5 whitespace-pre-wrap break-words leading-relaxed text-fg-2">{t.description}</p>
          <h3 className="mb-5 mt-10 text-sm font-semibold text-fg-2">Conversation</h3>
          <Conversation ticketId={t.id} />
        </div>
        <aside className="hidden overflow-y-auto border-l border-line p-6 xl:block"><h3 className="mb-5 text-sm font-semibold text-fg-2">Activity</h3><Timeline ticketId={t.id} /></aside>
      </div>
    </div>
  );
}
