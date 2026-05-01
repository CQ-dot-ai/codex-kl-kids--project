const placesGrid = document.getElementById("places-grid");
const eventsList = document.getElementById("events-list");
const ageFilter = document.getElementById("age-filter");
const transportFilter = document.getElementById("transport-filter");
const weatherFilter = document.getElementById("weather-filter");
const durationFilter = document.getElementById("duration-filter");
const resetFilters = document.getElementById("reset-filters");
const syncEvents = document.getElementById("sync-events");
const syncStatus = document.getElementById("sync-status");
const resultNote = document.getElementById("result-note");

const state = {
  places: [],
  events: [],
};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function includesAge(place, selectedAge) {
  return selectedAge === "all" || (place.age_ranges || []).includes(selectedAge);
}

function includesTransport(place, selectedTransport) {
  if (selectedTransport === "all") return true;
  return place.best_transport === selectedTransport || (place.transport_options || []).includes(selectedTransport);
}

function includesWeather(place, selectedWeather) {
  if (selectedWeather === "all") return true;
  if (selectedWeather === "rain") return place.rain_safe;
  if (selectedWeather === "hot") return place.indoor_level >= 4;
  return true;
}

function includesDuration(place, selectedDuration) {
  return selectedDuration === "all" || place.duration_type === selectedDuration;
}

function filters() {
  return {
    age: ageFilter.value,
    transport: transportFilter.value,
    weather: weatherFilter.value,
    duration: durationFilter.value,
  };
}

function filteredPlaces() {
  const active = filters();
  return state.places
    .filter((place) => includesAge(place, active.age))
    .filter((place) => includesTransport(place, active.transport))
    .filter((place) => includesWeather(place, active.weather))
    .filter((place) => includesDuration(place, active.duration))
    .sort((a, b) => {
      const scoreA = a.parent_ease + a.kid_fun + a.weather_resilience;
      const scoreB = b.parent_ease + b.kid_fun + b.weather_resilience;
      return scoreB - scoreA;
    });
}

