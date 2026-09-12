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

  /* ---------------- 真实业务语料（js/data-mail.js）----------------
     与上面的 SCENARIOS 互补，两者不是一回事：
       SCENARIOS        = 「给你一个中文情境，你来写英文」——纯产出任务
       FTE_MAIL.threads = 「给你一封真实来信，你来读懂并回信」——输入 + 产出
     后者的价值在于**输入不是为教学编的**：缩写满天飞、时态乱、信息全塞在一段、
     re: 线程里关键信息还不在最新一封。这些恰恰是学员每天真正面对、而站内
     768 词 / 28 段对话（全是教科书英文）训练不到的东西。
     刻意**不新增导航、不新增路由**：整个语料挂在写作专区里，
     因为真实工作流本来就是「读到一封 → 回一封」。 */
  function MAIL() { return (window.FTE_MAIL && window.FTE_MAIL.threads) || []; }
  function findThread(id) {
    const a = MAIL();
    for (let i = 0; i < a.length; i++) { if (a[i].id === id) return a[i]; }
    return null;
  }

  /* 当前任务的「关键表达」：
       场景写作 → 取关联单元的词汇与短语（原有行为）
       真实来信 → 取这封信**明确要求你回答的那几件事**（points） */
  function currentKw(s) {
    if (s && s.mail) { const th = findThread(s.mail); return (th && th.points) || []; }
    const sc = SCENARIOS.find(function (x) { return x.id === (s && s.scen); }) || SCENARIOS[0];
    return keyPhrases(sc.unitIds);
  }
  function currentTitle(s) {
    if (s && s.mail) { const th = findThread(s.mail); return th ? th.title : ""; }
    const sc = SCENARIOS.find(function (x) { return x.id === (s && s.scen); }) || SCENARIOS[0];
    return sc.title;
  }
  function currentCtx(s) {
    if (s && s.mail) {
      const th = findThread(s.mail);
      return th ? (th.task + "\n\n（原始来信主题：" + th.subject + "）") : "";
    }
    const sc = SCENARIOS.find(function (x) { return x.id === (s && s.scen); }) || SCENARIOS[0];
    return sc.ctx;
  }

  /* write.js 既有的 esc 是**恒等函数**（只做 String 转换，不转义字符）——历史遗留。
     真实来信里有 > 引用层级与 & 等字符，这里单独给一份**真转义**版本，
     不去改既有的 esc，以免影响已上线页面的渲染结果。 */
  function escM(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/\n/g, "<br>");
  }
  /* 同上的转义，但**保留换行**——<textarea> 的预填值不能出现 <br>，
     否则用户回来看见的就是字面的「&lt;br&gt;」而不是换行。 */
  function escTA(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function savedWorks() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function saveWorks(a) { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 100))); } catch (e) { /* ignore */ } }

  /* 离线要点自查：看用户的英文里用到了哪些关键表达。
     ⚠️ 修一处既有缺陷：原先对原文与短语都不去标点，导致**带标点的短语永远匹配不上**——
        例如 U4 的 "Please find attached..."，按 \s+ 切分后末尾那个词是 "attached..."，
        用它在原文里做子串查找必然失败。于是「要点覆盖」长期偏低、失真，
        而二稿闭环的对比正是建立在这个覆盖度上，所以必须先把度量修正。
     改法：两侧统一去掉标点后再比。仍保留子串匹配语义（允许 clients/client 这类形态差异）。 */
  function normKw(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  function checkKeywords(text, kw) {
    const low = normKw(text);
    return kw.map(function (k) {
      const t = normKw(k.t);
      const hit = t.split(" ").filter(Boolean).every(function (w) { return low.indexOf(w) !== -1; });
      return { t: k.t, cn: k.cn, hit: hit };
    });
  }

  function wc(text) { return String(text).trim().split(/\s+/).filter(Boolean).length; }

  /* ---------------- 反馈二稿闭环（uptake）----------------
     由来（SLA 专家评审，称其为「全站最大学理缺口」）：
       站内 AI 批改完就结束了，**没有强制二稿**。而反馈必须经过
       「注意（noticing）+ 修改性输出（modified output）」才真正产生习得——
       只读一遍批改意见，学不到东西。
     故在要点自查 / AI 批改之后，把「写第二稿」作为默认的下一步，并给出前后对比。
     对比不评价文采，只看两件可验证的事：**要点覆盖有没有提升**、**词数怎么变**。 */
  function compareDrafts(d1, d2, kw) {
    const r1 = checkKeywords(d1 || "", kw || []);
    const r2 = checkKeywords(d2 || "", kw || []);
    const h1 = r1.filter(function (x) { return x.hit; }).map(function (x) { return x.t; });
    const h2 = r2.filter(function (x) { return x.hit; }).map(function (x) { return x.t; });
    return {
      wc1: wc(d1 || ""), wc2: wc(d2 || ""),
      rate1: r1.length ? Math.round(h1.length / r1.length * 100) : 0,
      rate2: r2.length ? Math.round(h2.length / r2.length * 100) : 0,
      added: h2.filter(function (t) { return h1.indexOf(t) === -1; }),
      lost: h1.filter(function (t) { return h2.indexOf(t) === -1; }),
      stillMissing: r2.filter(function (x) { return !x.hit; }).map(function (x) { return x.t; }),
      total: r1.length
    };
  }

  function compareHtml(c) {
    const dRate = c.rate2 - c.rate1, dWc = c.wc2 - c.wc1;
    const chips = function (arr, cls) {
      return arr.map(function (t) { return '<span class="' + cls + '">' + esc(t) + "</span>"; }).join("");
    };
    const verdict = c.rate2 > c.rate1
      ? (c.added.length ? "✅ 覆盖提升了，新用上 " + c.added.length + " 个关键表达。" : "✅ 要点更完整了。")
      : (c.rate2 === c.rate1
        ? "覆盖持平——重点看有没有把 AI 指出的语法/用词问题真正改掉。"
        : "覆盖下降了，检查是不是删掉了本来必要的表达。");
    return `
    <div class="ws-cmp">
      <div class="ws-cmp-head">📊 一稿 → 二稿</div>
      <div class="ws-cmp-row"><span>词数</span><b>${c.wc1} → ${c.wc2}</b>
        <em class="${dWc >= 0 ? "ok" : "warn"}">${dWc >= 0 ? "+" : ""}${dWc}</em></div>
      <div class="ws-cmp-row"><span>要点覆盖</span><b>${c.rate1}% → ${c.rate2}%</b>
        <em class="${dRate >= 0 ? "ok" : "warn"}">${dRate >= 0 ? "+" : ""}${dRate}</em></div>
      ${c.added.length ? '<div class="ws-cmp-sec"><b>✅ 二稿新用上的</b><div>' + chips(c.added, "kw-hit") + "</div></div>" : ""}
      ${c.lost.length ? '<div class="ws-cmp-sec"><b>⚠️ 二稿里没保留</b><div>' + chips(c.lost, "kw-miss") + "</div></div>" : ""}
      ${c.stillMissing.length ? '<div class="ws-cmp-sec"><b>仍未用到</b><div>' + chips(c.stillMissing.slice(0, 8), "kw-miss") + "</div></div>" : ""}
      <div class="ws-cmp-note">${verdict}</div>
    </div>`;
  }

  /* 第二稿区块：默认用一稿预填——让用户「改」而不是从空白「重写」，
     这才是修改性输出（modified output），也是习得真正发生的地方。 */
  function draft2Html(s, kw) {
    const d2 = (s.draft2 != null) ? s.draft2 : (s.text || "");
    const cmp = s.d2done ? compareDrafts(s.text, d2, kw) : null;
    return `
    <div class="ws-d2">
      <div class="ws-d2-head">
        <b>✍️ 第二步：写第二稿</b>
        <span>反馈只有转化成自己的修改才算学会。照着上面提出的问题改一遍，再看前后对比。</span>
      </div>
      <textarea id="wsDraft2" class="write-input" rows="7" placeholder="照着反馈改一遍…">${esc(d2)}</textarea>
      <div class="ws-d2-ops">
        <button class="btn btn-primary btn-sm" data-action="ws-d2-done">✓ 完成二稿 · 看对比</button>
        <button class="btn btn-soft btn-sm" data-action="ws-d2-reset">↺ 从一稿重新改</button>
        <span class="sop-hint" id="wsD2Wc">${wc(d2)} 词</span>
      </div>
      ${cmp ? compareHtml(cmp) : ""}
    </div>`;
  }

  function goalBanner() {
    if (!(window.CoachBridge && window.CoachBridge.text)) return "";
    return '<div class="goal-banner">🎯 ' + window.CoachBridge.text() + '</div>';
  }

  /* 渲染主界面 */
  function render() {
    const app = document.getElementById("app");
    if (!app) return;
    const state = readState();
    /* 真实来信优先：s.mail 与 s.scen 互斥（切换时互相清空） */
    if (state.mail) {
      const th = findThread(state.mail);
      if (th) { app.innerHTML = mailReaderHtml(state, th); writeState(state); return; }
      state.mail = null;   /* 语料被删掉/改 id 时不致于白屏，退回列表 */
    }
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

  /* ---------------- 📨 真实来信：入口与阅读页 ---------------- */
  function mailListHtml() {
    const th = MAIL();
    if (!th.length) return "";
    const chips = th.map(function (t) {
      return '<button class="scen-chip mail-chip" data-action="ws-mail" data-id="' + t.id + '">' +
        t.icon + " " + escM(t.title) + "</button>";
    }).join("");
    return `
    <div class="card" style="margin-top:16px">
      <div class="chat-head"><span>📨 真实来信（读懂真客户怎么写 → 回一封）</span></div>
      <div class="field-note" style="margin-top:8px">
        上面 6 个场景是「给你中文，你来写英文」；这里是反过来——<b>给你一封真的会收到的信</b>。
        站内的例句和对话都是为教学写的：语法正确、句子完整、信息清楚。真实客户的信不长这样。
        这 ${th.length} 封来自真实业务场景的信，练的是<b>读懂 + 回得像人话</b>：每封都有<b>逐句注释</b>、
        <b>「这封信的坑」</b>（会因此报错价、答非所问的地方）和一组<b>开口练的模板句</b>。
      </div>
      <div class="scen-grid" style="margin-top:10px">${chips}</div>
    </div>`;
  }

  function mailReaderHtml(s, th) {
    const kw = currentKw(s);
    const bodyHtml = (th.body || []).map(function (b) {
      if (b.k === "h") return '<div class="mail-h">' + escM(b.s) + "</div>";
      if (b.k === "q") return '<blockquote class="mail-q">' + escM(b.s) + "</blockquote>";
      return '<p class="mail-p">' + escM(b.s) + "</p>";
    }).join("");
    const glossHtml = (th.gloss || []).map(function (g) {
      return '<div class="mail-gloss"><div class="mail-gloss-t">' + escM(g.t) + "</div>" +
        '<div class="mail-gloss-cn">' + escM(g.cn) + "</div>" +
        (g.fix ? '<div class="mail-gloss-fix">✍️ 更地道：' + escM(g.fix) + "</div>" : "") +
        "</div>";
    }).join("");
    const trapsHtml = (th.traps || []).map(function (t, i) {
      return '<div class="mail-trap"><b>⚠️ ' + (i + 1) + " · " + escM(t.t) + "</b><p>" + escM(t.cn) + "</p></div>";
    }).join("");
    const drillHtml = (th.drill || []).map(function (d, i) {
      return '<div class="mail-drill"><div class="md-en">' + escM(d.en) + "</div>" +
        '<div class="md-cn">' + escM(d.cn) + "</div>" +
        '<button class="play-btn" data-action="ws-mail-say" data-i="' + i + '" title="朗读这句">🔊</button></div>';
    }).join("");
    const unitLinks = findUnit(th.unitIds || []).map(function (u) {
      return '<a class="ps-chip" href="#/unit/' + u.id + '">' + esc(u.icon) + " " + esc(u.title) + "</a>";
    }).join("");
    return `
    <div class="page-head"><h2>📨 ${th.icon} ${escM(th.title)}</h2>
      <div class="en"><button class="btn btn-outline btn-sm" data-action="ws-back">← 换一封</button></div></div>
    ${goalBanner()}
    <div class="card mail-card" style="margin-top:16px">
      <div class="mail-meta">
        <span class="mail-tag">${escM(th.tag)}</span>
        <span class="mail-who">${escM(th.who)}</span>
      </div>
      <div class="mail-subject">Subject: ${escM(th.subject)}</div>
      <div class="mail-body">${bodyHtml}</div>
      <div class="field-note" style="margin-top:10px">
        配套单元：${unitLinks || "—"}
        <button class="btn btn-soft btn-sm" data-action="ws-mail-flash" style="margin-left:8px">🃏 这封信里的实词进单词卡</button>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="chat-head"><span>🔍 逐句注释（${(th.gloss || []).length} 条）</span></div>
      <div class="mail-glosses">${glossHtml}</div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="chat-head"><span>⚠️ 这封信的坑（${(th.traps || []).length} 条）</span></div>
      <div class="mail-traps">${trapsHtml}</div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="chat-head"><span>🎤 先开口：这几个句子可以直接用</span>
        <button class="btn btn-outline btn-sm" data-action="ws-mail-drill">🏁 全部送进五阶段闯关</button></div>
      <div class="mail-drills">${drillHtml}</div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="chat-head"><span>✍️ 现在回这封信</span></div>
      <div class="dlg-line" style="margin-top:8px"><div class="cn">${escM(th.task)}</div></div>
      <textarea id="wsText" class="write-input" rows="8" placeholder="用英文回这封信…">${escTA(s.text || "")}</textarea>
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" data-action="ws-submit">✅ 要点自查</button>
        <button class="btn btn-soft btn-sm" data-action="ws-save">💾 保存作品</button>
        <span class="sop-hint" id="wsWc">${wc(s.text || "")} 词</span>
      </div>
      ${feedbackHtml(s, kw)}
    </div>
    ${s.checked ? draft2Html(s, kw) : ""}`;
  }

  function scenListHtml() {
    const works = savedWorks();
    const chips = SCENARIOS.map(function (s) {
      return '<button class="scen-chip" data-action="ws-pick" data-id="' + s.id + '">' + s.icon + ' ' + esc(s.title) + '</button>';
    }).join("");
    return `
    <div class="page-head"><h2>✍️ 写作专区 <span class="en">选场景写英文 / 读真实来信并回信 → 要点自查 → 二稿对比</span></h2></div>
    ${goalBanner()}
    <div class="card" style="margin-top:18px">
      <b style="font-size:13px;color:var(--muted)">选择一个业务场景（每个场景都已给出中文情境）</b>
      <div class="scen-grid" style="margin-top:10px">${chips}</div>
      <div class="field-note" style="margin-top:10px">离线也能写：提交后自动按该单元的关键表达做「要点自查」（你用了哪些、漏了哪些）；配了 AI 陪练模型后还可一键 AI 批改、给出更地道版本。</div>
    </div>
    ${mailListHtml()}
    ${works.length ? `
    <div class="card" style="margin-top:16px">
      <div class="chat-head"><span>📂 我的作品（${works.length}）</span></div>
      ${works.map(function (w, i) {
        return '<div class="wb-item"><span class="wb-e" style="flex:1">' + esc((w.title || "")) + ' · ' + w.wc + " 词 · " + esc(String(new Date(w.t).toLocaleDateString())) +
          (w.rate2 != null ? ' <span class="badge badge-ok">已改二稿 ' + w.rate1 + "%→" + w.rate2 + "%</span>" : "") + '</span>' +
          '<button class="play-btn" data-action="ws-load" data-i="' + i + '" title="回顾">📖</button>' +
          '<button class="learn-toggle" data-action="ws-del" data-i="' + i + '" title="删除">✕</button></div>';
      }).join("")}
    </div>` : ""}`;
  }

  /* 要点自查 + AI 批改入口：场景写作与真实来信**共用同一套反馈管线**，
     所以从下面抽成独立函数，不复制第二份实现（复制出来的第二份必然漂移）。 */
  function feedbackHtml(s, kw) {
    if (!s.checked) return "";
    const res = checkKeywords(s.text, kw);
    const used = res.filter(function (r) { return r.hit; });
    const miss = res.filter(function (r) { return !r.hit; });
    const rate = res.length ? Math.round(used.length / res.length * 100) : 0;
    const usedHtml = used.map(function (r) { return '<span class="kw-hit">✓ ' + escM(r.t) + '（' + escM(r.cn) + '）</span>'; }).join("");
    const missHtml = miss.slice(0, 12).map(function (r) { return '<span class="kw-miss">· ' + escM(r.t) + '（' + escM(r.cn) + '）</span>'; }).join(" ");
    return '<div class="ws-feed"><div style="font-weight:700;color:' + (rate >= 60 ? "var(--ok)" : "var(--bad)") + '">要点自查：覆盖 ' + rate + '%（' + used.length + '/' + res.length + '）</div>' +
      (usedHtml ? '<div style="margin-top:6px">' + usedHtml + '</div>' : "") +
      (miss.length ? '<div style="margin-top:6px;color:var(--muted)">可再点到的表达：' + missHtml + '</div>' : "") +
      '<div id="wsAi" class="qa-ai" hidden></div>' +
      (window.Tutor && window.Tutor.hasConfig() ? '<button class="btn btn-outline btn-sm" data-action="ws-ai" style="margin-top:10px">🤖 AI 批改（更地道）+</button>' : "") +
      '</div>';
  }

  function scenEditorHtml(s) {
    const sc = SCENARIOS.find(function (x) { return x.id === s.scen; }) || SCENARIOS[0];
    const kw = keyPhrases(sc.unitIds);
    const feed = feedbackHtml(s, kw);
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
    </div>
    ${s.checked ? draft2Html(s, kw) : ""}`;
  }

  /* ---------------- 交互 ---------------- */
  if (typeof document !== "undefined") document.addEventListener("click", function (e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const act = el.getAttribute("data-action");
    if (act.indexOf("ws-") !== 0) return;
    const s = readState();
    if (act === "ws-pick") { s.scen = el.getAttribute("data-id"); s.mail = null; s.text = ""; s.checked = false; s.draft2 = null; s.d2done = false; writeState(s); render(); return; }
    /* 📨 真实来信：与场景写作互斥，进入时把上一轮的草稿状态清干净 */
    if (act === "ws-mail") { s.mail = el.getAttribute("data-id"); s.scen = null; s.text = ""; s.checked = false; s.draft2 = null; s.d2done = false; writeState(s); render(); return; }
    if (act === "ws-mail-say") {
      const th = findThread(s.mail);
      const d = th && th.drill ? th.drill[parseInt(el.getAttribute("data-i"), 10)] : null;
      if (d && E().Player && E().Player.speak) E().Player.speak(d.en, {});
      return;
    }
    /* 复用 SOP 已暴露的两个既有出口：五阶段闯关 / FSRS 单词卡 */
    if (act === "ws-mail-drill" || act === "ws-mail-flash") {
      const th = findThread(s.mail);
      if (!th) return;
      const sop = window.SOP && window.SOP._t;
      if (!sop) { toast("⚠️ 练习入口未就绪"); return; }
      if (act === "ws-mail-drill") {
        sop.sendToStage(th.title, th.drill || []);
      } else {
        sop.sendToFlash(th.title, (th.body || []).map(function (b) { return { en: b.s, cn: "" }; }));
      }
      return;
    }
    if (act === "ws-back") { clearState(); render(); return; }
    if (act === "ws-submit") {
      const t = document.getElementById("wsText");
      if (t) s.text = t.value;
      if (!s.text.trim()) { toast("请先写一段英文再自查"); return; }
      s.checked = true; s.d2done = false; writeState(s); render(); return;
    }
    if (act === "ws-save") {
      const t = document.getElementById("wsText");
      if (t) s.text = t.value;
      const t2 = document.getElementById("wsDraft2");
      if (t2) s.draft2 = t2.value;
      if (!s.text.trim()) { toast("先写一点内容再保存"); return; }
      const a = savedWorks();
      const kw = currentKw(s);
      const has2 = s.d2done && String(s.draft2 || "").trim();
      const c = has2 ? compareDrafts(s.text, s.draft2, kw) : null;
      a.unshift({
        t: Date.now(), scen: s.mail || s.scen, title: currentTitle(s), text: s.text, wc: wc(s.text),
        draft2: has2 ? s.draft2 : "", wc2: has2 ? wc(s.draft2) : null,
        rate1: c ? c.rate1 : null, rate2: c ? c.rate2 : null
      });
      saveWorks(a);
      toast(has2 ? "💾 已保存（含一稿与二稿）" : "💾 已保存到作品集");
      if (window.CoachBridge && window.CoachBridge.done) window.CoachBridge.done("write");   // 计入今日任务 + 连续打卡
      render();
      return;
    }
    if (act === "ws-d2-done") {
      const t2 = document.getElementById("wsDraft2");
      if (t2) s.draft2 = t2.value;
      if (!String(s.draft2 || "").trim()) { toast("第二稿还是空的——照着反馈改一点就算数"); return; }
      if (String(s.draft2).trim() === String(s.text || "").trim()) {
        toast("二稿和一稿一模一样——至少改一处再对比，才算把反馈用起来");
        return;
      }
      s.d2done = true; writeState(s); render();
      return;
    }
    if (act === "ws-d2-reset") {
      s.draft2 = s.text || ""; s.d2done = false; writeState(s); render();
      return;
    }
    if (act === "ws-load") {
      const w = savedWorks()[parseInt(el.getAttribute("data-i"), 10)];
      if (w) {
        /* 作品可能来自「场景写作」也可能来自「真实来信」，靠 id 反查归属 */
        if (findThread(w.scen)) { s.mail = w.scen; s.scen = null; }
        else { s.scen = w.scen; s.mail = null; }
        s.text = w.text; s.draft2 = w.draft2 || null; s.d2done = !!w.draft2; s.checked = false;
        writeState(s); render();
      }
      return;
    }
    if (act === "ws-del") { const a = savedWorks(); a.splice(parseInt(el.getAttribute("data-i"), 10), 1); saveWorks(a); render(); return; }
    if (act === "ws-ai") writeAi(s);
  });

  function writeAi(s) {
    const out = document.getElementById("wsAi");
    if (!out) return;
    if (!(window.Tutor && window.Tutor.hasConfig())) { toast("请先到「AI 陪练」填好模型 Key。"); return; }
    const title = currentTitle(s);
    const kw = currentKw(s).map(function (r) { return r.t; }).slice(0, 20);
    out.hidden = false; out.innerHTML = '<p class="field-note">🤖 正在请 AI 批改…（需联网）</p>';
    const sys = "你是资深软包装外贸英语教练。请用中文给出：1) 内容是否贴合「" + title + "」场景、语气是否专业；2) 语法/用词哪里不对或不够地道；3) 一封更专业自然的英文版本；4) 一句总结建议。目标词参考：" + kw.join(" / ") + "。请简洁、专业。";
    const user = "场景：\n" + currentCtx(s) + "\n\n用户写的英文：\n" + (s.text || "") + "\n\n请批改。";
    window.Tutor.callChat([{ role: "system", content: sys }, { role: "user", content: user }]).then(function (txt) {
      out.innerHTML = '<div class="qa-ai-in">🤖 <b>AI 批改</b><div style="margin-top:6px">' + nl2br(txt) + '</div></div>';
    }).catch(function (e) { out.innerHTML = '<p class="sop-warn">AI 批改失败：' + esc(e && e.message ? e.message : "检查 Key / 网络") + '</p>'; });
  }

  function nl2br(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>"); }

  window.WriteStudio = { render: render };

  /* 供自动化测试/诊断使用（不影响运行时）。
     放在文件末尾：compareDrafts / draft2Html 等为函数声明会提升，但保持与站内一致的约定，
     也避免后人把带 const 的钩子提前——js/phonemes.js 与 js/urgent.js 都因此触发过 TDZ。 */
  window.WriteStudio._t = {
    compareDrafts: compareDrafts, draft2Html: draft2Html, compareHtml: compareHtml,
    checkKeywords: checkKeywords, normKw: normKw, wc: wc, keyPhrases: keyPhrases, SCENARIOS: SCENARIOS,
    /* 📨 真实来信（js/data-mail.js） */
    MAIL: MAIL, findThread: findThread, currentKw: currentKw, currentTitle: currentTitle,
    currentCtx: currentCtx, escM: escM, escTA: escTA,
    mailListHtml: mailListHtml, mailReaderHtml: mailReaderHtml, feedbackHtml: feedbackHtml
  };
})();
