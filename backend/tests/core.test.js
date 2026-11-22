import { after, test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.API_BASE || 'http://127.0.0.1:3000/api';

function pad(value) {
  return value < 10 ? '0' + value : String(value);
}

function formatDate(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

const TOMORROW = formatDate(addDays(1));
const DAY_AFTER = formatDate(addDays(2));

let studentToken = null;
let adminToken = null;
let managerToken = null;
const createdIds = [];

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

after(async () => {
  for (const id of createdIds) {
    await api(`/bookings/${id}/cancel`, {
      method: 'POST',
      token: studentToken,
      body: { reason: '自动化测试清理' },
    });
  }
});

test('健康检查可用', async () => {
  const { status, data } = await api('/health');
  assert.equal(status, 200);
  assert.equal(data.ok, true);
});

test('错误密码无法登录', async () => {
  const { status, data } = await api('/auth/login', {
    method: 'POST',
    body: { studentNo: '2024030202003', password: 'wrong-password' },
  });
  assert.equal(status, 401);
  assert.ok(data.error);
});

test('学生、管理员、场地管理员登录成功', async () => {
  const student = await api('/auth/login', {
    method: 'POST',
    body: { studentNo: '2024030202003', password: '123456' },
  });
  assert.equal(student.status, 200);
  assert.ok(student.data.token);
  studentToken = student.data.token;

  const admin = await api('/auth/login', {
    method: 'POST',
    body: { studentNo: 'admin', password: 'admin123' },
  });
  assert.equal(admin.status, 200);
  adminToken = admin.data.token;

  const manager = await api('/auth/login', {
    method: 'POST',
    body: { studentNo: 'manager', password: 'manager123' },
  });
  assert.equal(manager.status, 200);
  managerToken = manager.data.token;
});

test('未登录不能访问场地列表', async () => {
  const { status } = await api('/resources');
  assert.equal(status, 401);
});

test('场地列表返回种子数据', async () => {
  const { status, data } = await api('/resources', { token: studentToken });
  assert.equal(status, 200);
  assert.ok(data.items.length >= 6);
  assert.ok(data.items.every((item) => item.name && item.typeLabel));
});

test('空档按 30 分钟切分且在开放时间内', async () => {
  const { status, data } = await api(`/resources/1/availability?date=${TOMORROW}`, {
    token: studentToken,
  });
  assert.equal(status, 200);
  assert.ok(data.slots.length > 0);
  for (const slot of data.slots) {
    const start = new Date(slot.start.replace(' ', 'T'));
    const end = new Date(slot.end.replace(' ', 'T'));
    assert.equal((end - start) / 60000, 30);
    assert.equal(start.getMinutes() % 30, 0);
  }
});

test('非 30 分钟整点被拒绝', async () => {
  const { status, data } = await api('/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      resourceId: 5,
      startAt: `${TOMORROW} 10:15`,
      endAt: `${TOMORROW} 11:15`,
    },
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, 'GRANULARITY_INVALID');
});

test('单笔超过 4 小时被拒绝', async () => {
  const { status, data } = await api('/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      resourceId: 5,
      startAt: `${TOMORROW} 09:00`,
      endAt: `${TOMORROW} 13:30`,
    },
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, 'DURATION_EXCEEDED');
});

test('跨天预约被拒绝', async () => {
  const { status, data } = await api('/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      resourceId: 5,
      startAt: `${TOMORROW} 20:00`,
      endAt: `${DAY_AFTER} 01:00`,
    },
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, 'CROSS_DAY_INVALID');
});

test('只能预约今天和明天', async () => {
  const { status, data } = await api('/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      resourceId: 5,
      startAt: `${DAY_AFTER} 10:00`,
      endAt: `${DAY_AFTER} 11:00`,
    },
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, 'BOOKING_WINDOW_INVALID');
});

test('正常创建预约并生成签到码', async () => {
  const { status, data } = await api('/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      resourceId: 5,
      startAt: `${TOMORROW} 20:00`,
      endAt: `${TOMORROW} 21:00`,
    },
  });
  assert.equal(status, 201);
  assert.equal(data.booking.status, 'PENDING');
  assert.ok(data.booking.qrToken);
  createdIds.push(data.booking.id);
});

