import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler.js';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { findSeats } from '../services/ai.js';

const router = Router();
router.use(authRequired);

const findSchema = z.object({
  message: z.string().trim().min(2, '请描述想找的场地').max(500),
});

router.post('/find-seat', validate(findSchema), asyncHandler(async (req, res) => {
  const result = await findSeats(req.body.message);
  res.json(result);
}));

export default router;
