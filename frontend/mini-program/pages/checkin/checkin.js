const { get, post, upload, showError } = require('../../utils/request');
const { ensureLogin } = require('../../utils/util');

Page({
  data: {
    token: '',
    submitting: false,
    loading: true,
    pending: [],
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadPending();
  },

  loadPending() {
    const that = this;
    this.setData({ loading: true });
    get('/bookings/mine', { status: 'PENDING' })
      .then(function (data) {
        that.setData({
          pending: (data.items || []).map(function (item) {
            return Object.assign({}, item, {
              timeText: String(item.startAt).slice(5, 16) + ' - ' + String(item.endAt).slice(11, 16),
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

  onTokenInput(event) {
    this.setData({ token: event.detail.value });
  },

  scan() {
    const that = this;
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: function (result) {
        that.submitToken(result.result);
      },
      fail: function () {
        // 用户取消扫码时无需提示
      },
    });
  },

  manualSubmit() {
    const token = this.data.token.trim();
    if (!token) {
      wx.showToast({ title: '请输入签到码', icon: 'none' });
      return;
    }
    this.submitToken(token);
  },

  submitToken(token) {
    const that = this;
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    post('/bookings/checkin', { qrToken: token })
      .then(function (data) {
        wx.showToast({ title: '签到成功', icon: 'success' });
        that.setData({ token: '' });
        that.loadPending();
        setTimeout(function () {
          wx.navigateTo({ url: '/pages/detail/detail?id=' + data.booking.id });
        }, 700);
      })
      .catch(function (error) {
        showError(error);
      })
      .finally(function () {
        that.setData({ submitting: false });
      });
  },

  photoCheckin(event) {
    const that = this;
    const id = event.currentTarget.dataset.id;
    if (this.data.submitting) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      sizeType: ['compressed'],
      success: function (result) {
        const file = result.tempFiles && result.tempFiles[0];
        if (!file) return;
        that.setData({ submitting: true });
        upload(file.tempFilePath)
          .then(function (data) {
            return post('/bookings/' + id + '/checkin', { photoUrl: data.url });
          })
          .then(function (data) {
            wx.showToast({ title: '签到成功', icon: 'success' });
            that.loadPending();
            setTimeout(function () {
              wx.navigateTo({ url: '/pages/detail/detail?id=' + data.booking.id });
            }, 700);
          })
          .catch(function (error) {
            showError(error);
          })
          .finally(function () {
            that.setData({ submitting: false });
          });
      },
    });
  },

  selfCheckin(event) {
    const that = this;
    const id = event.currentTarget.dataset.id;
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    post('/bookings/' + id + '/checkin', {})
      .then(function (data) {
        wx.showToast({ title: '签到成功', icon: 'success' });
        that.loadPending();
        setTimeout(function () {
          wx.navigateTo({ url: '/pages/detail/detail?id=' + data.booking.id });
        }, 700);
      })
      .catch(function (error) {
        showError(error);
      })
      .finally(function () {
        that.setData({ submitting: false });
      });
  },
});
