import { pool } from '../db.js';
import { RULES } from '../config.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import { addDays, formatDateTime, parseDate } from '../utils/time.js';
import { writeLog } from './audit.js';
import { getManagedResourceIds } from './availability.js';

export async function countRecentNoShows(executor, userId, at = new Date()) {
  const since = new Date(at.getTime() - RULES.noShowWindowDays * 24 * 60 * 60 * 1000);
  const [rows] = await executor.query(
    `SELECT COUNT(*) AS count FROM credit_records
      WHERE user_id = ? AND type = 'NO_SHOW' AND status = 'VALID' AND occurred_at >= ?`,
    [userId, formatDateTime(since)],
  );
  return Number(rows[0]?.count || 0);
}

export async function applySuspensionIfNeeded(executor, userId, at = new Date()) {
  const count = await countRecentNoShows(executor, userId, at);
  if (count >= RULES.noShowLimit) {
    const suspendedUntil = new Date(at.getTime() + RULES.suspensionDays * 24 * 60 * 60 * 1000);
    await executor.query('UPDATE users SET suspended_until = ? WHERE id = ?', [
      formatDateTime(suspendedUntil),
      userId,
    ]);
    return { suspended: true, suspendedUntil: formatDateTime(suspendedUntil), count };
  }
  return { suspended: false, count };
}

export async function recordNoShow(
  executor,
  { userId, bookingId, resourceId = null, occurredAt = new Date(), note = '超时未签到' },
) {
  await executor.query(
    `INSERT INTO credit_records (user_id, booking_id, type, status, occurred_at, note)
     VALUES (?, ?, 'NO_SHOW', 'VALID', ?, ?)`,
    [userId, bookingId, formatDateTime(occurredAt), note],
  );
  await executor.query(
    'UPDATE users SET credit_score = GREATEST(credit_score - 10, 0) WHERE id = ?',
    [userId],
  );
  const suspension = await applySuspensionIfNeeded(executor, userId, occurredAt);
  await writeLog(executor, {
    actorId: null,
    action: 'BOOKING_NO_SHOW',
    targetType: 'booking',
    targetId: bookingId,
    resourceId,
    detail: { userId, ...suspension },
  });
  return suspension;
}

export async function revokeNoShow(executor, { creditRecordId, bookingId, resourceId = null, actorId }) {
  const [rows] = await executor.query(
    `SELECT id, user_id, status FROM credit_records
      WHERE id = ? OR (booking_id = ? AND type = 'NO_SHOW')
      ORDER BY id DESC LIMIT 1`,
    [creditRecordId ?? 0, bookingId ?? 0],
  );
  const record = rows[0];
  if (!record) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, '未找到对应的爽约记录');
  }
  if (record.status === 'REVOKED') {
    return { alreadyRevoked: true };
  }
  await executor.query(
    "UPDATE credit_records SET status = 'REVOKED' WHERE id = ?",
    [record.id],
  );
  await executor.query(
    'UPDATE users SET credit_score = LEAST(credit_score + 10, 100) WHERE id = ?',
    [record.user_id],
  );
  const remaining = await countRecentNoShows(executor, record.user_id);
  if (remaining < RULES.noShowLimit) {
    await executor.query('UPDATE users SET suspended_until = NULL WHERE id = ?', [record.user_id]);
  }
  await writeLog(executor, {
    actorId,
    action: 'CREDIT_NO_SHOW_REVOKED',
    targetType: 'credit_record',
    targetId: record.id,
    resourceId,
    detail: { bookingId, remaining },
  });
  return { revoked: true, remaining };
}

