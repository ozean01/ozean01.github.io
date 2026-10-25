# 性能基线（批次 A · 2026-10-24）

> 工具：Lighthouse 11.7.1（headless Chrome，模拟节流）。基线明细以本文表格为准（原始 JSON 一次性产物不入库，复测命令：`npx lighthouse@11 https://ozean01.github.io/ --output=json --chrome-flags="--headless=new" --only-categories=performance,accessibility,best-practices,seo`）。

## 线上基线（https://ozean01.github.io/）

| 指标 | 基线值 |
|---|---|
| Performance | **50** |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |
| FCP | 3.5s |
| LCP | 3.5s |
| TBT | 160ms |
| **CLS** | **0.824（严重）** |
| Speed Index | 8.4s |
| 网络请求 | 57 个 / 传输 754KB（JS 696KB / 52 文件，CSS 41KB） |
| 主线程耗时 | 2.2s |

## 改进机会（Lighthouse 证据）

| 项 | 节省 | 说明 |
|---|---|---|
| 未压缩 JS | ~750ms / 143KiB | 零构建红线下的长期项：不做发布期压缩，靠「不加功能先减负」+ 预算门禁控制 |
| 未使用 JS | ~600ms / 124KiB | app.js 73KB、tutor.js 29KB、sop.js 21KB 首屏未用到——**按路由拆分是正解**（见施工图） |
| 未使用 CSS | ~300ms / 37KiB | 160KB 全站单文件；暂不动（回归风险 > 收益） |
| 服务器响应 | ~304ms | github.io 平台特性，不可控 |

## CLS 0.824 的根因与修复（本批已做）

- 根因：`#bootFallback` 启动骨架是**无样式裸 div**（约 100px 高）——慢网络下「骨架 → 今日页」整体替换发生在首屏视口内，全页被顶下去。
- 修复：骨架撑满首屏视口（`min-height:calc(100vh - 170px)` + 3 个脉冲占位块，`prefers-reduced-motion` 下静默），替换发生在折叠线以下。
- 验证：`test-budget.js` 钉住骨架载体与 CSS 不得移除；发布后用 Lighthouse 复测 CLS（预期 < 0.1）。

## 性能预算（棘轮上限，tools/test-budget.js）

| 上限 | 实测（2026-10-24） |
|---|---|
| 引用子资源 ≤ 55 | 53（52 脚本 + 1 样式表） |
| JS+CSS gzip 总量 ≤ 751KB | 735KB |
| 最大单文件 gzip ≤ 114KB | app.js 111KB |

规则：上限 = 实测 + 2% 余量，**只紧不松**；要抬高必须改常量并在 commit 说明理由。

## app.js 拆分施工图（下一会话执行）

试点：五阶段闯关块（app.js:3486-4460，约 900 行）。依赖注入清单（按引用计数）：

| 注入符号 | 引用次数 | 来源 |
|---|---|---|
| State | 103 | 闭包内可变共享对象 → `window.FTE_BOOT.State` 引用注入（flashcards 先例） |
| esc | 31 | TutorEnv.esc |
| Player | 31 | 全局 |
| progress | 29 | FTE_BOOT.progress（getter，引用注入） |
| toast | 20 | TutorEnv.toast |
| renderRoute | 10 | 需经 FTE_BOOT 暴露或回调注入 |
| saveProgress | 9 | FTE_BOOT.saveProgress |
| getUnit / drawWave / drawPitch / playDialogue / playLineOnly / setStage / evaluateSpeech / evalResultHtml / shadow* 等 | 各 2-4 | 同闭包函数 → 随块一起搬走或经 ctx 注入 |

步骤：① 把块整体移入 `js/speak-stages.js`，头接收 `init(ctx)`（ctx = { State, progress, esc, toast, saveProgress, renderRoute, getUnit }）；② app.js 对应 renderRoute 分支改为 `window.SpeakStages.render(...)`；③ `_need()` 校验 + index.html/PRECACHE 接线；④ npm test + 浏览器回归（闯关五阶段全流程 + 录音回放）。

## 下一步（未做，按优先级）

1. A4 拆分试点按施工图执行（本批仅交付分析——900 行 × 16 符号的重构值得一个独立会话）；
2. 路由分包减「未使用 JS」（LH 124KiB）；
3. 发布后线上复测 CLS 与 Performance，更新本文基线表。
