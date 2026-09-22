/* ============ 🎯 水平自测 v2 · 诊断层（Placement）============
   由来：站内原有的「水平自测」只有 6 道词义题，答完只写入一个 `fte-placement`（起点单元号），
   **没有日期、没有分项、没有历史**——因此结构上不可能回答「我比 30 天前好了吗」。
   评审结论：站点缺的不是方法论，是把「坚持 vs 能力」的洞见落到**时间轴**上。

   本模块补齐的四件事（来源：CEFR 目标与英语能力自测 / 英语能力诊断 / 证据链）：
     ① 用 CEFR「能做什么」描述符定位，**听说读写分别定级、禁止取平均**；
     ② 每次自测**落日期**，首次为「基线」并**锁定**，永不被后续结果覆盖；
     ③ 自动排期第 7 / 30 / 90 天复测，并在到期时提示（见 today.js）；
     ④ 保留分项历史，显示**与上次相比逐项的变化**，而不是给一个平均等级。

   刻意不做的事（避免形式主义）：
     · 不做 4 技能 × 5 维 = 20 格的评分矩阵——原方案自己也承认「评分维度超载」；
       这里只对**你自己选的那一项重点**做 5 维 0–2 评分，并要求写一行证据理由。
     · 不新增导航、不新增路由：整块挂在原有「水平自测」页的结果区（新机制只落在已有的 #/placement）。
     · 总分只用于**同一个人的纵向比较**，不用于给别人贴标签——这条写进了界面文案。

   依赖：无（自己读写 localStorage）。渲染：window.Placement.cardHtml()。
   测试见 tools/test-placement.js。 */
