export type BlockedSubtaskSummary = {
  id: number;
  title: string;
  stageId: string | null;
};

export type AppErrorDetails =
  | { code: string }
  | { subtasks: BlockedSubtaskSummary[] }
  | null;

export class AppError extends Error {
  readonly statusCode: number;
  readonly details: AppErrorDetails;

  constructor(message: string, statusCode: number, details: AppErrorDetails = null) {
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
    const row = error as { statusCode: string | number | boolean | null };
    const code = Number(row.statusCode);
    if (Number.isFinite(code)) {
      return code;
    }
  }
  return 500;
}
