import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';

// 云数据库导入：不需要 root，用业务账号直接建表 + 写种子数据。
// 用法：在 backend/.env 填好 DB_*（云库通常 DB_SSL=true），然后 npm run db:import
const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '../../database/schema.sql');
const seedPath = resolve(here, '../../database/seed.sql');

async function main() {
  console.log(`连接云数据库 ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database} ...`);
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true,
    ssl: config.db.ssl,
    timezone: '+08:00',
    connectTimeout: 15000,
  });

  try {
    const schema = await readFile(schemaPath, 'utf8');
    const seed = await readFile(seedPath, 'utf8');
    console.log('执行建表脚本（会重建业务表，请确认目标库正确）...');
    await connection.query(schema);
    console.log('写入种子数据...');
    await connection.query(seed);

    const [[counts]] = await connection.query(`
      SELECT
        (SELECT COUNT(*) FROM resources) AS resources,
        (SELECT COUNT(*) FROM maintenance_windows) AS maintenance,
        (SELECT COUNT(*) FROM bookings) AS bookings,
        (SELECT COUNT(*) FROM users) AS users
    `);
    console.log('\n导入完成：', counts);
    console.log('演示账号：admin / admin123，manager / manager123，2024030202003 / 123456');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('\n云数据库导入失败：', error.message);
  if (error.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('账号或密码不正确，或该账号没有目标库权限。');
  } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    console.error('连不上数据库：检查 Host/Port、云库白名单是否允许当前公网 IP。');
  } else if (String(error.code).includes('SSL') || /ssl/i.test(error.message)) {
    console.error('TLS 握手失败：云库通常需要 DB_SSL=true。');
  }
  process.exit(1);
});
