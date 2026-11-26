import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Priority, TicketStatus, EventType, Category } from "../api/types";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const a = Math.abs(s);
  if (a < 45) return "just now";
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}
export const fullTime = (iso: string) =>
  new Date(iso).toLocaleString("en", { dateStyle: "medium", timeStyle: "medium" });

export const STATUS_LABEL: Record<TicketStatus, string> = { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved", CLOSED: "Closed" };
export const PRIORITY_LABEL: Record<Priority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };
export const CATEGORY_LABEL: Record<Category, string> = { BUG: "Bug", BILLING: "Billing", ACCOUNT: "Account", FEATURE_REQUEST: "Feature request", OTHER: "Other" };
export const EVENT_LABEL: Record<EventType, string> = {
  TICKET_CREATED: "Ticket created",
  TICKET_UPDATED: "Ticket updated",
  STATUS_CHANGED: "Status changed",
  COMMENT_ADDED: "Comment added",
  TICKET_RESOLVED: "Ticket resolved",
};
export const STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
export const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
export const CATEGORIES: Category[] = ["BUG", "BILLING", "ACCOUNT", "FEATURE_REQUEST", "OTHER"];
export const EVENT_TYPES: EventType[] = ["TICKET_CREATED", "TICKET_UPDATED", "STATUS_CHANGED", "COMMENT_ADDED", "TICKET_RESOLVED"];

export const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
export const shortId = (id: string) => id.slice(0, 8);
