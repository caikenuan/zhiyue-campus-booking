const { getApiBase } = require('./config');

function request(path, options) {
  const opts = options || {};
  return new Promise(function (resolve, reject) {
    const token = wx.getStorageSync('token');
    const header = { 'Content-Type': 'application/json' };
    if (token) {
      header.Authorization = 'Bearer ' + token;
    }
    wx.request({
      url: getApiBase() + path,
      method: opts.method || 'GET',
      data: opts.data || {},
      header: header,
      timeout: 15000,
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        if (res.statusCode === 401) {
          wx.removeStorageSync('token');
          wx.removeStorageSync('user');
          wx.reLaunch({ url: '/pages/login/login' });
        }
        let message = '请求失败（' + res.statusCode + '）';
        if (res.data && res.data.error && res.data.error.message) {
          message = res.data.error.message;
        }
        reject(new Error(message));
      },
      fail: function (error) {
        reject(new Error(error.errMsg || '网络请求失败，请检查后端是否启动'));
      },
    });
  });
}

function get(path, data) {
  return request(path, { method: 'GET', data: data });
}

function post(path, data) {
  return request(path, { method: 'POST', data: data });
}

function put(path, data) {
  return request(path, { method: 'PUT', data: data });
}

function del(path, data) {
  return request(path, { method: 'DELETE', data: data });
}

function showError(error) {
  wx.showToast({
    title: (error && error.message) || '操作失败',
    icon: 'none',
    duration: 2500,
  });
}

module.exports = {
  request: request,
  get: get,
  post: post,
  put: put,
  del: del,
  showError: showError,
};
