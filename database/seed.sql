-- 演示用种子数据；密码仅用于本地课程演示。
-- admin / admin123      学院管理员
-- manager / manager123  场地管理员
-- 2024030202003 / 123456  蔡珂暖（学生）
-- 2024030202107 / 123456  史曼琪（学生）
-- 2024000001 / 123456     测试学生

SET NAMES utf8mb4;

INSERT INTO users (id, student_no, name, password_hash, role, status, credit_score) VALUES
  (1, 'admin', '学院管理员', 'd9046dc81a141d8a961c3acc8abaecb9:cc36a70ef145167f0bfdf398059c199a9d85c0942ae2ae6866ccca7a40ac9d4f7c7f1dd3898d1bef7be7e9a4b3f3e2f9cbdf3594140cbcb38f65b9316848701f', 'COLLEGE_ADMIN', 'ACTIVE', 100),
  (2, 'manager', '场地管理员', '1c3edcf2fe11b32e246797a2b36a68d6:58623771e1da2f2cc1c01e48c52e8cc8a03c09a90cb8d699ceef7d3dda954a461544cdaf783a5db2b54b6878823b65a80580892d3fb09c10e12c59f809a9e4dc', 'VENUE_ADMIN', 'ACTIVE', 100),
  (3, '2024030202003', '蔡珂暖', 'e1e034cbfee435504844a21413235c7f:6453271a56b99ce2f8fa6e58e5ba55b044e5ff320b7256d8a403c9dd38d4a4af7cac774241e64a44c3933ec82ac954830ecfa5dfa38255d7e5f98e9536d00414', 'STUDENT', 'ACTIVE', 100),
  (4, '2024030202107', '史曼琪', 'e1e034cbfee435504844a21413235c7f:6453271a56b99ce2f8fa6e58e5ba55b044e5ff320b7256d8a403c9dd38d4a4af7cac774241e64a44c3933ec82ac954830ecfa5dfa38255d7e5f98e9536d00414', 'STUDENT', 'ACTIVE', 100),
  (5, '2024000001', '测试学生', 'e1e034cbfee435504844a21413235c7f:6453271a56b99ce2f8fa6e58e5ba55b044e5ff320b7256d8a403c9dd38d4a4af7cac774241e64a44c3933ec82ac954830ecfa5dfa38255d7e5f98e9536d00414', 'STUDENT', 'ACTIVE', 90);

INSERT INTO resources (id, name, type, building, room, capacity, open_from, open_to, status, description) VALUES
  (1, '研讨室 A-201', 'SEMINAR', '图书馆', 'A-201', 8, '08:00:00', '22:00:00', 'OPEN', '带白板和投屏，适合小组讨论'),
  (2, '研讨室 A-202', 'SEMINAR', '图书馆', 'A-202', 6, '08:00:00', '22:00:00', 'OPEN', '安静，适合面试和小组作业'),
  (3, '自习区 B-101', 'STUDY', '教学楼B', 'B-101', 30, '07:00:00', '22:30:00', 'OPEN', '开放自习区，按座位区分时段'),
  (4, '琴房 C-105', 'PIANO', '艺术楼', 'C-105', 2, '09:00:00', '21:00:00', 'OPEN', '立式钢琴，需保持安静'),
  (5, '活动室 D-301', 'ACTIVITY', '学生中心', 'D-301', 20, '09:00:00', '21:00:00', 'OPEN', '可移动桌椅，适合社团活动'),
  (6, '羽毛球场 1 号', 'SPORTS', '体育馆', '1号场', 4, '08:00:00', '21:00:00', 'OPEN', '室内羽毛球场地');

INSERT INTO resource_managers (resource_id, user_id) VALUES
  (1, 2), (2, 2), (3, 2);

INSERT INTO maintenance_windows (resource_id, start_at, end_at, reason, created_by) VALUES
  (1, CONCAT(CURDATE() + INTERVAL 1 DAY, ' 12:00:00'), CONCAT(CURDATE() + INTERVAL 1 DAY, ' 14:00:00'), '设备检修', 1),
  (6, CONCAT(CURDATE() + INTERVAL 1 DAY, ' 18:00:00'), CONCAT(CURDATE() + INTERVAL 1 DAY, ' 19:00:00'), '场地维护', 1);

