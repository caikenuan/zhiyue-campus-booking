-- 已有数据库升级到“图片只存 URL”的版本（新库直接执行 schema.sql 即可，无需本文件）。
-- 执行一次：
--   mysql -u zhiyue -p zhiyue < database/migrations/001_add_image_fields.sql
-- 若字段已存在会报 Duplicate column name，可忽略后继续执行下一条。

ALTER TABLE resources
  ADD COLUMN image_url VARCHAR(500) NULL AFTER description;

ALTER TABLE checkins
  ADD COLUMN photo_url VARCHAR(500) NULL AFTER checked_in_at;
