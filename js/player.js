/* ============ 语音引擎：TTS 朗读（双音源）+ 录音 + 语音识别评测 ============ */
(function () {
  "use strict";

  const Player = {};

  let voices = [];
  let preferredVoice = null;
  let current = null;

  /* 优先选择的高质量英文发音人（按平台不同自动匹配）。
     注意：高音质「在线」音源（如 Edge 的 Online (Natural) 神经网络人声、Chrome 的 Google 在线人声）
     都通过浏览器原生 speechSynthesis 提供，无需依赖已被 Google 封禁的 translate_tts 接口。 */
  const HIGH_QUALITY = /natural|online|premium|neural|high.?quality|enhanced|wavenet/i;
  const GOOD_VOICES = /Google US English|Google UK English Female|Google UK English Male|Microsoft Aria|Microsoft Christopher|Microsoft Guy|Microsoft Jenny|Microsoft Sonia|Microsoft Zira|Microsoft Libby|Samantha|Daniel|Karen|Moira|Tessa|Fiona|Serena|Allison|Ava|Victoria|Thomas/i;

  /* 给英文发音人打分，数值越高越优先（满分 100） */
  function voiceScore(v) {
    const n = String(v.name || "").toLowerCase();
    const enUS = v.lang && v.lang.toLowerCase().indexOf("en-us") === 0;
    const enGB = v.lang && v.lang.toLowerCase().indexOf("en-gb") === 0;
    const en = v.lang && v.lang.toLowerCase().indexOf("en") === 0;
    let s = 0;
    if (HIGH_QUALITY.test(n)) s += 60;                 // 神经网络在线人声（微软自然/在线、谷歌在线）
    else if (GOOD_VOICES.test(n)) s += 35;              // 知名高质量人声
    if (enUS) s += 15;                                  // 美音优先（外贸英语常用）
    else if (enGB) s += 10;                             // 英音次之
    else if (en) s += 5;                                // 其它英语口音
    return s;
  }

  function loadVoices() {
    if (!("speechSynthesis" in window)) return;
    voices = window.speechSynthesis.getVoices();
    const en = voices.filter(function (v) {
      return v.lang && v.lang.toLowerCase().indexOf("en") === 0;
    });
    /* 排序：优先高质量在线/神经网络人声，其次美音/英音，最后任意英语发音人 */
    preferredVoice =
      en.slice().sort(function (a, b) { return voiceScore(b) - voiceScore(a); })[0] ||
      en.find(function (v) { return v.lang.toLowerCase() === "en-us"; }) ||
      en.find(function (v) { return v.lang.toLowerCase() === "en-gb"; }) ||
      en[0] ||
      null;
  }
  if ("speechSynthesis" in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  Player.supported = "speechSynthesis" in window;
  Player.canRecord = function () {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  };
  Player.voiceList = function () {
    return voices.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf("en") === 0; });
  };
  Player.voiceByName = function (name) {
    if (!name) return null;
    return voices.find(function (v) { return v.name === name; }) || null;
  };
  /* 用户全局指定的发音人（由 app 注入） */
  Player.defaultVoiceName = "";
  /* 在线音源自动回退到浏览器语音时的回调（由 app 注入，用于提示用户） */
  Player.onEngineFallback = null;

  /* 发音引擎：native（浏览器语音）| google（在线·不稳定）| azure（微软神经人声） */
  Player.engine = "native";

  /* ---------------- 文本切句 ---------------- */
  function splitSentences(text) {
    const raw = String(text).trim();
    let parts = raw.split(/(?<=[.!?;:])\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) parts = [raw];
    return parts;
  }
  function clampRate(r) { r = parseFloat(r) || 1; return Math.min(1.5, Math.max(0.5, r)); }

  /* ---------------- 音源一：浏览器内置 TTS（离线可用） ---------------- */
  Player.speakNative = function (text, opts) {
    if (!Player.supported) {
      if (opts && opts.onend) setTimeout(opts.onend, 0);
      return null;
    }
    opts = opts || {};
    if (current) current.stop();

    const parts = splitSentences(text);
    const total = parts.length;
    let idx = 0;
    let stopped = false;

    function pickVoice() {
      return opts.voice || Player.voiceByName(Player.defaultVoiceName) || preferredVoice;
    }

    function speakNext() {
      if (stopped) return;
      if (idx >= total) {
        if (opts.onend) opts.onend();
        return;
      }
      const u = new SpeechSynthesisUtterance(parts[idx]);
      const v = pickVoice();
      if (v) u.voice = v;
      u.rate = clampRate(opts.rate || 1);
      u.pitch = 1;
      u.volume = 1;
      u.onstart = function () { if (opts.onstart) opts.onstart(idx, total); };
      u.onend = function () { idx++; speakNext(); };
      u.onerror = function () { idx++; speakNext(); };
      window.speechSynthesis.speak(u);
    }
    speakNext();

    const handle = {
      engine: "native",
      stop: function () { stopped = true; window.speechSynthesis.cancel(); },
      total: total
    };
    current = handle;
    return handle;
  };

  /* ---------------- 音源二：Google 在线高音质 TTS ---------------- */
  const GOOGLE_TTS = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=";

  Player.googleSupported = function () { return !!window.Audio; };

  Player.speakGoogle = function (text, opts) {
    opts = opts || {};
    if (current) current.stop();

    const parts = splitSentences(text);
    const total = parts.length;
    let idx = 0;
    let stopped = false;
    let audio = null;

    function fallback(chunk) {
      /* 在线音源失败：自动回退到浏览器语音，保证能听到 */
      idx++;
      if (Player.supported && !stopped) {
        if (Player.onEngineFallback) Player.onEngineFallback();
        Player.speakNative(chunk, {
          rate: opts.rate,
          onend: function () { if (!stopped) playNext(); }
        });
      } else {
        playNext();
      }
    }

    function playNext() {
      if (stopped) return;
      if (idx >= total) {
        if (opts.onend) opts.onend();
        return;
      }
      const chunk = parts[idx];
      audio = new Audio();
      audio.src = GOOGLE_TTS + encodeURIComponent(chunk);
      audio.playbackRate = clampRate(opts.rate || 1);
      /* 在线音源可能被拦截（返回登录页/非音频内容）而不触发 onerror，
         这里用「已加载到真实音频时长」加上超时双重判定，确保失败时必然回退。 */
      let loaded = false;
      let fallen = false;
      const guard = setTimeout(function () {
        if (!loaded && !stopped && !fallen) {
          fallen = true;
          try { audio.pause(); } catch (e) { /* ignore */ }
          if (audio) { audio.src = ""; }
          fallback(chunk);
        }
      }, 9000);
      audio.addEventListener("loadedmetadata", function () {
        if (typeof audio.duration === "number" && isFinite(audio.duration) && audio.duration > 0) {
          loaded = true;
          clearTimeout(guard);
        }
      });
      audio.onended = function () { clearTimeout(guard); idx++; playNext(); };
      audio.onerror = function () {
        if (fallen || stopped) { if (!stopped) playNext(); return; }
        fallen = true;
        clearTimeout(guard);
        fallback(chunk);
      };
      audio.play().catch(function () {
        audio.onerror();
      });
    }
    playNext();

    const handle = {
      engine: "google",
      stop: function () {
        stopped = true;
        if (audio) { try { audio.pause(); } catch (e) { /* ignore */ } audio = null; }
      },
      total: total
    };
    current = handle;
    return handle;
  };

  /* ---------------- 音源三：Azure 语音（微软神经人声，需订阅 Key + Region） ----------------
     质量与 Google 在线语音同档甚至更自然，且是正规接口：浏览器用 Key 直接跨域调用 Azure Speech REST。
     失败时自动回退浏览器语音，保证能听到。 */
  Player.azure = { key: "", region: "", voice: "en-US-JennyNeural" };
  Player.azureSupported = function () {
    return !!(window.Audio && Player.azure && Player.azure.key && Player.azure.region);
  };
  function azureXmlEscape(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function azureRatePct(rate) { return Math.round((clampRate(rate) - 1) * 100); }
  function azureFetchSSML(chunk, rate) {
    const a = Player.azure;
    const region = String(a.region).replace(/[^A-Za-z0-9]/g, "");
    const url = "https://" + region + ".tts.speech.microsoft.com/cognitiveservices/v1";
    const p = azureRatePct(rate);
    const ssml = '<speak version="1.0" xml:lang="en-US"><voice name="' + a.voice + '">' +
      '<prosody rate="' + (p >= 0 ? "+" : "") + p + '%">' + azureXmlEscape(chunk) + '</prosody></voice></speak>';
    return fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": a.key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "fte-tutor"
      },
      body: ssml
    }).then(function (res) {
      if (!res.ok) throw new Error("Azure " + res.status);
      return res.arrayBuffer();
    }).then(function (buf) {
      return URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
    });
  }
  Player.speakAzure = function (text, opts) {
    opts = opts || {};
    if (current) current.stop();
    const parts = splitSentences(text);
    const total = parts.length;
    let idx = 0;
    let stopped = false;
    let audio = null;

    function fallback(chunk) {
      idx++;
      if (Player.supported && !stopped) {
        if (Player.onEngineFallback) Player.onEngineFallback();
        Player.speakNative(chunk, { rate: opts.rate, onend: function () { if (!stopped) playNext(); } });
      } else {
        playNext();
      }
    }
    function playNext() {
      if (stopped) return;
      if (idx >= total) { if (opts.onend) opts.onend(); return; }
      const chunk = parts[idx];
      azureFetchSSML(chunk, opts.rate).then(function (url) {
        if (stopped) return;
        audio = new Audio();
        audio.src = url;
        audio.playbackRate = 1;
        audio.onended = function () { if (!stopped) { idx++; playNext(); } };
        audio.onerror = function () { if (!stopped) fallback(chunk); };
        audio.play().catch(function () { if (!stopped) fallback(chunk); });
      }).catch(function () { if (!stopped) fallback(chunk); });
    }
    playNext();
    const handle = {
      engine: "azure",
      stop: function () { stopped = true; if (audio) { try { audio.pause(); } catch (e) { /* ignore */ } audio = null; } },
      total: total
    };
    current = handle;
    return handle;
  };

  /* Azure 连通性自检：用当前填入的 Key/Region 试合成一句，返回成功或带状态码的错误 */
  Player.testAzure = function (cfgInput) {
    const a = cfgInput || Player.azure;
    if (!a || !a.key || !a.region) return Promise.reject(new Error("请先填写 Azure 订阅 Key 和 Region"));
    const region = String(a.region).replace(/[^A-Za-z0-9]/g, "");
    const url = "https://" + region + ".tts.speech.microsoft.com/cognitiveservices/v1";
    const ssml = '<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">Hello, testing the voice.</voice></speak>';
    return fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": a.key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3"
      },
      body: ssml
    }).then(function (res) {
      if (!res.ok) {
        return res.text().catch(function () { return ""; }).then(function (body) {
          throw new Error("Azure 返回 " + res.status +
            (res.status === 401 ? "（Key 无效或已过期）" :
             res.status === 403 ? "（区域或权限不允许，检查 Region 是否正确）" :
             res.status === 429 ? "（免费额度超限或限流）" : "") +
            (body ? "：" + body.slice(0, 120) : ""));
        });
      }
      return res.arrayBuffer().then(function (b) {
        if (!b || !b.byteLength) throw new Error("返回为空：Key 无效或配额已用尽");
        return true;
      });
    });
  };

  /* ---------------- 统一入口 ---------------- */
  Player.speak = function (text, opts) {
    if (Player.engine === "azure" && Player.azureSupported()) return Player.speakAzure(text, opts);
    if (Player.engine === "google" && Player.googleSupported()) return Player.speakGoogle(text, opts);
    return Player.speakNative(text, opts);
  };

  Player.stop = function () {
    if (current) current.stop();
  };

  /* ---------------- 录音（跟读回放对比） ---------------- */
  let mediaRecorder = null;
  let chunks = [];
  let stream = null;

  Player.startRecording = function () {
    return new Promise(function (resolve, reject) {
      if (!Player.canRecord()) {
        reject(new Error("no-media"));
        return;
      }
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function (s) {
          stream = s;
          chunks = [];
          mediaRecorder = new MediaRecorder(s);
          mediaRecorder.ondataavailable = function (e) {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };
          mediaRecorder.start();
          resolve();
        })
        .catch(function (err) {
          reject(new Error(err && err.name ? err.name : "denied"));
        });
    });
  };

  Player.stopRecording = function () {
    return new Promise(function (resolve) {
      if (!mediaRecorder) { resolve(null); return; }
      mediaRecorder.onstop = function () {
        const type = (mediaRecorder && mediaRecorder.mimeType) || "audio/webm";
        const blob = new Blob(chunks, { type: type });
        if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); }
        mediaRecorder = null;
        stream = null;
        resolve(URL.createObjectURL(blob));
      };
      mediaRecorder.stop();
    });
  };

  Player.isRecording = function () {
    return mediaRecorder && mediaRecorder.state === "recording";
  };

  /* ---------------- 录音波形可视化 ----------------
     从录音 blob URL 解码音频，绘制振幅波形到 canvas，方便与原文节奏对比。
     返回 Promise（成功 true / 环境不支持或解码失败返回 false，不影响业务）。 */
  Player.waveColor = "#2563eb";
  Player.waveform = function (url, canvas) {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!url || !canvas || !Ctx) return Promise.resolve(false);
    return fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      var ctx = Player.waveCtx = Player.waveCtx || new Ctx();
      return ctx.decodeAudioData(buf).then(function (audioBuf) {
        var data = audioBuf.getChannelData(0);
        var W = canvas.width, H = canvas.height;
        var g = canvas.getContext("2d");
        g.clearRect(0, 0, W, H);
        var mid = H / 2;
        var step = Math.max(1, Math.floor(data.length / W));
        g.fillStyle = Player.waveColor;
        for (var x = 0; x < W; x++) {
          var min = 1, max = -1;
          var start = x * step;
          for (var i = 0; i < step && start + i < data.length; i++) {
            var v = data[start + i];
            if (v < min) min = v;
            if (v > max) max = v;
          }
          if (max < 0) max = 0;
          if (min > 0) min = 0;
          var top = mid - max * H * 0.45;
          var hgt = Math.max(1, (max - min) * H * 0.45);
          g.fillRect(x, top, 1, hgt);
        }
        return true;
      });
    }).catch(function () { return false; });
  };

  /* ---------------- 语音识别评测（逐词打分） ---------------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  Player.recognitionSupported = function () { return !!SR; };
  /* 浏览器语音识别（依赖 Google 服务）。国内无法直连时，请改用系统语音输入（Web Speech、软键盘听写）。 */
  Player.recognitionHint = "语音识别依赖 Google 服务。若你开了 VPN/代理仍报错，多为 Chrome 未走代理：请在 Chrome 设置 → 系统 → 开启「使用系统代理」(或让 VPN 全局接管)，或切换其他能连通 Google 的网络。若始终不可用，可用系统语音听写（光标放输入框后按 Win+H 说话）作为兜底。";

  /* 开始一次实时识别。opts: { lang, onResult(text,isFinal), onEnd(text), onError(err), retries }
     返回 { stop() }。对 no-speech / 一过性 network 错误自动重试（VPN 场景常见）。 */
  Player.recognize = function (opts) {
    opts = opts || {};
    if (!Player.recognitionSupported()) {
      if (opts.onError) opts.onError(new Error("unsupported"));
      return null;
    }
    const maxRetry = (opts.retries == null) ? 2 : opts.retries;
    let finalText = "";
    let stopped = false;
    let rec = null;
    let retried = 0;

    function startOne() {
      try { rec = new SR(); } catch (e) {
        if (opts.onError) opts.onError(e);
        return null;
      }
      rec.lang = opts.lang || "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.continuous = false;

      rec.onresult = function (e) {
        let t = "";
        for (let i = 0; i < e.results.length; i++) {
          t += e.results[i][0].transcript;
        }
        finalText = t;
        if (opts.onResult) opts.onResult(t, e.results.length ? e.results[e.results.length - 1].isFinal : true);
      };
      rec.onend = function () {
        if (!stopped && opts.onEnd) opts.onEnd(finalText);
      };
      rec.onerror = function (ev) {
        const code = ev && ev.error ? ev.error : "error";
        /* 网络抖动 / 未说话：自动重试一次，提升 VPN 场景稳定 */
        if (!stopped && retried < maxRetry && (code === "network" || code === "no-speech" || code === "aborted")) {
          retried++;
          try { rec.start(); } catch (e) { /* fallthrough */ }
          return;
        }
        if (opts.onError) opts.onError(code);
      };
      try { rec.start(); } catch (e) {
        if (opts.onError) opts.onError(e);
        return null;
      }
      return rec;
    }

    const started = startOne();
    if (!started) return null;
    return {
      stop: function () { stopped = true; try { if (rec) rec.stop(); } catch (e) { /* ignore */ } }
    };
  };

  /* 先请求麦克风权限（把权限问题前置，给出清晰提示）。resolve 后即可调用 recognize */
  Player.micRequest = function () {
    return new Promise(function (resolve, reject) {
      if (!Player.canRecord() || !navigator.mediaDevices) {
        reject(new Error("no-media"));
        return;
      }
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function (stream) {
          stream.getTracks().forEach(function (t) { t.stop(); });
          resolve();
        })
        .catch(function (err) {
          const name = err && err.name ? err.name : "denied";
          let code = name.toLowerCase();
          if (name === "NotAllowedError") code = "not-allowed";
          if (name === "NotFoundError" || name === "NotReadableError") code = "audio-capture";
          if (name === "SecurityError") code = "service-not-allowed";
          reject(new Error(code));
        });
    });
  };

  /* 将语音识别/麦克风错误码翻译成可操作的提示（空字符串表示无需提示，如用户主动停止） */
  Player.recErrorText = function (err) {
    const e = String(err && err.message ? err.message : err).toLowerCase();
    const map = {
      "not-allowed": "麦克风权限被拒绝：请点击浏览器地址栏左侧的麦克风图标，选择「允许」后重试",
      "service-not-allowed": "语音服务被拒绝：请在浏览器设置中允许本网站使用麦克风，然后刷新页面重试",
      "network": "语音识别网络错误：Chrome 语音服务依赖 Google，若你已开 VPN/代理仍失败，多为 Chrome 未走代理（建议 Chrome→设置→系统→开启「使用系统代理」），或以干净环境重试",
      "no-speech": "没有听到声音：请靠近麦克风、保持环境安静后重试",
      "audio-capture": "未检测到麦克风设备：请检查麦克风连接与系统设置",
      "aborted": "",
      "no-media": "当前环境不支持麦克风：建议通过本地服务器（python -m http.server 8000）打开页面",
      "denied": "无法使用麦克风：请在浏览器设置中允许麦克风权限后重试",
      "unsupported": "当前浏览器不支持语音识别（Web Speech 仅 Chrome/Edge 完整支持），建议使用 Chrome / Edge"
    };
    if (Object.prototype.hasOwnProperty.call(map, e)) return map[e];
    return "语音识别失败（" + e + "）：建议使用 Chrome/Edge、联网并允许麦克风权限";
  };

  /* 探测浏览器语音识别是否可用 + Google 语音服务是否可达（VPN/代理环境下用于诊断） */
  Player.testSpeechReach = function () {
    return new Promise(function (resolve) {
      const html = String(Math.random()).slice(2, 8);
      const img = new Image();
      img.onload = function () { resolve({ srSupported: Player.recognitionSupported(), googleReachable: true }); };
      img.onerror = function () { resolve({ srSupported: Player.recognitionSupported(), googleReachable: false }); };
      img.src = "https://www.google.com/generate_204?_=" + html;
      setTimeout(function () { resolve({ srSupported: Player.recognitionSupported(), googleReachable: null, timeout: true }); }, 6000);
    });
  };

  window.Player = Player;
})();
