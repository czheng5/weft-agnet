# 天禧 AI 调研与 Weft 项目管理/交互整合

> 调研时间：2026-11-04  
> 来源：联想官方/新华网/媒体公开报道（见文末）

## 1. 天禧 AI 的公开定位

联想天禧 AI 是面向 AI 原生设备的个人超级智能体，4.0 强调从“+AI”到“AI+”：

- 从被动副驾驶转向主动执行
- 复杂任务拆解与连续执行
- 个人知识库/长期记忆
- 端-边-云协同调度
- Skills 技能广场与开发者生态
- 多层隐私/安全防护

4.3 的办公/项目管理相关公开描述：

- 电脑、手机、平板三端任务接力
- 对话上下文、私有知识库、任务进度三端互通
- 统一任务面板：会议待办、手动计划、AI 生成任务集中展示
- 支持优先级、截止时间、责任人
- 本地/云端模式切换（超能模式/THCP），敏感任务可端侧运算
- TEE/芯片级加密保护

## 2. Weft 采用的概念

### 2.1 统一 Workboard

新增 [src/core/workboard.ts](../src/core/workboard.ts)：

- 按 Thread 聚合工作项
- 优先级：low/normal/high/critical
- owner
- dueAt / overdue
- progress
- message count / last event
- 按 priority + due + updated 排序

这不是第二套任务表：数据仍在 ThreadStore/EventLog，Workboard 只是投影。

### 2.2 Thread 项目管理字段

ThreadRecord 增加：

- priority
- owner
- dueAt
- labels

持久化到 SQLite/Postgres；migration 003。

### 2.3 Gateway Workboard

- GET /workboard
- POST /threads 接受 priority/owner/dueAt/labels

保持 scope 隔离和 RBAC。

### 2.4 可恢复/跨入口

Thread/Event 已经是 durable 的；Workboard 的 openThread 对应“继续原进度”，不是重新上传上下文。

### 2.5 离线/本地模式

- ObjectiveAnchor 的 offline 合同
- tool-discovery 自动扫描 EDA/PDK
- 不把“本机没装 EDA”当成永久产品限制

## 3. 不照搬的部分

- 不复制天禧的闭源端-边-云调度
- 不声称 TEE/芯片级安全（Weft 目前只有进程/沙箱/权限边界）
- 不做会议转录（Weft 的 KB/Memory 可接，但不是本次）
- 不做跨设备同步协议；当前 ThreadStore 可由共享 Postgres 实现，但设备身份/同步仍是后续
- 不把 Workboard 做成第二任务数据库

## 4. 后续可做

- Surface 直接显示 Workboard 分组/优先级/逾期
- 一键从 Workboard 恢复 Thread
- 任务 owner 分配与提醒
- 跨设备 SSO/同步
- 本地/云端模式开关接入 Gateway
- 项目级视图（projectId 聚合）

## 5. 来源

- 联想乐享知识库：天禧 AI 4.0 / Skills 苍穹计划  
  https://m.lenovo.com.cn/wiki/article-51811.html
- 新华网：联想发布天禧AI 4.0及多款全场景AI终端产品  
  http://www.xinhuanet.com/tech/20260520/3da28e856bf84e61a6e7de7fc89e9b35/c.html
- PCPOP：天禧 AI 4.3 办公闭环  
  https://www.pcpop.com/article/6955290.shtml
- 博客园：天禧 AI 4.3 多端任务协同  
  https://www.cnblogs.com/shdt/p/23333288
