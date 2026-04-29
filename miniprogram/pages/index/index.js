const localPlaces = require("../../data/places");
const localEvents = require("../../data/events");
const appConfig = require("../../config");

const ageOptions = [
  { label: "全部年龄", value: "all" },
  { label: "0-3 岁", value: "0-3" },
  { label: "4-6 岁", value: "4-6" },
  { label: "7-10 岁", value: "7-10" },
  { label: "11+ 岁", value: "11+" }
];

const transportOptions = [
  { label: "都可以", value: "all" },
  { label: "优先地铁", value: "train" },
  { label: "优先开车", value: "car" }
];

const weatherOptions = [
  { label: "不限制", value: "all" },
  { label: "下雨也能去", value: "rain" },
  { label: "怕晒怕热", value: "hot" }
];

const durationOptions = [
  { label: "不限", value: "all" },
  { label: "2 小时内", value: "short" },
  { label: "半天", value: "half" },
  { label: "一整天", value: "full" }
];

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function statusOf(event) {
  const today = todayIso();
  if (!event.startDate) return "待确认";
  const end = event.endDate || event.startDate;
  if (end < today) return "已结束";
  if (event.startDate > today) return "即将开始";
  return "进行中";
}

function transportLabel(place) {
  if (place.bestTransport === "train") return "优先地铁";
  if (place.bestTransport === "car") return "优先开车";
  return "都可以";
}

function mapLinks(place) {
  const encodedQuery = encodeURIComponent(place.mapQuery || place.name);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}%20${encodedQuery}`,
    waze: `https://waze.com/ul?ll=${place.latitude},${place.longitude}&navigate=yes&q=${encodedQuery}`
  };
}

function decoratePlace(place) {
  return {
    ...place,
    scoreTotal: place.parentEase + place.kidFun + place.weatherResilience,
    transportLabel: transportLabel(place),
    googleMapUrl: mapLinks(place).google,
    wazeUrl: mapLinks(place).waze
  };
}

function decorateEvent(event) {
  return {
    ...event,
    statusLabel: statusOf(event)
  };
}

