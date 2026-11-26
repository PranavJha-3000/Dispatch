import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Activity, ShieldCheck, Zap } from "lucide-react";
import { ApiError } from "../api/client";
import { homeFor, useAuth } from "../hooks/useAuth";
import { Button, Field, Input, Logo } from "../components/ui";

function Shell({ title, sub, children, footer }: { title: string; sub: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-ink-1 p-12 lg:flex lg:flex-col lg:justify-between">
        <Logo className="relative text-lg" />
        <div className="relative max-w-md">
          <h2 className="text-[34px] font-semibold leading-[1.15] tracking-tight">Every ticket leaves a trail you can inspect.</h2>
          <p className="mt-4 text-fg-2">Support that stays honest: each change becomes an event, delivered to handlers you can watch, retry and audit.</p>
          <ul className="mt-10 space-y-4 text-sm text-fg-2">
            {[
              [Zap, "Events are written with the change, never lost between steps"],
              [Activity, "Per-handler delivery status, attempts and errors"],
              [ShieldCheck, "Role-based access enforced on the server"],
            ].map(([Icon, t], i) => {
              const I = Icon as typeof Zap;
              return (
                <li key={i} className="flex items-center gap-3">
                  <I className="size-4 shrink-0 text-fg-3" />
                  {t as string}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative text-xs text-fg-3">Dispatch · event-driven support desk</p>
      </aside>
      <main className="grid place-items-center px-6 py-12">
        <div className="pop-in w-full max-w-[380px]">
          <Logo className="mb-10 text-lg lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-fg-2">{sub}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-8 text-sm text-fg-3">{footer}</p>
        </div>
      </main>
    </div>
  );
}

function useFrom() {
  const from = (useLocation().state as { from?: string } | null)?.from;
  return (role: "USER" | "ADMIN") => (from && from.startsWith(homeFor(role)) ? from : homeFor(role));
}

function useSubmit(fn: () => Promise<{ role: "USER" | "ADMIN" }>) {
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const dest = useFrom();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await fn();
      nav(dest(u.role), { replace: true });
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  };
  return { submit, busy, error };
}

const formError = (e: Error | null) => (e && !(e instanceof ApiError && e.code === "VALIDATION_ERROR") ? e.message : undefined);
const fieldErr = (e: Error | null, f: string) => (e instanceof ApiError ? e.field(f) : undefined);

export function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { submit, busy, error } = useSubmit(() => login(email, password));
  const dest = useFrom();
  if (user) return <Navigate to={dest(user.role)} replace />;
  const fill = (e: string) => { setEmail(e); setPassword("Dispatch#2026"); };
  return (
    <Shell title="Welcome back" sub="Sign in to your support desk." footer={<>New here? <Link className="text-accent-2 hover:underline" to="/register">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" error={fieldErr(error, "email")}>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
        </Field>
        <Field label="Password" error={fieldErr(error, "password")}>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {formError(error) && <p role="alert" className="rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">{formError(error)}</p>}
        <Button variant="primary" type="submit" loading={busy} className="w-full">Sign in</Button>
      </form>
      <div className="mt-8 border-t border-line pt-5">
        <p className="text-[13px] font-medium text-fg-2">Demo accounts</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => fill("demo@dispatch.dev")}>Use customer</Button>
          <Button size="sm" onClick={() => fill("admin@dispatch.dev")}>Use admin</Button>
        </div>
      </div>
    </Shell>
  );
}

export function Register() {
  const { user, register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { submit, busy, error } = useSubmit(() => register(name, email, password));
  const dest = useFrom();
  if (user) return <Navigate to={dest(user.role)} replace />;
  return (
    <Shell title="Create your account" sub="Raise tickets and follow them to resolution." footer={<>Already registered? <Link className="text-accent-2 hover:underline" to="/login">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name" error={fieldErr(error, "name")}>
          <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email" error={fieldErr(error, "email")}>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password" hint="At least 8 characters." error={fieldErr(error, "password")}>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {formError(error) && <p role="alert" className="rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">{formError(error)}</p>}
        <Button variant="primary" type="submit" loading={busy} className="w-full">Create account</Button>
      </form>
    </Shell>
  );
}
