export class AppError extends Error {
  readonly statusCode: number;
  readonly details: unknown;

  constructor(message: string, statusCode: number, details: unknown = undefined) {
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
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as Record<string, unknown>).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }
  return 500;
}
