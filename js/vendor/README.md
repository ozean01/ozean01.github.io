# 第三方库放置目录（离线优先）

本目录用于放置第三方库文件，使页面可以从本地加载、避免依赖 CDN（可选，非必需）。

## 1. Azure Speech SDK（音素级发音评测）
「四维口语实战」的 **🔎 Azure 音素级评测** 会先尝试从本目录加载 SDK，找不到再回退 CDN。
- 下载：https://www.npmjs.com/package/microsoft-cognitiveservices-speech-sdk
- 取 `distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js`，命名为
  `microsoft.cognitiveservices.speech.sdk.bundle-min.js` 放入本目录。
- 未放置时首次点击从 jsDelivr CDN 加载（需联网）。许可证：MIT。

## 2. vosk-browser（离线语音识别）
「发音设置 → 识别来源 → 优先本地识别」用。
- 运行 `tools/fetch-vosk-model.ps1`（在【有网机器】一次）即可自动获取 `vosk.js` 到本目录 + 模型到 `models/`。
- 或手动：下载 `https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js` 命名为 `vosk.js` 放入本目录，
  并把解压后的 `vosk-model-small-en-us-0.15/` 放到站点根目录的 `models/` 下。
- 许可证：Apache-2.0（vosk-browser）。
## 3. phonemizer（参考句全句音标）
「四维口语实战」参考句下方的「🔊 全句音标」用。把以下文件命名为 `phonemizer.js` 放入本目录即可完全离线：
- 下载：https://cdn.jsdelivr.net/npm/@xenova/phonemizer@latest/index.js （ESM，约 2.66MB）
- 未放置时页面会尝试从该 CDN 动态 `import()` 加载（需联网）；都失败则只显示「术语词音标」，不影响使用。
- 许可证：Apache-2.0。
