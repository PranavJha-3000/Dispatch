import { cloneElement, forwardRef, isValidElement, type ReactElement, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn, initials, PRIORITY_LABEL, STATUS_LABEL } from "../lib/utils";
import type { DeliveryStatus, Priority, TicketStatus } from "../api/types";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" | "danger"; size?: "sm" | "md"; loading?: boolean };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "outline", size = "md", loading, className, children, disabled, ...p }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-8 px-3.5 text-[13px]" : "h-10 px-5 text-sm",
        variant === "primary" && "bg-fg text-ink-0 hover:bg-white/80",
        variant === "outline" && "border border-line-2 text-fg hover:bg-ink-3",
        variant === "ghost" && "text-fg-2 hover:bg-ink-3 hover:text-fg",
        variant === "danger" && "border border-bad/30 text-bad hover:bg-bad/10",
        className,
      )}
      {...p}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
});

const fieldBase =
  "w-full rounded-xl border border-line bg-ink-2 px-3.5 text-sm text-fg placeholder:text-fg-3 transition-colors hover:border-line-2 focus:border-white/30 focus:outline-none aria-[invalid=true]:border-bad/60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(fieldBase, "h-10", className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-28 resize-y py-2.5 leading-relaxed", className)} {...p} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} className={cn(fieldBase, "h-10 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-8", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%236e6e80' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...p} />;
});

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{label}</span>
      {error && isValidElement(children) ? cloneElement(children as ReactElement<{ "aria-invalid"?: boolean }>, { "aria-invalid": true }) : children}
      {error ? <span role="alert" className="mt-1.5 block text-xs text-bad">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-fg-3">{hint}</span> : null}
    </label>
  );
}

const statusTone: Record<TicketStatus, string> = {
  OPEN: "text-fg-2",
  IN_PROGRESS: "text-info",
  RESOLVED: "text-ok",
  CLOSED: "text-fg-3",
};
/** Status is a coloured dot plus plain label: colour carries meaning, the chrome stays quiet. */
export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium", statusTone[status], className)}>
      <span className={cn("size-1.5 rounded-full", status === "OPEN" ? "ring-1 ring-inset ring-current" : "bg-current")} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const prioBars: Record<Priority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 };
const prioTone: Record<Priority, string> = { LOW: "text-fg-3", MEDIUM: "text-fg-2", HIGH: "text-warn", URGENT: "text-bad" };
export function PriorityMark({ priority, label = true }: { priority: Priority; label?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", prioTone[priority])} title={`${PRIORITY_LABEL[priority]} priority`}>
      <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("w-[3px] rounded-[1px] bg-current", i > prioBars[priority] && "opacity-20")} style={{ height: 4 + i * 2.5 }} />
        ))}
      </span>
      {label && PRIORITY_LABEL[priority]}
    </span>
  );
}

const deliveryTone: Record<DeliveryStatus, string> = {
  PENDING: "text-fg-2 ring-line-2",
  RUNNING: "text-info ring-info/30",
  SUCCEEDED: "text-ok ring-ok/30",
  FAILED: "text-warn ring-warn/30",
  DEAD: "text-bad ring-bad/30",
};
export const DeliveryBadge = ({ status }: { status: DeliveryStatus }) => (
  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", deliveryTone[status])}>{status.toLowerCase()}</span>
);

export function Avatar({ name, admin, size = 28 }: { name: string; admin?: boolean; size?: number }) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full font-medium", admin ? "bg-fg text-ink-0" : "bg-ink-4 text-fg-2")}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn("skeleton", className)} />;

export function Empty({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="pop-in grid place-items-center px-6 py-16 text-center">
      <div className="mb-4 grid size-10 place-items-center rounded-full bg-ink-3 text-fg-3">{icon}</div>
      <p className="text-[15px] font-medium text-fg">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-fg-3">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <rect width="32" height="32" rx="16" className="fill-fg" />
        <path d="M10 22 L22 10 M22 10 H13.5 M22 10 V18.5" stroke="#0a0a0a" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Dispatch
    </span>
  );
}
