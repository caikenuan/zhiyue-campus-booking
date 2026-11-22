import { pool, withTransaction } from '../db.js';
import { RULES } from '../config.js';
import { writeLog } from './audit.js';
import { recordNoShow } from './credit.js';

let timer = null;
let running = false;

/**
 * 扫描“已开始超过 15 分钟仍未签到”的预约，释放时段并记一次爽约。
 * 条件更新 + 事务保证重复执行不会重复扣分。
 */
export async function releaseExpiredBookings() {
  const released = [];
  await withTransaction(async (connection) => {
    const [rows] = await connection.query(
      `SELECT id, user_id, resource_id, start_at, end_at
         FROM bookings
        WHERE status = 'PENDING'
          AND DATE_ADD(start_at, INTERVAL ? MINUTE) <= NOW()
        FOR UPDATE`,
      [RULES.checkinGraceMinutes],
    );

    for (const booking of rows) {
      const [result] = await connection.query(
        `UPDATE bookings SET status = 'RELEASED'
          WHERE id = ? AND status = 'PENDING'`,
        [booking.id],
      );
      if (result.affectedRows !== 1) continue;
      await connection.query('DELETE FROM booking_slots WHERE booking_id = ?', [booking.id]);
      await recordNoShow(connection, {
        userId: booking.user_id,
        bookingId: booking.id,
        resourceId: booking.resource_id,
        occurredAt: new Date(),
        note: '预约开始后 15 分钟未签到，系统自动释放',
      });
      released.push(Number(booking.id));
    }
  });
  return released;
}

/** 已签到且已到结束时间的预约自动完成，并释放未来槽位。 */
export async function completeFinishedBookings() {
  const completed = [];
  await withTransaction(async (connection) => {
    const [rows] = await connection.query(
      `SELECT id, resource_id FROM bookings
        WHERE status = 'CHECKED_IN' AND end_at <= NOW()
        FOR UPDATE`,
    );
    for (const booking of rows) {
      const [result] = await connection.query(
        `UPDATE bookings SET status = 'COMPLETED'
          WHERE id = ? AND status = 'CHECKED_IN'`,
        [booking.id],
      );
      if (result.affectedRows !== 1) continue;
      await connection.query('DELETE FROM booking_slots WHERE booking_id = ?', [booking.id]);
      await writeLog(connection, {
        actorId: null,
        action: 'BOOKING_COMPLETED',
        targetType: 'booking',
        targetId: booking.id,
        resourceId: booking.resource_id,
        detail: { automatic: true },
      });
      completed.push(Number(booking.id));
    }
  });
  return completed;
}

export async function runMaintenanceOnce() {
  const released = await releaseExpiredBookings();
  const completed = await completeFinishedBookings();
  return { released, completed };
}

export function startScheduler(intervalMs = 30_000) {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const result = await runMaintenanceOnce();
      if (result.released.length || result.completed.length) {
        console.log('[scheduler]', JSON.stringify(result));
      }
    } catch (error) {
      console.error('[scheduler] failed', error);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref?.();
  console.log(`[scheduler] started, interval=${intervalMs}ms`);
}

export function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function countSchedulerCandidates() {
  const [rows] = await pool.query(
    `SELECT
       SUM(status = 'PENDING' AND DATE_ADD(start_at, INTERVAL ? MINUTE) <= NOW()) AS to_release,
       SUM(status = 'CHECKED_IN' AND end_at <= NOW()) AS to_complete
     FROM bookings`,
    [RULES.checkinGraceMinutes],
  );
  return {
    toRelease: Number(rows[0]?.to_release || 0),
    toComplete: Number(rows[0]?.to_complete || 0),
  };
}
