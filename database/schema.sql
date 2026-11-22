-- 智约数据库结构（MySQL 8.0+）
-- 由 backend/scripts/init-db.js 在目标数据库中执行

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS operation_logs;
DROP TABLE IF EXISTS appeals;
DROP TABLE IF EXISTS credit_records;
DROP TABLE IF EXISTS checkins;
DROP TABLE IF EXISTS booking_slots;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS maintenance_windows;
DROP TABLE IF EXISTS resource_managers;
DROP TABLE IF EXISTS resources;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_no VARCHAR(32) NOT NULL,
  name VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('STUDENT', 'VENUE_ADMIN', 'COLLEGE_ADMIN') NOT NULL DEFAULT 'STUDENT',
  status ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
  credit_score INT NOT NULL DEFAULT 100,
  suspended_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_student_no (student_no),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE resources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  type ENUM('SEMINAR', 'STUDY', 'PIANO', 'ACTIVITY', 'SPORTS') NOT NULL,
  building VARCHAR(100) NOT NULL,
  room VARCHAR(50) NOT NULL,
  capacity INT NOT NULL DEFAULT 1,
  open_from TIME NOT NULL DEFAULT '08:00:00',
  open_to TIME NOT NULL DEFAULT '22:00:00',
  status ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_resources_type (type),
  KEY idx_resources_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE resource_managers (
  resource_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (resource_id, user_id),
  KEY idx_resource_managers_user (user_id),
  CONSTRAINT fk_resource_managers_resource FOREIGN KEY (resource_id) REFERENCES resources (id) ON DELETE CASCADE,
  CONSTRAINT fk_resource_managers_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE maintenance_windows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  resource_id BIGINT UNSIGNED NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  reason VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_maintenance_resource_time (resource_id, start_at, end_at),
  CONSTRAINT fk_maintenance_resource FOREIGN KEY (resource_id) REFERENCES resources (id) ON DELETE CASCADE,
  CONSTRAINT fk_maintenance_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE bookings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  resource_id BIGINT UNSIGNED NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  status ENUM(
    'PENDING', 'CHECKED_IN', 'COMPLETED', 'CANCELLED',
    'RELEASED', 'PENDING_APPROVAL', 'REJECTED'
  ) NOT NULL DEFAULT 'PENDING',
  source ENUM('MINI_PROGRAM', 'ADMIN') NOT NULL DEFAULT 'MINI_PROGRAM',
  qr_token VARCHAR(64) NOT NULL,
  checked_in_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  cancel_reason VARCHAR(255) NULL,
  renewed_from_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_bookings_qr_token (qr_token),
  KEY idx_bookings_user_time (user_id, start_at),
  KEY idx_bookings_resource_time (resource_id, start_at, end_at),
  KEY idx_bookings_status_time (status, start_at),
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_resource FOREIGN KEY (resource_id) REFERENCES resources (id) ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_renewed_from FOREIGN KEY (renewed_from_id) REFERENCES bookings (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 每个 30 分钟槽位一行；主键唯一约束是并发预约不重复的最终保障。
CREATE TABLE booking_slots (
  resource_id BIGINT UNSIGNED NOT NULL,
  slot_start DATETIME NOT NULL,
  booking_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (resource_id, slot_start),
  KEY idx_booking_slots_booking (booking_id),
  CONSTRAINT fk_booking_slots_resource FOREIGN KEY (resource_id) REFERENCES resources (id) ON DELETE RESTRICT,
  CONSTRAINT fk_booking_slots_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE checkins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id BIGINT UNSIGNED NOT NULL,
  method ENUM('QR', 'ASSISTED') NOT NULL,
  operator_id BIGINT UNSIGNED NULL,
  checked_in_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_checkins_booking (booking_id),
  KEY idx_checkins_operator (operator_id),
  CONSTRAINT fk_checkins_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE,
  CONSTRAINT fk_checkins_operator FOREIGN KEY (operator_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE credit_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NULL,
  type ENUM('NO_SHOW', 'APPEAL_REVOKE', 'MANUAL') NOT NULL,
  status ENUM('VALID', 'REVOKED') NOT NULL DEFAULT 'VALID',
  occurred_at DATETIME NOT NULL,
  note VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_credit_user_time (user_id, occurred_at),
  KEY idx_credit_status (status),
  CONSTRAINT fk_credit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_credit_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE appeals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  handled_by BIGINT UNSIGNED NULL,
  handled_at DATETIME NULL,
  result VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_appeals_status (status),
  KEY idx_appeals_user (user_id),
  CONSTRAINT fk_appeals_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE,
  CONSTRAINT fk_appeals_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_appeals_handler FOREIGN KEY (handled_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 只写不改：接口层不提供 UPDATE/DELETE。
CREATE TABLE operation_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(32) NOT NULL,
  target_id BIGINT UNSIGNED NULL,
  resource_id BIGINT UNSIGNED NULL,
  detail JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_actor_time (actor_id, created_at),
  KEY idx_logs_target (target_type, target_id),
  KEY idx_logs_resource (resource_id, created_at),
  CONSTRAINT fk_logs_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
