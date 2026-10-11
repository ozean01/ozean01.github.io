/* ============ 本地/离线语音识别（vosk-browser 内核 + **同源 worker 文件**）============
   模型不进仓库、不随站分发，由 `tools/fetch-vosk-model.ps1` 在本机准备（脚本会同时打包成 tar.gz）。

   ★★ 为什么不再直接加载 `js/vendor/vosk.js`（2026-10-11 晚，真机定位 + 加固）：
   `vosk-browser@0.0.8` 的 `dist/vosk.js` 有 **99.5% 是一个 base64 字符串** —— 它把 Kaldi 引擎
   （含内嵌 wasm）打包成一个 **blob: Worker**。而 blob Worker 会**继承创建它的文档的 CSP**，
   本站的严格 CSP（无 `'unsafe-eval'`）会让 worker 里的 Emscripten 胶水抛
   `EvalError: Evaluating a string as JavaScript violates ...`；worker 当场死掉且**不上报**，
   表现为 `createModel()` 既不 resolve 也不 reject（真机实测 >120 秒）→ **离线识别永远建不出来**。

   实测对照（同一台机器、同一个 Chrome，页面 CSP 完全一致）：
     · blob Worker            → `EVAL-BLOCKED`（复现原故障）
     · 同源真实文件 Worker    → `EVAL-OK`（同源文件用**它自己响应头**的 CSP，静态托管不发 CSP 头）
   所以本模块改成：把那段 worker 源码抽成同源真实文件 `js/vendor/vosk-worker.js`
   （由 `tools/build-vosk-worker.js` 从发行包抽取，可复现、带 sha256 清单），
   由本站**自己**跟它通信 —— 于是 `'unsafe-eval'` 可以从 index.html 的 CSP 里拿掉，
   严格策略得以恢复；顺带把 5.8 MB 的发行包换成 4.13 MB 的 worker 文件，离线识别的下载量反而小了。

   ★ worker 协议（逐条核自 worker 源码，不是猜的）：
     发 → {action:"load", modelUrl}                       收 → {event:"load", result:true} | {event:"error", error}
     发 → {action:"create", recognizerId, sampleRate}     收 → （无回执）
     发 → {action:"set", recognizerId, key:"words", value} 收 → （无回执）
     发 → {action:"audioChunk", data, recognizerId, sampleRate}
                                                          收 → {event:"partialresult"|"result", recognizerId, result}
     发 → {action:"retrieveFinalResult", recognizerId}    收 → {event:"result", recognizerId, result:{text,result:[…]}}
     发 → {action:"remove", recognizerId}                 收 → {event:"removed", recognizerId}
   ⚠️ 两个必须守住的细节（写错就"识别不出文本"，而且都不报错）：
     ① 音频要**先乘 0x8000**：worker 是把 Float32 直接 `HEAPF32.set(...)` 进 wasm 堆，它**不做缩放**；
        上游客户端也是在客户端乘完再发的。
     ② modelUrl 必须是**绝对 URL**：worker 里是 `new URL(modelUrl, location.href)`，而 file worker 的
        `location.href` 是 `…/js/vendor/vosk-worker.js` —— 相对路径会被解析到 `js/vendor/` 底下。
   依赖：window.LocalASR 全局；`models/` 与 `js/vendor/` 目录均可离线放置。 */
