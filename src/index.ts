import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';

// Utils & Middleware
import { globalErrorHandler } from './utils/errorHandler';
import { apiLimiter, authLimiter, sensitiveLimiter, searchLimiter } from './middlewares/rateLimiter';
import { xssSanitizer, sqlInjectionGuard, securityHeaders } from './middlewares/security';

// Route imports
import authRoutes from './routes/authRoutes';
import appointmentRoutes from './routes/appointmentRoutes';
import paymentRoutes from './routes/paymentRoutes';
import searchRoutes from './routes/searchRoutes';
import providerRoutes from './routes/providerRoutes';
import reviewRoutes from './routes/reviewRoutes';
import notificationRoutes from './routes/notificationRoutes';
import adminRoutes from './routes/adminRoutes';
import messageRoutes from './routes/messageRoutes';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// ─── TRUST PROXY (Required for Render / Vercel behind reverse proxy) ─
// Without this, express-rate-limit sees all requests as from the same IP
app.set('trust proxy', 1);

// ─── SECURITY MIDDLEWARE STACK ───────────────────────────

// 1. Helmet — sets ~15 security headers automatically
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || '*', "https://nominatim.openstreetmap.org", "https://accounts.google.com"],
      frameSrc: ["'self'", "https://accounts.google.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for Google OAuth
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// 2. Extra security headers (X-XSS-Protection, Permissions-Policy, etc.)
app.use(securityHeaders);

// 3. CORS — only allow your frontend domain
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // Cache preflight for 24h to reduce OPTIONS requests
}));

// 4. Body parser with strict size limits
app.use(express.json({ limit: '2mb' })); // Reduced from 10mb to 2mb
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// 5. XSS sanitizer — strips dangerous scripts from all request data
app.use(xssSanitizer);

// 6. SQL injection guard — blocks common injection patterns in URLs
app.use(sqlInjectionGuard);

// 7. Morgan — dev logging only
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// 8. Global API rate limiter (100 req / 15 min per IP)
app.use('/api', apiLimiter);

// ─── HEALTH CHECK ────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API ROUTES WITH ROUTE-SPECIFIC RATE LIMITERS ────────
app.use('/api/auth', authLimiter, authRoutes);          // 10 req/15min
app.use('/api/appointments', appointmentRoutes);
app.use('/api/payments', sensitiveLimiter, paymentRoutes); // 30 req/15min
app.use('/api/search', searchLimiter, searchRoutes);     // 150 req/15min
app.use('/api/providers', providerRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', sensitiveLimiter, adminRoutes);    // 30 req/15min
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);

// ─── 404 HANDLER ─────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── GLOBAL ERROR HANDLER (must be last) ─────────────────
app.use(globalErrorHandler);

// ─── START SERVER ────────────────────────────────────────
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port} [${process.env.NODE_ENV || 'development'}]`);
});

export default app;
