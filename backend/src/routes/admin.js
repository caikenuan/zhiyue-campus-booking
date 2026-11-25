import { Router } from 'express';
import { z } from 'zod';
import { RULES } from '../config.js';
import { pool } from '../db.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import { formatDate, parseDateTime } from '../utils/time.js';
import { writeLog } from '../services/audit.js';
import { getManagedResourceIds } from '../services/availability.js';
import { checkIn, listBookingsForAdmin, reviewBooking } from '../services/booking.js';
import {
  getUtilization,
  handleAppeal,
  listAppeals,
  listNoShows,
} from '../services/credit.js';
import { countSchedulerCandidates, runMaintenanceOnce } from '../services/scheduler.js';
import { mapResource } from './resources.js';

const router = Router();
router.use(authRequired, requireRole('VENUE_ADMIN', 'COLLEGE_ADMIN'));

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
const normalizeTime = (value) => (value.length === 5 ? `${value}:00` : value);

const resourceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['SEMINAR', 'STUDY', 'PIANO', 'ACTIVITY', 'SPORTS']),
  building: z.string().trim().min(1).max(100),
  room: z.string().trim().min(1).max(50),
  capacity: z.coerce.number().int().min(1).max(500),
  openFrom: z.string().regex(TIME_PATTERN, '开放时间格式应为 HH:mm'),
  openTo: z.string().regex(TIME_PATTERN, '开放时间格式应为 HH:mm'),
  status: z.enum(['OPEN', 'CLOSED']).default('OPEN'),
  description: z.string().max(255).optional().nullable(),
  // 由 /api/uploads 返回的 URL；只存 URL，不接收二进制
  imageUrl: z.string().trim().max(500).optional().nullable(),
});

const maintenanceSchema = z.object({
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  reason: z.string().max(255).optional().nullable(),
});

const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  role: z.enum(['STUDENT', 'VENUE_ADMIN', 'COLLEGE_ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

const reviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().max(255).optional(),
});

const assistedCheckinSchema = z.object({
  photoUrl: z.string().max(500).optional().nullable(),
});

const appealHandleSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  result: z.string().max(255).optional(),
});

async function assertResourceScope(actor, resourceId) {
  if (actor.role === 'COLLEGE_ADMIN') return;
  const managed = await getManagedResourceIds(pool, actor.id);
  if (!managed.includes(Number(resourceId))) {
    throw new AppError(403, ErrorCodes.FORBIDDEN, '只能管理本人负责的场地');
  }
}

async function scopedResourceIds(actor) {
  if (actor.role === 'COLLEGE_ADMIN') return null;
  return getManagedResourceIds(pool, actor.id);
}

