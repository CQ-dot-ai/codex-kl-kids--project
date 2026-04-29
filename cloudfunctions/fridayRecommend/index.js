const cloud = require("wx-server-sdk");
const https = require("https");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const TEMPLATE_ID = process.env.FRIDAY_TEMPLATE_ID || "REPLACE_WITH_WECHAT_SUBSCRIBE_TEMPLATE_ID";
const KL = { latitude: 3.139, longitude: 101.6869 };

const places = [
  { name: "Petrosains", area: "KLCC", indoor: 5, ease: 5, kid: 5, time: "3-4 小时", note: "雨天稳，商场吃饭撤退方便" },
  { name: "Aquaria KLCC", area: "KLCC", indoor: 5, ease: 5, kid: 4, time: "1.5-2.5 小时", note: "低龄友好，节奏可控" },
  { name: "KidZania", area: "Mutiara Damansara", indoor: 5, ease: 4, kid: 5, time: "4-6 小时", note: "5-12 岁优先，早到更省心" },
  { name: "SuperPark", area: "Avenue K", indoor: 5, ease: 4, kid: 5, time: "2-3 小时", note: "放电效率高，地铁方便" },
  { name: "Farm In The City", area: "Seri Kembangan", indoor: 1, ease: 3, kid: 5, time: "2.5-4 小时", note: "适合晴天上午，建议开车" }
];

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

async function getWeatherSignal() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${KL.latitude}&longitude=${KL.longitude}&daily=precipitation_probability_max,temperature_2m_max&timezone=Asia%2FSingapore&forecast_days=3`;
  const data = await requestJson(url);
  const rain = Math.max(...(data.daily && data.daily.precipitation_probability_max ? data.daily.precipitation_probability_max : [0]));
  const heat = Math.max(...(data.daily && data.daily.temperature_2m_max ? data.daily.temperature_2m_max : [30]));
  return {
    rain,
    heat,
    text: rain >= 50 ? "周末可能有雨，优先室内" : heat >= 33 ? "天气偏热，优先空调场" : "天气尚可，室内户外都能看"
  };
}

function choosePlace(weather) {
  return places
    .map((place) => {
      const weatherScore = weather.rain >= 50 || weather.heat >= 33 ? place.indoor * 2 : place.indoor;
      return { ...place, score: place.ease * 2 + place.kid + weatherScore };
    })
    .sort((a, b) => b.score - a.score)[0];
}

async function sendToSubscriber(openid, place, weather) {
  if (!TEMPLATE_ID || TEMPLATE_ID.includes("REPLACE_WITH")) {
    return { skipped: true, reason: "missing template id" };
  }

  return cloud.openapi.subscribeMessage.send({
    touser: openid,
    templateId: TEMPLATE_ID,
    page: "pages/index/index",
    data: {
      thing1: { value: place.name },
      thing2: { value: weather.text },
      thing3: { value: `${place.area}，${place.time}` },
      thing4: { value: place.note }
    }
  });
}

exports.main = async () => {
  const db = cloud.database();
  const weather = await getWeatherSignal();
  const place = choosePlace(weather);
  const subscribers = await db.collection("friday_subscribers").where({ enabled: true }).get();
  const results = [];

  for (const subscriber of subscribers.data) {
    const openid = subscriber.openid || subscriber._openid;
    if (!openid) continue;
    try {
      results.push(await sendToSubscriber(openid, place, weather));
    } catch (error) {
      results.push({ openid, error: error.message });
    }
  }

  return {
    weather,
    recommendation: place,
    sent: results.length,
    results
  };
};
