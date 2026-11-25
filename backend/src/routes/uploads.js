import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/async-handler.js';
import { authRequired } from '../middleware/auth.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import {
  MAX_IMAGE_BYTES,
  isSupportedImage,
  saveImage,
} from '../services/storage.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter(_req, file, callback) {
    if (!isSupportedImage(file.mimetype)) {
      callback(new AppError(400, ErrorCodes.VALIDATION_ERROR, '仅支持 jpg、png、webp、gif 图片'));
      return;
    }
    callback(null, true);
  },
});

// 登录用户都可上传：学生用于签到照片，管理员用于场地图片。
router.post(
  '/',
  authRequired,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const saved = await saveImage(req.file);
    const url = saved.url.startsWith('http')
      ? saved.url
      : `${req.protocol}://${req.get('host')}${saved.url}`;
    res.status(201).json({
      url,
      key: saved.key,
      driver: saved.driver,
      contentType: req.file.mimetype,
      size: req.file.size,
    });
  }),
);

export default router;
