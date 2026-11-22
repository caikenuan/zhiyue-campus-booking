const STATUS_LABELS = {
  PENDING: '待签到',
  CHECKED_IN: '已签到',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  RELEASED: '已释放',
  PENDING_APPROVAL: '待审批',
  REJECTED: '已驳回',
};

const STATUS_CLASSES = {
  PENDING: 'tag-orange',
  CHECKED_IN: 'tag-green',
  COMPLETED: 'tag-gray',
  CANCELLED: 'tag-gray',
  RELEASED: 'tag-red',
  PENDING_APPROVAL: 'tag-orange',
  REJECTED: 'tag-red',
};

const TYPE_LABELS = {
  SEMINAR: '研讨室',
  STUDY: '自习区',
  PIANO: '琴房',
  ACTIVITY: '活动室',
  SPORTS: '运动场地',
};

function pad(value) {
  return value < 10 ? '0' + value : String(value);
}

function formatDate(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function today() {
  return formatDate(new Date());
}

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return formatDate(date);
}

function dateLabel(dateText) {
  if (dateText === today()) return '今天';
  if (dateText === tomorrow()) return '明天';
  return dateText.slice(5);
}

function shortDateTime(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 16);
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function statusClass(status) {
  return STATUS_CLASSES[status] || 'tag-gray';
}

function typeLabel(type) {
  return TYPE_LABELS[type] || type;
}

function decorateBooking(booking) {
  return Object.assign({}, booking, {
    statusLabel: statusLabel(booking.status),
    statusClass: statusClass(booking.status),
    startText: shortDateTime(booking.startAt),
    endText: String(booking.endAt || '').slice(11, 16),
  });
}

function ensureLogin() {
  const token = wx.getStorageSync('token');
  if (!token) {
    wx.reLaunch({ url: '/pages/login/login' });
    return false;
  }
  return true;
}

module.exports = {
  STATUS_LABELS: STATUS_LABELS,
  TYPE_LABELS: TYPE_LABELS,
  formatDate: formatDate,
  today: today,
  tomorrow: tomorrow,
  dateLabel: dateLabel,
  shortDateTime: shortDateTime,
  statusLabel: statusLabel,
  statusClass: statusClass,
  typeLabel: typeLabel,
  decorateBooking: decorateBooking,
  ensureLogin: ensureLogin,
};
