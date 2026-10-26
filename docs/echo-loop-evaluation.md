# Echo Loop（echo-loop/Echo-Loop）参考性评估 · P11 候选

> 评估日期：2026-10-26
> **落地状态：P1（段级复习调度）+ P2（阶段内断点续学）已于 v1.15.0 落地**（见 §7）；P3（复述要点判定）、P4（字幕静音对齐）明确不做/延后。
> 对象：GitHub `echo-loop/Echo-Loop`（AGPL-3.0，Flutter，4,490 ★ / 465 fork，iOS 已上架、Android 走 GitHub APK）
> 方法：全库检索本站是否已参考 → 下载对方源码整包逐文件阅读 → 按站内既有"外部材料评估"纪律（P7/P8/P9/P10）判定"借什么 / 明确不做什么"
> 证据分级：**[宣]** 对方自述 · **[证]** 我在源码/文件/商店接口中直接看到 · **[疑]** 无法核实

---

## 0. 结论

1. **本站此前没有参考过 Echo Loop**：全库 155 个文本文件 + 63 个提交 + 全历史 `git grep` + 未提交工作树，`echo-loop / Echo Loop / 回环 / echo loop` **0 命中**（`echo` 只命中 shell 命令与 CEFR 词表词条）。本站对参考过的对象（SubTap / ENGSENCE / HiKid / English Anchor / ELSA / ts-fsrs / 磨耳听力助手）全部点名留痕，连"评估后不做"的也写进 README，因此 0 命中可判定为"确实没参考"。
2. **参考价值：中高，但只能借思路，不能借代码**。对方 **AGPL-3.0**、本站 **MIT**，且它是 Flutter 原生 App、本站是纯静态 PWA——直接把代码搬过来既不合许可证，也合不进架构。可借的是**调度模型、完成态定义、断点续学**这几件"方法论级"的东西。
3. **它宣传大于实现，"科学间隔复习"主链路其实是自研固定阶梯**（6h/1d/2d/4d/7d/14d/28d），FSRS 只用在收藏句/生词上；跟读评分是**词形还原 + LCS 覆盖率**（不是发音评测），复述的"真 AI 评分"在闭源后端且要会员。**这对我们是好消息**：最值得借的部分逻辑简单、无依赖、可离线复现。

---

## 1. 事实核查：Echo Loop 到底是什么

