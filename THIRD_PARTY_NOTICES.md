# 第三方组件与许可 · 清单（THIRD_PARTY_NOTICES）

> 状态：**P0 第四批 α 组（P0-10 版权与许可）新建，2026-10-10**；基线 `git rev-parse --short HEAD` = `0c0411b`
> 用途：集中列出本站**随仓库分发**或**运行时从 CDN 引入**的第三方组件，按「已核 / 未核 / 缺失 / 待决」四类如实记录。
>
> ⚠️ **本文件是事实清单，不是法律意见，也不表示本站"已合规"。**
> 凡标「待决」的条目，须由执业知识产权律师复核后才能定处置方案。
> 本文件刻意**不给**"合法""合规""可以放心用"这类结论。

**核验口径**

- 「已核」= 本次通过**一手来源**（上游仓库的许可文件 / 包自身 `package.json` 的 `license` 字段 / Debian 源码包的 `copyright`）读到许可声明，并在此附 URL；同时给出本机对**实际文件**的静态复核方式。
- 「未核」= 只有仓库内文档转述、或本次取不到上游原文。
- 本次核验环境：npmjs.com 返回 403、npm registry 与 raw.githubusercontent.com 直连失败，故 `.js` 产物类依赖改用 **jsDelivr 上的同名同版本 `package.json`**（`cdn.jsdelivr.net/npm/<pkg>@<ver>/package.json`）作为包元数据的一手来源；许可**正文**类文件改用 jsDelivr 的 GitHub 镜像（`cdn.jsdelivr.net/gh/<repo>@<ref>/<file>`）或 Debian 源码站。

---

## 一、随仓库分发（`git ls-files js/vendor` 实测跟踪三个文件）

### 1.1 `js/vendor/phonemizer.js` — 全句音标（eSpeak NG wasm）

