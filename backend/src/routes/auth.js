import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authRequired, signToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import { verifyPassword } from '../utils/password.js';

const router = Router();

const loginSchema = z.object({
  studentNo: z.string().trim().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
});

function mapUser(user) {
  return {
    id: Number(user.id),
    studentNo: user.student_no,
    name: user.name,
    role: user.role,
    status: user.status,
    creditScore: user.credit_score,
    suspendedUntil: user.suspended_until,
  };
}

router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const { studentNo, password } = req.body;
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE student_no = ? LIMIT 1',
    [studentNo],
  );
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new AppError(401, ErrorCodes.UNAUTHORIZED, '账号或密码错误');
  }
  if (user.status !== 'ACTIVE') {
    throw new AppError(403, ErrorCodes.FORBIDDEN, '账号已被停用');
  }
  res.json({ token: signToken(user), user: mapUser(user) });
}));

router.get('/me', authRequired, asyncHandler(async (req, res) => {
  res.json({ user: mapUser(req.user) });
}));

export default router;
