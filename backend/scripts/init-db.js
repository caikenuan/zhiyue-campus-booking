import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '../../database/schema.sql');
const seedPath = resolve(here, '../../database/seed.sql');

const escapeLiteral = (value) => String(value).replace(/'/g, "''");

async function main() {
  console.log(`连接 MySQL（root@${config.dbRoot.host}:${config.dbRoot.port}）...`);
  const root = await mysql.createConnection({
    host: config.dbRoot.host,
    port: config.dbRoot.port,
    user: config.dbRoot.user,
    password: config.dbRoot.password,
    multipleStatements: true,
    ssl: config.db.ssl,
  });

  const database = config.db.database;
  const user = config.db.user;
  const password = escapeLiteral(config.db.password);

  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  // 本机默认同时兼容 localhost 与 127.0.0.1；部署到云数据库或容器时，
  // 用 DB_USER_HOSTS 指定来源，例如 DB_USER_HOSTS=%（容器）或 10.0.0.5（固定 IP）。
  const userHosts = (process.env.DB_USER_HOSTS || '%')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  for (const host of userHosts) {
    await root.query(`CREATE USER IF NOT EXISTS '${escapeLiteral(user)}'@'${escapeLiteral(host)}' IDENTIFIED BY '${password}'`);
    await root.query(`ALTER USER '${escapeLiteral(user)}'@'${escapeLiteral(host)}' IDENTIFIED BY '${password}'`);
    await root.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${escapeLiteral(user)}'@'${escapeLiteral(host)}'`);
  }
  await root.query('FLUSH PRIVILEGES');
  await root.end();

  console.log(`数据库 ${database} 与账号 ${user} 已就绪，执行建表...`);
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database,
    multipleStatements: true,
    ssl: config.db.ssl,
    timezone: '+08:00',
  });

  const schema = await readFile(schemaPath, 'utf8');
  const seed = await readFile(seedPath, 'utf8');
  await connection.query(schema);
  console.log('建表完成，写入演示数据...');
  await connection.query(seed);
  await connection.end();

  console.log('\n初始化完成。演示账号：');
  console.log('  学院管理员  admin / admin123');
  console.log('  场地管理员  manager / manager123');
  console.log('  学生        2024030202003 / 123456（蔡珂暖）');
  console.log('  学生        2024030202107 / 123456（史曼琪）');
  console.log('  学生        2024000001 / 123456（测试学生）\n');
}

main().catch((error) => {
  console.error('\n初始化失败：', error.message);
  if (error.code === 'ECONNREFUSED') {
    console.error('请先启动本地 MySQL，再运行 npm run db:init。');
  } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('root 账号密码不正确，请修改 backend/.env 中的 DB_ROOT_USER / DB_ROOT_PASSWORD。');
  }
  process.exit(1);
});
