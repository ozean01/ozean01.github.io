/* ============ 🚨 场景急救（Urgent）============
   「客户五分钟后打来，我现在能说什么？」

   为什么要它（来自一线外贸英语培训师的评审）：
     学员被打断后脑子里是「这客户在压价」，不是「我要练第 7 单元」。
     站内原有的「今日」解决的是常规节奏（每天 20 分钟的五步循环），
     但**处理不了突发**——客户真的打来时，用户需要的不是学习计划，而是三句能立刻说出口的话。

   设计原则：
     1) **零新增未核对英文**。三句「现成话」直接取自站内单元的 phrases[].ex ——
        那本来就是完整的、人工核对过的行业例句；不另写内容，避免引入未经核实的表达。
     2) **离线优先**。关键词匹配 + 场景 chip，不依赖网络；配了模型才多一个 AI 兜底。
     3) **不是导航项**。架构已冻结，它作为「今日」页内的一个区块存在，不新增一级入口。
     4) **一站式出口**：给完话，直接接上 AI 对练 / 四维实战 / 写作 / 关联单元。

   依赖（按需读取）：window.FTE_BOOT（DATA）、window.Tutor（可选）、window.Player（可选）。
   渲染：window.Urgent.html() 返回 HTML 片段；window.Urgent.wire() 在插入后绑定。 */
