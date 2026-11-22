import 'dotenv/config';

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
