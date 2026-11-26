import { z } from "zod";

export const categories = ["BUG", "BILLING", "ACCOUNT", "FEATURE_REQUEST", "OTHER"] as const;
export const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const statuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

const title = z.string().trim().min(1).max(120);
const description = z.string().trim().min(1).max(5000);

export const createTicketSchema = z.object({
  title,
  description,
  category: z.enum(categories).default("OTHER"),
  priority: z.enum(priorities).default("MEDIUM"),
});

// strict: unknown keys (e.g. status, createdById) are rejected, not silently ignored.
export const patchTicketSchema = z
  .object({
    title: title.optional(),
    description: description.optional(),
    category: z.enum(categories).optional(),
    priority: z.enum(priorities).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const statusSchema = z.object({ status: z.enum(statuses) }).strict();

export const listQuerySchema = z.object({
  status: z.enum(statuses).optional(),
  priority: z.enum(priorities).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["createdAt", "updatedAt", "priority", "status"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
