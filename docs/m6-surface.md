# M6 Web Surface（v2.0 draft）

> 状态：M6-A 自包含 Web Surface 已实现；Marketplace/BYOM/RBAC/Bench 未做。

## 1. 已实现

- src/core/surface.ts
  - 单个自包含 HTML/CSS/JS，无前端构建链
- Gateway GET / 返回 Surface
- UI：
  - Thread 列表
  - 新建 Thread
  - 查看历史事件
  - SSE 实时接收 message.user / agent.result
  - 发送消息
- CLI：
  - weft --serve --port 4780
  - 浏览器打开 http://127.0.0.1:4780

## 2. 设计

- Surface 不引入第二套 API；只调用 Gateway。
- 不保存本地业务状态；Thread/Event 仍由 RuntimeStore 持久化。
- 单文件便于无 Node 构建环境下部署/演示。

## 3. 测试

- GET / 返回 text/html
- 包含 Thread/EventSource
- 106 tests pass

## 4. 限制

- 还没有登录 UI/RBAC
- 没有 Capability Marketplace
- 没有 BYOM 配置页
- 没有 Desktop 壳
- 没有多租户切换
