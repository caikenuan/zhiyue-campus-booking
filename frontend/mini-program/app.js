App({
  globalData: {
    user: null,
  },

  onLaunch() {
    const user = wx.getStorageSync('user');
    if (user) {
      this.globalData.user = user;
    }
  },

  setUser(user) {
    this.globalData.user = user;
    wx.setStorageSync('user', user);
  },

  clearUser() {
    this.globalData.user = null;
    wx.removeStorageSync('user');
    wx.removeStorageSync('token');
  },
});