router.get('/dashboard', asyncHandler(async (req, res) => {
  const managed = await scopedResourceIds(req.user);
  if (managed && managed.length === 0) {
    res.json({
      stats: { todayBookings: 0, pendingCheckin: 0, releasedToday: 0, activeResources: 0, suspendedUsers: 0 },
      recentBookings: [],
    });
    return;
  }
  const params = [];
  let scope = '';
  if (managed) {
    scope = 'AND b.resource_id IN (?)';
    params.push(managed);
  }

  const [[todayRows], [pendingRows], [releasedRows], [resourceRows], [userRows], [recentRows]] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS count FROM bookings b WHERE DATE(b.start_at) = CURDATE() ${scope}`, params),
    pool.query(`SELECT COUNT(*) AS count FROM bookings b WHERE b.status = 'PENDING' AND DATE(b.start_at) = CURDATE() ${scope}`, params),
    pool.query(`SELECT COUNT(*) AS count FROM bookings b WHERE b.status = 'RELEASED' AND DATE(b.updated_at) = CURDATE() ${scope}`, params),
    pool.query(
      managed
        ? 'SELECT COUNT(*) AS count FROM resources WHERE status = \'OPEN\' AND id IN (?)'
        : 'SELECT COUNT(*) AS count FROM resources WHERE status = \'OPEN\'',
      managed ? [managed] : [],
    ),
    pool.query('SELECT COUNT(*) AS count FROM users WHERE suspended_until > NOW()'),
    pool.query(
      `SELECT b.id, b.start_at, b.end_at, b.status, u.name AS user_name,
              r.name AS resource_name
         FROM bookings b
         JOIN users u ON u.id = b.user_id
         JOIN resources r ON r.id = b.resource_id
        WHERE 1 = 1 ${scope}
        ORDER BY b.created_at DESC LIMIT 6`,
      params,
    ),
  ]);

  res.json({
    stats: {
      todayBookings: Number(todayRows[0]?.count || 0),
      pendingCheckin: Number(pendingRows[0]?.count || 0),
      releasedToday: Number(releasedRows[0]?.count || 0),
      activeResources: Number(resourceRows[0]?.count || 0),
      suspendedUsers: Number(userRows[0]?.count || 0),
    },
    recentBookings: recentRows,
  });
}));

router.get('/rules', asyncHandler(async (_req, res) => {
  res.json({
    rules: {
      ...RULES,
      advanceDaysLabel: '仅可预约今日及明日',
      adjacentLabel: '允许首尾相接，不允许重叠',
      suspensionLabel: '近 30 天累计 3 次爽约停权 7 天',
    },
  });
}));

router.get('/resources', asyncHandler(async (req, res) => {
  const managed = await scopedResourceIds(req.user);
  if (managed && managed.length === 0) {
    res.json({ items: [] });
    return;
  }
  const [rows] = await pool.query(
    managed
      ? 'SELECT * FROM resources WHERE id IN (?) ORDER BY id'
      : 'SELECT * FROM resources ORDER BY id',
    managed ? [managed] : [],
  );
  res.json({ items: rows.map(mapResource) });
}));

router.post('/resources', requireRole('COLLEGE_ADMIN'), validate(resourceSchema), asyncHandler(async (req, res) => {
  const body = req.body;
  const openFrom = normalizeTime(body.openFrom);
  const openTo = normalizeTime(body.openTo);
  if (openTo <= openFrom) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, '关闭时间必须晚于开放时间');
  }
  const [result] = await pool.query(
    `INSERT INTO resources
       (name, type, building, room, capacity, open_from, open_to, status, description, image_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [body.name, body.type, body.building, body.room, body.capacity, openFrom, openTo, body.status, body.description || null, body.imageUrl || null],
  );
  await writeLog(pool, {
    actorId: req.user.id,
    action: 'RESOURCE_CREATED',
    targetType: 'resource',
    targetId: result.insertId,
    resourceId: result.insertId,
    detail: body,
  });
  const [rows] = await pool.query('SELECT * FROM resources WHERE id = ?', [result.insertId]);
  res.status(201).json({ resource: mapResource(rows[0]) });
}));

router.put('/resources/:id', validate(resourceSchema), asyncHandler(async (req, res) => {
  await assertResourceScope(req.user, req.params.id);
  const body = req.body;
  const openFrom = normalizeTime(body.openFrom);
  const openTo = normalizeTime(body.openTo);
  if (openTo <= openFrom) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, '关闭时间必须晚于开放时间');
  }
  const [result] = await pool.query(
    `UPDATE resources
        SET name = ?, type = ?, building = ?, room = ?, capacity = ?,
            open_from = ?, open_to = ?, status = ?, description = ?, image_url = ?
      WHERE id = ?`,
    [body.name, body.type, body.building, body.room, body.capacity, openFrom, openTo, body.status, body.description || null, body.imageUrl || null, req.params.id],
  );
  if (result.affectedRows === 0) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, '场地不存在');
  }
  await writeLog(pool, {
    actorId: req.user.id,
    action: 'RESOURCE_UPDATED',
    targetType: 'resource',
    targetId: Number(req.params.id),
    resourceId: Number(req.params.id),
    detail: body,
  });
  const [rows] = await pool.query('SELECT * FROM resources WHERE id = ?', [req.params.id]);
  res.json({ resource: mapResource(rows[0]) });
}));

router.delete('/resources/:id', requireRole('COLLEGE_ADMIN'), asyncHandler(async (req, res) => {
  const [bookingRows] = await pool.query(
    'SELECT COUNT(*) AS count FROM bookings WHERE resource_id = ?',
    [req.params.id],
  );
  if (Number(bookingRows[0]?.count || 0) > 0) {
    throw new AppError(409, ErrorCodes.CONFLICT, '该场地已有预约记录，不能删除；可将状态改为未开放');
  }
  const [result] = await pool.query('DELETE FROM resources WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, '场地不存在');
  }
  await writeLog(pool, {
    actorId: req.user.id,
    action: 'RESOURCE_DELETED',
    targetType: 'resource',
    targetId: Number(req.params.id),
    resourceId: Number(req.params.id),
  });
  res.json({ deleted: true });
}));

