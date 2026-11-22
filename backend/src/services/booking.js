import { randomUUID } from 'node:crypto';
import { RULES } from '../config.js';
import { pool, withTransaction } from '../db.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import {
  addDays,
  addMinutes,
  formatDate,
  formatDateTime,
  isOnGrid,
  isSameDay,
  minutesBetween,
  now,
  parseDate,
  parseDateTime,
  startOfDay,
} from '../utils/time.js';
import { writeLog } from './audit.js';
import {
  assertNoMaintenanceConflict,
  getManagedResourceIds,
  getResourceOrThrow,
} from './availability.js';

function newQrToken() {
  return randomUUID().replace(/-/g, '');
}

function mapBooking(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    userName: row.user_name,
    studentNo: row.student_no,
    resourceId: Number(row.resource_id),
    resourceName: row.resource_name,
    building: row.building,
    room: row.room,
    resourceType: row.resource_type,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    source: row.source,
    qrToken: row.qr_token,
    checkedInAt: row.checked_in_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    renewedFromId: row.renewed_from_id ? Number(row.renewed_from_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BOOKING_SELECT = `
  SELECT b.*, u.name AS user_name, u.student_no,
         r.name AS resource_name, r.building, r.room, r.type AS resource_type
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    JOIN resources r ON r.id = b.resource_id
`;

export async function getBookingRow(executor, bookingId) {
  const [rows] = await executor.query(`${BOOKING_SELECT} WHERE b.id = ? LIMIT 1`, [bookingId]);
  return rows[0] || null;
}

export async function assertBookingAccess(executor, actor, booking) {
  if (actor.role === 'COLLEGE_ADMIN') return;
  if (actor.role === 'VENUE_ADMIN') {
    const managed = await getManagedResourceIds(executor, actor.id);
    if (!managed.includes(Number(booking.resource_id))) {
      throw new AppError(403, ErrorCodes.FORBIDDEN, '只能查看本人负责场地的预约');
    }
    return;
  }
  if (Number(booking.user_id) !== Number(actor.id)) {
    throw new AppError(403, ErrorCodes.FORBIDDEN, '只能查看本人的预约');
  }
}

async function assertActiveUser(executor, userId, at) {
  const [rows] = await executor.query(
    'SELECT id, status, suspended_until FROM users WHERE id = ? LIMIT 1',
    [userId],
  );
  const user = rows[0];
  if (!user) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, '用户不存在');
  }
  if (user.status !== 'ACTIVE') {
    throw new AppError(403, ErrorCodes.FORBIDDEN, '账号已被停用');
  }
  if (user.suspended_until && parseDateTime(user.suspended_until) > at) {
    throw new AppError(403, ErrorCodes.USER_SUSPENDED, `账号停权中，截止 ${user.suspended_until}`);
  }
}

export async function validateBookingInput({ userId, resourceId, startAt, endAt }, executor = pool) {
  const start = parseDateTime(startAt);
  const end = parseDateTime(endAt);
  if (!start || !end) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, '时间格式应为 YYYY-MM-DD HH:mm');
  }
  if (start >= end) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, '结束时间必须晚于开始时间');
  }
  if (!isSameDay(start, end)) {
    throw new AppError(400, ErrorCodes.CROSS_DAY_INVALID, '不允许跨天预约');
  }
  if (!isOnGrid(start) || !isOnGrid(end)) {
    throw new AppError(400, ErrorCodes.GRANULARITY_INVALID, '开始与结束时间必须是 30 分钟的整数倍');
  }
  const duration = minutesBetween(start, end);
  if (duration > RULES.maxBookingMinutes) {
    throw new AppError(400, ErrorCodes.DURATION_EXCEEDED, '单笔预约最长 4 小时');
  }

  const current = now();
  if (start < current) {
    throw new AppError(400, ErrorCodes.BOOKING_WINDOW_INVALID, '不能预约已经过去的时段');
  }
  const latestDate = addDays(startOfDay(current), RULES.advanceDays);
  if (startOfDay(start) > latestDate) {
    throw new AppError(400, ErrorCodes.BOOKING_WINDOW_INVALID, '只能预约今天和明天');
  }

  const resource = await getResourceOrThrow(executor, resourceId);
  if (resource.status !== 'OPEN') {
    throw new AppError(409, ErrorCodes.RESOURCE_CLOSED, '该场地当前未开放');
  }

  const [openHour, openMinute] = resource.open_from.split(':').map(Number);
  const [closeHour, closeMinute] = resource.open_to.split(':').map(Number);
  const openStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), openHour, openMinute, 0, 0);
  const openEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), closeHour, closeMinute, 0, 0);
  if (start < openStart || end > openEnd) {
    throw new AppError(400, ErrorCodes.BOOKING_WINDOW_INVALID, '预约时间必须在场地开放时间内');
  }

  await assertActiveUser(executor, userId, current);
  await assertNoMaintenanceConflict(executor, resourceId, start, end);

  return { start, end, duration, resource };
}