test('同一时段重复预约返回冲突', async () => {
  const { status, data } = await api('/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      resourceId: 5,
      startAt: `${TOMORROW} 20:00`,
      endAt: `${TOMORROW} 21:00`,
    },
  });
  assert.equal(status, 409);
  assert.equal(data.error.code, 'SLOT_CONFLICT');
});

test('我的预约包含刚创建的记录', async () => {
  const { status, data } = await api('/bookings/mine', { token: studentToken });
  assert.equal(status, 200);
  assert.ok(data.items.some((item) => createdIds.includes(item.id)));
});

test('取消预约释放时段，重复取消被拒绝', async () => {
  const id = createdIds[0];
  const first = await api(`/bookings/${id}/cancel`, {
    method: 'POST',
    token: studentToken,
    body: { reason: '测试取消' },
  });
  assert.equal(first.status, 200);
  assert.equal(first.data.booking.status, 'CANCELLED');

  const second = await api(`/bookings/${id}/cancel`, {
    method: 'POST',
    token: studentToken,
    body: { reason: '重复取消' },
  });
  assert.equal(second.status, 409);

  const availability = await api(`/resources/5/availability?date=${TOMORROW}`, {
    token: studentToken,
  });
  const slot = availability.data.slots.find((item) => item.startTime === '20:00');
  assert.equal(slot.available, true);
});

test('10 个并发预约只有 1 个成功', async () => {
  const payload = {
    resourceId: 6,
    startAt: `${TOMORROW} 16:00`,
    endAt: `${TOMORROW} 17:00`,
  };
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      api('/bookings', { method: 'POST', token: studentToken, body: payload }),
    ),
  );
  const successes = results.filter((item) => item.status === 201);
  const conflicts = results.filter(
    (item) => item.status === 409 && item.data.error.code === 'SLOT_CONFLICT',
  );
  assert.equal(successes.length, 1);
  assert.equal(conflicts.length, 9);
  createdIds.push(successes[0].data.booking.id);
});

test('AI 找位能正确解析中文需求并返回候选', async () => {
  const { status, data } = await api('/ai/find-seat', {
    method: 'POST',
    token: studentToken,
    body: { message: '明天下午3点，4个人，找个研讨室开1小时' },
  });
  assert.equal(status, 200);
  assert.equal(data.interpretation.people, 4);
  assert.equal(data.interpretation.resourceType, 'SEMINAR');
  assert.equal(data.interpretation.startTime, '15:00');
  assert.ok(data.candidates.length <= 3);
  assert.ok(data.candidates.every((item) => item.type === 'SEMINAR'));
});

test('学生不能访问管理端接口', async () => {
  const { status } = await api('/admin/dashboard', { token: studentToken });
  assert.equal(status, 403);
});

test('学院管理员可访问仪表盘和规则', async () => {
  const dashboard = await api('/admin/dashboard', { token: adminToken });
  assert.equal(dashboard.status, 200);
  assert.ok(dashboard.data.stats);

  const rules = await api('/admin/rules', { token: adminToken });
  assert.equal(rules.status, 200);
  assert.equal(rules.data.rules.slotMinutes, 30);
});

test('场地管理员可对本场地预约辅助签到（未开始则拒绝）', async () => {
  const booking = await api('/bookings/1', { token: managerToken });
  assert.equal(booking.status, 200);

  const result = await api('/admin/bookings/1/assisted-checkin', {
    method: 'POST',
    token: managerToken,
    body: {},
  });
  assert.equal(result.status, 409);
  assert.ok(['INVALID_STATE', 'CHECKIN_EXPIRED'].includes(result.data.error.code));
});

test('信用分摘要包含规则参数', async () => {
  const { status, data } = await api('/credit/me', { token: studentToken });
  assert.equal(status, 200);
  assert.equal(data.noShowLimit, 3);
  assert.equal(data.windowDays, 30);
  assert.equal(data.suspensionDays, 7);
  assert.equal(typeof data.user.creditScore, 'number');
});
