/* ============ 本地/离线语音识别钩子（vosk-browser 可插拔）============
   设计：跨浏览器 + 断网识别用 vosk（Kaldi wasm）。模型不进仓库、不随站分发，
   由 `tools/fetch-vosk-model.ps1` 在本机准备（脚本会同时打包成 tar.gz）。

   ★ P1-离线识别修复（2026-10-11，真机定位）：
     vosk-browser 的 worker 是**下载并按 tar.gz 解包**模型的，接口约定为：
       worker: downloadAndExtract(modelUrl, modelPath)
         → fetch(modelUrl) → 写 downloaded.tar.gz → ArchiveHelper.Extract(…, stripFirst=true)
         → new Vosk.Model(modelPath)
     也就是说 `createModel()` 收到的必须是**一个 .tar.gz 压缩包**，不能是解压后的目录。
     此前本站传的是目录 `models/vosk-model-small-en-us-0.15/`：
       ① 服务器对目录返回 404（我们读文件失败了）；
       ② 而 worker 的 error 事件在库层**没有被映射成 promise rejection**（它只等 "load" 事件）——
       于是 `createModel()` 既不 resolve 也不 reject，表现为"点跟读永远等待"。
     修法：改成传压缩包 `models/vosk-model-small-en-us-0.15.tar.gz`（归档内含顶层目录名，
     库的 stripFirstComponent=true 会把它剥掉，正好落到 modelPath 下）。
     另：`selfTest()` 与 `player.js` 的硬超时是**双重保险**——即使库再出现"不回调"，
     用户也只会看到一条可执行的错误，而不是无限等待。
   依赖：window.LocalASR 全局；`models/` 与 `js/vendor/` 目录均可离线放置。 */
(function () {
  "use strict";

  var LIB_URL = "https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js";
  var MODELS_DIR = "models/vosk-model-small-en-us-0.15";              /* 解压后的目录（人可读的"在不在"依据） */
  var MODEL_ARCHIVE = "models/vosk-model-small-en-us-0.15.tar.gz";    /* ★ 交给 vosk 的形态：tar.gz */
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
    return fetch(MODEL_ARCHIVE, { method: "HEAD" }).then(function (r) {
      if (!r.ok) throw new Error("模型不存在");
      return r;
    }).then(function () {
      if (!window.Vosk) throw new Error("库未就绪");
      try { return window.Vosk.createModel(MODEL_ARCHIVE); }
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
      /* P2-2：vosk-browser 的 KaldiRecognizer 是**构造函数**，必须 new。
         此前写成 m.KaldiRecognizer(44100)（还把采样率写成 44100）——库内是 getter，
         直接调用拿不到识别器，即使模型到位也不可能工作。 */
      var rec = new m.KaldiRecognizer(16000);
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

  /* P2-2 就绪探测：离线识别需要**模型目录**在场（库可按需加载）。
     本站**不分发**这个模型（约 66MB，会显著增大仓库与首次安装流量），所以默认未就绪。
     此前设置页照样摆着一个可勾选的「优先本地识别」，勾了也不会生效——那是一句拿不到凭证的承诺。
     现在把真实状态交给 UI，由它禁用入口并说明原因。 */
  function probe() {
    var missing = { ready: false, reason: "模型压缩包不在站内（" + MODEL_ARCHIVE + "）" };
    if (typeof fetch !== "function") return Promise.resolve(missing);
    return fetch(MODEL_ARCHIVE, { method: "HEAD" }).then(function (r) {
      return r && r.ok ? { ready: true, reason: "" } : missing;
    }).catch(function () { return missing; });
  }

  /* ★ P1-使用反馈加固（2026-10-11）：**真跑一次**的自检。
     背景：`probe()` 只做 HEAD 探测（文件在不在），而实测「文件在」≠「能识别」——
     本机 67MB 模型目录齐全、`js/vendor/vosk.js` 也加载成功，但
     `Vosk.createModel(models/vosk-model-small-en-us-0.15)` **永不 resolve 也不 reject**
     （Chromium 153 + vosk-browser 0.0.8 实测，见 `_fte-review-2/P1/_probe/vosk-probe.log`）。
     所以 UI **不能**凭"文件在"就默认打开离线识别——那会把用户带进"点跟读→永远等待"。
     本函数带硬超时，只有真的拿到模型对象才算通过。 */
  function selfTest(timeoutMs) {
    var ms = timeoutMs || 20000;
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return; done = true;
        resolve({ ok: false, reason: "离线模型在 " + Math.round(ms / 1000) + " 秒内没有加载完成（模型文件在，但 vosk 的加载链路没返回）" });
      }, ms);
      ensureLib().then(function () {
        if (!window.Vosk) throw new Error("vosk.js 未就绪");
        return window.Vosk.createModel(MODELS_DIR);
      }).then(function (m) {
        if (done) return; done = true; clearTimeout(timer);
        resolve(m ? { ok: true, reason: "" } : { ok: false, reason: "模型对象为空" });
      }).catch(function (e) {
        if (done) return; done = true; clearTimeout(timer);
        resolve({ ok: false, reason: String((e && e.message) || e) });
      });
    });
  }

  window.LocalASR = {
    transcribe: transcribe,
    record: record,
    status: status,
    probe: probe,
    selfTest: selfTest,
    MODELS_DIR: MODELS_DIR,
    MODEL_ARCHIVE: MODEL_ARCHIVE
  };
})();