-- 预约数据：1 条明天待签到 + 13 条过去 18 天内的历史记录，
-- 覆盖 PENDING / PENDING_APPROVAL / COMPLETED / CANCELLED / RELEASED，
-- 保证管理端仪表盘、预约列表、利用率统计演示时不为空。
INSERT INTO bookings
  (id, user_id, resource_id, start_at, end_at, status, source, qr_token,
   checked_in_at, cancelled_at, cancel_reason, created_at)
VALUES
  -- 明天 10:00-11:00，演示“已被占用”的时段
  (1, 5, 1,
   CONCAT(CURDATE() + INTERVAL 1 DAY, ' 10:00:00'),
   CONCAT(CURDATE() + INTERVAL 1 DAY, ' 11:00:00'),
   'PENDING', 'MINI_PROGRAM', 'demo-qr-token-0001', NULL, NULL, NULL,
   CONCAT(CURDATE() - INTERVAL 1 DAY, ' 18:30:00')),

  -- 已完成
  (2, 3, 2,
   CONCAT(CURDATE() - INTERVAL 1 DAY, ' 09:00:00'),
   CONCAT(CURDATE() - INTERVAL 1 DAY, ' 10:00:00'),
   'COMPLETED', 'MINI_PROGRAM', 'demo-qr-token-0002',
   CONCAT(CURDATE() - INTERVAL 1 DAY, ' 09:02:00'), NULL, NULL,
   CONCAT(CURDATE() - INTERVAL 2 DAY, ' 20:10:00')),
  (3, 4, 3,
   CONCAT(CURDATE() - INTERVAL 2 DAY, ' 14:00:00'),
   CONCAT(CURDATE() - INTERVAL 2 DAY, ' 15:30:00'),
   'COMPLETED', 'MINI_PROGRAM', 'demo-qr-token-0003',
   CONCAT(CURDATE() - INTERVAL 2 DAY, ' 14:05:00'), NULL, NULL,
   CONCAT(CURDATE() - INTERVAL 3 DAY, ' 10:00:00')),
  (6, 4, 1,
   CONCAT(CURDATE() - INTERVAL 5 DAY, ' 08:30:00'),
   CONCAT(CURDATE() - INTERVAL 5 DAY, ' 09:30:00'),
   'COMPLETED', 'MINI_PROGRAM', 'demo-qr-token-0006',
   CONCAT(CURDATE() - INTERVAL 5 DAY, ' 08:31:00'), NULL, NULL,
   CONCAT(CURDATE() - INTERVAL 6 DAY, ' 21:00:00')),
  (9, 4, 4,
   CONCAT(CURDATE() - INTERVAL 10 DAY, ' 15:00:00'),
   CONCAT(CURDATE() - INTERVAL 10 DAY, ' 16:00:00'),
   'COMPLETED', 'MINI_PROGRAM', 'demo-qr-token-0009',
   CONCAT(CURDATE() - INTERVAL 10 DAY, ' 15:04:00'), NULL, NULL,
   CONCAT(CURDATE() - INTERVAL 11 DAY, ' 09:30:00')),
  (10, 5, 3,
   CONCAT(CURDATE() - INTERVAL 12 DAY, ' 09:00:00'),
   CONCAT(CURDATE() - INTERVAL 12 DAY, ' 11:00:00'),
   'COMPLETED', 'MINI_PROGRAM', 'demo-qr-token-0010',
   CONCAT(CURDATE() - INTERVAL 12 DAY, ' 09:00:00'), NULL, NULL,
   CONCAT(CURDATE() - INTERVAL 13 DAY, ' 19:20:00')),
  (12, 4, 5,
   CONCAT(CURDATE() - INTERVAL 18 DAY, ' 14:00:00'),
   CONCAT(CURDATE() - INTERVAL 18 DAY, ' 16:00:00'),
   'COMPLETED', 'MINI_PROGRAM', 'demo-qr-token-0012',
   CONCAT(CURDATE() - INTERVAL 18 DAY, ' 14:03:00'), NULL, NULL,
   CONCAT(CURDATE() - INTERVAL 19 DAY, ' 11:00:00')),

  -- 已取消（释放了槽位）
  (4, 5, 4,
   CONCAT(CURDATE() - INTERVAL 3 DAY, ' 10:00:00'),
   CONCAT(CURDATE() - INTERVAL 3 DAY, ' 11:00:00'),
   'CANCELLED', 'MINI_PROGRAM', 'demo-qr-token-0004', NULL,
   CONCAT(CURDATE() - INTERVAL 3 DAY, ' 08:15:00'), '临时有课',
   CONCAT(CURDATE() - INTERVAL 4 DAY, ' 16:40:00')),
  (8, 3, 2,
   CONCAT(CURDATE() - INTERVAL 8 DAY, ' 13:00:00'),
   CONCAT(CURDATE() - INTERVAL 8 DAY, ' 14:00:00'),
   'CANCELLED', 'MINI_PROGRAM', 'demo-qr-token-0008', NULL,
   CONCAT(CURDATE() - INTERVAL 8 DAY, ' 09:30:00'), '计划变更',
   CONCAT(CURDATE() - INTERVAL 9 DAY, ' 15:10:00')),
  (11, 3, 1,
   CONCAT(CURDATE() - INTERVAL 15 DAY, ' 10:00:00'),
   CONCAT(CURDATE() - INTERVAL 15 DAY, ' 12:00:00'),
   'CANCELLED', 'MINI_PROGRAM', 'demo-qr-token-0011', NULL,
   CONCAT(CURDATE() - INTERVAL 16 DAY, ' 08:00:00'), '时间冲突',
   CONCAT(CURDATE() - INTERVAL 17 DAY, ' 13:25:00')),

  -- 超时未签到，被定时任务释放
  (5, 3, 5,
   CONCAT(CURDATE() - INTERVAL 4 DAY, ' 16:00:00'),
   CONCAT(CURDATE() - INTERVAL 4 DAY, ' 18:00:00'),
   'RELEASED', 'MINI_PROGRAM', 'demo-qr-token-0005', NULL, NULL, NULL,
   CONCAT(CURDATE() - INTERVAL 5 DAY, ' 20:00:00')),
  (7, 5, 6,
   CONCAT(CURDATE() - INTERVAL 6 DAY, ' 19:00:00'),
   CONCAT(CURDATE() - INTERVAL 6 DAY, ' 20:00:00'),
   'RELEASED', 'MINI_PROGRAM', 'demo-qr-token-0007', NULL, NULL, NULL,
   CONCAT(CURDATE() - INTERVAL 7 DAY, ' 09:40:00')),

  -- 明天待学院管理员审批，用于演示审批通过/驳回
  (13, 3, 6,
   CONCAT(CURDATE() + INTERVAL 1 DAY, ' 14:00:00'),
   CONCAT(CURDATE() + INTERVAL 1 DAY, ' 15:00:00'),
   'PENDING_APPROVAL', 'MINI_PROGRAM', 'demo-qr-token-0013', NULL, NULL, NULL,
   CONCAT(CURDATE(), ' 09:10:00')),
  (14, 4, 2,
   CONCAT(CURDATE() + INTERVAL 1 DAY, ' 16:00:00'),
   CONCAT(CURDATE() + INTERVAL 1 DAY, ' 17:00:00'),
   'PENDING_APPROVAL', 'MINI_PROGRAM', 'demo-qr-token-0014', NULL, NULL, NULL,
   CONCAT(CURDATE(), ' 10:20:00'));

