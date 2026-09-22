/* ============ 写作专区 · 邮件场景（WriteStudio）============
   把"写作产出"从测验升级为独立专区：给一段中文业务场景 → 你用英文写一封邮件/段落 →
   离线用本单元关键表达做「要点自查」；配了 AI 陪练模型后可一键 AI 批改（更地道版本 + 为什么）。
   作品可保存到 localStorage（fte-writes）并回顾。
   依赖：window.TutorEnv（esc/toast/Player）、window.Tutor（hasConfig/callChat，可选）、
         window.FTE_DATA（读取单元词/短语做关键表达）。独立模块，零构建。 */
(function () {
  "use strict";

  const E = function () { return window.TutorEnv || {}; };
  /* P0-1（安全）：这里的 esc 原先是**恒等函数**（只做 String 转换、不转义任何字符），
     却被当成转义用在本模块的 textarea 预填、作品标题与 title 属性上——
     于是一稿里写入的标签会在「保存 → 回作品列表」时被 innerHTML 执行，
     并随导出的备份文件传播到其它机器。现改为**真转义**。
     口径与 app.js 的 esc / subtitle.js 的 esc 一致：& < > "（本模块的属性一律双引号包裹，
     不额外转义单引号，避免把正文里的撇号写成 &#39; 而影响可读与文本比对）。 */
  const esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };
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

  /* ---------------- AI 留痕与「先自己写」纪律（P7）----------------
     由来（写作篇 / AI 篇）：站内原来的 AI 批改提示词直接要求
     「3) 一封更专业自然的英文版本」——**这就是整段代写**。学习者读完就复制，
     略过了「注意 → 修改性输出」这一步，反馈因此不产生习得（与上面二稿闭环同一学理）。
     同时原文案也没留下任何痕迹：用了 AI 没有？采纳了什么？无从判断。

     改法（两条，都不删功能）：
       ① **分两档**：第一档只指出问题 + 给最小提示，**不给整段改写**；
          「更地道版本」要等**你自己写完二稿**之后才解锁（ws-ai-full）——先交自己的版本。
       ② **留痕三元组**（来源：证据卡 / AI 篇）：工具介入前的样本、关闭工具后的独立样本、
          以及「采纳 / 部分采纳 / 拒绝」+ 理由。判定语：聊天记录可以作为过程痕迹，
          **不能单独作为能力证明**。 */
  const AI_CAN = ["指出具体问题（引用你的原句）", "给最小提示", "追问", "生成平行任务"];
  const AI_CANNOT = ["代你写整段", "给你的首稿整段改写", "编造来源或语料"];

  /* 平行任务：每一步自测都要有「换个条件再来一次」的对照，
     否则「关掉 AI 后我还会不会」永远无法回答。
     与 SCENARIOS 一一对应，换了具体情境但保留同一场景族。 */
  const PARALLEL = {
    cold: "换一个市场、换一个产品线，再写一封开发信（例：从中东客户换到南美客户，从复合膜换成自立袋）。主题、客户名、卖点都要换，不要复用上一封的句子。",
    quote: "客户回信说「你的价格比现在供应商高 8%」。写一封议价回复：不直接降价，先问清对方的价格构成与年采购量，并给出阶梯价条件。",
    remind: "客户提出「尾款分两期付」。写一封回复：同意分期但要有条件（付款节点、逾期利息或担保），语气依然保持合作。",
    complaint: "同样是客诉，换一个缺陷：这批货的**印刷色差**超出签样。写回复：致歉、请对方提供留样与色差仪数据、给整改与补货方案。",
    ship: "货已装船，但**因中转港拥堵 ETA 推迟了 10 天**。写给客户的通知：说明原因、给新 ETA、主动提出可选的补救（改港/部分先发）。",
    rewrite: "换一段中文意思改写成英文商务邮件：'关于上次谈的包装方案，我们技术部建议把外层换成哑光膜，成本增加约 3%，但抗刮性能明显更好。请确认是否接受，我们好安排打样。'"
  };
  function parallelTask(s) {
    if (!s) return null;
    if (s.mail) {
      /* 真实来信：平行任务 = 换另一封信（同样是「读懂 + 回信」，换的是材料不是技能） */
      const other = MAIL().filter(function (t) { return t.id !== s.mail; })[0];
      return other ? { kind: "mail", id: other.id, title: other.title,
        text: "换一封真实来信再回一次（" + other.title + "）——同一种技能，不同的材料，且这次不看 AI。" } : null;
    }
    const t = PARALLEL[s.scen];
    if (!t) return null;
    const sc = SCENARIOS.filter(function (x) { return x.id === s.scen; })[0];
    return { kind: "scen", id: s.scen, title: sc ? sc.title : s.scen, text: t };
  }


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
  /* 来信正文需要保留换行的可见版本；<textarea> 预填不能出现 <br>，用 escTA。
     两者都复用上面的真转义 esc，避免再出现「同一件事两份实现」。 */
  function escM(s) { return esc(s).replace(/\n/g, "<br>"); }
  function escTA(s) { return esc(s); }

  function savedWorks() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function saveWorks(a) { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 100))); } catch (e) { /* ignore */ } }

  /* ---------------- P3-3 产出下限 ----------------
     此前是「保存了就算 1 篇」——写 3 个词也算今日写作完成，这是最直接的刷量通路
     （连续打卡记的是「练了多少」，而 3 个词不是练习量）。现在只有达到 MIN_PROD_WORDS
     才计入今日任务与连续打卡；不足时**仍然保存作品**，但明确告知还差多少、且不记账。
     阈值是可调参数：40 词 ≈ 一封最短的完整商务回信；调高只会更严，不会更松。 */
  const MIN_PROD_WORDS = 40;
  function creditProduce(text, hint) {
    const n = wc(text);
    if (n >= MIN_PROD_WORDS) {
      if (window.CoachBridge && window.CoachBridge.done) window.CoachBridge.done("write");
      return true;
    }
    toast("已保存（" + n + " 词），但未计入今日产出：要满 " + MIN_PROD_WORDS + " 词才算。"
      + (hint || "把要点写完整再短也不行——练习量记的是产出，不是保存动作。"));
    return false;
  }

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
    ${s.checked ? draft2Html(s, kw) : ""}
    ${aiLedgerHtml(s)}
    ${indepHtml(s, kw)}`;
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
          (w.rate2 != null ? ' <span class="badge badge-ok">已改二稿 ' + w.rate1 + "%→" + w.rate2 + "%</span>" : "") +
          /* 含金量标注：有 AI 参与的稿子与关掉 AI 写出来的稿子不能等同看待 */
          (w.ai ? ' <span class="badge badge-muted" title="这一稿用过 AI（' + esc(w.ai.adopt || "未标注处理方式") + '）">🤖 有 AI 参与</span>' : "") +
          (w.indep ? ' <span class="badge badge-ok" title="关掉 AI 独立完成，要点覆盖 ' + (w.indep.rate != null ? w.indep.rate + "%" : "—") + '">🔒 独立稿</span>' : "") +
          '</span>' +
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
      aiContractHtml() +
      '<div id="wsAi" class="qa-ai" hidden></div>' +
      (window.Tutor && window.Tutor.hasConfig()
        ? '<button class="btn btn-outline btn-sm" data-action="ws-ai" style="margin-top:10px">🤖 AI 批改（只指问题 · 不代写）+</button>' +
          (s.d2done ? '<button class="btn btn-soft btn-sm" data-action="ws-ai-full" style="margin-top:10px;margin-left:8px">✨ 对照 AI 的地道版本（二稿已完成，解锁）</button>' : "")
        : "") +
      '</div>';
  }

  /* AI 契约：把「可以做 / 不可以做」写在按钮旁边，而不是藏在提示词里。
     学习者知道边界，才会把 AI 当教练而不是代笔。 */
  function aiContractHtml() {
    return '<div class="ws-contract">' +
      '<div class="ws-contract-col ok"><b>🤖 AI 可以做</b>' +
        AI_CAN.map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("") + "</div>" +
      '<div class="ws-contract-col no"><b>🚫 AI 不可以做</b>' +
        AI_CANNOT.map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("") + "</div>" +
      '<div class="ws-contract-note">先提交你自己的版本，再让 AI 介入；' +
        '<b>更地道的整段版本要等你自己写完二稿才解锁</b>。' +
        '判定语：聊天记录可以作为过程痕迹，<b>不能单独作为能力证明</b>。</div>' +
      '</div>';
  }

  /* ---------------- AI 留痕三元组 ----------------
     ① 工具介入前的样本 = 一稿（s.text，只读）
     ② 关闭工具后的独立样本 = 第三步的 s.indep
     ③ 采纳 / 部分采纳 / 拒绝 + 理由 = 下面这块，**不填就不算用完这一轮 AI** */
  const ADOPT = [
    { v: "adopt", label: "全部采纳" },
    { v: "partial", label: "部分采纳" },
    { v: "reject", label: "拒绝 / 延后" }
  ];
  function aiLedgerHtml(s) {
    if (!s.aiAt) return "";
    const cur = s.aiAdopt || "";
    return '<div class="ws-ledger">' +
      '<div class="ws-ledger-h"><b>🧾 AI 留痕</b><span>用了 AI 就要留下判断，否则这一轮只是「看过了」</span></div>' +
      '<div class="ws-ledger-row"><span class="ws-ledger-k">① 介入前的样本</span>' +
        '<span class="ws-ledger-v">你的一稿 · ' + wc(s.text || "") + ' 词（只读保留，不会被二稿覆盖）</span></div>' +
      '<div class="ws-ledger-row"><span class="ws-ledger-k">② 我的处理</span>' +
        '<span class="ws-ledger-v">' + ADOPT.map(function (o) {
          return '<button class="ws-adopt' + (cur === o.v ? " on" : "") + '" data-action="ws-ai-adopt" data-v="' + o.v + '">' + o.label + "</button>";
        }).join("") + '</span></div>' +
      (cur ? '<div class="ws-ledger-row"><span class="ws-ledger-k">理由（必填）</span>' +
        '<span class="ws-ledger-v"><input id="wsAiReason" type="text" maxlength="300" ' +
          'placeholder="例：它换掉了我的时态，但把我的 MOQ 写丢了——所以只采纳前半句" value="' + escTA(s.aiReason || "") + '">' +
          '<span class="sop-hint" id="wsAiReasonSaved">输入即自动保存</span></span></div>' : "") +
      '<div class="ws-ledger-row"><span class="ws-ledger-k">③ 独立样本</span>' +
        '<span class="ws-ledger-v">' + (s.indep && s.indep.text
          ? "已留 · " + wc(s.indep.text) + " 词（" + esc(String(new Date(s.indep.at).toLocaleDateString())) + "，未使用 AI）"
          : '<i class="ws-ledger-todo">还没有——见下面第三步「关掉 AI 再写一次」</i>') + '</span></div>' +
      '</div>';
  }

  /* ---------------- 第三步：关掉 AI 独立复测 ----------------
     这是整套留痕里**唯一有资格被叫作「能力证据」**的一栏：
     前两稿都在 AI 的影响下产生，只有它回答「离开工具我还会不会」。
     进入这一步时**不渲染任何 AI 入口**——不是禁用，是根本不出现。 */
  function indepHtml(s, kw) {
    if (!s.d2done) return "";
    const pt = parallelTask(s);
    if (!pt) return "";
    if (s.indep && s.indep.text && s.indepDone) {
      const r = s.indep.rate != null ? '<span class="badge ' + (s.indep.rate >= 60 ? "badge-ok" : "badge-warn") + '">要点覆盖 ' + s.indep.rate + "%</span>" : "";
      return '<div class="ws-indep done">' +
        '<div class="ws-indep-h"><b>🔒 第三步 · 关掉 AI 独立复测</b>' +
          '<span class="badge badge-ok">已完成</span>' + r + '</div>' +
        '<div class="ws-indep-b">独立稿 · ' + wc(s.indep.text) + ' 词（' + esc(String(new Date(s.indep.at).toLocaleDateString())) + '，全程未使用 AI）</div>' +
        '<div class="ws-indep-ops">' +
          '<button class="btn btn-ghost btn-sm" data-action="ws-indep-view">📖 看独立稿</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="ws-indep-reset">↺ 重做一次</button>' +
        '</div>' +
        (s.indepView ? '<div class="ws-indep-text">' + nl2br(s.indep.text) + '</div>' : "") +
        '<div class="ws-indep-note">只有这一栏能被当作能力证据——前两稿都有 AI 参与。' +
          '和上一次的独立稿比，才是「有没有长进」。</div>' +
        '</div>';
    }
    return '<div class="ws-indep">' +
      '<div class="ws-indep-h"><b>🔒 第三步 · 关掉 AI 独立复测</b>' +
        '<span class="badge badge-warn">换条件再来一次</span></div>' +
      '<div class="ws-indep-b"><b>平行任务（换了条件，技能相同）：</b><br>' + esc(pt.text) + '</div>' +
      '<textarea id="wsIndep" class="write-input" rows="6" placeholder="这一次不要问 AI、不要对照前面的稿子，直接写…">' + escTA(s.indepText || "") + "</textarea>" +
      '<div class="ws-indep-ops">' +
        '<button class="btn btn-primary btn-sm" data-action="ws-indep-done">✓ 完成独立稿</button>' +
        '<button class="btn btn-soft btn-sm" data-action="ws-indep-fill">↺ 清空重写</button>' +
        '<span class="sop-hint">' + wc(s.indepText || "") + ' 词 · 本步不提供任何 AI 入口</span>' +
      '</div>' +
      '<div class="ws-indep-note">为什么必须关掉 AI：前两稿都有工具参与，' +
        '<b>工具介入过的样本不能证明你独立能做到</b>。这一步的产出才是下一次复测的对照基线。</div>' +
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
    ${s.checked ? draft2Html(s, kw) : ""}
    ${aiLedgerHtml(s)}
    ${indepHtml(s, kw)}`;
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
        rate1: c ? c.rate1 : null, rate2: c ? c.rate2 : null,
        /* 留痕三元组：让「用过 AI 没有 / 采纳了什么 / 关掉 AI 后写成什么样」三件事
           跟着作品一起存下来。没有这一栏，作品集里所有稿子的含金量无法分辨。 */
        ai: s.aiAt ? { at: s.aiAt, adopt: s.aiAdopt || "", reason: s.aiReason || "",
                       hasAdvice: !!s.aiAdvice, hasFull: !!s.aiFull } : null,
        indep: (s.indep && s.indep.text) ? s.indep : null
      });
      saveWorks(a);
      toast(has2 ? "💾 已保存（含一稿与二稿）" : "💾 已保存到作品集");
      creditProduce(s.text);   // P3-3：达到产出下限才计入今日任务 + 连续打卡
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

    /* ---- AI 留痕：采纳 / 部分采纳 / 拒绝 + 理由（理由不填就不算用完这一轮） ---- */
    if (act === "ws-ai-adopt") {
      s.aiAdopt = el.getAttribute("data-v");
      if (!s.aiAt) s.aiAt = Date.now();
      writeState(s); render(); return;
    }

    /* ---- 第三步：关掉 AI 的独立复测 ---- */
    if (act === "ws-indep-done") {
      const t = document.getElementById("wsIndep");
      const txt = t ? t.value : (s.indepText || "");
      if (!String(txt).trim()) { toast("独立稿是空的——哪怕写得短，也要自己写完"); return; }
      if (String(txt).trim() === String(s.draft2 || s.text || "").trim()) {
        toast("独立稿和前面那稿一模一样——这一步要换个条件自己写");
        return;
      }
      const pt = parallelTask(s);
      /* 平行任务的关键表达：真实来信取那封信的 points，场景写作取同场景的要点 */
      let kw = currentKw(s);
      if (pt && pt.kind === "mail") { const th = findThread(pt.id); kw = (th && th.points) || []; }
      const kres = checkKeywords(txt, kw || []);
      const hit = kres.filter(function (x) { return x.hit; }).length;
      s.indep = { at: Date.now(), text: txt, wc: wc(txt), usedAI: false,
        rate: kres.length ? Math.round(hit / kres.length * 100) : null,
        parallel: pt ? pt.text : "" };
      s.indepText = txt; s.indepDone = true; s.indepView = false;
      writeState(s);
      toast("🔒 独立稿已留档——这一栏才是能力证据");
      creditProduce(txt, "独立稿太短也说明不了「离开工具我还会不会」——写完一整封再交。");
      render(); return;
    }
    if (act === "ws-indep-fill") { s.indepText = ""; writeState(s); render(); return; }
    if (act === "ws-indep-view") { s.indepView = !s.indepView; writeState(s); render(); return; }
    if (act === "ws-indep-reset") { s.indep = null; s.indepDone = false; s.indepText = ""; s.indepView = false; writeState(s); render(); return; }

    if (act === "ws-ai") writeAi(s, "review");
    if (act === "ws-ai-full") writeAi(s, "full");
  });

  /* 理由／独立稿「输入即存」：卡片上的按钮会就地重渲染，不自动保存会把没提交的文字冲掉 */
  if (typeof document !== "undefined") document.addEventListener("input", function (e) {
    const el = e.target;
    if (!el || !el.id) return;
    if (el.id !== "wsAiReason" && el.id !== "wsIndep") return;
    const s = readState();
    if (el.id === "wsAiReason") s.aiReason = el.value; else s.indepText = el.value;
    writeState(s);
    if (el.id === "wsAiReason") {
      /* 只有理由这一格带保存提示；独立稿有字数提示，不用再加一条 */
      const t = document.getElementById("wsAiReasonSaved");
      if (t) t.textContent = "已自动保存";
    }
  });

  /* AI 批改分两档：
       mode="review"（默认，一稿后）：**只指问题 + 最小提示**，明令禁止整段改写。
       mode="full"（二稿后解锁）：才给地道版本——此时用户已经交过自己的修改性输出。
     两档共用一次调用，不新增第二套实现。 */
  function writeAi(s, mode) {
    const out = document.getElementById("wsAi");
    if (!out) return;
    if (!(window.Tutor && window.Tutor.hasConfig())) { toast("请先到「AI 陪练」填好模型 Key。"); return; }
    const full = mode === "full";
    if (full && !s.d2done) { toast("先自己写完二稿，再对照 AI 的地道版本——顺序反了就变成代写"); return; }
    const title = currentTitle(s);
    const kw = currentKw(s).map(function (r) { return r.t; }).slice(0, 20);
    out.hidden = false;
    out.innerHTML = '<p class="field-note">🤖 ' + (full ? "正在生成地道版本…" : "正在批改（只指问题，不代写）…") + '（需联网）</p>';
    const contract = "【AI 可以做】" + AI_CAN.join(" / ") + "。【AI 不可以做】" + AI_CANNOT.join(" / ") + "。";
    /* 场景名与情境一律走 currentTitle/currentCtx——来信与场景写作共用这一条管线，
       不按来源分叉（分叉出来的第二份必然漂移）。 */
    const scene = "先确认这段英文是否贴合「" + title + "」场景。";
    const sys = full
      ? "你是资深软包装外贸英语教练。" + scene + "学习者已经**自己写过一稿、也改过二稿**，现在需要对照一个更地道自然的英文版本，以及它相比他的版本改了什么、为什么。请用中文说明差异，再给英文版本。目标词参考：" + kw.join(" / ") + "。" + contract
      : "你是资深软包装外贸英语教练。" + scene + "学习者刚交了**第一稿**，你的任务是**先自己写完二稿之前不给整段改写**。" + contract +
        "请用中文只做三件事：1) 指出最影响结果的 1–3 个问题，**每条都要引用他的原句**；2) 每个问题给**一个最小提示**（只给方向或一个关键词，不要给出完整句子）；3) 给一个**平行小任务**（一句让他自己改的指令）。" +
        "严禁输出整段改写的英文版本，也不要逐句重写——那会剥夺他自己修改的机会。目标词参考：" + kw.join(" / ") + "。请简洁、专业。";
    const user = "场景：\n" + currentCtx(s) + "\n\n用户写的英文（一稿）：\n" + (s.text || "") + "\n\n" + (full ? "请对照给出地道版本并说明差异。" : "请按规则批改，不要给出整段英文改写。");
    window.Tutor.callChat([{ role: "system", content: sys }, { role: "user", content: user }]).then(function (txt) {
      out.innerHTML = '<div class="qa-ai-in">🤖 <b>' + (full ? "AI 地道版本（二稿后解锁）" : "AI 批改 · 只指问题") + '</b><div style="margin-top:6px">' + nl2br(txt) + '</div></div>';
      /* 留痕：记下「用过 AI」这个事实与它的输出，供后面①②③三栏与作品集使用 */
      const st = readState();
      st.aiAt = Date.now();
      if (full) st.aiFull = txt; else st.aiAdvice = txt;
      if (!st.aiAdopt) st.aiAdopt = "";
      writeState(st);
      render();
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
    mailListHtml: mailListHtml, mailReaderHtml: mailReaderHtml, feedbackHtml: feedbackHtml,
    /* AI 留痕与「先自己写」纪律（P7） */
    AI_CAN: AI_CAN, AI_CANNOT: AI_CANNOT, ADOPT: ADOPT, PARALLEL: PARALLEL,
    parallelTask: parallelTask, aiContractHtml: aiContractHtml,
    aiLedgerHtml: aiLedgerHtml, indepHtml: indepHtml, writeAi: writeAi
  };
})();
