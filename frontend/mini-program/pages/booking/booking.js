const { get, post, showError } = require('../../utils/request');
const { ensureLogin, dateLabel, shortDateTime } = require('../../utils/util');

const STEP_MINUTES = 30;
const MAX_MINUTES = 240;

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

function timeText(date) {
  return pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function durationText(minutes) {
  if (minutes < 60) return minutes + ' 分钟';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? hours + ' 小时' : hours + ' 小时 ' + rest + ' 分钟';
}

Page({
  data: {
    resourceId: null,
    date: '',
    dateLabel: '',
    segmentStart: '',
    segmentEnd: '',
    resource: {},
    startOptions: [],
    startIndex: 0,
    durationOptions: [],
    durationIndex: 0,
    summary: '',
    submitting: false,
  },

  onLoad(options) {
    if (!ensureLogin()) return;
    const segmentStart = decodeURIComponent(options.segmentStart || '');
    const segmentEnd = decodeURIComponent(options.segmentEnd || '');
    this.setData({
      resourceId: options.resourceId,
      date: options.date,
      dateLabel: dateLabel(options.date),
      segmentStart: segmentStart,
      segmentEnd: segmentEnd,
    });
    this.buildStartOptions();
    this.loadResource();
  },

  loadResource() {
    const that = this;
    get('/resources/' + this.data.resourceId)
      .then(function (data) {
        that.setData({ resource: data.resource });
      })
      .catch(function (error) {
        showError(error);
      });
  },

  buildStartOptions() {
    const startTime = toDate(this.data.segmentStart).getTime();
    const endTime = toDate(this.data.segmentEnd).getTime();
    const options = [];
    for (let cursor = startTime; cursor + STEP_MINUTES * 60000 <= endTime; cursor += STEP_MINUTES * 60000) {
      const start = new Date(cursor);
      options.push({
        value: formatDateTime(start),
        label: timeText(start),
        timestamp: cursor,
      });
    }
    this.setData({ startOptions: options, startIndex: 0 });
    this.rebuildDurations(0);
  },

  rebuildDurations(index) {
    const start = this.data.startOptions[index];
    if (!start) return;
    const endTime = toDate(this.data.segmentEnd).getTime();
    const remaining = Math.floor((endTime - start.timestamp) / 60000);
    const options = [];
    for (let minutes = STEP_MINUTES; minutes <= MAX_MINUTES && minutes <= remaining; minutes += STEP_MINUTES) {
      options.push({
        minutes: minutes,
        label: durationText(minutes),
        end: formatDateTime(new Date(start.timestamp + minutes * 60000)),
      });
    }
    this.setData({ durationOptions: options, durationIndex: 0 });
    this.updateSummary(index, 0);
  },

  updateSummary(startIndex, durationIndex) {
    const start = this.data.startOptions[startIndex];
    const duration = this.data.durationOptions[durationIndex];
    if (!start || !duration) {
      this.setData({ summary: '' });
      return;
    }
    this.setData({
      summary:
        dateLabel(this.data.date) + ' ' + start.label + ' - ' +
        shortDateTime(duration.end).slice(11, 16) + ' · ' + duration.label,
    });
  },

  setStart(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ startIndex: index });
    this.rebuildDurations(index);
  },

  setDuration(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ durationIndex: index });
    this.updateSummary(this.data.startIndex, index);
  },

  submit() {
    if (this.data.submitting) return;
    const start = this.data.startOptions[this.data.startIndex];
    const duration = this.data.durationOptions[this.data.durationIndex];
    if (!start || !duration) return;

    const that = this;
    this.setData({ submitting: true });
    post('/bookings', {
      resourceId: Number(this.data.resourceId),
      startAt: start.value,
      endAt: duration.end,
    })
      .then(function (data) {
        wx.showToast({ title: '预约成功', icon: 'success', duration: 800 });
        setTimeout(function () {
          wx.redirectTo({ url: '/pages/detail/detail?id=' + data.booking.id });
        }, 800);
      })
      .catch(function (error) {
        showError(error);
      })
      .finally(function () {
        that.setData({ submitting: false });
      });
  },
});
