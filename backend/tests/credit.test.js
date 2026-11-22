import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';

const BASE = process.env.API_BASE || 'http://127.0.0.1:3000/api';

// 专用测试账号，避免污染演示学生的信用分和爽约记录。
const TEST_STUDENT_NO = 's2_credit_autotest';
const TEST_STUDENT_NAME = 'S2 信用自动化测试';
const TEST_PASSWORD = '123456';
// 与 database/seed.sql 中演示学生相同的 123456 口令哈希。
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

let testUserId = null;
let studentToken = null;
let otherStudentToken = null;
let adminToken = null;
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
    token: studentToken,
    body: { resourceId, startAt, endAt },
  });
  assert.equal(status, 201, `创建测试预约失败：${JSON.stringify(data)}`);
  return Number(data.booking.id);
}

/**
 * 把预约改成“已经开始 minutesAgo 分钟”，并删除占用的槽位。
 * 正常接口不允许创建过去的预约，因此只能用 SQL 构造时间边界数据。
 */
async function shiftBookingToPast(bookingId, minutesAgo, durationMinutes = 30) {
  await pool.query(
    `UPDATE bookings
        SET start_at = DATE_SUB(NOW(), INTERVAL ? MINUTE),
            end_at = DATE_ADD(DATE_SUB(NOW(), INTERVAL ? MINUTE), INTERVAL ? MINUTE)
      WHERE id = ?`,
    [minutesAgo, minutesAgo, durationMinutes, bookingId],
  );
  await pool.query('DELETE FROM booking_slots WHERE booking_id = ?', [bookingId]);
}

async function deleteTestUserData(userId) {
  if (!userId) return;

  const [bookingRows] = await pool.query('SELECT id FROM bookings WHERE user_id = ?', [userId]);
  const [creditRows] = await pool.query('SELECT id FROM credit_records WHERE user_id = ?', [userId]);
  const [appealRows] = await pool.query('SELECT id FROM appeals WHERE user_id = ?', [userId]);
  const bookingIds = bookingRows.map((row) => Number(row.id));
  const creditIds = creditRows.map((row) => Number(row.id));
  const appealIds = appealRows.map((row) => Number(row.id));

  const logConditions = ['actor_id = ?'];
  const logParams = [userId];
  if (bookingIds.length) {
    logConditions.push('(target_type = ? AND target_id IN (?))');
    logParams.push('booking', bookingIds);
  }
  if (creditIds.length) {
    logConditions.push('(target_type = ? AND target_id IN (?))');
    logParams.push('credit_record', creditIds);
  }
  if (appealIds.length) {
    logConditions.push('(target_type = ? AND target_id IN (?))');
    logParams.push('appeal', appealIds);
  }
  await pool.query(
    `DELETE FROM operation_logs WHERE ${logConditions.join(' OR ')}`,
    logParams,
  );

  await pool.query('DELETE FROM appeals WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM credit_records WHERE user_id = ?', [userId]);
  if (bookingIds.length) {
    await pool.query('DELETE FROM checkins WHERE booking_id IN (?)', [bookingIds]);
    await pool.query('DELETE FROM bookings WHERE id IN (?)', [bookingIds]);
  }
  await pool.query('DELETE FROM users WHERE id = ?', [userId]);
}

async function removeTestUserByStudentNo(studentNo) {
  const [rows] = await pool.query('SELECT id FROM users WHERE student_no = ?', [studentNo]);
  if (rows[0]) {
    await deleteTestUserData(Number(rows[0].id));
  }
}

