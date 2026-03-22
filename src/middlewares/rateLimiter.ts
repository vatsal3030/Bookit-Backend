import rateLimit from 'express-rate-limit';

// ─── Auth Limiter (Login, Register, Google Auth) ─────────
// Very strict: 10 attempts per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many authentication attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// ─── Sensitive Operations Limiter (Payments, Role Switch) ─
// Moderate: 30 attempts per 15 minutes per IP
export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, error: 'Too many sensitive requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── General API Limiter ────────────────────────────────
// 100 requests per 15 minutes per IP
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many requests from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Search / Public Endpoints Limiter ──────────────────
// More relaxed: 150 per 15 minutes (search pages do many calls)
export const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: { success: false, error: 'Too many search requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
