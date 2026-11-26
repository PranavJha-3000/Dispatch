import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Inbox, MessageSquare, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { ApiError } from "../../api/client";
import { useCreateTicket, useDeleteTicket, useTicket, useTickets, useUpdateTicket } from "../../api/hooks";
import type { Category, Priority, TicketStatus } from "../../api/types";
import { Button, Empty, Field, Input, Select, Skeleton, StatusBadge, PriorityMark, Textarea } from "../../components/ui";
import { Conversation, StatusStepper, Timeline } from "../../components/ticket";
import { CATEGORIES, CATEGORY_LABEL, fullTime, PRIORITIES, PRIORITY_LABEL, shortId, STATUS_LABEL, STATUSES, timeAgo } from "../../lib/utils";

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export function TicketList() {
  const [sp, setSp] = useSearchParams();
  const status = (sp.get("status") ?? "") as TicketStatus | "";
  const page = Number(sp.get("page") ?? 1);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const dq = useDebounced(q);
  useEffect(() => {
    setSp((p) => { const n = new URLSearchParams(p); dq ? n.set("q", dq) : n.delete("q"); n.delete("page"); return n; }, { replace: true });
  }, [dq, setSp]);
  const { data, isLoading } = useTickets({ status, q: sp.get("q") ?? "", page, limit: 10, sort: "updatedAt", order: "desc" });
  const set = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); n.delete("page"); return n; });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold tracking-tight">Your tickets</h1>
        <p className="mt-1 text-fg-2">Everything you've raised with support, and where it stands.</p>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <Input className="pl-9" placeholder="Search tickets" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tickets" />
        </div>
        <Select className="w-44" value={status} onChange={(e) => set("status", e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-ink-1">
        {isLoading && [0, 1, 2, 3].map((i) => <div key={i} className="border-b border-line p-5 last:border-0"><Skeleton className="h-5 w-2/3" /><Skeleton className="mt-3 h-4 w-1/3" /></div>)}
        {data?.items.length === 0 && (
          <Empty icon={<Inbox className="size-5" />} title={sp.get("q") || status ? "No tickets match" : "No tickets yet"} hint={sp.get("q") || status ? "Try a different search or clear the filter." : "When something's not working, raise a ticket and we'll get back to you."} action={!sp.get("q") && !status && <Link to="/app/new"><Button variant="primary">Raise a ticket</Button></Link>} />
        )}
        {data?.items.map((t) => (
          <Link key={t.id} to={`/app/tickets/${t.id}`} className="group flex items-center gap-4 border-b border-line px-5 py-4 transition-colors last:border-0 hover:bg-ink-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium group-hover:text-white">{t.title}</p>
              <p className="mt-1 flex items-center gap-3 text-xs text-fg-3">
                <span>{CATEGORY_LABEL[t.category]}</span>
                <span>Updated {timeAgo(t.updatedAt)}</span>
                {t.commentCount > 0 && <span className="flex items-center gap-1"><MessageSquare className="size-3" />{t.commentCount}</span>}
              </p>
            </div>
            <PriorityMark priority={t.priority} label={false} />
            <StatusBadge status={t.status} />
          </Link>
        ))}
      </div>

      {data && pages > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm text-fg-3">
          <span>{data.total} tickets</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setSp((p) => { const n = new URLSearchParams(p); n.set("page", String(page - 1)); return n; })} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
            <span>Page {page} of {pages}</span>
            <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setSp((p) => { const n = new URLSearchParams(p); n.set("page", String(page + 1)); return n; })} aria-label="Next page"><ChevronRight className="size-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

type FormState = { title: string; description: string; category: Category; priority: Priority };

function TicketForm({ initial, submitLabel, busy, error, onSubmit, onCancel }: { initial: FormState; submitLabel: string; busy: boolean; error: unknown; onSubmit: (v: FormState) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const err = (f: string) => (error instanceof ApiError ? error.field(f) : undefined);
  const submit = (e: FormEvent) => { e.preventDefault(); onSubmit(v); };
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Field label="Title" error={err("title")}><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Short summary of the problem" maxLength={200} /></Field>
      <Field label="Description" error={err("description")} hint="What happened, what you expected, and any steps to reproduce.">
        <Textarea className="min-h-40" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Category"><Select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as Category })}>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</Select></Field>
        <Field label="Priority"><Select value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value as Priority })}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</Select></Field>
      </div>
      {error instanceof ApiError && error.code !== "VALIDATION_ERROR" && <p role="alert" className="rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">{error.message}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}