before(async () => {
  await removeTestUserByStudentNo(TEST_STUDENT_NO);

  const [result] = await pool.query(
    `INSERT INTO users (student_no, name, password_hash, role, status, credit_score)
     VALUES (?, ?, ?, 'STUDENT', 'ACTIVE', 100)`,
    [TEST_STUDENT_NO, TEST_STUDENT_NAME, TEST_PASSWORD_HASH],
  );
  testUserId = Number(result.insertId);

  studentToken = (await login(TEST_STUDENT_NO, TEST_PASSWORD)).token;
  otherStudentToken = (await login('2024030202003', TEST_PASSWORD)).token;
  adminToken = (await login('admin', 'admin123')).token;
  const manager = await login('manager', 'manager123');
  managerToken = manager.token;
  managerId = Number(manager.user.id);

  // 预约全部落在明天，避免和 core.test.js 使用的资源 5/6 时段冲突。
  // 资源 4（琴房）09:00—21:00；资源 5（活动室）09:00—21:00；资源 1（研讨室）08:00—22:00。
  bookings.beforeStart = await createBooking(
    4, `${TOMORROW} 09:00`, `${TOMORROW} 09:30`,
  );
  bookings.expired = await createBooking(
    4, `${TOMORROW} 09:30`, `${TOMORROW} 10:00`,
  );
  bookings.released = await createBooking(
    4, `${TOMORROW} 10:00`, `${TOMORROW} 10:30`,
  );
  bookings.noShow2 = await createBooking(
    4, `${TOMORROW} 10:30`, `${TOMORROW} 11:00`,
  );
  bookings.noShow3 = await createBooking(
    4, `${TOMORROW} 11:00`, `${TOMORROW} 11:30`,
  );
  bookings.cancel = await createBooking(
    4, `${TOMORROW} 11:30`, `${TOMORROW} 12:00`,
  );
  bookings.selfCheckin = await createBooking(
    4, `${TOMORROW} 12:00`, `${TOMORROW} 12:30`,
  );
  bookings.qrCheckin = await createBooking(
    4, `${TOMORROW} 12:30`, `${TOMORROW} 13:00`,
  );
  bookings.outOfScope = await createBooking(
    5, `${TOMORROW} 09:00`, `${TOMORROW} 09:30`,
  );
  bookings.assisted = await createBooking(
    1, `${TOMORROW} 08:00`, `${TOMORROW} 08:30`,
  );
  bookings.assistBeforeStart = await createBooking(
    1, `${TOMORROW} 08:30`, `${TOMORROW} 09:00`,
  );
  bookings.approval = await createBooking(
    2, `${TOMORROW} 10:00`, `${TOMORROW} 10:30`,
  );
  bookings.approvalReject = await createBooking(
    2, `${TOMORROW} 10:30`, `${TOMORROW} 11:00`,
  );
});

after(async () => {
  try {
    await deleteTestUserData(testUserId);
  } finally {
    await pool.end();
  }
});

test('P-01 学生访问管理端接口返回 403', async () => {
  for (const path of ['/admin/dashboard', '/admin/users', '/admin/logs']) {
    const { status, data } = await api(path, { token: studentToken });
    assert.equal(status, 403, path);
    assert.equal(data.error.code, 'FORBIDDEN');
  }
});

test('P-02 场地管理员越界访问未分配场地返回 403', async () => {
  const detail = await api(`/bookings/${bookings.outOfScope}`, { token: managerToken });
  assert.equal(detail.status, 403);
  assert.equal(detail.data.error.code, 'FORBIDDEN');

  const assisted = await api(`/admin/bookings/${bookings.outOfScope}/assisted-checkin`, {
    method: 'POST',
    token: managerToken,
    body: {},
  });
  assert.equal(assisted.status, 403);
  assert.equal(assisted.data.error.code, 'FORBIDDEN');
});

test('P-03 场地管理员只能看到分配给自己的 1—3 号场地', async () => {
  const resources = await api('/admin/resources', { token: managerToken });
  assert.equal(resources.status, 200);
  assert.deepEqual(
    resources.data.items.map((item) => Number(item.id)).sort((a, b) => a - b),
    [1, 2, 3],
  );

  const list = await api('/admin/bookings', { token: managerToken });
  assert.equal(list.status, 200);
  assert.ok(
    list.data.items.every((item) => [1, 2, 3].includes(Number(item.resourceId))),
    '场地管理员看到了未分配场地的预约',
  );
});

test('P-04 学院管理员可查看用户列表和操作日志', async () => {
  const users = await api('/admin/users', { token: adminToken });
  assert.equal(users.status, 200);
  assert.ok(users.data.items.some((item) => item.student_no === TEST_STUDENT_NO));

  const logs = await api('/admin/logs?limit=20', { token: adminToken });
  assert.equal(logs.status, 200);
  assert.ok(Array.isArray(logs.data.items));
});

test('P-05 非本人预约不能查看、取消或签到', async () => {
  const detail = await api(`/bookings/${bookings.beforeStart}`, { token: otherStudentToken });
  assert.equal(detail.status, 403);
  assert.equal(detail.data.error.code, 'FORBIDDEN');

  const cancel = await api(`/bookings/${bookings.beforeStart}/cancel`, {
    method: 'POST',
    token: otherStudentToken,
    body: { reason: '越权测试' },
  });
  assert.equal(cancel.status, 403);
  assert.equal(cancel.data.error.code, 'FORBIDDEN');

  const checkin = await api(`/bookings/${bookings.beforeStart}/checkin`, {
    method: 'POST',
    token: otherStudentToken,
    body: {},
  });
  assert.equal(checkin.status, 403);
  assert.equal(checkin.data.error.code, 'FORBIDDEN');
});

