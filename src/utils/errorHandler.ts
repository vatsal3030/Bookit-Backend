import { Request, Response, NextFunction } from 'express';

// Custom application error with HTTP status
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Async handler wrapper — eliminates try/catch boilerplate
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Global error middleware — must be last app.use()
export const globalErrorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal Server Error';

  console.error(`[ERROR] ${statusCode} - ${err.message}`);
  if (!err.isOperational) console.error(err.stack);

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
