import express from 'express';
import cors from 'cors';
import { pingDatabase } from './db.js';
import { errorHandler, notFound } from './middleware/error.js';
import adminRoutes from './routes/admin.js';
import aiRoutes from './routes/ai.js';
import authRoutes from './routes/auth.js';
import bookingRoutes from './routes/bookings.js';
import creditRoutes from './routes/credit.js';
import resourceRoutes from './routes/resources.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
});

app.get('/api/health', async (_req, res) => {
  try {
    await pingDatabase();
    res.json({ ok: true, service: 'zhiyue-api', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, service: 'zhiyue-api', error: '数据库未连接' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/credit', creditRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