test('S-01 开始后 15 分钟内自助签到成功并生成 checkins 记录', async () => {
  await shiftBookingToPast(bookings.selfCheckin, 5);

  const { status, data } = await api(`/bookings/${bookings.selfCheckin}/checkin`, {
    method: 'POST',
    token: studentToken,
    body: {},
  });
  assert.equal(status, 200);
  assert.equal(data.booking.status, 'CHECKED_IN');
  assert.ok(data.booking.checkedInAt);

  const [rows] = await pool.query(
    'SELECT method, operator_id FROM checkins WHERE booking_id = ?',
    [bookings.selfCheckin],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].method, 'QR');
  assert.equal(rows[0].operator_id, null);

  const duplicate = await api(`/bookings/${bookings.selfCheckin}/checkin`, {
    method: 'POST',
    token: studentToken,
    body: {},
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.data.error.code, 'INVALID_STATE');
});

test('S-01b 签到码扫码接口可完成签到', async () => {
  await shiftBookingToPast(bookings.qrCheckin, 5);
  const detail = await api(`/bookings/${bookings.qrCheckin}`, { token: studentToken });
  assert.equal(detail.status, 200);
  assert.ok(detail.data.booking.qrToken);

  const { status, data } = await api('/bookings/checkin', {
    method: 'POST',
    token: studentToken,
    body: { qrToken: detail.data.booking.qrToken },
  });
  assert.equal(status, 200);
  assert.equal(data.booking.id, bookings.qrCheckin);
  assert.equal(data.booking.status, 'CHECKED_IN');
});

test('S-02 开始前签到返回 409 INVALID_STATE', async () => {
  const { status, data } = await api(`/bookings/${bookings.beforeStart}/checkin`, {
    method: 'POST',
    token: studentToken,
    body: {},
  });
  assert.equal(status, 409);
  assert.equal(data.error.code, 'INVALID_STATE');
});

test('S-03 开始 15 分钟后签到返回 409 CHECKIN_EXPIRED', async () => {
  await shiftBookingToPast(bookings.expired, 20);

  const { status, data } = await api(`/bookings/${bookings.expired}/checkin`, {
    method: 'POST',
    token: studentToken,
    body: {},
  });
  assert.equal(status, 409);
  assert.equal(data.error.code, 'CHECKIN_EXPIRED');

  // 防止定时任务在后续用例中把这条预约再记一次爽约。
  await pool.query(
    "UPDATE bookings SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = ? AND status = 'PENDING'",
    [bookings.expired],
  );
  await pool.query('DELETE FROM booking_slots WHERE booking_id = ?', [bookings.expired]);
});

test('S-04 取消待签到预约释放时段，重复取消返回 409', async () => {
  const first = await api(`/bookings/${bookings.cancel}/cancel`, {
    method: 'POST',
    token: studentToken,
    body: { reason: '自动化测试取消' },
  });
  assert.equal(first.status, 200);
  assert.equal(first.data.booking.status, 'CANCELLED');

  const second = await api(`/bookings/${bookings.cancel}/cancel`, {
    method: 'POST',
    token: studentToken,
    body: { reason: '重复取消' },
  });
  assert.equal(second.status, 409);
  assert.equal(second.data.error.code, 'INVALID_STATE');

  const availability = await api(`/resources/4/availability?date=${TOMORROW}`, {
    token: studentToken,
  });
  assert.equal(availability.status, 200);
  const slot = availability.data.slots.find((item) => item.startTime === '11:30');
  assert.ok(slot, '取消后应能查到 11:30 槽位');
  assert.equal(slot.available, true);
});

