# KL 亲子周末雷达微信小程序

这是一个面向微信使用和分享的 Kuala Lumpur 带娃去处第一版产品。重点不是做普通榜单，而是帮助家长快速判断：

- 适合几岁孩子
- 带娃轻易度，也就是对家长是否友好
- 建议玩多久
- 更适合开车、Grab 还是地铁
- 雨天、炎热天气是否稳定
- 当前是否有适合带娃参加的活动

## 小程序功能

- 亲子地点卡片：轻易度、孩子吸引力、建议时长、交通建议、家长提示
- 筛选：年龄、出行方式、天气、时长
- 今日推荐：按筛选后的综合分自动给出
- 微信分享：页面右上角和页面内按钮都可分享
- 地图操作：可直接打开微信地图，也可复制 Waze / Google Maps 导航链接
- 周五提醒：前端已接入订阅消息授权，云函数骨架可在每周五晚 8 点按天气推送推荐
- 活动区：默认使用本地活动；配置线上 API 后可通过 `wx.request` 同步
- 来源链接：小程序内复制来源链接，家长可粘贴到浏览器查看详情

## 微信开发者工具打开方式

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择 `/Users/chenqiang/Documents/New project`。
4. AppID 先使用测试号或替换 [project.config.json](/Users/chenqiang/Documents/New%20project/project.config.json) 里的 `appid`。
5. `miniprogramRoot` 已配置为 `miniprogram/`。

## 数据文件

- [miniprogram/data/places.js](/Users/chenqiang/Documents/New%20project/miniprogram/data/places.js)：小程序亲子地点
- [miniprogram/data/events.js](/Users/chenqiang/Documents/New%20project/miniprogram/data/events.js)：小程序活动数据
- [miniprogram/pages/index/index.js](/Users/chenqiang/Documents/New%20project/miniprogram/pages/index/index.js)：小程序首页逻辑
- [miniprogram/pages/index/index.wxml](/Users/chenqiang/Documents/New%20project/miniprogram/pages/index/index.wxml)：小程序首页结构
- [miniprogram/pages/index/index.wxss](/Users/chenqiang/Documents/New%20project/miniprogram/pages/index/index.wxss)：小程序首页样式
- [data/kids_places.json](/Users/chenqiang/Documents/New%20project/data/kids_places.json)：亲子地点
- [data/live_events.json](/Users/chenqiang/Documents/New%20project/data/live_events.json)：同步活动
- [assistant.py](/Users/chenqiang/Documents/New%20project/assistant.py)：本地服务和活动同步
- [static/index.html](/Users/chenqiang/Documents/New%20project/static/index.html)：页面结构
- [static/app.js](/Users/chenqiang/Documents/New%20project/static/app.js)：筛选和渲染
- [static/styles.css](/Users/chenqiang/Documents/New%20project/static/styles.css)：界面样式

## 活动同步

小程序不能直接访问本机 `127.0.0.1` 给真实用户使用，所以第一版默认离线可用。

如果后续部署线上 API：

1. 把 [assistant.py](/Users/chenqiang/Documents/New%20project/assistant.py) 的活动接口部署到 HTTPS 域名。
2. 在微信公众平台配置 request 合法域名。
3. 在 [miniprogram/app.js](/Users/chenqiang/Documents/New%20project/miniprogram/app.js) 设置：

```js
App({
  globalData: {
    apiBase: "https://your-domain.com"
  }
});
```

本地网页预览仍可运行：

```bash
python3 assistant.py --serve
```

然后打开：

```text
http://127.0.0.1:8000
```

## 周五自动推荐

小程序端只能让用户主动授权订阅消息；真正“每周五晚上自动推送”需要云函数或服务端定时任务。

已提供云函数骨架：

- [cloudfunctions/fridayRecommend/index.js](/Users/chenqiang/Documents/New%20project/cloudfunctions/fridayRecommend/index.js)
- [cloudfunctions/fridayRecommend/config.json](/Users/chenqiang/Documents/New%20project/cloudfunctions/fridayRecommend/config.json)

上线前需要完成：

- 在微信公众平台申请订阅消息模板，替换 [miniprogram/config.js](/Users/chenqiang/Documents/New%20project/miniprogram/config.js) 的 `fridayTemplateId`
- 开通云开发环境，填写 `cloudEnv`
- 上传并部署 `fridayRecommend` 云函数
- 云数据库创建 `friday_subscribers` 集合
- 根据最终模板字段，调整云函数里的 `thing1`、`thing2`、`thing3`、`thing4`

如需其他端口：

```bash
python3 assistant.py --serve --port 8010
```

## 第一版数据来源

- Klook 2026 KL kids activities guide
- Klook KL indoor playgrounds guide
- Little Steps KL family events and kids activities
- Makchic April 2026 things to do

同步功能依赖公开网页结构，抓到的活动会标记为“公开活动源同步结果”。出发或报名之前仍应打开来源确认日期、名额和票价。