| 项 | 结论 | 依据 |
|---|---|---|
| 真实性 | 真实可构建、CI 全绿、iOS 已上架（1.0.43，2026-04 首发） | [证] `/repos`、`/actions/runs`、`itunes.apple.com/lookup?id=6760324074` |
| 技术栈 | Flutter + Riverpod + drift(SQLite)；`just_audio`+`media_kit` 两套播放器；端侧 `sherpa_onnx` ASR/TTS；云端 AI 闭源 | [证] `pubspec.yaml`、`lib/services/*`、`.github/workflows/release.yml` |
| 许可证 | **AGPL-3.0**（强 copyleft + 网络条款） | [证] `LICENSE`、API `license.spdx_id` |
| 真实用户量 | App Store 仅 **9 个评分**（3.78）、单版本 APK 下载 72–267 次；4,490 ★ 与用户量严重不匹配 | [证] iTunes lookup、`/releases` · [疑] 是否有非自然增长无法证明 |
| 桌面/AI 规划 | 桌面只有 macOS 开发中、Windows 是空壳、**Web 明确暂无计划**；AI 已上线翻译/解析/词典/转录/复述评估，"AI 口语陪练""个性化推荐"仍未做 | [证] README Roadmap、`windows/` 仅模板、`/releases` 无桌面包 |
| 主链路间隔复习 | **固定阶梯** `firstLearn → review0(6h) → review1(1d) → review2(2d) → review4(4d) → review7(7d) → review14(14d) → review28(28d) → completed`，`nextReviewAt = lastStageCompletedAt + intervalHours`，**不按表现动态调整** | [证] `lib/database/enums.dart`、`lib/models/learning_progress.dart` |
| FSRS 用在哪 | 只用于"收藏句 / 收藏生词 / 闪卡"，独立 `features/memory_scheduler/` 分层 | [证] `lib/features/memory_scheduler/**`、`favorite_*_lifecycle_provider.dart` |
| 跟读评分 | 正则取英文词 → 小写 → lemmatizer 词形还原 → 与原句求 **LCS** → `匹配数/原文数`；≥0.5 记 passed，分数不阻断流程 | [证] `lib/services/speech_practice_matcher.dart`、`rating_thresholds.dart` |
| 复述判定 | 本地**双通道取高**：词覆盖率 + Apple NLEmbedding 句向量 cosine（Android 无 NLEmbedding → 退化为词覆盖率）；云端 AI 复述评估需登录 + 会员 | [证] `embedding_similarity.dart`、`retell_review_evaluation_provider.dart` |
| 盲听 | 整篇播放完成即"完成"，**无理解校验**；可设段间停顿/重复次数/变速 | [证] `blind_listen_player_screen.dart`、`blind_listen_settings.dart` |
| 精听 | 逐句播完即完成，用户自标"难句"；**零难句时自动跳过跟读**；难度按难句比例自动推导 | [证] `intensive_listen_player_screen.dart`、`difficulty_from_ratio.dart` |
| 音频+字幕导入 | 音视频共用 `audio_items` 表；字幕导入白名单 **SRT/VTT/LRC**（LRC 先规范化为 SRT，ASS/TXT 不认）；逐句时间轴来自字幕文件；AI 转录走闭源后端 | [证] `features/audio_import/subtitle_pairing.dart`、`services/lrc_parser.dart`、`tables/audio_items.dart` |
| 字幕时间轴校准 | 本地 DSP 静音检测（帧级 dBFS + 动态阈值 + 三重后置保护），**不用 AI** | [证] `subtitle_auto_align_service.dart` |

---

## 2. 本站现状对照

> 逐条证据（含文件/函数、155 个文本文件 + 63 个提交的检索过程）见同批审计报告 `site-audit.md`。