test('C-01 定时任务释放超时预约并记录一次爽约', async () => {
  await shiftBookingToPast(bookings.released, 20);

  const run = await api('/admin/scheduler/run', {
    method: 'POST',
    token: adminToken,
    body: {},
  });
  assert.equal(run.status, 200);

  const detail = await api(`/bookings/${bookings.released}`, { token: studentToken });
  assert.equal(detail.status, 200);
  assert.equal(detail.data.booking.status, 'RELEASED');

  const [records] = await pool.query(
    "SELECT id, status FROM credit_records WHERE user_id = ? AND booking_id = ? AND type = 'NO_SHOW'",
    [testUserId, bookings.released],
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].status, 'VALID');

  const [users] = await pool.query('SELECT credit_score FROM users WHERE id = ?', [testUserId]);
  assert.equal(Number(users[0].credit_score), 90);
});

test('S-05 已释放预约不能补签到，只能申诉', async () => {
  const { status, data } = await api(`/bookings/${bookings.released}/checkin`, {
    method: 'POST',
    token: studentToken,
    body: {},
  });
  assert.equal(status, 409);
  assert.equal(data.error.code, 'INVALID_STATE');
  assert.match(data.error.message, /自动释放/);
});

test('C-02 近 30 天 3 次爽约后停权，停权期内下单返回 USER_SUSPENDED', async () => {
  await shiftBookingToPast(bookings.noShow2, 20);
  await shiftBookingToPast(bookings.noShow3, 20);

  const run = await api('/admin/scheduler/run', {
    method: 'POST',
    token: adminToken,
    body: {},
  });
  assert.equal(run.status, 200);

  const credit = await api('/credit/me', { token: studentToken });
  assert.equal(credit.status, 200);
  assert.equal(credit.data.noShowCount, 3);
  assert.equal(credit.data.user.creditScore, 70);
  assert.ok(credit.data.user.suspendedUntil, '3 次爽约后应写入停权截止时间');

  const attempt = await api('/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      resourceId: 6,
      startAt: `${TOMORROW} 10:00`,
      endAt: `${TOMORROW} 10:30`,
    },
  });
  assert.equal(attempt.status, 403);
  assert.equal(attempt.data.error.code, 'USER_SUSPENDED');
});

