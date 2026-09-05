/* ============ 句型克隆库（Patterns）============
   从现有例句/短语里抽出「句子骨架」：一句里挖空一个「内容块」，你看到固定语序骨架（____），
   根据中文义把该块填回去，练"地道句型的整体骨架"，而非孤立单词（与「句块重排」互补）。
   支持「按功能」分组（请求/说明/致歉/感谢/报价/确认/其它）+ 按单元筛选，练习更聚焦。
   完成一轮会话会把它计入「今日任务」与连续打卡天数（接入打卡体系，见 app.js CoachBridge）。
   依赖：window.SentenceParser（chunks）、window.Player（朗读）、window.TutorEnv（esc/toast）。 */
(function () {
  "use strict";

  const E = function () { return window.TutorEnv || {}; };
  const esc = function (s) { return String(s == null ? "" : s); };
  const toast = function (m) { if (E().toast) E().toast(m); };

  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim(); }
  function wordSimilar(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    if (a === b) return 1;
    const m = a.length, n = b.length;
    if (!m || !n) return 0;
    const dp = [];
    for (let i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return 1 - dp[m][n] / Math.max(m, n);
  }

  /* ---- 功能分组 ---- */
  const TAGS = [
    { id: "all", label: "全部" },
    { id: "request", label: "请求/询价" },
    { id: "arrange", label: "说明/安排" },
    { id: "apolog", label: "致歉/客诉" },
    { id: "thanks", label: "感谢/回应" },
    { id: "price", label: "报价/价格" },
    { id: "confirm", label: "确认/条件" },
    { id: "other", label: "其它" }
  ];
  function tagFor(text) {
    const t = String(text).toLowerCase();
    if (/(could|could you|could we|can you|would you please|\bplease\b)/.test(t)) return "request";
    if (/(sorry|apolog|regret|complaint|problem|issue)/.test(t)) return "apolog";
    if (/(thank|appreciate)/.test(t)) return "thanks";
    if (/(price|discount|quotation|quote|offer|cost)/.test(t)) return "price";
    if (/(\bif\b|\bonce\b|as soon as|provided)/.test(t)) return "confirm";
    if (/(\bwe will\b|we'll|shipment|production|schedule|arrange|deliver|shipping)/.test(t)) return "arrange";
    return "other";
  }

  function corpus() {
    const out = [];
    const DATA = (typeof FTE_DATA !== "undefined") ? FTE_DATA : null;
    (DATA && DATA.units || []).forEach(function (u) {
      (u.vocab || []).forEach(function (v) { if (v.ex && v.exCn) out.push({ text: v.ex, cn: v.exCn, unit: u, key: v.w }); });
      (u.phrases || []).forEach(function (p) { if (p.ex && p.exCn) out.push({ text: p.ex, cn: p.exCn, unit: u, key: p.p }); });
    });
    return out;
  }

  function buildFrames() {
    const SP = window.SentenceParser;
    if (!SP || !SP.chunks) return [];
    const frames = [];
    corpus().forEach(function (c) {
      const sp = SP.chunks(c.text);
      if (!sp || sp.blocks.length < 2) return;
      const blocks = sp.blocks.slice().sort(function (a, b) { return a.o - b.o; });
      const low = String(c.key).toLowerCase();
      let idx = -1;
      for (let i = 0; i < blocks.length; i++) { if (blocks[i].t.toLowerCase().indexOf(low) !== -1) { idx = i; break; } }
      if (idx < 0) { let best = 0; blocks.forEach(function (b, i) { const n = b.t.split(/\s+/).filter(Boolean).length; if (n > best) { best = n; idx = i; } }); }
      if (idx < 0 || !blocks[idx].t.trim()) return;
      const display = blocks.map(function (b, i) { return i === idx ? "＿＿＿" : b.t; }).join(" ");
      frames.push({ display: display, slot: blocks[idx].t, cn: c.cn, key: c.key, unit: c.unit, text: c.text, tag: tagFor(c.text) });
    });
    const seen = {}; const uniq = [];
    frames.forEach(function (f) { const k = f.display + "|" + f.tag; if (!seen[k]) { seen[k] = true; uniq.push(f); } });
    return uniq;
  }

  /* 过滤：功能标签 + 单元 */
  function filterFrames(all, tag, unit) {
    return all.filter(function (f) {
      if (tag !== "all" && f.tag !== tag) return false;
      if (unit !== "all" && f.unit.id !== unit) return false;
      return true;
    });
  }

  let state = null;

  function filterBarHtml() {
    const chips = TAGS.map(function (t) {
      return '<button class="pt-tag ' + (state.tag === t.id ? "on" : "") + '" data-action="pt-tag" data-id="' + t.id + '">' + t.label + '</button>';
    }).join("");
    const unitOpts = '<option value="all">全部单元</option>' + (window.FTE_DATA ? window.FTE_DATA.units.map(function (u) { return '<option value="' + u.id + '">' + u.id + '. ' + esc(u.title) + '</option>'; }).join("") : "");
    return '<div class="field"><label>按功能分类</label><div class="scen-grid" style="gap:8px">' + chips + '</div></div>' +
      '<div class="field" style="margin-top:10px"><label>按课程单元</label><select id="ptUnit" data-action="pt-unit">' + unitOpts + '</select></div>';
  }

  function goalBanner() {
    if (!(window.CoachBridge && window.CoachBridge.text)) return "";
    return '<div class="goal-banner">🎯 ' + window.CoachBridge.text() + '</div>';
  }

  function render() {
    const app = document.getElementById("app");
    if (!app) return;
    if (!state) state = { all: buildFrames(), frames: [], idx: 0, done: false, typed: "", ok: false, results: [], tag: "all", unit: "all", credited: false };
    if (!state.frames.length) state.frames = state.all;
    const n = filterFrames(state.all, state.tag, state.unit);
    /* 过滤变化时重置队列 */
    if (state.tag === "all" && state.unit === "all") state.frames = state.all;
    else state.frames = n;
    if (state.idx >= state.frames.length) state.idx = 0;
    if (!state.frames.length) {
      app.innerHTML = '<div class="page-head"><h2>🧩 句型克隆库</h2></div>' + goalBanner() + filterBarHtml() + '<div class="empty" style="padding:40px"><div class="e-icon">🧩</div>该分组暂无句型，请换一个分类。</div>';
      return;
    }
    const i = state.idx;
    if (i >= state.frames.length) { app.innerHTML = doneHtml(); return; }
    const f = state.frames[i];
    let feed = "";
    if (state.done) {
      const ok = state.ok;
      const sim = wordSimilar(state.typed, f.slot);
      const tag = TAGS.find(function (t) { return t.id === f.tag; });
      feed = '<div class="ws-feed"><div style="font-weight:700;color:' + (ok ? "var(--ok)" : "var(--bad)") + '">' + (ok ? "✓ 对！句式骨架用对了" : "✗ 再对照一下（相似度 " + Math.round(sim * 100) + "%）") + '</div>' +
        '<div style="margin-top:6px">你填：' + esc(state.typed) + '<br>该块应为：<b>' + esc(f.slot) + '</b></div>' +
        '<div style="margin-top:6px;color:var(--muted)">完整句：' + esc(f.text) + '<br>中文：' + esc(f.cn) + (tag ? '<br>功能：' + tag.label : "") + '</div>' +
        '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn btn-primary btn-sm" data-action="pt-next">' + (i + 1 >= state.frames.length ? "看结果 →" : "下一个 →") + '</button>' +
        '<button class="btn btn-outline btn-sm" data-action="pt-retry">🔄 再填一次</button>' +
        '</div></div>';
    }
    app.innerHTML = `
    <div class="page-head"><h2>🧩 句型克隆库</h2><div class="en">看中文 → 把挖空的英语内容块填回（练骨架，不是背单词）</div></div>
    ${goalBanner()}
    <div class="card" style="margin-top:10px">${filterBarHtml()}</div>
    <div class="quiz-progress"><i style="width:${(i / state.frames.length * 100)}%"></i></div>
    <div class="card">
      <div class="chat-head"><span>第 ${i + 1} / ${state.frames.length} 句 <span class="stat-pill" style="font-size:12px">关键表达：${esc(f.key)}</span></span>
        <button class="play-btn" data-action="pt-speak" title="听完整句">🔊</button></div>
      <div class="q-text" style="margin-top:10px">${esc(f.display)}</div>
      <div class="q-sub" style="margin-top:6px"><b>中文义：</b>${esc(f.cn)}</div>
      ${!state.done ? '<textarea id="ptInput" class="write-input" rows="2" style="margin-top:10px" placeholder="输入挖空（____）处应填的英语内容块…"></textarea>' : ""}
      ${!state.done ? '<div style="margin-top:10px"><button class="btn btn-primary btn-sm" data-action="pt-check">✅ 核对</button></div>' : ""}
      ${feed}
    </div>`;
  }

  function doneHtml() {
    const comp = state.results || [];
    const ok = state.frames.filter(function (f, i) { return comp[i]; }).length;
    const total = state.frames.length;
    const acc = total ? Math.round(ok / total * 100) : 0;
    /* 记入今日任务 + 连续打卡（一轮完成即可，只记一次） */
    if (!state.credited) { state.credited = true; if (window.CoachBridge && window.CoachBridge.done) window.CoachBridge.done("patterns"); }
    return '<div class="page-head"><h2>🧩 句型克隆库 · 完成</h2></div>' + goalBanner() +
      '<div class="card result-box" style="text-align:center;padding:30px 20px"><div class="score ' + (acc >= 85 ? "good" : acc >= 60 ? "mid" : "bad") + '">' + acc + '%</div>' +
      '<p>填对 ' + ok + ' / ' + total + ' 句</p>' +
      '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px">' +
      '<button class="btn btn-primary" data-action="pt-restart">再来一轮</button>' +
      '<button class="btn btn-outline" data-action="pt-back">返回</button></div></div>';
  }

  if (typeof document !== "undefined") document.addEventListener("click", function (e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const act = el.getAttribute("data-action");
    if (act.indexOf("pt-") !== 0) return;
    if (act === "pt-tag") { state.tag = el.getAttribute("data-id"); state.idx = 0; state.done = false; state.typed = ""; state.ok = false; render(); return; }
    if (act === "pt-speak") { const f = state.frames[state.idx]; if (f && window.Player) window.Player.speak(f.text, { rate: 0.95 }); return; }
    if (act === "pt-check") {
      const inp = document.getElementById("ptInput");
      const f = state.frames[state.idx];
      const typed = (inp ? inp.value : "").trim();
      if (!typed) { toast("先填入挖空处的内容再核对"); return; }
      const ok = wordSimilar(typed, f.slot) >= 0.7;
      state.typed = typed; state.ok = ok; state.done = true;
      if (!state.results) state.results = [];
      state.results[state.idx] = ok;
      render(); return;
    }
    if (act === "pt-next") { state.idx++; state.done = false; state.typed = ""; state.ok = false; render(); return; }
    if (act === "pt-retry") { state.done = false; state.typed = ""; state.ok = false; render(); return; }
    if (act === "pt-restart") { state = { all: state.all, frames: state.frames, idx: 0, done: false, typed: "", ok: false, results: [], tag: state.tag, unit: state.unit, credited: false }; render(); return; }
    if (act === "pt-back") { state = null; render(); return; }
  });

  if (typeof document !== "undefined") document.addEventListener("change", function (e) {
    const sel = e.target && e.target.closest ? e.target.closest("[data-action='pt-unit']") : null;
    if (sel) { state.unit = parseInt(sel.value, 10) || "all"; state.idx = 0; state.done = false; state.typed = ""; state.ok = false; render(); }
  });

  window.Patterns = { render: render, build: buildFrames, TAGS: TAGS };
})();
