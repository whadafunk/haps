export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function createError(
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): AppError {
  return new AppError(statusCode, code, message, details)
}
