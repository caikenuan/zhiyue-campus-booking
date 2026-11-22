const { get, post, showError } = require('../../utils/request');
const { ensureLogin } = require('../../utils/util');

const APPEAL_LABELS = {
  PENDING: '待处理',
  APPROVED: '已通过',
  REJECTED: '已驳回',
};

Page({
  data: {
    loading: true,
    score: 100,
    student: {},
    noShowCount: 0,
    noShowLimit: 3,
    suspended: false,
    suspendedText: '',
    records: [],
    released: [],
    appeals: [],
    submitting: false,
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadAll();
  },

  onPullDownRefresh() {
    const that = this;
    this.loadAll().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadAll() {
    const that = this;
    this.setData({ loading: true });
    return Promise.all([
      get('/credit/me'),
      get('/bookings/mine', { status: 'RELEASED' }),
      get('/credit/appeals'),
    ])
      .then(function (results) {
        const summary = results[0];
        const suspendedUntil = summary.user.suspendedUntil;
        const suspended = suspendedUntil
          ? new Date(String(suspendedUntil).replace(' ', 'T')).getTime() > Date.now()
          : false;
        that.setData({
          score: summary.user.creditScore,
          student: summary.user,
          noShowCount: summary.noShowCount,
          noShowLimit: summary.noShowLimit,
          suspended: suspended,
          suspendedText: suspended ? String(suspendedUntil).slice(0, 16) : '',
          records: (summary.records || []).map(function (record) {
            return Object.assign({}, record, {
              occurredText: String(record.occurred_at || '').slice(0, 16),
              typeLabel: record.type === 'NO_SHOW' ? '超时未签到，扣 10 分' : '信用变动',
              statusLabel: record.status === 'REVOKED' ? '已撤销' : '有效',
              canAppeal: record.status === 'VALID' && record.booking_id,
            });
          }),
          released: (results[1].items || []).map(function (booking) {
            return Object.assign({}, booking, {
              timeText: String(booking.startAt).slice(5, 16),
            });
          }),
          appeals: (results[2].items || []).map(function (appeal) {
            return Object.assign({}, appeal, {
              statusLabel: APPEAL_LABELS[appeal.status] || appeal.status,
              createdText: String(appeal.created_at || '').slice(0, 16),
            });
          }),
        });
      })
      .catch(function (error) {
        showError(error);
      })
      .finally(function () {
        that.setData({ loading: false });
      });
  },

  appeal(event) {
    const that = this;
    const bookingId = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: '提交申诉',
      editable: true,
      placeholderText: '请说明未签到原因（至少 5 个字）',
      success: function (result) {
        if (!result.confirm) return;
        const reason = (result.content || '').trim();
        if (reason.length < 5) {
          wx.showToast({ title: '申诉理由至少 5 个字', icon: 'none' });
          return;
        }
        post('/credit/appeals', { bookingId: bookingId, reason: reason })
          .then(function () {
            wx.showToast({ title: '申诉已提交', icon: 'success' });
            that.loadAll();
          })
          .catch(function (error) {
            showError(error);
          });
      },
    });
  },
});