export async function getCreditSummary(userId) {
  const [userRows] = await pool.query(
    'SELECT id, student_no, name, credit_score, suspended_until FROM users WHERE id = ?',
    [userId],
  );
  const user = userRows[0];
  if (!user) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, '用户不存在');
  }
  const [records] = await pool.query(
    `SELECT cr.id, cr.type, cr.status, cr.occurred_at, cr.note, cr.booking_id,
            b.start_at, b.end_at, r.name AS resource_name
       FROM credit_records cr
       LEFT JOIN bookings b ON b.id = cr.booking_id
       LEFT JOIN resources r ON r.id = b.resource_id
      WHERE cr.user_id = ?
      ORDER BY cr.occurred_at DESC
      LIMIT 50`,
    [userId],
  );
  const noShowCount = await countRecentNoShows(pool, userId);
  return {
    user: {
      id: user.id,
      studentNo: user.student_no,
      name: user.name,
      creditScore: user.credit_score,
      suspendedUntil: user.suspended_until,
    },
    noShowCount,
    noShowLimit: RULES.noShowLimit,
    windowDays: RULES.noShowWindowDays,
    suspensionDays: RULES.suspensionDays,
    records,
  };
}

export async function submitAppeal(userId, bookingId, reason) {
  const [bookingRows] = await pool.query(
    'SELECT id, user_id, status FROM bookings WHERE id = ?',
    [bookingId],
  );
  const booking = bookingRows[0];
  if (!booking) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, '预约不存在');
  }
  if (Number(booking.user_id) !== Number(userId)) {
    throw new AppError(403, ErrorCodes.FORBIDDEN, '只能为自己的预约申诉');
  }
  if (booking.status !== 'RELEASED') {
    throw new AppError(409, ErrorCodes.INVALID_STATE, '只有已释放的预约可以申诉');
  }
  const [pending] = await pool.query(
    "SELECT id FROM appeals WHERE booking_id = ? AND status = 'PENDING' LIMIT 1",
    [bookingId],
  );
  if (pending.length > 0) {
    throw new AppError(409, ErrorCodes.CONFLICT, '该预约已有待处理申诉');
  }
  const [result] = await pool.query(
    'INSERT INTO appeals (booking_id, user_id, reason) VALUES (?, ?, ?)',
    [bookingId, userId, reason],
  );
  return { id: result.insertId, bookingId, status: 'PENDING' };
}

export async function listAppeals(actor) {
  const params = [];
  let where = '';
  let scopeJoin = '';
  if (actor.role === 'STUDENT') {
    where = 'WHERE a.user_id = ?';
    params.push(actor.id);
  } else if (actor.role === 'VENUE_ADMIN') {
    scopeJoin = 'JOIN resource_managers rm ON rm.resource_id = b.resource_id AND rm.user_id = ?';
    params.push(actor.id);
  } else if (actor.role !== 'COLLEGE_ADMIN') {
    throw new AppError(403, ErrorCodes.FORBIDDEN, '没有查看申诉的权限');
  }
  const [rows] = await pool.query(
    `SELECT a.id, a.booking_id, a.user_id, a.reason, a.status, a.result,
            a.created_at, a.handled_at,
            u.name AS student_name, u.student_no,
            b.start_at, b.end_at, r.name AS resource_name, r.id AS resource_id
       FROM appeals a
       JOIN users u ON u.id = a.user_id
       JOIN bookings b ON b.id = a.booking_id
       JOIN resources r ON r.id = b.resource_id
       ${scopeJoin}
       ${where}
      ORDER BY a.created_at DESC
      LIMIT 100`,
    params,
  );
  return rows;
}

