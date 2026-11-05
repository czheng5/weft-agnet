# Unified Workboard

> 概念来源：天禧 AI 的统一任务面板/跨端任务接力；Weft 只取项目管理与交互概念，不复制其云服务。

## API

- GET /workboard
- POST /threads 支持：
  - priority: low/normal/high/critical
  - owner
  - dueAt（epoch ms）
  - labels

## 投影字段

- thread
- progress
- messageCount
- lastEventAt
- overdue

## 原则

- ThreadStore/EventLog 是唯一事实源
- Workboard 是投影，不建第二任务表
- 按 priority → dueAt → updatedAt 排序
- tenant scope 隔离
- 逾期只在未完成时计算

## 测试

- priority/due/overdue/progress
- summary 聚合
- Gateway POST metadata + GET /workboard
- 144 tests pass