(function () {
  "use strict";

  var KEY = "fte-placement-v2";

  /* ---------------- CEFR 全球量表（四技能化的「能做什么」） ----------------
     来源：Council of Europe, CEFR 3.3 Global Scale（https://www.coe.int/en/web/common-european-framework-reference-languages/table-1-cefr-3.3-common-reference-levels-global-scale）。
     下表为便于行动的简化概括，不是官方译文；也不替代正式考试。 */
  var LEVELS = [
    { id: "A1", desc: "能理解和使用非常常见的表达；在对方说得慢、愿意帮助时进行简单互动。" },
    { id: "A2", desc: "能处理个人信息、购物、地点、工作等熟悉主题的直接交流。" },
    { id: "B1", desc: "能理解熟悉主题的主要意思；在旅行与日常场景中应对，并简单说明经历、计划和理由。" },
    { id: "B2", desc: "能理解具体或抽象复杂文本的主要观点；与熟练使用者较自然地互动，并清楚表达立场。" },
    { id: "C1", desc: "能理解要求高、篇幅长的材料并把握隐含意义；在学术、职业和社会场景中灵活表达。" },
    { id: "C2", desc: "几乎能轻松理解听到或读到的内容；能综合不同来源、重构论点并精确表达细微差别。" }
  ];

  /* 四技能基线任务：每项都带**固定的时间/篇幅**与**检查点**，否则「自评」会变成凭感觉打分。
     href 指向站内既有页面，四项都能立刻开练——不新造入口。 */
  var SKILLS = [
    { id: "listen", label: "听", icon: "🎧", href: "#/listen",
      task: "听 2–4 分钟材料，写下主旨 + 3 个细节，再复述一遍",
      check: "主旨 / 细节 / 语块边界 / 漏听原因" },
    { id: "speak", label: "说", icon: "🎤", href: "#/speaking",
      task: "不读稿录 2 分钟，解释一段经历、观点或流程",
      check: "可理解度 / 停顿 / 语法 / 词块 / 任务是否完成" },
    { id: "read", label: "读", icon: "📖", href: "#/units",
      task: "读 600–1000 词文章，写五句摘要 + 一个质疑",
      check: "主要观点 / 证据 / 推断 / 生词是否妨碍理解" },
    { id: "write", label: "写", icon: "✍️", href: "#/write",
      task: "20 分钟写 180–250 词的邮件、说明或短文",
      check: "目的 / 结构 / 论证 / 准确度 / 修订能力" }
  ];

  /* 统一 5 维反馈量表（每维 0–2）。只用于**同一个人纵向比较**。 */
  var RUBRIC = [
    { id: "task", label: "任务完成", hint: "信息和意图是否传达？" },
    { id: "intel", label: "可理解度", hint: "对方能否无需猜测地理解？" },
    { id: "range", label: "准确与范围", hint: "词汇、语法、发音或拼写是否支持任务？" },
    { id: "org", label: "组织与流畅", hint: "信息是否连贯，停顿是否破坏交流？" },
    { id: "uptake", label: "修订与迁移", hint: "收到反馈后能否改进，并在新任务中复用？" }
  ];
  var SCALE = [
    { v: 0, label: "未完成" },
    { v: 1, label: "部分完成 / 依赖提示" },
    { v: 2, label: "稳定完成" }
  ];

  /* 复测锚点（天）：第 7 / 30 / 90 天。刻意不取原方案的「第 3–7 天平行任务」——
     那一层与站内既有的 FSRS 到期调度重合。 */
  var ANCHORS = [7, 30, 90];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function pad(n) { return (n < 10 ? "0" + n : "" + n); }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  /* 纯日期字符串加减天数（本地时区，避免 toISOString 的 UTC 偏移把日期挪一天） */
  function addDays(dateStr, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
    if (!m) return dateStr;
    var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    d.setDate(d.getDate() + (n || 0));
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function diffDays(from, to) {
    var a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(from || ""));
    var b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(to || ""));
    if (!a || !b) return 0;
    var d1 = new Date(parseInt(a[1], 10), parseInt(a[2], 10) - 1, parseInt(a[3], 10));
    var d2 = new Date(parseInt(b[1], 10), parseInt(b[2], 10) - 1, parseInt(b[3], 10));
    return Math.round((d2 - d1) / 86400000);
  }

  /* ---------------- 存储 ---------------- */
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY));
      if (!o || typeof o !== "object") return null;
      if (!Array.isArray(o.history) || !o.history.length) return null;
      /* 基线锁定：baselineAt 只由首个条目决定，任何后续写入都不改它 */
      if (!o.baselineAt) o.baselineAt = o.history[0].at || "";
      return o;
    } catch (e) { return null; }
  }
  function save(rec) {
    try { localStorage.setItem(KEY, JSON.stringify(rec)); return true; } catch (e) { return false; }
  }
  function currentEntry(rec) {
    if (!rec || !rec.history || !rec.history.length) return null;
    return rec.history[rec.history.length - 1];
  }

  /* 自测（6 道词义题）结束时写入一条诊断记录。
     · 首次 → 建立基线，baselineAt 落日期并锁定；
     · 同一天重复测试 → 覆盖当天那一条（不制造假历史）；
     · 换天再测 → **追加**，基线条目原样保留（这就是「不要用修订版覆盖首版」的数据约束）。 */
  function recordQuiz(score, total, unitId, meta) {
    var at = todayStr();
    var rec = load() || { v: 2, baselineAt: at, history: [] };
    if (!rec.baselineAt) rec.baselineAt = at;
    var last = currentEntry(rec);
    var bankId = (meta && meta.bankId) || "";
    var diffs = (meta && meta.diffs) || null;
    var entry = {
      at: at, kind: (rec.history.length === 0 ? "baseline" : "retest"),
      score: score, total: total, unitId: unitId,
      /* P1-5：题库指纹与每题难度档。没有它们，两次分数在数据层无法判断是否可比——
         换一批题，1 道题的波动就能被读成「进步了」。 */
      bankId: bankId, diffs: diffs, bankRebuilt: (meta && meta.rebuilt) || null,
      skills: {}, focus: "", rubric: {}, evidence: ""
    };
    if (last && last.at === at) {
      /* 同一天：保留已填的分项与量表，只更新分数与推荐单元 */
      entry.skills = last.skills || {};
      entry.focus = last.focus || "";
      entry.rubric = last.rubric || {};
      entry.evidence = last.evidence || "";
      entry.kind = last.kind;
      if (!entry.bankId) { entry.bankId = last.bankId || ""; entry.diffs = last.diffs || null; }
      rec.history[rec.history.length - 1] = entry;
    } else {
      rec.history.push(entry);
    }
    save(rec);
    return rec;
  }

  /* 两次词义题得分是否可比：必须是同一套题（bankId 相同且都非空）。
     返回 {comparable, from, to}——不可比时 UI 必须明说，而不是照样画箭头。 */
  function scoreComparable(rec) {
    if (!rec || !rec.history || rec.history.length < 2) return { comparable: false, from: null, to: null };
    var cur = currentEntry(rec), prev = rec.history[rec.history.length - 2];
    var comparable = !!(cur && prev && cur.bankId && prev.bankId && cur.bankId === prev.bankId);
    return { comparable: comparable, from: prev, to: cur };
  }

  function setSkill(skillId, levelId) {
    var rec = load();
    if (!rec) return null;
    var cur = currentEntry(rec);
    if (!cur) return null;
    if (!cur.skills) cur.skills = {};
    cur.skills[skillId] = levelId;
    save(rec);
    return rec;
  }
  function setFocus(skillId) {
    var rec = load(); if (!rec) return null;
    var cur = currentEntry(rec); if (!cur) return null;
    cur.focus = (cur.focus === skillId) ? "" : skillId;
    save(rec);
    return rec;
  }
  function setRubric(dimId, value) {
    var rec = load(); if (!rec) return null;
    var cur = currentEntry(rec); if (!cur) return null;
    if (!cur.rubric) cur.rubric = {};
    if (value == null) delete cur.rubric[dimId]; else cur.rubric[dimId] = value;
    save(rec);
    return rec;
  }
  function setEvidence(text) {
    var rec = load(); if (!rec) return null;
    var cur = currentEntry(rec); if (!cur) return null;
    cur.evidence = String(text || "").slice(0, 400);
    save(rec);
    return rec;
  }

  /* ---------------- 复测排期 ----------------
     从**基线日**起算第 7 / 30 / 90 天。某个锚点若已有「日期 ≥ 锚点日」的记录，即视为已复测。
     返回下一个到期（或已逾期）的锚点；没有则返回 null。 */
  function schedule(rec) {
    rec = rec || load();
    if (!rec) return null;
    var base = rec.baselineAt;
    var out = {};
    ANCHORS.forEach(function (n) { out["d" + n] = addDays(base, n); });
    return out;
  }
  function retestStatus(today) {
    var rec = load();
    if (!rec) return null;
    today = today || todayStr();
    var base = rec.baselineAt;
    var hist = rec.history || [];
    for (var i = 0; i < ANCHORS.length; i++) {
      var n = ANCHORS[i];
      var anchorDate = addDays(base, n);
      /* 该锚点是否已完成：存在一条不早于锚点日的记录（且不是基线本身） */
      var done = hist.some(function (h) { return h.at >= anchorDate && h.at !== base; });
      if (done) continue;
      var overdue = diffDays(anchorDate, today);
      if (overdue >= 0) return { day: n, dueAt: anchorDate, overdueDays: overdue, overdue: overdue > 0 };
      /* 还没到日子：返回下一个未完成锚点作为预告 */
      return { day: n, dueAt: anchorDate, overdueDays: overdue, overdue: false, future: true };
    }
    return null;
  }

  /* 与上一次相比的逐项变化（**不做平均**）。返回 {changed:[], added:[], same:n, prev:entry} */
  function vsLast(rec) {
    rec = rec || load();
    if (!rec || rec.history.length < 2) return null;
    var cur = rec.history[rec.history.length - 1];
    var prev = rec.history[rec.history.length - 2];
    var idx = function (id) { for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return i; return -1; };
    var changed = [], same = 0, added = [];
    SKILLS.forEach(function (s) {
      var a = prev.skills ? prev.skills[s.id] : null;
      var b = cur.skills ? cur.skills[s.id] : null;
      if (!b) return;
      if (!a) { added.push({ skill: s, level: b }); return; }
      var d = idx(b) - idx(a);
      if (d === 0) same++;
      else changed.push({ skill: s, from: a, to: b, delta: d });
    });
    return { cur: cur, prev: prev, changed: changed, added: added, same: same };
  }

  /* ---------------- 渲染 ---------------- */
  function levelChips(skill, cur) {
    return LEVELS.map(function (L) {
      var on = cur && cur.skills && cur.skills[skill.id] === L.id;
      return '<button class="pl-lv' + (on ? " on" : "") + '" data-action="pl-skill" data-skill="' + skill.id +
        '" data-level="' + L.id + '" title="' + esc(L.id + " · " + L.desc) + '">' + L.id + "</button>";
    }).join("");
  }

  function skillRow(skill, cur) {
    var lv = cur && cur.skills ? cur.skills[skill.id] : null;
    var L = null;
    LEVELS.forEach(function (x) { if (x.id === lv) L = x; });
    var isFocus = cur && cur.focus === skill.id;
    return '<div class="pl-skill">' +
      '<div class="pl-skill-h">' +
        '<span class="pl-skill-t">' + skill.icon + " <b>" + skill.label + "</b></span>" +
        '<span class="pl-chips">' + levelChips(skill, cur) + "</span>" +
        '<button class="pl-focus' + (isFocus ? " on" : "") + '" data-action="pl-focus" data-skill="' + skill.id +
          '" title="把这一项设为本次重点，做 5 维评分">' + (isFocus ? "★ 本次重点" : "☆ 设为重点") + "</button>" +
      "</div>" +
      '<div class="pl-task"><span class="pl-task-k">任务</span>' + esc(skill.task) + "</div>" +
      '<div class="pl-check"><span class="pl-task-k">检查点</span>' + esc(skill.check) + "</div>" +
      (L ? '<div class="pl-lvdesc"><b>' + L.id + "</b> " + esc(L.desc) + "</div>" : "") +
      '<div class="pl-go"><a href="' + skill.href + '">▶ 现在就去练这一项</a></div>' +
    "</div>";
  }

  function rubricHtml(cur) {
    var focus = null;
    SKILLS.forEach(function (s) { if (cur && cur.focus === s.id) focus = s; });
    if (!focus) {
      return '<div class="pl-rubric-empty">上面四项里点一个「☆ 设为重点」，就能对它做 5 维评分（每维 0–2）。' +
        "<b>不做 4 技能 × 5 维的评分矩阵</b>——那会变成填不满的表。</div>";
    }
    var rows = RUBRIC.map(function (d) {
      var v = cur.rubric ? cur.rubric[d.id] : undefined;
      var opts = SCALE.map(function (s) {
        return '<button class="pl-score' + (v === s.v ? " on" : "") + '" data-action="pl-score" data-dim="' + d.id +
          '" data-v="' + s.v + '" title="' + esc(s.label) + '">' + s.v + "</button>";
      }).join("");
      return '<div class="pl-rrow"><span class="pl-rlabel" title="' + esc(d.hint) + '">' + d.label +
        '<i class="pl-rhint">' + esc(d.hint) + "</i></span><span class=\"pl-rop\">" + opts + "</span></div>";
    }).join("");
    var total = 0, n = 0;
    RUBRIC.forEach(function (d) { var v = cur.rubric ? cur.rubric[d.id] : undefined; if (typeof v === "number") { total += v; n++; } });
    return '<div class="pl-rubric">' +
      '<div class="pl-rubric-h"><b>🎯 本次重点：' + focus.icon + " " + focus.label + "</b>" +
        "<span>量表只描述这一次任务中的表现，<b>总分只用于你一个人的纵向比较</b>，不用于给别人贴标签。</span></div>" +
      rows +
      '<div class="pl-rtotal">已评 ' + n + "/" + RUBRIC.length + " 维 · 合计 <b>" + total + "</b> / " + (RUBRIC.length * 2) +
        (n === RUBRIC.length ? "" : "（未评完）") + "</div>" +
      '<div class="pl-ev"><label for="plEvidence">证据理由（必填：凭什么给这个分？）</label>' +
        '<input id="plEvidence" type="text" maxlength="400" placeholder="例：录音第 40 秒起有 3 次长停顿，客户需要我重复一次才听懂…" value="' +
        esc(cur.evidence || "") + '">' +
        '<button class="btn btn-soft btn-sm" data-action="pl-evidence-save">💾 存证据理由</button>' +
        '<span class="sop-hint" id="plEvSaved">输入即自动保存</span></div>' +
    "</div>";
  }

  function historyHtml(rec) {
    if (!rec || rec.history.length < 2) return "";
    var v = vsLast(rec);
    if (!v) return "";
    var lines = v.changed.map(function (c) {
      var up = c.delta > 0;
      return '<div class="pl-delta ' + (up ? "up" : "down") + '">' + (up ? "▲" : "▼") + " " + c.skill.icon + " " + c.skill.label +
        "：" + c.from + " → <b>" + c.to + "</b></div>";
    }).join("");
    var added = v.added.map(function (a) {
      return '<div class="pl-delta new">＋ ' + a.skill.icon + " " + a.skill.label + "：本次新定级 <b>" + a.level + "</b></div>";
    }).join("");
    return '<div class="pl-history">' +
      '<div class="pl-history-h"><b>📈 与上次相比（' + esc(v.prev.at) + " → " + esc(v.cur.at) + "）</b>" +
        "<span>逐项比，<b>不取平均</b>——四项差异大是正常的，分别追踪。</span></div>" +
      (lines || added ? (lines + added) : '<div class="pl-delta same">四项定级与上次相同（' + v.same + " 项）。") +
      '<div class="pl-history-all">全部记录：' + rec.history.map(function (h) {
        return '<span class="pl-hchip">' + esc(h.at) + " · 答对 " + h.score + "/" + h.total + "</span>";
      }).join("") + "</div>" +
    "</div>";
  }

  function cardHtml(rec) {
    rec = rec || load();
    if (!rec) return "";
    var cur = currentEntry(rec);
    var sc = schedule(rec);
    var st = retestStatus();
    var base = rec.baselineAt;
    return '<div class="card pl-card" style="max-width:640px;margin-top:16px">' +
      '<div class="pl-head">' +
        '<b>🧭 诊断：四项分别定级</b>' +
        '<span class="pl-lock">📌 基线日期 <b>' + esc(base) + "</b> · 已锁定，不会被以后的结果覆盖</span>" +
      "</div>" +
      '<div class="pl-note">CEFR 描述的是<b>在具体情境中能完成什么语言任务</b>，不是 App 积分、也不是词汇量。' +
        '先按下面四项任务各做一次、<b>第一版不要查词也不要让 AI 代写</b>，再回来定级。' +
        "四项差异很大时<b>分别定级，不要强行取平均</b>。" +
        "量表<b>总分只用于你一个人的纵向比较</b>，不用于给别人贴标签。</div>" +
      SKILLS.map(function (s) { return skillRow(s, cur); }).join("") +
      rubricHtml(cur) +
      '<div class="pl-sched">' +
        '<div class="pl-sched-h"><b>📅 复测排期</b>' +
          (st ? '<span class="pl-sched-next' + (st.overdue ? " due" : "") + '">' +
            (st.future
              ? "下一次：第 " + st.day + " 天 · " + esc(st.dueAt) + "（还有 " + Math.abs(st.overdueDays) + " 天）"
              : (st.overdue ? "⚠️ 第 " + st.day + " 天复测已逾期 " + st.overdueDays + " 天" : "🔔 今天是第 " + st.day + " 天复测日")) +
            "</span>"
            : "<span>三个锚点都已完成 ✓</span>") +
        "</div>" +
        '<div class="pl-sched-rows">' +
          ANCHORS.map(function (n) {
            return '<span class="pl-schip">第 ' + n + " 天 · " + esc(sc["d" + n]) + "</span>";
          }).join("") +
        "</div>" +
        '<div class="pl-note" style="margin-top:8px">复测要<b>换主题、换听众、换任务</b>再比（迁移），' +
          '而不是把同一篇改一遍再交上来——那样比的是记忆，不是能力。到日子了「🎯 今日」会提醒你。</div>' +
      "</div>" +
      historyHtml(rec) +
      notForHtml() +
    "</div>";
  }

  /* ---------------- 不适合谁（P7 · 借鉴 ENGSENCE 第 9 章的「诚实边界」） ----------------
     一份自测最该说清的除了"测什么"，还有"不测什么、别指望它做什么"。
     这段不新增任何指标，只把本站既有的立场（不代写 / 不刷题型 / 能力≠坚持）说在前面，
     避免用错工具后把"没进步"归因到自己身上。 */
  function notForHtml() {
    return '<details class="pl-notfor">' +
      "<summary>🚫 这份自测（和这个站）<b>不适合谁</b>？——先看清再花时间</summary>" +
      '<div class="pl-notfor-body">' +
        "<p><b>① 只想刷题拿分的人（四六级 / 雅思托福）：</b>这里测的是「能不能听懂、能不能开口、能不能把单子往下走」，不是题型技巧。要提分请用对应的备考材料，" +
          "本站最多当泛听素材。</p>" +
        "<p><b>② 完全不打算开口的人：</b>全站主干动作是听 + 说（跟读、录音对比、语音输入）。只看不读，收益直接打对折。</p>" +
        "<p><b>③ 想找一个「AI 替我把邮件写好」的写作器：</b>写作栏的规矩是<b>只指问题、不代写</b>，AI 批改之后要你自己写出二稿；" +
          "如果你想的是复制一段就能发给客户，请直接找文案工具，别在这里绕。</p>" +
        "<p><b>⚠️ 零基础的朋友：</b>可以来，但请从 <a href=\"#/units\">📚 课程</a> + <a href=\"#/flash\">🃏 单词卡</a>起步，" +
          "<b>先别做本页的四项定级任务</b>——它要求第一版不查词、不让 AI 代写，零基础做不出来只会把自己误定成最低级，" +
          "反而打击信心。等你把前 3 个单元过完再回来测。</p>" +
        '<p class="pl-notfor-foot">顺带说清另一条：本站把 <b>🔥 坚持（练了多少）</b>与 <b>📈 能力（说得怎么样）</b>分栏显示，' +
          "打卡天数不等于口语变好；这里的分项定级才是能力证据。</p>" +
      "</div></details>";
  }

  /* ---------------- 交互：只重渲染这张卡，不接管整页路由 ---------------- */
  function refresh() {
    var el = document.getElementById("plCard");
    if (!el) return;
    var rec = load();
    el.innerHTML = rec ? cardHtml(rec) : "";
  }

  /* 证据理由「输入即存」：卡片的其它按钮会就地重渲染 #plCard，
     若只靠保存按钮，用户点一下等级就会把没保存的文字冲掉。 */
  if (typeof document !== "undefined") document.addEventListener("input", function (e) {
    var el = e.target;
    if (!el || el.id !== "plEvidence") return;
    setEvidence(el.value);
    var t = document.getElementById("plEvSaved");
    if (t) t.textContent = "已自动保存";
  });

  if (typeof document !== "undefined") document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-action]") : null;
    if (!el) return;
    var act = el.getAttribute("data-action");
    if (!act || act.indexOf("pl-") !== 0) return;

    if (act === "pl-skill") { setSkill(el.getAttribute("data-skill"), el.getAttribute("data-level")); refresh(); return; }
    if (act === "pl-focus") { setFocus(el.getAttribute("data-skill")); refresh(); return; }
    if (act === "pl-score") {
      var dim = el.getAttribute("data-dim"), v = parseInt(el.getAttribute("data-v"), 10);
      var rec = load(); var cur = currentEntry(rec);
      var now = cur && cur.rubric ? cur.rubric[dim] : undefined;
      setRubric(dim, now === v ? null : v);     /* 再点一次取消 */
      refresh(); return;
    }
    if (act === "pl-evidence-save") {
      var inp = document.getElementById("plEvidence");
      setEvidence(inp ? inp.value : "");
      var t = document.getElementById("plEvSaved");
      if (t) t.textContent = "已保存";
      if (window.FTE_BOOT && window.FTE_BOOT.toast) window.FTE_BOOT.toast("💾 证据理由已保存");
      return;
    }
  });

  window.Placement = {
    cardHtml: cardHtml,
    refresh: refresh,
    load: load, save: save, currentEntry: currentEntry,
    recordQuiz: recordQuiz, setSkill: setSkill, setFocus: setFocus,
    scoreComparable: scoreComparable,
    setRubric: setRubric, setEvidence: setEvidence,
    schedule: schedule, retestStatus: retestStatus, vsLast: vsLast,
    _t: {
      KEY: KEY, LEVELS: LEVELS, SKILLS: SKILLS, RUBRIC: RUBRIC, SCALE: SCALE, ANCHORS: ANCHORS,
      todayStr: todayStr, addDays: addDays, diffDays: diffDays, esc: esc
    }
  };
})();
