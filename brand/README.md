# Weft（七襄）· 品牌与 TUI 规范

> 产品名：**Weft**（/weft/，中文：**七襄**）  
> 架构代号：**Trident**（三叉戟架构，内部继续使用）  
> 一句话：**三线成纬，七襄成章。**  
> 英文 tagline：**Weave the three. Run as one.**

---

## 1. 为什么叫 Weft

织布时，**经线（warp）**是绷紧的纵线，**纬线（weft）**是横穿其间、把经线织成布的那根线。

- 三条经线：**Codex**（执行与权限）、**Claude**（长程规划）、**DSH**（事件内核与缓存）。
- 一根纬线：**Weft**——把三者织成一个可运行 Agent 的那一层。
- 中文名 **“七襄”**：取自《诗经·小雅·大东》“跂彼织女，终日七襄”，是织女终日织作；既承接 Weft 的织造动作，也比单字“纬”更适合做产品名。
- “纬”仍保留在“纬线”“三线成纬”里，作为织造术语，不再作为产品名。

不叫“Fusion / Nexus / Loom / Trident”的原因：

- **Fusion / Nexus / Loom** 已被大量产品使用，且不能表达“横向穿过、把多条线织在一起”的动作。
- **Trident** 保留为架构代号：三叉戟描述“三条能力主线”，但不像产品名；Weft 描述“如何织在一起”。

---

## 2. 主题色：Weft Cyan / 纬青

**Primary：** #22D3EE（Weft Cyan，纬青）

| Token | Hex | 用途 |
|---|---|---|
| --weft-cyan | #22D3EE | 品牌主色、logo、活动态、光标、关键数字 |
| --weft-cyan-bright | #67E8F9 | hover / focus / 高亮 |
| --weft-cyan-dim | #0E7490 | 边框、次级强调、进度条底色 |
| --weft-bg | #0B1220 | TUI 背景 |
| --weft-panel | #0F172A | 面板/盒子背景 |
| --weft-text | #E6EDF3 | 主文本 |
| --weft-muted | #8B98A9 | 次级文本、提示 |
| --weft-border | #1E293B | 分隔线、非活动边框 |
| --weft-success | #5EEAD4 | 成功（留在青绿家族，避免用 OpenAI 绿） |
| --weft-warning | #FBBF24 | 警告 |
| --weft-error | #FB7185 | 错误（不用 Claude 珊瑚橙） |

### 为什么不是这几个既存项目的颜色

| 项目 | 常见品牌色 | 与 Weft 的关系 |
|---|---|---|
| Claude / Anthropic | 珊瑚橙 #D97757 系 | Weft 用青，色相约 187°，避开暖橙 |
| Codex / OpenAI | 绿 #10A37F + 黑/白 | Weft 更偏青、更亮；不共用“绿色=OpenAI”的联想 |
| DSH / DeepSeek | 蓝 #4D6BFE 系 | Weft 是青，色相约 187° vs 230°，区分明显 |
| Hermes / Nous | 黑/金/紫系 | Weft 不用金、不用紫，避免与 Hermes 的“黑金/紫”重叠 |

> 结论：**青是这四家都没有作为主色使用的区间**；同时青在深色终端上对比度高、长时间看不刺眼。

### ANSI

- Truecolor：ESC[38;2;34;211;238m（#22D3EE）
- 256 色近似：ESC[38;5;45m
- 无颜色环境（NO_COLOR）：只保留字形与框线，不降级成别的颜色。

---

## 3. TUI 模板（照 Claude 的信息层级，不照抄视觉）

Claude Code 的启动屏信息层级值得借鉴：

1. 大 logo + 版本；
2. 圆角 welcome box（/help、cwd、model）；
3. 一条 tip；
4. 输入 prompt；
5. 底部状态行。

Weft 沿用这个层级，但做三处区分：

- **符号**：用 ≡（三线/编织）而不是 Claude 的 ✻；
- **主色**：Weft Cyan，而不是珊瑚橙；
- **信息**：welcome box 里固定显示 **sandbox / approvals**，把“权限顺畅”做成品牌的一部分。

~~~text
  ██╗    ██╗███████╗███████╗████████╗
  ██║    ██║██╔════╝██╔════╝╚══██╔══╝
  ██║ █╗ ██║█████╗  █████╗     ██║
  ██║███╗██║██╔══╝  ██╔══╝     ██║
  ╚███╔███╔╝███████╗██║        ██║
   ╚══╝╚══╝ ╚══════╝╚═╝        ╚═╝

  ≡ WEFT   七襄   v2.5.0   ·   三线成纬，七襄成章

  ╭──────────────────────────────────────────────────────────────╮
  │  ≡  Welcome to Weft!                                        │
  │                                                              │
  │  /help for help     /status for runtime     /plan to start   │
  │                                                              │
  │  cwd       D:\dsh_env\workspaces\codex_claude_dsh_comb_mod   │
  │  model     deepseek-flash  ·  deepseek                       │
  │  sandbox   workspace-write  ·  approvals ask                 │
  ╰──────────────────────────────────────────────────────────────╯

  ※ Tip  计划先落盘，执行先沙箱；缓存靠前缀，记忆靠评估。

  > 把 01-codex / 02-claude / 03-dsh 综合成 M0 实现计划
    █

  ⏺ weft v2.5.0    workspace-write    approvals ask    cache —    0 tok
~~~

### 版式规则

- 内容宽度：**120 列**；welcome box 内宽 **62–66 列**。
- logo 最小宽度：**60 列**；窄于 80 列时切换为单行 “≡ WEFT”。
- 中文只出现在 tagline / tip；box 内保持 ASCII 键值，避免 CJK 宽度破坏对齐。
- 主色只用于：logo、≡、Welcome、光标、状态行的 ⏺、关键数字。不要整屏染色。
- 错误用 #FB7185，警告用 #FBBF24；不要用主色表示错误，避免“青色=正常”被破坏。

---

## 4. 资产

| 文件 | 用途 |
|---|---|
| tui-banner.mjs | 零依赖 ANSI 渲染器；可直接 node brand/tui-banner.mjs 看效果 |
| tui-preview.html | 视觉预览（1200×760，深色终端） |
| tui-preview.png | 预览截图（Pillow 渲染，2400×1520） |
| tui-preview.txt | `--plain` 纯文本样例（可直接贴进终端/文档） |
| render_preview.py | 无浏览器渲染脚本（Pillow + numpy） |
| README.md | 本文件：命名、色板、版式规范 |

### 运行

~~~bash
node brand/tui-banner.mjs            # 彩色
node brand/tui-banner.mjs --plain    # 纯文本（CI/日志）
NO_COLOR=1 node brand/tui-banner.mjs # 无颜色
~~~

### 接入真实 TUI

tui-banner.mjs 导出 renderBanner(options)，返回字符串；接入时把 options 换成运行时值：

~~~js
import { renderBanner } from './tui-banner.mjs'
console.log(renderBanner({
  version: '2.5.0',
  cwd: process.cwd(),
  model: 'deepseek-flash',
  provider: 'deepseek',
  sandbox: 'workspace-write',
  approvals: 'ask',
}))
~~~

> 如果 TUI 是 React/Ink，把返回的字符串按行放进 Text 组件即可；ANSI 已在字符串里，Ink 会原样透传。若使用 Web/Electron，请改用 tui-preview.html 的 CSS token，而不是把 ANSI 塞进 DOM。
