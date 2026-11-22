const { get, showError } = require('../../utils/request');
const { ensureLogin, today, tomorrow, dateLabel, typeLabel, shortDateTime } = require('../../utils/util');

Page({
  data: {
    id: null,
    loading: true,
    resource: {},
    maintenance: [],
    date: '',
    dateTabs: [],
    slots: [],
    segments: [],
  },

  onLoad(options) {
    if (!ensureLogin()) return;
    const todayText = today();
    this.setData({
      id: options.id,
      date: todayText,
      dateTabs: [
        { value: todayText, label: '今天', short: todayText.slice(5) },
        { value: tomorrow(), label: '明天', short: tomorrow().slice(5) },
      ],
    });
    this.loadResource();
    this.loadAvailability();
  },

  onPullDownRefresh() {
    const that = this;
    Promise.all([this.loadResource(), this.loadAvailability()]).finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadResource() {
    const that = this;
    return get('/resources/' + this.data.id)
      .then(function (data) {
        that.setData({
          resource: Object.assign({}, data.resource, {
            typeLabel: typeLabel(data.resource.type),
          }),
          maintenance: (data.maintenance || []).map(function (item) {
            return Object.assign({}, item, {
              startAtText: shortDateTime(item.startAt),
              endAtText: shortDateTime(item.endAt),
            });
          }),
        });
      })
      .catch(function (error) {
        showError(error);
      });
  },

  loadAvailability() {
    const that = this;
    this.setData({ loading: true });
    return get('/resources/' + this.data.id + '/availability', { date: this.data.date })
      .then(function (data) {
        const segments = (data.segments || []).map(function (segment) {
          const start = new Date(segment.start.replace(' ', 'T')).getTime();
          const end = new Date(segment.end.replace(' ', 'T')).getTime();
          return Object.assign({}, segment, {
            minutes: Math.round((end - start) / 60000),
          });
        });
        that.setData({
          slots: data.slots || [],
          segments: segments,
        });
      })
      .catch(function (error) {
        showError(error);
      })
      .finally(function () {
        that.setData({ loading: false });
      });
  },

  setDate(event) {
    const date = event.currentTarget.dataset.date;
    if (date === this.data.date) return;
    this.setData({ date: date });
    this.loadAvailability();
  },

  goBooking(event) {
    const start = event.currentTarget.dataset.start;
    const end = event.currentTarget.dataset.end;
    wx.navigateTo({
      url:
        '/pages/booking/booking?resourceId=' + this.data.id +
        '&date=' + this.data.date +
        '&segmentStart=' + encodeURIComponent(start) +
        '&segmentEnd=' + encodeURIComponent(end),
    });
  },
});
