const card = document.getElementById("place-card");
const filterChips = document.getElementById("filter-chips");
const progress = document.getElementById("deck-progress");
const feedback = document.getElementById("feedback");
const savedList = document.getElementById("saved-list");
const eventsList = document.getElementById("events-list");
const eventCount = document.getElementById("event-count");
const clearFilters = document.getElementById("clear-filters");
const undoCard = document.getElementById("undo-card");
const skipCard = document.getElementById("skip-card");
const saveCard = document.getElementById("save-card");
const shareSaved = document.getElementById("share-saved");
const openWaze = document.getElementById("open-waze");
const openGoogle = document.getElementById("open-google");
const openWhatsapp = document.getElementById("open-whatsapp");
const openCurrentWhatsappTop = document.getElementById("open-current-whatsapp-top");

const quickFilters = [
  { id: "rain", label: "雨天稳" },
  { id: "indoor", label: "室内放电" },
  { id: "train", label: "地铁直达" },
  { id: "car", label: "开车省心" },
  { id: "age-0-3", label: "0-3岁" },
  { id: "age-4-6", label: "4-6岁" },
  { id: "age-7-10", label: "7-10岁" },
  { id: "short", label: "2小时内" },
  { id: "half", label: "半天" },
  { id: "booking", label: "要预约" },
];

const state = {
  places: [],
  events: [],
  filters: new Set(),
  index: 0,
  saved: [],
  history: [],
  drag: { active: false, startX: 0, startY: 0, dx: 0, dy: 0 },
};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function encode(value) {
  return encodeURIComponent(String(value || ""));
}

function ageLabel(place) {
  return (place.age_ranges || []).join(" / ") || "全年龄";
}

function transportLabel(place) {
  if (place.best_transport === "train") return "地铁更省心";
  if (place.best_transport === "car") return "建议开车";
  return "交通灵活";
}

function weatherLabel(place) {
  if (place.rain_safe) return "雨天友好";
  if (place.indoor_level >= 4) return "室内稳妥";
  return "看天气";
}

function needsBooking(place) {
  const text = `${place.parent_note || ""} ${(place.tags || []).join(" ")}`;
  return /预约|book|booking|reserve/i.test(text);
}

function bookingLabel(place) {
  return needsBooking(place) ? "建议提前预约" : "出发前确认营业";
}

function parkingLabel(place) {
  if (place.best_transport === "train") return "地铁比停车省心";
  if (place.best_transport === "car" && place.parent_ease >= 4) return "停车相对稳";
  if (place.best_transport === "car") return "开车但预留停车时间";
  return "交通灵活";
}

function chineseFamilyNote(place) {
  if (place.indoor_level >= 4 && place.best_transport === "train") return "适合刚来 KL 的中文家庭，路径清楚、撤退容易。";
  if (place.best_transport === "car") return "更适合开车家庭，带装备和老人同行会轻松些。";
  if (place.rain_safe) return "雨天也比较稳，适合作为临时备选。";
  return "更适合天气好、孩子体力充足的时候安排。";
}

function pitfallText(place) {
  const notes = {
    "petrosains-klcc": "周末热门时段容易排队，KLCC 地铁通常比开车省心。",
    "aquaria-klcc": "单独去时长偏短，适合搭配 KLCC Park 或商场吃饭。",
    "kidzania-kl": "不要临时冲，热门职业排队会明显消耗家长。",
    "superpark-malaysia": "体力消耗大，记得防滑袜，低龄孩子别排太满。",
    "farm-in-the-city": "正午晒、午后雨风险高，最好安排早上。",
    "kl-bird-park": "户外多，带水、防蚊和帽子，下雨直接换室内备选。",
    "sunway-lagoon": "装备多且很耗体力，低龄孩子不适合硬撑全天。",
    "good-times-baking": "适合低体力日，但热门时段建议提前预约。",
  };
  return notes[place.id] || place.parent_note || "出发前确认营业时间、票务和天气。";
}

function googleMapsUrl(place) {
  return `https://www.google.com/maps/search/?api=1&query=${encode(`${place.latitude},${place.longitude} ${place.map_query || place.name}`)}`;
}

function wazeUrl(place) {
  return `https://waze.com/ul?ll=${encode(`${place.latitude},${place.longitude}`)}&navigate=yes&q=${encode(place.map_query || place.name)}`;
}

function shareText(place) {
  return [
    `这个周末可以带娃去：${place.name}`,
    `地点：${place.area}`,
    `适合：${ageLabel(place)}，${place.recommended_time}`,
    `中文家庭判断：${chineseFamilyNote(place)}`,
    `停车/预约：${parkingLabel(place)}，${bookingLabel(place)}`,
    `一句话避坑：${pitfallText(place)}`,
    `Waze：${wazeUrl(place)}`,
    `Google Maps：${googleMapsUrl(place)}`,
  ].join("\n");
}

