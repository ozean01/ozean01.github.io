/* ============ 软包装外贸英语 · 应用主逻辑 ============ */
(function () {
  "use strict";

  const app = document.getElementById("app");
  const DATA = FTE_DATA;

  /* ---------------- 工具 ---------------- */
  const esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };
  const nl2br = function (s) { return esc(s).replace(/\n/g, "<br>"); };

  /* 高亮匹配词（转义安全） */
  function hlText(str, term) {
    if (!term) return esc(str);
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const out = [];
    const src = String(str);
    let last = 0, m;
    while ((m = re.exec(src)) !== null) {
      out.push(esc(src.slice(last, m.index)));
      out.push("<mark>" + esc(m[0]) + "</mark>");
      last = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    out.push(esc(src.slice(last)));
    return out.join("");
  }

  function norm(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  function wordOverlap(a, b) {
    const wa = norm(a).split(" "), wb = norm(b).split(" ");
    if (!wa.length || !wb.length) return 0;
    let hit = 0;
    wa.forEach(function (w) { if (w && wb.indexOf(w) !== -1) hit++; });
    return hit / Math.max(wa.length, wb.length);
  }
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------------- 进度 ---------------- */
  const PROG_KEY = "fte-progress-v1";
  const PREF_KEY = "fte-pref-v2";
  function defaultProgress() {
    /* 默认使用浏览器内置语音（离线可用、最可靠）。在线高音质（Google 音源）端点已被 Google
       封禁/需要真实客户端令牌，普通前端调用经常失败，因此不再作为默认；
       仍可在发音设置里手动开启，开启失败时会自动回退到浏览器语音。 */
    return { learned: {}, quizBest: {}, dict: {}, flash: {}, done: {}, rate: 1, voice: "",
      engine: "native", useGoogle: false, azureKey: "", azureRegion: "", azureVoice: "en-US-JennyNeural", azurePA: true, localASR: false };
  }
  /* 一次性迁移标记：旧版本把在线 Google 音源当作默认，而该音源现已不可靠，
     首次迁移时把未手动关闭过它的旧设置切回浏览器语音，避免后续覆盖用户手动选择。 */
  const MIG_KEY = "fte-mig-google-default";
  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem(PROG_KEY));
      if (p && typeof p === "object") {
        const merged = Object.assign(defaultProgress(), p);
        if (merged.useGoogle && !localStorage.getItem(MIG_KEY)) {
          localStorage.setItem(MIG_KEY, "1");
          merged.useGoogle = false;
        }
        return merged;
      }
    } catch (e) { /* ignore */ }
    return defaultProgress();
  }
  let progress = loadProgress();
  function saveProgress() {
    try { localStorage.setItem(PROG_KEY, JSON.stringify(progress)); } catch (e) { /* ignore */ }
  }

  /* 将保存的设置同步到语音引擎 */
  function syncPlayerSettings() {
    Player.engine = progress.engine || "native";
    Player.defaultVoiceName = progress.voice || "";
    Player.azure = { key: progress.azureKey || "", region: progress.azureRegion || "", voice: progress.azureVoice || "en-US-JennyNeural" };
    Player.onEngineFallback = function () {
      /* 在线音源一旦失败就永久切回浏览器语音，避免每句都失败/反复提示 */
      if (progress.engine && progress.engine !== "native") {
        progress.engine = "native";
        saveProgress();
        syncPlayerSettings();
      }
      toast("⚠️ 在线高音质音源不可用，已改用浏览器语音（离线可用）。建议用 Edge 的 Online(Natural) 人声，或在设置里检查 Azure Key / Region");
    };
  }
  syncPlayerSettings();

  /* 供 tutor.js（AI 口语陪练）使用的桥接层 */
  window.TutorEnv = {
    esc: esc,
    toast: toast,
    getProgress: function () { return progress; },
    saveProgress: saveProgress,
    Player: Player,
    lookupWord: function (word) {
      const q = String(word).toLowerCase();
      for (let ui = 0; ui < DATA.units.length; ui++) {
        const u = DATA.units[ui];
        for (let vi = 0; vi < u.vocab.length; vi++) {
          const v = u.vocab[vi];
          if (String(v.w).toLowerCase() === q) return { cn: v.cn, ex: v.ex, exCn: v.exCn, ipa: v.ipa };
        }
      }
      return null;
    }
  };

  const wordId = function (u, i) { return u.id + "-" + i; };
  function unitWords(u) {
    return u.vocab.map(function (v, i) { return { id: wordId(u, i), u: u, v: v }; });
  }
  function unitLearned(u) { return unitWords(u).filter(function (w) { return progress.learned[w.id]; }).length; }
  function unitPct(u) { return Math.round(unitLearned(u) / Math.max(1, u.vocab.length) * 100); }
  function getUnit(id) { return DATA.units.find(function (u) { return u.id === id; }) || DATA.units[0]; }
  function totalLearned() { return Object.keys(progress.learned).length; }

  const totals = DATA.units.reduce(function (a, u) {
    a.words += u.vocab.length;
    a.phrases += u.phrases.length;
    a.dlg += u.dialogues.length;
    a.lines += u.dialogues.reduce(function (s, d) { return s + d.lines.length; }, 0);
    return a;
  }, { words: 0, phrases: 0, dlg: 0, lines: 0 });

  /* ---------------- 全局状态 ---------------- */
  const State = {
    unitTab: "vocab",
    pendingHl: null,
    audioToken: 0,
    stopPlay: null,
    flash: null,
    quiz: null,
    speak: null,
    speakMode: "shadow",
    evalRec: null,
    recLine: null,
    mistFlow: "all",
    mistReveal: false
  };

  /* ---------------- 搜索索引 ---------------- */
  let searchIndex = null;
  function buildIndex() {
    const idx = [];
    DATA.units.forEach(function (u) {
      idx.push({ type: "单元", text: u.title + " " + u.titleEn, sub: u.summary, href: "#/unit/" + u.id, hl: u.title });
      u.vocab.forEach(function (v) {
        idx.push({ type: "单词", text: v.w, sub: v.cn + " · " + v.ex, href: "#/unit/" + u.id, hl: v.w });
      });
      u.phrases.forEach(function (p) {
        idx.push({ type: "短语", text: p.p, sub: p.cn + " · " + p.ex, href: "#/unit/" + u.id, hl: p.p });
      });
      u.dialogues.forEach(function (d) {
        d.lines.forEach(function (l) {
          idx.push({ type: "对话", text: l.en, sub: l.cn, href: "#/unit/" + u.id, hl: l.en });
        });
      });
    });
    const MK = window.FTE_MISTAKES;
    if (MK && MK.groups) {
      MK.groups.forEach(function (g) {
        g.items.forEach(function (m) {
          idx.push({ type: "易错点", text: g.title + " · " + m.right, sub: m.why, href: "#/mistakes", hl: m.wrong });
        });
      });
    }
    return idx;
  }
  function queryIndex(q) {
    if (!searchIndex) searchIndex = buildIndex();
    const ql = q.toLowerCase();
    const rank = {
      "单词": 0, "短语": 1, "对话": 2, "单元": 3, "易错点": 2
    };
    return searchIndex
      .filter(function (it) {
        return it.text.toLowerCase().indexOf(ql) !== -1 || it.sub.toLowerCase().indexOf(ql) !== -1;
      })
      .sort(function (a, b) {
        const as = a.text.toLowerCase().indexOf(ql) === 0 ? 0 : 1;
        const bs = b.text.toLowerCase().indexOf(ql) === 0 ? 0 : 1;
        if (as !== bs) return as - bs;
        return (rank[a.type] || 9) - (rank[b.type] || 9);
      });
  }

  /* ---------------- Toast ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById("toast");
    const text = String(msg);
    /* 含换行的诊断文案用 innerHTML 渲染 <br>（内部为固定文本）；普通消息用 textContent 防注入 */
    if (text.indexOf("\n") !== -1) t.innerHTML = text.replace(/\n/g, "<br>");
    else t.textContent = text;
    t.hidden = false;
    t.classList.remove("show");
    void t.offsetWidth;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, Math.max(3000, text.split("\n").length * 1200));
  }

  /* ---------------- 头部状态 ---------------- */
  function updateHeaderStat() {
    const el = document.getElementById("headerStat");
    if (el) el.textContent = "🎯 " + totalLearned() + "/" + totals.words;
  }

  /* ---------------- 路由 ---------------- */
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const parts = h.split("/").filter(Boolean);
    if (!parts.length) return { view: "home" };
    if (parts[0] === "unit" && parts[1]) return { view: "unit", id: parseInt(parts[1], 10) };
    if (parts[0] === "search") return { view: "search", q: decodeURIComponent(parts.slice(1).join("/")) };
    if (["units", "flash", "quiz", "speak", "tutor", "coach", "listen", "eval4", "sop", "mistakes", "home"].indexOf(parts[0]) !== -1) return { view: parts[0] };
    return { view: "home" };
  }

  function setNavActive(view) {
    document.querySelectorAll("#mainNav a").forEach(function (a) {
      const key = a.getAttribute("data-nav");
      let active = false;
      if (view === "unit" || view === "units") active = key === "units";
      else if (view === "search") active = false;
      else active = key === view;
      a.classList.toggle("active", active);
    });
  }

  function renderRoute() {
    const route = parseHash();
    clearCoachTimer();          // 离开「AI 教练手册」页时停止计时器
    setNavActive(route.view);
    updateHeaderStat();
    try {
      if (route.view === "home") renderHome();
      else if (route.view === "units") renderUnits();
      else if (route.view === "mistakes") renderMistakes();
      else if (route.view === "unit") renderUnit(route);
      else if (route.view === "flash") renderFlash();
      else if (route.view === "quiz") renderQuiz();
      else if (route.view === "speak") renderSpeak();
      else if (route.view === "eval4") window.Eval4.render();
      else if (route.view === "listen") window.Listen.render();
      else if (route.view === "tutor") window.Tutor.render();
      else if (route.view === "coach") renderCoach();
      else if (route.view === "sop") window.SOP.render();
      else if (route.view === "search") renderSearch(route);
    } catch (err) {
      console.error(err);
      app.innerHTML = '<div class="empty"><div class="e-icon">😵</div>页面渲染出错：' + esc(err.message) + '</div>';
    }
    window.scrollTo(0, 0);
  }

  /* ================= 首页 ================= */
  /* ---- 单元掌握度分布（可视化） ---- */
  function masteryBlockHtml() {
    const rows = DATA.units.map(function (u) {
      const pct = unitPct(u);
      const color = pct >= 80 ? "var(--ok)" : pct >= 40 ? "var(--accent)" : "var(--primary)";
      return `
      <div class="mastery-row">
        <span class="m-label">${u.icon} ${esc(u.title)}</span>
        <div class="m-bar"><div class="m-fill" style="width:${pct}%;background:${color}"></div></div>
        <span class="m-pct">${pct}%</span>
      </div>`;
    }).join("");
    return `
    <h3 class="section-title">📊 单元掌握度 <span class="sub">每单元已掌握词汇占比 ● 100% 即完成</span></h3>
    <div class="card mastery-wrap">
      ${rows}
    </div>`;
  }

  /* ---- 首页横幅：外贸实操 SOP 完成度 ---- */
  function sopBannerHtml() {
    const s = (window.SOP && window.SOP.stats) ? window.SOP.stats() : { done: 0, total: 0 };
    const pct = s.total ? Math.round(s.done / s.total * 100) : 0;
    return `
    <div class="sop-banner">
      <div class="sb-ic">🧭</div>
      <div class="sb-main">
        <b>外贸流程实际操作，你做对了吗？</b>
        <span>付款是前提 · 单据要一致 · 节点要确认 —— 四阶段实操清单已完成 ${s.done}/${s.total}（${pct}%）</span>
        <div class="progressbar" style="margin-top:6px;max-width:320px"><i class="${pct === 100 ? "full" : ""}" style="width:${pct}%"></i></div>
      </div>
      <div class="sb-actions">
        <a class="btn btn-primary btn-sm" href="#/sop">进入实操 SOP →</a>
        <a class="btn btn-outline btn-sm" href="#/unit/12">配套单证英语 →</a>
      </div>
    </div>`;
  }

  /* ---- 首页：记忆保持率与到期负载（基于 FSRS 遗忘曲线 R(t,S)） ---- */
  function retentionForecastHtml() {
    const now = Date.now(), DAY = 86400000;
    const day = (t) => Math.ceil((t - now) / DAY);
    let sum = 0, n = 0, due7 = 0, due30 = 0;
    const perUnit = [];
    DATA.units.forEach(function (u) {
      let uSum = 0, uN = 0;
      unitWords(u).forEach(function (w) {
        const f = progress.flash[w.id];
        if (!f || !f.reps) return;
        const r = window.Flashcards ? window.Flashcards.retentionOf(f, now) : null;
        if (r == null) return;
        uSum += r; uN++; sum += r; n++;
        const d = day(f.due || now);
        if (d <= 7) due7++;
        if (d <= 30) due30++;
      });
      if (uN) perUnit.push({ u: u, r: uSum / uN });
    });
    if (!n) return "";
    const avgR = sum / n;
    const rCls = avgR >= 0.85 ? "ok" : avgR >= 0.7 ? "mid" : "bad";
    const weak = perUnit.slice().sort(function (a, b) { return a.r - b.r; }).slice(0, 3);
    const weakHtml = weak.map(function (x) {
      const p = Math.round(x.r * 100);
      const col = p >= 85 ? "var(--ok)" : p >= 70 ? "var(--accent)" : "var(--bad)";
      return `<div class="mastery-row"><span class="m-label">${esc(x.u.title)}</span>
        <div class="m-bar"><div class="m-fill" style="width:${p}%;background:${col}"></div></div>
        <span class="m-pct">${p}%</span></div>`;
    }).join("");
    return `
    <h3 class="section-title">🧠 记忆保持率 <span class="sub">FSRS 遗忘曲线估算 · 越接近 100% 记得越牢</span></h3>
    <div class="card mastery-wrap">
      <div class="sop-overall-a" style="margin-top:2px">
        <span class="badge badge-ok">整体保持率 <b>${Math.round(avgR * 100)}%</b></span>
        <span class="badge badge-muted">未来 7 天到期 <b>${due7}</b> 词</span>
        <span class="badge badge-muted">未来 30 天到期 <b>${due30}</b> 词</span>
        <span class="sop-hint">保持率按 FSRS 遗忘曲线 R(t,S) 估算；低于 70% 说明该补复习了。</span>
      </div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:10px">
        <div class="progressbar" style="max-width:320px"><i class="${rCls === "bad" ? "" : "full"}" style="width:${Math.round(avgR * 100)}%;background:${avgR >= 0.85 ? "var(--ok)" : avgR >= 0.7 ? "var(--accent)" : "var(--bad)"}"></i></div>
        <span class="pct">${Math.round(avgR * 100)}%</span>
      </div>
      <div style="margin-top:12px"><b style="font-size:13px;color:var(--muted)">最需要复习的单元（保持率最低）</b>
        <div style="margin-top:6px">${weakHtml}</div>
      </div>
    </div>`;
  }

  /* 「分级限词 · 高频复现」：把跨单元里同一个行业高频词的真实例句聚合起来，
     展示「同一个词在不同业务场景反复出现」——靠重复与情境自然记住，而非一次性背。 */
  function freqRepeatHtml() {
    /* 复现语料 = 词汇例句 + 短语例句 + 对话台词（真实业务语境） */
    const corpus = [];
    DATA.units.forEach(function (u) {
      u.vocab.forEach(function (v) { corpus.push({ ex: v.ex }); });
      u.phrases.forEach(function (p) { corpus.push({ ex: p.ex }); });
      u.dialogues.forEach(function (d) { d.lines.forEach(function (l) { corpus.push({ ex: l.en }); }); });
    });
    const terms = {};
    DATA.units.forEach(function (u) {
      u.vocab.forEach(function (v) {
        const k = String(v.w).toLowerCase();
        if (!terms[k]) terms[k] = { w: v.w, tag: wordFreqTag(v.w), occ: [] };
      });
    });
    Object.keys(terms).forEach(function (k) {
      const t = terms[k];
      let re;
      try { re = new RegExp("\\b" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"); } catch (e) { re = null; }
      if (!re) return;
      corpus.forEach(function (c) { if (re.test(c.ex)) t.occ.push({ ex: c.ex }); });
    });
    /* 真正『反复出现』的词（>=3 处，跨多个业务语境），按复现次数取前 12 */
    const list = Object.keys(terms).map(function (k) { return terms[k]; })
      .filter(function (t) { return t.occ.length >= 3; })
      .sort(function (a, b) { return b.occ.length - a.occ.length; })
      .slice(0, 12);
    if (!list.length) return "";
    let feui = 0;
    return `
    <h3 class="section-title">📌 高频行业词 · 多场景复现 <span class="sub">同一个词在不同业务场景反复出现，靠重复自然记住（每个例句都能点 🎯 跟读评测）</span></h3>
    <div class="freq-grid">
      ${list.map(function (it) {
        return `<details class="freq-item">
          <summary><b>${esc(it.w)}</b><span class="word-freq ${it.tag.cls}">${it.tag.label}</span><em>${it.occ.length} 处复现</em></summary>
          <div class="freq-exs">${it.occ.map(function (e) {
            const id = "freq-ev-" + (feui++);
            return `<div class="freq-ex">
              <span class="freq-sentence">${esc(e.ex)}</span>
              ${Player.recognitionSupported()
                ? '<button class="eval-btn" data-action="freq-shadow" data-txt="' + esc(e.ex) + '" data-idx="' + id + '" title="跟读评测：听一遍再跟读打分">🎯</button>'
                : ""}
              <div class="freq-eval" id="${id}"></div>
            </div>`;
          }).join("")}</div>
        </details>`;
      }).join("")}
    </div>`;
  }

  /* 本周易错 / 高频词回顾：首页卡片，聚合「常错词、AI 陪练错句、未掌握的高频词」 */
  function recurringTop(n) {
    const corpus = [];
    DATA.units.forEach(function (u) {
      u.vocab.forEach(function (v) { corpus.push(v.ex); });
      u.phrases.forEach(function (p) { corpus.push(p.ex); });
      u.dialogues.forEach(function (d) { d.lines.forEach(function (l) { corpus.push(l.en); }); });
    });
    const count = {}, meta = {};
    DATA.units.forEach(function (u) {
      u.vocab.forEach(function (v, i) {
        const k = String(v.w).toLowerCase();
        if (count[k] == null) count[k] = 0;
        if (!meta[k]) meta[k] = { w: v.w, ipa: v.ipa || "", id: u.id + "-" + i, uid: u.id };
      });
    });
    Object.keys(count).forEach(function (k) {
      let re;
      try { re = new RegExp("\\b" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"); } catch (e) { re = null; }
      if (!re) return;
      corpus.forEach(function (c) { if (re.test(c)) count[k]++; });
    });
    return Object.keys(count).map(function (k) {
      return { w: meta[k].w, ipa: meta[k].ipa, n: count[k], id: meta[k].id, uid: meta[k].uid };
    }).filter(function (x) { return x.n >= 3; }).sort(function (a, b) { return b.n - a.n; }).slice(0, n);
  }

  function weekReviewHtml() {
    const weekAgo = Date.now() - 7 * 86400000;
    const map = {};
    DATA.units.forEach(function (u) { u.vocab.forEach(function (v, i) { map[u.id + "-" + i] = { v: v, u: u }; }); });
    /* 本周常错词：本周认真复习过且错得多 */
    const wrong = Object.keys(progress.wrong || {}).map(function (id) {
      const rec = progress.flash && progress.flash[id];
      return { id: id, n: progress.wrong[id], last: rec && rec.last ? rec.last : 0 };
    }).filter(function (x) { return x.n >= 1 && map[x.id] && x.last >= weekAgo; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 6);
    const review = (progress.tutorReview || []).slice(0, 3);
    /* 高频词：复现最多、但还没掌握 */
    const high = recurringTop(9).filter(function (x) { return !progress.learned[x.id]; }).slice(0, 6);

    const chip = function (text, id, unitId, extra) {
      return '<span class="wk-word"><button class="play-btn" data-action="play-text" data-text="' + esc(text) + '" title="朗读">▶</button>' +
        '<span class="wk-t">' + esc(text) + '</span>' +
        (extra ? '<span class="wk-x">' + esc(extra) + '</span>' : "") +
        '<a class="wk-go" href="#/unit/' + unitId + '">去学 →</a></span>';
    };

    return `
    <div class="card wk-review">
      <div class="chat-head"><span>📅 本周易错 / 高频词回顾</span><span class="sop-hint">凭记忆先想，再点 ▶ 朗读，复习错词与被忽略的高频词</span></div>
      <div class="wk-cols">
        <div class="wk-col">
          <b>🔥 本周常错词 <span class="wk-sub">（最近复习仍易错的词）</span></b>
          <div class="wk-list">${wrong.length
            ? wrong.map(function (x) { return chip(map[x.id].v.w, x.id, map[x.id].u.id, "错 " + x.n + " 次"); }).join("")
            : '<p class="sop-tipline">这周很稳或刚起步。去 <a href="#/flash">单词卡</a> / <a href="#/quiz">测验</a> 做几题，这里会生成你该复习的词。</p>'}</div>
          ${review.length
            ? '<div class="wk-sub2">📌 今天没说顺的句子（AI 陪练）</div><div class="wk-list">' +
              review.map(function (r) { return chip(r.en, "", 1, ""); }).join("") + '</div>'
            : ""}
        </div>
        <div class="wk-col">
          <b>📌 高频词 · 还没掌握 <span class="wk-sub">（业务里反复出现但没记住）</span></b>
          <div class="wk-list">${high.length
            ? high.map(function (h) { return chip(h.w, h.id, h.uid, h.n + " 处"); }).join("")
            : '<p class="sop-tipline">高频词都掌握了！可去「📌 高频行业词·多场景复现」再读一遍保持复现。</p>'}</div>
        </div>
      </div>
      <div class="wk-actions">
        <a class="btn btn-soft btn-sm" href="#/flash">🃏 去单词卡复习 →</a>
        <a class="btn btn-outline btn-sm" href="#/mistakes">⚠️ 易错点 →</a>
        <a class="btn btn-outline btn-sm" href="#/tutor">🤖 AI 陪练 →</a>
      </div>
    </div>`;
  }

  function renderHome() {    const firstTodo = DATA.units.find(function (u) { return unitPct(u) < 100; });    const nextUnit = firstTodo || DATA.units[0];
    const nextPct = unitPct(nextUnit);
    const doneCount = DATA.units.filter(function (u) { return progress.done[u.id] || unitPct(u) === 100; }).length;

    app.innerHTML = `
    <section class="hero">
      <h1>${esc(DATA.site.name)}</h1>
      <p>${esc(DATA.site.slogan)}</p>
      <div class="hero-tags">
        <span>🔊 真人发音朗读</span><span>🎤 跟读录音对比</span><span>✍️ 听写训练</span>
        <span>🤖 AI 口语陪练</span><span>🗂 ${totals.words} 个核心词汇</span><span>💬 ${totals.dlg} 段实战对话</span>
      </div>
      <div class="hero-cta">
        <a class="btn btn-ghost" href="#/unit/${nextUnit.id}">${doneCount === DATA.units.length ? "复习课程" : "继续学习：" + esc(nextUnit.title)} →</a>
        <a class="btn btn-ghost" href="#/sop">🧭 外贸实操 SOP</a>
        <a class="btn btn-ghost" href="#/speak">🎤 开始听说训练</a>
        <a class="btn btn-ghost" href="#/flash">🃏 单词卡</a>
      </div>
    </section>

    ${sopBannerHtml()}

    ${coachBannerHtml()}

    <section class="stats-row">
      <div class="stat-card"><div class="num">${totals.words}</div><div class="lbl">核心词汇</div></div>
      <div class="stat-card"><div class="num">${totals.phrases}</div><div class="lbl">常用短语</div></div>
      <div class="stat-card"><div class="num">${totals.dlg}</div><div class="lbl">场景对话</div></div>
      <div class="stat-card"><div class="num">${totals.lines}</div><div class="lbl">对话语句</div></div>
      <div class="stat-card"><div class="num">${coachStats().streak}</div><div class="lbl">连续打卡(天) · 今天 ${coachStats().today} 分 <a href="#/coach" style="color:inherit;text-decoration:none">→</a></div></div>
      <div class="stat-card"><div class="num">${doneCount}/${DATA.units.length}</div><div class="lbl">已完成单元</div></div>
      <div class="stat-card"><div class="num">${totalLearned()}</div><div class="lbl">已掌握单词</div></div>
    </section>

    ${masteryBlockHtml()}

    ${retentionForecastHtml()}

    <h3 class="section-title">📚 学习路径 <span class="sub">按顺序学习，掌握完整外贸流程</span></h3>
    <div class="grid grid-3">${DATA.units.map(unitCardHtml).join("")}</div>

    ${freqRepeatHtml()}

    ${weekReviewHtml()}

    <h3 class="section-title">✨ 功能亮点</h3>
    <div class="grid grid-3">
      <div class="card">
        <div style="font-size:30px">🗣️</div>
        <h3 style="margin:8px 0 4px">AI 口语陪练</h3>
        <p style="font-size:13.5px;color:var(--muted)">接入你的大模型 API，与 native speaker 全英文对话：说错立刻纠正、生词自动收录、回复一键朗读、支持语音输入。</p>
        <a class="btn btn-soft btn-sm" style="margin-top:10px" href="#/tutor">开始对话 →</a>
      </div>
      <div class="card">
        <div style="font-size:30px">🎤</div>
        <h3 style="margin:8px 0 4px">听说训练</h3>
        <p style="font-size:13.5px;color:var(--muted)">TTS 真人发音朗读、逐句跟读并录音对比、听写训练、角色扮演对练，专攻“开口说”。</p>
        <a class="btn btn-soft btn-sm" style="margin-top:10px" href="#/speak">开始训练 →</a>
      </div>
      <div class="card">
        <div style="font-size:30px">🃏</div>
        <h3 style="margin:8px 0 4px">记忆单词卡</h3>
        <p style="font-size:13.5px;color:var(--muted)">基于间隔重复（Leitner）算法，自动安排复习时间，用最少的时间记住最多的词。</p>
        <a class="btn btn-soft btn-sm" style="margin-top:10px" href="#/flash">开始背词 →</a>
      </div>
      <div class="card">
        <div style="font-size:30px">🧭</div>
        <h3 style="margin:8px 0 4px">外贸实操 SOP</h3>
        <p style="font-size:13.5px;color:var(--muted)">订单确认后怎么走：内部流转、单证规范、订舱报关、T/T 与 L/C 风控、Incoterms 2020 速查，可勾选清单 + 英文话术 + CBM 与 CIF 计算器。</p>
        <a class="btn btn-soft btn-sm" style="margin-top:10px" href="#/sop">按流程自查 →</a>
      </div>
      <div class="card">
        <div style="font-size:30px">📝</div>
        <h3 style="margin:8px 0 4px">智能测验</h3>
        <p style="font-size:13.5px;color:var(--muted)">英译中、中译英、听句选义、选词填空四种题型，做完即时批改并保存最好成绩。</p>
        <a class="btn btn-soft btn-sm" style="margin-top:10px" href="#/quiz">去测验 →</a>
      </div>
    </div>

    ${eval4OverviewHtml()}

    <div class="card" style="margin-top:18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="font-size:26px">📖</div>
      <div style="flex:1;min-width:220px">
        <b>当前进度：第 ${nextUnit.id} 单元「${esc(nextUnit.title)}」</b>
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px;max-width:420px">
          <div class="progressbar"><i style="width:${nextPct}%"></i></div><span class="pct">${nextPct}%</span>
        </div>
      </div>
      <a class="btn btn-primary" href="#/unit/${nextUnit.id}">${doneCount === DATA.units.length ? "进入复习" : "继续学习 →"}</a>
    </div>
    `;
  }

  /* 四维口语实战 · 首页概览：最近一次成绩的四维条 + 最近 5 次列表 */
  function eval4OverviewHtml() {
    const list = (progress.eval4 || []).slice(0, 5);
    const latest = list[0];
    if (!latest) return "";
    const dims = [
      { k: "term", label: "术语发音" }, { k: "flu", label: "流利度" },
      { k: "acc", label: "应答准确性" }, { k: "log", label: "表达逻辑" }
    ];
    const bars = dims.map(function (d) {
      const v = latest[d.k] == null ? null : latest[d.k];
      const col = v == null ? "var(--muted)" : (v >= 80 ? "var(--ok)" : v >= 50 ? "var(--accent)" : "var(--bad)");
      return `
      <div class="e4-bar">
        <span class="e4-bar-label">${d.label}</span>
        <span class="e4-bar-track"><i style="width:${v == null ? 0 : v}%;background:${col}"></i></span>
        <span class="e4-bar-val">${v == null ? "—" : v + "%"}</span>
      </div>`;
    }).join("");
    const rows = list.map(function (r, i) {
      const score = r.total == null ? "—" : r.total + " 分";
      const date = new Date(r.time).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
      return `<span class="e4-his-chip">${r.icon} ${esc(r.title)} · ${score} · ${date}${i === 0 ? ' <b style="color:var(--ok)">最新</b>' : ""}</span>`;
    }).join("");
    return `
    <h3 class="section-title" style="margin-top:22px">🎯 四维口语实战 <span class="sub">最近一次：${esc(latest.title)}</span></h3>
    <div class="card" style="padding:16px 18px">
      <div class="e4-bars">${bars}</div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">${rows}</div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn btn-soft btn-sm" href="#/eval4">继续实战 →</a>
        <a class="btn btn-outline btn-sm" href="#/tutor">🎯 四维评分本场对话 →</a>
      </div>
    </div>`;
  }

  function unitCardHtml(u) {
    const pct = unitPct(u);
    const done = progress.done[u.id] || pct === 100;
    return `
    <a class="unit-card" href="#/unit/${u.id}" style="color:inherit">
      <div class="uc-top">
        <div class="uc-icon">${u.icon}</div>
        <div>
          <h3>${esc(u.title)}</h3>
          <div class="uc-en">${esc(u.titleEn)}</div>
        </div>
      </div>
      <div class="uc-sum">${esc(u.summary)}</div>
      <div class="uc-meta">
        <div class="progressbar"><i class="${done ? "full" : ""}" style="width:${pct}%"></i></div>
        <span class="pct">${pct}%</span>
        ${done ? '<span class="badge badge-ok">✓ 已完成</span>' : '<span class="badge badge-muted">继续学习</span>'}
      </div>
    </a>`;
  }

  /* ================= 课程列表 ================= */
  function renderUnits() {
    app.innerHTML = `
    <div class="page-head">
      <h2>📚 全部课程</h2>
      <div class="en">${DATA.units.length} 个单元 · 覆盖外贸全流程</div>
    </div>
    <div class="grid grid-2" style="margin-top:18px">${DATA.units.map(unitCardHtml).join("")}</div>`;
  }

  /* ================= 中国外贸人高频易错点 ================= */
  function renderMistakes() {
    const MK = window.FTE_MISTAKES;
    if (!MK || !MK.groups || !MK.groups.length) {
      app.innerHTML = '<div class="page-head"><h2>⚠️ 易错点</h2></div><div class="empty"><div class="e-icon">📭</div>易错点库尚未就绪。</div>';
      return;
    }
    const flows = MK.flows || [];
    const activeFlow = State.mistFlow || "all";
    const reveal = State.mistReveal;

    const flowTabs = [
      '<button class="chip ' + (activeFlow === "all" ? "active" : "") + '" data-action="mistake-flow" data-flow="all">全部流程</button>'
    ].concat(flows.map(function (f) {
      return '<button class="chip ' + (activeFlow === f.id ? "active" : "") + '" data-action="mistake-flow" data-flow="' + f.id + '">' + esc(f.label) + '</button>';
    })).join("");

    const groups = MK.groups.filter(function (g) { return activeFlow === "all" || g.flow === activeFlow; });

    const groupHtml = groups.map(function (g) {
      const items = g.items.map(function (m, i) {
        return `
        <div class="mistake-card" style="margin-top:12px">
          <div class="mk-wrong">❌ <span>${esc(m.wrong)}</span>
            <button class="play-btn" data-action="mistake-speak" data-text="${esc(m.wrong)}" title="朗读错误版（感受为什么别扭）">▶</button>
          </div>
          <div class="mk-right">
            ${reveal
              ? '✅ <span>' + esc(m.right) + '</span><button class="play-btn" data-action="mistake-speak" data-text="' + esc(m.right) + '" title="朗读正确版">▶</button>'
              : '<span class="mk-hidden" data-action="mistake-reveal" title="点击揭晓正确表达">（先想一下，再点揭晓）</span>'}
          </div>
          <div class="mk-why">💡 <b>为什么：</b>${esc(m.why)}</div>
          <div class="mk-ex">📖 行业例句：<span>${esc(m.ex)}</span>
            <button class="play-btn" data-action="mistake-speak" data-text="${esc(m.ex)}" title="朗读例句">▶</button>
            <span class="mk-excn">${esc(m.exCn)}</span>
          </div>
        </div>`;
      }).join("");

      return `
      <div class="card" style="padding:18px 20px;margin-top:18px">
        <div class="mk-head">
          <div style="font-size:24px">${g.icon}</div>
          <div>
            <h3 style="margin:0">${esc(g.title)}</h3>
            <span class="badge badge-muted">${esc(flowLabel(flows, g.flow))} · ${g.items.length} 条</span>
          </div>
        </div>
        <p style="font-size:13.5px;color:var(--muted);margin:10px 0 4px">${esc(g.intro)}</p>
        <div class="mk-items">${items}</div>
      </div>`;
    }).join("");

    app.innerHTML = `
    <div class="page-head">
      <div class="crumbs"><a href="#/home">首页</a> / 易错点</div>
      <h2>⚠️ 中国外贸人高频易错点</h2>
      <div class="en">提前把你"自己都不知道自己会犯的错"挖出来，再逐个讲清</div>
      <p style="margin-top:8px;max-width:760px;color:var(--muted)">${esc(MK.note || "")}<br>
        用法：先看<b>错误表达（红线）</b>，自己想一下该怎么改，再点揭晓正确版 → 听正确的 → 用<b>行业例句</b>跟读练一遍，把语感记牢。</p>
    </div>
    <div class="mistake-toolbar">
      <div class="chip-row">${flowTabs}</div>
      <button class="btn btn-outline btn-sm" data-action="mistake-reveal">${reveal ? "🙈 隐藏正确答案" : "👁 显示全部正确答案"}</button>
    </div>
    ${groupHtml || '<div class="empty"><div class="e-icon">📭</div>该流程下暂无易错点。</div>'}
    <div class="card" style="margin-top:18px;padding:14px 18px;font-size:13px;color:var(--muted)">
      <b>把这些"坑"练成条件反射：</b>去 <a href="#/flash">单词卡</a> 勾选「⚠️ 同时复习易错点」→ 正面是错误句，翻面看正确说法，刻意记牢；或去 <a href="#/quiz">智能测验</a> 的「出题范围」选「⚠️ 易错点（专门测）」→ 集中考你对"更地道表达"的判断。也可放进 <a href="#/tutor">AI 陪练</a>（教练规则开「四段式纠错」+「点到为止」）。
      <a href="#/units" style="margin-left:8px">去系统学 →</a>
    </div>`;
  }

  function flowLabel(flows, id) {
    const hit = flows.find(function (f) { return f.id === id; });
    return hit ? hit.label : id;
  }

  /* ================= 单元详情 ================= */
  function renderUnit(route) {
    const u = getUnit(route.id);
    const tab = State.unitTab;
    const pct = unitPct(u);
    const done = progress.done[u.id] || pct === 100;
    const hl = State.pendingHl;
    const words = unitWords(u);
    const learnedN = unitLearned(u);

    let tabHtml = "";
    if (tab === "vocab") {
      tabHtml = `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px">
            <b>词汇表（${words.length}）· 已掌握 ${learnedN}</b>
            <button class="btn btn-soft btn-sm" data-action="play-all-words" data-id="${u.id}">🔊 朗读全部词汇</button>
          </div>
          ${words.map(function (w) { return wordRowHtml(w, hl); }).join("")}
        </div>`;
    } else if (tab === "phrases") {
      tabHtml = `
        <div class="card">
          <b>常用短语（${u.phrases.length}）</b>
          ${u.phrases.map(function (p) {
            return `<div class="phrase-row">
              <span class="p">${hlText(p.p, hl)}</span>
              <span class="pc">${hlText(p.cn, hl)}</span>
              <button class="play-btn" data-action="play-text" data-text="${esc(p.p + ". " + p.ex)}" title="朗读">▶</button>
              <div style="grid-column:1/-1;font-size:13px;color:var(--muted)">${hlText(p.ex, hl)}<br><b>${hlText(p.exCn, hl)}</b></div>
            </div>`;
          }).join("")}
        </div>`;
    } else if (tab === "dialogues") {
      tabHtml = u.dialogues.map(function (d, di) { return dialogueCardHtml(u, d, di, hl, false); }).join("");
    } else {
      tabHtml = `
        <div class="card">
          <b>学习技巧与提示</b>
          <ul class="tip-list" style="margin-top:12px">
            ${u.tips.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("")}
          </ul>
        </div>`;
    }

    app.innerHTML = `
    <div class="page-head">
      <div class="crumbs"><a href="#/units">课程</a> / ${esc(u.title)}</div>
      <h2>${u.icon} ${esc(u.title)}</h2>
      <div class="en">${esc(u.titleEn)}</div>
      <p style="margin-top:8px;color:var(--muted);max-width:760px">${esc(u.summary)}</p>
      <div style="display:flex;align-items:center;gap:12px;margin-top:14px;max-width:520px;flex-wrap:wrap">
        <div class="progressbar"><i class="${done ? "full" : ""}" style="width:${pct}%"></i></div>
        <span class="pct">${pct}%</span>
        ${done
          ? '<span class="badge badge-ok">✓ 已完成</span>'
          : '<button class="btn btn-soft btn-sm" data-action="mark-done" data-id="' + u.id + '">标记为已完成</button>'}
      </div>
    </div>

    <div class="layout">
      <aside class="sidebar">
        <h4>课程目录</h4>
        ${DATA.units.map(function (x) {
          const xp = unitPct(x);
          const xdone = progress.done[x.id] || xp === 100;
          return '<a href="#/unit/' + x.id + '" class="' + (x.id === u.id ? "active" : "") + '">' +
            '<span class="num">' + String(x.id).padStart(2, "0") + '</span> ' + esc(x.title) +
            (xdone ? '<span class="done">✅</span>' : "") + '</a>';
        }).join("")}
      </aside>
      <div class="content-main">
        <div class="tabs">
          <button class="tab ${tab === "vocab" ? "active" : ""}" data-action="unit-tab" data-tab="vocab">词汇 (${u.vocab.length})</button>
          <button class="tab ${tab === "phrases" ? "active" : ""}" data-action="unit-tab" data-tab="phrases">短语 (${u.phrases.length})</button>
          <button class="tab ${tab === "dialogues" ? "active" : ""}" data-action="unit-tab" data-tab="dialogues">对话 (${u.dialogues.length})</button>
          <button class="tab ${tab === "tips" ? "active" : ""}" data-action="unit-tab" data-tab="tips">技巧</button>
        </div>
        <div id="unitContent">${tabHtml}</div>
      </div>
    </div>`;

    if (hl) {
      const firstMark = app.querySelector("#unitContent mark");
      if (firstMark) firstMark.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    State.pendingHl = null;
  }

  /* ---- 词频/难度标注 ----
     优先使用构建期脚本生成的 lvl 数据（window.FTE_LVL，按 词 -> lvl 的 Map），
     元数据缺失时回退到下面的启发式正则。 */
  const FREQ_HIGH = /^(trade|export|import|buyer|seller|supplier|sample|contract|shipment|customs|tariff|offer|price|order|payment|goods|market|customer|company|business|product|quality|service|shipping|delivery|invoice|receipt|goods|email|phone|meeting|visit|factory|agent|discount|total|amount|money|address|name|date|time|week|month|year|office|trip|thank|welcome|please|confirm|ask|question|answer|problem|work|need|make|send|receive|pay|sign|check|call|show|come|buy|sell|pack|load|ship|start|finish|ready|free|clear|team|sales|quote|deal)$/i;
  const FREQ_TECH = /(adhesive|resin|prepolymer|isocyanate|polyol|polyurethane|polyether|polyester|polyamide|laminate|laminating|coating|corona|solventless|solvent-based|water-based|two-component|curing|hardener|catalyst|endothermic|exothermic|peel|delamination|retort|boil|pouch|spout|zipper|tonnage|bench-scale|certification|declaration|compliance|specification|tolerance|viscosity|solid|reactive|membrane|isocyanate|diisocyanate|catalyst|monomer|additive|plasticizer|extrusion|barrier|permeability|incoterms|documentary|letter-?of-?credit|tender|despatch|demurrage|incoterm|certificate)/i;

  /* 由 tools/audit-ipa.js 生成：词小写 -> lvl('high'|'common'|'tech') */
  const LVL_MAP = (window.FTE_LVL) || {};

  function wordFreqTag(w) {
    const s = String(w);
    const lvl = LVL_MAP[s.toLowerCase()];
    if (lvl === "high") return { label: "高频", cls: "wf-high" };
    if (lvl === "tech") return { label: "专业", cls: "wf-tech" };
    if (lvl === "common") return { label: "常用", cls: "wf-common" };
    /* 回退前的启发式 */
    if (FREQ_HIGH.test(s) && !FREQ_TECH.test(s)) return { label: "高频", cls: "wf-high" };
    if (FREQ_TECH.test(s) || s.length > 11 || s.indexOf(" ") !== -1) return { label: "专业", cls: "wf-tech" };
    return { label: "常用", cls: "wf-common" };
  }

  function wordRowHtml(w, hl) {
    const learned = !!progress.learned[w.id];
    const ft = wordFreqTag(w.v.w);
    return `<div class="word-row" id="w-${w.id}">
      <span class="w">${hlText(w.v.w, hl)}<span class="word-freq ${ft.cls}" title="词频/难度提示（估计值）">${ft.label}</span></span>
      <span class="ipa">${esc(w.v.ipa || "")}</span>
      <span class="pos">${esc(w.v.pos || "")}</span>
      <span class="cn">${hlText(w.v.cn, hl)}</span>
      <span class="ex">${hlText(w.v.ex, hl)} <b>${hlText(w.v.exCn, hl)}</b></span>
      <span class="actions">
        <button class="play-btn" data-action="play-word" data-id="${w.id}" title="朗读单词">🔊</button>
        <button class="play-btn" data-action="play-sentence" data-id="${w.id}" title="朗读例句">▶</button>
        <button class="learn-toggle ${learned ? "learned" : ""}" data-action="toggle-learn" data-id="${w.id}"
          title="${learned ? "已掌握，点击取消" : "标记为已掌握"}">${learned ? "✓" : "☆"}</button>
      </span>
    </div>`;
  }

  function dialogueCardHtml(u, d, di, hl, isSpeak) {
    return `<div class="dlg-card card" data-dlg="${di}">
      <div class="dlg-head">
        <h4>💬 ${esc(d.title)}</h4>
        <div class="dlg-controls">
          <button class="btn btn-soft btn-sm" data-action="play-dlg" data-id="${u.id}" data-idx="${di}">▶ 播放全部</button>
          <button class="btn btn-outline btn-sm" data-action="stop-dlg" hidden>⏹ 停止</button>
        </div>
      </div>
      ${d.lines.map(function (l, li) {
        return `<div class="dlg-line ${l.sp === "A" ? "roleA" : "roleB"}" data-line="${li}">
          <span class="sp">${l.sp === "✉" ? "✉" : esc(l.sp)}</span>
          <div>
            <div class="en">${hlText(l.en, hl)}</div>
            <div class="cn">${hlText(l.cn, hl)}</div>
          </div>
          <span class="side">
            <button class="play-btn" data-action="play-line" data-id="${u.id}" data-idx="${di}" data-li="${li}" title="朗读本句">▶</button>
          </span>
        </div>`;
      }).join("")}
    </div>`;
  }

  /* ================= 朗读控制 ================= */
  function playWord(id) {
    const w = wordById(id);
    if (!w) return;
    const token = ++State.audioToken;
    const btn = document.querySelector('[data-action="play-word"][data-id="' + id + '"]');
    if (btn) btn.classList.add("speaking");
    Player.speak(w.v.w, {
      rate: 0.9,
      onend: function () { if (btn && State.audioToken === token) btn.classList.remove("speaking"); }
    });
  }
  function playSentence(id) {
    const w = wordById(id);
    if (!w) return;
    const token = ++State.audioToken;
    const btn = document.querySelector('[data-action="play-sentence"][data-id="' + id + '"]');
    if (btn) btn.classList.add("speaking");
    Player.speak(w.v.ex, {
      rate: 1,
      onend: function () { if (btn && State.audioToken === token) btn.classList.remove("speaking"); }
    });
  }
  function wordById(id) {
    const parts = id.split("-");
    const u = getUnit(parseInt(parts[0], 10));
    const i = parseInt(parts[1], 10);
    return u && u.vocab[i] ? { id: id, u: u, v: u.vocab[i] } : null;
  }

  function playDialogue(uid, dlgIdx, opts) {
    opts = opts || {};
    const u = getUnit(uid);
    const d = u.dialogues[dlgIdx];
    if (!d) return;
    const token = ++State.audioToken;
    const lines = d.lines;
    let i = 0;
    let stopped = false;
    const stopBtn = document.querySelector('[data-dlg="' + dlgIdx + '"] [data-action="stop-dlg"]');

    function clearHighlights() {
      document.querySelectorAll('.dlg-line[data-dlg="' + dlgIdx + '"], [data-dlg="' + dlgIdx + '"] .dlg-line')
        .forEach(function (el) { el.classList.remove("hl"); });
      document.querySelectorAll("#roleHint").forEach(function (el) { el.hidden = true; });
      if (stopBtn) stopBtn.hidden = true;
      if (State.stopPlay && State.stopPlay.token === token) State.stopPlay = null;
    }
    function highlight(idx) {
      document.querySelectorAll('[data-dlg="' + dlgIdx + '"] .dlg-line, .dlg-line[data-dlg="' + dlgIdx + '"]').forEach(function (el) {
        el.classList.toggle("hl", parseInt(el.getAttribute("data-line"), 10) === idx);
      });
    }
    function showRoleHint(line) {
      const el = document.getElementById("roleHint");
      if (el) {
        el.hidden = false;
        el.innerHTML = "🎤 <b>请你说（" + esc(line.sp) + "）：</b>" + esc(line.cn);
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }

    if (stopBtn) stopBtn.hidden = false;
    State.stopPlay = {
      token: token,
      cancel: function () {
        stopped = true;
        Player.stop();
        clearHighlights();
      }
    };

    function step() {
      if (stopped || State.audioToken !== token) { clearHighlights(); return; }
      if (i >= lines.length) {
        clearHighlights();
        if (opts.onDone) opts.onDone();
        return;
      }
      const line = lines[i];
      highlight(i);
      if (opts.role && line.sp === opts.role) {
        showRoleHint(line);
        setTimeout(function () {
          if (!stopped && State.audioToken === token) { i++; step(); }
        }, 4200);
        return;
      }
      Player.speak(line.en, {
        rate: opts.rate || 1,
        onend: function () {
          if (!stopped && State.audioToken === token) { i++; step(); }
        }
      });
    }
    step();
  }

  /* 只播放指定的一行（逐句练习/单句播放用） */
  function playLineOnly(uid, dlgIdx, li) {
    const u = getUnit(uid);
    const d = u.dialogues[dlgIdx];
    const line = d && d.lines[li];
    if (!line) return;
    ++State.audioToken;
    const rate = (State.speak && State.speak.rate) || progress.rate || 1;
    document.querySelectorAll('[data-dlg="' + dlgIdx + '"] .dlg-line, .dlg-line[data-dlg="' + dlgIdx + '"]').forEach(function (el) {
      el.classList.toggle("hl", parseInt(el.getAttribute("data-line"), 10) === li);
    });
    Player.speak(line.en, { rate: rate });
  }

  function scrollLineIntoView(dlgIdx, li) {
    const el = document.querySelector('.dlg-line[data-dlg="' + dlgIdx + '"][data-line="' + li + '"]');
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /* 逐句模式步进：dir=1 下一句 / -1 上一句 / 0 只播放当前句 */
  function stepGo(dir) {
    const s = State.speak;
    if (!s) return;
    const N = s.dlg.lines.length;
    if (dir === 1 && s.stepIdx < N - 1) s.stepIdx++;
    else if (dir === -1 && s.stepIdx > 0) s.stepIdx--;
    renderSpeak();
    playLineOnly(s.unit.id, s.dlgIdx, s.stepIdx);
    if (dir !== 0) scrollLineIntoView(s.dlgIdx, s.stepIdx);
  }

  function stepRestart() {
    const s = State.speak;
    if (!s) return;
    s.stepIdx = 0;
    renderSpeak();
    playLineOnly(s.unit.id, s.dlgIdx, 0);
    scrollLineIntoView(s.dlgIdx, 0);
  }

  /* ================= 单词卡 ================= */
  function renderFlash() {
    const s = State.flash;
    if (!s) {
      app.innerHTML = flashSetupHtml();
      return;
    }
    if (s.idx >= s.queue.length) {
      app.innerHTML = flashDoneHtml(s);
      return;
    }
    const card = s.queue[s.idx];
    const wron = Flashcards.wrongCount(progress, card.id);
    const state = Flashcards.stateOf(progress, card.id);
    app.innerHTML = `
    <div class="page-head"><h2>🃏 单词卡 · ${esc(s.unit.title)}</h2>
      <div class="en">点击卡片翻面 · 空格键翻面 · 想不起来就点“不认识”</div>
    </div>
    <div class="flash-wrap">
      <div class="flash-progress">第 <b>${s.idx + 1}</b> / ${s.queue.length} 张 · 已认识 <b style="color:var(--ok)">${s.stats.known}</b> · 未掌握 <b style="color:var(--bad)">${s.stats.unknown}</b></div>
      <div class="flash-card" id="flashCard" data-action="flash-flip">
        <div class="flash-inner">
          <div class="flash-face flash-front">
            <div class="big">${esc(card.w)}</div>
            <div class="ipa">${esc(card.ipa || "")}</div>
            <span class="flash-meta">
              <span class="fs-badge fs-${state.cls}">${esc(state.label)}</span>
              ${wron > 0 ? '<span class="fs-badge fs-wrong">常错 ' + wron + ' 次</span>' : ""}
              ${card.kind === "mistake" ? '<span class="fs-badge fs-wrong">⚠️ 错句 · 怎么改？</span>' : ""}
            </span>
            <button class="play-btn" style="width:40px;height:40px;font-size:16px" data-action="flash-say" title="朗读">🔊</button>
            <div class="hint">${card.kind === "mistake" ? "先想怎么改，再翻面看正确说法" : "点击卡片查看释义"}</div>
          </div>
          <div class="flash-face flash-back">
            ${card.kind === "mistake"
              ? '<div class="cn" style="color:var(--ok);font-weight:800">✓ 正确：' + esc(card.cn) + '</div>' +
                '<div class="cn" style="margin-top:6px;color:var(--accent);font-weight:600">💡 ' + esc(card.why || "") + '</div>'
              : '<div class="cn">' + esc(card.cn) + '</div>'}
            <div class="ex">${esc(card.ex)}</div>
            <div class="ex">${esc(card.exCn)}</div>
            <button class="play-btn" style="width:40px;height:40px;font-size:16px;background:rgba(255,255,255,.2);color:#fff" data-action="flash-say" title="朗读例句">🔊</button>
          </div>
        </div>
      </div>
      <div class="flash-actions">
        <button class="btn btn-danger" data-action="flash-grade" data-known="0">✗ 不认识</button>
        <button class="btn btn-ok" data-action="flash-grade" data-known="1">✓ 认识</button>
      </div>
      <button class="btn btn-outline btn-sm" style="margin-top:16px" data-action="flash-exit">退出学习</button>
    </div>`;
  }

  function flashSetupHtml() {
    return `
    <div class="page-head"><h2>🃏 记忆单词卡</h2>
      <div class="en">间隔重复记忆法：认识的词自动安排复习，记不住的词反复出现</div>
    </div>
    <div class="card" style="max-width:560px;margin-top:18px">
      <div class="field">
        <label>选择单元</label>
        <select id="flashUnit">${DATA.units.map(function (u) { return '<option value="' + u.id + '">' + u.id + '. ' + esc(u.title) + '</option>'; }).join("")}</select>
      </div>
      <div class="field">
        <label class="step-toggle" title="在本次单词卡里加入「中国外贸人高频易错点」：正面是错误句，翻面看正确说法与原因，刻意复习你容易踩的坑">
          <input type="checkbox" id="flashMistakes"> ⚠️ 同时复习易错点（错句→正确说法）
        </label>
      </div>
      <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" data-action="flash-start">开始学习 →</button>
        <button class="btn btn-soft" data-action="flash-reset">🗑 重置本单元记忆数据</button>
      </div>
      <p style="font-size:12.5px;color:var(--muted);margin-top:12px">采用 <b>SM-2 间隔重复算法</b>（Anki 同款）：学会的词按遗忘曲线自动拉长复习间隔，答错的词重置并优先复习；<b>常错的词</b>会出现在卡片上并优先进入下次队列。每次最多 15 张新卡 + 到期卡。</p>
    </div>`;
  }

  function flashDoneHtml(s) {
    const total = s.stats.known + s.stats.unknown;
    const acc = total ? Math.round(s.stats.known / total * 100) : 0;
    if (total === 0) {
      return `
      <div class="page-head"><h2>🎉 本单元已全部掌握</h2></div>
      <div class="card" style="max-width:560px;text-align:center;padding:34px 20px">
        <div style="font-size:44px">🏆</div>
        <p style="margin:12px 0 4px">「${esc(s.unit.title)}」暂时没有需要复习的卡片了。</p>
        <p style="font-size:13px;color:var(--muted)">系统会在合适的时间自动安排复习，也可以去其他单元继续学习。</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px">
          <a class="btn btn-primary" href="#/units">去其他单元</a>
          <button class="btn btn-outline" data-action="flash-exit">返回</button>
        </div>
      </div>`;
    }
    return `
    <div class="page-head"><h2>🎉 本组学习完成</h2></div>
    <div class="card" style="max-width:560px;text-align:center;padding:34px 20px">
      <div style="font-size:44px">${acc >= 80 ? "🏆" : acc >= 50 ? "💪" : "📚"}</div>
      <div class="result-box" style="padding:10px">
        <div class="score ${acc >= 80 ? "good" : acc >= 50 ? "mid" : "bad"}">${acc}%</div>
        <p>认识 <b>${s.stats.known}</b> 张 · 未掌握 <b>${s.stats.unknown}</b> 张</p>
        ${s.freshLeft > 0 || s.dueLeft > 0 ? '<p style="font-size:13px;color:var(--muted)">还有 ' + s.freshLeft + ' 张新卡、' + s.dueLeft + ' 张到期卡未复习</p>' : ""}
      </div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" data-action="flash-again">再来一组</button>
        <button class="btn btn-outline" data-action="flash-exit">返回</button>
      </div>
    </div>`;
  }

  /* 把易错点转成单词卡（正面=错误句，背面=正确版+原因+例句），供「含易错点」复习 */
  function mistakeFlashCards() {
    const MK = window.FTE_MISTAKES;
    if (!MK || !MK.groups) return [];
    const out = [];
    MK.groups.forEach(function (g) {
      g.items.forEach(function (m, i) {
        out.push({
          id: "mk-" + g.id + "-" + i,
          w: m.wrong, ipa: "", cn: m.right, ex: m.ex, exCn: m.exCn,
          why: m.why, kind: "mistake"
        });
      });
    });
    return out;
  }
  /* 把易错点转成「伪单元」（词条+例句），供测验出题 */
  function mistakeQuizUnits() {
    const MK = window.FTE_MISTAKES;
    if (!MK || !MK.groups) return [];
    return MK.groups.map(function (g, gi) {
      return {
        id: "mk-" + g.id, title: "易错点·" + g.title, icon: g.icon, summary: "",
        vocab: g.items.map(function (m) {
          return { w: m.right, ipa: "", pos: "phrase.", cn: m.exCn, ex: m.ex, exCn: m.exCn };
        }),
        phrases: [], dialogues: [], tips: []
      };
    });
  }

  function startFlashSession(prefUnit) {
    const sel = document.getElementById("flashUnit");
    const u = prefUnit || (sel ? getUnit(parseInt(sel.value, 10)) : DATA.units[0]);
    let cards = unitWords(u).map(function (w) {
      return { id: w.id, w: w.v.w, ipa: w.v.ipa, cn: w.v.cn, ex: w.v.ex, exCn: w.v.exCn };
    });
    const fmk = document.getElementById("flashMistakes");
    const includeMk = fmk && fmk.checked;
    if (includeMk) {
      /* 单元词与易错词交错排列，避免易错词排在后面被「最多 15 张新卡」裁掉 */
      const mkCards = mistakeFlashCards();
      const mixed = [];
      const max = Math.max(cards.length, mkCards.length);
      for (let i = 0; i < max; i++) {
        if (mkCards[i]) mixed.push(mkCards[i]);
        if (cards[i]) mixed.push(cards[i]);
      }
      cards = mixed;
    }
    const built = Flashcards.buildQueue(cards, progress, 30, includeMk ? 26 : 15);
    State.flash = {
      unit: includeMk ? { id: u.id, title: u.title + " + ⚠️易错点" } : u,
      queue: built.queue,
      idx: 0,
      stats: { known: 0, unknown: 0 },
      freshLeft: built.freshLeft,
      dueLeft: built.dueLeft
    };
    renderFlash();
  }

  function gradeFlash(known) {
    const s = State.flash;
    if (!s || s.idx >= s.queue.length) return;
    const card = s.queue[s.idx];
    Flashcards.grade(progress, card.id, known === 1);
    if (known === 1) s.stats.known++; else s.stats.unknown++;
    /* 错题权重：不认识 → 累加该词错误次数，供“错题优先复习”用 */
    if (known === 0) {
      if (!progress.wrong) progress.wrong = {};
      progress.wrong[card.id] = (progress.wrong[card.id] || 0) + 1;
    }
    s.idx++;
    saveProgress();
    updateHeaderStat();
    renderFlash();
  }

  /* ================= 测验 ================= */
  function renderQuiz() {
    const s = State.quiz;
    if (!s) {
      app.innerHTML = quizSetupHtml();
      return;
    }
    if (s.idx >= s.questions.length) {
      app.innerHTML = quizResultHtml(s);
      return;
    }
    const q = s.questions[s.idx];
    const chosen = q.chosen != null;
    app.innerHTML = `
    <div class="page-head"><h2>📝 智能测验</h2>
      <div class="en">第 ${s.idx + 1} / ${s.questions.length} 题 · 已答对 <b style="color:var(--ok)">${s.correct}</b> 题</div>
    </div>
    <div class="quiz-progress"><i style="width:${(s.idx / s.questions.length * 100)}%"></i></div>
    <div class="card">
      <div class="quiz-q">
        ${q.type === "listening" ? '<button class="play-btn" style="width:42px;height:42px;font-size:16px" data-action="quiz-listen">🔊</button>' : ""}
        <div class="q-type">${esc(q.typeLabel)}</div>
        <div class="q-text">${esc(q.prompt)}</div>
        ${q.sub ? '<div class="q-sub">' + esc(q.sub) + '</div>' : ""}
      </div>
      <div class="quiz-options">
        ${q.options.map(function (o, oi) {
          let cls = "";
          let disabled = "";
          if (chosen) {
            disabled = "disabled";
            if (o === q.answer) cls = "correct";
            else if (oi === q.chosen) cls = "wrong";
          }
          return '<button class="option ' + cls + '" ' + disabled + ' data-action="quiz-opt" data-i="' + oi + '">' + esc(o) + '</button>';
        }).join("")}
      </div>
      ${chosen
        ? '<div class="q-explain show">' + nl2br(q.explain) +
          '<div style="margin-top:12px"><button class="btn btn-primary btn-sm" data-action="quiz-next">' +
          (s.idx + 1 >= s.questions.length ? "查看结果 →" : "下一题 →") + "</button></div></div>"
        : ""}
    </div>`;
  }

  function quizSetupHtml() {
    return `
    <div class="page-head"><h2>📝 智能测验</h2>
      <div class="en">四种题型混合出题，测完即时批改、保存最好成绩</div>
    </div>
    <div class="card" style="max-width:640px;margin-top:18px">
      <div class="form-row">
        <div class="field">
          <label>出题范围</label>
          <select id="quizUnit">
            <option value="all">全部单元</option>
            ${DATA.units.map(function (u) { return '<option value="' + u.id + '">' + u.id + '. ' + esc(u.title) + '</option>'; }).join("")}
            <option value="mistakes">⚠️ 易错点（专门测）</option>
          </select>
        </div>
        <div class="field">
          <label>题目数量</label>
          <select id="quizCount"><option value="5">5 题</option><option value="10" selected>10 题</option><option value="15">15 题</option></select>
        </div>
      </div>
      <div class="field">
        <label>题型</label>
        <div class="checks">
          ${Quiz.TYPES.map(function (t) { return '<label><input type="checkbox" class="quiz-type" value="' + t.id + '" checked> ' + t.label + '</label>'; }).join("")}
        </div>
      </div>
      <button class="btn btn-primary" data-action="quiz-start" style="margin-top:8px">开始测验 →</button>
    </div>`;
  }

  function quizResultHtml(s) {
    const total = s.questions.length;
    const acc = total ? Math.round(s.correct / total * 100) : 0;
    const g = acc >= 85 ? "good" : acc >= 60 ? "mid" : "bad";
    const emoji = acc >= 85 ? "🏆" : acc >= 60 ? "💪" : "📖";
    const saved = s.saved ? " · 新纪录！" : "";
    return `
    <div class="page-head"><h2>📝 测验结果</h2></div>
    <div class="card result-box">
      <div style="font-size:42px">${emoji}</div>
      <div class="score ${g}">${acc}%</div>
      <p>答对 <b>${s.correct}</b> / ${total} 题${s.bestNote ? " · " + s.bestNote : ""}</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px">
        <button class="btn btn-primary" data-action="quiz-restart">再测一次</button>
        <button class="btn btn-outline" data-action="quiz-exit">返回设置</button>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <b>答题回顾</b>
      ${s.questions.map(function (q, i) {
        const ok = q.chosen === q.options.indexOf(q.answer);
        return `<div class="review-item">
          <div class="rq">${i + 1}. ${esc(q.prompt.length > 70 ? q.prompt.slice(0, 70) + "…" : q.prompt)}</div>
          <div class="ra ${ok ? "ok" : "no"}">${ok ? "✓ 正确" : "✗ 你的答案：" + esc(q.options[q.chosen] != null ? q.options[q.chosen] : "未作答")}</div>
          <div class="ra">正确答案：<b>${esc(q.answer)}</b></div>
        </div>`;
      }).join("")}
    </div>`;
  }

  function startQuiz() {
    const unitSel = document.getElementById("quizUnit");
    const countSel = document.getElementById("quizCount");
    const types = Array.prototype.filter.call(document.querySelectorAll(".quiz-type"), function (c) { return c.checked; })
      .map(function (c) { return c.value; });
    if (!types.length) { toast("请至少选择一种题型"); return; }
    let units;
    if (unitSel.value === "mistakes") units = mistakeQuizUnits();
    else units = unitSel.value === "all" ? DATA.units : [getUnit(parseInt(unitSel.value, 10))];
    State.quiz = {
      questions: Quiz.build(units, { count: parseInt(countSel.value, 10), types: types }),
      uid: units.map(function (u) { return u.id; }),
      idx: 0,
      correct: 0,
      answers: [],
      saved: false,
      bestNote: ""
    };
    renderQuiz();
  }

  function answerQuiz(oi) {
    const s = State.quiz;
    if (!s || s.idx >= s.questions.length) return;
    const q = s.questions[s.idx];
    if (q.chosen != null) return;
    q.chosen = oi;
    if (q.options[oi] === q.answer) s.correct++;
    else if (q.wid) {
      /* 错题权重：答错的词计入错误次数，强化“错题优先复习” */
      if (!progress.wrong) progress.wrong = {};
      progress.wrong[q.wid] = (progress.wrong[q.wid] || 0) + 1;
    }
    s.answers.push({ q: q, ok: q.options[oi] === q.answer });
    renderQuiz();
  }

  function nextQuiz() {
    const s = State.quiz;
    if (!s) return;
    if (s.idx + 1 >= s.questions.length) {
      const uids = s.uid || null;
      if (uids) {
        const key = "u" + uids.join("-");
        const acc = Math.round(s.correct / s.questions.length * 100);
        const prev = progress.quizBest[key];
        if (prev == null || acc > prev) {
          progress.quizBest[key] = acc;
          s.saved = true;
          s.bestNote = "本次最好成绩：" + acc + "%";
          saveProgress();
        } else {
          s.bestNote = "最好成绩：" + prev + "%";
        }
      }
    }
    s.idx++;
    renderQuiz();
  }

  /* ================= 听说训练 ================= */
  function renderSpeak() {
    const s = State.speak;
    if (!s) { renderSpeakSetup(); return; }
    if (s.mode === "dict") renderDict(s);
    else if (s.mode === "stage") renderStage(s);
    else renderShadow(s);
  }

  /* ================= 五阶段闯关（盲听→精听跟读→听写→复述→完成） ================= */
  const STAGE_DEFS = [
    { k: "listen", n: "①", label: "盲听" },
    { k: "shadow", n: "②", label: "精听跟读" },
    { k: "dict", n: "③", label: "听写" },
    { k: "retell", n: "④", label: "复述" },
    { k: "done", n: "⑤", label: "完成" }
  ];

  function stageStepper(s) {
    const idx = STAGE_DEFS.findIndex(function (d) { return d.k === s.stage; });
    let out = '<div class="stage-stepper">';
    STAGE_DEFS.forEach(function (d, i) {
      const cls = i < idx ? "done" : i === idx ? "cur" : "";
      out += '<span class="stage-chip ' + cls + '">' + d.n + " " + d.label + "</span>";
    });
    out += "</div>";
    /* 可选的阶段提示词 + 进度 */
    const KEY = s.unit.id + "-" + s.dlgIdx;
    const stageDone = (progress.stage || {})[KEY] || 0;
    if (stageDone >= 4) out += '<div class="stage-note">✅ 本段对话五阶段已全部完成过。</div>';
    return out;
  }

  function markStage(s, advance) {
    const KEY = s.unit.id + "-" + s.dlgIdx;
    if (!progress.stage) progress.stage = {};
    const idx = STAGE_DEFS.findIndex(function (d) { return d.k === s.stage; });
    const cur = progress.stage[KEY] || 0;
    if (advance && idx + 1 > cur) { progress.stage[KEY] = idx + 1; saveProgress(); }
  }

  function setStage(s, k) { s.stage = k; markStage(s, true); renderSpeak(); }

  function renderStage(s) {
    const KEY = s.unit.id + "-" + s.dlgIdx;
    markStage(s, false);
    const head = `<div class="page-head"><div class="crumbs"><a href="#/speak" data-action="speak-back">听说训练</a> / 闯关 · ${esc(s.dlg.title)}</div>
      <h2>🏁 五阶段闯关</h2><div class="en">盲听 → 精听跟读 → 听写 → 复述 → 完成</div></div>`;

    if (s.stage === "listen") {
      app.innerHTML = head + stageStepper(s) + `
      <div class="card" style="margin-top:12px">
        <div class="chat-head"><span>① 盲听 · 不看文字，先整体听一遍</span></div>
        <p style="font-size:13px;color:var(--muted)">先纯听，抓住大意与语音节奏，不急着看文字。</p>
        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" data-action="play-dlg" data-id="${s.unit.id}" data-idx="${s.dlgIdx}" data-role="">▶ 播放整段</button>
          <button class="btn btn-ok" data-action="stage-next" data-phase="shadow">🎧 我听得差不多了，进入精听</button>
        </div>
      </div>`;
      drawWave();
      return;
    }

    if (s.stage === "shadow") {
      renderShadow(s);
      app.insertAdjacentHTML("afterbegin", head + stageStepper(s) +
        '<div class="card sop-hint" style="margin-top:12px">② 精听跟读：逐句听 + 跟读 + 🎯 评测；只听不读写即可进入下一句。</div>');
      appendStageAdvance(s, "dict", "③ 跟读完成，进入听写");
      return;
    }

    if (s.stage === "dict") {
      renderDict(s);
      app.insertAdjacentHTML("afterbegin", head + stageStepper(s) +
        '<div class="card sop-hint" style="margin-top:12px">③ 听写：听原声，打出你听到的英文，点「检查」。</div>');
      appendStageAdvance(s, "retell", "④ 听写完成，进入复述");
      return;
    }

    if (s.stage === "retell") {
      /* 复述：不看文字，听一句 → 用自己的话说/录音 → 与原文逐词对比 */
      app.innerHTML = head + stageStepper(s) + `
      <div class="card" style="margin-top:12px"><div class="chat-head"><span>④ 复述 · 不看原文，听完用自己的话重说</span></div>
        <p class="sop-hint">逐句进行：🔊 播放 → 🎤 对着麦克风复述 → 🎯 看与原文的相似度（也可打字后再对照）。</p>
        ${s.dlg.lines.map(function (l, li) {
          const rev = s.revealed && s.revealed[li];
          return `<div class="dlg-line ${l.sp === "A" ? "roleA" : "roleB"} card" style="margin-top:10px" data-line="${li}">
            <span class="sp">${esc(l.sp)}</span>
            <div style="flex:1;min-width:0">
              ${rev ? '<div class="en">' + esc(l.en) + '</div><div class="cn">' + esc(l.cn) + "</div>"
                : '<div class="en" style="color:var(--accent)">🔎 复述后再点「看原文对比」</div><div class="cn" style="font-size:12.5px;color:var(--muted)">（原文已隐藏）</div>'}
            </div>
            <span class="side">
              <button class="play-btn" data-action="play-line" data-id="${s.unit.id}" data-idx="${s.dlgIdx}" data-li="${li}" title="播放本句">▶</button>
              ${Player.recognitionSupported() ? '<button class="eval-btn" data-action="eval" data-li="' + li + '" title="复述评测：与原文逐词对比">🎯</button>' : ""}
              <button class="rec" data-action="rec-toggle" data-li="${li}" title="录下我的复述">●</button>
              <button class="learn-toggle" data-action="stage-reveal" data-li="${li}" title="显示原文对比">👁</button>
            </span>
          </div>`;
        }).join("")}
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-ok" data-action="stage-next" data-phase="done">🏁 完成本段闯关</button>
          <button class="btn btn-outline" data-action="stage-restart">🔁 重新挑战本段</button>
        </div>
      </div>`;
      drawWave();
      return;
    }

    /* done */
    renderStageDone(s);
  }

  function renderStageDone(s) {
    const KEY = s.unit.id + "-" + s.dlgIdx;
    const stageDone = (progress.stage || {})[KEY] || 0;
    const accomplished = stageDone >= 4;
    app.innerHTML = `<div class="page-head"><div class="crumbs"><a href="#/speak" data-action="speak-back">听说训练</a> / 闯关 · ${esc(s.dlg.title)}</div>
      <h2>🏁 五阶段闯关</h2><div class="en">完成</div></div>` +
      stageStepper(s) +
      `<div class="card" style="margin-top:12px;text-align:center;padding:30px 18px">
        ${accomplished ? '<div style="font-size:44px">🎉</div><b style="font-size:18px">本段五阶段闯关完成！</b>'
          : '<div style="font-size:40px">🌟</div><b style="font-size:18px">你已完成本段闯关</b>'}
        <p style="font-size:13.5px;color:var(--muted);margin-top:8px">
          建议：把②③④里出错的句子记到错题本（AI 陪练可提炼），第二天先复述。闯关完成后可换一段对话继续。</p>
        <div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-primary" data-action="stage-restart">🔁 再挑战一次</button>
          <button class="btn btn-outline" data-action="speak-back">🗂 换一段对话</button>
          <a class="btn btn-soft" href="#/tutor">🤖 让 AI 陪练扮演 B 方对练 →</a>
        </div>
      </div>`;
  }

  /* 在 shadow/dict 渲染后，顶部追加「进入下一阶段」按钮（阶段进度早已显示在 stepper） */
  function appendStageAdvance(s, phase, label) {
    try {
      app.insertAdjacentHTML("beforeend",
        '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">' +
        '<button class="btn btn-ok" data-action="stage-next" data-phase="' + phase + '">' + label + "</button>" +
        '<button class="btn btn-outline" data-action="stage-restart">🔁 重新开始</button>' +
        "</div>");
    } catch (e) { /* ignore */ }
  }


  function renderSpeakSetup() {
    const voices = Player.voiceList();
    app.innerHTML = `
    <div class="page-head"><h2>🎤 听说训练</h2>
      <div class="en">跟读录音对比 · 听写训练 · 角色扮演，专攻听力和口语</div>
    </div>
    <div class="card" style="max-width:640px;margin-top:18px">
      <div class="form-row">
        <div class="field">
          <label>选择对话</label>
          <select id="speakDlg">${allDialogueOptions()}</select>
        </div>
        <div class="field">
          <label>训练模式</label>
          <div class="checks">
            <label><input type="radio" name="speakMode" value="shadow" checked> 跟读</label>
            <label><input type="radio" name="speakMode" value="dict"> 听写</label>
            <label><input type="radio" name="speakMode" value="stage"> 五阶段闯关</label>
          </div>
        </div>
      </div>
      <div class="form-row" id="roleRow">
        <div class="field">
          <label>角色扮演（可选）</label>
          <select id="speakRole">
            <option value="">无（全程跟读）</option>
            <option value="A">扮演 A 方</option>
            <option value="B">扮演 B 方</option>
          </select>
        </div>
        <div class="field">
          <label>语速</label>
          <div class="rate-wrap">
            <span>0.5×</span>
            <input type="range" id="speakRate" min="0.5" max="1.5" step="0.1" value="${progress.rate || 1}">
            <span>1.5×</span>
          </div>
        </div>
      </div>
      ${voices.length ? '<div class="field"><label>发音人（可选）</label><select id="speakVoice">' +
        '<option value="">自动选择</option>' +
        voices.map(function (v) { return '<option value="' + esc(v.name) + '"' + (progress.voice === v.name ? " selected" : "") + '>' + esc(v.name) + "</option>"; }).join("") +
        "</select></div>" : ""}
      <button class="btn btn-primary" data-action="speak-start" style="margin-top:10px">开始训练 →</button>
      <button class="btn btn-outline btn-sm" style="margin-top:10px;margin-left:8px" data-action="diag-voice">🔍 诊断语音服务</button>
      <a class="btn btn-soft btn-sm" style="margin-top:10px;margin-left:8px" href="#/listen">👂 辨音训练（最小音对）</a>
      <p style="font-size:12.5px;color:var(--muted);margin-top:12px">
        <b>🎙 语音能力（VPN/代理环境下最佳）</b>：跟读评测 🎯 与 AI 陪练 🎤 使用浏览器在线语音识别 + 逐词打分，连 Google 时可获得精确纠音反馈；<br>
        若网络不可达：可聚焦输入框按 <kbd>Win</kbd>+<kbd>H</kbd> 用系统听写，或以「逐句跟读 + ● 录音对比 + 听写训练」为主。<br>
        ${Player.recognitionSupported() ? "此浏览器支持在线语音识别；点「诊断语音服务」可确认 Google 是否可达。" : "⚠️ 此浏览器不支持在线语音识别，建议使用 Chrome / Edge（系统听写不依赖浏览器可用）。"}
        ${Player.canRecord() ? "" : " ⚠️ 当前环境不支持录音。"}
        <br>💡 跟读界面勾选「逐句练习」：系统说一句 → 你跟读/录音/评测 → 点 ⏭ 进入下一句。发音引擎/发音人可在右上角 <b>⚙ 发音设置</b> 中切换。
      </p>
    </div>`;
  }

  function allDialogueOptions() {
    let out = "";
    DATA.units.forEach(function (u) {
      u.dialogues.forEach(function (d, di) {
        out += '<option value="' + u.id + ":" + di + '">U' + u.id + ' · ' + esc(d.title) + "</option>";
      });
    });
    return out;
  }

  function startSpeak() {
    const val = document.getElementById("speakDlg").value;
    const [uid, di] = val.split(":").map(Number);
    const mode = document.querySelector('input[name="speakMode"]:checked').value;
    const role = document.getElementById("speakRole") ? document.getElementById("speakRole").value : "";
    const rate = parseFloat(document.getElementById("speakRate").value) || 1;
    const voiceSel = document.getElementById("speakVoice");
    progress.rate = rate;
    progress.voice = voiceSel ? voiceSel.value : "";
    saveProgress();
    State.speak = {
      unit: getUnit(uid),
      dlgIdx: di,
      dlg: getUnit(uid).dialogues[di],
      mode: mode,
      role: mode === "dict" ? "" : role,
      rate: rate,
      stepMode: false,
      stepIdx: 0,
      stage: "listen",
      dictResults: {},
      recordings: {}
    };
    renderSpeak();
  }

  function renderShadow(s) {
    const role = s.role;
    const N = s.dlg.lines.length;
    const step = s.stepMode ? Math.min(s.stepIdx, N - 1) : 0;
    const last = step >= N - 1;
    app.innerHTML = `
    <div class="page-head">
      <div class="crumbs"><a href="#/speak" data-action="speak-back">听说训练</a> / 跟读 · ${esc(s.dlg.title)}</div>
      <h2>🎤 跟读训练</h2>
      <div class="en">${s.stepMode
        ? "逐句模式：听一句 → 跟读/录音/🎯 评测 → 点 ⏭ 进入下一句"
        : "连播模式：先完整听一遍；点 🎯 逐词评测、● 录音回放对比。"}</div>
    </div>
    <div class="card">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <div class="field" style="flex:1;min-width:150px">
          <label>角色扮演</label>
          <select id="speakRoleLive">
            <option value="" ${role === "" ? "selected" : ""}>无（全程跟读）</option>
            <option value="A" ${role === "A" ? "selected" : ""}>扮演 A 方</option>
            <option value="B" ${role === "B" ? "selected" : ""}>扮演 B 方</option>
          </select>
        </div>
        <div class="field" style="flex:1;min-width:150px">
          <label>语速（${s.rate}×）</label>
          <div class="rate-wrap">
            <span>0.5×</span>
            <input type="range" id="speakRateLive" min="0.5" max="1.5" step="0.1" value="${s.rate}">
            <span>1.5×</span>
          </div>
        </div>
        <label class="step-toggle" title="系统说一句 → 你跟读 → 评测 → 手动进入下一句">
          <input type="checkbox" id="stepMode" ${s.stepMode ? "checked" : ""}> 逐句练习
        </label>
        <button class="btn btn-primary" data-action="play-dlg" data-id="${s.unit.id}" data-idx="${s.dlgIdx}" data-role="${esc(role)}" ${s.stepMode ? "hidden" : ""}>▶ 播放全部</button>
        <button class="btn btn-outline" data-action="stop-dlg">⏹ 停止</button>
      </div>
      <div id="stepPanel" class="step-panel" ${s.stepMode ? "" : "hidden"}>
        <span class="step-info">第 <b>${step + 1}</b> / ${N} 句</span>
        <button class="btn btn-outline btn-sm" data-action="step-prev" ${step === 0 ? "disabled" : ""}>◀ 上一句</button>
        <button class="btn btn-primary btn-sm" data-action="step-play">▶ 播放本句</button>
        <button class="btn btn-ok btn-sm" data-action="step-eval">🎯 评测本句</button>
        <button class="btn btn-primary btn-sm" data-action="step-next" ${last ? "disabled" : ""}>⏭ 下一句</button>
        ${last ? '<button class="btn btn-soft btn-sm" data-action="step-restart">🔄 重新开始</button>' : ""}
      </div>
      <div id="roleHint" class="dlg-line roleB" hidden style="margin-top:12px;background:var(--accent-soft);outline:2px solid var(--accent)"></div>
    </div>
    ${s.dlg.lines.map(function (l, li) {
      const cls = s.stepMode && li === step ? " step-cur" : "";
      return shadowLineHtml(s, l, li, cls) + evalBoxHtml(s, l, li);
    }).join("")}
    <button class="btn btn-outline btn-sm" style="margin-top:10px" data-action="speak-back">← 返回设置</button>`;
    /* 重新渲染后，为已有录音补画波形 */
    Object.keys(s.recordings).forEach(function (li) { drawWave(li); });
  }

  function shadowLineHtml(s, l, li, extraCls) {
    const isRole = s.role && l.sp === s.role;
    const rec = s.recordings[li];
    return `
    <div class="dlg-line ${l.sp === "A" ? "roleA" : "roleB"} card${extraCls || ""}" style="margin-top:10px" data-line="${li}" data-dlg="${s.dlgIdx}">
      <span class="sp">${l.sp === "✉" ? "✉" : esc(l.sp)}</span>
      <div style="flex:1;min-width:0">
        ${isRole
          ? '<div class="en" style="color:var(--accent)">🎤 请你说：' + esc(l.cn) + "</div>"
          : '<div class="en">' + esc(l.en) + '</div><div class="cn">' + esc(l.cn) + "</div>"}
        ${rec ? '<div class="wave-wrap"><canvas class="wave" data-wave="' + li + '" width="220" height="42" title="我的录音波形"></canvas></div>' : ""}
      </div>
      <span class="side">
        ${isRole ? "" : '<button class="play-btn" data-action="play-line" data-id="' + s.unit.id + '" data-idx="' + s.dlgIdx + '" data-li="' + li + '" title="播放本句">▶</button>'}
        ${Player.recognitionSupported()
          ? '<button class="eval-btn" data-action="eval" data-li="' + li + '" title="智能评测：跟读后逐词打分">🎯</button>'
          : ""}
        <button class="rec ${Player.isRecording() && State.recLine === li ? "recording" : ""}" data-action="rec-toggle" data-li="${li}" title="录音回放对比">●</button>
        ${rec ? '<button class="myply" data-action="my-play" data-li="' + li + '" title="播放我的录音">▶</button>' : ""}
        ${rec ? '<button class="myply" data-action="ab-compare" data-li="' + li + '" title="原声→我的录音 对照">🔁AB</button>' : ""}
      </span>
    </div>`;
  }

  /* 评测结果展示框（放在每句跟读行下方） */
  function evalBoxHtml(s, l, li) {
    return `<div class="eval-box" data-eval="${li}" hidden></div>`;
  }

  /* ---------------- 智能语音评测：逐词打分 ---------------- */
  /* 词近似度：编辑距离归一化，返回 0-1（1=完全相同） */
  function wordSimilar(a, b) {
    if (a === b) return 1;
    const A = a, B = b;
    const m = A.length, n = B.length;
    if (m === 0 || n === 0) return 0;
    const dp = [];
    for (let i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1)
        );
      }
    }
    return 1 - dp[m][n] / Math.max(m, n);
  }

  /* 评测：逐词对比（含近似判定、错误类型标注）
     返回 { acc, precise, matched:[{w, ok, near, errType}], transcript, missed, extra } */
  function evaluateSpeech(target, transcript) {
    const tWords = norm(target).split(" ").filter(Boolean);
    const sWords = norm(transcript || "").split(" ").filter(Boolean);
    const matched = [];
    const used = new Array(sWords.length).fill(false);
    let missCount = 0, extraCount = 0;

    tWords.forEach(function (tw) {
      let best = -1, bestSim = 0;
      for (let k = 0; k < sWords.length; k++) {
        if (used[k]) continue;
        const sim = wordSimilar(tw, sWords[k]);
        if (sim > bestSim) { bestSim = sim; best = k; }
      }
      if (best >= 0 && bestSim >= 0.99) {
        used[best] = true; matched.push({ w: tw, ok: true, near: false, errType: "ok" });
      } else if (best >= 0 && bestSim >= 0.45) {
        used[best] = true; matched.push({ w: tw, ok: true, near: true, errType: "near", said: sWords[best] });
      } else {
        matched.push({ w: tw, ok: false, near: false, errType: "miss" }); missCount++;
      }
    });
    extraCount = sWords.filter(function (_, i) { return !used[i]; }).length;

    /* 原始命中（精确匹配）用于精确率 */
    const precise = tWords.length
      ? Math.round(matched.filter(function (m) { return m.errType === "ok"; }).length / tWords.length * 100)
      : 0;
    /* 加权分：精确=1，接近=0.5 */
    const weighted = tWords.length
      ? Math.round(matched.reduce(function (a, m) { return a + (m.errType === "ok" ? 1 : m.errType === "near" ? 0.5 : 0); }, 0) / tWords.length * 100)
      : 0;
    return {
      acc: weighted,
      precise: precise,
      matched: matched,
      transcript: transcript || "",
      missed: missCount,
      extra: extraCount
    };
  }

  function evalResultHtml(target, transcript) {
    const ev = evaluateSpeech(target, transcript);
    const cls = ev.acc >= 80 ? "sc" : ev.acc >= 50 ? "sm" : "sb";
    const nearN = ev.matched.filter(function (m) { return m.errType === "near"; }).length;
    const plainN = ev.matched.filter(function (m) { return m.errType === "ok"; }).length;
    let hint;
    if (ev.acc >= 90) hint = "发音非常标准！可以提速跟读或进入下一句。";
    else if (ev.acc >= 80) hint = "很棒！把近似词读准即可（" + nearN + " 个近似）。";
    else if (ev.acc >= 60) hint = "不错！重点练习标红的词：先 0.7× 慢速分音节跟读再连读。";
    else if (ev.precise >= 80) hint = "发音基本准确，但语速/连读导致个别词离层，放慢并逐词清晰读出。";
    else if (!ev.transcript) hint = "未识别到语音：请靠近麦克风、放慢语速、在安静环境重试。";
    else hint = "建议先 0.5× 慢速听原声，逐词跟读（漏读 " + ev.missed + " 词、多读 " + ev.extra + " 词）。";

    const targetHtml = ev.matched.map(function (m) {
      if (m.errType === "ok") return '<span class="wm ok">' + esc(m.w) + "</span>";
      if (m.errType === "near") {
        return '<span class="eval-pair"><span class="wm no">' + esc(m.w) + "</span>" +
          '<span class="eval-said">≈' + esc(m.said) + "</span></span>";
      }
      return '<span class="wm no">' + esc(m.w) + "</span>";
    }).join(" ");

    return '<div class="eval-score">🎯 准确率 <span class="' + cls + '">' + ev.acc + "%</span>" +
      (ev.precise !== ev.acc ? ' <span style="font-size:12px;color:var(--muted)">精确 ' + ev.precise + "%</span>" : "") +
      "</div>" +
      '<div class="eval-target">' + targetHtml + "</div>" +
      (ev.transcript
        ? '<div class="eval-transcript">识别到：' + esc(ev.transcript) + "</div>"
        : "") +
      '<div class="eval-hint">💡 ' + hint + "</div>";
  }

  function evalLine(li) {
    const s = State.speak;
    if (!s) return;
    if (State.evalRec) { try { State.evalRec.stop(); } catch (e) { /* ignore */ } State.evalRec = null; }
    const line = s.dlg.lines[li];
    const btn = document.querySelector('[data-action="eval"][data-li="' + li + '"]');
    const box = document.querySelector('[data-eval="' + li + '"]');
    if (btn) { btn.classList.add("listening"); btn.disabled = true; }
    if (box) { box.hidden = false; box.innerHTML = '<div class="eval-transcript">🎙 正在听…请大声朗读这一句（说完自动停止）</div>'; }
    const done = function (text) {
      if (btn) { btn.classList.remove("listening"); btn.disabled = false; }
      if (box) { box.hidden = false; box.innerHTML = evalResultHtml(line.en, text); }
      State.evalRec = null;
    };
    /* 先请求麦克风权限，失败时给出明确指引 */
    Player.micRequest().then(function () {
      State.evalRec = Player.recognize({
        lang: "en-US",
        onError: function (err) {
          done("");
          const msg = Player.recErrorText(err);
          if (msg) toast(msg);
        },
        onEnd: done
      });
      if (!State.evalRec) {
        done("");
        toast("语音识别启动失败，建议使用 Chrome / Edge 并允许麦克风权限");
      }
    }).catch(function (err) {
      done("");
      const msg = Player.recErrorText(err);
      if (msg) toast(msg);
    });
  }

  /* 高频复现例句 · 跟读评测：先读一遍原声，再跟读打分（复用 Player 与 ASR 评测） */
  function startFreqShadow(el) {
    const target = el.getAttribute("data-txt");
    const box = document.getElementById(el.getAttribute("data-idx"));
    if (State.evalRec) { try { State.evalRec.stop(); } catch (e) { /* ignore */ } State.evalRec = null; }
    if (el) { el.classList.add("listening"); el.disabled = true; }
    if (box) { box.hidden = false; box.innerHTML = '<div class="eval-transcript">🔊 先听一遍，然后请大声跟读这一句（说完自动停止）…</div>'; }
    const done = function (text) {
      if (el) { el.classList.remove("listening"); el.disabled = false; }
      if (box) { box.hidden = false; box.innerHTML = evalResultHtml(target, text); }
      State.evalRec = null;
    };
    Player.speak(target, {
      rate: 0.95,
      onend: function () {
        Player.micRequest().then(function () {
          State.evalRec = Player.recognize({
            lang: "en-US",
            onError: function (err) { done(""); const m = Player.recErrorText(err); if (m) toast(m); },
            onEnd: done
          });
          if (!State.evalRec) { done(""); toast("语音识别启动失败，建议使用 Chrome / Edge 并允许麦克风权限"); }
        }).catch(function (err) { done(""); const m = Player.recErrorText(err); if (m) toast(m); });
      }
    });
  }

  function renderDict(s) {
    const results = s.dictResults;
    const doneCount = Object.keys(results).length;
    const total = s.dlg.lines.length;
    const correct = Object.keys(results).filter(function (k) { return results[k] === true; }).length;
    const finished = doneCount === total;
    app.innerHTML = `
    <div class="page-head">
      <div class="crumbs"><a href="#/speak" data-action="speak-back">听说训练</a> / 听写 · ${esc(s.dlg.title)}</div>
      <h2>✍️ 听写训练</h2>
      <div class="en">听原声，把听到的英文打出来。全部完成后自动评分。</div>
    </div>
    <div class="card">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div class="progressbar" style="max-width:300px"><i style="width:${(doneCount / total * 100)}%"></i></div>
        <span class="pct">${doneCount}/${total} 句 · 正确 ${correct}</span>
        ${finished ? '<span class="badge badge-ok">✓ 已完成</span>' : ""}
      </div>
    </div>
    ${s.dlg.lines.map(function (l, li) {
      const r = results[li];
      return `
      <div class="dict-row" data-li="${li}">
        <button class="play-btn" data-action="dict-play" data-id="${s.unit.id}" data-idx="${s.dlgIdx}" data-li="${li}" title="播放原声">🔊</button>
        <div>
          <div class="cn" style="font-size:12.5px;color:var(--muted)">${li + 1}. ${esc(l.cn)}</div>
          <input type="text" placeholder="输入你听到的英文…" ${r != null ? "disabled" : ""} value="${r != null && results[li + "-val"] ? esc(results[li + "-val"]) : ""}" data-action="dict-input">
          <div class="result ${r === true ? "ok" : r === false ? "no" : ""}" ${r == null ? "hidden" : ""}>
            ${r === true ? "✓ 完全正确！" : r === false ? "✗ 标准答案：" : ""}<span class="ans">${esc(l.en)}</span>
          </div>
        </div>
        <button class="btn btn-sm ${r != null ? "btn-outline" : "btn-soft"}" data-action="dict-check" data-li="${li}" ${r != null ? "disabled" : ""}>${r != null ? "已检查" : "检查"}</button>
      </div>`;
    }).join("")}
    <button class="btn btn-outline btn-sm" style="margin-top:10px" data-action="speak-back">← 返回设置</button>`;
  }

  function checkDict(li) {
    const s = State.speak;
    if (!s || s.dictResults[li] != null) return;
    const line = s.dlg.lines[li];
    const inputEl = document.querySelector('.dict-row[data-li="' + li + '"] input');
    const val = inputEl ? inputEl.value : "";
    const ok = norm(val) === norm(line.en);
    const near = !ok && wordOverlap(val, line.en) >= 0.6;
    s.dictResults[li] = ok;
    s.dictResults[li + "-val"] = val;
    if (!ok && near) s.dictResults[li] = "near";
    saveDictBest();
    renderSpeak();   // 路由：stage 模式下回到闯关视图（保留 stepper）
    if (ok) toast("✓ 听写正确！"); else if (near) toast("接近了！再看看标准答案"); else toast("看看标准答案，再听一遍吧");
  }

  function saveDictBest() {
    const s = State.speak;
    if (!s) return;
    const total = s.dlg.lines.length;
    const doneCount = Object.keys(s.dictResults).filter(function (k) { return !k.endsWith("-val"); }).length;
    if (doneCount !== total) return;
    const correct = Object.keys(s.dictResults).filter(function (k) { return s.dictResults[k] === true && !k.endsWith("-val"); }).length;
    const key = s.unit.id + "-" + s.dlgIdx;
    const prev = progress.dict[key];
    if (prev == null || correct > prev) {
      progress.dict[key] = correct;
      saveProgress();
      toast("🏆 听写完成！最好成绩：" + correct + "/" + total);
    } else {
      toast("听写完成：" + correct + "/" + total + "（历史最好：" + prev + "/" + total + "）");
    }
  }

  /* ================= 搜索 ================= */
  function renderSearch(route) {
    const q = route.q || "";
    const results = q ? queryIndex(q).slice(0, 30) : [];
    app.innerHTML = `
    <div class="page-head"><h2>🔍 搜索</h2>
      <div class="en">搜索单词、短语、对话语句（支持中英文）</div>
    </div>
    <div class="card" style="margin-top:14px">
      <input type="search" id="searchPageInput" value="${esc(q)}" placeholder="输入关键词，如：FOB / 谈判 / shipment…" style="width:100%;padding:11px 14px;border:1px solid var(--line);border-radius:11px;outline:none" data-action="search-page">
    </div>
    <div id="searchResults" style="margin-top:16px">
      ${q ? (results.length ? results.map(searchRowHtml).join("") : '<div class="empty"><div class="e-icon">🔍</div>没有找到与「' + esc(q) + '」相关的内容</div>') : '<div class="empty"><div class="e-icon">💡</div>输入关键词开始搜索</div>'}
    </div>`;
  }

  function searchRowHtml(it) {
    return `<div class="search-result">
      <div class="sr-head">
        <span class="sr-type">${esc(it.type)}</span>
        <span class="sr-text">${esc(it.text.length > 60 ? it.text.slice(0, 60) + "…" : it.text)}</span>
      </div>
      <div class="sr-sub">${esc(it.sub.length > 90 ? it.sub.slice(0, 90) + "…" : it.sub)}</div>
      <a href="${it.href}" data-action="search-go" data-hl="${esc(it.hl)}">查看并定位 →</a>
    </div>`;
  }

  /* ================= 事件委托 ================= */
  document.addEventListener("click", function (e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const act = el.getAttribute("data-action");
    const id = el.getAttribute("data-id");
    const idx = el.getAttribute("data-idx");
    const li = el.getAttribute("data-li");

    switch (act) {
      case "unit-tab":
        State.unitTab = el.getAttribute("data-tab");
        renderRoute();
        break;
      case "mark-done":
        progress.done[parseInt(id, 10)] = true;
        saveProgress();
        renderRoute();
        toast("✓ 已标记完成，继续加油！");
        break;
      case "toggle-learn": {
        const w = wordById(id);
        if (!w) break;
        if (progress.learned[id]) delete progress.learned[id];
        else progress.learned[id] = true;
        saveProgress();
        updateHeaderStat();
        renderUnit({ id: w.u.id });
        break;
      }
      case "play-word": playWord(id); break;
      case "play-sentence": playSentence(id); break;
      case "play-text":
        Player.speak(el.getAttribute("data-text"), { rate: 1 });
        break;
      case "mistake-speak": {
        const mt = el.getAttribute("data-text");
        if (mt) Player.speak(mt, { rate: 1 });
        break;
      }
      case "mistake-reveal":
        State.mistReveal = !State.mistReveal;
        renderRoute();
        toast(State.mistReveal ? "👁 已显示全部正确答案" : "🙈 已隐藏正确答案，先自己想再揭晓");
        break;
      case "mistake-flow":
        State.mistFlow = el.getAttribute("data-flow") || "all";
        renderRoute();
        break;
      case "freq-shadow":
        startFreqShadow(el);
        break;
      case "play-line": playLineOnly(id, parseInt(idx, 10), parseInt(li, 10)); break;
      case "step-prev": stepGo(-1); break;
      case "step-next": stepGo(1); break;
      case "step-play": stepGo(0); break;
      case "step-restart": stepRestart(); break;
      case "step-eval": {
        if (State.speak && State.speak.stepMode) evalLine(State.speak.stepIdx);
        break;
      }
      case "play-dlg": {
        const role = el.getAttribute("data-role") || (State.speak ? State.speak.role : "");
        playDialogue(id, parseInt(idx, 10), { role: role, rate: (State.speak ? State.speak.rate : progress.rate) || 1 });
        break;
      }
      case "stop-dlg":
        if (State.stopPlay) State.stopPlay.cancel();
        break;
      case "play-all-words": {
        const u = getUnit(parseInt(id, 10));
        const token = ++State.audioToken;
        let i = 0;
        const next = function () {
          if (State.audioToken !== token) return;
          if (i >= u.vocab.length) return;
          Player.speak(u.vocab[i].w, { rate: 0.9, onend: function () { i++; next(); } });
        };
        next();
        break;
      }

      case "flash-flip":
        document.getElementById("flashCard").classList.toggle("flipped");
        break;
      case "flash-say": {
        const s = State.flash;
        if (!s) break;
        const card = s.queue[s.idx];
        const flipped = document.getElementById("flashCard").classList.contains("flipped");
        Player.speak(flipped ? card.ex : card.w, { rate: 0.9 });
        break;
      }
      case "flash-grade": gradeFlash(parseInt(el.getAttribute("data-known"), 10)); break;
      case "flash-start": startFlashSession(); break;
      case "flash-again": {
        if (State.flash) startFlashSession(State.flash.unit);
        break;
      }
      case "flash-exit":
        State.flash = null;
        renderRoute();
        break;
      case "flash-reset": {
        const sel = document.getElementById("flashUnit");
        const u = getUnit(parseInt(sel.value, 10));
        unitWords(u).forEach(function (w) { delete progress.flash[w.id]; });
        saveProgress();
        toast("已重置「" + u.title + "」的记忆数据");
        break;
      }

      case "quiz-start": startQuiz(); break;
      case "quiz-opt": answerQuiz(parseInt(el.getAttribute("data-i"), 10)); break;
      case "quiz-next": nextQuiz(); break;
      case "quiz-listen": {
        const s = State.quiz;
        if (s) Player.speak(s.questions[s.idx].listenText, { rate: progress.rate || 1 });
        break;
      }
      case "quiz-restart": {
        const s = State.quiz;
        if (s) State.quiz = null;
        renderRoute();
        break;
      }
      case "quiz-exit":
        State.quiz = null;
        renderRoute();
        break;

      case "speak-start": startSpeak(); break;
      case "speak-back":
        State.speak = null;
        renderRoute();
        break;
      case "rec-toggle": recToggle(parseInt(li, 10)); break;
      case "my-play": {
        const s = State.speak;
        if (s && s.recordings[li]) {
          const a = new Audio(s.recordings[li]);
          a.play();
        }
        break;
      }
      case "ab-compare": {
        const s = State.speak;
        if (!s || !s.recordings[li]) break;
        const line = s.dlg.lines[li];
        /* 先放原声（TTS），结束后接我的录音：直观的「原声 vs 我的」A/B 对比 */
        Player.speak(line.en, { rate: s.rate || 1, onend: function () {
          const a = new Audio(s.recordings[li]);
          a.play();
          toast("🔁 这是你的录音");
        } });
        break;
      }
      case "eval": evalLine(parseInt(li, 10)); break;
      case "dict-play": playLineOnly(id, parseInt(idx, 10), parseInt(li, 10)); break;
      case "dict-check": checkDict(parseInt(li, 10)); break;
      case "stage-next": { const s = State.speak; if (s) setStage(s, el.getAttribute("data-phase") || "shadow"); break; }
      case "stage-restart": { const s = State.speak; if (s) { s.stage = "listen"; s.dictResults = {}; s.recordings = {}; renderSpeak(); } break; }
      case "stage-reveal": {
        const s = State.speak;
        if (s) { if (!s.revealed) s.revealed = {}; s.revealed[li] = !s.revealed[li]; renderSpeak(); }
        break;
      }
      case "diag-voice": {
        toast("🔍 正在检测语音服务…");
        Player.testSpeechReach().then(function (r) {
          const s = "浏览器在线识别： " + (r.srSupported ? "✅ 支持" : "❌ 不支持(需 Chrome/Edge)") +
            "   |   Google 可达： " + (r.timeout ? "⏱ 超时" : (r.googleReachable ? "✅ 可达" : "❌ 不可达"));
          toast(s);
        }).catch(function () { toast("诊断失败"); });
        break;
      }

      case "search-go": {
        State.pendingHl = el.getAttribute("data-hl");
        location.hash = el.getAttribute("href");
        break;
      }

      case "coach-start": coachStart(); break;
      case "coach-pause": coachPause(); break;
      case "coach-reset": coachReset(); break;
      case "coach-prev": coachJump(coachState.seg - 1); break;
      case "coach-next": coachJump(coachState.seg + 1); break;
      case "coach-seg": coachJump(parseInt(el.getAttribute("data-seg"), 10)); break;
      case "coach-copy-report": coachCopyReport(); break;
      case "coach-download-report": coachDownloadReport(); break;
      case "coach-7day": {
        try { localStorage.setItem("fte-tutor-fill", el.getAttribute("data-en") || ""); } catch (e) { /* ignore */ }
        location.hash = "#/tutor";
        break;
      }
      case "coach-weekly-gen": generateWeeklyReport(); break;
      case "coach-weekly-clear": {
        if (confirm("确定清空本周学习报告吗？")) {
          progress.coachWeeklyReport = { wk: "", text: "", time: 0 };
          saveProgress();
          renderCoach();
        }
        break;
      }
    }
  });

  /* 跟读角色/语速实时调整 */
  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "speakRoleLive" && State.speak) {
      State.speak.role = e.target.value;
      renderSpeak();
    }
    if (e.target && e.target.id === "speakRateLive" && State.speak) {
      State.speak.rate = parseFloat(e.target.value) || 1;
      progress.rate = State.speak.rate;
      saveProgress();
      renderSpeak();
    }
    if (e.target && e.target.id === "stepMode" && State.speak) {
      State.speak.stepMode = e.target.checked;
      State.speak.stepIdx = 0;
      renderSpeak();
      if (State.speak.stepMode) {
        playLineOnly(State.speak.unit.id, State.speak.dlgIdx, 0);
        scrollLineIntoView(State.speak.dlgIdx, 0);
      }
    }
  });

  /* 绘制某句已录音的波形 */
  function drawWave(li) {
    const s = State.speak;
    if (!s) return;
    const url = s.recordings[li];
    const canvas = document.querySelector('[data-wave="' + li + '"]');
    if (!url || !canvas) return;
    Player.waveform(url, canvas);
  }

  function recToggle(li) {
    const s = State.speak;
    if (!s) return;
    if (Player.isRecording()) {
      if (State.recLine !== li) return;
      Player.stopRecording().then(function (url) {
        if (url) {
          s.recordings[li] = url;
          toast("✓ 录音完成，点击绿色按钮回放对比");
        }
        State.recLine = null;
        renderSpeak();
        if (url) drawWave(li);
      });
    } else {
      Player.startRecording()
        .then(function () {
          State.recLine = li;
          toast("● 正在录音…再次点击停止");
          renderSpeak();
        })
        .catch(function (err) {
          toast(err && err.message === "no-media"
            ? "当前环境不支持录音"
            : "无法使用麦克风（请允许权限，或通过本地服务器打开页面）");
        });
    }
  }

  /* ---------------- 头部搜索 ---------------- */
  function setupHeaderSearch() {
    const input = document.getElementById("searchInput");
    const drop = document.getElementById("searchDrop");
    const btn = document.getElementById("searchBtn");

    function doSearch(q) {
      if (!q) { drop.hidden = true; return; }
      const results = queryIndex(q).slice(0, 8);
      if (!results.length) {
        drop.innerHTML = '<div class="sd-more">无结果</div>';
      } else {
        drop.innerHTML = results.map(function (it) {
          return '<a href="' + it.href + '" data-hl="' + esc(it.hl) + '">' +
            '<span class="sd-type">' + esc(it.type) + "</span>" +
            '<span class="sd-text">' + esc(it.text.length > 40 ? it.text.slice(0, 40) + "…" : it.text) + "</span></a>";
        }).join("") + '<div class="sd-more">共 ' + queryIndex(q).length + " 条结果，回车查看全部</div>";
      }
      drop.hidden = false;
    }

    input.addEventListener("input", function () { doSearch(input.value.trim()); });
    input.addEventListener("focus", function () { if (input.value.trim()) doSearch(input.value.trim()); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        const q = input.value.trim();
        if (q) location.hash = "#/search/" + encodeURIComponent(q);
        drop.hidden = true;
      }
      if (e.key === "Escape") drop.hidden = true;
    });
    btn.addEventListener("click", function () {
      const q = input.value.trim();
      if (q) { location.hash = "#/search/" + encodeURIComponent(q); drop.hidden = true; }
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".searchbox")) drop.hidden = true;
    });
    drop.addEventListener("click", function (e) {
      const a = e.target.closest("a[data-hl]");
      if (a) {
        State.pendingHl = a.getAttribute("data-hl");
        drop.hidden = true;
      }
    });
    document.getElementById("navToggle").addEventListener("click", function () {
      document.getElementById("mainNav").classList.toggle("show");
    });
  }

  /* ---------------- 听写输入回车 ---------------- */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target && e.target.getAttribute("data-action") === "dict-input") {
      const row = e.target.closest(".dict-row");
      if (row) checkDict(parseInt(row.getAttribute("data-li"), 10));
    }
    // 空格翻面（单词卡界面）
    if (e.code === "Space" && location.hash.indexOf("flash") !== -1) {
      const card = document.getElementById("flashCard");
      if (card && document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].indexOf(document.activeElement.tagName) === -1) {
        e.preventDefault();
        card.classList.toggle("flipped");
      }
    }
  });

  /* 搜索页输入实时过滤（不重建页面，保持输入焦点） */
  document.addEventListener("input", function (e) {
    const t = e.target;
    if (!t || t.id !== "searchPageInput") return;
    const box = document.getElementById("searchResults");
    if (!box) return;
    const q = t.value.trim();
    if (!q) {
      box.innerHTML = '<div class="empty"><div class="e-icon">💡</div>输入关键词开始搜索</div>';
      return;
    }
    const results = queryIndex(q).slice(0, 30);
    box.innerHTML = results.length
      ? results.map(searchRowHtml).join("")
      : '<div class="empty"><div class="e-icon">🔍</div>没有找到与「' + esc(q) + '」相关的内容</div>';
  });

  /* ================= AI 教练使用手册 + 每日 20 分钟训练 ================= */
  const TRAIN_SEGS = [
    { label: "热身", min: 3, goal: "答 2-3 个简单问题，让嘴巴进入英语状态",
      prompt: "Warm-up: let me ask you 2 or 3 easy questions. Just answer them to warm up your mouth." },
    { label: "主题对话", min: 8, goal: "围绕一个真实外贸主题自由对话，保持连续表达",
      prompt: "Now let's have a free conversation about a real foreign-trade topic. Keep talking with me." },
    { label: "复盘", min: 5, goal: "复盘 2-3 个问题，找到最值得改的地方",
      prompt: "Let's review. Tell me the two most important things to fix from what you just said." },
    { label: "重说", min: 4, goal: "用修改后的句子重新表达，形成记忆与肌肉反应",
      prompt: "Now say the corrected sentences again, twice, at a steady pace." }
  ];

  /* 7 天进阶计划（来自 GPT Live 陪练心得 · 第 06 节）：每天都练一个具体主题，
     第二天从「今日错题」先复述，一周收尾做一次综合测试 + 周学习报告。 */
  const COACH_7DAY = [
    { day: "第 1 天", theme: "自我介绍", en: "Let's practice a self-introduction: name, company, what you do. Ask me one question at a time. Start in English." },
    { day: "第 2 天", theme: "描述我的一天", en: "Let's practice describing my day. Ask me what I did today, one question at a time. Start in English." },
    { day: "第 3 天", theme: "餐厅点餐 / 购物", en: "Role-play: I am ordering food in a restaurant / shopping. You are the waiter or shop assistant; interact in simple English, one question at a time. Start." },
    { day: "第 4 天", theme: "机场 / 酒店 / 问路", en: "Role-play: I am at the airport and checking into a hotel, then asking for directions. You play the staff; guide me in plain English. Start." },
    { day: "第 5 天", theme: "模拟工作汇报", en: "Role-play: we are in a project weekly meeting. You ask what I finished this week, problems, risks and next steps; answer as the project owner. Start in English." },
    { day: "第 6 天", theme: "围绕一个话题表达观点", en: "Let's discuss one viewpoint. You state your view first, I respond; push me with follow-ups asking for a reason and an example. Keep each point focused. Start." },
    { day: "第 7 天", theme: "综合测试 + 本周报告", en: "Let's do a short comprehensive review: some role-plays from this week, then I will ask the coach to generate my weekly learning report." }
  ];

  let coachTimerId = null;
  const coachState = { running: false, seg: 0, remain: TRAIN_SEGS[0].min * 60, done: false };

  /* ---- 坚持打卡 / 累计时长 / 进度持久化 ---- */
  let coachSinceSave = 0;
  function coachPad(n) { return (n < 10 ? "0" + n : "" + n); }
  function coachToday() { const d = new Date(); return d.getFullYear() + "-" + coachPad(d.getMonth() + 1) + "-" + coachPad(d.getDate()); }
  function coachYesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return d.getFullYear() + "-" + coachPad(d.getMonth() + 1) + "-" + coachPad(d.getDate()); }
  function coachCreditSecs() {
    if (!progress.coach) progress.coach = { lastDate: "", today: 0, total: 0, streak: 0 };
    const t = coachToday(), c = progress.coach;
    if (c.lastDate !== t) {
      c.streak = (c.lastDate === coachYesterday()) ? c.streak + 1 : 1;
      c.lastDate = t; c.today = 0;
    }
    c.today += 1; c.total += 1;
    if (++coachSinceSave >= 10) { coachSinceSave = 0; saveProgress(); coachRefreshStats(); }
  }
  function coachStats() {
    const c = progress.coach;
    return { streak: (c && c.streak) || 0, today: Math.floor((c && c.today || 0) / 60), totalMin: Math.floor((c && c.total || 0) / 60) };
  }
  function coachStatsHtml() {
    const s = coachStats();
    return "🔥 连续 <b>" + s.streak + "</b> 天 &nbsp;·&nbsp; 今天 <b>" + s.today + "</b> 分 &nbsp;·&nbsp; 累计 <b>" + s.totalMin + "</b> 分";
  }
  function coachRefreshStats() {
    const e = document.getElementById("ctStats");
    if (e) e.innerHTML = coachStatsHtml();
  }
  function coachPersist() {
    progress.coachLast = { seg: coachState.seg, remain: coachState.remain, done: coachState.done };
    if (!progress.coachDays) progress.coachDays = {};
    const t = coachToday();
    progress.coachDays[t] = Math.floor((progress.coach.today || 0) / 60);   // 今日分钟，用于打卡热力图
    coachSinceSave = 0;
    saveProgress();
    coachRefreshStats();
    coachCheckBadges();
  }
  function coachRestore() {
    const cl = progress.coachLast;
    if (cl && cl.seg != null && !cl.done) {
      coachState.seg = Math.max(0, Math.min(TRAIN_SEGS.length - 1, cl.seg));
      coachState.remain = cl.remain != null ? cl.remain : TRAIN_SEGS[coachState.seg].min * 60;
    }
  }

  /* ---- 成就徽章 + 打卡热力图 ---- */
  const COACH_BADGES = [
    { id: "first", icon: "🌱", title: "迈出第一步", desc: "完成首次口语打卡", ok: function (s) { return s.days >= 1; } },
    { id: "day3", icon: "🔥", title: "坚持 3 天", desc: "连续打卡 3 天", ok: function (s) { return s.streak >= 3; } },
    { id: "day7", icon: "🔥", title: "一周不间断", desc: "连续打卡 7 天", ok: function (s) { return s.streak >= 7; } },
    { id: "day30", icon: "🏆", title: "月度铁人", desc: "连续打卡 30 天", ok: function (s) { return s.streak >= 30; } },
    { id: "min100", icon: "⏱", title: "累计 100 分钟", desc: "累计练习 100 分钟", ok: function (s) { return s.total >= 100; } },
    { id: "min600", icon: "⏱", title: "累计 10 小时", desc: "累计练习 600 分钟", ok: function (s) { return s.total >= 600; } },
    { id: "session", icon: "✅", title: "完成一轮训练", desc: "完成一次 20 分钟训练", ok: function (s) { return !!s.sessionDone; } }
  ];
  function coachBadgeStats() {
    const days = progress.coachDays ? Object.keys(progress.coachDays).length : 0;
    return {
      days: days,
      streak: (progress.coach && progress.coach.streak) || 0,
      total: Math.floor((progress.coach && progress.coach.total || 0) / 60),
      sessionDone: !!progress.coachSessionDone
    };
  }
  function coachCheckBadges() {
    if (!Array.isArray(progress.coachBadges)) progress.coachBadges = [];
    const s = coachBadgeStats();
    let newly = null;
    COACH_BADGES.forEach(function (b) {
      if (progress.coachBadges.indexOf(b.id) === -1 && b.ok(s)) {
        progress.coachBadges.push(b.id);
        if (!newly && b.id !== "first") newly = b;
      }
    });
    if (progress.coachBadges.length && newly) { saveProgress(); toast("🏅 解锁成就：" + newly.icon + " " + newly.title); }
    coachRefreshBadges();
  }
  function coachHeatmapHtml() {
    const days = progress.coachDays || {};
    const end = new Date(); end.setHours(0, 0, 0, 0);
    const cells = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date(end); d.setDate(end.getDate() - i);
      const key = d.getFullYear() + "-" + coachPad(d.getMonth() + 1) + "-" + coachPad(d.getDate());
      const m = days[key] || 0;
      const cls = m >= 40 ? "l4" : m >= 20 ? "l3" : m >= 10 ? "l2" : m >= 1 ? "l1" : "l0";
      const wd = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
      const tip = key + " · " + m + " 分钟（周" + wd + "）";
      cells.push('<i class="hm-cell ' + cls + '" title="' + tip + '"></i>');
    }
    return '<div class="hm-grid">' + cells.join("") + "</div>" +
      '<div class="hm-legend">' +
      '<span>少</span><i class="hm-cell l0"></i><i class="hm-cell l1"></i><i class="hm-cell l2"></i><i class="hm-cell l3"></i><i class="hm-cell l4"></i><span>多</span>' +
      '</div>';
  }
  function coachBadgesHtml() {
    const s = coachBadgeStats();
    const unlocked = progress.coachBadges || [];
    return '<div class="badge-grid">' + COACH_BADGES.map(function (b) {
      const got = unlocked.indexOf(b.id) !== -1;
      return '<div class="badge' + (got ? " got" : "") + '" title="' + esc(b.desc) + '">' +
        '<span class="badge-ic">' + (got ? b.icon : "🔒") + "</span>" +
        '<b>' + esc(b.title) + "</b><small>" + esc(b.desc) + "</small></div>";
    }).join("") + "</div>";
  }
  function coachRefreshBadges() {
    const e = document.getElementById("coachBadges");
    if (e) e.innerHTML = coachBadgesHtml();
  }

  /* ---- 周报：近 7 天汇总 + 文本导出 ---- */
  function coachWeekMin() {
    const days = progress.coachDays || {};
    const end = new Date(); end.setHours(0, 0, 0, 0);
    let sum = 0, best = 0, bestDay = "", cnt = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(end); d.setDate(end.getDate() - i);
      const key = d.getFullYear() + "-" + coachPad(d.getMonth() + 1) + "-" + coachPad(d.getDate());
      const m = days[key] || 0;
      if (m > 0) { cnt++; sum += m; }
      if (m > best) { best = m; bestDay = key; }
    }
    return { sum: sum, best: best, bestDay: bestDay, cnt: cnt };
  }
  function coachReportText() {
    const s = coachStats(), w = coachWeekMin();
    const days = progress.coachDays || {};
    const totalDays = Object.keys(days).length;
    const unlocked = progress.coachBadges || [];
    const L = [];
    L.push("【软包装外贸英语 · AI 口语陪练打卡周报】");
    L.push("生成时间：" + new Date().toLocaleString("zh-CN"));
    L.push("");
    L.push("🔥 连续打卡：" + s.streak + " 天");
    L.push("⏱ 累计练习：" + s.totalMin + " 分钟（全站共 " + totalDays + " 天有练）");
    L.push("📅 近 7 天：" + w.sum + " 分钟，练了 " + w.cnt + " 天" + (w.best ? " · 最勤 " + w.bestDay + " 练 " + w.best + " 分钟" : ""));
    L.push("🆕 今日已练：" + s.today + " 分钟");
    L.push("");
    L.push("🏅 已解锁成就 (" + unlocked.length + "/" + COACH_BADGES.length + ")：");
    COACH_BADGES.forEach(function (b) { if (unlocked.indexOf(b.id) !== -1) L.push("  " + b.icon + " " + b.title); });
    L.push("");
    L.push("今天还没练够？去「AI 教练手册」或「AI 陪练」开口 20 分钟，让开口像刷牙一样容易。");
    return L.join("\n");
  }
  function coachCopyReport() {
    const t = coachReportText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast("📋 打卡周报已复制到剪贴板"); }, function () {
        coachDownloadReport(); toast("复制受限，已改为下载文本");
      });
    } else {
      coachDownloadReport();
      toast("复制不可用，已改为下载文本");
    }
  }
  function coachDownloadReport() {
    const t = coachReportText();
    const blob = new Blob([t], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "软包装外贸英语口语打卡周报_" + coachToday() + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("⬇️ 签到周报已下载");
  }
  function coachWeeklyReportState() {
    if (!progress.coachWeeklyReport) progress.coachWeeklyReport = { wk: "", text: "", time: 0 };
    return progress.coachWeeklyReport;
  }
  function coachReportHtml() {
    const r = coachWeeklyReportState();
    const hasKey = window.Tutor && window.Tutor.hasConfig && window.Tutor.hasConfig();
    const fresh = r.text && r.wk === coachWeekTag();
    return `
    <div class="card" style="margin-top:14px">
      <div class="chat-head"><span>📈 本周 AI 学习报告</span>
        <span style="display:inline-flex;gap:6px;flex-shrink:0">
          <button class="btn btn-primary btn-sm" data-action="coach-weekly-gen" ${hasKey ? "" : "disabled"}>✨ 生成本周学习报告</button>
          ${r.text ? '<button class="btn btn-outline btn-sm" data-action="coach-weekly-clear">清空</button>' : ""}
        </span>
      </div>
      <p class="coach-report-muted" style="margin:4px 0 8px">依据本周口语陪练记录 · AI 分析「已掌握表达 / 高频语法错误 / 常想不起来的词 / 不自然句子 / 下周 3 个主题 / 每日计划」。${hasKey ? "" : "（需先在「AI 陪练 → 模型设置」填写 API Key）"}</p>
      ${r.text
        ? (fresh ? '<div class="coach-report">' + esc(r.text) + "</div>" : '<div class="coach-report">' + esc(r.text) + '<div class="coach-report-muted" style="margin-top:6px">⚠️ 这是上一周（' + esc(r.wk) + '）的报告。</div></div>')
        : '<div class="coach-report-muted">还没有生成报告。先到「AI 陪练」聊几次，积累本周记录后回来点「✨ 生成本周学习报告」。</div>'}
    </div>`;
  }
  function coachWeekTag() {
    const d = new Date();
    const start = new Date(d.getFullYear(), 0, 1);
    return d.getFullYear() + "-W" + Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
  }
  function generateWeeklyReport() {
    if (!window.Tutor || !window.Tutor.weeklyReport) { toast("AI 陪练模块未加载"); return; }
    if (!window.Tutor.hasConfig()) { toast("请先到「AI 陪练」模型设置填写 API Key"); return; }
    toast("✨ 正在生成周学习报告…");
    window.Tutor.weeklyReport().then(function (text) {
      const r = coachWeeklyReportState();
      r.wk = coachWeekTag();
      r.text = String(text || "（未返回内容）");
      r.time = Date.now();
      saveProgress();
      toast("✅ 周学习报告已生成，可在下方查看或复制");
      renderCoach();
    }).catch(function (err) {
      toast("生成失败：" + (err && err.message ? err.message : "未知错误"));
    });
  }
  function coachBannerHtml() {
    const s = coachStats(), w = coachWeekMin();
    const doneToday = (progress.coach && progress.coach.today || 0) >= 60;  // 已 ≥1 分钟
    return `
    <section class="coach-banner">
      <span class="cb-flame">🔥</span>
      <div class="cb-main">
        <b>${doneToday ? "今日已打卡 " + s.today + " 分钟" : "今天还没开口？"}</b>
        <span>已连续 <b>${s.streak}</b> 天 · 近 7 天 ${w.sum} 分钟 · 累计 ${s.totalMin} 分钟</span>
      </div>
      <div class="cb-actions">
        <a class="btn btn-soft btn-sm" href="#/coach">🎬 去训练 →</a>
        <button class="btn btn-outline btn-sm" data-action="coach-copy-report">📋 复制周报</button>
        <button class="btn btn-outline btn-sm" data-action="coach-download-report">⬇️ 下载周报</button>
      </div>
    </section>`;
  }



  function coachTotalSecs() { return TRAIN_SEGS.reduce(function (s, g) { return s + g.min * 60; }, 0); }
  function coachElapsedSecs() {
    let s = 0;
    for (let i = 0; i < coachState.seg; i++) s += TRAIN_SEGS[i].min * 60;
    return s + (TRAIN_SEGS[coachState.seg].min * 60 - coachState.remain);
  }
  function coachFmt(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
  }
  function clearCoachTimer() {
    if (coachTimerId) { clearInterval(coachTimerId); coachTimerId = null; }
    if (coachState.running) coachPersist();  // 离开或重置时把已练时长与位置落盘
  }
  function coachRedraw() {
    const t = document.getElementById("ctTime");
    const f = document.getElementById("ctFill");
    const st = document.getElementById("ctState");
    if (t) t.textContent = coachFmt(coachState.remain);
    if (f) f.style.width = Math.min(100, coachElapsedSecs() / coachTotalSecs() * 100) + "%";
    if (st) {
      if (coachState.done) st.textContent = "✅ 已完成";
      else if (coachState.running) st.textContent = "进行中 · 第 " + (coachState.seg + 1) + " / " + TRAIN_SEGS.length + " 段";
      else st.textContent = "已暂停";
    }
    document.querySelectorAll("[data-seg]").forEach(function (c) {
      c.classList.toggle("active", parseInt(c.getAttribute("data-seg"), 10) === coachState.seg);
    });
    const cur = document.getElementById("ctCurrent");
    if (cur) cur.innerHTML = "<b>" + esc(TRAIN_SEGS[coachState.seg].label) + "</b> · " + esc(TRAIN_SEGS[coachState.seg].goal);
    const sBtn = document.getElementById("ctStart");
    if (sBtn) sBtn.textContent = coachState.running ? "⏸ 暂停" : "▶ 继续";
  }
  function coachSpeak(prompt) {
    if (window.Player && prompt) Player.speak(prompt, { rate: 1 });
  }
  function coachAnnounce(t) { toast(t); }
  function coachStart() {
    if (coachState.done) coachReset();
    coachState.running = true;
    coachRedraw();
    clearCoachTimer();
    coachTimerId = setInterval(coachTick, 1000);
    coachSpeak(TRAIN_SEGS[coachState.seg].prompt);
  }
  function coachPause() {
    coachState.running = false;
    clearCoachTimer();
    coachPersist();
    coachRedraw();
  }
  function coachReset() {
    clearCoachTimer();
    coachState.running = false;
    coachState.done = false;
    coachState.seg = 0;
    coachState.remain = TRAIN_SEGS[0].min * 60;
    coachPersist();
    coachRedraw();
  }
  function coachJump(i) {
    clearCoachTimer();
    coachState.seg = Math.max(0, Math.min(TRAIN_SEGS.length - 1, i));
    coachState.remain = TRAIN_SEGS[coachState.seg].min * 60;
    coachState.done = false;
    coachRedraw();
    if (coachState.running) {
      coachTimerId = setInterval(coachTick, 1000);
      coachSpeak(TRAIN_SEGS[coachState.seg].prompt);
    }
  }
  function coachTick() {
    if (!coachState.running) return;
    coachCreditSecs();           // 每走一秒计入今日/累计时长
    coachState.remain--;
    if (coachState.remain < 0) {
      if (coachState.seg < TRAIN_SEGS.length - 1) {
        coachState.seg++;
        coachState.remain = TRAIN_SEGS[coachState.seg].min * 60;
        coachAnnounce("▶️ 进入「" + TRAIN_SEGS[coachState.seg].label + "」— " + TRAIN_SEGS[coachState.seg].goal);
        coachSpeak(TRAIN_SEGS[coachState.seg].prompt);
      } else {
        coachFinish();
        return;
      }
    }
    coachRedraw();
  }
  function coachFinish() {
    clearCoachTimer();
    coachState.running = false;
    coachState.done = true;
    progress.coachSessionDone = true;   // 达成「完成一轮训练」成就
    coachPersist();
    coachRedraw();
    coachAnnounce("🎉 今日 20 分钟训练完成！记得用「今日错题清单」复述错句，明天先复述它们。");
    coachSpeak("Great job! That completes your 20-minute session. Review your mistake list, and we will start with it next time.");
  }

  function renderCoach() {
    coachRestore();   // 从上次未完成的段落继续
    const resumed = progress.coachLast && !progress.coachLast.done && coachState.seg > 0;
    const steps = [
      { t: "第 1 步 · 先选一个具体场景", d: "不要只写“练英语”。点一个外贸真实场景（展会接待、询盘报价、商务谈判、电话沟通、售后客诉、视频会议、物流、机场/酒店），或自己描述一个周末闲聊、出差住宿。场景越具体，越容易持续开口。" },
      { t: "第 2 步 · 让它先了解你", d: "在「AI 陪练 → 教练规则」先填好「👤 我的档案」（水平/目标/最需要的场景）并选定语速、纠错节奏、是否 80% 可懂 + 20% 新、是否四段式纠错。刚起步可要求一次只问一个问题、每次回复 2 句话以内。" },
      { t: "第 3 步 · 先让它陪你说完", d: "开口阶段别追求每句都对。让它等你说完再回应，每 3 轮集中复盘 2 个最影响理解的问题——既不错过纠错，也不会让对话断断续续。" },
      { t: "第 4 步 · 把错误变成下一次的练习材料", d: "对话结束点「🪄 让 AI 提炼本场错句」，或把 AI 回复加入「📌 今日错题」清单。第二天不要重新开始，先复述昨天的 3 个问题。口语不是靠收藏资料增长的。" }
    ];
    app.innerHTML = `
    <div class="page-head">
      <h2>🎯 AI 教练使用手册</h2>
      <div class="en">把 GPT Live 的口练心得变成你的日常动作 · 每天 20 分钟最容易坚持</div>
    </div>

    <div class="card coach-ratio">
      <div style="font-size:30px">🤖</div>
      <div>
        <b>一句话分工：</b>把 <b>80% 的高频重复练习</b>交给 AI（随时开口、无限重练、自动复盘），把最需要<b>发音诊断与真实社交压力</b>的 <b>20%</b> 留给真人外教。真人课不必取消，但购买频率可以降下来。
      </div>
    </div>

    ${resumed ? '<div class="coach-resume">💡 已恢复上次训练进度：第 ' + (coachState.seg + 1) + ' 段「' + esc(TRAIN_SEGS[coachState.seg].label) + '」（剩余 ' + coachFmt(coachState.remain) + '），点「▶ 继续」接着练。</div>' : ""}

    <div class="card" style="margin-top:14px">
      <div class="chat-head"><span>🪜 4 步把 AI 调成你的口语教练</span>
        <a class="btn btn-soft btn-sm" href="#/tutor">去 AI 陪练 →</a></div>
      ${steps.map(function (s) {
        return '<div class="coach-step"><b>' + esc(s.t) + '</b><p>' + esc(s.d) + '</p></div>';
      }).join("")}
    </div>

    <div class="card" style="margin-top:14px">
      <div class="chat-head"><span>⚙️ 关键开关（对应文章里的规则）</span></div>
      <div class="coach-toggle-grid">
        <div><b>👤 我的档案</b><p>先告诉它你的水平、目标、最需要的场景——它才不会一上来说一大段难懂的英语。</p></div>
        <div><b>纠错节奏</b><p>不逐句纠正 vs 每 3 轮集中复盘 vs 结束统一总结。建议「每 3 轮复盘」，把交流从纠错里剥离开。</p></div>
        <div><b>语速</b><p>放慢/略高于你/母语速度。跟不上时让它放慢，不必像对真人那样反复解释状态。</p></div>
        <div><b>80% 可懂 + 20% 新</b><p>让它把难度控制在你约八成能听懂、两成是新东西——略高于你才进步。</p></div>
        <div><b>四段式纠错</b><p>集中复盘时按「我的原句 / 正确版 / 更自然版 / 原因」输出，专门治中式英语。</p></div>
        <div><b>等我说完再回应</b><p>我说完 “I'm done” 前它不回、不替你补全句子，给你完整表达空间。</p></div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="chat-head"><span>⏱ 每日 20 分钟训练（带倒计时）</span>
        <span style="font-size:12px;color:var(--muted);font-weight:400">跟随下方节奏，你也可以直接在「AI 陪练」里对话</span></div>
      <div class="coach-stats" id="ctStats">${coachStatsHtml()}</div>
      ${coachTimerHtml()}
    </div>

    <div class="card" style="margin-top:14px">
      <div class="chat-head"><span>🪜 7 天进阶计划</span>
        <span style="font-size:12px;color:var(--muted);font-weight:400">每天只练一个主题 · 第 7 天综合测试 + 本周报告</span></div>
      <div class="coach-plan">
        ${COACH_7DAY.map(function (d) {
          return '<div class="day"><b>' + esc(d.day) + " · " + esc(d.theme) + '</b><p>点「去练」在 AI 陪练里按这个主题开口。第二天先把昨天的错题复述顺。</p><button class="btn btn-soft btn-sm" data-action="coach-7day" data-en="' + esc(d.en) + '">去练 →</button></div>';
        }).join("")}
      </div>
    </div>

    ${coachReportHtml()}

    <div class="card" style="margin-top:14px">
      <div class="chat-head"><span>📅 打卡日历（近 12 周）</span>
        <span style="font-size:12px;color:var(--muted);font-weight:400">颜色越深，当天练得越多</span></div>
      ${coachHeatmapHtml()}
    </div>

    <div class="card" style="margin-top:14px">
      <div class="chat-head"><span>🏅 成就徽章</span>
        <span style="font-size:12px;color:var(--muted);font-weight:400">达成自动解锁 · ${(progress.coachBadges || []).length} / ${COACH_BADGES.length}</span></div>
      <div id="coachBadges">${coachBadgesHtml()}</div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="chat-head"><span>❓ 常见问题</span></div>
      <div class="coach-faq">
        <div><b>一定要用外教课吗？</b><p>不是。先让 AI 陪你每天开口，把高频复述练熟；只在需要发音诊断、系统纠音或真实社交压力时再约真人。</p></div>
        <div><b>只有 5 分钟怎么办？</b><p>只做一个场景的问答也是一次闭环。让开口这件事从“需要预约的学习计划”变成刷牙一样容易的日常习惯。</p></div>
        <div><b>语速 / 纠错怎么单独调？</b><p>到「AI 陪练 → 教练规则」里选择并保存即可，系统会把这些规则注入导师的指令里。</p></div>
        <div><b>周学习报告怎么生成？</b><p>先在「AI 陪练」聊几次积累本周记录，回到本页点「✨ 生成本周学习报告」——它按你的水平输出已掌握表达、高频错误、常忘词、不自然句、下周主题与每日计划。</p></div>
        <div><b>7 天计划怎么用？</b><p>按「第 1~7 天」依次点「去练」在陪练里开口；每天第二天先把昨天的错题复述顺，第 7 天做综合测试并生成周报告。</p></div>
      </div>
    </div>`;
    coachRedraw();
  }

  function coachTimerHtml() {
    return `
    <div class="coach-timer" id="coachTimerWrap">
      <div class="ct-top">
        <span class="ct-state" id="ctState">就绪</span>
        <span class="ct-time" id="ctTime">${coachFmt(coachState.remain)}</span>
      </div>
      <div class="ct-bar"><div class="ct-fill" id="ctFill" style="width:0%"></div></div>
      <div class="ct-segs">
        ${TRAIN_SEGS.map(function (g, i) {
          return '<button class="ct-seg" data-action="coach-seg" data-seg="' + i + '">' + esc(g.label) + " · " + g.min + "分</button>";
        }).join("")}
      </div>
      <div class="ct-current" id="ctCurrent"><b>${esc(TRAIN_SEGS[coachState.seg].label)}</b> · ${esc(TRAIN_SEGS[coachState.seg].goal)}</div>
      <div class="ct-actions">
        <button class="btn btn-primary btn-sm" data-action="coach-start" id="ctStart">▶ 开始</button>
        <button class="btn btn-outline btn-sm" data-action="coach-pause">⏸ 暂停</button>
        <button class="btn btn-outline btn-sm" data-action="coach-reset">↺ 重置</button>
        <button class="btn btn-soft btn-sm" data-action="coach-prev">← 上一段</button>
        <button class="btn btn-soft btn-sm" data-action="coach-next">下一段 →</button>
      </div>
    </div>`;
  }


  function setupSettings() {
    const modal = document.getElementById("settingsModal");
    const btn = document.getElementById("settingsBtn");
    const engineSel = document.getElementById("setEngine");
    const voiceSel = document.getElementById("setVoice");
    const rateRange = document.getElementById("setRate");
    const rateVal = document.getElementById("setRateVal");
    const azureField = document.getElementById("setAzureField");
    const azureKey = document.getElementById("setAzureKey");
    const azureRegion = document.getElementById("setAzureRegion");
    const azureVoice = document.getElementById("setAzureVoice");
    const azurePA = document.getElementById("setAzurePA");
    const setLocalASR = document.getElementById("setLocalASR");

    function populateVoices() {
      voiceSel.innerHTML = '<option value="">自动选择（优选高质量发音人）</option>' +
        Player.voiceList().map(function (v) {
          return '<option value="' + esc(v.name) + '">' + esc(v.name) + "</option>";
        }).join("");
    }
    function syncAzureField() {
      if (azureField) azureField.hidden = engineSel.value !== "azure";
    }
    function open() {
      populateVoices();
      engineSel.value = progress.engine || "native";
      syncAzureField();
      azureKey.value = progress.azureKey || "";
      azureRegion.value = progress.azureRegion || "";
      azureVoice.value = progress.azureVoice || "en-US-JennyNeural";
      if (azurePA) azurePA.checked = progress.azurePA !== false;
      if (setLocalASR) setLocalASR.checked = !!progress.localASR;
      voiceSel.value = progress.voice || "";
      rateRange.value = progress.rate || 1;
      rateVal.textContent = (progress.rate || 1).toFixed(1) + "×";
      modal.hidden = false;
    }
    function close() { modal.hidden = true; }
    function save() {
      try {
        const engine = engineSel.value || "native";
        progress.engine = engine;
        progress.azureKey = azureKey.value.trim();
        progress.azureRegion = azureRegion.value.trim();
        progress.azureVoice = azureVoice.value.trim() || "en-US-JennyNeural";
        progress.azurePA = azurePA ? azurePA.checked : true;
        progress.localASR = setLocalASR ? setLocalASR.checked : false;
        progress.voice = voiceSel.value;
        progress.rate = parseFloat(rateRange.value) || 1;
        saveProgress();
        syncPlayerSettings();
      } catch (err) {
        console.error("保存发音设置失败：", err);
      } finally {
        close();
      }
      const label = progress.engine === "azure" ? "（Azure 神经人声）" : progress.engine === "google" ? "（Google，不稳定）" : "";
      if (progress.engine === "azure" && (!progress.azureKey || !progress.azureRegion)) {
        toast("⚠️ 请填写 Azure 区域的 Key 与 Region，否则会用浏览器语音");
      } else {
        toast("✅ 发音设置已保存" + label);
      }
    }

    btn.addEventListener("click", open);
    engineSel.addEventListener("change", syncAzureField);
    rateRange.addEventListener("input", function () {
      rateVal.textContent = parseFloat(rateRange.value).toFixed(1) + "×";
    });
    function testAzure() {
      const res = document.getElementById("azureTestResult");
      if (res) res.textContent = "";
      toast("🔍 正在测试 Azure 语音…");
      const cfg = { key: azureKey.value.trim(), region: azureRegion.value.trim(), voice: azureVoice.value.trim() || "en-US-JennyNeural" };
      /* 直接播放测试句；若自检通过则用 testAzure 报告状态 */
      Player.testAzure(cfg).then(function () {
        toast("✅ Azure 语音可用！");
        if (res) { res.style.color = "var(--ok)"; res.textContent = "✅ 可用，测试句已可访问端点"; }
        /* 试播一句 */
        Player.azure = cfg; Player.speak("Hello! This is the Azure neural voice test.", { rate: 1 });
      }).catch(function (err) {
        toast("⚠️ " + (err && err.message ? err.message : "测试失败"));
        if (res) { res.style.color = "var(--bad)"; res.textContent = "⚠️ " + (err && err.message ? err.message : "失败"); }
      });
    }
    modal.addEventListener("click", function (e) {
      const t = e.target;
      if (t === modal) { close(); return; }
      if (t.closest('[data-action="settings-close"]')) close();
      else if (t.closest('[data-action="settings-save"]')) save();
      else if (t.closest('[data-action="settings-test-azure"]')) testAzure();
    });
  }

  /* ---------------- 启动 ---------------- */
  window.addEventListener("hashchange", renderRoute);
  setupHeaderSearch();
  setupSettings();
  if (!location.hash) location.hash = "#/home";
  renderRoute();
  showOnboarding();

  /* ---------------- 首次上手导流「拆掉'怕'」（来自 ELLLO 深度评） ----------------
     功能再强，新用户最怕的是：怕太难、怕太乱、怕学的东西用不上、怕开始。
     首次进入用一次引导，替用户把「我从哪里开始」定下来，而不是丢给他们一堆菜单。 */
  function showOnboarding() {
    if (localStorage.getItem("fte-onboarded")) return;
    const next = DATA.units[0];
    const mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.style.zIndex = "300";
    mask.innerHTML = `
    <div class="modal" style="max-width:540px">
      <div class="modal-head"><b>👋 别急着学，我先把你带进门</b></div>
      <div style="font-size:14px;color:var(--muted);line-height:1.6;margin-bottom:12px">
        这个站功能很多，但<b>你不用一次学完</b>。我只回答你最担心的几件事：
      </div>
      <div class="ob-fears">
        <div class="ob-fear"><b>😰 怕太难？</b> 内容按从易到难排好，你练的是「踮踮脚就够得着」的难度。</div>
        <div class="ob-fear"><b>😰 怕太乱？</b> 从下面这个起点开始就行，顺着它走，不用自己搭体系。</div>
        <div class="ob-fear"><b>😰 怕学的东西用不上？</b> 全是询盘、报价、装运、客诉这类你每天会碰到的真实场景。</div>
        <div class="ob-fear"><b>😰 怕坚持不下来？</b> 每天 20 分钟就够，一次只做一件事。</div>
      </div>
      <div class="ob-step">
        <b>① 你先在这里</b>：从「${esc(next.title)}」开始（外贸流程的开头）。
      </div>
      <div class="ob-step">
        <b>② 顺着顺序走</b>：先认识这个词 → 听它的例句 → 点「✓ 记住了」。一个单元一个单元来。
      </div>
      <div class="ob-step">
        <b>③ 今天 20 分钟就这么走</b>：<br>
        <span class="ob-mini">3 分钟</span> 读一遍本单元词汇<br>
        <span class="ob-mini">8 分钟</span> 听一段场景对话（跟着开口说）<br>
        <span class="ob-mini">5 分钟</span> 用「🎯 智能评测」跟读一句<br>
        <span class="ob-mini">4 分钟</span> 把今天记的 3 个词放进单词卡<br>
        <span style="color:var(--muted)">完成了点「✅ 今天的任务」，明天继续。</span>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" data-action="ob-skip">😌 我熟练，跳过</button>
        <button class="btn btn-primary" data-action="ob-start">🚀 开始我的第一步</button>
      </div>
    </div>`;
    document.body.appendChild(mask);
    mask.addEventListener("click", function (e) {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      if (t.getAttribute("data-action") === "ob-skip") {
        localStorage.setItem("fte-onboarded", "1");
        closeOb();
      } else if (t.getAttribute("data-action") === "ob-start") {
        localStorage.setItem("fte-onboarded", "1");
        closeOb();
        location.hash = "#/unit/" + next.id;
      }
    });
    function closeOb() { if (mask.parentNode) mask.parentNode.removeChild(mask); }
  }
  window.ASRUtil = {
    norm: norm,
    esc: esc,
    toast: toast,
    evaluateSpeech: evaluateSpeech,
    wordSimilar: wordSimilar,
    wordOverlap: wordOverlap,
    getProgress: function () { return progress; },
    saveProgress: saveProgress,
    Player: Player,
    lookupWord: function (word) {
      const q = String(word).toLowerCase();
      for (let ui = 0; ui < DATA.units.length; ui++) {
        const u = DATA.units[ui];
        for (let vi = 0; vi < u.vocab.length; vi++) {
          const v = u.vocab[vi];
          if (String(v.w).toLowerCase() === q) return { cn: v.cn, ex: v.ex, exCn: v.exCn, ipa: v.ipa };
        }
      }
      return null;
    }
  };
})();