test('C-03 定时任务重复执行不会重复扣分（幂等）', async () => {
  await api('/admin/scheduler/run', { method: 'POST', token: adminToken, body: {} });
  await api('/admin/scheduler/run', { method: 'POST', token: adminToken, body: {} });

  const credit = await api('/credit/me', { token: studentToken });
  assert.equal(credit.status, 200);
  assert.equal(credit.data.noShowCount, 3);
  assert.equal(credit.data.user.creditScore, 70);

  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM credit_records
      WHERE user_id = ? AND type = 'NO_SHOW' AND status = 'VALID'`,
    [testUserId],
  );
  assert.equal(Number(rows[0].count), 3);
});

test('E-03 申诉通过后爽约记录撤销、信用分恢复、停权解除', async () => {
  const submit = await api('/credit/appeals', {
    method: 'POST',
    token: studentToken,
    body: { bookingId: bookings.released, reason: '网络故障未能按时签到' },
  });
  assert.equal(submit.status, 201);
  assert.equal(submit.data.appeal.status, 'PENDING');

  const appealId = Number(submit.data.appeal.id);
  const handle = await api(`/admin/appeals/${appealId}/handle`, {
    method: 'POST',
    token: adminToken,
    body: { decision: 'APPROVED', result: '情况属实，撤销本次爽约' },
  });
  assert.equal(handle.status, 200);
  assert.equal(handle.data.appeal.status, 'APPROVED');

  const credit = await api('/credit/me', { token: studentToken });
  assert.equal(credit.status, 200);
  assert.equal(credit.data.noShowCount, 2);
  assert.equal(credit.data.user.creditScore, 80);
  assert.equal(credit.data.user.suspendedUntil, null);

  const [records] = await pool.query(
    "SELECT status FROM credit_records WHERE user_id = ? AND booking_id = ? AND type = 'NO_SHOW'",
    [testUserId, bookings.released],
  );
  assert.equal(records[0].status, 'REVOKED');

  const again = await api(`/admin/appeals/${appealId}/handle`, {
    method: 'POST',
    token: adminToken,
    body: { decision: 'REJECTED', result: '重复处理' },
  });
  assert.equal(again.status, 409);
  assert.equal(again.data.error.code, 'INVALID_STATE');
});

test('E-03b 申诉驳回后爽约记录保持有效，信用分不再变化', async () => {
  const submit = await api('/credit/appeals', {
    method: 'POST',
    token: studentToken,
    body: { bookingId: bookings.noShow2, reason: '当天临时有事未能到场' },
  });
  assert.equal(submit.status, 201);
  assert.equal(submit.data.appeal.status, 'PENDING');

  const appealId = Number(submit.data.appeal.id);
  const handle = await api(`/admin/appeals/${appealId}/handle`, {
    method: 'POST',
    token: adminToken,
    body: { decision: 'REJECTED', result: '未提供有效证明，维持爽约记录' },
  });
  assert.equal(handle.status, 200);
  assert.equal(handle.data.appeal.status, 'REJECTED');

  const credit = await api('/credit/me', { token: studentToken });
  assert.equal(credit.status, 200);
  assert.equal(credit.data.noShowCount, 2);
  assert.equal(credit.data.user.creditScore, 80);
  assert.equal(credit.data.user.suspendedUntil, null);

  const [records] = await pool.query(
    "SELECT status FROM credit_records WHERE user_id = ? AND booking_id = ? AND type = 'NO_SHOW'",
    [testUserId, bookings.noShow2],
  );
  assert.equal(records[0].status, 'VALID');

  const again = await api(`/admin/appeals/${appealId}/handle`, {
    method: 'POST',
    token: adminToken,
    body: { decision: 'APPROVED', result: '重复处理' },
  });
  assert.equal(again.status, 409);
  assert.equal(again.data.error.code, 'INVALID_STATE');
});

test('E-02 开始后 15 分钟内管理员辅助签到，写入 checkins 与操作日志', async () => {
  await shiftBookingToPast(bookings.assisted, 5);

  const { status, data } = await api(`/admin/bookings/${bookings.assisted}/assisted-checkin`, {
    method: 'POST',
    token: managerToken,
    body: {},
  });
  assert.equal(status, 200);
  assert.equal(data.booking.status, 'CHECKED_IN');

  const [checkins] = await pool.query(
    'SELECT method, operator_id FROM checkins WHERE booking_id = ?',
    [bookings.assisted],
  );
  assert.equal(checkins.length, 1);
  assert.equal(checkins[0].method, 'ASSISTED');
  assert.equal(Number(checkins[0].operator_id), managerId);

  const logs = await api('/admin/logs?limit=500', { token: adminToken });
  assert.equal(logs.status, 200);
  assert.ok(
    logs.data.items.some(
      (log) =>
        log.action === 'BOOKING_ASSISTED_CHECKIN' &&
        Number(log.target_id) === bookings.assisted,
    ),
    '操作日志中应能查到辅助签到记录',
  );
});

test('E-01 开始前管理员辅助签到返回 409 INVALID_STATE', async () => {
  const { status, data } = await api(
    `/admin/bookings/${bookings.assistBeforeStart}/assisted-checkin`,
    { method: 'POST', token: managerToken, body: {} },
  );
  assert.equal(status, 409);
  assert.equal(data.error.code, 'INVALID_STATE');
});

test('E-04 管理端预约审批：通过后回到 PENDING，驳回释放时段', async () => {
  await pool.query(
    "UPDATE bookings SET status = 'PENDING_APPROVAL' WHERE id = ?",
    [bookings.approval],
  );
  const approve = await api(`/admin/bookings/${bookings.approval}/review`, {
    method: 'POST',
    token: managerToken,
    body: { decision: 'APPROVE' },
  });
  assert.equal(approve.status, 200);
  assert.equal(approve.data.booking.status, 'PENDING');

  const duplicate = await api(`/admin/bookings/${bookings.approval}/review`, {
    method: 'POST',
    token: managerToken,
    body: { decision: 'APPROVE' },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.data.error.code, 'INVALID_STATE');

  await pool.query(
    "UPDATE bookings SET status = 'PENDING_APPROVAL' WHERE id = ?",
    [bookings.approvalReject],
  );
  const reject = await api(`/admin/bookings/${bookings.approvalReject}/review`, {
    method: 'POST',
    token: adminToken,
    body: { decision: 'REJECT', reason: '场地临时检修' },
  });
  assert.equal(reject.status, 200);
  assert.equal(reject.data.booking.status, 'REJECTED');

  const [slots] = await pool.query(
    'SELECT COUNT(*) AS count FROM booking_slots WHERE booking_id = ?',
    [bookings.approvalReject],
  );
  assert.equal(Number(slots[0].count), 0);
});

test('E-05 操作日志只读，不提供新增入口', async () => {
  const { status } = await api('/admin/logs', {
    method: 'POST',
    token: adminToken,
    body: { action: 'FAKE' },
  });
  assert.equal(status, 404);
});
