import 'dotenv/config';

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// 生产环境禁止使用内置开发密钥；缺少时直接启动失败，避免带病上线。
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('生产环境必须设置 JWT_SECRET（至少 32 字符）');
}

export const config = {
  port: number(process.env.PORT, 3000),
  jwtSecret: process.env.JWT_SECRET || 'zhiyue-local-dev-secret-change-before-sharing',
  jwtExpiresIn: '7d',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: number(process.env.DB_PORT, 3306),
    database: process.env.DB_NAME || 'zhiyue',
    user: process.env.DB_USER || 'zhiyue',
    password: process.env.DB_PASSWORD || 'zhiyue_dev',
    // 云数据库通常强制 TLS，例如 Aiven / TiDB Cloud / RDS
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  },
  dbRoot: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: number(process.env.DB_PORT, 3306),
    user: process.env.DB_ROOT_USER || 'root',
    password: process.env.DB_ROOT_PASSWORD || '',
  },
  llm: {
    baseUrl: process.env.LLM_BASE_URL || '',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || '',
  },
  storage: {
    // local：写到 STORAGE_LOCAL_DIR，由 Express 静态托管；s3：S3 兼容对象存储（OSS/COS/R2/MinIO）
    driver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
    localDir: process.env.STORAGE_LOCAL_DIR || 'uploads',
    endpoint: process.env.STORAGE_ENDPOINT || '',
    region: process.env.STORAGE_REGION || 'auto',
    bucket: process.env.STORAGE_BUCKET || '',
    accessKey: process.env.STORAGE_ACCESS_KEY || '',
    secretKey: process.env.STORAGE_SECRET_KEY || '',
    publicBaseUrl: (process.env.STORAGE_PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  },
};

export const RULES = {
  slotMinutes: 30,
  maxBookingMinutes: 4 * 60,
  advanceDays: 1,
  checkinGraceMinutes: 15,
  noShowLimit: 3,
  noShowWindowDays: 30,
  suspensionDays: 7,
};
