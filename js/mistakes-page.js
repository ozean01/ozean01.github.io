/* ============ ⚠️ 高频易错点 · 页面模块（app.js 拆分试点，A4）============
   由来（性能批次 A / docs/perf-baseline.md 施工图）：app.js 5.6k 行单体的第一个
   真实拆分试点——选「易错点页」是因为依赖面最浅（esc / State / toast / renderRoute /
   Player / FTE_MISTAKES），却完整覆盖拆分路径的全部机制：
     ① init(ctx) 依赖注入（State 按引用共享，esc/toast 借用 app.js 闭包实现）；
     ② 路由分支委托（app.js 的 renderRoute 改调 window.MistakesPage.render()）；
     ③ 事件委托移交（app.js 大 switch 的 mistake-* 四个 case 迁入本模块 action()）。
   后续 app.js 拆分（五阶段闯关等）沿用同一模式，不再另行设计。

   数据：window.FTE_MISTAKES（js/data-mistakes.js，人工核对语料）。
   本页无持久化——揭晓状态在 State（会话内），刷新即回「先想一下」状态，是刻意设计。 */
(function () {
  "use strict";

  let State = null, esc = function (s) { return String(s == null ? "" : s); }, toast = function () {}, renderRoute = function () {}, appEl = null;

  function init(ctx) {
    if (!ctx) return;
    State = ctx.State;
    esc = ctx.esc || esc;
    toast = ctx.toast || toast;
    renderRoute = ctx.renderRoute || renderRoute;
    appEl = ctx.app || null;
  }

  /* 单项揭晓的 key：组 id + 错误句。两者在数据里唯一，且不随"流程/语法点"筛选变化，
     所以筛选切换后同一条仍能保持自己的揭晓状态。 */
  function mistKey(g, m) { return g.id + "#" + m.wrong; }
  function mistItemRevealed(g, m) {
    return !!(State.mistRevealAll || (State.mistRevealed && State.mistRevealed[mistKey(g, m)]));
  }

  function renderMistakes() {
    const app = appEl || document.getElementById("app");
    const MK = window.FTE_MISTAKES;
    if (!MK || !MK.groups || !MK.groups.length) {
      app.innerHTML = '<div class="page-head"><h2>⚠️ 易错点</h2></div><div class="empty"><div class="e-icon">📭</div>易错点库尚未就绪。</div>';
      return;
    }
    const flows = MK.flows || [];
    const grammars = MK.grammars || [];
    const activeFlow = State.mistFlow || "all";
    const activeGrammar = State.mistGrammar || "all";

    const flowTabs = [
      '<button class="chip ' + (activeFlow === "all" ? "active" : "") + '" data-action="mistake-flow" data-flow="all" aria-pressed="' + (activeFlow === "all" ? "true" : "false") + '">全部流程</button>'
    ].concat(flows.map(function (f) {
      return '<button class="chip ' + (activeFlow === f.id ? "active" : "") + '" data-action="mistake-flow" data-flow="' + f.id + '" aria-pressed="' + (activeFlow === f.id ? "true" : "false") + '">' + esc(f.label) + '</button>';
    })).join("");

    /* 「按语法知识点」二级索引：跟随当前流程，标出这个维度下有哪些语法点（对应《英语常见问题
       解答大词典》那本书的"按语法/按试题多目录索引"思路），点击二级筛选合并到同级过滤。 */
    const grammarTabs = [
      '<button class="chip ' + (activeGrammar === "all" ? "active" : "") + '" data-action="mistake-grammar" data-grammar="all" aria-pressed="' + (activeGrammar === "all" ? "true" : "false") + '">全部语法点</button>'
    ].concat(grammars.map(function (g) {
      const count = MK.groups.reduce(function (n, gr) {
        return n + (activeFlow === "all" || gr.flow === activeFlow
          ? gr.items.filter(function (m) { return m.grammar === g.id; }).length : 0);
      }, 0);
      if (!count) return "";
      return '<button class="chip ' + (activeGrammar === g.id ? "active" : "") + '" data-action="mistake-grammar" data-grammar="' + g.id + '" aria-pressed="' + (activeGrammar === g.id ? "true" : "false") + '">' + esc(g.label) + ' · ' + count + '</button>';
    })).filter(Boolean).join("");

    const groups = MK.groups.filter(function (g) {
      if (activeFlow !== "all" && g.flow !== activeFlow) return false;
      return true;
    }).map(function (g) {
      /* 保留全组，但按语法点过滤其条目；筛后若无条目且显式选了语法点则整组隐藏 */
      const items = g.items.filter(function (m) { return activeGrammar === "all" || m.grammar === activeGrammar; });
      return { g: g, items: items };
    }).filter(function (x) { return activeGrammar === "all" || x.items.length; });

    /* 顶部按钮的文案依据「当前筛选结果里是否每条都已揭晓」。不这样算的话，按钮会写着
       "隐藏全部"却只影响部分条目，或写着"显示全部"实际只揭晓几条——文字与行为不符。 */
    const allRevealed = groups.length > 0 && groups.every(function (x) {
      return x.items.every(function (m) { return mistItemRevealed(x.g, m); });
    });

    const groupHtml = groups.map(function (x) {
      const g = x.g;
      const items = x.items.map(function (m, i) {
        return `
        <div class="mistake-card" style="margin-top:12px">
          <div class="mk-wrong">❌ <span>${esc(m.wrong)}</span>
            <button class="play-btn" data-action="mistake-speak" data-text="${esc(m.wrong)}" title="朗读错误版（感受为什么别扭）">🔊</button>
          </div>
          <div class="mk-right">
            ${mistItemRevealed(g, m)
              ? '✅ <span>' + esc(m.right) + '</span><button class="play-btn" data-action="mistake-speak" data-text="' + esc(m.right) + '" title="朗读正确版">🔊</button>'
              : '<button type="button" class="linklike mk-hidden" data-action="mistake-reveal" data-mk="' + esc(mistKey(g, m)) + '" aria-pressed="false" title="点击只揭晓这一条的正确答案">（先想一下，再点揭晓）</button>'}
          </div>
          <div class="mk-why">💡 <b>为什么：</b>${esc(m.why)}</div>
          <div class="mk-ex">📖 行业例句：<span>${esc(m.ex)}</span>
            <button class="play-btn" data-action="mistake-speak" data-text="${esc(m.ex)}" title="朗读例句">🔊</button>
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
            <span class="badge badge-muted">${esc(flowLabel(flows, g.flow))} · ${x.items.length} 条</span>
            ${activeGrammar !== "all" ? '<span class="badge" style="background:var(--accent);color:#fff">语法：' + esc(grammarLabel(grammars, activeGrammar)) + '</span>' : ""}
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
      <div class="chip-row" style="margin-top:8px;border-top:1px dashed var(--line,#e2e8f0);padding-top:8px">
        <span class="mistake-dim">📐 按语法知识点（二级索引）：</span>${grammarTabs}
      </div>
      <button class="btn btn-outline btn-sm" data-action="mistake-reveal" aria-pressed="${allRevealed ? "true" : "false"}" title="一次切换全部条目的答案显示">${allRevealed ? "🙈 隐藏全部正确答案" : "👁 显示全部正确答案"}</button>
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
  function grammarLabel(grammars, id) {
    const hit = grammars.find(function (g) { return g.id === id; });
    return hit ? hit.label : id;
  }

  /* mistake-* 四个动作：从 app.js 大 switch 迁入（app.js 侧保留一行委托） */
  function action(act, el) {
    if (act === "mistake-speak") {
      const mt = el.getAttribute("data-text");
      if (mt && window.Player) window.Player.speak(mt, { rate: 1 });
      return;
    }
    if (act === "mistake-reveal") {
      const mk = el.getAttribute("data-mk");
      if (!State.mistRevealed) State.mistRevealed = {};
      if (mk) {
        /* 单卡按钮：只切自己那一条。全部揭晓时卡片渲染的是 ✅、压根没有单卡按钮
           （见 mistItemRevealed 分支），所以这里不必考虑 mistRevealAll。 */
        if (State.mistRevealed[mk]) delete State.mistRevealed[mk];
        else State.mistRevealed[mk] = true;
        renderRoute();
      } else {
        /* 顶部按钮：它的 aria-pressed 由渲染时算出的 allRevealed 写入，这里直接据它取反，
           比在 DOM 上重新数一遍更准——全部揭晓时单卡按钮会被 ✅ 替换掉、根本数不到。 */
        const on = el.getAttribute("aria-pressed") === "true";
        State.mistRevealAll = !on;
        State.mistRevealed = {};
        renderRoute();
        toast(State.mistRevealAll ? "👁 已显示全部正确答案" : "🙈 已隐藏全部正确答案，先自己想再揭晓");
      }
      return;
    }
    if (act === "mistake-flow") {
      State.mistFlow = el.getAttribute("data-flow") || "all";
      renderRoute();
      return;
    }
    if (act === "mistake-grammar") {
      State.mistGrammar = el.getAttribute("data-grammar") || "all";
      renderRoute();
    }
  }

  window.MistakesPage = { init: init, render: renderMistakes, action: action };
})();
