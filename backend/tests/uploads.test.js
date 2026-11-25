import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

const BASE = process.env.API_BASE || 'http://127.0.0.1:3000/api';

// 1x1 透明 PNG
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let token = null;
const uploadedKeys = [];

async function login() {
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentNo: 'admin', password: 'admin123' }),
  });
  assert.equal(response.status, 200);
  token = (await response.json()).token;
}

async function upload(file, type, auth = true) {
  const form = new FormData();
  form.append('file', new Blob([file], { type }), 'test.png');
  const headers = {};
  if (auth) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE}/uploads`, { method: 'POST', headers, body: form });
}

after(async () => {
  for (const key of uploadedKeys) {
    await unlink(resolve('uploads', key)).catch(() => {});
  }
});

test('U-01 未登录不能上传图片', async () => {
  await login();
  const response = await upload(PNG_BYTES, 'image/png', false);
  assert.equal(response.status, 401);
});

test('U-02 上传 PNG 返回可访问 URL，且不存二进制到数据库', async () => {
  await login();
  const response = await upload(PNG_BYTES, 'image/png');
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.match(data.url, /^https?:\/\//);
  assert.equal(data.driver, 'local');
  uploadedKeys.push(data.key);

  const image = await fetch(data.url);
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type') || '', /image\/png/);
});

test('U-03 非图片类型被拒绝', async () => {
  await login();
  const response = await upload(Buffer.from('not an image'), 'text/plain');
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.error.code, 'VALIDATION_ERROR');
});

test('U-04 超过 5 MB 的图片被拒绝', async () => {
  await login();
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
  const response = await upload(oversized, 'image/png');
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.error.code, 'VALIDATION_ERROR');
});