function whatsappUrl(text) {
  return `https://wa.me/?text=${encode(text)}`;
}

function includesQuickFilter(place, filterId) {
  if (filterId === "rain") return place.rain_safe;
  if (filterId === "indoor") return place.indoor_level >= 4;
  if (filterId === "train") return place.best_transport === "train" || (place.transport_options || []).includes("train");
  if (filterId === "car") return place.best_transport === "car" || (place.transport_options || []).includes("car");
  if (filterId === "age-0-3") return (place.age_ranges || []).includes("0-3");
  if (filterId === "age-4-6") return (place.age_ranges || []).includes("4-6");
  if (filterId === "age-7-10") return (place.age_ranges || []).includes("7-10");
  if (filterId === "short") return place.duration_type === "short";
  if (filterId === "half") return place.duration_type === "half";
  if (filterId === "booking") return needsBooking(place);
  return true;
}

function score(place) {
  return place.parent_ease + place.kid_fun + place.weather_resilience;
}

function filteredPlaces() {
  return [...state.places]
    .filter((place) => Array.from(state.filters).every((filterId) => includesQuickFilter(place, filterId)))
    .sort((a, b) => score(b) - score(a));
}

function currentPlace() {
  return filteredPlaces()[state.index] || null;
}

function showFeedback(message) {
  feedback.textContent = message;
  window.clearTimeout(showFeedback.timer);
  showFeedback.timer = window.setTimeout(() => {
    feedback.textContent = "";
  }, 1400);
}

function renderFilters() {
  filterChips.innerHTML = quickFilters
    .map((filter) => {
      const active = state.filters.has(filter.id) ? " active" : "";
      return `<button class="chip${active}" type="button" data-filter="${escapeHtml(filter.id)}">${escapeHtml(filter.label)}</button>`;
    })
    .join("");
}

function renderCard() {
  const places = filteredPlaces();
  const place = places[state.index] || null;
  progress.textContent = `${Math.min(state.index + 1, places.length)} / ${places.length}`;
  undoCard.disabled = !state.history.length;

  if (!place) {
    card.className = "place-card empty-card";
    card.style.transform = "";
    card.innerHTML = `
      <div>
        <h3>今日推荐看完了</h3>
        <p>可以查看本周末清单，或者清空筛选再来一轮。</p>
      </div>
    `;
    updateLinks(null);
    return;
  }

  card.className = "place-card";
  card.style.transform = "";
  card.innerHTML = `
    <div class="card-image">
      <span class="badge">${escapeHtml(weatherLabel(place))}</span>
      <span class="score-pill">家长 ${escapeHtml(place.parent_ease)}/5</span>
    </div>
    <div class="card-body">
      <p class="area">${escapeHtml(place.area)}</p>
      <h3 class="card-title">${escapeHtml(place.name)}</h3>
      <p class="summary">${escapeHtml(place.summary)}</p>
      <div class="tags">
        <span>${escapeHtml(ageLabel(place))}</span>
        <span>${escapeHtml(place.recommended_time)}</span>
        <span>${escapeHtml(transportLabel(place))}</span>
        <span>${escapeHtml(bookingLabel(place))}</span>
      </div>
      <div class="score-row">
        <div class="score-box"><small>家长轻松</small><strong>${escapeHtml(place.parent_ease)}/5</strong></div>
        <div class="score-box"><small>孩子会玩</small><strong>${escapeHtml(place.kid_fun)}/5</strong></div>
        <div class="score-box"><small>天气稳定</small><strong>${escapeHtml(place.weather_resilience)}/5</strong></div>
      </div>
      <div class="decision">
        <strong>中文家庭</strong>
        <p>${escapeHtml(chineseFamilyNote(place))}</p>
        <strong>一句话避坑</strong>
        <p>${escapeHtml(pitfallText(place))}</p>
      </div>
    </div>
  `;
  updateLinks(place);
}

function updateLinks(place) {
  const disabled = !place;
  [skipCard, saveCard].forEach((button) => {
    button.disabled = disabled;
  });

  const mapUrl = place ? googleMapsUrl(place) : "#";
  const wzUrl = place ? wazeUrl(place) : "#";
  const waUrl = place ? whatsappUrl(shareText(place)) : "#";

  openGoogle.href = mapUrl;
  openWaze.href = wzUrl;
  openWhatsapp.href = waUrl;
  openCurrentWhatsappTop.href = waUrl;
}

