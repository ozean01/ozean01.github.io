/* ============ 🎙️ 自由表达分析（软包装外贸 · SpeechAnalyzer） ============
   模块 B + C：参考 ELSA Speech Analyzer 的「五维 + 口语总分 + 流利度量化」思路，
   落地到本网站的「一秒开始、可量化、可对齐、诚实标注」的自由表达入口。

   - 不加前提：点一下麦克风，随意说一段英文（关于软包装外贸的任何内容）。
   - 浏览器 ASR 实时转写 → 得到转写文本 → 计算「硬指标」：
       字数 / 去重词数 / 填充词(um、ah、you know、so、like…)次数与清单 / 口语语速(词/分，估算) /
       流利度启发式分(0-100，估算)。
   - 若已配置模型 Key（复用「AI 陪练」fte-tutor-cfg），再用 LLM 判「语法/表达」并给
       「点到为止」的改进：2 个最明显可改进方向 + 1 个更自然版本 + 1 句总结；行业术语可核标注。
   - 诚实：自由表达无参考文本，发音/语调难以精准评测 → 明确标注，并引导去「四维口语实战」
       跟读参考句或配 Azure 音素级；语速/流利度为估算。
   纯静态 + localStorage + 浏览器 Web Speech，零后端。 */

(function () {
  "use strict";

  const app = document.getElementById("app");
  const KEY = "fte-speech-v1";
  const CFG_KEY = "fte-tutor-cfg";
  const MAX_HIST = 10;

  const U = function () { return window.ASRUtil || {}; };
  const esc = function (s) { const f = U().esc; return f ? f(s) : String(s == null ? "" : s); };
  function toast(m) { const f = U().toast; if (f) f(m); }
  function getProgress() { const f = U().getProgress; return f ? f() : {}; }
  function saveProgress() { const f = U().saveProgress; if (f) f(); }

  /* ---------------- 填充词与硬指标 ---------------- */
  /* 保守判定：只把“明显是口头撑场”的词计入填充词，避免把实义 so/like/well 误报。 */
  function detectFillers(transcript) {
    const words = String(transcript || "").trim().split(/\s+/).filter(Boolean);
    const found = [];
    const counts = {};
    for (let i = 0; i < words.length; i++) {
      const w = words[i].toLowerCase().replace(/[^a-z']/g, "");
      if (!w) continue;
      let isFiller = false;
      if (/^(u?m+)$/.test(w) || /^u?h+$/.test(w) || /^er+$/.test(w)) isFiller = true;
      else if (w === "you" && /^you$/i.test(words[i]) && words[i + 1] && /^know$/i.test(words[i + 1])) isFiller = true; /* you know */
      else if (w === "yeah" || w === "ya" || w === "uhm" || w === "uhm" || w === "alright") isFiller = true;
      else if (w === "like" && isFillerLike(words, i)) isFiller = true;
      else if (w === "so" && isFillerSo(words, i)) isFiller = true;
      else if (w === "well" && isFillerWell(words, i)) isFiller = true;
      else if (w === "right" && isFillerRight(words, i)) isFiller = true;
      if (isFiller) {
        counts[w] = (counts[w] || 0) + 1;                      /* +1 每次 */
        if (found.indexOf(w) === -1) found.push(w);
      }
    }
    return { list: found, counts: counts, total: Object.keys(counts).reduce(function (a, k) { return a + counts[k]; }, 0) };
  }
  /* 保守判定：like 作为填充词（前后没有明确搭配、且临近停顿或逗号） */
  function isFillerLike(words, i) {
    const prev = (words[i - 1] || "").toLowerCase();
    const next = (words[i + 1] || "").toLowerCase();
    /* "it's like" "looks like" "would like" "feel like" 等是实义，排除 */
    if (/^(it|looks|would|feel|seems|something)$/.test(prev)) return false;
    if (/^(would|feel|look|seem|dont|don't)$/.test(prev)) return false;
    return !next || !/^(to|a|the)$/.test(next); /* 后面接 to/a/the 多为实义 */
  }
  function isFillerSo(words, i) {
    /* 只把句首/停顿后的 "so..." 记为撑场词（如 "So, about the price…"）；"and so on / so that" 之类的实义排除 */
    const prev = (words[i - 1] || "").toLowerCase();
    if (prev === "and" || prev === "or") return true;
    if (words[i + 1] && /^(that|on|as|far|much)$/.test(words[i + 1].toLowerCase())) return false;
    return i === 0 || /[,.!?]$/.test(prev) || prev === "well" || prev === "okay";
  }
  function isFillerWell(words, i) {
    /* 句子开头 or 跟在逗号后的 'well...' 多为填充；'is well known' 等排除 */
    if ((words[i + 1] || "").toLowerCase() === "known") return false;
    if ((words[i + 1] || "").toLowerCase() === "understood") return false;
    return i === 0 || /[.,!?]$/.test(words[i - 1] || "");
  }
  function isFillerRight(words, i) {
    /* 'all right' 'right now' 'right here' 'right away' 实义；句尾's right 非 */
    const next = (words[i + 1] || "").toLowerCase();
    if (/^(now|here|away|there|up)$/.test(next)) return false;
    return false; /* right 严格口语填充度低，不误报 */
  }

  /* 口语语速（估算）：用“开始定位到识别结束”的时长近似。无录音时不精确，醒目标“估算”。 */
  function estWordsPerMin(words, seconds) {
    if (!seconds || seconds <= 0) return null;
    const rate = Math.round(words / (seconds / 60));
    return Math.max(0, rate);
  }

  /* 流利度启发式（0-100，估算）：口语流利度 = 避免过多停顿/填充词 + 语速适中。
     过高填充词密度、语速过慢或跳词过多都会扣分；仅供参考，明确标注“估算”。 */
  function heuristicFluency(words, fillerTotal, rate, seconds) {
    if (!words || words < 3) return 0;
    let s = 100;
    const density = fillerTotal / words;                 /* 每词填充占比 */
    if (density > 0.25) s -= 30; else if (density > 0.15) s -= 18; else if (density > 0.08) s -= 8;
    else if (density > 0.04) s -= 3;
    if (rate != null) {
      if (rate < 60) s -= 20;      /* 过慢，停顿多 */
      else if (rate < 90) s -= 8;
      else if (rate > 200) s -= 10; /* 过快，可能是抢读/词压缩 */
    }
    if (!seconds || seconds < 2) s -= 6;  /* 太短，样本不足 */
    return Math.max(0, Math.min(100, Math.round(s)));
  }

  /* ---------------- LLM：语法/表达反馈（点到为止） ---------------- */
  function loadLLMCfg() {
    try {
      const c = JSON.parse(localStorage.getItem(CFG_KEY));
      if (c && c.baseUrl && c.model && c.apiKey) return c;
    } catch (e) { /* ignore */ }
    return null;
  }
  async function callLLM(messages, maxTokens) {
    const cfg = loadLLMCfg();
    if (!cfg) throw new Error("no-key");
    const url = cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.apiKey },
      body: JSON.stringify({ model: cfg.model, messages: messages, temperature: 0.3, max_tokens: maxTokens || 520 })
    });
    if (!res.ok) {
      let d = ""; try { d = (await res.text()).slice(0, 160); } catch (e) { /* ignore */ }
      throw new Error("API 错误 " + res.status + (d ? "：" + d : ""));
    }
    const data = await res.json();
    const c = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!c) throw new Error("接口返回格式异常");
    return c;
  }

  /* 让 LLM 给“自由表达”的语法/表达反馈（点到为止：2 个改进 + 1 个更自然版本 + 1 句总结 + 术语核验）。
     输出严格 JSON：{"grammar":0-100,"expression":0-100,"notes":["...","..."],"better":"...","doubt":"..."} */
  async function llmFeedback(text) {
    const sys = "You are a senior foreign-trade English coach for Chinese soft-packaging export professionals. " +
      "The learner just freely spoke the text below (transcribed by ASR, may contain minor recognition noise; ignore obvious recognition errors). " +
      "Judge ONLY grammar and naturalness/expression for a professional trade context; do not judge pronunciation (not assessable here). " +
      "Follow '点到为止': give at most 2 most impactful improvement points, 1 more natural rewritten version of the whole passage, and 1 short summary. " +
      "Reply with STRICT JSON only: {\"grammar\":0-100,\"expression\":0-100,\"notes\":[\"point1\",\"point2\"],\"better\":\"rewritten\",\"summary\":\"one short Chinese sentence\",\"doubt\":\"industry terms you are not confident about, comma-separated; empty if none\"}.";
    const user = "Learner's spoken text: " + (text || "(empty)");
    const raw = await callLLM([{ role: "system", content: sys }, { role: "user", content: user }]);
    let j;
    try { const m = String(raw).match(/\{[\s\S]*\}/); j = JSON.parse(m ? m[0] : raw); } catch (e) { j = null; }
    if (!j || typeof j.grammar !== "number") return { grammar: null, expression: null, notes: [], better: "", summary: "", doubt: "" };
    return {
      grammar: Math.max(0, Math.min(100, Math.round(j.grammar))),
      expression: Math.max(0, Math.min(100, Math.round(j.expression))),
      notes: Array.isArray(j.notes) ? j.notes.slice(0, 2).map(String) : [],
      better: String(j.better || ""),
      summary: String(j.summary || ""),
      doubt: String(j.doubt || "").trim()
    };
  }

  /* ---------------- 历史 ---------------- */
  function loadHist() {
    try { const a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function saveHist(rec) {
    let a = loadHist();
    a.unshift(rec);
    while (a.length > MAX_HIST) a.pop();
    try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* ignore */ }
  }

  /* ---------------- 状态 ---------------- */
  let st = {
    phase: "idle",           /* idle | listening | done */
    transcript: "",
    words: 0,
    uniq: 0,
    fillers: null,
    seconds: 0,
    rate: null,
    fluency: null,
    ai: null,
    busy: false,
    err: ""
  };
  let recHandle = null;
  let listenStart = 0;
  let firstResultAt = 0;

  function reset() {
    st = { phase: "idle", transcript: "", words: 0, uniq: 0, fillers: null, seconds: 0, rate: null, fluency: null, ai: null, busy: false, err: "" };
    if (recHandle) { try { recHandle.stop(); } catch (e) { /* ignore */ } recHandle = null; }
  }
  function onRouteCleanup() { reset(); }

  /* 把 raw 识别文本里的“口语/停顿符号抖动”清理掉，保留干净词 */
  function cleanWords(text) {
    return String(text || "")
      .replace(/[\u2014\u2013\u2018\u2019\u201c\u201d]/g, " ")
      .replace(/[^\w\s'.!?,]/g, " ")
      .trim();
  }

  /* ---------------- 界面 ---------------- */
  function render() {
    const hasLLM = !!loadLLMCfg();
    const srOK = window.Player && window.Player.recognitionSupported && window.Player.recognitionSupported();
    const micOK = window.Player && window.Player.canRecord && window.Player.canRecord();

    let body = "";
    if (st.phase === "listening") {
      body = listeningCardHtml();
    } else if (st.phase === "done") {
      body = resultCardHtml(hasLLM);
    } else {
      body = startCardHtml(hasLLM, srOK, micOK);
    }

    app.innerHTML =
      pageHeadHtml(hasLLM, srOK, micOK) +
      body +
      historyHtml(loadHist());

    attachListeners();
  }

  function pageHeadHtml(hasLLM, srOK, micOK) {
    const srNote = srOK ? "" : '<span class="sp-note-warn">当前浏览器不支持语音识别（建议 Chrome/Edge）</span>';
    const keyNote = hasLLM ? "" : '<span class="sp-note-muted">未配置模型 Key：语法/表达反馈需到「AI 陪练」配置；当前仍可出硬指标。</span>';
    return `
    <div class="page-head">
      <h2>🎙️ 自由表达分析</h2>
      <div class="en">一秒开始 · 随意说一段英文 · 即时看「词汇 / 流利度 / 语法 / 表达」</div>
      <div class="en" style="margin-top:4px;font-size:12.5px;color:var(--muted)">
        说任何关于软包装外贸的话（介绍产品、报价、谈客户…）。转写由浏览器语音识别完成。
        ${srNote} ${keyNote}
      </div>
    </div>`;
  }

  function featureRowHtml() {
    return `
    <div class="sp-features">
      <span>📊 词汇量</span><span>⚡ 语速</span><span>🎯 流利度</span>
      <span>✍️ 语法(AI)</span><span>💬 表达(AI)</span>
      <span class="sp-note-warn">🔒 发音/语调需参考句或音素级</span>
    </div>`;
  }

  function startCardHtml(hasLLM, srOK, micOK) {
    const disabled = (srOK && micOK && !st.busy) ? "" : "disabled";
    return `
    <div class="card sp-start">
      ${featureRowHtml()}
      <div class="sp-hint">试着说一句，例如：<em>“我们这款无溶剂复膜胶，主要用于食品软包装，符合欧盟食品接触法规。”</em></div>
      <div class="sp-controls">
        <button class="btn btn-primary btn-lg" data-sp="mic" ${disabled}>${st.busy ? "监听中…" : "🎙️ 开始说（自由说一段）"}</button>
        ${hasLLM ? "" : '<a class="btn btn-outline btn-sm" href="#/tutor">⚙️ 去配置 AI Key</a>'}
      </div>
      <p class="field-note">说明：自由表达无参考文本，语速/流利度为<b>估算</b>；要精准发音/语调，请到「四维口语实战」跟读参考句，或配 Azure 音素级评测。</p>
    </div>`;
  }

  function listeningCardHtml() {
    return `
    <div class="card sp-listening">
      <div class="sp-pulse"><span></span><span></span><span></span></div>
      <h3>正在听你说话…</h3>
      <p>尽可能说一段完整的英文（3-10 句）。说完停一下，识别会自动结束。</p>
      <div class="sp-controls">
        <button class="btn btn-outline btn-sm" data-sp="stop">⏹ 结束并分析</button>
      </div>
    </div>`;
  }

  function resultCardHtml(hasLLM) {
    const f = st.fillers || { list: [], counts: {}, total: 0 };
    const words = st.words, uniq = st.uniq, rate = st.rate, flu = st.fluency;
    const ai = st.ai;
    const transcript = esc(st.transcript);

    /* 五维/硬指标卡 */
    const metrics = [
      { ic: "📊", lab: "词汇", val: words, sub: "去重 " + uniq + " 词", cls: "" },
      { ic: "⚡", lab: "语速(估算)", val: (rate == null ? "—" : rate + " 词/分"), sub: "约 " + Math.round(st.seconds) + " 秒", cls: "" },
      { ic: "🎯", lab: "流利度(估算)", val: (flu == null ? "—" : flu + "/100"), sub: "填充词 " + f.total + " 次", cls: "" },
      { ic: "✍️", lab: "语法", val: (ai && ai.grammar != null ? ai.grammar + "/100" : "—"), sub: hasLLM ? "AI 判" : "未配 Key", cls: "" },
      { ic: "💬", lab: "表达", val: (ai && ai.expression != null ? ai.expression + "/100" : "—"), sub: hasLLM ? "AI 判" : "未配 Key", cls: "" }
    ];

    return `
    <div class="card sp-done">
      <h3>📊 分析结果</h3>
      <div class="sp-metrics">
        ${metrics.map(function (m) {
          return '<div class="sp-metric"><div class="sm-ic">' + m.ic + '</div><div class="sm-val">' + esc(String(m.val)) + '</div><div class="sm-lab">' + esc(m.lab) + '</div><div class="sm-sub">' + esc(m.sub) + '</div></div>';
        }).join("")}
      </div>

      <div class="sp-transcript"><div class="sp-t-label">🗣 你说的是</div><div>${transcript}</div></div>

      ${f.total > 0 ? '<div class="sp-fillers"><b>口头撑场词</b>：' + esc(f.list.map(function (w) { return w + "×" + (f.counts[w] || 1); }).join(" · ")) + '</div>' : ""}

      ${ai && (ai.notes.length || ai.better || ai.summary) ? `
        <div class="sp-ai">
          <div class="sp-t-label">🤖 AI 语法/表达反馈（点到为止）</div>
          ${ai.notes.length ? '<ul class="sp-notes">' + ai.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" : ""}
          ${ai.better ? '<div class="sp-better"><b>更自然版本</b><div>' + esc(ai.better) + '</div></div>' : ""}
          ${ai.summary ? '<div class="sp-summary">💡 ' + esc(ai.summary) + '</div>' : ""}
          ${ai.doubt ? '<div class="sp-doubt">⚠️ AI 对以下行业表述不太确定，请到术语库/正式资料人工核对：<b>' + esc(ai.doubt) + '</b></div>' : ""}
        </div>` : (hasLLM ? "" : '<div class="sp-note-muted">要到「AI 陪练」配置模型 Key 后，此处才给出语法/表达的 AI 反馈。</div>')}

      <div class="sp-note-warn" style="margin-top:10px">🔒 发音/语调在此不评分（无参考文本）。要精准评测请：
        <a href="#/eval4">🎯 四维口语实战（跟读参考句）</a> 或 开启 <a href="#/speak">Azure 音素级评测</a>。</div>

      ${st.err ? '<div class="sp-err">' + esc(st.err) + '</div>' : ""}
      <div class="sp-controls" style="margin-top:12px">
        <button class="btn btn-primary" data-sp="again">🎙️ 再说一遍</button>
        <button class="btn btn-outline" data-sp="copy" ${transcript ? "" : "disabled"}>📋 复制文本</button>
      </div>
    </div>`;
  }

  function historyHtml(hist) {
    if (!hist || !hist.length) return "";
    return `
    <h3 class="section-title">🕘 最近分析</h3>
    <div class="sp-hist">
      ${hist.map(function (r, i) {
        return '<button class="sp-hist-item" data-sp="load" data-i="' + i + '"><b>' + esc(String(r.words || 0)) + " 词</b> · 流利 " + (r.fluency == null ? "—" : r.fluency + "/100") + " · " + esc(String(r.transcript || "").slice(0, 40)) + "…</button>";
      }).join("")}
      <button class="sp-hist-item sp-hist-clear" data-sp="clear">🗑 清空历史</button>
    </div>`;
  }

  /* ---------------- 交互 ---------------- */
  function attachListeners() {
    app.querySelectorAll("[data-sp]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        onAction(btn.getAttribute("data-sp"), btn.getAttribute("data-i"));
      });
    });
  }

  function onAction(act, i) {
    if (act === "mic") startListen();
    else if (act === "stop") stopListen(true);
    else if (act === "again") { reset(); render(); }
    else if (act === "copy") { copyTranscript(); }
    else if (act === "load") { loadHistItem(parseInt(i, 10)); }
    else if (act === "clear") { localStorage.removeItem(KEY); render(); }
  }

  function startListen() {
    if (st.busy) return;
    const P = window.Player;
    if (!P || !P.recognitionSupported || !P.recognitionSupported()) { st.err = "当前浏览器不支持语音识别（建议 Chrome/Edge）。"; render(); return; }
    st.busy = true; st.phase = "listening"; st.transcript = ""; st.err = "";
    render();
    /* 先请求麦克风权限（前置清晰提示） */
    P.micRequest().then(function () {
      listenStart = Date.now(); firstResultAt = 0;
      recHandle = P.recognize({
        lang: "en-US",
        onResult: function (t) { if (!firstResultAt) firstResultAt = Date.now(); st.transcript = t; },
        onEnd: function (t) { st.transcript = t || st.transcript; afterSpeak(); },
        onError: function (err) { handleSpeakError(err); }
      });
      if (!recHandle) { /* recognize unsupported */ st.err = "语音识别启动失败。"; st.busy = false; st.phase = "idle"; render(); }
    }).catch(function (err) {
      const P2 = window.Player;
      const txt = (P2 && P2.recErrorText) ? P2.recErrorText(err) : (err && err.message) || "无法使用麦克风。";
      st.err = txt; st.busy = false; st.phase = "idle"; render();
      toast(txt);
    });
  }

  function stopListen(manual) {
    if (recHandle) { try { recHandle.stop(); } catch (e) { /* ignore */ } recHandle = null; }
    if (manual) { /* onEnd 会自动 proceed */ }
  }

  function afterSpeak() {
    st.phase = "done"; st.busy = false;
    const text = cleanWords(st.transcript);
    const words = (st.transcript || "").trim().split(/\s+/).filter(Boolean);
    st.words = words.length;
    st.uniq = new Set(words.map(function (w) { return w.toLowerCase().replace(/[^a-z]/g, ""); }).filter(Boolean)).size;
    st.fillers = detectFillers(st.transcript);
    st.seconds = firstResultAt ? (Date.now() - firstResultAt) / 1000 : (Date.now() - listenStart) / 1000;
    st.rate = estWordsPerMin(st.words, st.seconds);
    st.fluency = heuristicFluency(st.words, st.fillers.total, st.rate, st.seconds);

    if (!st.words) { st.err = "没有识别到内容。请靠近麦克风、放慢语速、保持安静后重试。"; render(); return; }

    render();
    /* 异步 AI 反馈（若有 Key）；无 Key 时立即落历史 */
    const cfg = loadLLMCfg();
    if (cfg) {
      st.ai = { grammar: null, expression: null, notes: [], better: "", summary: "", doubt: "" }; /* 占位，异步补 */
      llmFeedback(st.transcript).then(function (res) {
        st.ai = res;
        render();
        saveHistNow();
      }).catch(function (e) {
        st.err = (e && e.message === "no-key") ? "" : "AI 反馈获取失败：" + (e && e.message ? e.message : "网络错误") + "。已显示硬指标。";
        render();
        saveHistNow();
      });
    } else {
      st.ai = null;
      render();
      saveHistNow();
    }
  }

  function handleSpeakError(err) {
    const P = window.Player;
    const code = String(err && (err.message || err)).toLowerCase();
    /* aborted = 用户主动停止，不报错 */
    if (code === "aborted" || code === "no-speech") return;
    const txt = (P && P.recErrorText) ? P.recErrorText(err) : ("识别失败：" + code);
    if (code === "network") {
      st.phase = "done"; st.busy = false; st.err = txt;
      if (st.transcript) afterSpeak(); else render();
      return;
    }
    st.err = txt; st.busy = false;
    if (st.phase === "listening") st.phase = "done";
    render();
  }

  function copyTranscript() {
    const t = st.transcript || "";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast("📋 已复制你说的内容"); });
    } else {
      toast("复制不可用，请手动选择文本");
    }
  }

  function loadHistItem(i) {
    const hist = loadHist();
    if (!hist[i]) return;
    const r = hist[i];
    st.transcript = r.transcript || "";
    st.words = r.words || 0; st.uniq = r.uniq || 0; st.rate = r.rate; st.fluency = r.fluency;
    st.seconds = r.seconds || 0; st.phase = "done"; st.err = "";
    st.fillers = r.fillers || { list: [], counts: {}, total: 0 };
    st.ai = r.ai || null;
    render();
  }

  /* 保存历史（每条除指标外还存原文，供回看）。只在一次分析完成后落一次：无 Key 立即写，有 Key 等 AI 返回后再写。 */
  function saveHistNow() {
    if (st.phase !== "done" || !st.transcript || !st.words) return;
    saveHist({
      t: Date.now(), transcript: st.transcript, words: st.words, uniq: st.uniq, seconds: Math.round(st.seconds),
      rate: st.rate, fluency: st.fluency, fillers: st.fillers || { list: [], counts: {}, total: 0 }, ai: st.ai
    });
  }

  window.SpeechAnalyzer = {
    render: render,
    cleanup: onRouteCleanup,
    hasConfig: function () { return !!loadLLMCfg(); }
  };
})();
