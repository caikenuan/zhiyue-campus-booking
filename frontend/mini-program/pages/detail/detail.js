const { get, post, showError } = require('../../utils/request');
const { ensureLogin, decorateBooking, statusLabel } = require('../../utils/util');

const STATUS_TIPS = {
  PENDING: '请在预约开始后 15 分钟内签到，超时未签到系统将自动释放并记一次违约。',
  CHECKED_IN: '已签到，请按时使用场地。',
  COMPLETED: '本次预约已完成。',
  CANCELLED: '本次预约已取消，名额已释放。',
  RELEASED: '超时未签到，系统已自动释放场地并计入违约。如需说明情况，可到信用页提交申诉。',
  PENDING_APPROVAL: '预约正在等待管理员审批。',
  REJECTED: '预约未通过审批。',
};

function pad(value) {
  return value < 10 ? '0' + value : String(value);
}

function toDate(text) {
  return new Date(String(text).replace(' ', 'T'));
}

function formatDateTime(date) {
  return (
    date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  );
}

function durationText(minutes) {
  if (minutes < 60) return minutes + ' 分钟';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? hours + ' 小时' : hours + ' 小时 ' + rest + ' 分钟';
}

Page({
  data: {
    id: null,
    loading: true,
    booking: {},
    statusTip: '',
    qr: '',
    extendOptions: [],
    canRenew: false,
    canCheckin: false,
    canCancel: false,
    submitting: false,
  },

  onLoad(options) {
    if (!ensureLogin()) return;
    this.setData({ id: options.id });
    this.loadDetail();
  },

  onPullDownRefresh() {
    const that = this;
    this.loadDetail().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadDetail() {
    const that = this;
    this.setData({ loading: true });
    return get('/bookings/' + this.data.id)
      .then(function (data) {
        const raw = data.booking;
        const booking = decorateBooking(raw);
        const minutes = Math.round(
          (toDate(raw.endAt).getTime() - toDate(raw.startAt).getTime()) / 60000,
        );
        const decorated = Object.assign(booking, {
          durationLabel: durationText(minutes),
          createdAtText: String(raw.createdAt || '').slice(0, 16),
          checkedInText: raw.checkedInAt ? String(raw.checkedInAt).slice(0, 16) : '',
          cancelReason: raw.cancelReason || '',
        });
        that.setData({
          booking: decorated,
          statusTip: STATUS_TIPS[raw.status] || '',
          canCheckin: raw.status === 'PENDING',
          canCancel: raw.status === 'PENDING',
        });
        if (raw.status === 'PENDING') {
          that.loadQr();
        } else {
          that.setData({ qr: '' });
        }
        that.prepareRenew(raw);
      })
      .catch(function (error) {
        showError(error);
      })
      .finally(function () {
        that.setData({ loading: false });
      });
  },

  loadQr() {
    const that = this;
    get('/bookings/' + this.data.id + '/qr')
      .then(function (data) {
        that.setData({ qr: data.dataUrl });
      })
      .catch(function () {
        // 二维码加载失败不影响其他操作
      });
  },

  prepareRenew(raw) {
    const that = this;
    if (raw.status !== 'PENDING' && raw.status !== 'CHECKED_IN') {
      this.setData({ extendOptions: [], canRenew: false });
      return;
    }
    const date = String(raw.startAt).slice(0, 10);
    get('/resources/' + raw.resourceId + '/availability', { date: date })
      .then(function (data) {
        const segment = (data.segments || []).find(function (item) {
          return item.start === raw.endAt;
        });
        if (!segment) {
          that.setData({ extendOptions: [], canRenew: false });
          return;
        }
        const start = toDate(raw.endAt).getTime();
        const end = toDate(segment.end).getTime();
        const maxMinutes = Math.min(240, Math.round((end - start) / 60000));
        const options = [];
        for (let minutes = 30; minutes <= maxMinutes && options.length < 6; minutes += 30) {
          options.push({
            minutes: minutes,
            label: '延长 ' + durationText(minutes),
            endAt: formatDateTime(new Date(start + minutes * 60000)),
          });
        }
        that.setData({ extendOptions: options, canRenew: options.length > 0 });
      })
      .catch(function () {
        that.setData({ extendOptions: [], canRenew: false });
      });
  },

  checkin() {
    const that = this;
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    post('/bookings/' + this.data.id + '/checkin', {})
      .then(function () {
        wx.showToast({ title: '签到成功', icon: 'success' });
        that.loadDetail();
      })
      .catch(function (error) {
        showError(error);
      })
      .finally(function () {
        that.setData({ submitting: false });
      });
  },

  cancel() {
    const that = this;
    wx.showModal({
      title: '取消预约',
      content: '确定取消这次预约吗？名额将立即释放。',
      success: function (result) {
        if (!result.confirm) return;
        post('/bookings/' + that.data.id + '/cancel', { reason: '用户主动取消' })
          .then(function () {
            wx.showToast({ title: '已取消', icon: 'success' });
            that.loadDetail();
          })
          .catch(function (error) {
            showError(error);
          });
      },
    });
  },

  renew() {
    const that = this;
    const options = this.data.extendOptions;
    if (options.length === 0) return;
    wx.showActionSheet({
      itemList: options.map(function (item) {
        return item.label + '（至 ' + item.endAt.slice(11, 16) + '）';
      }),
      success: function (result) {
        const option = options[result.tapIndex];
        if (!option) return;
        post('/bookings/' + that.data.id + '/renew', { newEndAt: option.endAt })
          .then(function (data) {
            wx.showToast({ title: '续约成功', icon: 'success' });
            setTimeout(function () {
              wx.redirectTo({ url: '/pages/detail/detail?id=' + data.booking.id });
            }, 700);
          })
          .catch(function (error) {
            showError(error);
          });
      },
    });
  },

  goCredit() {
    wx.switchTab({ url: '/pages/credit/credit' });
  },
});
