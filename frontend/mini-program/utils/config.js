const DEFAULT_API_BASE = 'http://localhost:3000/api';
const API_BASE_KEY = 'zhiyue_api_base';

function getApiBase() {
  return wx.getStorageSync(API_BASE_KEY) || DEFAULT_API_BASE;
}

function setApiBase(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  if (!normalized) {
    wx.removeStorageSync(API_BASE_KEY);
    return DEFAULT_API_BASE;
  }
  wx.setStorageSync(API_BASE_KEY, normalized);
  return normalized;
}

module.exports = {
  DEFAULT_API_BASE,
  getApiBase,
  setApiBase,
};