export function NewTicket() {
  const create = useCreateTicket();
  const nav = useNavigate();
  return (
    <div className="mx-auto max-w-xl">
      <Link to="/app" className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-3 hover:text-fg"><ArrowLeft className="size-4" />Tickets</Link>
      <h1 className="text-[28px] font-semibold tracking-tight">Raise a ticket</h1>
      <p className="mb-8 mt-1 text-fg-2">Tell us what's wrong. You'll get notified as it moves.</p>
      <TicketForm
        initial={{ title: "", description: "", category: "OTHER", priority: "MEDIUM" }}
        submitLabel="Create ticket"
        busy={create.isPending}
        error={create.error}
        onCancel={() => nav("/app")}
        onSubmit={(v) => create.mutate(v, { onSuccess: (t) => { toast.success("Ticket created"); nav(`/app/tickets/${t.id}`); } })}
      />
    </div>
  );
}

export function TicketDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: t, isLoading, error } = useTicket(id);
  const update = useUpdateTicket(id!);
  const del = useDeleteTicket(id!);
  const [editing, setEditing] = useState(false);

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-40" /></div>;
  if (error || !t) return <Empty icon={<Inbox className="size-5" />} title="Ticket not found" hint="It may have been deleted, or it isn't yours." action={<Link to="/app"><Button>Back to tickets</Button></Link>} />;
  const editable = t.status === "OPEN";

  return (
    <div>
      <Link to="/app" className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-3 hover:text-fg"><ArrowLeft className="size-4" />Tickets</Link>
      <div className="grid gap-10 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          {editing ? (
            <TicketForm
              initial={{ title: t.title, description: t.description, category: t.category, priority: t.priority }}
              submitLabel="Save changes" busy={update.isPending} error={update.error} onCancel={() => setEditing(false)}
              onSubmit={(v) => update.mutate(v, { onSuccess: () => { toast.success("Ticket updated"); setEditing(false); } })}
            />
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{t.title}</h1>
                {editable && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="size-3.5" />Edit</Button>
                    <Dialog.Root>
                      <Dialog.Trigger asChild><Button size="sm" variant="ghost" className="hover:text-bad"><Trash2 className="size-3.5" />Delete</Button></Dialog.Trigger>
                      <Dialog.Portal>
                        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
                        <Dialog.Content className="pop-in fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line-2 bg-ink-1 p-6">
                          <Dialog.Title className="text-lg font-semibold">Delete this ticket?</Dialog.Title>
                          <Dialog.Description className="mt-2 text-sm text-fg-2">It will be removed from your list. Support will no longer see it in the queue.</Dialog.Description>
                          <div className="mt-6 flex justify-end gap-2">
                            <Dialog.Close asChild><Button variant="ghost">Keep ticket</Button></Dialog.Close>
                            <Button variant="danger" loading={del.isPending} onClick={() => del.mutate(undefined, { onSuccess: () => { toast.success("Ticket deleted"); nav("/app"); }, onError: (e) => toast.error((e as Error).message) })}>Delete ticket</Button>
                          </div>
                        </Dialog.Content>
                      </Dialog.Portal>
                    </Dialog.Root>
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3"><StatusBadge status={t.status} /><PriorityMark priority={t.priority} /><span className="text-xs text-fg-3">{CATEGORY_LABEL[t.category]} · #{shortId(t.id)}</span></div>
              <div className="mt-8 border-y border-line py-5"><StatusStepper status={t.status} /></div>
              <p className="mt-8 whitespace-pre-wrap break-words leading-relaxed text-fg-2">{t.description}</p>
              {!editable && <p className="mt-4 text-xs text-fg-3">Tickets can be edited or deleted only while they're open.</p>}
            </>
          )}
          <h2 className="mb-5 mt-12 text-base font-semibold">Conversation</h2>
          <Conversation ticketId={t.id} />
        </div>
        <aside className="lg:pt-1">
          <h2 className="mb-5 text-base font-semibold">Activity</h2>
          <Timeline ticketId={t.id} />
          <p className="mt-6 text-xs text-fg-3" title={fullTime(t.createdAt)}>Opened {timeAgo(t.createdAt)}</p>
        </aside>
      </div>
    </div>
  );
}
