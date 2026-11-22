const { post, showError } = require('../../utils/request');
const { ensureLogin, dateLabel, typeLabel } = require('../../utils/util');

const EXAMPLES = [
  '明天下午 3 点，4 个人，找个研讨室开 1 小时',
  '今天上午 10 点，2 个人，安静自习 2 小时',
  '明天晚上 7 点，6 个人，活动室',
];

function durationText(minutes) {
  if (minutes < 60) return minutes + ' 分钟';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? hours + ' 小时' : hours + ' 小时 ' + rest + ' 分钟';
}

Page({
  data: {
    examples: EXAMPLES,
    message: '',
    loading: false,
    loaded: false,
    interpretationText: '',
    sourceLabel: '',
    note: '',
    candidates: [],
  },

  onLoad() {
    ensureLogin();
  },

  onInput(event) {
    this.setData({ message: event.detail.value });
  },

  useExample(event) {
    this.setData({ message: event.currentTarget.dataset.text });
  },

  ask() {
    const message = this.data.message.trim();
    if (message.length < 2) {
      wx.showToast({ title: '请先描述想找的场地', icon: 'none' });
      return;
    }
    const that = this;
    this.setData({ loading: true });
    post('/ai/find-seat', { message: message })
      .then(function (result) {
        const intent = result.interpretation || {};
        const type = intent.resourceType ? typeLabel(intent.resourceType) : '不限类型';
        const interpretationText =
          dateLabel(intent.date) + ' ' + intent.startTime + ' · ' +
          durationText(intent.durationMinutes) + ' · ' + intent.people + ' 人 · ' + type;
        that.setData({
          loaded: true,
          interpretationText: interpretationText,
          sourceLabel: result.source === 'llm' ? '大模型解析' : '规则解析',
          note: result.note || '',
          candidates: (result.candidates || []).map(function (item) {
            return Object.assign({}, item, {
              timeText: item.startTime + ' - ' + item.endTime,
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

  goBooking(event) {
    const index = Number(event.currentTarget.dataset.index);
    const item = this.data.candidates[index];
    if (!item) return;
    wx.navigateTo({
      url:
        '/pages/booking/booking?resourceId=' + item.resourceId +
        '&date=' + item.startAt.slice(0, 10) +
        '&segmentStart=' + encodeURIComponent(item.startAt) +
        '&segmentEnd=' + encodeURIComponent(item.endAt),
    });
  },

  goVenue(event) {
    const index = Number(event.currentTarget.dataset.index);
    const item = this.data.candidates[index];
    if (!item) return;
    wx.navigateTo({ url: '/pages/venue/venue?id=' + item.resourceId });
  },
});
