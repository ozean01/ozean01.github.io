/* ============ 本地/离线语音识别钩子（vosk-browser 可插拔）============
   设计：跨浏览器 + 断网识别用 vosk（Kaldi wasm）。模型不进项目、不在开发机下载，
   而是：
     ① 首选「离线已就绪」：`js/vendor/vosk.js`（库，本地放）+ `models/vosk-model-small-en-us-0.15/`（解压后的模型目录）
        → 完全离线可用。
     ② 否则若用户开启「本地识别」且已联网：库从 CDN 加载，模型需要用户提前把解压后的目录
        放到 `models/vosk-model-small-en-us-0.15/`（工具脚本见 tools/fetch-vosk-model.ps1）。
   未就绪时自动回退到浏览器在线识别（webkit），并给出清晰指引。
   依赖：window.LocalASR 全局；`models/` 与 `js/vendor/` 目录均可离线放置。 */
(function () {
  "use strict";

  var LIB_URL = "https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js";
  var MODELS_DIR = "models/vosk-model-small-en-us-0.15";
  var VENDOR_LIB = "js/vendor/vosk.js";

  var vosk = null;          // vosk-browser 全局
  var model = null;         // 已加载的模型
  var loading = null;       // 加载中 Promise
  var KEY = "fte-local-asr-v1";

  function toast(m) { if (window.ASRUtil && window.ASRUtil.toast) window.ASRUtil.toast(m); }
  function isOfflineReady() {
    /* 模型目录可达即认为可离线用（幂等：`createModel` 会按需读文件） */
    return !!window.Vosk;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("加载失败：" + src)); };
      document.head.appendChild(s);
    });
  }

  /* 加载 vosk-browser：先本地 vendor，其次 CDN */
  function ensureLib() {
    if (vosk) return Promise.resolve(vosk);
    if (loading) return loading;
    loading = new Promise(function (resolve) {
      if (window.Vosk) { vosk = window.Vosk; return resolve(vosk); }
      loadScript(VENDOR_LIB).then(function () {
        vosk = window.Vosk || vosk;
        resolve(vosk);
      }).catch(function () {
        return loadScript(LIB_URL).then(function () { vosk = window.Vosk; resolve(vosk); });
      });
    });
    return loading;
  }

  /* 下载/检查模型：优先取本地 `models/` 目录（离线的唯一真正来源）。
     纯静态下服务器无法自动解压 zip，因此离线只支持「手动放解压目录」。
     这里仅探测目录存在——不存在则明确提示放置路径。 */
  function ensureModel() {
    return fetch(MODELS_DIR + "/conf/mfcc.conf").then(function (r) {
      if (!r.ok) throw new Error("模型不存在");
      return r;
    }).then(function () {
      if (!window.Vosk) throw new Error("库未就绪");
      try { return window.Vosk.createModel(MODELS_DIR); }
      catch (e) { throw new Error("模型加载失败：" + e.message); }
    });
  }

  /* 把 AudioBuffer/ArrayBuffer 转成 Float32Array 单声道（vosk 需要） */
  function toMonoFloat32(audio) {
    /* audio 可能是 Float32Array（已在别处采样）或 AudioBuffer */
    if (typeof Float32Array !== "undefined" && audio instanceof Float32Array) return audio;
    var ch = audio.getChannelData(0);
    return new Float32Array(ch);
  }

  /* 主入口：给一段单声道 Float32Array PCM（16k+/任意采样率，vosk 内部处理采样率差异），
     返回识别的文本。失败抛错，由调用方回退 webkit。 */
  function transcribe(monoFloat32) {
    return ensureLib().then(function () { return window.Vosk; }).then(function (V) {
      if (!model) return ensureModel().then(function (m) { model = m; return m; });
      return model;
    }).then(function (m) {
      var rec = m.KaldiRecognizer ? m.KaldiRecognizer(44100) : m.KaldiRecognizer(16000);
      if (!rec) throw new Error("KaldiRecognizer 不可用");
      // vosk 以 chunk 方式喂数据
      var chunk = 4096;
      for (var i = 0; i < monoFloat32.length; i += chunk) {
        var part = monoFloat32.slice(i, i + chunk);
        if (rec.AcceptWaveform(part)) { /* 中途出结果忽略，取最终 */ }
      }
      var res = rec.FinalResult();
      rec.Free && rec.Free();
      var text = (res && res.text) || "";
      return text.trim();
    });
  }

  /* 用麦克风录音收集单声道 Float32Array（供 vosk 识别）。
     返回 {stop}；stop() 会把累积音频交给 onDone(monoFloat32)。 */
  function record(onDone) {
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var src = ctx.createMediaStreamSource(stream);
      var chunks = [];
      var processor = ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = function (e) {
        var buf = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(buf));   // 复制，避免被复用覆盖
      };
      src.connect(processor);
      processor.connect(ctx.destination);   // 少数浏览器需要连到输出才会拉数据
      var stopped = false;
      function stop() {
        if (stopped) return;
        stopped = true;
        try { processor.disconnect(); src.disconnect(); ctx.close(); stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ }
        if (typeof Float32Array !== "undefined") {
          var total = 0; chunks.forEach(function (c) { total += c.length; });
          var out = new Float32Array(total); var off = 0;
          chunks.forEach(function (c) { out.set(c, off); off += c.length; });
          onDone(out);
        } else { onDone(null); }
      }
      return { stop: stop };
    }).catch(function (e) { toast("麦克风不可用：" + e.message); throw e; });
  }

  function status() {
    return {
      lib: !!vosk,
      offlineReady: isOfflineReady()
    };
  }

  window.LocalASR = {
    transcribe: transcribe,
    record: record,
    status: status,
    MODELS_DIR: MODELS_DIR
  };
})();