function tagList(items) {
  return (items || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
}

function transportLabel(place) {
  if (place.best_transport === "train") return "优先地铁";
  if (place.best_transport === "car") return "优先开车";
  return "两者都可";
}

function mapQuery(place) {
  return place.map_query || place.name;
}

function googleMapsUrl(place) {
  const query = encodeURIComponent(`${place.latitude},${place.longitude} ${mapQuery(place)}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function wazeUrl(place) {
  const query = encodeURIComponent(mapQuery(place));
  return `https://waze.com/ul?ll=${encodeURIComponent(`${place.latitude},${place.longitude}`)}&navigate=yes&q=${query}`;
}

function placeShareText(place) {
  return [
    `这个周末可以带娃去：${place.name}`,
    `地点：${place.area}`,
    `适合玩：${place.recommended_time}`,
    `交通：${transportLabel(place)}，${place.transport_note}`,
    `家长提示：${place.parent_note}`,
    `Google Maps：${googleMapsUrl(place)}`,
    `Waze：${wazeUrl(place)}`,
  ].join("\n");
}

function whatsappShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function placeCard(place) {
  const googleUrl = googleMapsUrl(place);
  const wazeLink = wazeUrl(place);
  const shareUrl = whatsappShareUrl(placeShareText(place));
  return `
    <article class="place-card">
      <div class="card-top">
        <div>
          <p class="area">${escapeHtml(place.area)}</p>
          <h3>${escapeHtml(place.name)}</h3>
        </div>
        <strong class="score">${escapeHtml(place.parent_ease)}/5</strong>
      </div>
      <p class="summary">${escapeHtml(place.summary)}</p>
      <div class="metric-row">
        <p><span>轻易度</span><strong>${escapeHtml(place.parent_ease)}/5</strong></p>
        <p><span>孩子会玩</span><strong>${escapeHtml(place.kid_fun)}/5</strong></p>
        <p><span>建议玩多久</span><strong>${escapeHtml(place.recommended_time)}</strong></p>
      </div>
      <div class="decision">
        <p><strong>${transportLabel(place)}</strong>${escapeHtml(place.transport_note)}</p>
        <p><strong>家长提示</strong>${escapeHtml(place.parent_note)}</p>
      </div>
      <div class="tags">${tagList(place.tags)}</div>
      <div class="card-actions">
        <a class="action primary" href="${escapeHtml(shareUrl)}" target="_blank" rel="noreferrer">发到 WhatsApp</a>
        <a class="action" href="${escapeHtml(wazeLink)}" target="_blank" rel="noreferrer">Waze</a>
        <a class="action" href="${escapeHtml(googleUrl)}" target="_blank" rel="noreferrer">Google Maps</a>
      </div>
      <a class="source-link" href="${escapeHtml(place.source_url)}" target="_blank" rel="noreferrer">查看来源</a>
    </article>
  `;
}

function eventStatus(event) {
  if (event.status === "ongoing") return "进行中";
  if (event.status === "upcoming") return "即将开始";
  if (event.status === "past") return "已结束";
  return "待确认";
}

function eventAppeal(event) {
  const fitNote = String(event.fit_note || "")
    .replace("公开活动源同步结果，出发前建议点来源确认报名和名额。", "")
    .trim();
  if (fitNote) return fitNote;

  const title = String(event.title || "").toLowerCase();
  if (title.includes("baking") || title.includes("cook")) return "雨天也能安心安排，孩子有作品带回家。";
  if (title.includes("science") || title.includes("robot") || title.includes("stem")) return "适合爱动手、爱提问的孩子，玩中有学习感。";
  if (title.includes("music") || title.includes("vocal") || title.includes("art")) return "适合想尝试表达和创作的孩子，节奏轻松。";
  if (title.includes("camp") || title.includes("workshop")) return "适合周末或假期放电，家长安排更省心。";
  return "适合提前收藏，出发前确认名额、年龄和报名方式。";
}

function eventItem(event) {
  return `
    <article class="event-card-slide ${escapeHtml(event.status || "unknown")}">
      <div class="event-card-top">
        <span>${eventStatus(event)}</span>
        <a href="${escapeHtml(event.source_url)}" target="_blank" rel="noreferrer">来源</a>
      </div>
      <h3>${escapeHtml(event.title)}</h3>
      <p class="event-appeal">${escapeHtml(eventAppeal(event))}</p>
      <p class="event-meta">${escapeHtml(event.date_text || "日期待确认")} · ${escapeHtml(event.venue || "地点待确认")}</p>
    </article>
  `;
}

function updateStats(visible) {
  document.getElementById("place-count").textContent = state.places.length;
  document.getElementById("event-count").textContent = state.events.filter((event) => event.status !== "past").length;
  document.getElementById("easy-count").textContent = state.places.filter((place) => place.parent_ease >= 4).length;
  document.getElementById("rain-count").textContent = state.places.filter((place) => place.rain_safe).length;
  resultNote.textContent = `当前显示 ${visible.length} 个，按轻易度、孩子吸引力和雨天稳定性排序。`;
}

function updateBestPick(visible) {
  const best = visible[0] || state.places[0];
  document.getElementById("today-label").textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());
  if (!best) return;
  document.getElementById("best-pick").textContent = best.name;
  document.getElementById("best-reason").textContent = `${transportLabel(best)}，${best.recommended_time}，${best.parent_note}`;
  document.getElementById("hero-whatsapp").href = whatsappShareUrl(placeShareText(best));
  document.getElementById("hero-map").href = googleMapsUrl(best);
}

function render() {
  const visible = filteredPlaces();
  placesGrid.innerHTML = visible.length
    ? visible.map((place) => placeCard(place)).join("")
    : '<p class="empty">当前条件下没有合适地点，放宽一个筛选试试。</p>';
  const activeEvents = state.events.filter((event) => event.status !== "past");
  eventsList.innerHTML = activeEvents.length
    ? activeEvents.slice(0, 10).map((event) => eventItem(event)).join("")
    : '<p class="empty">暂无活动数据，点击同步获取公开活动源。</p>';
  updateStats(visible);
  updateBestPick(visible);
}

async function loadData() {
  const [placesResponse, eventsResponse] = await Promise.all([
    fetch("/data/kids_places.json").then((response) => (response.ok ? response : fetch("/api/places"))),
    fetch("/data/live_events.json").then((response) => (response.ok ? response : fetch("/api/events"))),
  ]);
  const rawPlacesData = await placesResponse.json();
  const rawEventsData = await eventsResponse.json();
  const placesData = Array.isArray(rawPlacesData) ? { places: rawPlacesData } : rawPlacesData;
  const eventsData = Array.isArray(rawEventsData) ? { events: rawEventsData } : rawEventsData;
  state.places = placesData.places || [];
  state.events = eventsData.events || [];
  syncStatus.textContent = eventsData.last_synced_at ? `静态活动数据：${eventsData.last_synced_at}` : "读取静态活动源。";
  render();
}

async function syncLiveEvents() {
  syncEvents.disabled = true;
  syncStatus.textContent = "静态部署版默认不在线抓取，正在尝试本地 API...";
  try {
    const response = await fetch("/api/events/sync", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      syncStatus.textContent = data.error || "当前部署不支持在线同步";
      return;
    }
    state.events = data.events || [];
    syncStatus.textContent = `已同步 ${state.events.length} 条，${data.last_synced_at}`;
    render();
  } catch (error) {
    syncStatus.textContent = "当前是 WhatsApp 静态版；活动更新需重新发布数据。";
  } finally {
    syncEvents.disabled = false;
  }
}

[ageFilter, transportFilter, weatherFilter, durationFilter].forEach((control) => {
  control.addEventListener("change", render);
});

resetFilters.addEventListener("click", () => {
  ageFilter.value = "all";
  transportFilter.value = "all";
  weatherFilter.value = "all";
  durationFilter.value = "all";
  render();
});

syncEvents.addEventListener("click", syncLiveEvents);
loadData();
