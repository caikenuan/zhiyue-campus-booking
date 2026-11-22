const { get, showError } = require('../../utils/request');
const { ensureLogin } = require('../../utils/util');
const { getApiBase, setApiBase, DEFAULT_API_BASE } = require('../../utils/config');

const ROLE_LABELS = {
  STUDENT: '学生',
  VENUE_ADMIN: '场地管理员',
  COLLEGE_ADMIN: '学院管理员',
};

Page({
  data: {
    user: {},
    avatarText: '智',
    roleLabel: '',
    score: null,
    apiBase: '',
    defaultApiBase: DEFAULT_API_BASE,
  },

  onShow() {
    if (!ensureLogin()) return;
    const user = wx.getStorageSync('user') || {};
    this.setData({
      user: user,
      avatarText: user.name ? String(user.name).slice(0, 1) : '智',
      roleLabel: ROLE_LABELS[user.role] || user.role || '学生',
      apiBase: getApiBase(),
    });
    this.loadScore();
  },

  loadScore() {
    const that = this;
    get('/credit/me')
      .then(function (data) {
        that.setData({ score: data.user.creditScore });
      })
      .catch(function () {
        // 信用分加载失败不影响个人页其他功能
      });
  },

  onApiInput(event) {
    this.setData({ apiBase: event.detail.value });
  },

  saveApiBase() {
    const value = this.data.apiBase.trim();
    if (!/^https?:\/\//.test(value)) {
      wx.showToast({ title: '请填写 http(s) 开头的地址', icon: 'none' });
      return;
    }
    setApiBase(value.replace(/\/+$/, ''));
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  resetApiBase() {
    setApiBase(DEFAULT_API_BASE);
    this.setData({ apiBase: DEFAULT_API_BASE });
    wx.showToast({ title: '已恢复默认', icon: 'success' });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新输入学号和密码。',
      success: function (result) {
        if (!result.confirm) return;
        wx.removeStorageSync('token');
        wx.removeStorageSync('user');
        wx.reLaunch({ url: '/pages/login/login' });
      },
    });
  },

  about() {
    wx.showModal({
      title: '智约 · 校园共享空间预约平台',
      content: '专业基础实践课程项目\n30 分钟一档 · 单笔最长 4 小时 · 提前 1 天预约',
      showCancel: false,
    });
  },
});
