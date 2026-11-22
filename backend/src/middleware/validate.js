import { AppError, ErrorCodes } from '../utils/errors.js';

export function validate(schema, source = 'body') {
  return function validateRequest(req, _res, next) {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      next(new AppError(400, ErrorCodes.VALIDATION_ERROR, '请求参数不合法', details));
      return;
    }
    req[source] = result.data;
    next();
  };
}
