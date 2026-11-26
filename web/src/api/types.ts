export type Role = "USER" | "ADMIN";
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type Category = "BUG" | "BILLING" | "ACCOUNT" | "FEATURE_REQUEST" | "OTHER";
export type EventType = "TICKET_CREATED" | "TICKET_UPDATED" | "STATUS_CHANGED" | "COMMENT_ADDED" | "TICKET_RESOLVED";
export type DeliveryStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "DEAD";

export type User = { id: string; name: string; email: string; role: Role };
export type Person = { id: string; name: string; role: Role };

export type Ticket = {
  id: string;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  status: TicketStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};
export type TicketDetail = Ticket & { commentCount: number; createdBy: { id: string; name: string } };
export type Page<T> = { items: T[]; total: number; page: number; limit: number };

export type Comment = { id: string; ticketId: string; body: string; createdAt: string; author: Person };
export type ActivityItem = { id: string; type: EventType; payload: Record<string, unknown>; createdAt: string; actor: Person | null };
export type Notification = { id: string; title: string; body: string; ticketId: string | null; readAt: string | null; createdAt: string };

export type Delivery = {
  id: string;
  handler: string;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  durationMs: number | null;
  nextAttemptAt: string;
};
export type EventRow = {
  id: string;
  seq: number;
  type: EventType;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: Person | null;
  ticket: { id: string; title: string } | null;
  deliveries: Delivery[];
};

export type Stats = {
  total: number;
  byStatus: Record<TicketStatus, number>;
  byPriority: Record<Priority, number>;
  createdLast7Days: { date: string; count: number }[];
  avgResolutionHours: number | null;
  failedDeliveries: number;
};

export type TicketQuery = {
  status?: TicketStatus | "";
  priority?: Priority | "";
  q?: string;
  sort?: "createdAt" | "updatedAt" | "priority" | "status";
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
};
