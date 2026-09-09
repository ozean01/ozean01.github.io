/* ============ 📥 素材投料口（Material Import Inlet） ============
   借鉴 EchoType 的核心差异化：让「任意素材」流进同一条「听·读·写·说」流水线。
   本页做两件事：
     1) 把一篇英文文章（粘贴正文 / 网页链接抓取 / YouTube 字幕文本）拆成句子；
     2) 把句子送到两个已被验证的站内引擎，直接用已有功能练：
         · 📺 送去「字幕逐句点读」（window.Subtitle）—— 分级生词着色 + 点词查意 + 逐句点读
         · 🏁 送去「听说训练 · 五阶段闯关」（State.speak + #/speak）—— 盲听→精听跟读→听写→复述
   网页正文抓取使用开源的 Jina Reader（r.jina.ai，CORS 友好、返回 markdown 文本），
   纯前端直接在浏览器 fetch；离线/隐私场景可用「粘贴正文」方式，无需联网。

   零构建、无第三方依赖（除可选的抓取代理端点）。渲染：window.MaterialImport.render()。 */
(function () {
  "use strict";

  window.MaterialImport = { render: render };
  /* 供自动化测试/诊断使用的钩子（不影响运行时） */
  window.MaterialImport._t = { splitSentences: splitSentences, isMostlyEnglish: isMostlyEnglish, fetchText: fetchText, extractWords: extractWords };

  /* 会话状态：本次导入的原始文本、标题、拆出的句子 */
  const S = window.MaterialImport._state = { raw: "", title: "", sentences: [], parsed: false, error: "" };

  const E = function () { return window.TutorEnv || {}; };
  const esc = function (s) { const ev = E().esc || window.FTE_BOOT.esc; return ev ? ev(s) : String(s == null ? "" : s); };
  function toast(m) { const t = E().toast; if (t) t(m); else console.log(m); }

  const FETCH_TIMEOUT = 25000;
  const CONVENIENCE_ENDPOINT = "https://r.jina.ai/";   // 开源阅读器代理（markdown 输出，CORS 友好）

  /* ---------------- 抓取网页正文（best-effort，需联网；失败时引导粘贴） ---------------- */
  function timedFetch(url, ms) {
    return new Promise(function (resolve, reject) {
      const ctrl = ("AbortController" in window) ? new AbortController() : null;
      const timer = setTimeout(function () { if (ctrl) ctrl.abort(); else reject(new Error("timeout")); }, ms);
      const opts = ctrl ? { signal: ctrl.signal } : {};
      fetch(url, opts).then(function (res) {
        clearTimeout(timer);
        if (!res.ok) { reject(new Error("http " + res.status)); return; }
        return res.text();
      }).then(function (t) { clearTimeout(timer); resolve(t); })
        .catch(function (err) { clearTimeout(timer); reject(err); });
    });
  }

  function fetchText(url) {
    /* 直接抓取会被 CORS 拦截，走 Jina Reader 文本端点；失败则回退尝试直接 fetch */
    const tryDirect = function () { return fetch(url).then(function (r) { return r.ok ? r.text() : Promise.reject(new Error("http " + r.status)); }); };
    return timedFetch(CONVENIENCE_ENDPOINT + encodeURI(url), FETCH_TIMEOUT)
      .catch(function (_) { return tryDirect(); });
  }

  function isYouTube(url) { return /youtube\.com|youtu\.be/i.test(url || ""); }

  /* ---------------- 文本清理：去掉 Markdown/图片/导航等噪音 ---------------- */
  function cleanText(raw) {
    if (!raw) return "";
    return String(raw)
      .replace(/\u0000/g, "")
      .split("\n")
      .map(function (ln) {
        const s = ln.replace(/```[a-z]*/gi, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ")  // 代码块/图片
          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")                                     // 链接只留文字
          .replace(/^#{1,6}\s+/, "")                                                    // 标题符号
          .replace(/^[*>\-\u2022\s]+/, "")                                              // 列表/引用痕迹
          .trim();
        if (!s) return "";
        /* 跳过纯网址/纯图片/纯符号行 */
        if (/^(https?:\/\/|www\.|!\[|[\u2500\u2501#*=\-_\\.|]+$)/.test(s)) return "";
        return s;
      })
      .filter(Boolean).join("\n");
  }

  /* 句子是否以英文为主（跳过把正文里的中文片段也拆进去） */
  function isMostlyEnglish(text) {
    const t = String(text || "");
    let en = 0, cn = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) en++;
      else if (c >= 19968 && c <= 40959) cn++;
    }
    if (cn > en) return false;         // 中文更多 → 判为中文行
    if (en < 8) return false;          // 英文太少（一句话凑不出几个字母）
    return true;
  }

  const STOP = /^(https?:\/\/|www\.|\[@|!#$%^&\d+$)/i;

  /* 拆句子：按句末标点 + 换行切分，过滤太短/非英文/网址，去重，最多 60 句 */
  function splitSentences(text) {
    let t = cleanText(text).replace(/\r/g, "").replace(/\s+/g, " ").trim();
    if (!t) return [];
    let parts = t.split(/(?<=[.!?;])\s+/);
    /* 再把长句里明显的 URL 单独剔除 */
    const out = [];
    const seen = {};
    const up = parts.map(function (p) {
      p = p.trim();
      return p;
    }).filter(function (p) {
      if (!p || p.length < 12) return false;            // 太短
      if (STOP.test(p)) return false;                    // 网址/纯符号行
      if (!isMostlyEnglish(p)) return false;             // 非英文主导行
      const letters = p.replace(/[^a-zA-Z]/g, "");
      if (letters.length < 8) return false;              // 几乎无字母
      return true;
    });
    up.forEach(function (p) {
      if (out.length >= 60) return;
      const k = p.toLowerCase();
      if (seen[k]) return;                               // 去重
      seen[k] = true;
      out.push(p);
    });
    return out;
  }

  /* ---------------- 构建可复用引擎的数据 ---------------- */
  function unitBox() { return window.FTE_BOOT && window.FTE_BOOT.DATA && window.FTE_BOOT.DATA.units; }

  /* ① 送到「字幕逐句点读」（复用 window.Subtitle 的着色/点词/点读） */
  /* ③ 把句中「实词（非停用词）」提取成单词卡条目（去重，保留首次出现的句子作例句） */
  const STOPWORDS = {};
  ("a an the and or but if of in on at to for with by from as is are was were be been being do does did done have has had having i you he she it we they my your his her our their me him us them this that these those there here what which who whom whose when where why how not no nor so than then too very just can could will would shall should may might must").split(" ").forEach(function (w) { STOPWORDS[w] = true; });

  function extractWords(sentences) {
    const out = [];
    const seen = {};
    sentences.forEach(function (sent) {
      const tokens = sent.toLowerCase().replace(/[^a-z'-]/g, " ").split(/\s+/).filter(Boolean);
      tokens.forEach(function (tok) {
        const clean = tok.replace(/'-/g, "'").replace(/[^a-z']/g, "");
        if (clean.length < 3 || /'/.test(clean) && clean.length < 4) return;
        if (STOPWORDS[clean]) return;
        if (!/^[a-z][a-z-]*$/.test(clean)) return;
        if (seen[clean]) return;
        seen[clean] = true;
        /* 单词卡背面主要靠「例句」学语境：没有译文时用原句当例句，有课程词库则带释义/音标 */
        const info = (E().lookupWord ? E().lookupWord(clean) : null);
        out.push({ id: "mi-" + clean, w: clean, ipa: info ? info.ipa : "", cn: info ? info.cn : "", ex: sent, exCn: info ? (info.exCn || "") : "", why: "" });
      });
    });
    return out;
  }

  /* ③a 送去「记忆单词卡 · FSRS」：直接给 State.flash 建一套复用现有卡片引擎 */
  function sendToFlash() {
    const boot = window.FTE_BOOT;
    if (!boot || !boot.State) { toast("⚠️ 主应用未就绪"); return; }
    const cards = extractWords(S.sentences);
    if (!cards.length) { toast("未从这些句子里提取到可用实词（至少需要含字母的英文词）"); return; }
    const cap = cards.slice(0, 30);
    boot.State.flash = {
      unit: { id: "M", title: "📥 导入素材词库", vocab: [] },
      queue: cap,
      idx: 0,
      stats: { known: 0, unknown: 0 },
      freshLeft: Math.max(0, cards.length - cap.length),
      dueLeft: 0
    };
    location.hash = "#/flash";
    toast("🃏 已把 " + cap.length + " 个实词送入单词卡（FSRS 间隔重复）。背面例句=它出现的句子；已写入课程词库的会同时显示释义。");
  }

  /* ③b 送去「四维口语实战」评分：每条句子注册成一个参考句场景（跟读 + AI 双评测） */
  function sendToEval4() {
    if (!window.Eval4 || !window.Eval4.registerScenes) { toast("⚠️ 四维口语引擎未加载"); return; }
    const D = (typeof FTE_DIFF !== "undefined") ? FTE_DIFF : null;
    const scenes = S.sentences.slice(0, 8).map(function (sent, i) {
      /* 行业术语（FTE_DIFF.dom）自动抽出来做「术语发音」重点标注 */
      const terms = [];
      sent.toLowerCase().replace(/[^a-z'-]/g, " ").split(/\s+/).forEach(function (tok) {
        const c = tok.replace(/'-/g, "'").replace(/[^a-z']/g, "");
        if (c.length < 3) return;
        if (D && D.words && D.words[c] && D.words[c].dom && terms.indexOf(c) === -1) terms.push(c);
      });
      return { id: "mi-e4-" + (i + 1), title: "导入素材 · " + (i + 1), ref: sent, refCn: "", followCn: "", terms: terms.slice(0, 8) };
    });
    window.Eval4.registerScenes(scenes);
  }

  function sendToSubtitle() {
    if (!S.sentences.length) { toast("请先「📌 拆成句子」再送去点读"); return; }
    const ST = window.Subtitle && window.Subtitle.state;
    if (!ST) { toast("⚠️ 字幕引擎未加载，无法送去点读"); return; }
    /* 无媒资时用 TTS 逐句点读，time 仅用于排序/显示，用渐进间隔即可 */
    ST.cues = S.sentences.map(function (s, i) {
      return { start: i * 4, end: i * 4 + 3.5, text: s };
    });
    ST.current = 0;
    ST.mediaUrl = null;
    ST.fileName = S.title && /[A-Za-z0-9]{4,}/.test(S.title) ? S.title : "导入素材";
    location.hash = "#/subtitle";
    toast("✓ 已送入「字幕逐句点读」：" + S.sentences.length + " 句（无媒资时点▶用 TTS 朗读）");
  }

  /* ② 送到「听说训练 · 五阶段闯关」（复用 State.speak + #/speak 的盲听/跟读/听写/复述） */
  function sendToStage() {
    if (!S.sentences.length) { toast("请先「📌 拆成句子」再送去训练"); return; }
    const boot = window.FTE_BOOT;
    if (!boot || !boot.State) { toast("⚠️ 主应用未就绪，暂时无法送去听说训练"); return; }
    const units = unitBox();
    if (!units) { toast("⚠️ 课程数据未加载"); return; }
    const id = "M" + Date.now();
    const title = (S.title && S.title.slice(0, 30)) || "导入素材";
    const unit = {
      id: id,
      title: "📥 " + title,
      desc: "（导入素材 · 非站内 19 单元）",
      vocab: [],
      phrases: [],
      dialogues: [{
        title: title,
        lines: S.sentences.map(function (s) { return { sp: "A", en: s, cn: "" }; })
      }]
    };
    units.push(unit);
    boot.State.speak = {
      unit: unit,
      dlgIdx: 0,
      dlg: unit.dialogues[0],
      mode: "stage",
      role: "",
      rate: (boot.progress && boot.progress.rate) || 1,
      stepMode: false,
      stepIdx: 0,
      stage: "listen",
      dictResults: {},
      recordings: {}
    };
    location.hash = "#/speak";
    toast("🏁 已送入「五阶段闯关」：盲听 → 精听跟读 → 听写 → 复述（" + S.sentences.length + " 句）");
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    const app = document.getElementById("app");
    const n = S.sentences.length;
    const preview = n
      ? S.sentences.slice(0, 40).map(function (s, i) {
        return `<div class="sub-row" data-idx="${i}">
          <span class="sub-time">${i + 1}</span>
          <span class="sub-text">${esc(s)}</span>
        </div>`;
      }).join("") + (n > 40 ? '<div class="field-note" style="padding:6px 4px 0">…（已拆出 ' + n + ' 句，仅预览前 40 句，全部会送去训练）</div>' : "")
      : "";

    app.innerHTML = `
    <div class="page-head">
      <div class="crumbs"><a href="#/home">首页</a> / 素材投料口</div>
      <h2>📥 素材投料口</h2>
      <div class="en">把任意英文材料变成「听·读·写·说」一起练的素材</div>
      <p style="margin-top:8px;max-width:780px;color:var(--muted)">粘贴一篇英文文章、一个网页链接，或一段 YouTube/美剧字幕文本，拆成句子后，直接<b>送进站内已有的流水线</b>练（复用字幕点读 & 听说训练引擎）。数据默认只在本浏览器；网页正文抓取走 Jina Reader 文本端点（需联网），隐私要求高就直接<strong>粘贴正文</strong>，完全离线。</p>
    </div>

    <div class="card" style="margin-top:8px;padding:16px 18px">
      <label style="font-weight:600;display:block;margin-bottom:6px">① 粘贴正文 / 文章链接 / 字幕文本</label>
      <textarea id="matSource" rows="7" spellcheck="false" placeholder="例如：\n• 粘贴一篇英文文章或商务邮件全文\n• 或贴一个网页链接（自动抓取正文）\n• 或贴 YouTube 视频字幕文本（用「字幕转录」工具复制过来）" style="width:100%;padding:11px 14px;border:1px solid var(--line);border-radius:11px;outline:none;font-size:14px;line-height:1.7"></textarea>
      <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <input type="text" id="matTitle" value="${esc(S.title)}" placeholder="给这段材料起个标题（可选）" style="flex:1;min-width:160px;padding:9px 12px;border:1px solid var(--line);border-radius:10px;outline:none">
        <button class="btn btn-soft btn-sm" data-action="mat-fetch">🌐 抓取网页正文</button>
        <button class="btn btn-primary btn-sm" data-action="mat-parse">📌 拆成句子</button>
        <button class="btn btn-outline btn-sm" data-action="mat-clear">🗑 清空</button>
      </div>
      <div class="field-note" style="margin-top:8px">粘贴的是链接时，点「🌐 抓取网页正文」获取正文；粘贴的是文本，直接「📌 拆成句子」。YouTube 视频请用字幕转录工具复制<b>英文台词文本</b>粘贴（是<a href="#/sources">真实听音源</a>的延伸，从任意材料练）。</div>
      ${S.error ? '<div class="sop-hint" style="margin-top:8px">⚠️ ' + esc(S.error) + "</div>" : ""}
    </div>

    <div class="card" style="margin-top:12px;padding:16px 18px">
      <label style="font-weight:600;display:block;margin-bottom:6px">② 把它送进流水线 ${n ? '<span class="badge badge-ok">已拆出 ' + n + ' 句</span>' : ""}</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" data-action="mat-subtitle" ${n ? "" : "disabled"}>📺 送进「字幕逐句点读」</button>
        <button class="btn btn-primary" data-action="mat-stage" ${n ? "" : "disabled"}>🏁 送进「听说训练 · 五阶段闯关」</button>
        <button class="btn btn-soft" data-action="mat-flash" ${n ? "" : "disabled"}>🃏 把句中生词加入单词卡（FSRS）</button>
        <button class="btn btn-soft" data-action="mat-eval4" ${n ? "" : "disabled"}>🧭 送进「四维口语实战」评分</button>
        <span class="field-note" style="align-self:center">🃏 提取句中实词直接进单词卡走 FSRS 间隔重复；🧭 把句子作为参考句，跟读 + AI 双评测。</span>
      </div>
      <div style="margin-top:8px;font-size:12.5px;color:var(--muted)">
        <b>📺 字幕点读</b>：逐句点读 + 生词按 易/中/难/专 自动着色 + 点词查意（读一遍即可边走；适合盲听）。<br>
        <b>🏁 五阶段闯关</b>：同一批句子按 盲听 → 精听跟读 → 听写 → 复述 串成一气（贴合"同一篇材料被耳朵/眼睛/手/嘴各过一遍"）。缺中文译文时，听写步骤会只给序号。<br>
        <b>🃏 单词卡 · FSRS</b>：自动把句中的实词（去掉 the/a/and 等停用词）做成卡片，背面例句=它出现的原句；有课程词库的会同时带释义与音标，进 FSRS 间隔重复记忆。<br>
        <b>🧭 四维口语实战</b>：把句子当参考句，朗读得发音/流利分 + AI 判应答/逻辑分；句子里的行业术语会自动标注，便于发音重点训练。
      </div>
    </div>

    ${preview ? '<div class="card" style="margin-top:12px;padding:12px 14px"><div class="chat-head" style="margin-bottom:8px"><span>📄 句子预览</span></div><div class="sub-list">' + preview + "</div></div>" : ""}
    `;

    bind();
  }

  function bind() {
    const src = document.getElementById("matSource");
    if (src && typeof S.raw === "string" && S.raw) src.value = S.raw;
    const title = document.getElementById("matTitle");
    if (title && typeof S.title === "string") title.value = S.title;
  }

  /* ---------------- 事件委托 ---------------- */
  function doAction(act) {
    const src = document.getElementById("matSource");
    const title = document.getElementById("matTitle");
    if (title) S.title = title.value.trim();

    if (act === "mat-clear") {
      S.raw = ""; S.title = ""; S.sentences = []; S.error = ""; S.parsed = false;
      render();
      return;
    }
    if (act === "mat-fetch") {
      const url = (src ? src.value : "").trim();
      if (!url) { toast("请先粘贴一个网页链接"); return; }
      if (!/^https?:\/\//i.test(url) && !/^https?:\/\//i.test("https://" + url)) { toast("请粘贴完整的 http(s) 链接（例如 https://…）"); return; }
      const target = /^https?:\/\//i.test(url) ? url : "https://" + url;
      S.error = "";
      toast("🌐 正在抓取正文（脚本阅读器，需联网，稍等几秒）…");
      fetchText(target).then(function (text) {
        if (!text || text.length < 40) throw new Error("抓取结果过短，可能该页面不支持自动抓取");
        S.raw = text;
        if (!S.title) S.title = target.replace(/^https?:\/\//, "").slice(0, 40);
        S.sentences = splitSentences(text);
        S.parsed = true;
        S.error = S.sentences.length ? "" : "未能从该页面拆出英文句子：可换用「粘贴正文」方式。";
        toast("✓ 抓到正文，已拆出 " + S.sentences.length + " 句");
        render();
      }).catch(function (err) {
        S.error = "抓取失败（" + (err && err.message ? err.message : "网络/跨域") + "）。可直接把正文粘贴到框里，无需联网。";
        render();
      });
      return;
    }
    if (act === "mat-parse") {
      const text = (src ? src.value : "").trim();
      if (!text) { toast("请先粘贴正文或链接"); return; }
      /* 若粘贴的是链接且已抓到全文，用全文；否则直接把输入内容当文本拆句 */
      const docs = /^https?:\/\//i.test(text) ? S.raw : text;
      if (!docs || docs.length < 40) { S.error = "输入的内容太少，无法拆句（至少需要一两句完整的英文）"; render(); return; }
      S.raw = docs;
      S.sentences = splitSentences(docs);
      S.parsed = true;
      if (!S.title) S.title = "导入素材";
      S.error = S.sentences.length ? "" : "没拆出英文句子：请确认粘贴的是英文（正文或以英文为主的字幕）。";
      toast(S.sentences.length ? "✓ 已拆出 " + S.sentences.length + " 句" : "⚠️ 未拆出句子");
      render();
      return;
    }
    if (act === "mat-subtitle") sendToSubtitle();
    else if (act === "mat-stage") sendToStage();
    else if (act === "mat-flash") sendToFlash();
    else if (act === "mat-eval4") sendToEval4();
  }

  document.addEventListener("click", function (e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const act = el.getAttribute("data-action");
    if (act && act.indexOf("mat-") === 0) doAction(act);
  });
})();
