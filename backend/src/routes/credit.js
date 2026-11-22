import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler.js';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getCreditSummary, listAppeals, submitAppeal } from '../services/credit.js';

const router = Router();
router.use(authRequired);

const appealSchema = z.object({
  bookingId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(5, '申诉理由至少 5 个字').max(1000),
});

router.get('/me', asyncHandler(async (req, res) => {
  res.json(await getCreditSummary(req.user.id));
}));

router.get('/appeals', asyncHandler(async (req, res) => {
  res.json({ items: await listAppeals(req.user) });
}));

router.post('/appeals', validate(appealSchema), asyncHandler(async (req, res) => {
  const appeal = await submitAppeal(req.user.id, req.body.bookingId, req.body.reason);
  res.status(201).json({ appeal });
}));

export default router;
