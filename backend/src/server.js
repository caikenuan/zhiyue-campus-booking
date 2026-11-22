import app from './app.js';
import { config } from './config.js';
import { pingDatabase, pool } from './db.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';

const server = app.listen(config.port, async () => {
  console.log(`\n智约后端已启动：http://localhost:${config.port}/api/health`);
  try {
    await pingDatabase();
    console.log(`数据库连接成功：${config.db.host}:${config.db.port}/${config.db.database}\n`);
    startScheduler();
  } catch (error) {
    console.error('\n[警告] 数据库连接失败，请先启动 MySQL 并执行 npm run db:init');
    console.error(error.message);
    console.error('');
  }
});

async function shutdown(signal) {
  console.log(`\n收到 ${signal}，正在关闭服务...`);
  stopScheduler();
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
