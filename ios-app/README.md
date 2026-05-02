# 带娃去哪儿 KL iOS MVP

这是第一版 iOS App 源码，基于 Expo / React Native。它把当前 Web MVP 的核心体验迁移到了手机端：

- 左右滑动选择亲子地点，右滑加入本周末清单，左滑跳过
- 支持撤回、快速筛选、雨天 Plan B、实时活动列表
- 中文家庭视角：年龄适配、可玩时长、家长轻松度、停车/预约/避坑判断
- 可直接打开 Waze、Google Maps，并通过 WhatsApp 分享单个地点或清单

## 本地运行

```bash
cd "/Users/chenqiang/Documents/New project/ios-app"
npm install
npx expo start
```

然后用 iPhone 安装 Expo Go，扫码打开即可。

## 打包说明

当前机器只有 Xcode Command Line Tools，没有完整 Xcode，因此不能在本机直接生成 iOS 安装包或 App Store 包。后续正式打包需要：

- 安装完整 Xcode
- 准备 Apple Developer 账号
- 配置 bundle identifier、证书和描述文件
- 使用 EAS Build 或 Xcode 生成 TestFlight / App Store 包
