import { pool } from '../db.js';
import { RULES } from '../config.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import {
  addMinutes,
  formatDate,
  formatDateTime,
  formatTime,
  parseDate,
  parseDateTime,
} from '../utils/time.js';

export async function getResourceOrThrow(executor, resourceId) {
  const [rows] = await executor.query('SELECT * FROM resources WHERE id = ? LIMIT 1', [resourceId]);
  const resource = rows[0];
  if (!resource) {
    throw new AppError(404, ErrorCodes.NOT_FOUND, '场地不存在');
  }
  return resource;
}

function timeOnDate(date, timeText) {
  const [hour, minute, second = 0] = String(timeText).split(':').map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, second, 0);
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export async function getAvailability(resourceId, dateText, { includePast = false } = {}) {
  const date = parseDate(dateText);
  if (!date) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, '日期格式应为 YYYY-MM-DD');
  }

  const resource = await getResourceOrThrow(pool, resourceId);
  const openStart = timeOnDate(date, resource.open_from);
  const openEnd = timeOnDate(date, resource.open_to);

  if (openEnd <= openStart) {
    return {
      resourceId: resource.id,
      resourceName: resource.name,
      date: formatDate(date),
      openFrom: formatTime(openStart),
      openTo: formatTime(openEnd),
      slots: [],
      segments: [],
    };
  }

  const dayStartText = `${formatDate(date)} 00:00:00`;
  const dayEndDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  const dayEndText = formatDateTime(dayEndDate);

  const [maintenanceRows] = await pool.query(
    `SELECT start_at, end_at FROM maintenance_windows
      WHERE resource_id = ? AND start_at < ? AND end_at > ?`,
    [resource.id, dayEndText, dayStartText],
  );

  const [slotRows] = await pool.query(
    `SELECT bs.slot_start
       FROM booking_slots bs
       JOIN bookings b ON b.id = bs.booking_id
      WHERE bs.resource_id = ?
        AND bs.slot_start >= ? AND bs.slot_start < ?
        AND b.status IN ('PENDING', 'CHECKED_IN')`,
    [resource.id, dayStartText, dayEndText],
  );

  const maintenance = maintenanceRows.map((row) => ({
    start: parseDateTime(row.start_at),
    end: parseDateTime(row.end_at),
  }));
  const occupied = new Set(slotRows.map((row) => row.slot_start));
  const currentTime = new Date();

  const slots = [];
  for (let cursor = openStart; cursor < openEnd; cursor = addMinutes(cursor, RULES.slotMinutes)) {
    const slotEnd = addMinutes(cursor, RULES.slotMinutes);
    const key = formatDateTime(cursor);
    const inMaintenance = maintenance.some((window) =>
      overlaps(cursor, slotEnd, window.start, window.end),
    );
    const isPast = !includePast && cursor < currentTime;
    const available = resource.status === 'OPEN' && !inMaintenance && !occupied.has(key) && !isPast;
    slots.push({
      start: formatDateTime(cursor),
      end: formatDateTime(slotEnd),
      startTime: formatTime(cursor),
      endTime: formatTime(slotEnd),
      available,
      reason: available
        ? null
        : resource.status !== 'OPEN'
          ? '场地未开放'
          : inMaintenance
            ? '维护时段'
            : occupied.has(key)
              ? '已被预约'
              : '已过时段',
    });
  }

  const segments = [];
  for (const slot of slots) {
    if (!slot.available) continue;
    const last = segments[segments.length - 1];
    if (last && last.end === slot.start) {
      last.end = slot.end;
      last.endTime = slot.endTime;
    } else {
      segments.push({
        start: slot.start,
        end: slot.end,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
    }
  }

  return {
    resourceId: resource.id,
    resourceName: resource.name,
    date: formatDate(date),
    openFrom: formatTime(openStart),
    openTo: formatTime(openEnd),
    slots,
    segments,
  };
}

export async function assertNoMaintenanceConflict(executor, resourceId, start, end) {
  const [rows] = await executor.query(
    `SELECT id FROM maintenance_windows
      WHERE resource_id = ? AND start_at < ? AND end_at > ? LIMIT 1`,
    [resourceId, formatDateTime(end), formatDateTime(start)],
  );
  if (rows.length > 0) {
    throw new AppError(409, ErrorCodes.MAINTENANCE_WINDOW, '所选时段处于维护窗口，不能预约');
  }
}

export async function getManagedResourceIds(executor, userId) {
  const [rows] = await executor.query(
    'SELECT resource_id FROM resource_managers WHERE user_id = ?',
    [userId],
  );
  return rows.map((row) => Number(row.resource_id));
}
