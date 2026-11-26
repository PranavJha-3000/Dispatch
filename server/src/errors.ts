export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (msg = "Not found") => new AppError(404, "NOT_FOUND", msg);
export const forbidden = (msg = "Forbidden") => new AppError(403, "FORBIDDEN", msg);
export const conflict = (msg: string) => new AppError(409, "CONFLICT", msg);
export const unauthenticated = (msg = "Authentication required") => new AppError(401, "UNAUTHENTICATED", msg);
export const badRequest = (msg: string, details?: unknown) => new AppError(400, "VALIDATION_ERROR", msg, details);
