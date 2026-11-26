import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs } from "./client";
import type {
  ActivityItem, Category, Comment, EventRow, EventType, DeliveryStatus, Notification, Page, Priority, Stats,
  Ticket, TicketDetail, TicketQuery, TicketStatus,
} from "./types";

export const useTickets = (q: TicketQuery, opts: { refetchInterval?: number } = {}) =>
  useQuery({
    queryKey: ["tickets", q],
    queryFn: () => api<Page<TicketDetail>>(`/tickets${qs({ ...q })}`),
    placeholderData: keepPreviousData,
    ...opts,
  });

export const useTicket = (id: string | undefined) =>
  useQuery({ queryKey: ["ticket", id], queryFn: () => api<TicketDetail>(`/tickets/${id}`), enabled: !!id, retry: false });

export const useComments = (id: string | undefined) =>
  useQuery({ queryKey: ["comments", id], queryFn: () => api<Comment[]>(`/tickets/${id}/comments`), enabled: !!id, refetchInterval: 10_000 });

export const useActivity = (id: string | undefined) =>
  useQuery({ queryKey: ["activity", id], queryFn: () => api<ActivityItem[]>(`/tickets/${id}/activity`), enabled: !!id, refetchInterval: 10_000 });

function useInvalidate() {
  const qc = useQueryClient();
  return (ticketId?: string) => {
    void qc.invalidateQueries({ queryKey: ["tickets"] });
    void qc.invalidateQueries({ queryKey: ["stats"] });
    void qc.invalidateQueries({ queryKey: ["events"] });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
    if (ticketId) {
      void qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
      void qc.invalidateQueries({ queryKey: ["activity", ticketId] });
      void qc.invalidateQueries({ queryKey: ["comments", ticketId] });
    }
  };
}

export type NewTicket = { title: string; description: string; category: Category; priority: Priority };

export const useCreateTicket = () => {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (b: NewTicket) => api<Ticket>("/tickets", { method: "POST", body: b }), onSuccess: () => inv() });
};

export const useUpdateTicket = (id: string) => {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (b: Partial<NewTicket>) => api<Ticket>(`/tickets/${id}`, { method: "PATCH", body: b }),
    onSuccess: () => inv(id),
  });
};

export const useChangeStatus = (id: string) => {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (status: TicketStatus) => api<Ticket>(`/tickets/${id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: () => inv(id),
  });
};

export const useDeleteTicket = (id: string) => {
  const inv = useInvalidate();
  return useMutation({ mutationFn: () => api(`/tickets/${id}`, { method: "DELETE" }), onSuccess: () => inv(id) });
};

export const useAddComment = (id: string) => {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: string) => api<Comment>(`/tickets/${id}/comments`, { method: "POST", body: { body } }),
    onSuccess: () => inv(id),
  });
};

export const useNotifications = () =>
  useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ items: Notification[]; unreadCount: number }>("/notifications"),
    refetchInterval: 15_000,
  });

export const useMarkRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | "all") => (id === "all" ? api("/notifications/read-all", { method: "POST" }) : api(`/notifications/${id}/read`, { method: "PATCH" })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
};

export const useStats = () => useQuery({ queryKey: ["stats"], queryFn: () => api<Stats>("/admin/stats"), refetchInterval: 15_000 });

export type EventQuery = { type?: EventType | ""; status?: DeliveryStatus | ""; page?: number; limit?: number };
export const useEvents = (q: EventQuery, live: boolean) =>
  useQuery({
    queryKey: ["events", q],
    queryFn: () => api<Page<EventRow>>(`/admin/events${qs({ ...q })}`),
    placeholderData: keepPreviousData,
    refetchInterval: live ? 3000 : false,
  });

export const useRetryDelivery = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/admin/event-deliveries/${id}/retry`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
};
