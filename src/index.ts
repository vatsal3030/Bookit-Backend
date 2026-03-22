import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';

// Utils & Middleware
import { globalErrorHandler } from './utils/errorHandler';
import { apiLimiter } from './middlewares/rateLimiter';

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

// ─── SECURITY & PARSING MIDDLEWARE ───────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
// Only log HTTP requests in development — prevents Render log overflow
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}
app.use('/api', apiLimiter);

// ─── HEALTH CHECK ────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ success: true, status: 'ok', message: 'API is running', timestamp: new Date().toISOString() });
});

// ─── API ROUTES ──────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);
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