export async function handleAppeal(appealId, actor, { decision, result }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT a.*, b.resource_id
         FROM appeals a
         JOIN bookings b ON b.id = a.booking_id
        WHERE a.id = ?
        FOR UPDATE`,
      [appealId],
    );
    const appeal = rows[0];
    if (!appeal) {
      throw new AppError(404, ErrorCodes.NOT_FOUND, '申诉不存在');
    }
    if (appeal.status !== 'PENDING') {
      throw new AppError(409, ErrorCodes.INVALID_STATE, '该申诉已处理');
    }
    const nextStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    await connection.query(
      `UPDATE appeals
          SET status = ?, handled_by = ?, handled_at = NOW(), result = ?
        WHERE id = ?`,
      [nextStatus, actor.id, result || null, appealId],
    );
    if (nextStatus === 'APPROVED') {
      await revokeNoShow(connection, {
        bookingId: appeal.booking_id,
        resourceId: appeal.resource_id,
        actorId: actor.id,
      });
    } else {
      await writeLog(connection, {
        actorId: actor.id,
        action: 'APPEAL_REJECTED',
        targetType: 'appeal',
        targetId: appealId,
        resourceId: appeal.resource_id,
        detail: { result },
      });
    }
    await connection.commit();
    return { id: appealId, status: nextStatus };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listNoShows(actor) {
  if (!['VENUE_ADMIN', 'COLLEGE_ADMIN'].includes(actor.role)) {
    throw new AppError(403, ErrorCodes.FORBIDDEN, '没有查看爽约名单的权限');
  }
  const scopeJoin = actor.role === 'VENUE_ADMIN'
    ? `JOIN bookings b ON b.id = cr.booking_id
       JOIN resource_managers rm
         ON rm.resource_id = b.resource_id AND rm.user_id = ?`
    : '';
  const params = actor.role === 'VENUE_ADMIN' ? [actor.id] : [];
  const [rows] = await pool.query(
    `SELECT u.id, u.student_no, u.name, u.credit_score, u.suspended_until,
            COUNT(DISTINCT cr.id) AS no_show_count,
            MAX(cr.occurred_at) AS last_no_show_at
       FROM users u
       JOIN credit_records cr
         ON cr.user_id = u.id AND cr.type = 'NO_SHOW' AND cr.status = 'VALID'
       ${scopeJoin}
      GROUP BY u.id, u.student_no, u.name, u.credit_score, u.suspended_until
      ORDER BY no_show_count DESC, last_no_show_at DESC`,
    params,
  );
  return rows;
}

export async function getUtilization(actor, fromText, toText) {
  if (!['VENUE_ADMIN', 'COLLEGE_ADMIN'].includes(actor.role)) {
    throw new AppError(403, ErrorCodes.FORBIDDEN, '没有查看统计的权限');
  }
  const from = parseDate(fromText);
  const to = parseDate(toText);
  if (!from || !to || from > to) {
    throw new AppError(
      400,
      ErrorCodes.VALIDATION_ERROR,
      '日期范围格式应为 YYYY-MM-DD，且开始日期不能晚于结束日期',
    );
  }
  // 日期范围按自然日包含首尾两天，查询上界取结束日期的次日 00:00。
  const endExclusive = addDays(to, 1);
  let resourceWhere = '';
  const resourceParams = [];
  if (actor.role === 'VENUE_ADMIN') {
    const managed = await getManagedResourceIds(pool, actor.id);
    if (managed.length === 0) return [];
    resourceWhere = 'WHERE id IN (?)';
    resourceParams.push(managed);
  }
  const [resources] = await pool.query(
    `SELECT id, name, type, open_from, open_to FROM resources ${resourceWhere} ORDER BY id`,
    resourceParams,
  );
  const [rows] = await pool.query(
    `SELECT resource_id,
            SUM(TIMESTAMPDIFF(MINUTE, start_at, end_at)) AS booked_minutes,
            COUNT(*) AS booking_count
       FROM bookings
      WHERE status IN ('PENDING', 'CHECKED_IN', 'COMPLETED')
        AND start_at >= ? AND start_at < ?
      GROUP BY resource_id`,
    [formatDateTime(from), formatDateTime(endExclusive)],
  );
  const days = Math.max(1, Math.round((endExclusive.getTime() - from.getTime()) / 86_400_000));
  const bookedByResource = new Map(rows.map((row) => [Number(row.resource_id), row]));

  return resources.map((resource) => {
    const [openHour, openMinute] = resource.open_from.split(':').map(Number);
    const [closeHour, closeMinute] = resource.open_to.split(':').map(Number);
    const openMinutes = Math.max(0, (closeHour * 60 + closeMinute) - (openHour * 60 + openMinute));
    const capacityMinutes = openMinutes * days;
    const booked = bookedByResource.get(Number(resource.id));
    const bookedMinutes = Number(booked?.booked_minutes || 0);
    return {
      resourceId: resource.id,
      resourceName: resource.name,
      type: resource.type,
      days,
      capacityMinutes,
      bookedMinutes,
      bookingCount: Number(booked?.booking_count || 0),
      utilizationRate: capacityMinutes === 0 ? 0 : Number((bookedMinutes / capacityMinutes).toFixed(4)),
    };
  });
}
