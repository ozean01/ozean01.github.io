# AGENTS.md · 给 AI 协作者的项目地图

> 本文件是 `外贸英语/` 仓库的「AI 协作者入口」。目标是让一次扩展不必先通读 1595 行的 README，
> 也不会漏掉音标口径、PRECACHE、存储键登记、AI 披露这些**一漏就红门禁**的固定动作。
> 详细来历与批次记录仍看 `README.md`（工程口径）与 `CHANGELOG.md`（给用户的变化）。

## 1. 这个仓库是什么

软包装外贸英语学习站：**纯静态单页应用**，零构建、零 npm 依赖、零后端。
19 个课程单元 / 798 词 / 174 短语 / 47 段对话 + 27 步外贸实操 SOP + AI 对练。
产物就是 `index.html` + `js/` + `css/`，`python -m http.server 8000` 或 GitHub Pages / Cloudflare Pages 即可跑；
PWA 离线可用（`sw.js` 手写 sw，无 Workbox）。

**先跑一次基线**（在仓库根目录）：

```bash
node tools/test-all.js        # 全部门禁；必须 exit 0
node tools/prepush-check.js   # 发布前：工作区干净 + CACHE 已升版 + 基线一致（会要求先提交）
```

## 2. 五条铁律（改任何代码前先读）

1. **零构建**：不引入构建工具、npm 运行时依赖、框架、CDN 兜底。新功能直接写进 `js/` + `index.html`。
2. **导航只减不增**：一级项 6 个 / 入口 18 个是棘轮（`test-home` / `test-ia-firstscreen` 守着）。
   新功能默认挂在既有页面内，不新增导航、不新增路由；确需新页面要同时改 README 与棘轮常量并说明理由。
3. **不搬运版权内容**：外部材料只做「目录引用 + 外链」，不下载、不再分发（杂志、音频、课程、竞品页面都一样）。
4. **口径诚实**：AI 输出必须接披露出口；AI 参与的要留痕；能力证据只认产出锚点（写作 / SOP / 四维），
   自评、打卡、AI 生成题都不算能力。不确定的行业事实一律标「请人工核对」。
5. **单一实现**：评分走 `js/score.js`，LLM 传输走 `js/llm.js`，存储键必须登记 `js/storage-keys.js`，
   课程数据只从 `js/data*.js` 来，进度口径只从 `window.FTE_BOOT` 取（不要在模块里另写一套）。

## 3. 目录地图

| 路径 | 作用 |
|---|---|
| `index.html` | 启动骨架、CSP、脚本加载顺序（顺序即依赖）、导航 |
| `js/pwa-init.js` | **版本号唯一来源** `window.FTE_VERSION`；UA/环境判定；SW 注册 |
| `js/app.js` | 路由、页面渲染、`window.FTE_BOOT`（进度/统计/单价的唯一出口） |
| `js/data*.js` | 课程数据（单一数据源；`data-mistakes` / `data-mnemonic` 是易错点与助记，不进单元结构） |
| `js/quiz.js` | 测验引擎 `window.Quiz` + AI 周测/材料理解题 `window.QuizAI`（P20） |
| `js/tutor.js` | AI 对练；**`FACT_GUARD` 与 `window.AIDisclosure` 的唯一来源**；`callChat` |
| `js/material.js` | 素材投料口（拆句 → 送进四个引擎；AI 理解题挂载点） |
| `js/llm.js` | 全站唯一的 chat/completions 传输层 |
| `sw.js` | PRECACHE 清单 + `CACHE` 版本号（改动预缓存文件必须 +1） |
| `tools/` | 全部门禁（`test-*.js` / `audit-*.js` / `check-*.js`）与 `test-all.js` |
| `docs/` | 性能基线、可用性脚本、复听评估等记录 |

## 4. 典型任务清单

### 4.1 新增一个课程单元（U20）

1. 在对应 `js/data-*.js` 里 push 单元对象（`{id, title, vocab[], phrases[], dialogues[], tips[]}`），
   `id` 递增、`title` 不与现有重复；词汇带 `w/cn/ipa/pos/ex/exCn`，音标统一**美式 GA**
   （r 不写 ɹ、ɑː 不写 ɒ、oʊ 不写 əʊ；多音节标重音、单音节不标）。
2. 需要新数据文件时：`index.html` 加 `<script>`（放在 `data.js` 之后、`app.js` 之前）+
   `sw.js` 的 PRECACHE 加条目 + `tools/lib-data.js` 的 `FILES` 加文件名（若参与单元结构）。
3. 同步声明：`tools/audit-count.js`、`tools/lib-data.js`、`js/outcomes.js`（单元出口断言，19/19 覆盖 + 锚点唯一）。
4. README 的站点总量数字由 `tools/test-doc-numbers.js` 逐处对账，**改数据就要改 README**。
5. 跑 `node tools/test-all.js`，再手动打开页面看单元卡、词汇、对话、测验是否都通。

### 4.2 新增一个页面 / 一个页内区块

- 页内区块（推荐）：挂在既有页面，用 `data-action` + 事件委托，不新增导航与路由。
- 新页面：`index.html` 加脚本 → `js/app.js` 的 `parseHash` 白名单 + `renderRoute` 分支 + 面包屑 →
  若要进导航，必须同步 README 的「共 N 个入口」并调整 `test-ia-firstscreen` 棘轮（一般不允许）。
