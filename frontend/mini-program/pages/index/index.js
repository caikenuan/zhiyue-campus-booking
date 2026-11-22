const { get, showError } = require('../../utils/request');
const { ensureLogin, today, typeLabel } = require('../../utils/util');

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

Page({
  data: {
    user: {},
    avatarText: '智',
    resources: [],
    filtered: [],
    activeType: '',
    loading: true,
    todayText: '',
    types: [
      { value: '', label: '全部' },
      { value: 'SEMINAR', label: '研讨室' },
      { value: 'STUDY', label: '自习区' },
      { value: 'PIANO', label: '琴房' },
      { value: 'ACTIVITY', label: '活动室' },
      { value: 'SPORTS', label: '运动场地' },
    ],
  },

  onShow() {
    if (!ensureLogin()) return;
    const now = new Date();
    const user = wx.getStorageSync('user') || {};
    this.setData({
      user: user,
      avatarText: user.name ? String(user.name).slice(0, 1) : '智',
      todayText: today() + ' 周' + WEEKDAYS[now.getDay()],
    });
    this.loadResources();
  },

  onPullDownRefresh() {
    this.loadResources().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadResources() {
    const that = this;
    this.setData({ loading: true });
    return get('/resources')
      .then(function (data) {
        const items = (data.items || []).map(function (item) {
          return Object.assign({}, item, { typeLabel: typeLabel(item.type) });
        });
        that.setData({ resources: items });
        that.applyFilter(items, that.data.activeType);
      })
      .catch(function (error) {
        showError(error);
      })
      .finally(function () {
        that.setData({ loading: false });
      });
  },

  applyFilter(items, activeType) {
    const filtered = activeType
      ? items.filter(function (item) { return item.type === activeType; })
      : items;
    this.setData({ filtered: filtered, activeType: activeType });
  },

  setType(event) {
    this.applyFilter(this.data.resources, event.currentTarget.dataset.type);
  },

  goVenue(event) {
    wx.navigateTo({ url: '/pages/venue/venue?id=' + event.currentTarget.dataset.id });
  },

  goAi() {
    wx.switchTab({ url: '/pages/ai/ai' });
  },

  goCheckin() {
    wx.navigateTo({ url: '/pages/checkin/checkin' });
  },

  goBookings() {
    wx.switchTab({ url: '/pages/bookings/bookings' });
  },

  goCredit() {
    wx.switchTab({ url: '/pages/credit/credit' });
  },
});
