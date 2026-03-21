import rateLimit from 'express-rate-limit';

// Strict limiter for auth endpoints (login, register)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, error: 'Too many attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