- 触控目标 ≥44×44、键盘可操作、`aria-*` 语义；新颜色走 `css/style.css` 的 token，
  `test-ui-quality` 会现场计算浅色/暗色对比度。

### 4.3 新增一个 AI 功能（P20 的写法可直接照抄）

1. **提示词在被调用的文件里组装**，system 末尾**无条件**追加 `window.Tutor.FACT_GUARD`
   （未加载时用逐字等价的降级副本，见 `js/urgent.js` / `js/quiz.js`）。
2. 调用走 `window.Tutor.callChat(messages, opts?)`（`opts` 只覆盖 temperature / maxTokens，
   默认必须保持 0.7 / 600）；不要自己 `fetch`，不要复制传输层。
3. 消息数组**先组装再调用**——`tools/test-ai-prompt-inventory.js` 会从调用点往回 40 行找 `role: "system"`。
4. 渲染 AI 输出的函数必须调 `AIDisclosure.html()` / `.text()`（门禁按函数名基线断言）。
5. 更新 `tools/test-ai-prompt-inventory.js`：`RENDER_POINTS` 加一条、`BASELINE.calls` 用
   `node tools/test-ai-prompt-inventory.js --dump-baseline` 重新生成后贴回。
6. 口径：AI 生成/改写的产物计入「练习」，不写盘除非登记存储键；涉及术语/数值必须提示人工核对；
   在页面文案里写明「不计成绩 / 不作能力证据」。
7. 材料类用户输入用 `window.Tutor.wrapUserContent()` 包起来（提示词注入面）。

### 4.4 新增一个存储键

1. `js/storage-keys.js` 登记 `{ key, kind, owner, backup, note }`；`backup:false` 的键不进导出，
   凭据放 `secretKeys` / `secretFields`。
2. `tools/test-security.js` 会把代码里出现的键字面量和注册表逐一对账——没登记直接红。
3. 导出/导入会按注册表自动覆盖，不要手改 `js/export.js` 的清单。

### 4.5 修改预缓存内的文件（`js/*.js` / `css/*.css` / `index.html` 等）

按顺序做，顺序不能反：

1. 改内容；
2. `sw.js` 的 `CACHE` 数字 +1（`fte-v134` → `fte-v135`），PRECACHE 清单若变化也同步增删；
3. `tools/precache-baseline.json` 的 `cache` / `minVersion` 同步（清单集合变了才需要改 `sha256` / `count`）；
4. `js/pwa-init.js` 的 `FTE_VERSION` 与 `package.json` 的 `version` **逐字一致**地升；
5. `README.md`（若数字/功能变了）与 `CHANGELOG.md`（给用户的变化）同步；
6. `node tools/test-all.js` 全绿 → `git add -A` → 单一原子提交 → `node tools/prepush-check.js` 干净 → push。

## 5. 门禁地图（`node tools/test-all.js` 里最关键的那些）

| 门禁 | 管什么 |
|---|---|
| `test-boot.js` | 全部脚本按序执行、`_need()` 声明的模块全局就绪 |
| `test-security.js` | 转义 / CSP / 存储键登记 / 备份覆盖 / 凭据不外泄 |
| `test-ai-prompt-inventory.js` | AI 调用点与渲染点清单、FACT_GUARD 覆盖、披露出口、termCheck 默认 true |
| `test-ai-eval-cases.js` | 83 条红队用例的 anchor 与 11 条链路提示词不漂移 |
| `test-honesty.js` | 能力证据 / 快照 / 样本门 / 复测可比性等诚实口径 |
| `test-doc-numbers.js` | README 的站点总量数字逐处与实测一致 |
| `test-budget.js` | 子资源数 / JS gzip 总量 / 最大单文件（棘轮只紧不松，抬高要写理由） |
| `test-ui-quality.js` | 触控目标、键盘/ARIA、暗色对比度、版本号单一来源 |
| `test-assets.js` / `check-tracked.js` | 引用资源存在 + 预缓存完整 + 被引用的脚本已被 git 跟踪 |
| `test-outcomes.js` / `test-p20.js` 等批次门禁 | 每批功能的验收不变量（照最新一批的写法新增） |

## 6. 测试怎么写（本仓库的风格）

- **零依赖、无网络、无 Key、无浏览器**：Node 直接跑；需要 DOM 就用最小桩
  （参考 `tools/smoke-p14-render.js`、`tools/test-p20.js`），不要装 jsdom。
- 断言「行为与口径」不只断言「字符串存在」：如「作答态不得出现正确答案」「只作练习不写盘」
  「换材料后旧题作废」「结果页必须接披露」。
- 新批次增加一个 `tools/test-<批次>.js` 并登记进 `tools/test-all.js`（`gate: true`）。

## 7. 文案与教学口径（容易踩的几条）

- 本站面向**中国软包装外贸从业者**：中文讲解、英文给可复用的商务表达；例句必须落在复膜胶/薄膜/油墨/单证/物流场景。
- 不发明指标、不夸大：「掌握」「母语级」「流利」这类词有既定口径（见 `SCORE-INTERPRETATION.md`）；
  「坚持（打卡）」与「能力（产出锚点）」永远分栏。
- 行业术语精确且高风险（thickness / sickness 这类听错会丢单）：不确定就标「请人工核对」并指向官方文本 / TDS / 报关行 / 银行。
- 已知取舍写在 README「已知取舍」：长列表分批渲染、`app.js` 体积、密集列表小图标 <44px 是刻意的。
