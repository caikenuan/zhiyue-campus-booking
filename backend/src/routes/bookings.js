import { Router } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler.js';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  cancelBooking,
  checkIn,
  createBooking,
  getBookingDetail,
  listMyBookings,
  renewBooking,
} from '../services/booking.js';

const router = Router();
router.use(authRequired);

const createSchema = z.object({
  resourceId: z.coerce.number().int().positive(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
});

const cancelSchema = z.object({
  reason: z.string().max(255).optional(),
});

const renewSchema = z.object({
  newEndAt: z.string().min(1),
});

const checkinSchema = z.object({
  qrToken: z.string().min(1),
});

router.get('/mine', asyncHandler(async (req, res) => {
  const items = await listMyBookings(req.user.id, {
    status: req.query.status,
    from: req.query.from,
    to: req.query.to,
  });
  res.json({ items });
}));

router.post('/checkin', validate(checkinSchema), asyncHandler(async (req, res) => {
  const booking = await checkIn(req.user, {
    qrToken: req.body.qrToken,
    method: 'QR',
  });
  res.json({ booking });
}));

router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const booking = await createBooking({
    actor: req.user,
    resourceId: req.body.resourceId,
    startAt: req.body.startAt,
    endAt: req.body.endAt,
  });
  res.status(201).json({ booking });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const booking = await getBookingDetail(req.user, req.params.id);
  res.json({ booking });
}));

router.get('/:id/qr', asyncHandler(async (req, res) => {
  const booking = await getBookingDetail(req.user, req.params.id);
  const dataUrl = await QRCode.toDataURL(booking.qrToken, {
    width: 360,
    margin: 1,
    color: { dark: '#1f2937', light: '#ffffff' },
  });
  res.json({ qrToken: booking.qrToken, dataUrl });
}));

router.post('/:id/cancel', validate(cancelSchema), asyncHandler(async (req, res) => {
  const booking = await cancelBooking(req.user, req.params.id, req.body.reason);
  res.json({ booking });
}));

router.post('/:id/renew', validate(renewSchema), asyncHandler(async (req, res) => {
  const booking = await renewBooking(req.user, req.params.id, req.body.newEndAt);
  res.status(201).json({ booking });
}));

router.post('/:id/checkin', asyncHandler(async (req, res) => {
  const booking = await checkIn(req.user, {
    bookingId: req.params.id,
    method: 'QR',
  });
  res.json({ booking });
}));

export default router;