router.get('/resources/:id/maintenance', asyncHandler(async (req, res) => {
  await assertResourceScope(req.user, req.params.id);
  const [rows] = await pool.query(
    `SELECT m.*, u.name AS creator_name
       FROM maintenance_windows m
       LEFT JOIN users u ON u.id = m.created_by
      WHERE m.resource_id = ?
      ORDER BY m.start_at DESC LIMIT 100`,
    [req.params.id],
  );
  res.json({ items: rows });
}));

router.post('/resources/:id/maintenance', validate(maintenanceSchema), asyncHandler(async (req, res) => {
  await assertResourceScope(req.user, req.params.id);
  const start = parseDateTime(req.body.startAt);
  const end = parseDateTime(req.body.endAt);
  if (!start || !end) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, '维护时间格式应为 YYYY-MM-DD HH:mm');
  }
  if (start >= end) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, '维护结束时间必须晚于开始时间');
  }
  const [result] = await pool.query(
    `INSERT INTO maintenance_windows (resource_id, start_at, end_at, reason, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [req.params.id, req.body.startAt, req.body.endAt, req.body.reason || null, req.user.id],
  );
  await writeLog(pool, {
    actorId: req.user.id,
    action: 'MAINTENANCE_CREATED',
    targetType: 'maintenance',
    targetId: result.insertId,
    resourceId: Number(req.params.id),
    detail: req.body,
  });
  res.status(201).json({ id: result.insertId });
}));

router.delete('/maintenance/:id', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM maintenance_windows WHERE id = ?', [req.params.id]);
  const window = rows[0];
  if (!window) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, '维护时段不存在');
  }
  await assertResourceScope(req.user, window.resource_id);
  await pool.query('DELETE FROM maintenance_windows WHERE id = ?', [req.params.id]);
  await writeLog(pool, {
    actorId: req.user.id,
    action: 'MAINTENANCE_DELETED',
    targetType: 'maintenance',
    targetId: Number(req.params.id),
    resourceId: Number(window.resource_id),
  });
  res.json({ deleted: true });
}));

router.get('/resources/:id/managers', requireRole('COLLEGE_ADMIN'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT rm.user_id, u.name, u.student_no
       FROM resource_managers rm
       JOIN users u ON u.id = rm.user_id
      WHERE rm.resource_id = ?`,
    [req.params.id],
  );
  res.json({ items: rows });
}));

router.post('/resources/:id/managers', requireRole('COLLEGE_ADMIN'), asyncHandler(async (req, res) => {
  const userId = Number(req.body.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, 'userId 不合法');
  }
  const [userRows] = await pool.query('SELECT id, role FROM users WHERE id = ?', [userId]);
  if (!userRows[0]) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, '用户不存在');
  }
  if (!['VENUE_ADMIN', 'COLLEGE_ADMIN'].includes(userRows[0].role)) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, '该用户不是场地管理员，请先调整角色');
  }
  await pool.query(
    'INSERT IGNORE INTO resource_managers (resource_id, user_id) VALUES (?, ?)',
    [req.params.id, userId],
  );
  await writeLog(pool, {
    actorId: req.user.id,
    action: 'RESOURCE_MANAGER_ADDED',
    targetType: 'resource',
    targetId: Number(req.params.id),
    resourceId: Number(req.params.id),
    detail: { userId },
  });
  res.status(201).json({ added: true });
}));

router.delete('/resources/:id/managers/:userId', requireRole('COLLEGE_ADMIN'), asyncHandler(async (req, res) => {
  await pool.query(
    'DELETE FROM resource_managers WHERE resource_id = ? AND user_id = ?',
    [req.params.id, req.params.userId],
  );
  res.json({ deleted: true });
}));

router.get('/users', requireRole('COLLEGE_ADMIN'), asyncHandler(async (req, res) => {
  const conditions = ['1 = 1'];
  const params = [];
  if (req.query.role) {
    conditions.push('role = ?');
    params.push(req.query.role);
  }
  if (req.query.keyword) {
    conditions.push('(student_no LIKE ? OR name LIKE ?)');
    params.push(`%${req.query.keyword}%`, `%${req.query.keyword}%`);
  }
  const [rows] = await pool.query(
    `SELECT id, student_no, name, role, status, credit_score, suspended_until, created_at
       FROM users WHERE ${conditions.join(' AND ')}
      ORDER BY id LIMIT 200`,
    params,
  );
  res.json({ items: rows });
}));

