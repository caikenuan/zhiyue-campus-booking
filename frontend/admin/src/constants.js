export const ROLE_LABELS = {
  STUDENT: '学生',
  VENUE_ADMIN: '场地管理员',
  COLLEGE_ADMIN: '学院管理员',
};

export const STATUS_LABELS = {
  PENDING: '待签到',
  CHECKED_IN: '已签到',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  RELEASED: '已释放',
  PENDING_APPROVAL: '待审批',
  REJECTED: '已驳回',
};

export const STATUS_TYPES = {
  PENDING: 'warning',
  CHECKED_IN: 'success',
  COMPLETED: 'info',
  CANCELLED: 'info',
  RELEASED: 'danger',
  PENDING_APPROVAL: 'warning',
  REJECTED: 'danger',
};

export const TYPE_LABELS = {
  SEMINAR: '研讨室',
  STUDY: '自习区',
  PIANO: '琴房',
  ACTIVITY: '活动室',
  SPORTS: '运动场地',
};

export const ACTION_LABELS = {
  BOOKING_CREATED: '创建预约',
  BOOKING_CANCELLED: '取消预约',
  BOOKING_CHECKIN: '扫码签到',
  BOOKING_ASSISTED_CHECKIN: '辅助签到',
  BOOKING_NO_SHOW: '超时爽约',
  BOOKING_COMPLETED: '预约完成',
  BOOKING_APPROVED: '审批通过',
  BOOKING_REJECTED: '审批驳回',
  CREDIT_NO_SHOW_REVOKED: '撤销爽约',
  APPEAL_REJECTED: '申诉驳回',
  RESOURCE_CREATED: '新增场地',
  RESOURCE_UPDATED: '修改场地',
  RESOURCE_DELETED: '删除场地',
  MAINTENANCE_CREATED: '新增维护',
  MAINTENANCE_DELETED: '删除维护',
  RESOURCE_MANAGER_ADDED: '新增场地管理员',
  USER_UPDATED: '修改用户',
};