-- 仅“已完成”和“待审批/待签到”的预约保留槽位；取消、释放会删除槽位。
INSERT INTO booking_slots (resource_id, slot_start, booking_id) VALUES
  (1, CONCAT(CURDATE() + INTERVAL 1 DAY, ' 10:00:00'), 1),
  (1, CONCAT(CURDATE() + INTERVAL 1 DAY, ' 10:30:00'), 1),

  (2, CONCAT(CURDATE() - INTERVAL 1 DAY, ' 09:00:00'), 2),
  (2, CONCAT(CURDATE() - INTERVAL 1 DAY, ' 09:30:00'), 2),

  (3, CONCAT(CURDATE() - INTERVAL 2 DAY, ' 14:00:00'), 3),
  (3, CONCAT(CURDATE() - INTERVAL 2 DAY, ' 14:30:00'), 3),
  (3, CONCAT(CURDATE() - INTERVAL 2 DAY, ' 15:00:00'), 3),

  (1, CONCAT(CURDATE() - INTERVAL 5 DAY, ' 08:30:00'), 6),
  (1, CONCAT(CURDATE() - INTERVAL 5 DAY, ' 09:00:00'), 6),

  (4, CONCAT(CURDATE() - INTERVAL 10 DAY, ' 15:00:00'), 9),
  (4, CONCAT(CURDATE() - INTERVAL 10 DAY, ' 15:30:00'), 9),

  (3, CONCAT(CURDATE() - INTERVAL 12 DAY, ' 09:00:00'), 10),
  (3, CONCAT(CURDATE() - INTERVAL 12 DAY, ' 09:30:00'), 10),
  (3, CONCAT(CURDATE() - INTERVAL 12 DAY, ' 10:00:00'), 10),
  (3, CONCAT(CURDATE() - INTERVAL 12 DAY, ' 10:30:00'), 10),

  (5, CONCAT(CURDATE() - INTERVAL 18 DAY, ' 14:00:00'), 12),
  (5, CONCAT(CURDATE() - INTERVAL 18 DAY, ' 14:30:00'), 12),
  (5, CONCAT(CURDATE() - INTERVAL 18 DAY, ' 15:00:00'), 12),
  (5, CONCAT(CURDATE() - INTERVAL 18 DAY, ' 15:30:00'), 12),

  (6, CONCAT(CURDATE() + INTERVAL 1 DAY, ' 14:00:00'), 13),
  (6, CONCAT(CURDATE() + INTERVAL 1 DAY, ' 14:30:00'), 13),

  (2, CONCAT(CURDATE() + INTERVAL 1 DAY, ' 16:00:00'), 14),
  (2, CONCAT(CURDATE() + INTERVAL 1 DAY, ' 16:30:00'), 14);

