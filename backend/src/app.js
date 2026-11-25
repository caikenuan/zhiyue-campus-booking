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
import uploadRoutes from './routes/uploads.js';
import { config } from './config.js';
import { localUploadRoot } from './services/storage.js';

const app = express();

// 反向代理后让 req.protocol / req.ip 反映真实客户端
app.set('trust proxy', 1);
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
app.use('/api/uploads', uploadRoutes);

// 本地驱动：直接托管上传目录；S3 驱动下不会写入该目录。
if (config.storage.driver !== 's3') {
  app.use('/uploads', express.static(localUploadRoot(), {
    maxAge: '30d',
    immutable: true,
  }));
}

app.use(notFound);
app.use(errorHandler);

export default app;
