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
app.set('trust proxy', 1);

// ─── BOT SCANNER BLOCKER ────────────────────────────────
// Silently drop requests from automated vulnerability scanners
// probing for config files, PHP pages, AWS credentials, etc.
const BLOCKED_PATTERNS = /\.(php|asp|aspx|jsp|cgi|env|yml|yaml|py|rb|ini|inc|bak|sql|log|map)$/i;
const BLOCKED_PATHS = new Set([
  '/.aws/credentials', '/.aws/config', '/aws/credentials', '/aws-secret.yaml',
  '/.env', '/.env.local', '/.env.production', '/.git/config', '/.gitignore',
  '/.travis.yml', '/.circleci/config.yml', '/.bitbucket/pipelines.yml',
  '/wp-admin', '/wp-login.php', '/wp-content', '/wordpress',
  '/swagger.json', '/serverless.yml', '/docker-compose.yml',
  '/appsettings.json', '/application.properties', '/application.yml',
  '/manage/env', '/debug/default/view', '/server-info', '/server-status',
  '/horizon/api/stats', '/_profiler/latest', '/_profiler/phpinfo',
  '/config/secrets.yml', '/config/credentials.yml', '/config/settings.json',
  '/config/config.json', '/config/parameters.yml', '/config/database.yml',
  '/config/application.yml', '/instance/config.py', '/parameters.yml',
  '/backend/config/default.yml', '/backend/config/settings.yml',
  '/webhooks/settings.json', '/app/config/parameters.yml',
  '/storage/logs/laravel.log', '/storage/logs/stripe.log', '/storage/logs/payments.log',
]);

app.use((req: Request, res: Response, next) => {
  const path = req.path.toLowerCase();

  // Block known scanner paths
  if (BLOCKED_PATHS.has(path) || BLOCKED_PATTERNS.test(path)) {
    // Return 404 silently — no logging, no processing
    return res.status(404).end();
  }

  // Block non-/api routes entirely (except health check and root)
  if (!path.startsWith('/api') && path !== '/') {
    return res.status(404).end();
  }

  next();
});

// ─── HEALTH CHECK (BEFORE rate limiter — must never be blocked) ──
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

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
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// 2. Extra security headers
app.use(securityHeaders);

// 3. CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// 4. Body parser with strict size limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// 5. XSS sanitizer
app.use(xssSanitizer);

// 6. SQL injection guard
app.use(sqlInjectionGuard);

// 7. Morgan — dev only
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// 8. Global API rate limiter (applies to everything under /api EXCEPT health)
app.use('/api', apiLimiter);

// ─── API ROUTES WITH ROUTE-SPECIFIC RATE LIMITERS ────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/payments', sensitiveLimiter, paymentRoutes);
app.use('/api/search', searchLimiter, searchRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', sensitiveLimiter, adminRoutes);
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