(function () {
  "use strict";

  window.Urgent = { html: html, wire: wire, matchScene: matchScene, linesFor: linesFor };
  /* 注：测试钩子 _t 在【文件末尾】赋值——SCENES 等是 const，在声明前引用会触发 TDZ，
     导致整个模块在加载期就抛错（js/phonemes.js 曾踩过同一个坑，此处刻意避开）。 */

  /* ---------------- 场景库 ----------------
     关键词用于自由输入的匹配；unit 指向关联单元；next 是给完话之后的出口。 */
  const SCENES = [
    { id: "price", icon: "💰", title: "客户压价 / 嫌贵", kw: ["压价", "砍价", "贵", "便宜", "折扣", "降价", "让价", "price", "discount", "cheap", "expensive", "cost"],
      pick: ["discount", "competitive", "price", "bottom", "margin", "negotiat"],
      unit: 3, next: ["eval4", "write"], hint: "先接住价格，再谈条件——不直接答应也不硬顶" },
    { id: "quote", icon: "📨", title: "客户要报价", kw: ["报价", "询价", "多少钱", "价格表", "quote", "quotation", "offer", "price list"],
      pick: ["quotation", "quote", "offer", "valid", "price list", "unit price"],
      unit: 3, next: ["write", "eval4"], hint: "先确认规格与数量再报价，否则报完就白报" },
    { id: "moq", icon: "📦", title: "客户问 MOQ / 要样品", kw: ["moq", "起订", "最小订量", "样品", "打样", "sample", "试单", "trial"],
      pick: ["moq", "sample", "trial", "minimum", "bulk"],
      unit: 3, next: ["write", "unit"], hint: "MOQ 是谈判筹码，先给数量阶梯再谈" },
    { id: "lead", icon: "⏰", title: "客户催交期", kw: ["交期", "催", "什么时候", "多久", "急", "提前", "lead time", "delivery", "deadline", "urgent"],
      pick: ["lead time", "delivery", "schedule", "ready", "ship", "production"],
      unit: 12, next: ["eval4", "write"], hint: "给具体日期 + 说清前提条件，别只说「尽快」" },
    { id: "quality", icon: "🛡️", title: "客户投诉质量问题", kw: ["投诉", "质量", "退货", "脱层", "不良", "次品", "complaint", "quality", "defect", "delamination", "reject"],
      pick: ["quality", "defect", "inspect", "apolog", "investigat", "delamination", "replace"],
      unit: 9, next: ["eval4", "write"], hint: "先道歉稳住，再要证据，最后给方案——别急着辩解" },
    { id: "claim", icon: "⚖️", title: "客户要索赔", kw: ["索赔", "赔偿", "claim", "compensation", "damage", "loss"],
      pick: ["claim", "compensat", "liab", "responsib", "goodwill", "damage"],
      unit: 18, next: ["eval4", "write"], hint: "确认责任前不承诺金额；先要照片、批号、样卷" },
    { id: "payment", icon: "💳", title: "客户问付款方式", kw: ["付款", "账期", "定金", "尾款", "信用证", "payment", "deposit", "balance", "l/c", "tt", "credit"],
      pick: ["payment", "deposit", "balance", "l/c", "t/t", "credit", "advance"],
      unit: 6, next: ["eval4", "write"], hint: "T/T 与 L/C 各有代价，说清风险再让步" },
    { id: "collect", icon: "💵", title: "客户拖尾款 / 要催款", kw: ["催款", "拖欠", "尾款", "逾期", "overdue", "outstanding", "remind", "settle"],
      pick: ["payment", "remit", "balance", "outstanding", "overdue", "settle"],
      unit: 15, next: ["write", "pattern"], hint: "礼貌但要落到具体金额与日期，给对方一个明确的动作" },
    { id: "ship", icon: "🚢", title: "客户问物流 / 船期", kw: ["船期", "订舱", "海运", "空运", "提单", "etd", "eta", "shipping", "booking", "b/l", "freight"],
      pick: ["ship", "book", "vessel", "etd", "eta", "container", "freight", "sail"],
      unit: 7, next: ["eval4", "unit"], hint: "给船名航次 + ETD/ETA，比说「已经在安排了」可信得多" },
    { id: "doc", icon: "📄", title: "客户催单证 / 清关资料", kw: ["单证", "清关", "发票", "装箱单", "产地证", "document", "invoice", "packing list", "customs", "c/o"],
      pick: ["document", "invoice", "packing list", "certificate", "customs", "b/l"],
      unit: 12, next: ["unit", "write"], hint: "先报「今天/明天寄出」+ 清单号，别只说在办" },
    { id: "newcust", icon: "🌱", title: "客户第一次联系 / 要资料", kw: ["开发", "第一次", "新客户", "介绍我们", "catalog", "catalogue", "introduce", "company profile"],
      pick: ["introduc", "catalog", "specializ", "product", "suppli", "manufactur"],
      unit: 2, next: ["write", "eval4"], hint: "别一上来发目录，先问对方在找什么" },
    { id: "exhibit", icon: "🤝", title: "客户来访 / 展会接待", kw: ["展会", "来访", "参观", "工厂", "拜访", "visit", "exhibition", "fair", "booth"],
      pick: ["welcome", "visit", "booth", "fair", "exhibit", "factory"],
      unit: 2, next: ["eval4", "unit"], hint: "先建立印象再谈产品，名片与需求要当场记下" },
    { id: "meeting", icon: "📊", title: "客户要开视频会 / 汇报", kw: ["会议", "视频", "开会", "汇报", "zoom", "teams", "meeting", "call", "present"],
      pick: ["meeting", "agenda", "present", "report", "discuss", "summar"],
      unit: 19, next: ["eval4", "unit"], hint: "先给结论与数据，再说过程——别从背景讲起" },
    { id: "compliance", icon: "✅", title: "客户问认证 / 合规", kw: ["认证", "合规", "食品接触", "reach", "rohs", "fda", "ce", "compliance", "certificate", "食品级"],
      pick: ["comply", "certificat", "reach", "rohs", "fda", "food contact", "declaration"],
      unit: 16, next: ["unit", "write"], hint: "拿不准的合规问题**别口头保证**，回去书面确认" },
    { id: "negotiate", icon: "🎯", title: "客户要谈条件 / 签约", kw: ["谈判", "条款", "合同", "签约", "让步", "negotiate", "contract", "terms", "agreement"],
      pick: ["contract", "terms", "negotiat", "agreement", "sign", "clause"],
      unit: 5, next: ["eval4", "write"], hint: "每次让步都要换回一个条件，别单方面退" }
  ];

  const KEY = "fte-urgent-v1";

  function units() {
    const boot = window.FTE_BOOT || {};
    return (boot.DATA && boot.DATA.units) || [];
  }
  function getUnit(id) {
    const boot = window.FTE_BOOT || {};
    if (boot.getUnit) return boot.getUnit(id);
    return units().filter(function (u) { return u.id === id; })[0] || null;
  }
  function esc(s) { const f = window.FTE_BOOT && window.FTE_BOOT.esc; return f ? f(s) : String(s == null ? "" : s); }
  function toast(m) { const f = window.FTE_BOOT && window.FTE_BOOT.toast; if (f) f(m); }

  /* ---------------- 关键词匹配 ---------------- */
  function matchScene(text) {
    const t = String(text || "").toLowerCase().trim();
    if (!t) return null;
    let best = null, bestN = 0;
    SCENES.forEach(function (s) {
      let n = 0;
      s.kw.forEach(function (k) { if (t.indexOf(String(k).toLowerCase()) !== -1) n++; });
      /* 命中场景标题里的词也算一次 */
      if (t.indexOf(s.title.toLowerCase()) !== -1) n += 2;
      if (n > bestN) { bestN = n; best = s; }
    });
    return bestN > 0 ? best : null;
  }

  function phrasesOf(unitId) {
    const u = getUnit(unitId);
    return (u && u.phrases) || [];
  }
  function vocabOf(unitId) {
    const u = getUnit(unitId);
    return (u && u.vocab) || [];
  }
  /* 三句「现成话」：取关联单元 phrases[].ex —— 那是站内已核对的**完整句子**。
     ⚠️ 多个场景可能指向同一个单元（如报价/压价/MOQ 都在 U3），若只取前 3 条，
     三个场景会给出**一模一样的三句**，就丧失了「针对场景」的意义。
     故每个场景带 pick 关键词，先在单元短语里按场景择优，再由单元对话台词兜底。 */
  function linesFor(scene, n) {
    n = n || 3;
    const ps = phrasesOf(scene.unit);
    const picks = (scene.pick || []).map(function (k) { return String(k).toLowerCase(); });
    const score = function (p) {
      const s = (String(p.p || "") + " " + String(p.ex || "")).toLowerCase();
      let k = 0;
      picks.forEach(function (w) { if (s.indexOf(w) !== -1) k++; });
      return k;
    };
    const ranked = ps.map(function (p, i) { return { p: p, s: score(p), i: i }; })
      .sort(function (a, b) { return (b.s - a.s) || (a.i - b.i); });
    const hits = ranked.filter(function (r) { return r.s > 0; });

    const out = [];
    /* 有命中词就按命中优先排；一个都没命中说明该单元短语与场景无关，转用对话台词兜底 */
    (hits.length ? ranked : []).forEach(function (r) {
      if (out.length >= n) return;
      if (r.p.ex && String(r.p.ex).trim()) out.push({ en: r.p.ex, cn: r.p.exCn || "", tag: r.p.p });
    });
    if (out.length < n) {
      const u = getUnit(scene.unit);
      const dlg = (u && u.dialogues && u.dialogues[0]) || null;
      ((dlg && dlg.lines) || []).forEach(function (l) {
        if (out.length >= n) return;
        if (l.en && String(l.en).trim()) out.push({ en: l.en, cn: l.cn || "", tag: "" });
      });
    }
    return out.slice(0, n);
  }

  /* 与场景相关的行业术语（带「专」角标的那批），供用户核对译法 */
  function termsOf(unitId, n) {
    const DIFF = (typeof FTE_DIFF !== "undefined") ? FTE_DIFF : null;
    return vocabOf(unitId).filter(function (v) {
      const d = DIFF && DIFF.words && DIFF.words[String(v.w).toLowerCase()];
      return d && d.dom;
    }).slice(0, n || 6);
  }

  const NEXT_LABEL = { eval4: "🎤 拿去对练", write: "✍️ 写成邮件", unit: "📖 进单元", pattern: "🧩 句式库" };
  function nextHref(k, scene) {
    if (k === "unit") return "#/unit/" + scene.unit;
    if (k === "eval4") return "#/eval4";
    if (k === "write") return "#/write";
    if (k === "pattern") return "#/patterns";
    return "#/today";
  }

  /* ---------------- 会话状态 ---------------- */
  const S = window.Urgent._state = { sceneId: "", text: "", ai: "", aiLoading: false, open: false };
  function cursor() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]") || []; } catch (e) { return []; }
  }
  function pushCursor(id) {
    try {
      const a = cursor().filter(function (x) { return x !== id; });
      a.unshift(id);
      localStorage.setItem(KEY, JSON.stringify(a.slice(0, 6)));
    } catch (e) { /* ignore */ }
  }

  /* ---------------- 结果区（只重绘这一块，避免整页重渲染打断用户） ---------------- */
  function resultHtml() {
    const scene = SCENES.filter(function (s) { return s.id === S.sceneId; })[0];
    if (!scene) return "";
    const u = getUnit(scene.unit);
    const lines = linesFor(scene, 3);
    const terms = termsOf(scene.unit, 6);
    const next = (scene.next || []).map(function (k) {
      return '<a class="urg-next" href="' + nextHref(k, scene) + '">' + (NEXT_LABEL[k] || k) + "</a>";
    }).join("");

    const lineRows = lines.map(function (l, i) {
      return '<div class="urg-line">' +
        '<span class="urg-n">' + (i + 1) + "</span>" +
        '<div class="urg-l-main"><div class="urg-en">' + esc(l.en) + "</div>" +
        (l.cn ? '<div class="urg-cn">' + esc(l.cn) + "</div>" : "") + "</div>" +
        '<button class="play-btn" data-action="urg-say" data-text="' + esc(l.en) + '" title="朗读">▶</button>' +
        '<button class="urg-copy" data-action="urg-copy" data-text="' + esc(l.en) + '" title="复制这句">⧉</button>' +
        "</div>";
    }).join("") || '<div class="field-note">该场景暂无现成句，可直接进关联单元看对话。</div>';

    return `
    <div class="urg-res">
      <div class="urg-res-head">
        <b>${scene.icon} ${esc(scene.title)}</b>
        <span class="urg-hint">${esc(scene.hint)}</span>
      </div>
      <div class="urg-sec">先说这几句（可直接复制 / 朗读）</div>
      ${lineRows}
      ${terms.length ? '<div class="urg-sec">本场景术语（发音与译法请人工核对）</div>' +
        '<div class="urg-terms">' + terms.map(function (v) {
          return '<button class="urg-term" data-action="urg-say" data-text="' + esc(v.w) + '" title="' + esc(v.ipa + " " + v.cn) + '">' + esc(v.w) + '<span class="urg-dom">专</span></button>';
        }).join("") + "</div>" : ""}
      <div class="urg-sec">接着说</div>
      <div class="urg-next-row">
        ${next}
        ${u ? '<a class="urg-next ghost" href="#/unit/' + u.id + '">📖 U' + u.id + " " + esc(u.title) + "</a>" : ""}
      </div>
      ${(window.Tutor && window.Tutor.hasConfig())
        ? '<div class="urg-ai-wrap"><button class="btn btn-soft btn-sm" data-action="urg-ai">🤖 让 AI 针对我的原话给 3 句</button>' +
          '<div id="urgAi" class="urg-ai"' + (S.ai || S.aiLoading ? "" : " hidden") + ">" +
          (S.aiLoading ? '<span class="field-note">正在生成…（需联网）</span>' : esc(S.ai)) + "</div></div>"
        : '<div class="field-note" style="margin-top:8px">上面是站内已核对的现成表达。配了模型后还能让 AI 针对你的具体原话给 3 句（到「🤖 AI 对练 → 模型设置」填 Key）。</div>'}
    </div>`;
  }

  /* ---------------- 面板 ---------------- */
  function html() {
    const recent = cursor().map(function (id) { return SCENES.filter(function (s) { return s.id === id; })[0]; }).filter(Boolean).slice(0, 3);
    const chips = SCENES.map(function (s) {
      return '<button class="urg-chip' + (S.sceneId === s.id ? " on" : "") + '" data-action="urg-pick" data-id="' + s.id + '">' +
        s.icon + " " + esc(s.title) + "</button>";
    }).join("");
    return `
    <details class="urg" id="urgent"${S.open || S.sceneId ? " open" : ""}>
      <summary><b>🚨 客户马上要谈什么？</b>
        <span class="urg-sub">选一个场景，立刻给你 3 句能说出口的话（离线可用，不打断当天进度）</span></summary>
      <div class="urg-body">
        ${recent.length ? '<div class="urg-sec">最近用过</div><div class="urg-recent">' +
          recent.map(function (s) {
            return '<button class="urg-chip mini" data-action="urg-pick" data-id="' + s.id + '">' + s.icon + " " + esc(s.title) + "</button>";
          }).join("") + "</div>" : ""}
        <div class="urg-sec">常见场景</div>
        <div class="urg-chips">${chips}</div>
        <div class="urg-sec">或直接描述（例如「客户说太贵了要折扣」）</div>
        <div class="urg-input">
          <input type="text" id="urgText" value="${esc(S.text)}" placeholder="客户刚说了什么 / 你马上要说什么…" autocomplete="off">
          <button class="btn btn-primary btn-sm" data-action="urg-find">找现成话</button>
        </div>
        <div id="urgBody">${resultHtml()}</div>
      </div>
    </details>`;
  }

  /* 只重绘结果区：避免整页重渲染（今日页有清单勾选状态） */
  function paint() {
    const el = document.getElementById("urgBody");
    if (el) el.innerHTML = resultHtml();
    const chips = document.querySelectorAll(".urg-chip[data-id]");
    chips.forEach(function (c) { c.classList.toggle("on", c.getAttribute("data-id") === S.sceneId); });
  }

  function pick(id) {
    S.sceneId = id; S.ai = ""; S.aiLoading = false;
    pushCursor(id);
    paint();
    const el = document.getElementById("urgBody");
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function askAi() {
    const scene = SCENES.filter(function (s) { return s.id === S.sceneId; })[0];
    if (!scene) return;
    if (!(window.Tutor && window.Tutor.hasConfig())) { toast("请先到「🤖 AI 对练 → 模型设置」填好模型 Key。"); return; }
    S.aiLoading = true; paint();
    const sys = "你是资深软包装外贸英语教练。用户描述了客户当前的情形，请给出【3 句】他**现在就能直接说出口**的英文，" +
      "每句单独一行，中文对照写在句后括号里。要求：忠实用户情形、不添加用户没说的承诺或价格；" +
      "用 plain English，句子短、可直接朗读；行业术语保留专业说法。除这 3 句外不要任何解释。";
    const user = "场景：" + scene.title + "（" + scene.hint + "）\n" +
      (S.text ? "用户描述：" + S.text + "\n" : "") + "请给 3 句。";
    window.Tutor.callChat([{ role: "system", content: sys }, { role: "user", content: user }])
      .then(function (txt) { S.ai = String(txt || "").trim(); S.aiLoading = false; paint(); })
      .catch(function (e) { S.aiLoading = false; S.ai = "生成失败：" + (e && e.message ? e.message : "检查 Key / 网络"); paint(); });
  }

  function wire() {
    document.addEventListener("click", function (e) {
      const el = e.target.closest("[data-action]");
      if (!el) return;
      const act = el.getAttribute("data-action");
      if (!act || act.indexOf("urg-") !== 0) return;
      if (act === "urg-pick") { S.open = true; pick(el.getAttribute("data-id")); return; }
      if (act === "urg-say") {
        if (window.Player && window.Player.speak) window.Player.speak(el.getAttribute("data-text") || "", {});
        return;
      }
      if (act === "urg-copy") {
        const t = el.getAttribute("data-text") || "";
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(t).then(function () { toast("已复制这句"); }, function () { toast("复制失败，请手动选中"); });
        } else { toast("当前环境不支持一键复制"); }
        return;
      }
      if (act === "urg-ai") { askAi(); return; }
      if (act === "urg-find") {
        const box = document.getElementById("urgText");
        const q = box ? box.value : "";
        S.text = q;
        const hit = matchScene(q);
        if (hit) { S.open = true; pick(hit.id); }
        else { toast("没匹配到常见场景——可从上面挑一个最接近的，或配好模型后用 AI 生成。"); }
        return;
      }
    });
    /* 回车即找 */
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      const t = e.target;
      if (!t || t.id !== "urgText") return;
      e.preventDefault();
      const btn = document.querySelector('[data-action="urg-find"]');
      if (btn) btn.click();
    });
  }
  /* 事件在模块加载时绑定一次（与站内其它模块一致）。
     注意不要放进 render：今日页会反复重渲染，重复绑定会让一次点击触发多次。 */
  if (typeof document !== "undefined") wire();

  /* 供自动化测试/诊断使用（不影响运行时）。放在文件末尾：避免 const 的 TDZ。 */
  window.Urgent._t = {
    SCENES: SCENES, matchScene: matchScene, linesFor: linesFor, phrasesOf: phrasesOf,
    termsOf: termsOf, resultHtml: resultHtml, nextHref: nextHref
  };
})();
