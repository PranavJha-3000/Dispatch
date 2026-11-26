import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMarkRead, useNotifications } from "../api/hooks";
import { useAuth } from "../hooks/useAuth";
import { cn, timeAgo } from "../lib/utils";

export function NotificationBell() {
  const { user } = useAuth();
  const { data } = useNotifications();
  const mark = useMarkRead();
  const nav = useNavigate();
  const unread = data?.unreadCount ?? 0;
  const base = user?.role === "ADMIN" ? "/admin/tickets" : "/app/tickets";

  return (
    <Dropdown.Root>
      <Dropdown.Trigger aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative grid size-9 place-items-center rounded-lg text-fg-2 transition-colors hover:bg-ink-2 hover:text-fg data-[state=open]:bg-ink-2">
        <Bell className="size-[18px]" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-ink-0 ring-2 ring-ink-1">{unread > 9 ? "9+" : unread}</span>}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={8} className="pop-in z-50 w-[360px] overflow-hidden rounded-xl border border-line-2 bg-ink-1">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-medium">Notifications</span>
            {unread > 0 && (
              <button onClick={() => mark.mutate("all")} className="flex items-center gap-1 text-xs text-fg-2 hover:text-fg"><CheckCheck className="size-3.5" />Mark all read</button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {data?.items.length === 0 && <p className="px-4 py-10 text-center text-sm text-fg-3">You're all caught up.</p>}
            {data?.items.map((n) => (
              <Dropdown.Item
                key={n.id}
                onSelect={() => { if (!n.readAt) mark.mutate(n.id); if (n.ticketId) nav(`${base}/${n.ticketId}`); }}
                className="flex cursor-pointer gap-3 border-b border-line px-4 py-3 outline-none last:border-0 data-[highlighted]:bg-ink-2"
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} />
                <span className="min-w-0">
                  <span className={cn("block text-[13px]", n.readAt ? "text-fg-2" : "font-medium text-fg")}>{n.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-fg-3">{n.body}</span>
                  <span className="mt-1 block text-[11px] text-fg-3">{timeAgo(n.createdAt)}</span>
                </span>
              </Dropdown.Item>
            ))}
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