router.patch('/users/:id', requireRole('COLLEGE_ADMIN'), validate(userUpdateSchema), asyncHandler(async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === Number(req.user.id) && (req.body.role || req.body.status)) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, '不能修改自己的角色或状态');
  }
  const fields = [];
  const params = [];
  if (req.body.name !== undefined) {
    fields.push('name = ?');
    params.push(req.body.name);
  }
  if (req.body.role !== undefined) {
    fields.push('role = ?');
    params.push(req.body.role);
  }
  if (req.body.status !== undefined) {
    fields.push('status = ?');
    params.push(req.body.status);
  }
  if (fields.length === 0) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, '没有需要修改的字段');
  }
  params.push(targetId);
  const [result] = await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
    params,
  );
  if (result.affectedRows === 0) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, '用户不存在');
  }
  await writeLog(pool, {
    actorId: req.user.id,
    action: 'USER_UPDATED',
    targetType: 'user',
    targetId,
    detail: req.body,
  });
  const [rows] = await pool.query(
    'SELECT id, student_no, name, role, status, credit_score, suspended_until FROM users WHERE id = ?',
    [targetId],
  );
  res.json({ user: rows[0] });
}));

router.get('/bookings', asyncHandler(async (req, res) => {
  const items = await listBookingsForAdmin(req.user, {
    status: req.query.status,
    resourceId: req.query.resourceId,
    date: req.query.date,
    userId: req.query.userId,
  });
  res.json({ items });
}));

router.post('/bookings/:id/review', validate(reviewSchema), asyncHandler(async (req, res) => {
  const booking = await reviewBooking(req.user, req.params.id, req.body);
  res.json({ booking });
}));

router.post('/bookings/:id/assisted-checkin', validate(assistedCheckinSchema), asyncHandler(async (req, res) => {
  const booking = await checkIn(req.user, {
    bookingId: req.params.id,
    method: 'ASSISTED',
    photoUrl: req.body.photoUrl,
  });
  res.json({ booking });
}));

router.get('/no-shows', asyncHandler(async (req, res) => {
  res.json({ items: await listNoShows(req.user) });
}));

router.get('/stats/utilization', asyncHandler(async (req, res) => {
  const to = req.query.to || formatDate(new Date());
  const from = req.query.from || formatDate(new Date(Date.now() - 6 * 86_400_000));
  const items = await getUtilization(req.user, from, to);
  res.json({ from, to, items });
}));

router.get('/logs', asyncHandler(async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const managed = await scopedResourceIds(req.user);
  let where = 'WHERE 1 = 1';
  const params = [];
  if (managed) {
    if (managed.length > 0) {
      where += ' AND (l.resource_id IN (?) OR l.actor_id = ?)';
      params.push(managed, req.user.id);
    } else {
      where += ' AND l.actor_id = ?';
      params.push(req.user.id);
    }
  }
  params.push(limit);
  const [rows] = await pool.query(
    `SELECT l.id, l.actor_id, u.name AS actor_name, l.action,
            l.target_type, l.target_id, l.resource_id, r.name AS resource_name,
            l.detail, l.created_at
       FROM operation_logs l
       LEFT JOIN users u ON u.id = l.actor_id
       LEFT JOIN resources r ON r.id = l.resource_id
       ${where}
      ORDER BY l.created_at DESC
      LIMIT ?`,
    params,
  );
  res.json({ items: rows });
}));

router.get('/appeals', asyncHandler(async (req, res) => {
  res.json({ items: await listAppeals(req.user) });
}));

router.post('/appeals/:id/handle', validate(appealHandleSchema), asyncHandler(async (req, res) => {
  if (req.user.role === 'VENUE_ADMIN') {
    const [rows] = await pool.query(
      `SELECT b.resource_id FROM appeals a
        JOIN bookings b ON b.id = a.booking_id
       WHERE a.id = ?`,
      [req.params.id],
    );
    if (!rows[0]) {
      throw new AppError(404, ErrorCodes.NOT_FOUND, '申诉不存在');
    }
    await assertResourceScope(req.user, rows[0].resource_id);
  }
  const result = await handleAppeal(req.params.id, req.user, req.body);
  res.json({ appeal: result });
}));

router.get('/scheduler/status', asyncHandler(async (_req, res) => {
  res.json(await countSchedulerCandidates());
}));

router.post('/scheduler/run', requireRole('COLLEGE_ADMIN'), asyncHandler(async (_req, res) => {
  res.json(await runMaintenanceOnce());
}));

export default router;
