import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Activity, BarChart3, Inbox, LogOut } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Avatar } from "../components/ui";
import { NotificationBell } from "../components/NotificationBell";
import { cn } from "../lib/utils";

const items = [
  { to: "/admin", end: false, icon: Inbox, label: "Tickets", match: (p: string) => p === "/admin" || p.startsWith("/admin/tickets") },
  { to: "/admin/dashboard", end: true, icon: BarChart3, label: "Dashboard" },
  { to: "/admin/events", end: true, icon: Activity, label: "Event Inspector" },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="flex h-full">
      <nav aria-label="Primary" className="flex w-[60px] shrink-0 flex-col items-center border-r border-line bg-ink-1 py-3">
        <svg viewBox="0 0 32 32" className="mb-5 size-7" aria-label="Dispatch"><rect width="32" height="32" rx="16" className="fill-fg" /><path d="M10 22 L22 10 M22 10 H13.5 M22 10 V18.5" stroke="#0a0a0a" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <div className="flex flex-1 flex-col gap-1">
          {items.map(({ to, icon: I, label, match }) => (
            <NavLink key={to} to={to} end={to !== "/admin"} aria-label={label} title={label}
              className={({ isActive }) => cn("group relative grid size-10 place-items-center rounded-xl text-fg-3 transition-colors hover:bg-ink-3 hover:text-fg", (match ? match(location.pathname) : isActive) && "bg-ink-3 text-fg")}>
              <I className="size-[19px]" />
              <span className="pointer-events-none absolute left-[calc(100%+10px)] z-50 whitespace-nowrap rounded-md border border-line-2 bg-ink-3 px-2 py-1 text-xs text-fg opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{label}</span>
            </NavLink>
          ))}
        </div>
        <NotificationBell />
        <button onClick={async () => { await logout(); nav("/login"); }} aria-label="Sign out" title="Sign out" className="mt-1 grid size-10 place-items-center rounded-xl text-fg-3 hover:bg-ink-3 hover:text-fg"><LogOut className="size-[18px]" /></button>
        <div className="mt-2" title={user!.name}><Avatar name={user!.name} admin size={30} /></div>
      </nav>
      <div className="min-w-0 flex-1"><Outlet /></div>
    </div>
  );
}