export async function createBooking({
  actor,
  resourceId,
  startAt,
  endAt,
  source = 'MINI_PROGRAM',
  renewedFromId = null,
}) {
  try {
    return await withTransaction(async (connection) => {
      const { start, end } = await validateBookingInput(
        { userId: actor.id, resourceId, startAt, endAt },
        connection,
      );

      const [insertResult] = await connection.query(
        `INSERT INTO bookings
           (user_id, resource_id, start_at, end_at, status, source, qr_token, renewed_from_id)
         VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
        [actor.id, resourceId, formatDateTime(start), formatDateTime(end), source, newQrToken(), renewedFromId],
      );
      const bookingId = insertResult.insertId;

      // 每个 30 分钟槽位一行。主键冲突说明有人抢先占用，事务整体回滚。
      for (let cursor = start; cursor < end; cursor = addMinutes(cursor, RULES.slotMinutes)) {
        await connection.query(
          'INSERT INTO booking_slots (resource_id, slot_start, booking_id) VALUES (?, ?, ?)',
          [resourceId, formatDateTime(cursor), bookingId],
        );
      }

      await writeLog(connection, {
        actorId: actor.id,
        action: 'BOOKING_CREATED',
        targetType: 'booking',
        targetId: bookingId,
        resourceId,
        detail: { resourceId, startAt: formatDateTime(start), endAt: formatDateTime(end) },
      });

      const row = await getBookingRow(connection, bookingId);
      return mapBooking(row);
    });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      throw new AppError(409, ErrorCodes.SLOT_CONFLICT, '该时段已被预约，请选择其他时段');
    }
    throw error;
  }
}

export async function getBookingDetail(actor, bookingId) {
  const row = await getBookingRow(pool, bookingId);
  if (!row) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, '预约不存在');
  }
  await assertBookingAccess(pool, actor, row);
  return mapBooking(row);
}

export async function listMyBookings(userId, { status, from, to } = {}) {
  const conditions = ['b.user_id = ?'];
  const params = [userId];
  if (status) {
    conditions.push('b.status = ?');
    params.push(status);
  }
  if (from) {
    conditions.push('b.start_at >= ?');
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    conditions.push('b.start_at < ?');
    const endDate = new Date(`${to}T00:00:00`);
    endDate.setDate(endDate.getDate() + 1);
    params.push(formatDateTime(endDate));
  }
  const [rows] = await pool.query(
    `${BOOKING_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY b.start_at DESC LIMIT 100`,
    params,
  );
  return rows.map(mapBooking);
}

export async function cancelBooking(actor, bookingId, reason) {
  const row = await getBookingRow(pool, bookingId);
  if (!row) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, '预约不存在');
  }
  const isOwner = Number(row.user_id) === Number(actor.id);
  if (!isOwner && actor.role !== 'COLLEGE_ADMIN') {
    throw new AppError(403, ErrorCodes.FORBIDDEN, '只能取消本人的预约');
  }
  await assertBookingAccess(pool, actor, row);
  if (row.status !== 'PENDING') {
    throw new AppError(409, ErrorCodes.INVALID_STATE, '只有待签到的预约可以取消');
  }
  if (parseDateTime(row.start_at) <= now()) {
    throw new AppError(409, ErrorCodes.INVALID_STATE, '预约已开始，不能取消；未签到将由系统自动释放');
  }

  await withTransaction(async (connection) => {
    const [result] = await connection.query(
      `UPDATE bookings
          SET status = 'CANCELLED', cancelled_at = NOW(), cancel_reason = ?
        WHERE id = ? AND status = 'PENDING'`,
      [reason || null, bookingId],
    );
    if (result.affectedRows !== 1) {
      throw new AppError(409, ErrorCodes.INVALID_STATE, '预约状态已变化，请刷新后重试');
    }
    await connection.query('DELETE FROM booking_slots WHERE booking_id = ?', [bookingId]);
    await writeLog(connection, {
      actorId: actor.id,
      action: 'BOOKING_CANCELLED',
      targetType: 'booking',
      targetId: bookingId,
      resourceId: row.resource_id,
      detail: { reason: reason || null },
    });
  });

  return getBookingDetail(actor, bookingId);
}

export async function renewBooking(actor, bookingId, newEndAt) {
  const row = await getBookingRow(pool, bookingId);
  if (!row) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, '预约不存在');
  }
  if (Number(row.user_id) !== Number(actor.id)) {
    throw new AppError(403, ErrorCodes.FORBIDDEN, '只能续约本人的预约');
  }
  if (!['PENDING', 'CHECKED_IN'].includes(row.status)) {
    throw new AppError(409, ErrorCodes.INVALID_STATE, '当前预约状态不能续约');
  }

  const [existingRenewal] = await pool.query(
    `SELECT id FROM bookings
      WHERE renewed_from_id = ? AND status IN ('PENDING', 'CHECKED_IN')
      LIMIT 1`,
    [bookingId],
  );
  if (existingRenewal.length > 0) {
    throw new AppError(409, ErrorCodes.CONFLICT, '该预约已经续约过');
  }

  const newEnd = parseDateTime(newEndAt);
  if (!newEnd) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, '续约结束时间格式应为 YYYY-MM-DD HH:mm');
  }
  if (!isSameDay(parseDateTime(row.start_at), newEnd)) {
    throw new AppError(400, ErrorCodes.CROSS_DAY_INVALID, '不允许跨天续约');
  }

  // 续约视为一笔新的相邻预约：从上一笔结束时刻开始，每笔仍受 4 小时上限约束。
  return createBooking({
    actor,
    resourceId: row.resource_id,
    startAt: row.end_at,
    endAt: newEnd,
    source: 'MINI_PROGRAM',
    renewedFromId: bookingId,
  });
}

async function assertCheckInPermission(executor, actor, booking, method) {
  if (Number(booking.user_id) === Number(actor.id)) return;
  if (actor.role === 'COLLEGE_ADMIN') return;
  if (actor.role === 'VENUE_ADMIN' && method === 'ASSISTED') {
    const managed = await getManagedResourceIds(executor, actor.id);
    if (managed.includes(Number(booking.resource_id))) return;
    throw new AppError(403, ErrorCodes.FORBIDDEN, '只能为本场地的预约辅助签到');
  }
  throw new AppError(403, ErrorCodes.FORBIDDEN, '只能签到本人的预约');
}

export async function checkIn(actor, { bookingId, qrToken, method = 'QR' }) {
  let row = null;
  if (qrToken) {
    const [rows] = await pool.query(`${BOOKING_SELECT} WHERE b.qr_token = ? LIMIT 1`, [qrToken]);
    row = rows[0];
  } else if (bookingId) {
    row = await getBookingRow(pool, bookingId);
  }
  if (!row) {
    throw new AppError(404, ErrorCodes.INVALID_QR, '签到码无效或预约不存在');
  }

  await assertCheckInPermission(pool, actor, row, method);
  if (row.status === 'RELEASED') {
    throw new AppError(409, ErrorCodes.INVALID_STATE, '预约已被自动释放，不能补记正常签到，请提交异常申诉');
  }
  if (row.status !== 'PENDING') {
    throw new AppError(409, ErrorCodes.INVALID_STATE, '当前预约状态不能签到');
  }

  const start = parseDateTime(row.start_at);
  const current = now();
  if (current < start) {
    throw new AppError(409, ErrorCodes.INVALID_STATE, '尚未到预约开始时间');
  }
  const deadline = addMinutes(start, RULES.checkinGraceMinutes);
  if (current > deadline) {
    throw new AppError(409, ErrorCodes.CHECKIN_EXPIRED, '已超过开始后 15 分钟，签到窗口已关闭');
  }

  await withTransaction(async (connection) => {
    const [result] = await connection.query(
      `UPDATE bookings SET status = 'CHECKED_IN', checked_in_at = NOW()
        WHERE id = ? AND status = 'PENDING'`,
      [row.id],
    );
    if (result.affectedRows !== 1) {
      throw new AppError(409, ErrorCodes.INVALID_STATE, '预约状态已变化，请刷新后重试');
    }
    await connection.query(
      `INSERT INTO checkins (booking_id, method, operator_id, checked_in_at)
       VALUES (?, ?, ?, NOW())`,
      [row.id, method, method === 'ASSISTED' ? actor.id : null],
    );
    await writeLog(connection, {
      actorId: actor.id,
      action: method === 'ASSISTED' ? 'BOOKING_ASSISTED_CHECKIN' : 'BOOKING_CHECKIN',
      targetType: 'booking',
      targetId: row.id,
      resourceId: row.resource_id,
      detail: { method },
    });
  });

  return getBookingDetail(actor, row.id);
}

export async function listBookingsForAdmin(actor, filters = {}) {
  const conditions = [];
  const params = [];

  if (actor.role === 'VENUE_ADMIN') {
    const managed = await getManagedResourceIds(pool, actor.id);
    if (managed.length === 0) return [];
    conditions.push('b.resource_id IN (?)');
    params.push(managed);
  } else if (actor.role !== 'COLLEGE_ADMIN') {
    throw new AppError(403, ErrorCodes.FORBIDDEN, '没有管理权限');
  }

  if (filters.status) {
    conditions.push('b.status = ?');
    params.push(filters.status);
  }
  if (filters.resourceId) {
    conditions.push('b.resource_id = ?');
    params.push(filters.resourceId);
  }
  if (filters.date) {
    conditions.push('DATE(b.start_at) = ?');
    params.push(filters.date);
  }
  if (filters.userId) {
    conditions.push('b.user_id = ?');
    params.push(filters.userId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `${BOOKING_SELECT} ${where} ORDER BY b.start_at DESC LIMIT 200`,
    params,
  );
  return rows.map(mapBooking);
}

export async function reviewBooking(actor, bookingId, { decision, reason }) {
  if (!['VENUE_ADMIN', 'COLLEGE_ADMIN'].includes(actor.role)) {
    throw new AppError(403, ErrorCodes.FORBIDDEN, '没有审批权限');
  }
  const row = await getBookingRow(pool, bookingId);
  if (!row) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, '预约不存在');
  }
  await assertBookingAccess(pool, actor, row);
  if (row.status !== 'PENDING_APPROVAL') {
    throw new AppError(409, ErrorCodes.INVALID_STATE, '只有待审批的预约可以审批');
  }

  if (decision === 'APPROVE') {
    await withTransaction(async (connection) => {
      await connection.query(
        "UPDATE bookings SET status = 'PENDING' WHERE id = ? AND status = 'PENDING_APPROVAL'",
        [bookingId],
      );
      await writeLog(connection, {
        actorId: actor.id,
        action: 'BOOKING_APPROVED',
        targetType: 'booking',
        targetId: bookingId,
        resourceId: row.resource_id,
        detail: { reason: reason || null },
      });
    });
  } else {
    await withTransaction(async (connection) => {
      await connection.query(
        `UPDATE bookings
            SET status = 'REJECTED', cancelled_at = NOW(), cancel_reason = ?
          WHERE id = ? AND status = 'PENDING_APPROVAL'`,
        [reason || '管理员驳回', bookingId],
      );
      await connection.query('DELETE FROM booking_slots WHERE booking_id = ?', [bookingId]);
      await writeLog(connection, {
        actorId: actor.id,
        action: 'BOOKING_REJECTED',
        targetType: 'booking',
        targetId: bookingId,
        resourceId: row.resource_id,
        detail: { reason: reason || null },
      });
    });
  }
  return getBookingDetail(actor, bookingId);
}

export async function getBookingsForResourceOnDate(resourceId, dateText) {
  const date = parseDate(dateText);
  if (!date) return [];
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  const [rows] = await pool.query(
    `${BOOKING_SELECT}
      WHERE b.resource_id = ? AND b.start_at < ? AND b.end_at > ?
        AND b.status IN ('PENDING', 'CHECKED_IN', 'PENDING_APPROVAL')
      ORDER BY b.start_at`,
    [resourceId, formatDateTime(next), `${formatDate(date)} 00:00:00`],
  );
  return rows.map(mapBooking);
}
