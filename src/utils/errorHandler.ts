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
  if (err.name === 'ZodError') {
    return res.status(400).json({ success: false, error: 'Validation Error: ' + err.errors.map((e: any) => e.message).join(', ') });
  }

  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal Server Error';

  console.error(`[ERROR] ${statusCode} - ${err.message}`);
  // Log the stack dynamically nicely
  console.error(err.stack || err);

  res.status(statusCode).json({
    success: false,
    error: err.isOperational || err.name === 'PrismaClientKnownRequestError' ? err.message : message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
