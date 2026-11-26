import { Link, Outlet, useNavigate } from "react-router-dom";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { LogOut, Plus } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Avatar, Button, Logo } from "../components/ui";
import { NotificationBell } from "../components/NotificationBell";

export function PortalLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-ink-0/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-5">
          <Link to="/app" className="rounded-md"><Logo /></Link>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="primary" onClick={() => nav("/app/new")}><Plus className="size-3.5" />New ticket</Button>
            <NotificationBell />
            <Dropdown.Root>
              <Dropdown.Trigger aria-label="Account" className="rounded-full outline-offset-4"><Avatar name={user!.name} size={32} /></Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content align="end" sideOffset={8} className="pop-in z-50 min-w-52 rounded-xl border border-line-2 bg-ink-1 p-1.5 shadow-2xl shadow-black/60">
                  <div className="px-2.5 py-2"><p className="text-sm font-medium">{user!.name}</p><p className="text-xs text-fg-3">{user!.email}</p></div>
                  <Dropdown.Separator className="my-1 h-px bg-line" />
                  <Dropdown.Item onSelect={async () => { await logout(); nav("/login"); }} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-fg-2 outline-none data-[highlighted]:bg-ink-2 data-[highlighted]:text-fg"><LogOut className="size-4" />Sign out</Dropdown.Item>
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10"><Outlet /></main>
    </div>
  );
}