function renderSaved() {
  if (!state.saved.length) {
    savedList.innerHTML = `<p class="empty-line">右滑喜欢的地点会出现在这里。</p>`;
  } else {
    savedList.innerHTML = state.saved
      .map((place) => `
        <div class="saved-item">
          <strong>${escapeHtml(place.name)}</strong>
          <p>${escapeHtml(place.area)} · ${escapeHtml(place.recommended_time)}</p>
        </div>
      `)
      .join("");
  }

  const text = state.saved.length
    ? ["本周末带娃备选：", ...state.saved.map((place, idx) => `${idx + 1}. ${place.name}\n${place.area}\n避坑：${pitfallText(place)}\nWaze：${wazeUrl(place)}\nGoogle Maps：${googleMapsUrl(place)}`)].join("\n\n")
    : "我正在用带娃去哪儿 KL 选本周末带娃安排。";
  shareSaved.href = whatsappUrl(text);
}

function renderEvents() {
  const events = (state.events.events || state.events || []).filter((event) => event.status !== "past").slice(0, 4);
  eventCount.textContent = `${events.length} 个活动`;
  eventsList.innerHTML = events
    .map((event) => `
      <div class="event-item">
        <span class="event-status">${event.status === "ongoing" ? "进行中" : "即将开始"}</span>
        <strong>${escapeHtml(event.title)}</strong>
        <p>${escapeHtml(event.date_text || "日期待确认")} · ${escapeHtml(event.venue || "地点待确认")}</p>
      </div>
    `)
    .join("");
}

function render() {
  renderFilters();
  renderCard();
  renderSaved();
  renderEvents();
}

function advance(action) {
  const place = currentPlace();
  if (!place) return;
  const wasSaved = state.saved.some((item) => item.id === place.id);
  if (action === "save" && !wasSaved) {
    state.saved.push(place);
    showFeedback("已加入本周末清单");
  } else if (action === "save") {
    showFeedback("已在清单里，继续下一张");
  } else {
    showFeedback("已跳过，可撤回");
  }
  state.history.push({ action, place, index: state.index, addedSaved: action === "save" && !wasSaved });
  state.index += 1;
  render();
}

function undo() {
  const last = state.history.pop();
  if (!last) return;
  state.index = last.index;
  if (last.addedSaved) {
    state.saved = state.saved.filter((item) => item.id !== last.place.id);
  }
  showFeedback("已撤回上一步");
  render();
}

function startDrag(event) {
  const point = event.touches ? event.touches[0] : event;
  state.drag = { active: true, startX: point.clientX, startY: point.clientY, dx: 0, dy: 0 };
  card.classList.add("dragging");
}

function moveDrag(event) {
  if (!state.drag.active) return;
  const point = event.touches ? event.touches[0] : event;
  state.drag.dx = point.clientX - state.drag.startX;
  state.drag.dy = point.clientY - state.drag.startY;
  if (Math.abs(state.drag.dx) > 8) event.preventDefault();
  const rotate = state.drag.dx / 22;
  card.style.transform = `translate(${state.drag.dx}px, ${state.drag.dy * 0.12}px) rotate(${rotate}deg)`;
}

function endDrag() {
  if (!state.drag.active) return;
  const dx = state.drag.dx;
  state.drag.active = false;
  card.classList.remove("dragging");
  if (dx > 92) {
    card.style.transform = "translateX(130%) rotate(11deg)";
    window.setTimeout(() => advance("save"), 130);
    return;
  }
  if (dx < -92) {
    card.style.transform = "translateX(-130%) rotate(-11deg)";
    window.setTimeout(() => advance("skip"), 130);
    return;
  }
  card.style.transform = "";
}

filterChips.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  const filterId = button.dataset.filter;
  if (state.filters.has(filterId)) state.filters.delete(filterId);
  else state.filters.add(filterId);
  state.index = 0;
  state.history = [];
  render();
});

clearFilters.addEventListener("click", () => {
  state.filters.clear();
  state.index = 0;
  state.history = [];
  render();
});

undoCard.addEventListener("click", undo);
skipCard.addEventListener("click", () => advance("skip"));
saveCard.addEventListener("click", () => advance("save"));
card.addEventListener("mousedown", startDrag);
card.addEventListener("touchstart", startDrag, { passive: true });
window.addEventListener("mousemove", moveDrag);
window.addEventListener("touchmove", moveDrag, { passive: false });
window.addEventListener("mouseup", endDrag);
window.addEventListener("touchend", endDrag);

async function init() {
  const [placesResponse, eventsResponse] = await Promise.all([
    fetch("/data/kids_places.json"),
    fetch("/data/live_events.json"),
  ]);
  state.places = await placesResponse.json();
  state.events = await eventsResponse.json();
  render();
}

init().catch(() => {
  card.innerHTML = `<div class="empty-card"><p>数据加载失败，请稍后刷新。</p></div>`;
});
