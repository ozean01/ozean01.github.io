/* ============ 📋 一页纸速查小抄（Cheatsheet）============
   为什么有它：写邮件/打电话时人不缺「课程」，缺的是「这句怎么说、马上能抄」。
   本站语料里已有大量可直接发出去的整句（SOP 客户动作句 / 真实来信的正确回信范句 /
   词条例句），但散在十几个模块里。本页把它们按真实外贸流程的 7 个阶段重排成一页纸，
   可筛选、可朗读、可复制、可打印（A4 黑白，按阶段分页）。

   内容口径：
   · **不新写句子**。每条只存一个来源 key（见 ENTRIES 的 src），渲染时从原模块解析出
     英文与中文，来源与正文永远同步；tools/test-cheatsheet.js 会逐条校验 key 真实存在。
   · 不用 patterns.js 的挖空句型、urgent.js 的检索结果、write.js 的任务提示——
     它们不是「可直接发的整句」。
   · 这是速查小抄，不是练习：不计入打卡、不写任何学习数据。

   依赖：window.SOP._t（SOP 步骤与催款话术）、window.FTE_MAIL（真实来信范句）、
        FTE_DATA（词条例句）、window.Player（🔊 朗读，可选）。 */
(function () {
  "use strict";

  /* 7 个阶段 = 真实外贸流程；id 与 ENTRIES.stage 对应 */
  const STAGES = [
    { id: 1, icon: "🌱", title: "开发客户", en: "Prospecting & first contact" },
    { id: 2, icon: "📨", title: "询盘报价", en: "Inquiry & quotation" },
    { id: 3, icon: "🤝", title: "谈判", en: "Negotiation" },
    { id: 4, icon: "📄", title: "订单与单证", en: "Order & documents" },
    { id: 5, icon: "🏭", title: "生产与催货", en: "Production & chasing" },
    { id: 6, icon: "🚢", title: "出货物流", en: "Shipping & logistics" },
    { id: 7, icon: "💰", title: "收款与售后", en: "Payment & after-sales" }
  ];

  /* 每条：{ stage, src }。src 语法：
       sop:s<阶段>.<步>     —— SOP 流程某个客户动作句（s1..s4）
       sop:chase.<n>        —— SOP 催款话术第 n 句（0 起）
       mail:<threadId>.<n>  —— 真实来信的正确回信范句第 n 句（0 起）
       vocab:U<单元>.<词>    —— 单元词条例句（该词的 ex）
       phrase:U<单元>.<n>    —— 单元短语例句（phrases[n].ex） */
  const ENTRIES = [
    /* ---- 1 开发客户 ---- */
    { stage: 1, src: "vocab:U1.export" },
    { stage: 1, src: "vocab:U1.manufacturer" },
    { stage: 1, src: "vocab:U1.laminating adhesive" },
    { stage: 1, src: "vocab:U2.booth" },
    { stage: 1, src: "vocab:U2.brochure" },
    { stage: 1, src: "vocab:U2.appointment" },
    { stage: 1, src: "vocab:U2.grade" },
    { stage: 1, src: "vocab:U4.enclose" },
    /* ---- 2 询盘报价 ---- */
    { stage: 2, src: "mail:in-enquiry.0" },
    { stage: 2, src: "mail:in-enquiry.1" },
    { stage: 2, src: "mail:in-enquiry.2" },
    { stage: 2, src: "mail:in-enquiry.3" },
    { stage: 2, src: "mail:us-tech.0" },
    { stage: 2, src: "mail:us-tech.1" },
    { stage: 2, src: "mail:us-tech.2" },
    { stage: 2, src: "mail:us-tech.3" },
    /* ---- 3 谈判 ---- */
    { stage: 3, src: "mail:tr-price.0" },
    { stage: 3, src: "mail:tr-price.1" },
    { stage: 3, src: "mail:tr-price.2" },
    { stage: 3, src: "mail:tr-price.3" },
    { stage: 3, src: "mail:tr-price.4" },
    { stage: 3, src: "mail:tr-price.5" },
    { stage: 3, src: "mail:br-payment.0" },
    { stage: 3, src: "mail:br-payment.1" },
    /* ---- 4 订单与单证 ---- */
    { stage: 4, src: "sop:s1.1" },
    { stage: 4, src: "sop:s1.2" },
    { stage: 4, src: "sop:s1.3" },
    { stage: 4, src: "sop:s1.5" },
    { stage: 4, src: "sop:s1.6" },
    { stage: 4, src: "vocab:U12.purchase order" },
    { stage: 4, src: "vocab:U12.order confirmation" },
    { stage: 4, src: "vocab:U12.countersign" },
    /* ---- 5 生产与催货 ---- */
    { stage: 5, src: "mail:ae-chase.0" },
    { stage: 5, src: "mail:ae-chase.1" },
    { stage: 5, src: "mail:ae-chase.2" },
    { stage: 5, src: "mail:ae-chase.3" },
    { stage: 5, src: "mail:cn-draft.0" },
    { stage: 5, src: "mail:cn-draft.1" },
    { stage: 5, src: "mail:cn-draft.2" },
    { stage: 5, src: "mail:cn-draft.3" },
    /* ---- 6 出货物流 ---- */
    { stage: 6, src: "mail:thread-long.0" },
    { stage: 6, src: "mail:thread-long.1" },
    { stage: 6, src: "mail:thread-long.2" },
    { stage: 6, src: "mail:thread-long.3" },
    { stage: 6, src: "mail:thread-long.4" },
    { stage: 6, src: "sop:s3.1" },
    { stage: 6, src: "sop:s3.2" },
    { stage: 6, src: "sop:s3.3" },
    /* ---- 7 收款与售后 ---- */
    { stage: 7, src: "mail:de-claim.0" },
    { stage: 7, src: "mail:de-claim.1" },
    { stage: 7, src: "mail:de-claim.2" },
    { stage: 7, src: "mail:de-claim.3" },
    { stage: 7, src: "mail:de-claim.4" },
    { stage: 7, src: "sop:chase.0" },
    { stage: 7, src: "sop:chase.1" },
    { stage: 7, src: "sop:chase.2" }
  ];

  const state = { stage: 0, q: "" };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function units() {
    try { if (typeof FTE_DATA !== "undefined" && FTE_DATA && FTE_DATA.units) return FTE_DATA.units; } catch (e) { /* 未加载 */ }
    return (window.FTE_DATA && window.FTE_DATA.units) || [];
  }
  function threadById(id) {
    const T = window.FTE_MAIL && window.FTE_MAIL.threads;
    if (!T) return null;
    for (let i = 0; i < T.length; i++) if (T[i].id === id) return T[i];
    return null;
  }
  /* 来源 key → { en, cn, label, module }；解析不到返回 null（渲染时跳过并计数，门禁会红） */
  function resolve(src) {
    const i = String(src || "").indexOf(":");
    if (i < 0) return null;
    const kind = src.slice(0, i), rest = src.slice(i + 1);
    if (kind === "sop") {
      const S = window.SOP && window.SOP._t;
      if (!S) return null;
      if (rest.indexOf("chase.") === 0) {
        const k = Number(rest.slice(6));
        const c = S.CHASE_LINES && S.CHASE_LINES[k];
        if (!c) return null;
        return { en: c.en, cn: c.cn || "", label: "SOP · 催款话术 · 第 " + (k + 1) + " 句", module: "sop.js" };
      }
      const m = rest.match(/^s(\d+)\.(\d+)$/);
      if (!m) return null;
      const st = S.STAGES && S.STAGES[Number(m[1]) - 1];
      if (!st || !st.steps) return null;
      const step = st.steps[Number(m[2]) - 1];
      if (!step) return null;
      return { en: step.en, cn: step.enCn || "", label: "SOP · " + st.t + " · 第 " + m[2] + " 步", module: "sop.js" };
    }
    if (kind === "mail") {
      const m = rest.match(/^([^.]+)\.(\d+)$/);
      if (!m) return null;
      const t = threadById(m[1]);
      if (!t || !t.drill) return null;
      const d = t.drill[Number(m[2])];
      if (!d) return null;
      return { en: d.en, cn: d.cn || "", label: "真实来信 · " + (t.title || t.id) + " · 第 " + (Number(m[2]) + 1) + " 句", module: "data-mail.js" };
    }
    if (kind === "vocab") {
      const m = rest.match(/^U(\d+)\.(.+)$/);
      if (!m) return null;
      const u = units().filter(function (x) { return Number(x.id) === Number(m[1]); })[0];
      if (!u || !u.vocab) return null;
      const v = u.vocab.filter(function (x) { return x.w === m[2]; })[0];
      if (!v) return null;
      return { en: v.ex, cn: v.exCn || "", label: "U" + u.id + " 词汇 · " + v.w, module: "data*.js" };
    }
    if (kind === "phrase") {
      const m = rest.match(/^U(\d+)\.(\d+)$/);
      if (!m) return null;
      const u = units().filter(function (x) { return Number(x.id) === Number(m[1]); })[0];
      if (!u || !u.phrases) return null;
      const p = u.phrases[Number(m[2])];
      if (!p) return null;
      return { en: p.ex, cn: p.exCn || "", label: "U" + u.id + " 短语 · " + p.p, module: "data*.js" };
    }
    return null;
  }
  function computeAll() {
    return ENTRIES.map(function (e) {
      const r = resolve(e.src) || { en: "", cn: "", label: "（来源解析失败）", module: "" };
      return { stage: e.stage, src: e.src, en: r.en, cn: r.cn, label: r.label, module: r.module };
    }).filter(function (e) { return e.en; });
  }
  /* 纯函数：按阶段与关键词过滤（门禁用 _t 直接测） */
  function filterEntries(list, stage, q) {
    const kw = String(q == null ? "" : q).toLowerCase().trim();
    return list.filter(function (e) {
      if (stage && e.stage !== stage) return false;
      if (!kw) return true;
      return String(e.en + " " + e.cn + " " + e.label).toLowerCase().indexOf(kw) !== -1;
    });
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (res) {
      try {
        const ta = document.createElement("textarea");
        ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy");
        ta.parentNode.removeChild(ta);
      } catch (e) { /* 忽略 */ }
      res();
    });
  }
  function toast(m) { if (window.ASRUtil && window.ASRUtil.toast) window.ASRUtil.toast(m); }
  function textOf(list) {
    return list.map(function (e) { return e.en + "\n" + e.cn; }).join("\n\n");
  }

  function rowHtml(e) {
    return '<div class="cs-row" data-src="' + esc(e.src) + '">' +
      '<div class="cs-en">' + esc(e.en) +
      ' <button class="play-btn cs-say" data-action="cs-say" data-text="' + esc(e.en) + '" title="朗读这句">🔊</button></div>' +
      '<div class="cs-cn">' + esc(e.cn) + '</div>' +
      '<div class="cs-src">来源：' + esc(e.label) + '</div>' +
      '</div>';
  }

  function render() {
    const app = document.getElementById("app");
    if (!app) return;
    const all = computeAll();
    const shown = filterEntries(all, state.stage, state.q);
    const chips = [{ id: 0, icon: "📚", title: "全部" }].concat(STAGES).map(function (s) {
      const on = state.stage === s.id;
      return '<button class="chip' + (on ? " active" : "") + '" data-action="cs-stage" data-stage="' + s.id + '">' +
        s.icon + " " + esc(s.title) + '</button>';
    }).join("");

    const sections = STAGES.map(function (s) {
      const list = shown.filter(function (e) { return e.stage === s.id; });
      if (!list.length) return "";
      return '<section class="cs-stage" data-stage="' + s.id + '">' +
        '<div class="cs-stage-h"><b>' + s.icon + " " + esc(s.title) + '</b><span class="cs-stage-en">' + esc(s.en) +
        '</span><button class="btn btn-outline btn-sm" data-action="cs-copy-stage" data-stage="' + s.id + '">复制本阶段</button></div>' +
        list.map(rowHtml).join("") +
        '</section>';
    }).join("");

    app.innerHTML = `
    <div class="page-head cs-head">
      <div class="crumbs"><a href="#/home">首页</a> / 一页纸速查小抄</div>
      <h2>📋 一页纸速查小抄</h2>
      <div class="en">Seven-stage cheat sheet — copy, play, print</div>
      <p class="cs-note">写邮件/打电话时直接抄的整句：<b>7 个阶段 · ${all.length} 句</b>，中英对照、可朗读、可复制、可打印（A4、黑白、按阶段分页）。
        句子全部取自站内既有语料（SOP 客户动作句、真实来信的正确回信范句、词条例句），每条标了来源。
        <b>这是速查小抄，不是练习：不计入打卡、不计成绩、不写任何学习数据。</b></p>
      <div class="cs-toolbar">
        <input id="csQ" class="gsearch" type="search" placeholder="关键词过滤：报价 / 交期 / 提单 / sample…" value="${esc(state.q)}" autocomplete="off">
        <button class="btn btn-outline btn-sm" data-action="cs-copy-all">复制全部</button>
        <button class="btn btn-primary btn-sm" data-action="cs-print">🖨 打印 / 存 PDF</button>
      </div>
      <div class="chip-row cs-chips">${chips}</div>
    </div>
    ${sections || '<div class="empty"><div class="e-icon">📭</div>没有匹配的句子。换个关键词，或点「全部」。</div>'}
    <p class="cs-foot">入口：实操 SOP 页顶部「📋 一页纸小抄」。打印建议 A4 纵向、默认边距；每阶段自动分页。</p>`;

    const input = document.getElementById("csQ");
    if (input) input.addEventListener("input", function (e) {
      state.q = e.target.value || "";
      const pos = state.q.length;
      render();
      const el = document.getElementById("csQ");
      if (el && el.focus) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (err) { /* 老浏览器 */ } }
    });
  }

  function onClick(e) {
    const el = e.target.closest ? e.target.closest("[data-action]") : null;
    if (!el) return;
    const act = el.getAttribute("data-action");
    if (act === "cs-stage") { state.stage = Number(el.getAttribute("data-stage")) || 0; render(); }
    else if (act === "cs-say") { if (window.Player && el.getAttribute("data-text")) window.Player.speak(el.getAttribute("data-text"), { rate: 0.9 }); }
    else if (act === "cs-copy-all") { copyText(textOf(computeAll())).then(function () { toast("✅ 已复制全部句子（中英对照）"); }); }
    else if (act === "cs-print") {
      /* 打印要的是「整张小抄」：先把筛选清掉再调打印，避免只印出当前筛选结果。 */
      state.stage = 0; state.q = "";
      render();
      setTimeout(function () { window.print(); }, 60);
    }
    else if (act === "cs-copy-stage") {
      const st = Number(el.getAttribute("data-stage"));
      const list = filterEntries(computeAll(), st, "");
      copyText(textOf(list)).then(function () { toast("✅ 已复制「" + (STAGES[st - 1] ? STAGES[st - 1].title : "") + "」阶段 " + list.length + " 句"); });
    }
  }

  try { document.addEventListener("click", onClick); } catch (e) { /* 老环境忽略 */ }

  window.Cheatsheet = {
    render: render,
    _t: { STAGES: STAGES, ENTRIES: ENTRIES, resolve: resolve, computeAll: computeAll, filterEntries: filterEntries, textOf: textOf, esc: esc }
  };
})();
