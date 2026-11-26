import { useState, type FormEvent } from "react";
import { Check, CircleDot, MessageSquare, Pencil, PlusCircle, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "../api/client";
import { useActivity, useAddComment, useComments } from "../api/hooks";
import type { ActivityItem, TicketStatus } from "../api/types";
import { Avatar, Button, Skeleton, Textarea } from "./ui";
import { cn, fullTime, STATUS_LABEL, timeAgo } from "../lib/utils";

const FLOW: TicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED"];

/** Read-only progress for customers. CLOSED/reopened states are shown as a note rather than a fourth step. */
export function StatusStepper({ status }: { status: TicketStatus }) {
  const idx = status === "CLOSED" ? 3 : FLOW.indexOf(status);
  return (
    <div>
      <ol className="flex items-center" aria-label="Ticket progress">
        {FLOW.map((s, i) => {
          const done = i < idx || status === "CLOSED" || (status === "RESOLVED" && i === 2);
          const current = i === idx;
          return (
            <li key={s} className="flex flex-1 items-center last:flex-none">
              <span className="flex items-center gap-2">
                <span className={cn("grid size-6 place-items-center rounded-full text-[11px] font-semibold ring-1 ring-inset transition-colors",
                  done ? "bg-fg text-ink-0 ring-fg" : current ? "text-fg ring-fg" : "text-fg-3 ring-line-2")}>
                  {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn("text-[13px]", current || done ? "text-fg" : "text-fg-3")}>{STATUS_LABEL[s]}</span>
              </span>
              {i < FLOW.length - 1 && <span className={cn("mx-3 h-px flex-1", i < idx || status === "CLOSED" ? "bg-fg/60" : "bg-line-2")} />}
            </li>
          );
        })}
      </ol>
      {status === "CLOSED" && <p className="mt-3 text-[13px] text-fg-3">This ticket is closed. Reply or ask support to reopen it.</p>}
    </div>
  );
}

const ev = (a: ActivityItem): { icon: typeof Check; text: string } => {
  const p = a.payload as Record<string, any>;
  switch (a.type) {
    case "TICKET_CREATED": return { icon: PlusCircle, text: "opened the ticket" };
    case "STATUS_CHANGED": return { icon: CircleDot, text: `moved it from ${STATUS_LABEL[p.from as TicketStatus] ?? p.from} to ${STATUS_LABEL[p.to as TicketStatus] ?? p.to}` };
    case "TICKET_RESOLVED": return { icon: Check, text: "marked it resolved" };
    case "COMMENT_ADDED": return { icon: MessageSquare, text: "replied" };
    case "TICKET_UPDATED": {
      const keys = Object.keys(p.changes ?? {});
      return { icon: Pencil, text: `edited ${keys.length ? keys.join(", ") : "the ticket"}` };
    }
    default: return { icon: RotateCcw, text: String(a.type) };
  }
};

export function Timeline({ ticketId }: { ticketId: string }) {
  const { data, isLoading } = useActivity(ticketId);
  if (isLoading) return <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>;
  return (
    <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-line-2">
      {data?.map((a) => {
        const { icon: I, text } = ev(a);
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className="z-10 grid size-6 shrink-0 place-items-center rounded-full bg-ink-2 text-fg-2 ring-1 ring-line-2"><I className="size-3" /></span>
            <div className="min-w-0 pt-0.5 text-[13px] leading-snug">
              <span className="font-medium text-fg">{a.actor?.name ?? "System"}</span> <span className="text-fg-2">{text}</span>
              <time className="mt-0.5 block text-xs text-fg-3" title={fullTime(a.createdAt)} dateTime={a.createdAt}>{timeAgo(a.createdAt)}</time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Conversation({ ticketId, canReply = true }: { ticketId: string; canReply?: boolean }) {
  const { data, isLoading } = useComments(ticketId);
  const add = useAddComment(ticketId);
  const [body, setBody] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await add.mutateAsync(body.trim());
      setBody("");
      toast.success("Reply sent");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send reply");
    }
  };

  return (
    <div>
      <div className="space-y-5">
        {isLoading && [0, 1].map((i) => <Skeleton key={i} className="h-16" />)}
        {data?.length === 0 && <p className="py-6 text-center text-sm text-fg-3">No replies yet. Start the conversation below.</p>}
        {data?.map((c) => (
          <article key={c.id} className="pop-in flex gap-3">
            <Avatar name={c.author.name} admin={c.author.role === "ADMIN"} />
            <div className="min-w-0 flex-1">
              <header className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{c.author.name}</span>
                {c.author.role === "ADMIN" && <span className="rounded-full bg-ink-4 px-2 text-[11px] font-medium text-fg">Support</span>}
                <time className="text-xs text-fg-3" title={fullTime(c.createdAt)} dateTime={c.createdAt}>{timeAgo(c.createdAt)}</time>
              </header>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-2">{c.body}</p>
            </div>
          </article>
        ))}
      </div>
      {canReply && (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" maxLength={5000} aria-label="Reply" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit(e as unknown as FormEvent); }} />
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-3">Ctrl + Enter to send</span>
            <Button type="submit" variant="primary" size="sm" loading={add.isPending} disabled={!body.trim()}><Send className="size-3.5" />Send reply</Button>
          </div>
        </form>
      )}
    </div>
  );
}
