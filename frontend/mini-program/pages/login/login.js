const { post } = require('../../utils/request');
const { showError } = require('../../utils/request');

Page({
  data: {
    studentNo: '2024030202003',
    password: '123456',
    loading: false,
  },

  onLoad() {
    const token = wx.getStorageSync('token');
    const user = wx.getStorageSync('user');
    if (token && user && user.role === 'STUDENT') {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  onStudentNo(event) {
    this.setData({ studentNo: event.detail.value });
  },

  onPassword(event) {
    this.setData({ password: event.detail.value });
  },

  useDemo(event) {
    this.setData({
      studentNo: event.currentTarget.dataset.no,
      password: '123456',
    });
  },

  submit() {
    if (!this.data.studentNo || !this.data.password) {
      wx.showToast({ title: '请输入账号和密码', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    const that = this;
    post('/auth/login', {
      studentNo: this.data.studentNo,
      password: this.data.password,
    })
      .then(function (data) {
        if (data.user.role !== 'STUDENT') {
          wx.showToast({ title: '请使用学生账号登录小程序', icon: 'none' });
          return;
        }
        wx.setStorageSync('token', data.token);
        wx.setStorageSync('user', data.user);
        getApp().setUser(data.user);
        wx.switchTab({ url: '/pages/index/index' });
      })
      .catch(function (error) {
        showError(error);
      })
      .finally(function () {
        that.setData({ loading: false });
      });
  },
});
