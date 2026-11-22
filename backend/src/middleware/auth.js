import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

export function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, studentNo: user.student_no },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

export async function authRequired(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      throw new AppError(401, ErrorCodes.UNAUTHORIZED, '请先登录');
    }
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new AppError(401, ErrorCodes.UNAUTHORIZED, '登录已过期，请重新登录');
    }
    const [rows] = await pool.query(
      `SELECT id, student_no, name, role, status, credit_score, suspended_until
         FROM users WHERE id = ? LIMIT 1`,
      [payload.sub],
    );
    const user = rows[0];
    if (!user) {
      throw new AppError(401, ErrorCodes.UNAUTHORIZED, '用户不存在');
    }
    if (user.status !== 'ACTIVE') {
      throw new AppError(403, ErrorCodes.FORBIDDEN, '账号已被停用');
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles) {
  return function roleGuard(req, _res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError(403, ErrorCodes.FORBIDDEN, '没有访问该功能的权限'));
      return;
    }
    next();
  };
}
