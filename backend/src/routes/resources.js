import { Router } from 'express';
import { pool } from '../db.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authRequired } from '../middleware/auth.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import { formatDate, parseDate } from '../utils/time.js';
import { getAvailability, getResourceOrThrow } from '../services/availability.js';

const router = Router();
router.use(authRequired);

const TYPE_LABELS = {
  SEMINAR: '研讨室',
  STUDY: '自习区',
  PIANO: '琴房',
  ACTIVITY: '活动室',
  SPORTS: '运动场地',
};

export function mapResource(resource) {
  return {
    id: Number(resource.id),
    name: resource.name,
    type: resource.type,
    typeLabel: TYPE_LABELS[resource.type] || resource.type,
    building: resource.building,
    room: resource.room,
    capacity: Number(resource.capacity),
    openFrom: String(resource.open_from).slice(0, 5),
    openTo: String(resource.open_to).slice(0, 5),
    status: resource.status,
    description: resource.description,
    imageUrl: resource.image_url || null,
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const conditions = ["status = 'OPEN'"];
  const params = [];
  if (req.query.type) {
    conditions.push('type = ?');
    params.push(req.query.type);
  }
  if (req.query.building) {
    conditions.push('building = ?');
    params.push(req.query.building);
  }
  const [rows] = await pool.query(
    `SELECT * FROM resources WHERE ${conditions.join(' AND ')} ORDER BY id`,
    params,
  );
  res.json({ items: rows.map(mapResource) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const resource = await getResourceOrThrow(pool, req.params.id);
  const [maintenance] = await pool.query(
    `SELECT id, start_at, end_at, reason
       FROM maintenance_windows
      WHERE resource_id = ? AND end_at >= NOW()
      ORDER BY start_at
      LIMIT 20`,
    [resource.id],
  );
  res.json({
    resource: mapResource(resource),
    maintenance: maintenance.map((row) => ({
      id: Number(row.id),
      startAt: row.start_at,
      endAt: row.end_at,
      reason: row.reason,
    })),
  });
}));

router.get('/:id/availability', asyncHandler(async (req, res) => {
  const dateText = req.query.date || formatDate(new Date());
  const date = parseDate(dateText);
  if (!date) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, 'date 参数格式应为 YYYY-MM-DD');
  }
  const data = await getAvailability(req.params.id, dateText);
  res.json(data);
}));

export default router;
