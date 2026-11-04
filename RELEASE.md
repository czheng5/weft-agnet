# Weft Release Discipline

> 目标：每个版本都能复现、可审计、可回滚；不把敏感信息或无关文件带进仓库。

## 版本与阶段

| 阶段 | 版本 | 范围 |
|---|---|---|
| M0–M3 | v1.0 | 已完成 |
| M4 | v1.5 | Consolidation |
| M5 | v1.6 | Agent Gateway / Super-agent |
| M6 | v2.0 | Own Shape |

每个版本完成后必须：

1. 运行测试与对应验收
2. 更新 README、CHANGELOG、PROJECT_LOG
3. 执行敏感信息扫描
4. 通过受控方式 git push
5. 确认远程 CI 通过

## 发布前检查

- git status 干净，或只包含本次目标文件
- npm test 通过
- npm run demo / demo:v1 通过
- npm run acceptance:long 通过
- Linux 上 npm run conformance:bwrap 通过
- README 的安装/版本/验收表已更新
- CHANGELOG 有版本条目
- PROJECT_LOG 有提交/证据
- tag 与版本号一致

## 禁止提交

- .env、.env.*、API key、token、私钥、证书
- .weft/、.weft-data/、日志、临时文件
- node_modules/、dist/、coverage/
- 数据库、pgdata、backup
- report/evidence/、repos/
- 与本项目无关的截图、下载、实验数据
- 任何带真实用户/租户数据的文件

不要使用 git add -A 或 git add . 盲扫；按文件显式 add。  
提交前运行 git status，确认没有意外文件。

## 敏感信息扫描

至少检查：

- git ls-files 中是否有 .env / key / db / log
- git grep 是否出现 sk- / ghp_ / github_pat_ / AIza 形式
- 截图/日志是否包含 token、路径、用户数据

## Tag 与 Push

- v1.5 / v1.6 / v2.0 与 M4 / M5 / M6 对应
- tag 前确认 package.json version
- push 后验证远程 main 和 tag
- 不强制覆盖远程历史，除非有明确迁移说明
- 远程历史与本地历史不一致时，先记录差异，再修复

## README 责任

每个版本至少更新：

- 版本 badge
- 当前状态
- 安装/运行命令
- 验收证据表
- 已知限制
- 文档索引

## 回滚

- 代码回滚：tag/commit
- 数据回滚：迁移前备份；schema 兼容只读
- 配置回滚：版本化配置 + 旧版本可读
- 发布失败：保留证据，不删除失败记录