-- 签到记录与已完成预约对应，便于演示签到详情和辅助签到日志
INSERT INTO checkins (booking_id, method, operator_id, checked_in_at) VALUES
  (2, 'QR', 3, CONCAT(CURDATE() - INTERVAL 1 DAY, ' 09:02:00')),
  (3, 'QR', 4, CONCAT(CURDATE() - INTERVAL 2 DAY, ' 14:05:00')),
  (6, 'QR', 4, CONCAT(CURDATE() - INTERVAL 5 DAY, ' 08:31:00')),
  (9, 'QR', 4, CONCAT(CURDATE() - INTERVAL 10 DAY, ' 15:04:00')),
  (10, 'QR', 5, CONCAT(CURDATE() - INTERVAL 12 DAY, ' 09:00:00')),
  (12, 'QR', 4, CONCAT(CURDATE() - INTERVAL 18 DAY, ' 14:03:00'));

-- 爽约记录：一条无关联历史记录 + 一条对应被释放预约
INSERT INTO credit_records (user_id, booking_id, type, status, occurred_at, note) VALUES
  (5, NULL, 'NO_SHOW', 'VALID', CONCAT(CURDATE() - INTERVAL 3 DAY, ' 09:15:00'), '超时未签到（演示数据）'),
  (3, 5, 'NO_SHOW', 'VALID', CONCAT(CURDATE() - INTERVAL 4 DAY, ' 16:15:00'), '预约后未签到，系统自动释放');

-- 演示账号信用分：学生 3 有 1 次爽约扣 10 分；测试学生固定 90 分供自动化用例断言
UPDATE users SET credit_score = 90 WHERE id = 3;
UPDATE users SET credit_score = 90 WHERE id = 5;
