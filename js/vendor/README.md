# 第三方库放置目录（离线优先）

本目录用于放置第三方库文件，使页面可以从本地加载、避免依赖 CDN（可选，非必需）。

## 1. Azure Speech SDK（音素级发音评测）
「四维口语实战」的 **🔎 Azure 音素级评测** 从 CDN 加载 SDK（版本已固定，见 `js/eval4.js` 的 `SDK_CDN`）。
> P0 批次（第二期评审 S07/S11 落地）：此前这里描述「先尝试从本目录加载、找不到再回退 CDN」，
> 但代码里的本地分支指向一个**从未随站发布的文件**，每次点击都会白打一个 404。现已删除该分支、只走 CDN 并锁版本。
- 参考：https://www.npmjs.com/package/microsoft-cognitiveservices-speech-sdk
- 选用产物：`distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js`（UMD，可用 `<script>` 加载）。许可证：MIT（`package.json` 的 `license` 字段实测，见 `THIRD_PARTY_NOTICES.md`）。
- 该 SDK **不随本仓库分发**（`js/vendor/` 里没有这个文件），只在运行时从 jsDelivr 按**锁定版本**拉取；版本以 `js/eval4.js` 的 `SDK_CDN` 为准。

## 2. vosk-browser（离线语音识别）
「发音设置 → 识别来源 → 优先本地识别」用。
- 运行 `tools/fetch-vosk-model.ps1`（在【有网机器】一次）即可自动获取 `vosk.js` 到本目录 + 模型到 `models/`。
- 或手动：下载 `https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js` 命名为 `vosk.js` 放入本目录，
  并把解压后的 `vosk-model-small-en-us-0.15/` 放到站点根目录的 `models/` 下。
- 许可证：Apache-2.0（vosk-browser；`package.json` 的 `license` 字段实测，见 `THIRD_PARTY_NOTICES.md`）。**所填版本须与 `js/vendor/vosk.js` 实际一致**；`js/asr-local.js` 的 CDN 兜底同样锁定 `vosk-browser@0.0.8`。
- 本文件内**保留**了若干第三方版权行（`Copyright (c) Microsoft Corporation.`、`Copyright 2011, Sebastian Tschan` + MIT、`Version 2.2 Copyright (C) Paul Johnston 1999 - 2009` + BSD），属需随分发保留的署名材料，清单见 `THIRD_PARTY_NOTICES.md`。
## 3. phonemizer（参考句全句音标）
「四维口语实战」参考句下方的「🔊 全句音标」用。**只从本目录加载**（`phonemizer.js` 已随仓库提供）。
> P0 批次（第二期评审 S07 落地）：此前这里指向的 `@xenova/phonemizer@latest` CDN 地址**实测 404**，
> 且页面用普通 `<script>` 加载 ESM 会恒定 `SyntaxError`。现改为只认本目录文件，缺失时明确降级为「仅术语词音标」。
- 用法：确认 `js/vendor/phonemizer.js` 存在即可完全离线；不需要再手工下载。

### 3.1 许可事实（P0-10 更正，2026-10-10）

> **本节只陈述可复核的事实与待决事项，不构成法律意见，也不表示"已确认可商用"或"已合规"。**
> 原先此处的「Apache-2.0」标注**与文件实际内容不符**，已删除。

**实测事实（本机静态可验证）**

| # | 事实 | 复现方式 |
|---|---|---|
| 1 | 本目录 `phonemizer.js`（1,322,380 字节，单行压缩）是 **Emscripten 构建产物**，内部把 **espeak-ng 引擎与其语音数据**解包到 `/usr/share/espeak-ng-data`（`/lang`、`/voices` 等 100+ 条 `FS_createPath`）。 | `Select-String -Path js\vendor\phonemizer.js -Pattern '/usr/share/espeak-ng-data'` 命中 |
| 2 | 文件内出现 `espeak` 系标识 100+ 次，导出符号为 `phonemize` / `list_voices`（`...export{Be as list_voices,ce as phonemize};`），运行时在临时路径 `espeak-ng-ipa-tmp-*` 上做合成。 | 同上；`[regex]::Matches((Get-Content ... -Raw),'espeak')` 计数 |
| 3 | 文件中**不含**任何版权声明，**不含** "General Public License" / "Apache License" 等许可文本——即上游 espeak-ng 的署名/许可附随义务在**这一份产物里看不到**。 | `Select-String` 查 `Copyright` / `General Public` / `Apache` 均 0 命中（`GNU`、`GPL` 的少数命中位于 base64 语音数据中间，非许可文本） |
| 4 | **espeak-ng 上游许可是 GPL-3.0-or-later**。 | Debian 源码包 `espeak-ng 1.52.0+dfsg-5` 的 `debian/copyright` 原文："The rest of upstream sources are licensed under the following terms: This package is free software; you can redistribute it and/or modify it under the terms of the **GNU General Public License** as published by the Free Software Foundation; **either version 3 of the License, or (at your option) any later version.**" —— <https://sources.debian.org/src/espeak-ng/1.52.0%2Bdfsg-5/debian/copyright/> |

**待决（需法律意见，本文件不给结论）**

- 该单文件把 espeak-ng 编入同一产物：这属于**聚合**还是**演绎/组合作品**，本站的**分发**触发哪些义务，须由执业律师判断。
- 在此之前：**不要再把本文件标注为 Apache-2.0**；**不要对外声称其许可状态**。
- 三种可能的处置方向（保留并履行 GPL-3.0 义务 / 移除并降级为「仅术语词音标」/ 换用宽松许可的音标方案）及其代价与风险：见仓库根 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) 的「待决事项」节。
