import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';

const BASE = process.env.API_BASE || 'http://127.0.0.1:3000/api';

// 两个专用测试账号：一个用来造预约，一个用来验用户管理，避免污染演示数据。
const BOOKING_STUDENT_NO = 's2_admin_ops_booking';
const MANAGED_USER_NO = 's2_admin_ops_user';
const TEST_PASSWORD = '123456';
const TEST_PASSWORD_HASH =
  'e1e034cbfee435504844a21413235c7f:6453271a56b99ce2f8fa6e58e5ba55b044e5ff320b7256d8a403c9dd38d4a4af7cac774241e64a44c3933ec82ac954830ecfa5dfa38255d7e5f98e9536d00414';

function pad(value) {
  return value < 10 ? '0' + value : String(value);
}

function formatDate(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const TOMORROW = formatDate(addDays(new Date(), 1));
const DAY_AFTER = formatDate(addDays(new Date(), 2));

let bookingStudentId = null;
let managedUserId = null;
let bookingStudentToken = null;
let adminToken = null;
let adminId = null;
let managerToken = null;
let managerId = null;
const bookings = {};

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

async function login(studentNo, password) {
  const { status, data } = await api('/auth/login', {
    method: 'POST',
    body: { studentNo, password },
  });
  assert.equal(status, 200, `登录失败：${studentNo} ${JSON.stringify(data)}`);
  return data;
}

async function createBooking(resourceId, startAt, endAt) {
  const { status, data } = await api('/bookings', {
    method: 'POST',
    token: bookingStudentToken,
    body: { resourceId, startAt, endAt },
  });
  assert.equal(status, 201, `创建测试预约失败：${JSON.stringify(data)}`);
  return Number(data.booking.id);
}

async function deleteUserData(userId) {
  if (!userId) return;

  const [bookingRows] = await pool.query('SELECT id FROM bookings WHERE user_id = ?', [userId]);
  const bookingIds = bookingRows.map((row) => Number(row.id));

  const logConditions = ['actor_id = ?', "(target_type = 'user' AND target_id = ?)"];
  const logParams = [userId, userId];
  if (bookingIds.length) {
    logConditions.push('(target_type = ? AND target_id IN (?))');
    logParams.push('booking', bookingIds);
  }
  await pool.query(
    `DELETE FROM operation_logs WHERE ${logConditions.join(' OR ')}`,
    logParams,
  );

  if (bookingIds.length) {
    await pool.query('DELETE FROM checkins WHERE booking_id IN (?)', [bookingIds]);
    await pool.query('DELETE FROM bookings WHERE id IN (?)', [bookingIds]);
  }
  await pool.query('DELETE FROM users WHERE id = ?', [userId]);
}

async function removeTestUserByStudentNo(studentNo) {
  const [rows] = await pool.query('SELECT id FROM users WHERE student_no = ?', [studentNo]);
  if (rows[0]) {
    await deleteUserData(Number(rows[0].id));
  }
}

async function insertTestUser(studentNo, name) {
  const [result] = await pool.query(
    `INSERT INTO users (student_no, name, password_hash, role, status, credit_score)
     VALUES (?, ?, ?, 'STUDENT', 'ACTIVE', 100)`,
    [studentNo, name, TEST_PASSWORD_HASH],
  );
  return Number(result.insertId);
}

async function dashboardStatsFromDb(resourceIds = null) {
  const scope = resourceIds ? 'AND b.resource_id IN (?)' : '';
  const params = resourceIds ? [resourceIds] : [];
  const [[today], [pending], [released], [resources], [suspended]] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS count FROM bookings b WHERE DATE(b.start_at) = CURDATE() ${scope}`, params),
    pool.query(`SELECT COUNT(*) AS count FROM bookings b WHERE b.status = 'PENDING' AND DATE(b.start_at) = CURDATE() ${scope}`, params),
    pool.query(`SELECT COUNT(*) AS count FROM bookings b WHERE b.status = 'RELEASED' AND DATE(b.updated_at) = CURDATE() ${scope}`, params),
    pool.query(
      resourceIds
        ? "SELECT COUNT(*) AS count FROM resources WHERE status = 'OPEN' AND id IN (?)"
        : "SELECT COUNT(*) AS count FROM resources WHERE status = 'OPEN'",
      resourceIds ? [resourceIds] : [],
    ),
    pool.query('SELECT COUNT(*) AS count FROM users WHERE suspended_until > NOW()'),
  ]);
  return {
    todayBookings: Number(today[0].count),
    pendingCheckin: Number(pending[0].count),
    releasedToday: Number(released[0].count),
    activeResources: Number(resources[0].count),
    suspendedUsers: Number(suspended[0].count),
  };
}

before(async () => {
  await removeTestUserByStudentNo(BOOKING_STUDENT_NO);
  await removeTestUserByStudentNo(MANAGED_USER_NO);

  bookingStudentId = await insertTestUser(BOOKING_STUDENT_NO, '后台测试预约学生');
  managedUserId = await insertTestUser(MANAGED_USER_NO, '后台测试用户');

  bookingStudentToken = (await login(BOOKING_STUDENT_NO, TEST_PASSWORD)).token;
  const admin = await login('admin', 'admin123');
  adminToken = admin.token;
  adminId = Number(admin.user.id);
  const manager = await login('manager', 'manager123');
  managerToken = manager.token;
  managerId = Number(manager.user.id);

  bookings.utilization = await createBooking(
    6, `${TOMORROW} 10:00`, `${TOMORROW} 11:00`,
  );
  bookings.approve = await createBooking(
    2, `${TOMORROW} 09:00`, `${TOMORROW} 09:30`,
  );
  bookings.reject = await createBooking(
    2, `${TOMORROW} 09:30`, `${TOMORROW} 10:00`,
  );
});

after(async () => {
  try {
    await deleteUserData(bookingStudentId);
    await deleteUserData(managedUserId);
  } finally {
    await pool.end();
  }
});

test('A-01 学院管理员仪表盘统计与数据库一致', async () => {
  const expected = await dashboardStatsFromDb();
  const { status, data } = await api('/admin/dashboard', { token: adminToken });
  assert.equal(status, 200);
  assert.deepEqual(data.stats, expected);
  assert.ok(Array.isArray(data.recentBookings));
  assert.ok(data.recentBookings.length <= 6);
});

test('A-02 场地管理员仪表盘只统计 1—3 号场地', async () => {
  const expected = await dashboardStatsFromDb([1, 2, 3]);
  const { status, data } = await api('/admin/dashboard', { token: managerToken });
  assert.equal(status, 200);
  assert.deepEqual(data.stats, expected);
  assert.equal(data.stats.activeResources, 3);
});

test('A-03 利用率统计按自然日包含首尾两天', async () => {
  const single = await api(`/admin/stats/utilization?from=${TOMORROW}&to=${TOMORROW}`, {
    token: adminToken,
  });
  assert.equal(single.status, 200);
  const row = single.data.items.find((item) => Number(item.resourceId) === 6);
  assert.ok(row, '应返回 6 号场地');
  assert.equal(row.days, 1);
  assert.equal(Number(row.capacityMinutes), 780);
  assert.ok(Number(row.bookedMinutes) >= 60, '结束日期当天的预约应计入统计');
  assert.ok(Number(row.bookingCount) >= 1);
  assert.ok(Number(row.utilizationRate) > 0);

  const twoDays = await api(`/admin/stats/utilization?from=${TOMORROW}&to=${DAY_AFTER}`, {
    token: adminToken,
  });
  assert.equal(twoDays.status, 200);
  const twoDayRow = twoDays.data.items.find((item) => Number(item.resourceId) === 6);
  assert.equal(twoDayRow.days, 2);
  assert.equal(Number(twoDayRow.capacityMinutes), 1560);
  assert.ok(Number(twoDayRow.bookedMinutes) >= 60);
});

test('A-04 利用率统计拒绝非法日期范围', async () => {
  const reversed = await api(`/admin/stats/utilization?from=${DAY_AFTER}&to=${TOMORROW}`, {
    token: adminToken,
  });
  assert.equal(reversed.status, 400);
  assert.equal(reversed.data.error.code, 'VALIDATION_ERROR');

  const invalid = await api(`/admin/stats/utilization?from=2026-13-40&to=${TOMORROW}`, {
    token: adminToken,
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.data.error.code, 'VALIDATION_ERROR');
});

test('A-05 场地管理员利用率只返回 1—3 号场地', async () => {
  const { status, data } = await api(
    `/admin/stats/utilization?from=${TOMORROW}&to=${TOMORROW}`,
    { token: managerToken },
  );
  assert.equal(status, 200);
  assert.deepEqual(
    data.items.map((item) => Number(item.resourceId)).sort((a, b) => a - b),
    [1, 2, 3],
  );
});

test('A-06 预约列表支持状态、场地、日期筛选', async () => {
  const filtered = await api(
    `/admin/bookings?resourceId=6&date=${TOMORROW}&status=PENDING`,
    { token: adminToken },
  );
  assert.equal(filtered.status, 200);
  assert.ok(filtered.data.items.length >= 1);
  assert.ok(
    filtered.data.items.every(
      (item) =>
        Number(item.resourceId) === 6 &&
        item.status === 'PENDING' &&
        String(item.startAt).startsWith(TOMORROW),
    ),
  );

  const managerOutOfScope = await api('/admin/bookings?resourceId=6', {
    token: managerToken,
  });
  assert.equal(managerOutOfScope.status, 200);
  assert.deepEqual(managerOutOfScope.data.items, []);
});

test('A-07 预约审批：通过回到 PENDING，驳回释放时段，重复处理返回 409', async () => {
  await pool.query(
    "UPDATE bookings SET status = 'PENDING_APPROVAL' WHERE id = ?",
    [bookings.approve],
  );
  const approve = await api(`/admin/bookings/${bookings.approve}/review`, {
    method: 'POST',
    token: managerToken,
    body: { decision: 'APPROVE' },
  });
  assert.equal(approve.status, 200);
  assert.equal(approve.data.booking.status, 'PENDING');

  const duplicate = await api(`/admin/bookings/${bookings.approve}/review`, {
    method: 'POST',
    token: managerToken,
    body: { decision: 'APPROVE' },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.data.error.code, 'INVALID_STATE');

  await pool.query(
    "UPDATE bookings SET status = 'PENDING_APPROVAL' WHERE id = ?",
    [bookings.reject],
  );
  const reject = await api(`/admin/bookings/${bookings.reject}/review`, {
    method: 'POST',
    token: adminToken,
    body: { decision: 'REJECT', reason: '自动化测试驳回' },
  });
  assert.equal(reject.status, 200);
  assert.equal(reject.data.booking.status, 'REJECTED');

  const [slots] = await pool.query(
    'SELECT COUNT(*) AS count FROM booking_slots WHERE booking_id = ?',
    [bookings.reject],
  );
  assert.equal(Number(slots[0].count), 0);
});

test('A-08 用户与角色：学院管理员可修改，场地管理员越权返回 403', async () => {
  const managerList = await api('/admin/users', { token: managerToken });
  assert.equal(managerList.status, 403);

  const list = await api(`/admin/users?keyword=${MANAGED_USER_NO}`, { token: adminToken });
  assert.equal(list.status, 200);
  assert.equal(list.data.items.length, 1);

  const update = await api(`/admin/users/${managedUserId}`, {
    method: 'PATCH',
    token: adminToken,
    body: { name: '后台测试用户改名', role: 'VENUE_ADMIN', status: 'DISABLED' },
  });
  assert.equal(update.status, 200);
  assert.equal(update.data.user.name, '后台测试用户改名');
  assert.equal(update.data.user.role, 'VENUE_ADMIN');
  assert.equal(update.data.user.status, 'DISABLED');

  const managerUpdate = await api(`/admin/users/${managedUserId}`, {
    method: 'PATCH',
    token: managerToken,
    body: { name: '越权改名' },
  });
  assert.equal(managerUpdate.status, 403);

  const selfUpdate = await api(`/admin/users/${adminId}`, {
    method: 'PATCH',
    token: adminToken,
    body: { role: 'STUDENT' },
  });
  assert.equal(selfUpdate.status, 400);
  assert.equal(selfUpdate.data.error.code, 'VALIDATION_ERROR');
});

test('A-09 爽约名单只读且字段完整', async () => {
  const { status, data } = await api('/admin/no-shows', { token: adminToken });
  assert.equal(status, 200);
  const student = data.items.find((item) => item.student_no === '2024000001');
  assert.ok(student, '学院管理员应能看到种子爽约记录');
  assert.equal(Number(student.no_show_count), 1);
  assert.equal(Number(student.credit_score), 90);
  assert.equal(student.suspended_until, null);

  const manager = await api('/admin/no-shows', { token: managerToken });
  assert.equal(manager.status, 200);
  assert.ok(Array.isArray(manager.data.items));

  const write = await api('/admin/no-shows', {
    method: 'POST',
    token: adminToken,
    body: {},
  });
  assert.equal(write.status, 404);
});

test('A-10 操作日志记录审批操作，场地管理员只看到授权范围', async () => {
  const logs = await api('/admin/logs?limit=500', { token: adminToken });
  assert.equal(logs.status, 200);
  assert.ok(
    logs.data.items.some(
      (log) => log.action === 'BOOKING_APPROVED' && Number(log.target_id) === bookings.approve,
    ),
  );
  assert.ok(
    logs.data.items.some(
      (log) => log.action === 'BOOKING_REJECTED' && Number(log.target_id) === bookings.reject,
    ),
  );

  const managerLogs = await api('/admin/logs?limit=500', { token: managerToken });
  assert.equal(managerLogs.status, 200);
  assert.ok(
    managerLogs.data.items.every(
      (log) =>
        [1, 2, 3].includes(Number(log.resource_id)) ||
        Number(log.actor_id) === managerId,
    ),
    '场地管理员看到了未授权范围的日志',
  );

  const write = await api('/admin/logs', {
    method: 'POST',
    token: adminToken,
    body: { action: 'FAKE' },
  });
  assert.equal(write.status, 404);
});

test('A-11 场地管理员越界修改场地或维护时段返回 403', async () => {
  const update = await api('/admin/resources/5', {
    method: 'PUT',
    token: managerToken,
    body: {
      name: '活动室 D-301',
      type: 'ACTIVITY',
      building: '学生中心',
      room: 'D-301',
      capacity: 20,
      openFrom: '09:00',
      openTo: '21:00',
      status: 'OPEN',
    },
  });
  assert.equal(update.status, 403);
  assert.equal(update.data.error.code, 'FORBIDDEN');

  const maintenance = await api('/admin/resources/5/maintenance', {
    method: 'POST',
    token: managerToken,
    body: {
      startAt: `${TOMORROW} 18:00`,
      endAt: `${TOMORROW} 19:00`,
      reason: '越权测试',
    },
  });
  assert.equal(maintenance.status, 403);
  assert.equal(maintenance.data.error.code, 'FORBIDDEN');
});
