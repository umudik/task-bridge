export class AppError extends Error {
  readonly statusCode: number;
  readonly details: unknown;

  constructor(message: string, statusCode: number, details: unknown = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function statusCodeFromError(error: unknown): number {
  if (isAppError(error)) return error.statusCode;
  if (error instanceof Object && "statusCode" in error) {
    const code = Number((error as Record<string, unknown>).statusCode);
    if (Number.isFinite(code)) {
      return code;
    }
  }
  return 500;
}
