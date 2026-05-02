import React, { useMemo, useRef, useState } from "react";
import {
  Animated,
  Linking,
  PanResponder,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";

import places from "./src/data/kids_places.json";
import liveEventsData from "./src/data/live_events.json";

const quickFilters = [
  { id: "rain", label: "下雨不踩雷" },
  { id: "indoor", label: "室内放电" },
  { id: "train", label: "地铁直达" },
  { id: "car", label: "开车省心" },
  { id: "age-0-3", label: "0-3岁" },
  { id: "age-4-6", label: "4-6岁" },
  { id: "age-7-10", label: "7-10岁" },
  { id: "short", label: "2小时内" },
  { id: "half", label: "半天刚好" },
  { id: "booking", label: "需要预约" },
];

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
  if (place.indoor_level >= 4 && place.best_transport === "train") {
    return "适合刚来 KL 的中文家庭，路径清楚、撤退容易。";
  }
  if (place.best_transport === "car") {
    return "更适合开车家庭，带装备和老人同行会轻松些。";
  }
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
  return `https://www.google.com/maps/search/?api=1&query=${encode(
    `${place.latitude},${place.longitude} ${place.map_query || place.name}`,
  )}`;
}

function wazeUrl(place) {
  return `https://waze.com/ul?ll=${encode(`${place.latitude},${place.longitude}`)}&navigate=yes&q=${encode(
    place.map_query || place.name,
  )}`;
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

function openUrl(url) {
  Linking.openURL(url).catch(() => {});
}

function ActionButton({ label, onPress, variant = "default", disabled = false }) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      disabled={disabled}
      onPress={onPress}
      style={[styles.actionButton, styles[`action_${variant}`], disabled && styles.disabled]}
    >
      <Text style={[styles.actionText, variant === "save" && styles.actionTextSave]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.82} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PlaceCard({ place, panHandlers, animatedStyle }) {
  if (!place) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>今日推荐看完了</Text>
        <Text style={styles.emptyCopy}>可以查看本周末清单，或者清空筛选再来一轮。</Text>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.card, animatedStyle]} {...panHandlers}>
      <View style={styles.imageBlock}>
        <Text style={styles.badge}>{weatherLabel(place)}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.area}>{place.area}</Text>
        <Text style={styles.cardTitle}>{place.name}</Text>
        <Text style={styles.summary}>{place.summary}</Text>

        <View style={styles.tagRow}>
          {[ageLabel(place), place.recommended_time, transportLabel(place), bookingLabel(place)].map((tag) => (
            <Text key={tag} style={styles.tag}>
              {tag}
            </Text>
          ))}
        </View>

        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>家长轻松</Text>
            <Text style={styles.scoreValue}>{place.parent_ease}/5</Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>孩子会玩</Text>
            <Text style={styles.scoreValue}>{place.kid_fun}/5</Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>天气稳定</Text>
            <Text style={styles.scoreValue}>{place.weather_resilience}/5</Text>
          </View>
        </View>

        <View style={styles.decisionBox}>
          <Text style={styles.decisionTitle}>中文家庭</Text>
          <Text style={styles.decisionCopy}>{chineseFamilyNote(place)}</Text>
          <Text style={styles.decisionTitle}>一句话避坑</Text>
          <Text style={styles.decisionCopy}>{pitfallText(place)}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function App() {
  const [activeFilters, setActiveFilters] = useState(new Set());
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState([]);
  const [history, setHistory] = useState([]);
  const [feedback, setFeedback] = useState("");
  const position = useRef(new Animated.ValueXY()).current;

  const filteredPlaces = useMemo(() => {
    return [...places]
      .filter((place) => Array.from(activeFilters).every((filterId) => includesQuickFilter(place, filterId)))
      .sort((a, b) => score(b) - score(a));
  }, [activeFilters]);

  const current = filteredPlaces[index] || null;
  const rainPlan = useMemo(() => {
    return [...places]
      .filter((place) => place.rain_safe || place.indoor_level >= 4)
      .sort((a, b) => score(b) - score(a))
      .slice(0, 3);
  }, []);

  const liveEvents = (liveEventsData.events || []).filter((event) => event.status !== "past").slice(0, 5);

  const showFeedback = (message) => {
    setFeedback(message);
    setTimeout(() => setFeedback(""), 1400);
  };

  const resetCardPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      friction: 6,
    }).start();
  };

  const advance = (action) => {
    if (!current) return;
    const wasSaved = saved.some((item) => item.id === current.id);
    if (action === "save" && !wasSaved) {
      setSaved((items) => [...items, current]);
      showFeedback("已加入本周末清单");
    } else if (action === "save") {
      showFeedback("已在清单里，继续下一张");
    } else {
      showFeedback("已跳过，可撤回");
    }
    setHistory((items) => [...items, { action, place: current, index, addedSaved: action === "save" && !wasSaved }]);
    setIndex((value) => value + 1);
    position.setValue({ x: 0, y: 0 });
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((items) => items.slice(0, -1));
    setIndex(last.index);
    if (last.addedSaved) {
      setSaved((items) => items.filter((item) => item.id !== last.place.id));
    }
    showFeedback("已撤回上一步");
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8,
      onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 95) {
          advance("save");
          return;
        }
        if (gesture.dx < -95) {
          advance("skip");
          return;
        }
        resetCardPosition();
      },
    }),
  ).current;

  const animatedStyle = {
    transform: [
      { translateX: position.x },
      { translateY: Animated.multiply(position.y, 0.12) },
      {
        rotate: position.x.interpolate({
          inputRange: [-180, 0, 180],
          outputRange: ["-8deg", "0deg", "8deg"],
        }),
      },
    ],
  };

  const toggleFilter = (filterId) => {
    setActiveFilters((filters) => {
      const next = new Set(filters);
      if (next.has(filterId)) next.delete(filterId);
      else next.add(filterId);
      return next;
    });
    setIndex(0);
    setHistory([]);
  };

  const shareSaved = () => {
    const text = saved.length
      ? ["本周末带娃备选：", ...saved.map((place, idx) => `${idx + 1}. ${place.name}\n${place.area}\n避坑：${pitfallText(place)}\nWaze：${wazeUrl(place)}`)].join("\n\n")
      : "我正在用带娃去哪儿 KL 选本周末带娃安排。";
    openUrl(whatsappUrl(text));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ExpoStatusBar style="dark" />
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>带娃去哪儿 KL</Text>
          <Text style={styles.title}>3 分钟选好今天带娃去哪儿</Text>
          <Text style={styles.intro}>为 KL 华人家庭整理：中文判断、本地交通、天气、停车、年龄适配和分享决策。</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroller}>
          {quickFilters.map((filter) => (
            <Chip key={filter.id} label={filter.label} active={activeFilters.has(filter.id)} onPress={() => toggleFilter(filter.id)} />
          ))}
          {activeFilters.size > 0 && <Chip label="清空" active={false} onPress={() => { setActiveFilters(new Set()); setIndex(0); setHistory([]); }} />}
        </ScrollView>

        <View style={styles.deckHeader}>
          <View>
            <Text style={styles.sectionKicker}>滑卡推荐</Text>
            <Text style={styles.sectionTitle}>右滑想去，左滑跳过</Text>
          </View>
          <Text style={styles.progress}>{Math.min(index + 1, filteredPlaces.length)} / {filteredPlaces.length}</Text>
        </View>

        <PlaceCard place={current} animatedStyle={animatedStyle} panHandlers={panResponder.panHandlers} />
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

        <View style={styles.savedPanel}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>本周末清单</Text>
            <TouchableOpacity onPress={shareSaved} style={styles.shareButton}>
              <Text style={styles.shareText}>分享清单</Text>
            </TouchableOpacity>
          </View>
          {saved.length ? (
            saved.map((place) => (
              <View key={place.id} style={styles.savedItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.savedTitle}>{place.name}</Text>
                  <Text style={styles.savedMeta}>{place.area} · {place.recommended_time}</Text>
                </View>
                <TouchableOpacity onPress={() => setSaved((items) => items.filter((item) => item.id !== place.id))}>
                  <Text style={styles.removeText}>移除</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={styles.emptyLine}>右滑喜欢的地点会出现在这里。</Text>
          )}
        </View>

        <View style={styles.planPanel}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>雨天 Plan B</Text>
            <TouchableOpacity
              onPress={() => openUrl(whatsappUrl(["KL 雨天带娃 Plan B：", ...rainPlan.map((place, idx) => `${idx + 1}. ${place.name}\n避坑：${pitfallText(place)}\nWaze：${wazeUrl(place)}`)].join("\n\n")))}
              style={styles.outlineButton}
            >
              <Text style={styles.outlineText}>分享</Text>
            </TouchableOpacity>
          </View>
          {rainPlan.map((place) => (
            <View key={place.id} style={styles.planItem}>
              <Text style={styles.savedTitle}>{place.name}</Text>
              <Text style={styles.savedMeta}>{place.summary}</Text>
              <Text style={styles.pitfall}>{pitfallText(place)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.eventsPanel}>
          <Text style={styles.sectionTitle}>实时活动</Text>
          {liveEvents.map((event) => (
            <View key={`${event.title}-${event.date_text}`} style={styles.eventItem}>
              <Text style={styles.eventStatus}>{event.status === "ongoing" ? "进行中" : "即将开始"}</Text>
              <Text style={styles.savedTitle}>{event.title}</Text>
              <Text style={styles.savedMeta}>{event.date_text || "日期待确认"} · {event.venue || "地点待确认"}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <ActionButton label="撤回" disabled={!history.length} onPress={undo} />
        <ActionButton label="不适合" variant="skip" disabled={!current} onPress={() => advance("skip")} />
        <ActionButton label="想去" variant="save" disabled={!current} onPress={() => advance("save")} />
        <ActionButton label="Waze" disabled={!current} onPress={() => current && openUrl(wazeUrl(current))} />
        <ActionButton label="Google" disabled={!current} onPress={() => current && openUrl(googleMapsUrl(current))} />
        <ActionButton label="分享" disabled={!current} onPress={() => current && openUrl(whatsappUrl(shareText(current)))} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f7f3ea",
  },
  content: {
    padding: 16,
    paddingBottom: 188,
  },
  hero: {
    padding: 22,
    borderRadius: 18,
    backgroundColor: "#fffaf0",
    borderWidth: 1,
    borderColor: "#eadfce",
  },
  kicker: {
    color: "#1f7a4f",
    fontWeight: "900",
    marginBottom: 8,
  },
  title: {
    color: "#2a241f",
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 38,
    marginBottom: 12,
  },
  intro: {
    color: "#65594d",
    fontSize: 16,
    lineHeight: 24,
  },
  filterScroller: {
    marginVertical: 14,
  },
  chip: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d9dfd8",
    backgroundColor: "#fff",
    justifyContent: "center",
    marginRight: 8,
  },
  chipActive: {
    borderColor: "#1f7a4f",
    backgroundColor: "#1f7a4f",
  },
  chipText: {
    color: "#3f4c47",
    fontWeight: "800",
  },
  chipTextActive: {
    color: "#fff",
  },
  deckHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionKicker: {
    color: "#d96b5f",
    fontWeight: "900",
    marginBottom: 4,
  },
  sectionTitle: {
    color: "#2a241f",
    fontSize: 20,
    fontWeight: "900",
  },
  progress: {
    color: "#1f7a4f",
    backgroundColor: "#e4f0ea",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontWeight: "900",
  },
  card: {
    minHeight: 590,
    borderRadius: 22,
    backgroundColor: "#fff",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#d9dfd8",
    shadowColor: "#182620",
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 5,
  },
  imageBlock: {
    height: 180,
    padding: 16,
    backgroundColor: "#dceee5",
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#fff",
    color: "#1f7a4f",
    fontWeight: "900",
  },
  cardBody: {
    padding: 18,
  },
  area: {
    color: "#1f7a4f",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 8,
  },
  cardTitle: {
    color: "#2a241f",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 32,
    marginBottom: 10,
  },
  summary: {
    color: "#514940",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 23,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
    gap: 8,
  },
  tag: {
    color: "#1f7a4f",
    backgroundColor: "#f0f4f2",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 6,
    fontWeight: "800",
  },
  scoreRow: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 14,
  },
  scoreBox: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#f8faf8",
  },
  scoreLabel: {
    color: "#66736e",
    fontSize: 12,
    marginBottom: 4,
  },
  scoreValue: {
    color: "#1f7a4f",
    fontSize: 18,
    fontWeight: "900",
  },
  decisionBox: {
    gap: 6,
  },
  decisionTitle: {
    color: "#2a241f",
    fontWeight: "900",
  },
  decisionCopy: {
    color: "#66736e",
    lineHeight: 21,
    marginBottom: 4,
  },
  emptyCard: {
    minHeight: 420,
    borderRadius: 22,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d9dfd8",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 8,
  },
  emptyCopy: {
    color: "#66736e",
    textAlign: "center",
    lineHeight: 22,
  },
  feedback: {
    alignSelf: "center",
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: "hidden",
    color: "#fff",
    backgroundColor: "#1f7a4f",
    fontWeight: "900",
  },
  savedPanel: {
    marginTop: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d9dfd8",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  shareButton: {
    backgroundColor: "#1f7a4f",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  shareText: {
    color: "#fff",
    fontWeight: "900",
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: "#315d8c",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  outlineText: {
    color: "#315d8c",
    fontWeight: "900",
  },
  savedItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#edf1ed",
  },
  savedTitle: {
    color: "#2a241f",
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 4,
  },
  savedMeta: {
    color: "#66736e",
    lineHeight: 21,
  },
  removeText: {
    color: "#d96b5f",
    fontWeight: "900",
  },
  emptyLine: {
    color: "#66736e",
    lineHeight: 22,
  },
  planPanel: {
    marginTop: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d9dfd8",
  },
  planItem: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#edf1ed",
  },
  pitfall: {
    color: "#514940",
    fontWeight: "800",
    lineHeight: 21,
    marginTop: 6,
  },
  eventsPanel: {
    marginTop: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d9dfd8",
  },
  eventItem: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#edf1ed",
  },
  eventStatus: {
    alignSelf: "flex-start",
    color: "#1f7a4f",
    backgroundColor: "#e4f0ea",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontWeight: "900",
    marginBottom: 8,
  },
  footer: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 10,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderWidth: 1,
    borderColor: "#d9dfd8",
  },
  actionButton: {
    width: "31.5%",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d9dfd8",
    backgroundColor: "#fff",
  },
  action_skip: {
    borderColor: "#d96b5f",
  },
  action_save: {
    borderColor: "#1f7a4f",
    backgroundColor: "#1f7a4f",
  },
  actionText: {
    color: "#2a241f",
    fontWeight: "900",
    fontSize: 12,
  },
  actionTextSave: {
    color: "#fff",
  },
  disabled: {
    opacity: 0.45,
  },
});
