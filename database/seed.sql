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

-- 明天 10:00-11:00 的示例预约，用来演示“已被占用”的时段
INSERT INTO bookings (id, user_id, resource_id, start_at, end_at, status, source, qr_token) VALUES
  (1, 5, 1, CONCAT(CURDATE() + INTERVAL 1 DAY, ' 10:00:00'), CONCAT(CURDATE() + INTERVAL 1 DAY, ' 11:00:00'), 'PENDING', 'MINI_PROGRAM', 'demo-qr-token-0001');

INSERT INTO booking_slots (resource_id, slot_start, booking_id) VALUES
  (1, CONCAT(CURDATE() + INTERVAL 1 DAY, ' 10:00:00'), 1),
  (1, CONCAT(CURDATE() + INTERVAL 1 DAY, ' 10:30:00'), 1);

-- 一条历史爽约，便于演示信用分和爽约名单
INSERT INTO credit_records (user_id, booking_id, type, status, occurred_at, note) VALUES
  (5, NULL, 'NO_SHOW', 'VALID', CONCAT(CURDATE() - INTERVAL 3 DAY, ' 09:15:00'), '超时未签到（演示数据）');
