/* ============ 测验引擎：四种题型生成器 ============ */
(function () {
  "use strict";

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* 编辑距离（Levenshtein），用于排除「长得太像」的干扰项，避免一眼排除 */
  function editDist(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  /* 同词性 + 同频段优先，其次同频段，再随机；避开与答案编辑距离过近的词。
     items 为 { label, pos, lvl }；答案本身不参与。 */
  function pickDistractors(items, answer, n) {
    const ans = items.find(function (it) { return it.label === answer; }) || { pos: "", lvl: "" };
    const seen = {};
    seen[answer] = true;
    const out = [];
    function rank(it) {
      const samePos = it.pos && ans.pos && it.pos.replace(/[^a-zA-Z]/g, "") === ans.pos.replace(/[^a-zA-Z]/g, "") ? 2 : 0;
      const sameLvl = it.lvl === ans.lvl ? 1 : 0;
      return samePos * 10 + sameLvl;
    }
    const cands = items.filter(function (it) {
      if (it.label === answer) return false;
      if (editDist(it.label, answer) <= 1) return false;
      return true;
    });
    /* 先按相似度分层，层内再随机，取前 n */
    const byRank = {};
    cands.forEach(function (it) {
      const r = rank(it);
      (byRank[r] || (byRank[r] = [])).push(it);
    });
    const sortedKeys = Object.keys(byRank).map(Number).sort(function (a, b) { return b - a; });
    for (let k = 0; k < sortedKeys.length && out.length < n; k++) {
      const layer = shuffle(byRank[sortedKeys[k]]);
      for (let i = 0; i < layer.length && out.length < n; i++) {
        const it = layer[i];
        if (!seen[it.label]) { seen[it.label] = true; out.push(it.label); }
      }
    }
    return out;
  }

  const Quiz = {
    TYPES: [
      { id: "en2cn", label: "英译中" },
      { id: "cn2en", label: "中译英" },
      { id: "listening", label: "听句选义" },
      { id: "fill", label: "选词填空" },
      { id: "reorder", label: "句块重排" },
      { id: "write", label: "✍️ 写作产出（词级批改，可 AI 润色）" }
    ],

    /* units: 数组；opts: { count, types: [..] }
       pos 与 lvl 来自数据条目（lvl 由 js/lvl-map.js 提供词频难度） */
    build: function (units, opts) {
      const pool = [];
      const LVL = window.FTE_LVL || {};
      units.forEach(function (u) {
        u.vocab.forEach(function (v, i) {
          pool.push({
            w: v.w, cn: v.cn, ipa: v.ipa, ex: v.ex, exCn: v.exCn,
            uid: u.id, wid: u.id + "-" + i,
            pos: v.pos || "n.",
            lvl: LVL[String(v.w).toLowerCase()] || ""
          });
        });
      });
      if (pool.length === 0) return [];

      const types = (opts.types && opts.types.length) ? opts.types : ["en2cn", "cn2en"];
      const count = Math.min(opts.count || 10, pool.length * 3);
      const questions = [];
      let ti = 0;
      let guard = 0;
      while (questions.length < count && guard < count * 60) {
        guard++;
        const type = types[ti % types.length];
        ti++;
        const v = pool[Math.floor(Math.random() * pool.length)];
        let q = null;

        if (type === "en2cn") {
          const dist = pickDistractors(pool.map(function (p) { return { label: p.cn, pos: p.pos, lvl: p.lvl }; }), v.cn, 3);
          q = {
            type: "en2cn",
            typeLabel: "英译中 · 选出正确的中文意思",
            prompt: v.w,
            sub: v.ipa,
            options: shuffle([v.cn].concat(dist)),
            answer: v.cn,
            explain: v.w + " " + v.ipa + " — " + v.cn + "\n例：" + v.ex + "\n" + v.exCn
          };
        } else if (type === "cn2en") {
          const dist = pickDistractors(pool.map(function (p) { return { label: p.w, pos: p.pos, lvl: p.lvl }; }), v.w, 3);
          q = {
            type: "cn2en",
            typeLabel: "中译英 · 选出正确的英文",
            prompt: v.cn,
            sub: "词性对照：见解释",
            options: shuffle([v.w].concat(dist)),
            answer: v.w,
            explain: v.w + " " + v.ipa + " — " + v.cn
          };
        } else if (type === "listening") {
          const dist = pickDistractors(pool.map(function (p) { return { label: p.exCn, pos: p.pos, lvl: p.lvl }; }), v.exCn, 3);
          q = {
            type: "listening",
            typeLabel: "听句选义 · 点击播放后选择意思",
            prompt: v.ex,
            sub: "🔊 点上方喇叭可重听",
            listenText: v.ex,
            options: shuffle([v.exCn].concat(dist)),
            answer: v.exCn,
            explain: v.ex + "\n" + v.exCn
          };
        } else if (type === "fill") {
          const lowerEx = v.ex.toLowerCase();
          const lowerW = v.w.toLowerCase();
          if (lowerEx.indexOf(lowerW) !== -1) {
            const blanked = v.ex.replace(new RegExp("\\b" + v.w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"), "______");
            const dist = pickDistractors(pool.map(function (p) { return { label: p.w, pos: p.pos, lvl: p.lvl }; }), v.w, 3);
            q = {
              type: "fill",
              typeLabel: "选词填空 · 选出最合适的单词",
              prompt: blanked,
              sub: v.exCn,
              options: shuffle([v.w].concat(dist)),
              answer: v.w,
              explain: v.w + " " + v.ipa + " — " + v.cn + "\n" + v.ex + "\n" + v.exCn
            };
          } else {
            // 例句不含该词则跳过 fill（不退回复用同类型，避免短句/短语根本不匹配时卡死在 fill）
            continue;
          }
        } else if (type === "reorder") {
          /* 句块重排：把一句切成语块并打乱，学习者按正确语序拼回（练语序+句型 chunk） */
          const sp = window.SentenceParser && window.SentenceParser.chunks(v.ex);
          if (!sp || sp.blocks.length < 2) continue;
          q = {
            type: "reorder",
            typeLabel: "句块重排 · 按正确语序点选拼回整句（先看中文义）",
            prompt: v.exCn,
            sub: v.w + " " + v.ipa,
            chunks: sp.blocks,      // 已打乱，每块带原始位 o
            answer: v.ex,
            explain: v.ex + "\n" + v.exCn
          };
        } else if (type === "write") {
          /* 写作产出：看中文义 → 学习者自己写英文（自由文本），提交后按词级比对给反馈。
             复用已有例句（ex/exCn），完全离线、零构建；可选后再用 LLM 润色批改。 */
          q = {
            type: "write",
            typeLabel: "✍️ 写作产出 · 看中文写英文（自由输入）",
            prompt: v.exCn,          // 中文义 → 用户写英文
            sub: "本句用到「" + v.cn + "」。请用英语写出来（一句即可），点提交看词级批改。",
            answer: v.ex,            // 目标英文（参考）
            explain: v.ex + "\n" + v.exCn,
            wid: v.wid, kw: v.w, kcn: v.cn
          };
        }
        if (q && (q.type === "reorder" || q.type === "write" ? true : q.options.length === 4)) { if (!q.wid) q.wid = v.wid; questions.push(q); }
      }
      return questions;
    }
  };

  window.Quiz = Quiz;

  /* ============ 🤖 AI 周测 / 材料理解题（P20 · 共用一套引擎）============
     由来（外部素材评估，2026-10-30）：法语学习提示词里真正命中本站缺口的两条——
       ① 「按本周学的内容出 10 题，答完前不显示答案，最后打分并逐题讲错」；
       ② 「把一段材料翻译后围绕词汇/短语/阅读理解提问」（沉浸式引擎）。
     本站智能测验是**固定题库**（干扰项按词性/频段挑），AI 只用于写作批改；
     投料口能把材料送进听/说/写三个引擎，却没有「读后理解题」。
     本模块只做「生成 → 作答（延迟给答案）→ 逐题讲错」这一段，四条边界：
       · 只作练习：不写 localStorage、不计入测验最好成绩、不计入打卡、不作为能力证据；
       · 答案必须锚定上下文：提示词要求每题都能在 CONTEXT 里找到依据，禁止编造法规/数值；
       · 全站只有这一处新增 LLM 调用（week 与 material 共用），减少漂移面；
       · AI 输出旁固定挂 window.AIDisclosure（事实边界门禁的披露出口）。 */
  var AIQ_COUNT = { week: 10, material: 5 };
  var AIQ = {};
  function aiqFresh() { return { status: "idle", qs: [], idx: 0, picks: [], err: "", box: null, payloadText: "", title: "" }; }
  function aiqBoot() { return window.FTE_BOOT || {}; }
  function aiqEsc(s) { var b = aiqBoot(); var f = b.esc || window.esc; return f ? f(s) : String(s == null ? "" : s); }
  function aiqToast(m) { var b = aiqBoot(); if (b.toast) b.toast(m); }
  /* FACT_GUARD：tutor.js 是唯一来源；未加载时用逐字等价的降级副本（与 urgent.js 同口径） */
  var AIQ_FALLBACK_FACT_GUARD = "=== FACT BOUNDARY (always in force; non-negotiable) ===\n" +
    "You are a language coach, not a compliance, legal, customs, financial or technical advisor. If you are not fully certain about a fact, say so explicitly and plainly — never invent or guess.\n" +
    "Exact information — regulation numbers, limit values, standard numbers, tariff rates, HS codes, Incoterms liability splits, bank terms and process figures (curing time, coating weight, bond strength, retort/sealing conditions) — must be flagged as 「请人工核对」 and checked against the official text, the supplier's TDS, the customs tariff or the bank before business use.";
  function aiqFactGuard() {
    if (window.Tutor && window.Tutor.FACT_GUARD) return window.Tutor.FACT_GUARD;
    return AIQ_FALLBACK_FACT_GUARD;
  }
  function aiqDisclosure() {
    if (window.AIDisclosure && typeof window.AIDisclosure.html === "function") return window.AIDisclosure.html();
    return '<div class="ai-disclosure" data-ai-disclosure="1" role="note" style="margin-top:8px;font-size:12px;color:var(--muted)">🤖 AI 可能出错 · 精确信息请人工核对</div>';
  }

  /* ---------- 上下文：本周学过的单元 + 常错词 + 易错点 ---------- */
  function aiqWeekContext() {
    var b = aiqBoot(), DATA = b.DATA || { units: [] }, P = b.progress || {};
    var learned = P.learned || {}, cnt = {};
    Object.keys(learned).forEach(function (id) {
      var uid = parseInt(String(id).split("-")[0], 10);
      if (uid > 0) cnt[uid] = (cnt[uid] || 0) + 1;
    });
    var uids = Object.keys(cnt).map(Number).sort(function (a, c) { return cnt[c] - cnt[a]; }).slice(0, 3);
    if (!uids.length) uids = [1, 2, 3];
    var idWord = {}, lines = [];
    (DATA.units || []).forEach(function (u) {
      (u.vocab || []).forEach(function (v, i) { idWord[u.id + "-" + i] = { w: v.w, cn: v.cn }; });
    });
    uids.forEach(function (uid) {
      var u = (DATA.units || []).filter(function (x) { return x.id === uid; })[0];
      if (!u) return;
      lines.push("# UNIT " + uid + ": " + String(u.title || ""));
      (u.vocab || []).slice(0, 10).forEach(function (v) {
        lines.push("- " + v.w + " | " + v.cn + (v.ex ? " | example: " + v.ex : ""));
      });
      (u.phrases || []).slice(0, 4).forEach(function (p) {
        if (p && p.en) lines.push("- phrase: " + p.en + " | " + (p.cn || ""));
      });
    });
    var wrong = P.wrong || {};
    var wk = Object.keys(wrong).sort(function (a, c) { return (wrong[c] || 0) - (wrong[a] || 0); }).slice(0, 8);
    if (wk.length) {
      lines.push("# WORDS YOU OFTEN GET WRONG (test these first):");
      wk.forEach(function (k) {
        var it = idWord[k];
        lines.push("- " + (it ? it.w + " | " + it.cn : k) + " (wrong " + (wrong[k] || 0) + "x)");
      });
    }
    var M = window.FTE_MISTAKES;
    if (M && M.groups) {
      lines.push("# CHINESE-ENGLISH MISTAKES YOU HAVE MET (test the corrected forms):");
      var n = 0;
      M.groups.forEach(function (g) {
        (g.items || []).forEach(function (it) {
          if (n >= 4 || !it || !it.right) return;
          lines.push("- wrong: " + it.wrong + " | correct: " + it.right);
          n++;
        });
      });
    }
    return lines.join("\n").slice(0, 4500);
  }

  /* ---------- 提示词：system 里 FACT_GUARD 无条件追加在最末 ---------- */
  function aiqSystem(kind) {
    var n = AIQ_COUNT[kind] || 8;
    return [
      "You write multiple-choice questions for a Chinese learner of soft-packaging foreign-trade English (flexible packaging: films, laminating adhesives, printing inks, pouches, export operations; level around B1-B2).",
      kind === "week"
        ? "The CONTEXT is what this learner studied this week: the units they are on, the words they often get wrong, and Chinese-English mistakes they have met."
        : "The CONTEXT is a short English passage the learner imported. Use only this passage as the factual basis.",
      "Write exactly " + n + " questions. Mix these types (at least 2 of each when the context allows):",
      "1) en2cn: an English term or sentence from CONTEXT -> choose the correct Chinese meaning;",
      "2) cn2en: a Chinese meaning from CONTEXT -> choose the correct English;",
      "3) fill: an English sentence from CONTEXT with one word replaced by ______ -> choose the missing word;",
      "4) reply: a short business situation in CONTEXT -> choose the most natural English reply.",
      "Hard rules:",
      "- Every question and its correct answer must be grounded in CONTEXT; never test a fact that is not in CONTEXT.",
      "- Never invent regulation numbers, limit values, standard numbers, prices, HS codes, Incoterms liability splits or curing/sealing figures. If CONTEXT contains such a figure, quote it verbatim and add 「请人工核对」 in the explanation.",
      "- Exactly 4 options and exactly one correct answer; distractors must be plausible but wrong; no 'all of the above'.",
      "- explain: 1-2 short Chinese sentences that quote the CONTEXT wording the answer is based on.",
      "- Use the English exactly as written in CONTEXT (do not silently fix spelling or terminology).",
      "Output ONLY compact JSON (no markdown fence, no commentary):",
      '{"questions":[{"type":"en2cn","prompt":"...","sub":"optional short hint","options":["a","b","c","d"],"answer":0,"explain":"..."}]}',
      aiqFactGuard()
    ].join("\n");
  }
  function aiqUser(kind, ctx) {
    var head = kind === "week" ? "WEEK CONTEXT (this learner's current material):" : "PASSAGE (imported by the learner):";
    var body = ctx;
    if (kind !== "week" && window.Tutor && typeof window.Tutor.wrapUserContent === "function") {
      body = window.Tutor.wrapUserContent(body);
    }
    return head + "\n" + body + "\n\nNow output the JSON with exactly " + (AIQ_COUNT[kind] || 8) + " questions.";
  }
  function aiqParse(txt, want) {
    var t = String(txt || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    var obj;
    try { obj = JSON.parse(t); } catch (e) { return []; }
    var arr = Array.isArray(obj) ? obj : (obj.questions || obj.items || []);
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (q) {
      return q && typeof q.prompt === "string" && q.prompt && Array.isArray(q.options) &&
        q.options.length >= 2 && q.options.length <= 4 &&
        typeof q.answer === "number" && q.answer >= 0 && q.answer < q.options.length;
    }).slice(0, want || 10).map(function (q) {
      return {
        type: q.type || "", prompt: q.prompt, sub: q.sub || "",
        options: q.options.map(String), answer: q.answer, explain: q.explain || ""
      };
    });
  }

  /* ---------- 生成（全模块唯一 LLM 调用点）---------- */
  function aiqStart(kind) {
    var s = AIQ[kind] || (AIQ[kind] = aiqFresh());
    if (s.status === "loading") return;
    var ctx = kind === "week" ? aiqWeekContext() : String(s.payloadText || "");
    if (!ctx || ctx.length < 60) {
      s.status = "error";
      s.err = kind === "week"
        ? "还没有足够的学习记录：先在「今日」练几个单元或做几道测验，再回来出题。"
        : "先在上面「📌 拆成句子」——AI 理解题要围绕你拆出的英文句子出。";
      aiqPaint(kind);
      return;
    }
    if (!window.Tutor || typeof window.Tutor.callChat !== "function") {
      s.status = "error"; s.err = "AI 模块没有加载：请刷新页面重试。"; aiqPaint(kind); return;
    }
    s.status = "loading"; s.err = ""; aiqPaint(kind);
    /* 事实边界门禁从调用点**往回** 40 行找 system 提示词，所以消息数组必须先组装再调用：
       aiqSystem() → aiqFactGuard() → window.Tutor.FACT_GUARD，链长 2。 */
    const aiqMsgs = [
      { role: "system", content: aiqSystem(kind) },
      { role: "user", content: aiqUser(kind, ctx) }
    ];
    window.Tutor.callChat(aiqMsgs, { temperature: 0.35, maxTokens: 1800 }).then(function (txt) {
      var qs = aiqParse(txt, AIQ_COUNT[kind]);
      if (!qs.length) throw new Error("模型没有按 JSON 格式返回题目，请重试");
      s.qs = qs; s.idx = 0;
      s.picks = qs.map(function () { return -1; });
      s.status = "answering"; aiqPaint(kind);
    }).catch(function (e) {
      s.status = "error";
      s.err = (e && e.message === "no-key")
        ? "还没配置模型：去「AI 对练」填 API Key，或选「🖥 本地 Ollama」（免 Key）。"
        : "出题失败：" + (e && e.message ? e.message : "网络错误");
      aiqPaint(kind);
    });
  }

  /* ---------- 渲染 ---------- */
  function aiqTypeLabel(t) {
    return ({ en2cn: "英译中", cn2en: "中译英", fill: "选词填空", reply: "场景应答" })[t] || "AI 题";
  }
  function aiqQuestionHtml(kind, s) {
    var q = s.qs[s.idx], pick = s.picks[s.idx];
    return '<div class="quiz-progress" style="margin-top:12px"><i style="width:' + Math.round(s.idx / s.qs.length * 100) + '%"></i></div>' +
      '<div class="quiz-q" style="margin-top:10px">' +
      '<div class="q-type">' + aiqEsc(aiqTypeLabel(q.type)) + " · 第 " + (s.idx + 1) + " / " + s.qs.length + " 题</div>" +
      '<div class="q-text">' + aiqEsc(q.prompt) + "</div>" +
      (q.sub ? '<div class="q-sub">' + aiqEsc(q.sub) + "</div>" : "") + "</div>" +
      '<div class="quiz-options">' + q.options.map(function (o, i) {
        return '<button class="option' + (pick === i ? " selected" : "") + '" data-aiq="pick" data-aiq-kind="' + kind + '" data-i="' + i + '">' + aiqEsc(o) + "</button>";
      }).join("") + "</div>" +
      '<div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<button class="btn btn-primary btn-sm" data-aiq="next" data-aiq-kind="' + kind + '"' +
      (pick < 0 ? ' disabled title="先选一个答案"' : "") + ">" +
      (s.idx + 1 >= s.qs.length ? "交卷看结果 →" : "下一题 →") + "</button>" +
      '<span class="field-note">作答时不提示对错，交卷后逐题讲错。</span></div>';
  }
  /* AI 输出渲染点：必须接披露出口（门禁 test-ai-prompt-inventory 断言此函数名） */
  function aiqResultHtml(kind, s) {
    var total = s.qs.length, correct = 0;
    s.qs.forEach(function (q, i) { if (s.picks[i] === q.answer) correct++; });
    var acc = total ? Math.round(correct / total * 100) : 0;
    var g = acc >= 85 ? "good" : acc >= 60 ? "mid" : "bad";
    return '<div class="card result-box" style="margin-top:12px;padding:16px 14px">' +
      '<div class="score ' + g + '">' + acc + "%</div>" +
      "<p>答对 <b>" + correct + "</b> / " + total + " 题 · 只作练习</p>" +
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:10px">' +
      '<button class="btn btn-primary btn-sm" data-aiq="again" data-aiq-kind="' + kind + '">再出一套</button>' +
      '<button class="btn btn-outline btn-sm" data-aiq="close" data-aiq-kind="' + kind + '">收起</button></div></div>' +
      '<div class="card" style="margin-top:12px"><b>逐题讲错</b>' +
      s.qs.map(function (q, i) {
        var ok = s.picks[i] === q.answer;
        return '<div class="review-item"><div class="rq">' + (i + 1) + ". " + aiqEsc(q.prompt) + "</div>" +
          '<div class="ra ' + (ok ? "ok" : "no") + '">' + (ok ? "✓ 你答对了" : "✗ 你选：" + aiqEsc(q.options[s.picks[i]] || "未作答")) + "</div>" +
          (ok ? "" : '<div class="ra">正确答案：<b>' + aiqEsc(q.options[q.answer]) + "</b></div>") +
          (q.explain ? '<div class="ra">依据：' + aiqEsc(q.explain).replace(/\n/g, "<br>") + "</div>" : "") +
          "</div>";
      }).join("") + "</div>" +
      '<div class="field-note" style="margin-top:8px">口径：AI 出的题只作练习——不计入测验最好成绩、不计入打卡、不作为能力证据；术语/数值请人工核对后再用于真实业务。</div>' +
      aiqDisclosure();
  }
  function aiqCardHtml(kind) {
    var s = AIQ[kind] || (AIQ[kind] = aiqFresh());
    var isWeek = kind === "week";
    var title = isWeek ? "🤖 AI 周测 · 按本周内容出题" : "🤖 AI 理解题 · 围绕这段材料提问";
    var intro = isWeek
      ? "按你本周学过的单元、常错词和易错点出 " + AIQ_COUNT.week + " 道多选题；答题过程中不显示对错，交卷后逐题讲错。只作练习——不计入智能测验最好成绩、不计入打卡、不作为能力证据。"
      : "围绕上面拆出的句子出 " + AIQ_COUNT.material + " 道理解题（主旨/细节/词义/短语/场景应答），答完才给答案与讲解。材料只在你点「生成」时发给你自己配置的模型，本站不保存。";
    var inner;
    if (s.status === "loading") inner = '<p class="field-note" style="margin-top:12px">⏳ 正在出题（用你配置的模型，约 5–20 秒）…</p>';
    else if (s.status === "error") inner = '<div class="sop-hint" style="margin-top:10px">⚠️ ' + aiqEsc(s.err) + "</div>" +
      '<div style="margin-top:10px"><button class="btn btn-primary btn-sm" data-aiq="start" data-aiq-kind="' + kind + '">重试</button> ' +
      '<a class="btn btn-outline btn-sm" href="#/tutor">去配置模型</a></div>';
    else if (s.status === "answering") inner = aiqQuestionHtml(kind, s);
    else if (s.status === "done") inner = aiqResultHtml(kind, s);
    else inner = '<div style="margin-top:12px"><button class="btn btn-primary btn-sm" data-aiq="start" data-aiq-kind="' + kind + '">生成 ' + AIQ_COUNT[kind] + " 道题</button>" +
      '<span class="field-note" style="margin-left:8px">需要先在「AI 对练」里配置模型（DeepSeek / 本地 Ollama 均可）</span></div>';
    return '<div class="card" style="padding:16px 18px">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">' +
      "<div><b>" + title + '</b><div class="field-note" style="margin-top:4px;max-width:560px">' + intro + "</div></div>" +
      (s.status !== "idle" ? '<button class="btn btn-outline btn-sm" data-aiq="close" data-aiq-kind="' + kind + '" title="清空本次 AI 题（不保存任何数据）">清空</button>' : "") +
      "</div>" + inner + "</div>";
  }
  function aiqPaint(kind) {
    var s = AIQ[kind];
    if (!s || !s.box) return;
    if (!document.body || !document.body.contains(s.box)) return;
    s.box.innerHTML = aiqCardHtml(kind);
  }

  /* ---------- 挂载（app.js 的测验设置页 + material.js 的投料口各一处）---------- */
  function aiqMount(el, kind, payload) {
    if (!el) return;
    var s = AIQ[kind] || (AIQ[kind] = aiqFresh());
    s.box = el;
    var text = payload && typeof payload.text === "string" ? payload.text : "";
    if (text && s.status !== "idle" && s.payloadText && text !== s.payloadText) {
      /* 换了材料：上一套题作废（避免题面对不上新句子） */
      s.status = "idle"; s.qs = []; s.idx = 0; s.picks = []; s.err = "";
    }
    if (text) s.payloadText = text;
    if (payload && payload.title) s.title = payload.title;
    aiqPaint(kind);
  }

  if (typeof document !== "undefined") {
    document.addEventListener("click", function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-aiq]") : null;
      if (!el) return;
      var act = el.getAttribute("data-aiq");
      var kind = el.getAttribute("data-aiq-kind") || "week";
      var s = AIQ[kind];
      if (!s) return;
      if (act === "start" || act === "again") { aiqStart(kind); return; }
      if (act === "pick") { s.picks[s.idx] = parseInt(el.getAttribute("data-i"), 10); aiqPaint(kind); return; }
      if (act === "next") {
        if (s.picks[s.idx] < 0) { aiqToast("先选一个答案"); return; }
        if (s.idx + 1 >= s.qs.length) { s.status = "done"; aiqPaint(kind); }
        else { s.idx++; aiqPaint(kind); }
        return;
      }
      if (act === "close") { var box = s.box; AIQ[kind] = aiqFresh(); AIQ[kind].box = box; aiqPaint(kind); }
    });
  }

  /* 供 Node 门禁测试：纯函数（解析与题目校验）不依赖 DOM */
  window.QuizAI = { mount: aiqMount, start: aiqStart, _t: { parse: aiqParse, weekContext: aiqWeekContext } };
})();
