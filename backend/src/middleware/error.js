import { AppError, ErrorCodes } from '../utils/errors.js';

export function notFound(req, _res, next) {
  next(new AppError(404, ErrorCodes.NOT_FOUND, `接口不存在：${req.method} ${req.originalUrl}`));
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  if (error?.code === 'ER_DUP_ENTRY') {
    res.status(409).json({
      error: { code: ErrorCodes.SLOT_CONFLICT, message: '该时段已被预约' },
    });
    return;
  }

  if (error?.name === 'MulterError') {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? '图片不能超过 5 MB'
      : '图片上传失败，请检查文件';
    res.status(400).json({
      error: { code: ErrorCodes.VALIDATION_ERROR, message },
    });
    return;
  }

  console.error('[unhandled error]', error);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
  });
}