| 项 | 内容 |
|---|---|
| 名称 | `@xenova/phonemizer` 一族构建产物，内含 **eSpeak NG** 引擎与语音数据 |
| 用途 | 「四维口语实战」参考句下方的「🔊 全句音标」；导出 `phonemize` / `list_voices` |
| 文件与体积 | `js/vendor/phonemizer.js`，**1,322,380 字节**，单行压缩（本次实测 `Get-Item .Length`） |
| 许可 | **含 GPL-3.0-or-later 组件（espeak-ng）**；本文件自身**不含**任何许可/版权文本 |
| 一手来源 | espeak-ng 上游 = **GPL-3.0-or-later**：[Debian 源码包 `espeak-ng 1.52.0+dfsg-5` 的 `debian/copyright`](https://sources.debian.org/src/espeak-ng/1.52.0%2Bdfsg-5/debian/copyright/)（原文："The rest of upstream sources are licensed under the following terms: This package is free software; you can redistribute it and/or modify it under the terms of the **GNU General Public License** as published by the Free Software Foundation; **either version 3 of the License, or (at your option) any later version.**"） |
| 包装层许可 | `@xenova/phonemizer` 自身的许可 **未核**：jsDelivr 上该包**不存在**（HTTP 404，P0-04 已实测），npmjs.com / npm registry 本次不可达。仓库旧文档曾标 Apache-2.0，**无一手来源支持**，本次已从 `js/vendor/README.md` 删除。 |
| 分发状态 | **是**（`git ls-files js/vendor` 含 `js/vendor/phonemizer.js`） |
| 署名义务 | **未满足**：本机静态复核——文件中 `Copyright` 命中 **0** 次、`General Public` 命中 **0** 次、`Apache` 命中 **0** 次；仅有的少量 `GNU`/`GPL` 字面命中位于 base64 编码的语音数据中间，不是许可文本。复现：`Select-String -Path js\vendor\phonemizer.js -Pattern 'Copyright','General Public','Apache'`。 |
| 证据强度 | **A**（对"文件内含 espeak-ng 与 `/usr/share/espeak-ng-data` 路径""无署名文本"两项是本机可复现的实测；对"espeak-ng = GPL-3.0-or-later"是一手许可文本） |

静态事实（复现方式）：

1. `Select-String -Path js\vendor\phonemizer.js -Pattern '/usr/share/espeak-ng-data'` → 命中（文件内 `FS_createPath` 建出 `/usr/share/espeak-ng-data`、`/lang`、`/voices` 等 100+ 条目录）。
2. `[regex]::Matches((Get-Content js\vendor\phonemizer.js -Raw),'espeak')` → **107** 命中；`eSpeak` → 37；另有运行期临时路径 `espeak-ng-ipa-tmp-*`。
3. 文件末尾 `export{Be as list_voices,ce as phonemize};` → 是 ESM 产物（`js/eval4.js` 用动态 `import()` 加载）。

> **待决**：本文件把 espeak-ng 编入同一产物，属**聚合**还是**演绎/组合作品**、本站**分发**触发哪些义务，须法律判断。处置选项见「四、待决事项」。

### 1.2 `js/vendor/vosk-worker.js` — 离线语音识别（vosk-browser）

> **2026-10-11 晚变更**：原先分发的是发行包 `js/vendor/vosk.js`（5,804,767 字节），
> 其中 **5,774,120 字符（99.5%）是一个 base64 字符串** —— 那是被打包进 blob Worker 的 Kaldi 引擎。
> 由于 blob Worker 继承文档 CSP，本站的严格 CSP 会让它在启动时抛 `EvalError` 并**静默死掉**
> （表现为"离线识别永远建不出来"）。现改为把这段 base64 载荷**逐字节还原**成同源 worker 文件
> `js/vendor/vosk-worker.js`，由 `js/asr-local.js` 直接驱动；发行包 `vosk.js` 已从仓库删除。

| 项 | 内容 |
|---|---|
| 名称 | `vosk-browser`（Kaldi wasm 的浏览器封装，含 `vosk-api`/Kaldi 侧组件与若干工具函数） |
| 用途 | 「发音设置 → 识别来源 → 优先本地识别」；`js/asr-local.js` 用同源 worker 文件 + 直接的消息协议驱动 |
| 文件与体积 | `js/vendor/vosk-worker.js`，**4,330,588 字节**（`vosk-worker.meta.json` 内有 sha256） |
| 与上游的关系 | 是 `vosk-browser@0.0.8` 发行包内 `createBase64WorkerFactory('…')` 那个 base64 参数的**逐字节 base64 解码结果**，未作任何源码改动；抽取脚本为 `tools/build-vosk-worker.js`（可复现、可 `--check` 校验） |
| 许可 | **Apache-2.0**（沿用上游；注意下列"未核"项） |
| 一手来源 | [jsDelivr `vosk-browser@0.0.8/package.json`](https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/package.json) 的 `"license": "Apache-2.0"`；产物 URL 为 `https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js`（由 `tools/build-vosk-worker.js` 钉死） |
| 分发状态 | **是**（`git ls-files` 跟踪 `js/vendor/vosk-worker.js` 与 `vosk-worker.meta.json`） |
| 署名义务 | **部分满足**：worker 内保留了原有第三方版权行——开头 `Copyright (c) Microsoft Corporation.` + 一段 ISC 式许可正文（Microsoft 的 `tslib` 头），以及 blueimp `JavaScript-MD5` 的 `Copyright 2011, Sebastian Tschan`（MIT）与 `Version 2.2 Copyright (C) Paul Johnston 1999 - 2009`（BSD）。**但文件内仍未见 `vosk-browser` 自身的 Apache-2.0 许可文本或 NOTICE。** |
| 证据强度 | 许可字段 **A**（`vosk-browser@0.0.8` 的 `package.json` 声明 Apache-2.0）；"本文件 = 该版本发行包内那段 base64 载荷" **B（可复核，但本机未复核）** —— 抽取脚本 `tools/build-vosk-worker.js` 钉死了产物 URL 与版本，`vosk-worker.meta.json` 记录了字节数与 sha256；只要目标机器能访问 jsDelivr，`node tools/build-vosk-worker.js --check` 就能自动判定是否与上游一致。⚠️ **本次加固的机器上 jsDelivr 不可达（`fetch failed`），所以"与上游逐字节一致"这一步在本环境没有真正跑过**，只有"从本机原先那份 `vosk.js`（其来源亦为该 URL，见旧记录）抽取"这一条链；请在有网机器上跑一次 `--check` 把它补成硬证据 |

**未核**：`vosk-worker.js` 内不含 `vosk-browser` 自身的版本标识；上游该包是否发布 `NOTICE` 文件仍未取得。

### 1.3 `js/vendor/README.md`

仓库自撰说明文档（非第三方代码），P0-10 后其许可口径已与 1.1/1.2 的实际文件对齐。

### 1.4 **未分发**：`models/`

`models/vosk-model-small-en-us-0.15/` 是 Kaldi 声学模型，**不随仓库分发**：`.gitignore` 含 `models/`，`git ls-files models` 无输出（本次实测）。该项不进入本清单的分发义务范围。

---

## 二、运行时从 CDN 引入（不进仓库；`index.html` 的 CSP 允许 `cdn.jsdelivr.net`）

> 以下均**不随仓库分发**，只在用户触发相应功能时从 jsDelivr 按 URL 里的版本号加载。

| 组件 | 版本（代码实测） | 引用点 | 许可 | 一手来源 | 核验 |
|---|---|---|---|---|---|
| `microsoft-cognitiveservices-speech-sdk`（Azure 音素级评测） | `1.52.0`（**已锁**） | `js/eval4.js` `SDK_CDN` | MIT | [`package.json`](https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk@1.52.0/package.json) `"license": "MIT"` | **已核 · A** |
| `@xenova/transformers`（音素模型运行时） | `2.17.2`（**已锁**） | `js/eval4.js` `TRANSFORMERS_URL` | Apache-2.0 | [`package.json`](https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/package.json) `"license": "Apache-2.0"` | **已核 · A** |
| `exceljs`（导出 .xlsx） | `4.4.0`（**已锁**） | `js/sop.js:1676` | MIT | [`package.json`](https://cdn.jsdelivr.net/npm/exceljs@4.4.0/package.json) `"license": "MIT"` | **已核 · A** |
| `vosk-browser`（CDN 兜底） | `0.0.8`（**已锁**） | `js/asr-local.js:13` | Apache-2.0 | 同 1.2 | **已核 · A** |
| `@fawazahmed0/currency-api`（汇率数据，仅 JSON 数据、非代码） | URL 用 `@latest`（数据源设计即按日取最新；见下） | `js/sop.js:1130` `RATES_API` | CC0-1.0 | [`LICENSE`](https://cdn.jsdelivr.net/gh/fawazahmed0/exchange-api@main/LICENSE) 正文即 CC0 1.0 Universal；上游 README 明确 URL 形态为 `@{date}`，`date` **可以是 `latest`**（[README](https://cdn.jsdelivr.net/gh/fawazahmed0/exchange-api@main/README.md)） | **已核 · A** |
| `@xenova/phonemizer`（原 CDN 兜底） | — | **已在 P0-04 移除**（该包在 jsDelivr 上 404） | 不适用 | — | 不适用 |

**未核**：

- Azure Speech SDK 是**运行时调 Azure 云端服务**的客户端；Azure 服务的**使用条款/数据条款**不在本清单，属另外的问题。
- `@xenova/transformers` 运行期还会从 Hugging Face Hub 拉取**模型权重**（wav2vec2 音素模型）：该模型文件的许可与本仓库无关、也**不由本站分发**，本次 **未核**其许可与来源。
- CDN 兜底链路的**完整性/可用性**（jsDelivr 停服、上游改包）不在本次核验范围。

### 2.1 版本锁定现状（P0-09 批次已做，本次实测确认）

- `js/eval4.js`：`SDK_CDN` = `...speech-sdk@1.52.0...`、`TRANSFORMERS_URL` = `@xenova/transformers@2.17.2` → **已锁**。
- `js/asr-local.js:13`：`vosk-browser@0.0.8` → **已锁**。
- `js/sop.js:1130`：`@fawazahmed0/currency-api@latest` → **仍为 `latest`**，但上游将 `latest` 定义为该 API 的受支持取值形式（每日更新数据），并非未锁版本的代码依赖。是否改锁日期需业主/发布工程决定。

---

## 三、本仓库当前缺失

1. **站点自身没有 `LICENSE`**。仓库根**无** `LICENSE` / `COPYING`（本次实测：`Get-ChildItem -File | ? Name -match 'LICENSE|THIRD|NOTICE|COPYING'` 在新建本文件前为空）。即**站点自身代码的许可未声明**，默认"保留所有权利"。→ 待业主决定（可选方向：MIT / Apache-2.0 / 内部使用声明）。**注意**：站点含 1.1 的 GPL-3.0-or-later 组件，"选哪种许可"与"该组件如何处置"是**联动**问题，须一并判断。
2. **`js/vendor/phonemizer.js` 内无任何许可/版权文本**（见 1.1）：即使按保留处理，也缺 GPL-3.0 要求的许可全文与版权声明。
3. **`js/vendor/vosk-worker.js` 内无 `vosk-browser` 自身的 Apache-2.0 许可文本与 NOTICE**（见 1.2）：MIT/Apache-2.0 均要求随分发保留版权与许可文本。
4. **`@latest` 类引用**：全仓 `*.js` 实测只有 **1 处** `@latest`，即 `js/sop.js:1130` 的 `@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json`（见 2.1 的说明）。其余 CDN 依赖均已锁到具体版本。
5. **没有 `NOTICE` 文件**：Apache-2.0 组件（`vosk-browser`、`@xenova/transformers`）要求保留/提供上游 NOTICE。上游是否发布 NOTICE，本次**未核**。
6. **术语库 provenance 与本清单相关的事实**（不属于第三方代码，但属第三方**文字/汇编**来源，见「四 · B」）：
   - `js/data-glossary.js:2`：「来源：桌面《专业术语中英文词典.xlsx》539 条 → 逐条入库评估 → 校订后收录。」
   - `js/data-glossary.js:10`：从原始 539 条剔除站内已有 67 条、纯基础科学/仪器/菌类 121 条。
   - `js/data-glossary.js:11`：539 条中 335 条判定可用，去重合并后**收录 324 条**；`ipa` 逐条校订 324/324；`ex`/`exCn` 配齐 324/324。
   - `js/glossary.js` 将上述 provenance 渲染给用户看。
   - 该词典的**出版信息、著作权人、书面授权情况**：**未核**（不掌握原件与授权文件）。
   - 本清单**只记录事实**，不对该派生是否构成侵权作任何判断。

---

## 四、待决事项（需法律意见；本文件不构成法律意见）

> 以下每条只列**代价与风险**，**不给结论、不推荐**。请执业知识产权律师就本站的具体传播范围与用途判断。

### A. GPL-3.0-or-later 组件（`js/vendor/phonemizer.js` 含 espeak-ng）随站公开分发

| 选项 | 做法 | 代价 | 风险 |
|---|---|---|---|
| **A1 保留 + 履行 GPL-3.0 义务** | 随分发提供完整对应源码与许可全文、保留版权声明与获取方式；由律师判断 Emscripten 单文件是"聚合"还是"演绎/组合作品" | 需补齐源码获取渠道、许可全文与版权行；后续每次改该产物都要维持这一套 | 若被认定为演绎/组合作品，义务范围与本站自身代码的许可选择空间都可能受限；本站当前无 `LICENSE`，与 GPL 条款如何共存需专门判断 |
| **A2 移除 + 降级功能** | 删除 `js/vendor/phonemizer.js`，「全句音标」降级为「仅术语词音标」（`js/eval4.js` 的 `ensurePhonemizer` 已有明确降级路径） | 失去"全句连续 IPA"这一功能；相关 UI 与文档需同步清理 | 无 GPL 义务；但"降级"是否被用户感知为功能倒退、以及是否有替代方案，需产品判断 |
| **A3 换宽松许可替代品** | 改用 MIT/ISC 许可的音标数据或引擎（如开放音标词典/CMUdict 一类）重做该功能 | 需要新的构建/校验链路与工具投入；输出音标与现基线可能不一致 | 覆盖度与质量是否满足需求未验证；替换引入的新组件同样要重新核许可 |

**与 A 相关的边界问题（同需法律意见）**：若改为**仅从 CDN 动态加载、不随仓库分发**，是否改变"分发"这一事实与相应义务？（本仓库现状是**随仓库分发**。）

### B. 术语库（`js/data-glossary.js`）对桌面《专业术语中英文词典》的汇编式派生

**已记录的事实**见「三 · 6」。分层看，"术语—译名"对照近似事实；而**条目选择（539→324）**、**9 类分类编排**（`js/data-glossary.js:12` 的 `cats`）、**324/324 音标层**属可能落入"选择或编排"的部分。

| 选项 | 做法 | 代价 | 风险 |
|---|---|---|---|
| **B1 去编排化** | 把 `cat` 改为站内自有的功能分类、数据文件顶注声明"分类与排序为本站独立设计"，不改数据字段本身 | 需要 S03 术语专家确认新分类的义项归属；`js/glossary.js` 分类渲染与 `tools/test-glossary.js` 断言同步改 | 只处理"编排"这一层，**不处理条目选择**与音标层的来源问题 |
| **B2 只留事实对 + 改用开放音标源** | 仅保留"术语—译名"事实对与站内自撰例句；`ipa` 层改用开放许可数据源生成并留生成脚本 | 需重建音标层、设门禁、可能影响现有 324/324 的覆盖；中文释义若与词典实质近似需重写并留痕 | 替换工作量最大的一块；开放源覆盖的术语范围是否够用未验证 |
| **B3 重建** | 以开放语料（开放词典 / 国标术语等）重建整个术语库 | 工时最高；术语义项需重新校订 | 重建后的术语质量与用户已形成的使用习惯 |
| **B4 取得书面许可** | 联系词典著作权人，取得"数字化 + 公开网络传播 + 改编/汇编"授权并归档 | 许可费与谈判周期；授权范围可能有限 | 谈判不成的退回方案仍需从 B1–B3 中选 |

**共同的前置信息缺口**：未取得词典原件，因此**无法比对**中文释义是否与词典实质近似、音标是否逐条照搬、324/539 的取舍能否被证明为独立的功能性筛选。这一缺口直接影响上述四条的取舍。

### C. 与本站自身许可（「三 · 1」）的联动

站点自身 `LICENSE` 的选型、以及"是否希望同事/公司可复制使用"，与 GPL-3.0 组件的处置是**同一组取舍**：例如选择宽松许可而保留 GPL 组件，两者的兼容性须专门判断。本文件不给结论。

---

## 五、本次核到 / 核不到（一览）

- **核到一手来源**：espeak-ng = GPL-3.0-or-later（Debian `espeak-ng 1.52.0+dfsg-5` 的 `debian/copyright`）；`vosk-browser@0.0.8` = Apache-2.0；`microsoft-cognitiveservices-speech-sdk@1.52.0` = MIT；`@xenova/transformers@2.17.2` = Apache-2.0；`exceljs@4.4.0` = MIT；`@fawazahmed0/currency-api`（exchange-api）= CC0-1.0。
- **核不到 / 未核**：`@xenova/phonemizer` 自身的许可（jsDelivr 上该包 404，npm registry/npmjs 本次不可达）；`@xenova/transformers` 运行期拉取的 Hugging Face **模型权重**的许可；上游 Apache-2.0 组件是否发布 `NOTICE`；《专业术语中英文词典》的出版信息与授权情况。
- **缺失**：站点自身 `LICENSE`；`js/vendor/phonemizer.js` 内的许可与版权文本；`js/vendor/vosk-worker.js` 内 `vosk-browser` 自身的许可文本/NOTICE。

---

> 本文件由 AI 代理（P0 第四批 α 组）生成，**不构成法律意见**。
> 勿据此对外声称"已通过合规审查"或"许可证已确认可用"。
