import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { config } from '../config.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

// 只接受常见图片类型；扩展名由服务端按 MIME 决定，不信任客户端文件名。
const IMAGE_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isSupportedImage(mimetype) {
  return IMAGE_EXTENSIONS.has(String(mimetype || '').toLowerCase());
}

export function assertImage(file) {
  if (!file || !file.buffer) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, '请选择要上传的图片');
  }
  if (!isSupportedImage(file.mimetype)) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, '仅支持 jpg、png、webp、gif 图片');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, '图片不能超过 5 MB');
  }
}

export function localUploadRoot() {
  return isAbsolute(config.storage.localDir)
    ? config.storage.localDir
    : resolve(process.cwd(), config.storage.localDir);
}

function objectKey(mimetype) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const ext = IMAGE_EXTENSIONS.get(String(mimetype).toLowerCase());
  return `images/${year}/${month}/${randomUUID()}.${ext}`;
}

async function saveToS3(file, key) {
  if (!config.storage.bucket) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, '对象存储未配置 STORAGE_BUCKET');
  }
  let PutObjectCommand;
  let S3Client;
  try {
    ({ S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3'));
  } catch {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, '对象存储依赖未安装，请执行 npm install');
  }

  const client = new S3Client({
    region: config.storage.region,
    endpoint: config.storage.endpoint || undefined,
    forcePathStyle: Boolean(config.storage.endpoint),
    credentials: config.storage.accessKey
      ? {
        accessKeyId: config.storage.accessKey,
        secretAccessKey: config.storage.secretKey,
      }
      : undefined,
  });

  await client.send(new PutObjectCommand({
    Bucket: config.storage.bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    CacheControl: 'public, max-age=31536000',
  }));

  const endpoint = (config.storage.endpoint || '').replace(/\/+$/, '');
  const base = config.storage.publicBaseUrl
    || (endpoint ? `${endpoint}/${config.storage.bucket}` : '');
  if (!base) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, '对象存储未配置 STORAGE_ENDPOINT 或 STORAGE_PUBLIC_BASE_URL');
  }
  return `${base}/${key}`;
}

async function saveToLocal(file, key) {
  const target = resolve(localUploadRoot(), key);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, file.buffer);
  // 相对地址由上传接口按请求 Host 补成绝对 URL；Nginx 同域部署时也可直接使用。
  return `/uploads/${key}`;
}

export async function saveImage(file) {
  assertImage(file);
  const key = objectKey(file.mimetype);
  const url = config.storage.driver === 's3'
    ? await saveToS3(file, key)
    : await saveToLocal(file, key);
  return { key, url, driver: config.storage.driver };
}
