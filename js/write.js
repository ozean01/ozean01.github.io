/* ============ 写作专区 · 邮件场景（WriteStudio）============
   把"写作产出"从测验升级为独立专区：给一段中文业务场景 → 你用英文写一封邮件/段落 →
   离线用本单元关键表达做「要点自查」；配了 AI 陪练模型后可一键 AI 批改（更地道版本 + 为什么）。
   作品可保存到 localStorage（fte-writes）并回顾。
   依赖：window.TutorEnv（esc/toast/Player）、window.Tutor（hasConfig/callChat，可选）、
         window.FTE_DATA（读取单元词/短语做关键表达）。独立模块，零构建。 */
(function () {
  "use strict";

  const E = function () { return window.TutorEnv || {}; };
  const esc = function (s) { return String(s == null ? "" : s); };
  const toast = function (m) { if (E().toast) E().toast(m); };
  const KEY = "fte-writes-v1";

  /* 场景库：id / 标题 / 中文业务情境 / 关联单元（取关键词做要点自查） */
  const SCENARIOS = [
    { id: "cold", icon: "🌱", title: "开发信 · 第一次联系", unitIds: [2, 4], ctx: "你是一家软包装复合膜厂的业务员，第一次给欧洲一位潜在客户写英文邮件：介绍贵司专注食品软包装复合膜，请对方查看附件产品目录，促成一次报价或寄样。" },
    { id: "quote", icon: "💰", title: "回复询盘 · 报价", unitIds: [3], ctx: "客户来邮件询问某款复合袋的价格。你要回复：感谢询盘、给出报价（FOB 价、MOQ、交期）、索取进一步资料，并礼貌促单。" },
    { id: "remind", icon: "⏰", title: "催款 · 逾期提醒", unitIds: [6, 15], ctx: "一批货已按约定质量交付，但尾款已逾期 15 天。写一封礼貌但明确的英文催款邮件，附未结金额与付款方式，并表达保持良好合作的意愿。" },
    { id: "complaint", icon: "🛡️", title: "售后客诉 · 复合膜脱层", unitIds: [9, 11], ctx: "客户反馈一批复合膜出现脱层（delamination）。写一封专业英文回复：先致歉、表达重视，请对方提供批次与小样，说明会立即调查并给出整改方案。" },
    { id: "ship", icon: "🚢", title: "装运通知", unitIds: [7, 12], ctx: "货已装船，写英文邮件通知客户：船名航次、开航日、预计到港（ETA）、提单号，并告知随附的单证已按约定寄出。" },
    { id: "rewrite", icon: "✍️", title: "邮件改写 · 中文意思→英文", unitIds: [4], ctx: "把下面的中文意思改写成一封正式、简洁的英文商务邮件：'我们收到了您的样品，测试结果很好，可以开始谈合作。请确认您的年采购量，我们好给您更优惠的价格。'" }
  ];

  /* 从关联单元取关键表达（词 + 短语），做离线「要点自查」 */
  function DATA() { return (typeof FTE_DATA !== "undefined") ? FTE_DATA : { units: [] }; }
  function keyPhrases(unitIds) {
    const out = [];
    (DATA().units || []).forEach(function (u) {
      if (unitIds.indexOf(u.id) === -1) return;
      (u.vocab || []).forEach(function (v) { out.push({ t: v.w, cn: v.cn }); });
      (u.phrases || []).forEach(function (p) { out.push({ t: p.p, cn: p.cn }); });
    });
    return out;
  }
  function findUnit(unitIds) {
    return (DATA().units || []).filter(function (u) { return unitIds.indexOf(u.id) !== -1; });
  }

  function savedWorks() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function saveWorks(a) { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 100))); } catch (e) { /* ignore */ } }

  /* 离线要点自查：看用户的英文里用到了哪些关键表达 */
  function checkKeywords(text, kw) {
    const low = String(text).toLowerCase();
    return kw.map(function (k) {
      const t = String(k.t).toLowerCase();
      const hit = t.split(/\s+/).every(function (w) { return low.indexOf(w) !== -1; });
      return { t: k.t, cn: k.cn, hit: hit };
    });
  }

  function wc(text) { return String(text).trim().split(/\s+/).filter(Boolean).length; }

  function goalBanner() {
    if (!(window.CoachBridge && window.CoachBridge.text)) return "";
    return '<div class="goal-banner">🎯 ' + window.CoachBridge.text() + '</div>';
  }

  /* 渲染主界面 */
  function render() {
    const app = document.getElementById("app");
    if (!app) return;
    const state = readState();
    if (!state.scen) {
      app.innerHTML = scenListHtml();
      return;
    }
    app.innerHTML = scenEditorHtml(state);
    writeState(state);
  }

  function readState() {
    try { return JSON.parse(sessionStorage.getItem("fte-write-state")) || {}; } catch (e) { return {}; }
  }
  function writeState(s) { try { sessionStorage.setItem("fte-write-state", JSON.stringify(s)); } catch (e) { /* ignore */ } }
  function clearState() { try { sessionStorage.removeItem("fte-write-state"); } catch (e) { /* ignore */ } }

  function scenListHtml() {
    const works = savedWorks();
    const chips = SCENARIOS.map(function (s) {
      return '<button class="scen-chip" data-action="ws-pick" data-id="' + s.id + '">' + s.icon + ' ' + esc(s.title) + '</button>';
    }).join("");
    return `
    <div class="page-head"><h2>✍️ 写作专区 <span class="en">选场景 → 写英文 → 要点自查 / AI 批改 → 保存作品</span></h2></div>
    ${goalBanner()}
    <div class="card" style="margin-top:18px">
      <b style="font-size:13px;color:var(--muted)">选择一个业务场景（每个场景都已给出中文情境）</b>
      <div class="scen-grid" style="margin-top:10px">${chips}</div>
      <div class="field-note" style="margin-top:10px">离线也能写：提交后自动按该单元的关键表达做「要点自查」（你用了哪些、漏了哪些）；配了 AI 陪练模型后还可一键 AI 批改、给出更地道版本。</div>
    </div>
    ${works.length ? `
    <div class="card" style="margin-top:16px">
      <div class="chat-head"><span>📂 我的作品（${works.length}）</span></div>
      ${works.map(function (w, i) {
        return '<div class="wb-item"><span class="wb-e" style="flex:1">' + esc((w.title || "")) + ' · ' + w.wc + " 词 · " + esc(String(new Date(w.t).toLocaleDateString())) + '</span>' +
          '<button class="play-btn" data-action="ws-load" data-i="' + i + '" title="回顾">📖</button>' +
          '<button class="learn-toggle" data-action="ws-del" data-i="' + i + '" title="删除">✕</button></div>';
      }).join("")}
    </div>` : ""}`;
  }

  function scenEditorHtml(s) {
    const sc = SCENARIOS.find(function (x) { return x.id === s.scen; }) || SCENARIOS[0];
    const kw = keyPhrases(sc.unitIds);
    let feed = "";
    if (s.checked) {
      const res = checkKeywords(s.text, kw);
      const used = res.filter(function (r) { return r.hit; });
      const miss = res.filter(function (r) { return !r.hit; });
      const good = used.filter(function (r) { return r.hit; }).length;
      const rate = res.length ? Math.round(used.length / res.length * 100) : 0;
      const usedHtml = used.map(function (r) { return '<span class="kw-hit">✓ ' + esc(r.t) + '（' + esc(r.cn) + '）</span>'; }).join("");
      const missHtml = miss.slice(0, 12).map(function (r) { return '<span class="kw-miss">· ' + esc(r.t) + '（' + esc(r.cn) + '）</span>'; }).join(" ");
      feed =
        '<div class="ws-feed"><div style="font-weight:700;color:' + (rate >= 60 ? "var(--ok)" : "var(--bad)") + '">要点自查：覆盖 ' + rate + '%（' + used.length + '/' + res.length + '）</div>' +
        (usedHtml ? '<div style="margin-top:6px">' + usedHtml + '</div>' : "") +
        (miss.length ? '<div style="margin-top:6px;color:var(--muted)">可再点到的表达：' + missHtml + '</div>' : "") +
        '<div id="wsAi" class="qa-ai" hidden></div>' +
        (window.Tutor && window.Tutor.hasConfig() ? '<button class="btn btn-outline btn-sm" data-action="ws-ai" style="margin-top:10px">🤖 AI 批改（更地道）+</button>' : "") +
        '</div>';
    }
    const unitLinks = findUnit(sc.unitIds).map(function (u) { return '<a class="ps-chip" href="#/unit/' + u.id + '">' + esc(u.icon) + ' ' + esc(u.title) + '</a>'; }).join("");
    return `
    <div class="page-head"><h2>✍️ ${sc.icon} ${esc(sc.title)}</h2>
      <div class="en"><button class="btn btn-outline btn-sm" data-action="ws-back">← 换场景</button></div></div>
    ${goalBanner()}
    <div class="card" style="margin-top:16px">
      <div class="chat-head"><span>📋 中文情境</span></div>
      <div class="dlg-line" style="margin-top:8px"><div class="cn">${esc(sc.ctx)}</div></div>
      ${unitLinks ? '<div class="field-note" style="margin-top:8px">配套单元：' + unitLinks + '</div>' : ""}
      <textarea id="wsText" class="write-input" rows="7" placeholder="用英文写这封邮件 / 这段话…" autofocus>${esc(s.text || "")}</textarea>
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" data-action="ws-submit">✅ 要点自查</button>
        <button class="btn btn-soft btn-sm" data-action="ws-save">💾 保存作品</button>
        <span class="sop-hint" id="wsWc">${wc(s.text || "")} 词</span>
      </div>
      ${feed}
    </div>`;
  }

  /* ---------------- 交互 ---------------- */
  if (typeof document !== "undefined") document.addEventListener("click", function (e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const act = el.getAttribute("data-action");
    if (act.indexOf("ws-") !== 0) return;
    const s = readState();
    if (act === "ws-pick") { s.scen = el.getAttribute("data-id"); s.text = ""; s.checked = false; writeState(s); render(); return; }
    if (act === "ws-back") { clearState(); render(); return; }
    if (act === "ws-submit") {
      const t = document.getElementById("wsText");
      if (t) s.text = t.value;
      if (!s.text.trim()) { toast("请先写一段英文再自查"); return; }
      s.checked = true; writeState(s); render(); return;
    }
    if (act === "ws-save") {
      const t = document.getElementById("wsText");
      if (t) s.text = t.value;
      if (!s.text.trim()) { toast("先写一点内容再保存"); return; }
      const a = savedWorks();
      const sc = SCENARIOS.find(function (x) { return x.id === s.scen; }) || SCENARIOS[0];
      a.unshift({ t: Date.now(), scen: s.scen, title: sc.title, text: s.text, wc: wc(s.text) });
      saveWorks(a);
      toast("💾 已保存到作品集");
      if (window.CoachBridge && window.CoachBridge.done) window.CoachBridge.done("write");   // 计入今日任务 + 连续打卡
      render();
      return;
    }
    if (act === "ws-load") { const w = savedWorks()[parseInt(el.getAttribute("data-i"), 10)]; if (w) { s.scen = w.scen; s.text = w.text; s.checked = false; writeState(s); render(); } return; }
    if (act === "ws-del") { const a = savedWorks(); a.splice(parseInt(el.getAttribute("data-i"), 10), 1); saveWorks(a); render(); return; }
    if (act === "ws-ai") writeAi(s);
  });

  function writeAi(s) {
    const sc = SCENARIOS.find(function (x) { return x.id === s.scen; }) || SCENARIOS[0];
    const out = document.getElementById("wsAi");
    if (!out) return;
    if (!(window.Tutor && window.Tutor.hasConfig())) { toast("请先到「AI 陪练」填好模型 Key。"); return; }
    const kw = keyPhrases(sc.unitIds).map(function (r) { return r.t; }).slice(0, 20);
    out.hidden = false; out.innerHTML = '<p class="field-note">🤖 正在请 AI 批改…（需联网）</p>';
    const sys = "你是资深软包装外贸英语教练。请用中文给出：1) 内容是否贴合「" + sc.title + "」场景、语气是否专业；2) 语法/用词哪里不对或不够地道；3) 一封更专业自然的英文版本；4) 一句总结建议。目标词参考：" + kw.join(" / ") + "。请简洁、专业。";
    const user = "场景：\n" + sc.ctx + "\n\n用户写的英文：\n" + (s.text || "") + "\n\n请批改。";
    window.Tutor.callChat([{ role: "system", content: sys }, { role: "user", content: user }]).then(function (txt) {
      out.innerHTML = '<div class="qa-ai-in">🤖 <b>AI 批改</b><div style="margin-top:6px">' + nl2br(txt) + '</div></div>';
    }).catch(function (e) { out.innerHTML = '<p class="sop-warn">AI 批改失败：' + esc(e && e.message ? e.message : "检查 Key / 网络") + '</p>'; });
  }

  function nl2br(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>"); }

  window.WriteStudio = { render: render };
})();