Page({
  data: {
    places: [],
    events: [],
    visiblePlaces: [],
    activePlace: null,
    ageOptions,
    transportOptions,
    weatherOptions,
    durationOptions,
    filters: {
      age: "all",
      transport: "all",
      weather: "all",
      duration: "all"
    },
    selectedIndex: {
      age: 0,
      transport: 0,
      weather: 0,
      duration: 0
    },
    stats: {
      placeCount: 0,
      eventCount: 0,
      easyCount: 0,
      rainCount: 0
    },
    syncStatus: "已加载本地亲子数据",
    reminderStatus: "周五晚 8 点提醒你看周末安排",
    weatherHint: "KL 天气变化快，雨天会优先推荐室内和商场友好地点"
  },

  onLoad() {
    this.loadLocalData();
  },

  onPullDownRefresh() {
    this.syncEvents(() => wx.stopPullDownRefresh());
  },

  onShareAppMessage() {
    const pick = this.data.activePlace;
    return {
      title: pick ? `KL 带娃去 ${pick.name}` : "KL 亲子周末雷达",
      path: "/pages/index/index"
    };
  },

  onShareTimeline() {
    return {
      title: "KL 亲子周末雷达：按年龄、天气和交通筛带娃去处"
    };
  },

  loadLocalData() {
    const places = localPlaces.map(decoratePlace);
    const events = localEvents.map(decorateEvent);
    this.setData({ places, events, syncStatus: "本地数据已就绪" }, () => this.applyFilters());
  },

  applyFilters() {
    const { age, transport, weather, duration } = this.data.filters;
    const visiblePlaces = this.data.places
      .filter((place) => age === "all" || place.ageRanges.includes(age))
      .filter((place) => {
        if (transport === "all") return true;
        return place.bestTransport === transport || place.transportOptions.includes(transport);
      })
      .filter((place) => {
        if (weather === "all") return true;
        if (weather === "rain") return place.rainSafe;
        if (weather === "hot") return place.indoorLevel >= 4;
        return true;
      })
      .filter((place) => duration === "all" || place.durationType === duration)
      .sort((a, b) => this.rankPlace(b) - this.rankPlace(a));

    this.setData({
      visiblePlaces,
      activePlace: visiblePlaces[0] || this.data.places[0] || null,
      stats: {
        placeCount: this.data.places.length,
        eventCount: this.data.events.filter((event) => event.statusLabel !== "已结束").length,
        easyCount: this.data.places.filter((place) => place.parentEase >= 4).length,
        rainCount: this.data.places.filter((place) => place.rainSafe).length
      }
    });
  },

  rankPlace(place) {
    const weatherBoost = this.data.filters.weather === "rain" || this.data.filters.weather === "hot"
      ? place.weatherResilience * 2 + place.indoorLevel
      : place.weatherResilience;
    const easeBoost = place.parentEase * 2;
    return easeBoost + place.kidFun + weatherBoost;
  },

  onPickerChange(event) {
    const type = event.currentTarget.dataset.type;
    const index = Number(event.detail.value);
    const optionsMap = {
      age: ageOptions,
      transport: transportOptions,
      weather: weatherOptions,
      duration: durationOptions
    };
    const value = optionsMap[type][index].value;
    this.setData({
      [`filters.${type}`]: value,
      [`selectedIndex.${type}`]: index
    }, () => this.applyFilters());
  },

  resetFilters() {
    this.setData({
      filters: {
        age: "all",
        transport: "all",
        weather: "all",
        duration: "all"
      },
      selectedIndex: {
        age: 0,
        transport: 0,
        weather: 0,
        duration: 0
      }
    }, () => this.applyFilters());
  },

  syncEvents(done) {
    const app = getApp();
    const apiBase = app.globalData.apiBase || appConfig.apiBase;
    if (!apiBase) {
      this.setData({ syncStatus: "当前为离线版；上线后可在 app.js 配置活动 API" });
      if (done) done();
      return;
    }

    this.setData({ syncStatus: "正在同步活动..." });
    wx.request({
      url: `${apiBase}/api/events`,
      method: "GET",
      success: (response) => {
        const rows = (response.data && response.data.events) || [];
        const events = rows.map((event) => decorateEvent({
          id: event.id,
          title: event.title,
          dateText: event.date_text || event.dateText,
          startDate: event.start_date || event.startDate,
          endDate: event.end_date || event.endDate,
          venue: event.venue,
          ageText: event.age_text || event.ageText,
          fitNote: event.fit_note || event.fitNote,
          sourceUrl: event.source_url || event.sourceUrl
        }));
        this.setData({ events, syncStatus: "活动已同步" }, () => this.applyFilters());
      },
      fail: () => {
        this.setData({ syncStatus: "同步失败，继续使用本地活动" });
      },
      complete: () => {
        if (done) done();
      }
    });
  },

  subscribeFriday() {
    if (!appConfig.fridayTemplateId || appConfig.fridayTemplateId.includes("REPLACE_WITH")) {
      wx.setStorageSync("fridayReminderEnabled", true);
      this.setData({ reminderStatus: "已保存提醒偏好；上线前请先配置订阅消息模板 ID" });
      wx.showToast({ title: "已保存偏好", icon: "success" });
      return;
    }

    wx.requestSubscribeMessage({
      tmplIds: [appConfig.fridayTemplateId],
      success: (res) => {
        const accepted = res[appConfig.fridayTemplateId] === "accept";
        wx.setStorageSync("fridayReminderEnabled", accepted);
        this.setData({
          reminderStatus: accepted ? "已开启周五推荐提醒" : "你暂未允许周五提醒"
        });
        if (accepted) {
          this.saveFridaySubscriber();
        }
        wx.showToast({ title: accepted ? "提醒已开启" : "未开启提醒", icon: "none" });
      },
      fail: () => {
        wx.showToast({ title: "请在真机点击后授权", icon: "none" });
      }
    });
  },

  saveFridaySubscriber() {
    if (!appConfig.cloudEnv || !wx.cloud) return;
    const db = wx.cloud.database();
    db.collection("friday_subscribers").add({
      data: {
        enabled: true,
        city: appConfig.weatherCity.name,
        createdAt: db.serverDate()
      }
    });
  },

  openWechatMap(event) {
    const id = event.currentTarget.dataset.id;
    const place = this.data.places.find((item) => item.id === id);
    if (!place) return;
    wx.openLocation({
      latitude: place.latitude,
      longitude: place.longitude,
      name: place.name,
      address: place.area,
      scale: 16
    });
  },

  copyMapLink(event) {
    const url = event.currentTarget.dataset.url;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: "地图链接已复制", icon: "success" });
      }
    });
  },

  copySource(event) {
    const url = event.currentTarget.dataset.url;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: "来源链接已复制", icon: "success" });
      }
    });
  }
});