(function () {
  "use strict";

  var MODELS_DIR = "models/vosk-model-small-en-us-0.15";              /* 解压后的目录（人可读的"在不在"依据） */
  var MODEL_ARCHIVE = "models/vosk-model-small-en-us-0.15.tar.gz";    /* ★ 交给 worker 的形态：tar.gz */
  var WORKER_FILE = "js/vendor/vosk-worker.js";

  /* 绝对 URL：worker 内部会用它做 `new URL(modelUrl, location.href)` 的基址，相对路径必错 */
  function absUrl(u) {
    try {
      if (!window.location || !window.location.href) return u;
      return new URL(u, window.location.href).href;
    } catch (e) { return u; }
  }
  var MODEL_ARCHIVE_URL = absUrl(MODEL_ARCHIVE);
  var WORKER_URL = absUrl(WORKER_FILE);

  function toast(m) { if (window.ASRUtil && window.ASRUtil.toast) window.ASRUtil.toast(m); }

  /* ---------------- worker 生命周期 + 请求路由 ---------------- */
  var worker = null;        // 复用同一个 worker（模型只加载一次）
  var workerP = null;       // 建立中的 promise
  var modelUrlLoaded = "";  // 已经加载好的模型 URL
  var seq = 0;
  var pending = {};         // key -> {resolve, reject, timer}

  function keyOf(name, id) { return id == null ? name : name + ":" + id; }

  function dispatch(msg) {
    /* create / set / remove 在 worker 里 resolve 成 undefined，会被 postMessage(undefined) 回来 */
    if (!msg || typeof msg !== "object") return;
    var ev = msg.event;
    if (ev === "error") {
      var k = msg.recognizerId != null ? keyOf("rec", msg.recognizerId) : "load";
      var h = pending[k];
      if (h) {
        delete pending[k];
        if (h.timer) clearTimeout(h.timer);
        /* 诊断口径：worker 的 error 字段缺失时，把整条消息原样带出来 —— 只写"worker 报错"
           会把真正原因（模型 404 / 解包失败 / 版本不符）盖掉，让下一次排查又从零开始。 */
        var why = msg.error || (msg.message || "");
        if (!why) { try { why = JSON.stringify(msg).slice(0, 300); } catch (e) { why = "（无法序列化的错误对象）"; } }
        h.reject(new Error(why));
      }
      return;
    }
    if (ev === "load") {
      var hl = pending["load"];
      if (hl) { delete pending["load"]; if (hl.timer) clearTimeout(hl.timer); hl.resolve(true); }
      return;
    }
    if (ev === "result") {
      /* 只有**我们为 retrieveFinalResult 登记过**的那一次才算最终结果；
         送入音频途中 worker 也会发 result（分段结束），必须丢弃，否则会拿半句去评分。 */
      var kr = keyOf("rec", msg.recognizerId);
      var hr = pending[kr];
      if (hr) { delete pending[kr]; if (hr.timer) clearTimeout(hr.timer); hr.resolve(msg); }
      return;
    }
    /* partialresult / removed：无需处理 */
  }

  function ensureWorker() {
    if (worker) return Promise.resolve(worker);
    if (workerP) return workerP;
    workerP = new Promise(function (resolve, reject) {
      var w;
      try { w = new Worker(WORKER_URL); }
      catch (e) {
        workerP = null;
        reject(new Error("无法创建识别 worker（" + ((e && e.message) || e) + "）"));
        return;
      }
      w.onmessage = function (ev) { dispatch(ev.data); };
      /* ★ worker 脚本本身出错必须**上报**：上游库当年就是在这里静默，才害得用户"永远在准备中" */
      w.onerror = function (ev) {
        var detail = (ev && (ev.message || ev.type)) || "未知";
        workerP = null;
        try { w.terminate(); } catch (e) { /* ignore */ }
        var desc = "识别 worker 启动失败：" + detail +
          "（请确认 js/vendor/vosk-worker.js 存在；可用 node tools/build-vosk-worker.js 重新生成）";
        Object.keys(pending).forEach(function (k) {
          var h = pending[k];
          delete pending[k];
          if (h.timer) clearTimeout(h.timer);
          h.reject(new Error(desc));
        });
        reject(new Error(desc));
      };
      worker = w;
      resolve(w);
    });
    return workerP;
  }

  function request(key, timeoutMs, send, failMsg) {
    return new Promise(function (resolve, reject) {
      var h = { resolve: resolve, reject: reject, timer: null };
      if (timeoutMs) {
        h.timer = setTimeout(function () {
          if (pending[key] !== h) return;
          delete pending[key];
          reject(new Error(failMsg || ("等待超过 " + Math.round(timeoutMs / 1000) + " 秒")));
        }, timeoutMs);
      }
      pending[key] = h;
      send();
    });
  }

  /* ---------------- 模型加载（**单飞**：并发调用共用同一次加载） ----------------
     ★ 为什么必须单飞（2026-10-11 晚真机定位）：worker 侧的 `load()` 会把模型下载到
     `archivePath = 存储目录/downloaded.tar.gz` 并写 `downloaded.ok` 标记，**两次并发 load 共用同一目录**：
     后一次看到 downloaded.ok 就跳过下载，直接去解包那个可能已被前一次 unlink 掉的归档，
     于是以 `Failed to open '…/downloaded.tar.gz'` 失败 —— 而且失败状态会留在 IndexedDB 里。
     真机上"页面启动时的自检"与"用户随后打开设置弹窗触发的自检"正是这样撞车的（已在 app.js 里
     把自检挪到首次开弹窗时；这里再补一道单飞，任何并发都不会互相踩）。
     超时由**调用方各自**给：慢的加载不会被严格调用方的截止时间掐断。 */
  var loadPromise = null;

  function postLoad(w, url) {
    return request("load", 0, function () {
      w.postMessage({ action: "load", modelUrl: url });
    });
  }

  function loadModelShared() {
    if (modelUrlLoaded === MODEL_ARCHIVE_URL) return Promise.resolve(true);
    if (loadPromise) return loadPromise;
    loadPromise = ensureWorker().then(function (w) {
      return postLoad(w, MODEL_ARCHIVE_URL);
    }).catch(function (e) {
      /* 再试一次，并**换一个存储目录**：查询串会进入 worker 的目录名推导
         （`modelUrl.replace(/[\W]/g,"_")`），因此重试不会撞上上一次可能残留的
         downloaded.ok / 半包归档 —— 否则一次失败会变成"以后永远失败"。 */
      return ensureWorker().then(function (w) {
        return postLoad(w, MODEL_ARCHIVE_URL + (MODEL_ARCHIVE_URL.indexOf("?") < 0 ? "?" : "&") + "r=" + Date.now());
      }).catch(function (e2) {
        throw new Error((e2 && e2.message) || (e && e.message) || "离线模型加载失败");
      });
    }).then(function (ok) {
      modelUrlLoaded = MODEL_ARCHIVE_URL;
      return ok;
    }, function (err) {
      loadPromise = null;          /* 失败后允许下次重试（成功则保持，避免重复装载） */
      throw err;
    });
    return loadPromise;
  }

  /* timeoutMs 只约束本次等待；不中断共享加载 */
  function loadModel(timeoutMs) {
    if (modelUrlLoaded === MODEL_ARCHIVE_URL) return Promise.resolve(true);
    var p = loadModelShared();
    if (!timeoutMs) return p;
    return Promise.race([p, new Promise(function (resolve, reject) {
      setTimeout(function () {
        reject(new Error("离线模型在 " + Math.round(timeoutMs / 1000) + " 秒内没有加载完成（下载/解包/建模型未返回）"));
      }, timeoutMs);
    })]);
  }

  /* 把一段 Float32 音频喂给 worker 并取最终结果。返回 {text, words}；失败抛错。 */
  function recognizePcm(mono, sampleRate, timeoutMs) {
    return ensureWorker().then(function (w) {
      return loadModel(180000).then(function () {
        var id = "r" + (++seq) + "-" + Date.now();
        var key = keyOf("rec", id);
        var rate = sampleRate > 0 ? Math.round(sampleRate) : 16000;
        var p = request(key, timeoutMs || 60000, function () {
          w.postMessage({ action: "create", recognizerId: id, sampleRate: rate });
          w.postMessage({ action: "set", recognizerId: id, key: "words", value: true });
          var CHUNK = 4096;
          for (var i = 0; i < mono.length; i += CHUNK) {
            /* ★ 乘 0x8000：worker 直接把 Float32 写进 wasm 堆，缩放必须由客户端做（见文件头注释 ①） */
            var raw = mono.subarray(i, i + CHUNK);
            var data = new Float32Array(raw.length);
            for (var j = 0; j < raw.length; j++) data[j] = raw[j] * 0x8000;
            w.postMessage({ action: "audioChunk", data: data, recognizerId: id, sampleRate: rate }, [data.buffer]);
          }
          w.postMessage({ action: "retrieveFinalResult", recognizerId: id });
        });
        return p.then(function (result) {
          try { w.postMessage({ action: "remove", recognizerId: id }); } catch (e) { /* ignore */ }
          return unwrapResult(result);
        }, function (err) {
          try { w.postMessage({ action: "remove", recognizerId: id }); } catch (e) { /* ignore */ }
          throw err;
        });
      });
    });
  }

  /* 从 worker 的 result 事件体里取文本与逐词结果。
     ⚠️ 结果**包了一层**：`{event:"result", recognizerId, result:{text, result:[{word,conf,start,end}]}}`。
     这里必须只在 `msg.result` 是**非数组对象**时才下钻 —— 因为内层 `result` 本身是个**数组**
     （逐词结果），把"已展开的内层对象"再展开一次就会得到那个数组，文本会静默变成空串。
     两种形态都吃：原始的服务器消息，或已经展开的 `{text, result:[…]}`。 */
  function unwrapResult(msg) {
    var inner = msg && msg.result;
    var p = (inner && typeof inner === "object" && !Array.isArray(inner)) ? inner : (msg || {});
    var words = [];
    if (Array.isArray(p.result)) words = p.result;
    else if (Array.isArray(p.words)) words = p.words;
    var text = p.text;
    if ((text === undefined || text === null) && words.length) {
      text = words.map(function (w) { return w.word || ""; }).join(" ");
    }
    return { text: String(text || "").trim(), words: words };
  }

  /* ---------------- 对外 API（与既有调用方完全兼容） ---------------- */

  /* 给一段单声道 Float32Array PCM **和它的采样率**，返回识别文本。
     sampleRate 缺省按 16000 处理（player.js 的 lastRecordingPcm 已重采样到 16k）。 */
  function transcribe(monoFloat32, sampleRate) {
    return transcribeDetailed(monoFloat32, sampleRate).then(function (r) { return r.text; });
  }

  /* 同上，额外返回逐词结果（conf/start/end），供"错在哪"的逐词反馈使用。 */
  function transcribeDetailed(monoFloat32, sampleRate) {
    var rate = sampleRate > 0 ? Math.round(sampleRate) : 16000;
    if (!monoFloat32 || !monoFloat32.length) return Promise.resolve({ text: "", words: [] });
    return recognizePcm(monoFloat32, rate, 60000);
  }

  /* 用麦克风录音收集单声道 Float32Array（供识别）。
     回调带**真实采样率**：识别必须按音频的实际速率建识别器（48k 录音按 16k 喂 = 语速变 3 倍）。
     返回 {stop}；stop() 会把累积音频与采样率交给 onDone。 */
  function record(onDone) {
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var rate = ctx.sampleRate || 48000;
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
          onDone(out, rate);
        } else { onDone(null, rate); }
      }
      return { stop: stop };
    }).catch(function (e) { toast("麦克风不可用：" + e.message); throw e; });
  }

  function status() {
    return {
      worker: !!worker,
      lib: !!worker,               /* 兼容旧字段名 */
      offlineReady: !!modelUrlLoaded
    };
  }

  /* 就绪探测①：模型压缩包在不在（只做 HEAD，不建模型）。
     本站**不分发**这个模型（约 66MB，会显著增大仓库与首次安装流量），所以默认未就绪。 */
  function probe() {
    var missing = { ready: false, reason: "模型压缩包不在站内（" + MODEL_ARCHIVE + "）" };
    if (typeof fetch !== "function") return Promise.resolve(missing);
    return fetch(MODEL_ARCHIVE_URL, { method: "HEAD" }).then(function (r) {
      return r && r.ok ? { ready: true, reason: "" } : missing;
    }).catch(function () { return missing; });
  }

  /* 就绪探测②：**真跑一次**加载模型。
     背景：「文件在」≠「能识别」—— 正因如此站点不能凭 probe() 就默认打开离线识别。
     本函数带硬超时；worker 的 error 事件会被如实带出来（不再像上游库那样静默）。 */
  function selfTest(timeoutMs) {
    var ms = timeoutMs || 20000;
    return loadModel(ms).then(function () {
      return { ok: true, reason: "" };
    }).catch(function (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    });
  }

  window.LocalASR = {
    transcribe: transcribe,
    transcribeDetailed: transcribeDetailed,
    record: record,
    status: status,
    probe: probe,
    selfTest: selfTest,
    MODELS_DIR: MODELS_DIR,
    MODEL_ARCHIVE: MODEL_ARCHIVE,
    MODEL_ARCHIVE_URL: MODEL_ARCHIVE_URL,
    WORKER_FILE: WORKER_FILE
  };
})();
