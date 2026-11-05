# PWA Shell

> v2.5 baseline：Surface 可安装为 PWA；不是原生 Desktop 壳。

## 路由

- GET /manifest.webmanifest
- GET /sw.js
- GET /icon.svg

## Surface

- manifest link
- theme-color
- service worker 注册
- standalone 显示
- 离线 shell 缓存（/、manifest、icon）

## 验证

- manifest display=standalone
- icon content-type
- sw JS
- Surface 包含 manifest link
- 147 tests pass

## 未完成

- 原生窗口/托盘
- 系统通知
- 自动更新 UI
- 离线消息队列