| Echo Loop 机制 | 站内对应物 | 判定 |
|---|---|---|
| 精听 | P8 字幕精听三件套：`js/subtitle.js` 的 `abTick`（A-B 回绕唯一实现）、`Player.waveform`/`waveSegRange`（原声波形）、逐句笔记 `fte-sub-notes-v1`；+ 五阶段② + 听写 | **已有，不抄** |
| 跟读 | `js/app.js` 五步闭环（听→录→回放→标准音→对比）+ `js/score.js` 的 `evaluateSpeech`（词形分）+ 可选 `js/eval4.js` 的 Azure 音素级 `PronunciationAssessmentConfig(..., PhonemeLevel, ...)` | **已有，评分口径比对方诚实** |
| 盲听 | `js/subtitle.js` 字幕「隐藏」档 + `js/app.js` 的 `renderStage` ①盲听（"不看文字先整体听"，含 `play-dlg-varied` 变异听） | **已有** |
| 复述 | `js/app.js` 的 `renderStage` ④复述 + `js/tutor.js` 的「听力复述」prompt（明确不要求逐字） | **动作有，本地判定口径错** |
| 间隔复习 | `js/flashcards.js` 的 FSRS-6 三线；`js/app.js` 的 `flashStoreKey`（单词/短语/骨架/台词） | **引擎强，但记忆单位不是音频段** |
| 音频+字幕导入 | `js/subtitle.js` 的 `#subFile`（SRT/VTT/ASS/SSA/SMI）与 `#mediaFile`（audio/*, video/*）；`js/material.js` 素材投料口（纯文本，无时间轴） | **有，但"旁挂、易失、无对齐"** |
| 自动驱动 | `js/today.js` 五步清单（`key:"speak"` 等）+ 打卡 + 中断回归 | **有，但驱动单位是课程单元，不是"这段音频练到会说"** |

---

## 3. 值得借的 4 件（按建议优先级）

### P1 · 段级复习调度 —— 最值得借，且与站内"完成≠证据"纪律天然咬合

现状缺口：`progress.stage[unitId-dlgIdx]` 只记录"最高走到第几阶段"（`js/app.js` 的 `stageDone = (progress.stage || {})[KEY]`），**没有下一次到期时间、没有完成态、没有"今天该复习哪一段"**；FSRS 三条线只调度词/短语/骨架/台词。

借法（**不新增导航、不新增第 6 步**，落在既有 `progress` 与今日第 3 步内）：

1. 新增一条**独立**调度线 `fte-seg-review-v1`（必须登记 `js/storage-keys.js`，否则 `test-security.js` 直接失败），对象 = `{unitId-dlgIdx}` 或字幕页 `{cueKey 文件+起始秒}`；
2. 阶梯直接用对方验证过的 **6h / 1d / 2d / 4d / 7d / 14d / 28d**（`intervalHours` 是"距上一轮"，非累计），`nextReviewAt = lastDoneAt + interval`；
3. 今日第 3 步"开口跟读"改为**到期段优先**：有到期段就指向它并写明"这段 7 天前练过、到点复听"，没有才回落到当前单元对话（保持"今日是唯一权威入口"不变）；
4. **不计入打卡**（与连听/听后测同一纪律），只在"能力"侧留证据：段级完成态 + 复述是否达标；
5. 门禁：阶梯边界（逾期窗口 24h）、"唯一实现"计数、存储键登记、不新增第 6 步、不计打卡。

工程量：1 个新模块约 300–400 行 + 1 道门禁，无需后端。

### P2 · 阶段内断点续学（句子 index）

对方每个子步骤都存 `blindListenSentenceIndex / intensiveListenSentenceIndex / shadowingSentenceIndex / retellSentenceIndex`，并规定"**>3 天不恢复**"（`learning_progress.dart`）。站内闯关只有"最高阶段"，重进一段 40 句的对话仍从第 1 句开始。

借法：`progress.stage[key]` 从数字升级为 `{stage, sentenceIndex, savedAt}`（做好旧数据迁移与导出兼容），恢复超 3 天则从头并明说。工程量小、体验收益直接。

### P3 · 复述判定：借"双通道取高"的思路，但**不要抄它的分数**

对方本地复述分 = 词覆盖率（词形 LCS，和站内 `js/score.js` 同源缺陷）+ iOS 句向量 cosine 取高；**Android 上只剩词覆盖率**。也就是说它在"用自己的话复述"这件事上并没有真正解决假阴性——而站内闯关④现在正是拿原文逐词比，会惩罚真转述。

借法：不做"覆盖率分"，改做**要点清单判定**——每段对话/素材预置 2–3 个"必须说到的信息点"（站内语料可人工核对，这是对方没有的优势），复述后按 ASR 转写判要点命中 + 意群完整度，输出"说到 2/3 个要点"而不是一个 0–100 的相似度分；LLM 仅作可选复核。**先修正口径文案（现状未标注"这是与原文字面重合度"），再谈新判定。**

### P4 · 字幕-音频时间轴静音对齐（低成本、可延后）

对方用纯本地 DSP（静音检测）把字幕句边界吸到静音处，不用 AI。站内导入字幕完全按文件时间轴走，外部字幕偏移半秒就会"点一句播半句"。

借法：只在"导入字幕 + 导入媒资"路径上做一次可选"对齐"（检测句边界附近静音、整体/逐句微调 offset），失败明确提示"未对齐，仍按原时间轴"。与 D4（不做服务端 ASR）不冲突。工程量中等，可排在 P1/P2 之后。

> 顺带一处对方更强、但本站不必跟的点：它支持 **LRC** 字幕导入（站内 6 种格式里没有 LRC）。LRC 主要用于歌曲/播客，外贸精听用不上，不值得为它单独加解析器。

---

## 4. 明确不做（及原因）

| 对方的东西 | 为什么不做 |
|---|---|
| **AGPL-3.0 代码** | 本站 MIT；AGPL 有网络条款，搬代码 = 全站被迫 AGPL。只能借思路 |
| **Flutter 原生 App 形态** | 与"纯静态 PWA + 微信内可开 + 零账号"三条硬约束冲突；小程序端已冻结 |
| **账号 / 云同步 / 订阅变现 / 埋点三通道** | 违背"零后端、不外发数据、localStorage 进度"；站内已有导出/导入搬运 |
| **AI 字幕转写、AI 词汇讲解、云端复述评分** | 全部依赖闭源后端与密钥；站内已移除本地 ASR 且设了防回退门禁（`README.md:1414-1459`），不能为它重开后端 |
| **强制 7 轮复习 + "每段都必须走完"** | 对方是单训练器、音频驱动；本站是课程驱动，19 单元 × 多项内容全强制 7 轮会把"今日 20 分钟"撑爆。只借"到点提醒复听"，不借强制流程 |
| **通用音频库 / 播客 RSS / 社区合集 / 影视素材** | 与 D1（泛听不与精听合并）、D3（影视不做）、D10（不扩到通用英语）冲突；护城河是软包装垂直语料 |
| **"星标 4,490"式增长叙事** | 真实用户量证据（9 个评分、APK 百次级下载）与星标严重不匹配；站内一贯"不吹"（`test-honesty.js`） |
| **两套播放器 / 巨石 DB / SRT 大字段塞库** | 对方工程债，不是优点 |

---

## 5. 建议

- 本轮**不整体立项 P11**；若要做，**只做 P1（段级复习调度）+ P2（断点续学）**两件，二者共用一次 `progress` 结构升级，可合并为一个批次。
- P3（复述要点判定）值得单独立项，但它是**教学法问题**不是"借功能"问题，需要先定义"外贸场景下什么叫复述到位"（建议从客诉、报价、交期三段语料先做样板）。
- P4 视外部字幕使用频率再定，不急。
- 若最终只留下一句话：**Echo Loop 最值得借的不是那五个机制（站内都有），而是"把一段音频当成有到期日、有完成态、有断点的学习对象"这个数据模型。**

---

## 6. 落地状态（v1.15.0，2026-10-26）

| 建议 | 状态 | 落地位置 |
|---|---|---|
| P1 段级复习调度 | ✅ 已落地 | `js/seg-review.js`（7 轮 6h→28d、提前练不推进、到期段进今日第 3 步、深链 `#/speak/<段>`）；门禁 `tools/test-seg-review.js` |
| P2 阶段内断点续学 | ✅ 已落地 | `js/app.js` 接线（逐句步进/离开阶段落断点、重进恢复、>3 天不恢复、完成或重挑战时清断点） |
| P3 复述要点判定 | ⏸ 不做（需先定义「外贸复述到位」的判据，单独立项） | — |
| P4 字幕-音频静音对齐 | ⏸ 延后 | — |

验证：`npm test` 全绿（新增 1 道门禁）＋真实 Chrome 冒烟 `tools/smoke-seg-review.js` 全通过（今日 5 步不变、第 1/7 轮 +18h、提前练不推进、断点续学第 6 句、无异常）。README 见「P11」节。

---

## 7. 证据索引

- 对方仓库：https://github.com/echo-loop/Echo-Loop （API：`api.github.com/repos/echo-loop/Echo-Loop`；源码整包 `codeload.github.com/echo-loop/Echo-Loop/zip/refs/heads/main`）
- iOS 商店：https://apps.apple.com/app/id6760324074
- 详尽调研（源码逐文件）：`echo-loop-research.md`；站内审计（155 文件 + 63 提交）：`site-audit.md`（两份均在同批评估工作目录）
  - 复核更正：调研报告初稿写"字幕只收 SRT/VTT"**不准确**——实际导入白名单为 `srt/vtt/lrc`（`features/audio_import/subtitle_pairing.dart`），已按代码改正本节 §1。
- 站内既有同类评估体例：`README.md` P7（HiKid/ENGSENCE）、P8（English Anchor）、P9（公众号）、P10（corrector.justsong.cn）
