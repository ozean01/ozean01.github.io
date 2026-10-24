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

  /* ---------------- 听力口音开关（P7 · 借鉴 ENGSENCE 的双口音） ----------------
     ⚠️ 口径边界（不可越界）：本站音标、词库、审计基线一律保持「美式通用口音 GA」
     （见 README「音标口径」；tools/audit-ipa.js 以此为基线）。这里切换的**只是用来朗读的人声**，
     不改音标、不改课程数据、不新增英式音标注解。
     双口音的价值在外贸场景：同一段材料用美音/英音各过一遍，适应不同国家买家的口音。
     优先级：单次 opts.voice > 手动指定发音人 > 口音开关 > 自动优选。 */
  const ACCENT_KEY = "fte-accent";
  Player.accent = (function () {
    try { const a = localStorage.getItem(ACCENT_KEY); return (a === "uk" || a === "us") ? a : "us"; } catch (e) { return "us"; }
  })();
  Player.setAccent = function (a) {
    if (a !== "us" && a !== "uk") return;
    Player.accent = a;
    try { localStorage.setItem(ACCENT_KEY, a); } catch (e) { /* ignore */ }
  };
  function accentVoice(a) {
    const want = ((a || Player.accent) === "uk") ? "en-gb" : "en-us";
    const cand = voices.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(want) === 0; });
    if (!cand.length) return null;
    return cand.slice().sort(function (x, y) { return voiceScore(y) - voiceScore(x); })[0];
  }
  /* 本机是否装了对应口音的人声（UI 据此提示"需装语音包"而不是静默回退） */
  Player.hasAccent = function (a) {
    const want = (a === "uk") ? "en-gb" : "en-us";
    return voices.some(function (v) { return v.lang && v.lang.toLowerCase().indexOf(want) === 0; });
  };
  Player.accentVoiceName = function (a) { const v = accentVoice(a); return v ? v.name : ""; };

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
      return opts.voice || Player.voiceByName(Player.defaultVoiceName) || accentVoice() || preferredVoice;
    }

    /* P1-B：浏览器语音这一路切不过去时**不静默**。
       本函数也是 Azure/Google 失败后的回退出口（那时 Player.engine 仍是 azure/google），
       所以这里显式按 "native" 问能力：回退后到底还是不是用户选的口音，由本机人声说了算。
       只报一次（每句都报会刷屏）；UI 未接线时 lastAccentIssue 仍可被查询到。 */
    let accentNoted = false;
    function noteAccentOnce(v) {
      if (accentNoted) return;
      accentNoted = true;
      const cap = Player.accentCapability(Player.accent, "native");
      if (cap.supported && cap.effectiveAccent === cap.accent) { Player.lastAccentIssue = null; return; }
      Player.lastAccentIssue = {
        at: Date.now(), accent: cap.accent, engine: "native",
        voice: (v && v.name) || "", reason: cap.reason || ("实际听到的是 " + cap.effectiveAccent)
      };
      if (Player.onAccentUnsupported) Player.onAccentUnsupported(Player.lastAccentIssue);
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
      noteAccentOnce(v);
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
  /* P1-B：口音要真的传下去。英音发 tl=en-GB；美音保持既有的 tl=en（Google 对 en 的默认即美音），
     不动一条本来就能用的路径。
     ⚠️ 这个接口**不回报实际音色**，所以 Player.accentCapability() 对 Google 一律给 verified:false ——
     只能说「已按英音请求」，不能说「已切到英音」，更不能由 UI 假装切了。 */
  const GOOGLE_TTS = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=";
  function googleTl(a) { return ((a || Player.accent) === "uk") ? "en-GB" : "en"; }

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
      /* 在线音源失败：自动回退到浏览器语音，保证能听到。
         P2-1（真机复现的静默中断）：`Player.speakNative` 内部会 `current.stop()`，而 `current`
         此刻正是**本闭包自己的 handle**——它的 stop() 会把下面 onend 里要读的 `stopped` 置真，
         于是第一句回退播出后 `playNext()` 直接 return，连听 / 字幕连播就此静默卡死。
         修法：进回退前先把自己从 `current` 摘掉，让 speakNative 无从 stop 本闭包。 */
      idx++;
      if (Player.supported && !stopped) {
        if (Player.onEngineFallback) Player.onEngineFallback();
        current = null;
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
      audio.src = GOOGLE_TTS + googleTl(Player.accent) + "&q=" + encodeURIComponent(chunk);
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
  /* P1-B：Azure 口音人声映射与「生效发音人」的唯一推导处。
     改前 azureFetchSSML 把 xml:lang 写死 en-US、voice 取 Player.azure.voice（出厂默认
     en-US-JennyNeural），于是「选英音 + Azure 引擎」= 设置面板显示英音、耳朵听到美音（静默失效）。
     现在：us → en-US-*，uk → en-GB-*，且 xml:lang 由 voice 的 locale 前缀推导——两者永不打架。
     优先级（与函数头声明的全站口径一致）：单次 opts.voice > 手动指定发音人 > 口音开关 > 自动优选。 */
  Player.AZURE_DEFAULT_VOICE = "en-US-JennyNeural";
  const AZURE_ACCENT_VOICE = { us: "en-US-JennyNeural", uk: "en-GB-SoniaNeural" };
  Player.AZURE_ACCENT_VOICE = AZURE_ACCENT_VOICE;
  /* 口音取值：与 accentVoice() 同一口径 —— 显式传入优先，其次 Player.accent，最后美音。 */
  function accentWant(a) { return ((a || Player.accent) === "uk") ? "uk" : "us"; }
  /* 从 Azure 发音人名里取 locale（en-GB-SoniaNeural → en-GB）。取不到返回 ""，由调用方兜底。 */
  function langOfVoice(name) {
    const m = String(name || "").match(/^([a-z]{2})-([A-Za-z]{2})/);
    return m ? (m[1] + "-" + m[2]) : "";
  }
  function accentOfLang(lang) {
    const s = String(lang || "").toLowerCase();
    if (s.indexOf("en-gb") === 0) return "uk";
    if (s.indexOf("en-us") === 0) return "us";
    return "";
  }
  /* 「手动指定发音人」= 填了、且**不是出厂默认值**。
     为什么用默认值当哨兵：app.js（不在本组范围）在未填写时也会回填 en-US-JennyNeural
     （app.js:232 / :4586），所以「非空」不能当作「手动指定」的判据，否则口音开关永远被它压住。 */
  Player.azureManualVoice = function () {
    const v = (Player.azure && Player.azure.voice) ? String(Player.azure.voice).trim() : "";
    if (!v || v === Player.AZURE_DEFAULT_VOICE) return "";
    return v;
  };
  /* 本次朗读真正会用的 Azure 人声与 xml:lang。导出供 UI/测试查询，避免「看起来切了」。 */
  function azurePlan(opts) {
    const o = opts || {};
    const want = accentWant(o.accent);
    const oneShot = o.voice ? String(o.voice).trim() : "";
    const manual = Player.azureManualVoice();
    let voice, source;
    if (oneShot) { voice = oneShot; source = "opts.voice"; }
    else if (manual) { voice = manual; source = "manual"; }
    else { voice = AZURE_ACCENT_VOICE[want] || Player.AZURE_DEFAULT_VOICE; source = "accent"; }
    const lang = langOfVoice(voice) || (want === "uk" ? "en-GB" : "en-US");
    return { requested: want, voice: voice, lang: lang, source: source, effective: accentOfLang(lang) };
  }
  Player.azurePlan = azurePlan;
  Player.azureSupported = function () {
    return !!(window.Audio && Player.azure && Player.azure.key && Player.azure.region);
  };
  function azureXmlEscape(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function azureRatePct(rate) { return Math.round((clampRate(rate) - 1) * 100); }
  function azureFetchSSML(chunk, rate, opts) {
    const a = Player.azure;
    const region = String(a.region).replace(/[^A-Za-z0-9]/g, "");
    const url = "https://" + region + ".tts.speech.microsoft.com/cognitiveservices/v1";
    const pct = azureRatePct(rate);
    /* P1-B：口音真正生效的地方——xml:lang 与 voice 都按 azurePlan 走，不再写死 en-US/Jenny。 */
    const plan = azurePlan(opts);
    const ssml = '<speak version="1.0" xml:lang="' + plan.lang + '"><voice name="' + plan.voice + '">' +
      '<prosody rate="' + (pct >= 0 ? "+" : "") + pct + '%">' + azureXmlEscape(chunk) + '</prosody></voice></speak>';
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
        current = null;   /* P2-1：与 speakGoogle 同一处自锁，见那里的说明 */
        Player.speakNative(chunk, { rate: opts.rate, onend: function () { if (!stopped) playNext(); } });
      } else {
        playNext();
      }
    }
    function playNext() {
      if (stopped) return;
      if (idx >= total) { if (opts.onend) opts.onend(); return; }
      const chunk = parts[idx];
      azureFetchSSML(chunk, opts.rate, opts).then(function (url) {
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
    /* P1-B：连通性自检也必须按当前口音试，否则「测试通过」证明不了英音这条路能用。
       cfg.voice 为出厂默认值时同样按「未手动指定」处理（app.js:4640 总会回填默认值）。 */
    const cfgVoice = (a.voice && a.voice !== Player.AZURE_DEFAULT_VOICE) ? a.voice : "";
    const plan = azurePlan({ voice: cfgVoice, accent: Player.accent });
    const ssml = '<speak version="1.0" xml:lang="' + plan.lang + '"><voice name="' + plan.voice + '">Hello, testing the voice.</voice></speak>';
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

  /* ---------------- 口音能力查询（P1-B） ----------------
     由来（S05 · D1）：Azure 路径的 SSML 写死 en-US、Google 路径无口音参数，而设置面板照旧显示
     「当前：英音」——**人声可切、实际没切**，是最容易让学员学到错东西的一种失败：他会以为
     这就是英音。所以本组把「到底切没切」做成一个可查询、可测试的返回值，UI 照它说话：
       · 引擎做不到（如本机没装 en-GB 人声）→ supported:false + 中文 reason；
       · 请求发下去了但无法验证（Google 在线接口不回报音色）→ verified:false，不得宣称「已切」；
       · 手动指定了发音人 → 以手动为准，effectiveAccent 如实回报（不等同 requested）。
     返回 { requested, accent, engine, supported, verified, effectiveVoice, effectiveAccent, reason }。 */
  Player.lastAccentIssue = null;
  /* UI 可注入：口音确实没切过去时被调用一次（与 Player.onEngineFallback 同一套「由 app 注入」的模式）。 */
  Player.onAccentUnsupported = null;

  const ENGINE_LABEL = { native: "浏览器语音", google: "Google 在线", azure: "Azure 神经人声" };
  const ACCENT_LABEL = { us: "美音", uk: "英音" };

  Player.accentCapability = function (a, engineOverride) {
    const want = accentWant(a);
    let engine = engineOverride || Player.engine;
    if (engine !== "azure" && engine !== "google") engine = "native";
    const out = {
      requested: want, accent: want, engine: engine,
      supported: false, verified: false,
      effectiveVoice: "", effectiveAccent: "", reason: ""
    };

    if (engine === "azure") {
      const p = azurePlan({ accent: want });
      out.supported = true;          /* Azure 由本站选 voice + xml:lang，一定能切 */
      out.verified = true;
      out.effectiveVoice = p.voice;
      out.effectiveAccent = p.effective || "other";
      if (p.source === "manual" && p.effective && p.effective !== want) {
        out.reason = "已手动指定发音人 " + p.voice + "（" + p.lang + "），手动优先，口音开关不生效";
      }
      return out;
    }

    if (engine === "google") {
      /* 能传参数（tl=en-GB），但拿不到「实际是什么音色」的回报——只能说请求已按口音发出。 */
      out.supported = true;
      out.verified = false;
      out.effectiveAccent = want;
      out.effectiveVoice = "Google 在线人声（tl=" + googleTl(want) + "）";
      out.reason = "Google 在线接口按 tl=" + googleTl(want) + " 请求，服务端不保证音色，本机无法验证";
      return out;
    }

    /* native：要看本机装了哪套人声；手动指定发音人时同样以手动为准 */
    const manual = Player.voiceByName(Player.defaultVoiceName);
    if (manual && manual.lang) {
      out.supported = true;
      out.verified = true;
      out.effectiveVoice = manual.name;
      out.effectiveAccent = accentOfLang(manual.lang) || "other";
      if (out.effectiveAccent !== want) {
        out.reason = "已手动指定发音人 " + manual.name + "（" + manual.lang + "），手动优先，口音开关不生效";
      }
      return out;
    }
    const v = accentVoice(want);
    if (v) {
      out.supported = true;
      out.verified = true;
      out.effectiveVoice = v.name;
      out.effectiveAccent = accentOfLang(v.lang) || "other";
      return out;
    }
    out.reason = "本机没装" + ACCENT_LABEL[want] + "人声，会回退默认发音人（可在系统「语音」里装语音包，" +
      "或在设置里手动指定一个" + ACCENT_LABEL[want] + "发音人）";
    return out;
  };

  /* 给 UI 一句话结论（可直接塞进设置面板的说明行）。UI 未接线时，Player.lastAccentIssue
     仍会记下真实的失败，不静默。 */
  Player.accentHint = function (a, engineOverride) {
    const cap = Player.accentCapability(a, engineOverride);
    const label = ACCENT_LABEL[cap.accent];
    const engName = ENGINE_LABEL[cap.engine] || cap.engine;
    if (!cap.supported) {
      return "⚠️ 当前音源（" + engName + "）切不到" + label + "：" + cap.reason;
    }
    if (cap.effectiveAccent && cap.effectiveAccent !== cap.accent) {
      const got = ACCENT_LABEL[cap.effectiveAccent] || "其他英语口音";
      return "⚠️ 实际听到的是" + got + "（" + cap.effectiveVoice + "）：" + cap.reason;
    }
    if (!cap.verified) {
      return "ℹ️ 已按" + label + "请求（" + cap.effectiveVoice + "）：" + cap.reason;
    }
    return "✅ 已切到" + label + "（" + cap.effectiveVoice + "，" + engName + "）";
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

  /* ---------------- 复读次数 / 间隔（P10 · 词级跟读） ----------------
     由来：一轮外部素材评估（发音纠正器 corrector.justsong.cn 的「复读次数 / 复读间隔 /
     发音延时 / 超时」）指出——站内已有录音回放、A-B 对照与原声波形，但**录音只做在句子层**，
     单词只能点一次朗读；而 `phonemes.js` 早就有「练一个音」的粒度（10 组高危音 + 行业例词），
     却缺「听几遍 → 跟读 → 听自己」这一环。故补两件东西：① 复读次数的偏好；
     ② `Player.repeat()` —— 把「读 N 次、每次之间留出跟读窗口」做成**唯一实现**。

     ⚠️ 三条边界（越界就是重复造实现 or 破坏既有链式播放）：
       ① **绝不动 `Player.speak` 的 `onend` 语义**。「连听本单元 / 自动连播 / A-B 复读 /
          五阶段闯关 / AI 陪练的 VAD 循环」都靠 `onend` 逐句推进，把 onend 乘上复读次数
          会让它们一句播 N 遍、连播重复触发。复读因此走**独立入口** `Player.repeat()`，
          回调名另取 `onDone`，只在**最后一轮**结束后调一次。
       ② **只认最后一条朗读链**：每轮之间用 `seq` 令牌递增，中途 `Player.speak` 或
          `Player.repeat` 被再次调用时，旧链自动失效（避免"停了又自己往下读"——
          与「连听本单元」同一套 gen 令牌纪律）。
       ③ **间隔下限 500ms**：低于此值不能算"跟读窗口"，只是把同一个词连读两遍。 */

  const REPEAT_KEY = "fte-rep";
  /* 偏好形状 {n, gap}：n = 复读次数 1–5，gap = 每轮之间的跟读窗口秒数 0.5–5（步长 0.5）。
     非法值一律回落默认，不抛错、不写坏存储。 */
  function clampRepeat(v) {
    const n = parseInt(v, 10);
    if (!(n >= 1)) return 1;
    return n > 5 ? 5 : n;
  }
  function clampGap(v) {
    const g = parseFloat(v);
    if (!(g >= 0.5)) return 0.5;
    return g > 5 ? 5 : Math.round(g * 2) / 2;
  }
  Player.clampRepeat = clampRepeat;
  Player.clampGap = clampGap;
  Player.repPref = (function () {
    const D = { n: 2, gap: 1.5 };
    try {
      const raw = localStorage.getItem(REPEAT_KEY);
      if (!raw) return D;
      const o = JSON.parse(raw) || {};
      return { n: clampRepeat(o.n), gap: clampGap(o.gap) };
    } catch (e) { return D; }
  })();
  Player.setRepPref = function (n, gap) {
    const next = { n: clampRepeat(n), gap: clampGap(gap) };
    Player.repPref = next;
    try { localStorage.setItem(REPEAT_KEY, JSON.stringify(next)); } catch (e) { /* 隐私模式：本次生效 */ }
    return next;
  };

  let repSeq = 0;

  /* 估算一段文本的朗读时长（毫秒）。**只**用于"引擎不回调 onend"时的兜底推进：
     正常浏览器一律以真实 onend 为准，估算值只在失联时接手（避免跟读链卡死）。 */
  function estimateSpeechMs(text, rate) {
    const s = String(text || "").trim();
    if (!s) return 400;
    const words = s.split(/\s+/).filter(Boolean).length || Math.ceil(s.length / 5);
    const punct = (s.match(/[.,;:!?]/g) || []).length;
    return Math.round((words * 330 + punct * 120 + 400) / clampRate(rate));
  }
  Player.estimateSpeechMs = estimateSpeechMs;

  /* 读 text 共 n 次，每次**读完**停 gap 秒（留给你跟读），最后一轮读完并停满 gap 后调 onDone。
     返回 {stop} 句柄；自带 seq 令牌，被后来的朗读/复读打断即自行失效。

     ★ 修复（真实使用反馈：「跟读按钮放出的仍是系统声音，不是让我录音」）：
       老实现是「读一次 → 立刻 setTimeout(gap) → 再读」——定时器从**开始朗读**那一刻算起，
       而不是从**读完**那一刻算起。于是：
         ① 句子比 gap 长时，第二轮会在第一轮还没读完时抢麦，Player.speak 内部把上一条 stop 掉，
            用户听到的是被截断又重来的系统音；
         ② repeat 的 onDone 在固定的 n×gap 秒后就触发，跟读录音**在系统朗读尚未结束时就开录**，
            麦克风把扬声器里的标准音一起录进去 —— 回放"我的录音"听到的自然还是系统声音。
       本修复让每一轮严格等 onend，再计 gap；onDone 只在最后一轮"读完 + 停满 gap"之后触发一次。
       另加 onRound(k, n) 回调，供 UI 显示"第几遍"，不改 Player.speak 的 onend 语义。 */
  Player.repeat = function (text, opts) {
    const o = opts || {};
    const n = clampRepeat(o.n === undefined ? Player.repPref.n : o.n);
    const gap = clampGap(o.gap === undefined ? Player.repPref.gap : o.gap);
    const my = ++repSeq;
    let done = 0;
    let timer = null;        // 跟读窗口倒计时
    let watchdog = null;     // onend 失联时的兜底
    const alive = function () { return my === repSeq; };
    const clearTimers = function () {
      if (timer) { clearTimeout(timer); timer = null; }
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
    };

    function round() {
      if (!alive()) return;
      clearTimers();
      if (done >= n) {
        if (o.onDone) o.onDone();      /* 最后一轮的 gap 已经走完，此后麦克风才该开 */
        return;
      }
      done++;
      if (o.onRound) o.onRound(done, n);
      let advanced = false;
      const advance = function () {
        if (advanced || !alive()) return;
        advanced = true;
        clearTimers();
        timer = setTimeout(round, gap * 1000);
      };
      /* 每轮都重新走统一入口，音源被切换也能生效（与 Player.speak 同一口径） */
      if (Player.speak) Player.speak(text, { rate: o.rate, onend: advance });
      else advance();
      watchdog = setTimeout(advance, estimateSpeechMs(text, o.rate) + 1500);
    }
    round();

    return {
      stop: function () {
        clearTimers();
        if (my === repSeq) repSeq++;          /* 让后续定时器与 onDone 都失效 */
        Player.stop();
      },
      total: n,
      gap: gap
    };
  };

  /* ---------------- 录音（跟读回放对比） ----------------
     ★ 2026-10-11 追加 opts.onLevel(rms)：复用**同一条** getUserMedia 流做电平表。
       为什么要它：「跟读」对用户最大的不确定是"到底有没有在录我"——只靠一行文字，
       点了按钮的人分不清"在听标准音"还是"在录我"。有了电平表 + 峰值，UI 就能
       ① 实时显示麦克风在动；② 录完判断"本次几乎没声音"并如实告知，而不是给个 0 分让人以为是自己读错。
       这是**旁挂**能力：不传 opts 的既有调用方（音素页 / 听说训练 / 五洲实战）行为完全不变。 */
  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let levelCtx = null, levelAnalyser = null, levelTimer = null;
  let lastPeak = 0;

  function stopLevelMeter() {
    if (levelTimer) { clearInterval(levelTimer); levelTimer = null; }
    try { if (levelCtx && levelCtx.close) levelCtx.close(); } catch (e) { /* ignore */ }
    levelCtx = null; levelAnalyser = null;
  }
  /* 本次录音的峰值电平（0..1）。UI 用它区分"没说话 / 声音太小 / 正常"。 */
  Player.lastMicPeak = function () { return lastPeak; };

  Player.startRecording = function (opts) {
    const o = opts || {};
    return new Promise(function (resolve, reject) {
      if (!Player.canRecord()) {
        reject(new Error("no-media"));
        return;
      }
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function (s) {
          stream = s;
          chunks = [];
          lastPeak = 0;
          mediaRecorder = new MediaRecorder(s);
          mediaRecorder.ondataavailable = function (e) {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };
          mediaRecorder.start();
          if (typeof o.onLevel === "function") {
            try {
              const Ctx = window.AudioContext || window.webkitAudioContext;
              levelCtx = new Ctx();
              const src = levelCtx.createMediaStreamSource(s);
              levelAnalyser = levelCtx.createAnalyser();
              levelAnalyser.fftSize = 1024;
              src.connect(levelAnalyser);
              const buf = new Float32Array(levelAnalyser.fftSize);
              levelTimer = setInterval(function () {
                if (!levelAnalyser) return;
                levelAnalyser.getFloatTimeDomainData(buf);
                let sum = 0;
                for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
                const rms = Math.sqrt(sum / buf.length);
                if (rms > lastPeak) lastPeak = rms;
                try { o.onLevel(rms); } catch (e) { /* 回调是 UI 的事，不拖垮录音 */ }
              }, 100);
            } catch (e) { /* 电平表是增强项：拿不到就静默降级，绝不影响录音本身 */ }
          }
          resolve();
        })
        .catch(function (err) {
          reject(new Error(err && err.name ? err.name : "denied"));
        });
    });
  };

  Player.stopRecording = function () {
    return new Promise(function (resolve) {
      stopLevelMeter();
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

  /* ---------------- 波形可视化（原声对照 + 录音回放，共用唯一绘制实现） ----------------
     两类调用方：
       ① 跟读录音回放（app.js）：只要振幅，不传 opts；
       ② 字幕点读的原声波形（subtitle.js · P8）：传 opts.seg = { start, end } 高亮当前句，
          与下方"我的录音"波形上下对照，练的是报价/交期/异议处理的节奏。
     为什么区间→像素的映射放在本模块：它要用**解码后的真实时长**，而这个时长只有这里知道；
     放到调用方就得把 duration 传出去，等于把同一套映射写两份（违反单一数据源）。
     P8 诚实边界：超长媒资拒绝解码（解码整段视频会吃掉内存），失败一律返回 false，
     由调用方给出明确说明 —— 不静默、不假装画出来了。 */
  Player.waveColor = "#2563eb";
  Player.waveSegColor = "#94a3b8";
  Player.WAVE_MAX_SEC = 1200;              // 20 分钟：超过则不解码（短视频/播客足够）
  let waveCache = { url: "", buf: null };  // 单条缓存：逐句点读会反复重画，不能每次重解码

  /* 纯函数：把 [start, end]（秒）映射为画布像素区间 { x0, x1 }。
     口径：夹取到 [0, width]；x1 至少比 x0 大 1px（否则高亮带宽度为 0，看上去像"没高亮"）。
     非法输入（非正时长/宽度、非数字端点）返回 null —— 调用方据此不做高亮。 */
  Player.waveSegRange = function (start, end, duration, width) {
    if (typeof start !== "number" || typeof end !== "number") return null;
    if (!(duration > 0) || !(width > 0)) return null;
    const clamp = function (v) { return Math.max(0, Math.min(duration, v)); };
    const a = clamp(start), b = clamp(end);
    let x0 = Math.floor(a / duration * width);
    let x1 = Math.ceil(b / duration * width);
    if (x0 < 0) x0 = 0;
    if (x1 > width) x1 = width;
    if (x1 <= x0) x1 = Math.min(width, x0 + 1);
    return { x0: x0, x1: x1 };
  };

  /* 内部唯一绘制实现：高亮带先铺底，振幅棒画在上面 */
  function drawWave(audioBuf, canvas, opts) {
    const o = opts || {};
    const data = audioBuf.getChannelData(0);
    const W = canvas.width, H = canvas.height;
    const g = canvas.getContext("2d");
    if (!g) return false;
    g.clearRect(0, 0, W, H);
    const band = Player.waveSegRange(o.seg && o.seg.start, o.seg && o.seg.end, audioBuf.duration, W);
    if (band) {
      g.fillStyle = o.segColor || Player.waveSegColor;
      g.globalAlpha = 0.28;
      g.fillRect(band.x0, 0, Math.max(1, band.x1 - band.x0), H);
      g.globalAlpha = 1;
    }
    const mid = H / 2;
    const step = Math.max(1, Math.floor(data.length / W));
    g.fillStyle = o.color || Player.waveColor;
    for (let x = 0; x < W; x++) {
      let min = 1, max = -1;
      const start = x * step;
      for (let i = 0; i < step && start + i < data.length; i++) {
        const v = data[start + i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (max < 0) max = 0;
      if (min > 0) min = 0;
      const top = mid - max * H * 0.45;
      const hgt = Math.max(1, (max - min) * H * 0.45);
      g.fillRect(x, top, 1, hgt);
    }
    return true;
  }

  /* 解码一次并缓存；环境不支持 / 无音轨 / 解码失败 / 超长 → null（不是 false：
     让调用方拿到"没画"的原因由自己决定文案，本模块不替它编话术） */
  function decodeWave(url) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!url || !Ctx) return Promise.resolve(null);
    if (waveCache.url === url && waveCache.buf) return Promise.resolve(waveCache.buf);
    return fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      const ctx = Player.waveCtx = Player.waveCtx || new Ctx();
      return ctx.decodeAudioData(buf).then(function (audioBuf) {
        if (!(audioBuf.duration > 0) || audioBuf.duration > Player.WAVE_MAX_SEC) return null;
        waveCache = { url: url, buf: audioBuf };
        return audioBuf;
      });
    }).catch(function () { return null; });
  }
  /* 换媒资时清缓存：旧音频缓冲留着只会占内存，而它再也不会被重画 */
  Player.waveClearCache = function () { waveCache = { url: "", buf: null }; };

  /* 对外：画波形。opts = { color, seg:{ start, end }, segColor }
     返回 Promise<boolean>：true = 已画出；false = 环境不支持/无音轨/解码失败/超长媒资。 */
  Player.waveform = function (url, canvas, opts) {
    if (!url || !canvas) return Promise.resolve(false);
    return decodeWave(url).then(function (audioBuf) {
      if (!audioBuf) return false;
      return drawWave(audioBuf, canvas, opts);
    }).catch(function () { return false; });
  };

  /* 对外：取录音的单声道 PCM（P0-1 声学反馈用：音高曲线 / 停顿统计）。
     复用 decodeWave 的解码缓存——同一份 blob 在波形与声学分析之间不重复解码。
     返回 Promise<{ pcm, sr, duration } | null>；null = 解码失败/不支持，由调用方决定是否展示。 */
  Player.decodeMonoPcm = function (url) {
    return decodeWave(url).then(function (audioBuf) {
      if (!audioBuf) return null;
      const ch = audioBuf.getChannelData(0);
      const pcm = new Float32Array(ch.length);   /* 复制一份：AudioBuffer 可能被复用/回收 */
      pcm.set(ch);
      return { pcm: pcm, sr: audioBuf.sampleRate, duration: audioBuf.duration };
    });
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

  /* ---------------- 免按键说话（VAD 静音自动断句 · P7 借鉴 HiKid 的本地对话闭环） ----------------
     电话模拟 / 连续对话里最别扭的是「每说一句都要按一下」——真实通话不长这样。
     这里在站内既有的在线识别之上加一层**能量阈值静音检测**：确认你说过话、之后静音够久，
     就替你结束这一轮（等价于自动按了"停止"）。不引入本地模型、不换识别引擎、不改任何既有调用。
     口径：宁晚停不早停（早停会吃掉半句），阈值/参数全部可调（环境差异靠 threshold 兜）。 */
  function vadNext(st, rms, opts) {
    const o = opts || {};
    const th = (typeof o.threshold === "number") ? o.threshold : 0.02;
    const silMs = o.silenceMs || 1200;
    const tick = o.tickMs || 100;
    const loud = rms >= th;
    const ns = {
      speechSeen: !!((st && st.speechSeen) || loud),
      silentMs: loud ? 0 : (((st && st.silentMs) || 0) + tick)
    };
    ns.stop = !!(ns.speechSeen && !loud && ns.silentMs >= silMs);
    return ns;
  }
  Player.vadNext = vadNext;
  Player.vadSupported = function () {
    return !!(window.AudioContext || window.webkitAudioContext) &&
      !!(navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  };
  /* 在 Player.recognize 之上包一层静音断句。opts 原样透传给 recognize，另加：
     threshold（能量阈值，默认 0.02）/ silenceMs（静音多久算说完，默认 1200ms）/
     maxMs（单轮上限，默认 20s）/ tickMs / onAuto(reason: "silence"|"timeout") */
  Player.recognizeAuto = function (opts) {
    opts = opts || {};
    const Ctx = window.AudioContext || window.webkitAudioContext;
    let ctx = null, stream = null, analyser = null, buf = null, timer = null, rec = null;
    let st = { speechSeen: false, silentMs: 0 };
    let stopped = false;
    const startedAt = Date.now();
    const maxMs = opts.maxMs || 20000;
    function cleanup() {
      if (timer) { clearInterval(timer); timer = null; }
      try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ }
      try { if (ctx && ctx.close) ctx.close(); } catch (e) { /* ignore */ }
      stream = null; analyser = null; ctx = null;
    }
    const handle = {
      stop: function () { stopped = true; cleanup(); if (rec) { try { rec.stop(); } catch (e) { /* ignore */ } } },
      state: function () { return { speechSeen: st.speechSeen, silentMs: st.silentMs }; }
    };
    if (!Ctx || !navigator || !navigator.mediaDevices) { if (opts.onError) opts.onError(new Error("vad-unsupported")); return null; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      if (stopped) { try { s.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ } return; }
      stream = s;
      ctx = new Ctx();
      const src = ctx.createMediaStreamSource(s);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      buf = new Float32Array(analyser.fftSize);
      src.connect(analyser);
      timer = setInterval(function () {
        if (stopped) { cleanup(); return; }
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        st = vadNext(st, rms, opts);
        if (st.stop || (Date.now() - startedAt) > maxMs) {
          cleanup();
          if (rec) { try { rec.stop(); } catch (e) { /* ignore */ } }
          if (opts.onAuto) opts.onAuto(st.stop ? "silence" : "timeout");
        }
      }, opts.tickMs || 100);
    }).catch(function (err) {
      cleanup();
      if (opts.onError) opts.onError(err);
    });
    rec = Player.recognize(opts);
    if (!rec) { stopped = true; cleanup(); return null; }
    return handle;
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

  /* 将语音识别/麦克风错误码翻译成可操作的提示（空字符串表示无需提示，如用户主动停止）
     P0-13：指引必须**按环境分支**。改前这两条只写了桌面用户能做的动作——
     「点浏览器地址栏左侧的麦克风图标」在微信内置浏览器里根本没有地址栏，
     「python -m http.server 8000」手机用户物理上跑不了。桌面文案**逐字保留**（口径不变、
     九种错误码一个不少），只在手机 / 微信内换成当场能做的动作。 */
  function isWx() { return !!(window.FTE_ENV && window.FTE_ENV.wechat); }
  function isMobile() { return !!(window.FTE_ENV && window.FTE_ENV.mobile); }
  Player.recErrorText = function (err) {
    const e = String(err && err.message ? err.message : err).toLowerCase();
    const map = {
      "not-allowed": isWx()
        ? "麦克风权限被拒绝：微信内没有地址栏，请点右上角 ⋯ →「在浏览器中打开」，在浏览器里允许麦克风后重试"
        : (isMobile()
          ? "麦克风权限被拒绝：请点浏览器地址栏/菜单里的锁形图标 →「网站设置 / 权限」→ 允许麦克风后重试"
          : "麦克风权限被拒绝：请点击浏览器地址栏左侧的麦克风图标，选择「允许」后重试"),
      "service-not-allowed": "语音服务被拒绝：请在浏览器设置中允许本网站使用麦克风，然后刷新页面重试",
      "network": "语音识别网络错误：Chrome 语音服务依赖 Google，若你已开 VPN/代理仍失败，多为 Chrome 未走代理（建议 Chrome→设置→系统→开启「使用系统代理」），或以干净环境重试",
      "no-speech": "没有听到声音：请靠近麦克风、保持环境安静后重试",
      "audio-capture": "未检测到麦克风设备：请检查麦克风连接与系统设置",
      "aborted": "",
      "no-media": isWx()
        ? "当前环境不支持麦克风：微信内置浏览器不带录音能力，请点右上角 ⋯ →「在浏览器中打开」再试"
        : (isMobile()
          ? "当前环境不支持麦克风：请用手机浏览器（Chrome / Safari）打开本站，并允许麦克风权限后重试"
          : "当前环境不支持麦克风：建议通过本地服务器（python -m http.server 8000）打开页面"),
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
