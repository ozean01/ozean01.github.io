/* ============ 🗣 说我想说（MySay）============
   把「先用母语写下自己想说的话 → 转成地道英文 → 朗读 → 跟读录音 → 背诵」做成一条闭环。
   与「📥 素材投料口」互补，两者练的东西正好相反：
     · 📥 素材投料口：练【别人的话】——导入文章/字幕，拆句后送进站内流水线；
     · 🗣 说我想说： 练【自己想说的话】——外贸场景里就是你真要发出去的邮件、真要开口说的话。
   后者贴合度更高：真实工作里你要说出口的，正是你自己脑子里的那件事，而不是别人的文章。

   刻意不新增任何引擎（零构建、无第三方依赖）：
     · 转英文  → window.Tutor.callChat（复用「AI 陪练」已配好的模型 Key）
     · 朗读    → window.Player.speak（复用发音设置里的引擎/语速/音色）
     · 跟读/听写/点读/间隔重复 → 复用站内四个已验证出口（见下 ③）
   依赖（均按需读取，无加载顺序耦合）：
     window.TutorEnv（esc/toast）、window.FTE_BOOT（State/DATA）、
     window.Tutor（callChat/hasConfig）、window.Player、window.CoachBridge。
   渲染：window.MySay.render()。 */
(function () {
  "use strict";

  window.MySay = { render: render };
  /* 供自动化测试/诊断使用（不影响运行时） */
  window.MySay._t = { splitSentences: splitSentences, extractWords: extractWords, tonePrompt: tonePrompt, wordCount: wordCount };

  /* 会话状态：本次编辑的中文自述与英文稿（页面内保持，刷新即清） */
  const S = window.MySay._state = { cn: "", en: "", tone: "email", title: "", loading: false, error: "" };

  const STORE_KEY = "fte-mysay-v1";

  const E = function () { return window.TutorEnv || {}; };
  function esc(s) { const f = E().esc; return f ? f(s) : String(s == null ? "" : s); }
  function toast(m) { const t = E().toast; if (t) t(m); else console.log(m); }

  /* ---------------- 语气（决定 AI 输出的语域） ---------------- */
  const TONES = [
    { id: "email",   label: "📧 商务邮件", hint: "写给客户的邮件：礼貌、明确、可直接发出去" },
    { id: "talk",    label: "🗣 口语对话",  hint: "当面/电话里说：自然口语，可用缩写与过渡词" },
    { id: "meeting", label: "📊 会议汇报", hint: "过议程/汇报/答问：先给结论与数据，结构清晰" }
  ];

  function toneById(id) {
    return TONES.find(function (t) { return t.id === id; }) || TONES[0];
  }

  /* 语气 → 系统提示词的追加段。核心 6 条要求全局共用，语气只改语域。 */
  const TONE_ADD = {
    email: "语气：正式商务邮件。礼貌、明确、简洁；可用 Dear/Hi 开头，落款可省略；一件事一段，不堆形容词。",
    talk: "语气：日常口语对话。用自然的缩写（I'd、we're、that's）与过渡词，像当面或电话里说话；避免书面腔。",
    meeting: "语气：会议汇报/答问。先给结论或数据再解释；结构清晰、可直接读出来；适合过议程、产品汇报、回应质询。"
  };

  function tonePrompt(tone) { return TONE_ADD[toneById(tone).id] || TONE_ADD.email; }

  /* 系统提示词：把中文自述改写成「他自己能说出口」的地道英文 */
  function systemPrompt(tone) {
    return [
      "你是资深美式英语写作与口语教练，服务对象是中国软包装（复合膜 / 复膜胶 / 制袋）行业的外贸业务员。",
      "你的任务：把用户的中文自述，改写成【他自己想说、且能直接说出口或直接发出去】的地道英文。",
      "",
      "必须遵守：",
      "1. 忠实原意：不得增添用户没说的内容、承诺、价格或时间点。",
      "2. 用 plain English：优先短动词短语与常见搭配，避免生僻大词和形容词堆砌。",
      "3. 句子长短交错，读起来有自然节奏。",
      "4. 不要逐字直译中文语序，改写成英语母语者会用的自然语序。",
      "5. 保留行业术语的专业说法（如 laminating adhesive、coating weight、peel strength、curing、corona treatment、BOPP/PET、stand-up pouch 等），不要意译成外行说法。",
      "6. 篇幅与中文相近，不要扩写成一大段。",
      "7. 只输出英文正文。不要解释、不要小标题、不要 markdown 代码块、不要用引号把整段包起来。",
      "",
      tonePrompt(tone)
    ].join("\n");
  }

  /* ---------------- 文本工具 ---------------- */
  function wordCount(text) {
    return String(text || "").trim().split(/\s+/).filter(Boolean).length;
  }

  function cnLength(text) {
    return String(text || "").replace(/\s/g, "").length;
  }

  /* 拆句：AI 输出是干净句子，比抓网页简单得多——按换行 + 句末标点切，保留顺序、去重。
     刻意不复用 material.js 的私有 _t 钩子（那是给测试/诊断用的），避免模块间脆弱耦合。 */
  function splitSentences(text) {
    const t = String(text || "").replace(/\r/g, "").replace(/\s*\n+\s*/g, " ").replace(/\s+/g, " ").trim();
    if (!t) return [];
    const out = [];
    const seen = {};
    t.split(/(?<=[.!?])\s+/).forEach(function (p) {
      p = p.trim();
      if (!p) return;
      if (p.replace(/[^a-zA-Z]/g, "").length < 2) return;   // 纯符号/空壳行
      const k = p.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(p);
    });
    return out;
  }

  /* 停用词（实词提取用） */
  const STOPWORDS = {};
  ("a an the and or but if of in on at to for with by from as is are was were be been being do does did done have has had having i you he she it we they my your his her our their me him us them this that these those there here what which who whom whose when where why how not no nor so than then too very just can could will would shall should may might must also would'd'll're've").split(" ")
    .forEach(function (w) { STOPWORDS[w] = true; });

  /* 从句子里抽「实词」建单词卡条目（去重，保留首次出现的原句当例句；课程词库有则带释义/音标） */
  function extractWords(sentences) {
    const out = [];
    const seen = {};
    (sentences || []).forEach(function (sent) {
      String(sent).toLowerCase().replace(/[^a-z'-]/g, " ").split(/\s+/).forEach(function (tok) {
        const clean = tok.replace(/'-/g, "'").replace(/[^a-z']/g, "");
        if (clean.length < 3) return;
        if (STOPWORDS[clean]) return;
        if (!/^[a-z][a-z-]*$/.test(clean)) return;
        if (seen[clean]) return;
        seen[clean] = true;
        const info = (E().lookupWord ? E().lookupWord(clean) : null);
        out.push({
          id: "ms-" + clean, w: clean,
          ipa: info ? info.ipa : "",
          cn: info ? info.cn : "",
          ex: sent,
          exCn: info ? (info.exCn || "") : "",
          why: ""
        });
      });
    });
    return out;
  }

  /* ---------------- 语料库存取 ---------------- */
  function loadItems() {
    try {
      const a = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveItems(a) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(a.slice(0, 200))); } catch (e) { /* ignore */ }
  }

  /* 练习计时入账（连续打卡 / 今日时长 / 热力图），与写作/句型共用同一套统计 */
  function credit(secs) {
    try { if (window.CoachBridge && window.CoachBridge.credit) window.CoachBridge.credit(secs || 120); } catch (e) { /* ignore */ }
  }

  /* ---------------- ① AI 转地道英文 ---------------- */
  function aiRewrite() {
    if (!S.cn.trim()) { toast("请先用中文写下你想说的话"); return; }
    if (!(window.Tutor && window.Tutor.hasConfig())) {
      S.error = "还没配置模型。到「🤖 AI 陪练 → 模型设置」填好服务商与 API Key 后回来；或者直接在下面自己写英文（不用 AI 也能练）。";
      render();
      return;
    }
    S.loading = true; S.error = ""; render();
    const messages = [
      { role: "system", content: systemPrompt(S.tone) },
      { role: "user", content: S.cn.trim() }
    ];
    window.Tutor.callChat(messages).then(function (txt) {
      S.loading = false;
      S.en = String(txt || "").trim().replace(/^```[a-z]*\s*/i, "").replace(/```$/, "").trim();
      if (!S.en) { S.error = "模型没有返回内容，请重试或换一个模型。"; }
      render();
    }).catch(function (err) {
      S.loading = false;
      S.error = "转写失败：" + (err && err.message ? err.message : "检查 Key / 网络") + "。也可以直接在下方自己写英文。";
      render();
    });
  }

  /* ---------------- ② 朗读 ---------------- */
  function playEn() {
    const ta = document.getElementById("msEn");
    const text = (ta ? ta.value : S.en) || "";
    if (!text.trim()) { toast("还没有英文可朗读"); return; }
    const boot = window.FTE_BOOT;
    const rate = (boot && boot.progress && boot.progress.rate) || 1;
    if (!window.Player || !window.Player.speak) { toast("⚠️ 语音引擎未加载"); return; }
    window.Player.speak(text.trim(), { rate: rate });
  }

  /* ---------------- ③ 送进站内四个已有出口（复用，不新增引擎） ---------------- */
  function currentSentences() {
    const ta = document.getElementById("msEn");
    if (ta) S.en = ta.value;
    return splitSentences(S.en);
  }

  /* ③a 🃏 记忆单词卡 · FSRS */
  function sendToFlash() {
    const boot = window.FTE_BOOT;
    const sents = currentSentences();
    if (!sents.length) { toast("请先有一段英文（AI 转写或自己写）"); return; }
    if (!boot || !boot.State) { toast("⚠️ 主应用未就绪"); return; }
    const cards = extractWords(sents);
    if (!cards.length) { toast("没从这段英文里提取到可用实词"); return; }
    const cap = cards.slice(0, 30);
    boot.State.flash = {
      unit: { id: "MS", title: "🗣 我的自述词库", vocab: [] },
      queue: cap,
      idx: 0,
      stats: { known: 0, unknown: 0 },
      freshLeft: Math.max(0, cards.length - cap.length),
      dueLeft: 0
    };
    location.hash = "#/flash";
    toast("🃏 已把 " + cap.length + " 个实词送进单词卡（FSRS）。背面例句=你自己写的句子。");
  }

  /* ③b 🏁 听说训练 · 五阶段闯关（盲听→精听跟读→听写→复述） */
  function sendToStage() {
    const boot = window.FTE_BOOT;
    const sents = currentSentences();
    if (!sents.length) { toast("请先有一段英文（AI 转写或自己写）"); return; }
    if (!boot || !boot.State || !boot.DATA) { toast("⚠️ 主应用未就绪"); return; }
    const units = boot.DATA.units;
    if (!units) { toast("⚠️ 课程数据未加载"); return; }
    const title = (S.title && S.title.trim()) || ("我的自述 " + new Date().toLocaleDateString());
    const unit = {
      id: "MS" + Date.now(),
      title: "🗣 " + title.slice(0, 30),
      desc: "（说我想说 · 自述素材，非站内 19 单元）",
      vocab: [], phrases: [],
      dialogues: [{ title: title, lines: sents.map(function (s) { return { sp: "A", en: s, cn: "" }; }) }]
    };
    units.push(unit);
    boot.State.speak = {
      unit: unit, dlgIdx: 0, dlg: unit.dialogues[0], mode: "stage", role: "",
      rate: (boot.progress && boot.progress.rate) || 1,
      stepMode: false, stepIdx: 0, stage: "listen", dictResults: {}, recordings: {}
    };
    location.hash = "#/speak";
    credit(120);
    toast("🏁 已送入「五阶段闯关」：" + sents.length + " 句（盲听→精听跟读→听写→复述）");
  }

  /* ③c 🧭 四维口语实战（跟读 + AI 双评测） */
  function sendToEval4() {
    const sents = currentSentences();
    if (!sents.length) { toast("请先有一段英文（AI 转写或自己写）"); return; }
    if (!window.Eval4 || !window.Eval4.registerScenes) { toast("⚠️ 四维口语引擎未加载"); return; }
    const D = (typeof FTE_DIFF !== "undefined") ? FTE_DIFF : null;
    const scenes = sents.slice(0, 8).map(function (sent, i) {
      const terms = [];
      String(sent).toLowerCase().replace(/[^a-z'-]/g, " ").split(/\s+/).forEach(function (tok) {
        const c = tok.replace(/'-/g, "'").replace(/[^a-z']/g, "");
        if (c.length < 3) return;
        if (D && D.words && D.words[c] && D.words[c].dom && terms.indexOf(c) === -1) terms.push(c);
      });
      return { id: "ms-e4-" + (i + 1), icon: "🗣", title: "我的自述 · " + (i + 1), ref: sent, refCn: "", followCn: "", terms: terms.slice(0, 8) };
    });
    window.Eval4.registerScenes(scenes);
    credit(120);
  }

  /* ③d 📺 字幕逐句点读（无媒资时用 TTS 逐句点读） */
  function sendToSubtitle() {
    const sents = currentSentences();
    if (!sents.length) { toast("请先有一段英文（AI 转写或自己写）"); return; }
    const ST = window.Subtitle && window.Subtitle.state;
    if (!ST) { toast("⚠️ 字幕引擎未加载"); return; }
    ST.cues = sents.map(function (s, i) { return { start: i * 4, end: i * 4 + 3.5, text: s }; });
    ST.current = 0;
    ST.mediaUrl = null;
    ST.fileName = (S.title && S.title.trim()) || "我的自述";
    location.hash = "#/subtitle";
    credit(120);
    toast("📺 已送入「字幕逐句点读」：" + sents.length + " 句（点▶用 TTS 逐句朗读）");
  }

  /* ---------------- ④ 语料库：保存 / 回顾 / 背诵打卡 ---------------- */
  function saveCurrent() {
    if (!currentSentences().length) { toast("请先有一段英文再保存"); return; }
    const items = loadItems();
    items.unshift({
      t: Date.now(),
      title: (S.title || "").trim() || (S.cn.replace(/\s/g, "").slice(0, 16) || "我的自述"),
      cn: S.cn, en: S.en, tone: S.tone, done: false
    });
    saveItems(items);
    credit(120);
    toast("💾 已存进「我的自述语料库」——之后可以随时回来背诵");
    render();
  }

  function markDone(i) {
    const items = loadItems();
    if (!items[i]) return;
    items[i].done = !items[i].done;
    saveItems(items);
    if (items[i].done) { credit(180); toast("✅ 已标记背下来（计入打卡）"); }
    render();
  }

  function playItem(i) {
    const items = loadItems();
    if (!items[i]) return;
    const boot = window.FTE_BOOT;
    const rate = (boot && boot.progress && boot.progress.rate) || 1;
    if (!window.Player || !window.Player.speak) { toast("⚠️ 语音引擎未加载"); return; }
    window.Player.speak(items[i].en || "", { rate: rate });
  }

  function loadItem(i) {
    const items = loadItems();
    if (!items[i]) return;
    S.cn = items[i].cn || "";
    S.en = items[i].en || "";
    S.tone = items[i].tone || "email";
    S.title = items[i].title || "";
    S.error = "";
    render();
    window.scrollTo(0, 0);
  }

  function delItem(i) {
    const items = loadItems();
    items.splice(i, 1);
    saveItems(items);
    render();
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    const app = document.getElementById("app");
    if (!app) return;
    const sents = splitSentences(S.en);
    const items = loadItems();
    const hasEn = sents.length > 0;
    const aiReady = !!(window.Tutor && window.Tutor.hasConfig());

    const toneChips = TONES.map(function (t) {
      const on = t.id === S.tone ? " on" : "";
      return '<button class="scen-chip' + on + '" data-action="ms-tone" data-id="' + t.id + '" title="' + esc(t.hint) + '">' + t.label + "</button>";
    }).join("");

    const preview = hasEn
      ? sents.slice(0, 40).map(function (s, i) {
        return '<div class="sub-row"><span class="sub-time">' + (i + 1) + "</span><span class=\"sub-text\">" + esc(s) + "</span></div>";
      }).join("") + (sents.length > 40 ? '<div class="field-note" style="padding:6px 4px 0">…（共 ' + sents.length + " 句，仅预览前 40 句）</div>" : "")
      : "";

    const listHtml = items.length
      ? items.map(function (it, i) {
        return '<div class="wb-item">' +
          '<button class="play-btn" data-action="ms-play" data-i="' + i + '" title="朗读">🔊</button>' +
          '<span class="wb-e" style="flex:1">' + esc(it.title) + " · " + wordCount(it.en) + " 词 · " + esc(String(new Date(it.t).toLocaleDateString())) +
          (it.done ? ' <span class="badge badge-ok">已背</span>' : "") + "</span>" +
          '<button class="btn btn-outline btn-sm" data-action="ms-load" data-i="' + i + '" title="回到编辑器">📖 再练</button>' +
          '<button class="learn-toggle" data-action="ms-done" data-i="' + i + '" title="标记已背下来（计入打卡）">' + (it.done ? "↺" : "✓") + "</button>" +
          '<button class="learn-toggle" data-action="ms-del" data-i="' + i + '" title="删除">✕</button>' +
          "</div>";
      }).join("")
      : '<div class="field-note" style="padding:4px 2px">还没有作品。写下第一段「你想说的话」，转成英文后保存，这里就会长成你自己的口语语料库。</div>';

    app.innerHTML = `
    <div class="page-head">
      <div class="crumbs"><a href="#/home">首页</a> / 说我想说</div>
      <h2>🗣 说我想说 <span class="en">写你想说的话 → 变成能说出口的地道英文 → 跟读、背诵、记住</span></h2>
      <p style="margin-top:8px;max-width:800px;color:var(--muted)">跟「📥 素材投料口」正好互补：投料口练<b>别人的话</b>（导入文章/字幕），这里练<b>你自己的话</b>——外贸场景里就是你真要发出去的那封邮件、真要当着客户说的那件事。素材是你自己写的，背起来才真的用得上。</p>
    </div>

    ${(window.CoachBridge && window.CoachBridge.text) ? '<div class="goal-banner">🎯 ' + window.CoachBridge.text() + "</div>" : ""}

    <div class="card" style="margin-top:12px;padding:16px 18px">
      <label style="font-weight:600;display:block;margin-bottom:6px">① 用中文写下你想说的话</label>
      <textarea id="msCn" class="write-input" rows="6" spellcheck="false" placeholder="例如：\n这批货的复合膜出现了脱层，客户很着急。我想告诉他：我们已经确认是表面张力偏低导致的，会免费补货，并且已经调整了上胶量，下一批不会再出现。">${esc(S.cn)}</textarea>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <span class="field-note" style="margin:0">语气：</span>
        ${toneChips}
        <span class="sop-hint" id="msCnCount">${cnLength(S.cn)} 字</span>
      </div>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-primary btn-sm" data-action="ms-ai" ${S.loading ? "disabled" : ""}>${S.loading ? "🤖 正在转写…" : "🤖 转成地道英文"}</button>
        <button class="btn btn-soft btn-sm" data-action="ms-manual">✍️ 我自己写英文（不用 AI）</button>
        <span class="field-note" style="margin:0">${aiReady ? "AI 已就绪（复用「AI 陪练」里配好的模型）" : "未配置模型：可先用「自己写英文」；想用 AI 转写请到「🤖 AI 陪练 → 模型设置」填 Key"}</span>
      </div>
      ${S.error ? '<div class="sop-warn" style="margin-top:10px">⚠️ ' + esc(S.error) + "</div>" : ""}
      <div class="field-note" style="margin-top:8px">AI 只做改写，不加戏：<b>忠实原意</b>、不加用户没说的承诺或价格；行业术语保留专业说法。生成后务必自己过一遍——这是你要发出去的话，你要为它负责。</div>
    </div>

    <div class="card" style="margin-top:12px;padding:16px 18px">
      <label style="font-weight:600;display:block;margin-bottom:6px">② 英文稿（可自己改）</label>
      <input type="text" id="msTitle" value="${esc(S.title)}" placeholder="给这段起个标题（可选，例如「复膜脱层客诉回复」）" style="width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:10px;outline:none;margin-bottom:8px">
      <textarea id="msEn" class="write-input" rows="7" spellcheck="false" placeholder="AI 转写的结果会出现在这里；也可以自己直接写英文。">${esc(S.en)}</textarea>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-soft btn-sm" data-action="ms-play">🔊 朗读</button>
        <button class="btn btn-outline btn-sm" data-action="ms-stop">⏹ 停止</button>
        <span class="sop-hint">${wordCount(S.en)} 词 · ${sents.length} 句</span>
      </div>
    </div>

    <div class="card" style="margin-top:12px;padding:16px 18px">
      <label style="font-weight:600;display:block;margin-bottom:6px">③ 接着练（送进站内已有的训练引擎）</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" data-action="ms-stage" ${hasEn ? "" : "disabled"}>🏁 五阶段闯关（盲听→跟读→听写→复述）</button>
        <button class="btn btn-primary" data-action="ms-eval4" ${hasEn ? "" : "disabled"}>🧭 四维口语实战评分</button>
        <button class="btn btn-soft" data-action="ms-subtitle" ${hasEn ? "" : "disabled"}>📺 字幕逐句点读</button>
        <button class="btn btn-soft" data-action="ms-flash" ${hasEn ? "" : "disabled"}>🃏 实词加入单词卡（FSRS）</button>
      </div>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-outline btn-sm" data-action="ms-save" ${hasEn ? "" : "disabled"}>💾 存进我的自述语料库</button>
        <button class="btn btn-outline btn-sm" data-action="ms-reset">🗑 清空本次</button>
      </div>
      <div class="field-note" style="margin-top:8px">
        <b>为什么是这几步</b>：读准之前先别急着读快——先在「五阶段闯关」里盲听、逐句跟读、听写、复述各过一遍，再回来点「✓ 已背下来」。<br>
        1000h 的方法里，跟读要走到<b>完整跟读 + 录音对比 + 背诵</b>才算数；只收藏不开口，语料库不会变成你的口语。
      </div>
    </div>

    ${preview ? '<div class="card" style="margin-top:12px;padding:12px 14px"><div class="chat-head" style="margin-bottom:8px"><span>📄 逐句预览</span></div><div class="sub-list">' + preview + "</div></div>" : ""}

    <div class="card" style="margin-top:12px;padding:16px 18px">
      <div class="chat-head" style="margin-bottom:8px"><span>📚 我的自述语料库（${items.length}）</span></div>
      ${listHtml}
    </div>
    `;

    bindInputs();
  }

  /* 输入框实时同步：避免每次点击都丢字（textarea 不进 innerHTML 重建） */
  function bindInputs() {
    const cn = document.getElementById("msCn");
    if (cn) cn.addEventListener("input", function () {
      S.cn = cn.value;
      const c = document.getElementById("msCnCount");
      if (c) c.textContent = cnLength(S.cn) + " 字";
    });
    const en = document.getElementById("msEn");
    if (en) en.addEventListener("input", function () { S.en = en.value; });
    const ti = document.getElementById("msTitle");
    if (ti) ti.addEventListener("input", function () { S.title = ti.value; });
  }

  /* ---------------- 事件委托 ---------------- */
  function doAction(act, el) {
    const cn = document.getElementById("msCn"); if (cn) S.cn = cn.value;
    const en = document.getElementById("msEn"); if (en) S.en = en.value;
    const ti = document.getElementById("msTitle"); if (ti) S.title = ti.value;

    if (act === "ms-ai") { aiRewrite(); return; }
    if (act === "ms-manual") {
      S.error = ""; render();
      const box = document.getElementById("msEn");
      if (box) box.focus();
      return;
    }
    if (act === "ms-tone") { S.tone = el.getAttribute("data-id") || "email"; render(); return; }
    if (act === "ms-play") { playEn(); return; }
    if (act === "ms-stop") { if (window.Player && window.Player.stop) window.Player.stop(); return; }
    if (act === "ms-stage") { sendToStage(); return; }
    if (act === "ms-eval4") { sendToEval4(); return; }
    if (act === "ms-subtitle") { sendToSubtitle(); return; }
    if (act === "ms-flash") { sendToFlash(); return; }
    if (act === "ms-save") { saveCurrent(); return; }
    if (act === "ms-reset") { S.cn = ""; S.en = ""; S.title = ""; S.error = ""; render(); return; }
    const i = parseInt(el.getAttribute("data-i"), 10);
    if (act === "ms-load") { loadItem(i); return; }
    if (act === "ms-done") { markDone(i); return; }
    if (act === "ms-del") { delItem(i); return; }
  }

  if (typeof document !== "undefined") document.addEventListener("click", function (e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const act = el.getAttribute("data-action");
    if (!act || act.indexOf("ms-") !== 0) return;
    /* 列表里的 ms-play 带 data-i，编辑区的 ms-play 不带——按有无 data-i 分派 */
    if (act === "ms-play" && el.hasAttribute("data-i")) { playItem(parseInt(el.getAttribute("data-i"), 10)); return; }
    doAction(act, el);
  });
})();
