const { get, post, showError } = require('../../utils/request');
const { ensureLogin, decorateBooking } = require('../../utils/util');

const TABS = [
  { value: '', label: '全部' },
  { value: 'PENDING', label: '待签到' },
  { value: 'CHECKED_IN', label: '已签到' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
];

Page({
  data: {
    tabs: TABS,
    status: '',
    loading: true,
    items: [],
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadBookings();
  },

  onPullDownRefresh() {
    const that = this;
    this.loadBookings().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  setStatus(event) {
    const status = event.currentTarget.dataset.status;
    if (status === this.data.status) return;
    this.setData({ status: status });
    this.loadBookings();
  },

  loadBookings() {
    const that = this;
    this.setData({ loading: true });
    const query = this.data.status ? { status: this.data.status } : {};
    return get('/bookings/mine', query)
      .then(function (data) {
        that.setData({
          items: (data.items || []).map(function (booking) {
            return Object.assign(decorateBooking(booking), {
              canCheckin: booking.status === 'PENDING',
              canCancel: booking.status === 'PENDING' || booking.status === 'CHECKED_IN',
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

  noop() {},

  goDetail(event) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + event.currentTarget.dataset.id });
  },

  goCheckin(event) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + event.currentTarget.dataset.id });
  },

  cancelBooking(event) {
    const id = event.currentTarget.dataset.id;
    const that = this;
    wx.showModal({
      title: '取消预约',
      content: '确定取消这次预约吗？',
      success: function (result) {
        if (!result.confirm) return;
        post('/bookings/' + id + '/cancel', { reason: '用户主动取消' })
          .then(function () {
            wx.showToast({ title: '已取消', icon: 'success' });
            that.loadBookings();
          })
          .catch(function (error) {
            showError(error);
          });
      },
    });
  },
});
