/* ============ 软包装外贸英语 · 🎧 真实商务听音源（P1） ============
   说明：本页不是把外部资源"嵌入"站点（离线静态 PWA 无法跨域/授权引入第三方音频），
   而是做一份【精选目录】——按水平与领域筛好"真实母语者声音"的商务/外贸向音源，
   链出去听；每个音源下面配本页统一的「四步听练闭环」，让你从"听到"走向"会干"。

   提供的真正价值：
     1. 补充全站唯一短板——站内「听」目前都是 TTS 合成音（Player.speak），
        这里把"真实母语者口音/连读/弱读"补进来（链到站外，诚实标注授权约束）。
     2. 每个音源配一个【热身句】用站内 TTS 先磨耳朵，再听到真实音频，形成"模拟→真实"过渡。
     3. 统一「四步听练闭环」，并一键跳回站内「听说训练 / 四维实战 / 听写」继续练。

   数据：window.FTE_SOURCES = { levels, domains, method, warm, items[] }
   渲染：window.Sources.render()（自包含，自带事件处理）。 */
(function () {
  "use strict";

  const LEVELS = [
    { id: "a", label: "入门（A1–A2）" },
    { id: "b", label: "进阶（B1–B2）" },
    { id: "c", label: "拔高（C1–C2）" }
  ];
  const DOMAINS = [
    { id: "news", label: "新闻与经济" },
    { id: "business", label: "商务职场" },
    { id: "ds", label: "口语/对话" },
    { id: "industry", label: "外贸行业向" },
    { id: "story", label: "新闻故事/文化" },
    { id: "textbook", label: "教材/点读" }
  ];
  const METHOD = [
    { icon: "🎧", t: "第 1 步 · 盲听", d: "不看字幕、不暂停，先整段听一遍，能听懂多少算多少——这是练耳朵，允许「听漏」。" },
    { icon: "🔍", t: "第 2 步 · 精听", d: "对着文字/字幕听第二遍，把没听出来的词、连读、弱读找出来，记进单词本。" },
    { icon: "🗣", t: "第 3 步 · 跟读复述", d: "挑 30 秒，逐句跟读模仿语音语调；关掉文字用自己的话复述 2 句，练「会转述」。" },
    { icon: "🗒", t: "第 4 步 · 拾遗闭环", d: "把生词/顺句进站内单词卡、把没听懂的句子丢进 AI 陪练复盘，第二天先复述它。" }
  ];

  /* 每个音源一个"热身句"：站内 TTS 先读，帮你把耳朵移到英语频道，再听到真实音频。 */
  const WARM = "Let me walk you through our quotation and lead time, then we can confirm the shipment schedule.";

  const ITEMS = [
    {
      name: "BBC Learning English · 6 Minute English",
      url: "https://www.bbc.co.uk/learningenglish",
      level: "b", domain: ["news", "business", "story"],
      region: "🇬🇧 英音",
      desc: "BBC 免费的 6 分钟教学节目，每集一个话题，语速清晰、附完整文字稿。商业/职场话题占比高，练英音与详略把握的经典入门进阶音源。",
      why: "语速与用词都经过教学适配，最适合从「真实母语者口音」过渡；英音 + 逐字稿 + 课后题，正好配上你的「盲听→精听」闭环。",
      free: true
    },
    {
      name: "BBC · Business English 系列（商务向）",
      url: "https://www.bbc.co.uk/learningenglish/english/course/upper-intermediate/unit-29/lesson-1",
      level: "b", domain: ["business"],
      region: "🇬🇧 英音",
      desc: "BBC 针对「工作任务」的商务英语节目，覆盖会议、电话、谈判、报告——和你站内 U8 电话会议 / U5 谈判直接呼应。",
      why: "商务场景最贴近外贸日常工作；听完可直接跳站内「🧭 外贸实操 SOP」对照真实流程。",
      free: true
    },
    {
      name: "VOA Learning English（新闻速听 + 经济）",
      url: "https://learningenglish.voanews.com",
      level: "a", domain: ["news", "business", "story"],
      region: "🇺🇸 美音",
      desc: "美国之音的慢速/常速分级新闻，词汇受限、语速可控，适合「听懂真实世界 + 学美国英语」。Business 与 Economics 栏目紧扣国际贸易。",
      why: "语速分级 + 逐字稿 + 用词分级，是从零到能听真实新闻的最短路径；外贸人还能顺带积累宏观/汇率类表达。",
      free: true
    },
    {
      name: "VOA · Words and Their Stories",
      url: "https://learningenglish.voanews.com/z/3633",
      level: "a", domain: ["story", "business"],
      region: "🇺🇸 美音",
      desc: "一个词、一个短语用几分钟故事讲清楚，配文字稿。适合碎片时间把一个表达放进真实语境里记牢。",
      why: "正好治「背了单词不会用」：把词放进语境里听，再抄进站内单词卡，记忆更牢。",
      free: true
    },
    {
      name: "ELLLO · One Minute English / Mixer",
      url: "https://www.elllo.org",
      level: "a", domain: ["ds"],
      region: "🌍 多国口音",
      desc: "100+ 国家 300+ 真人母语者的一分钟观点 + 多人实谈（Mixer），附文字稿。口音最多元，最适合让耳朵适应「真实世界的英语」。",
      why: "外贸要跟全球客户打交道，多国口音（印度、澳洲、东南亚、欧洲）正是你平时最需要适应的；One Minute English 特别适合外贸人磨耳朵。",
      free: true
    },
    {
      name: "Randall's ESL Cyber Listening Lab",
      url: "https://www.esl-lab.com",
      level: "b", domain: ["ds", "business"],
      region: "🇺🇸 美音",
      desc: "从 1998 年运营至今的免费听力库，按 Easy/Intermediate/Difficult 分级，内容全是生活与工作场景（餐厅、旅行、校园、工作、商务），听力后带练习。",
      why: "场景化最强、且听后有题可测「到底听懂没」——正好补上你「怕只听个感觉」的心理，把「听懂」变成可验证的进步。",
      free: true
    },
    {
      name: "News in Levels（分级新闻·读听结合）",
      url: "https://www.newsinlevels.com",
      level: "b", domain: ["news", "industry"],
      region: "🌍 世界新闻",
      desc: "同一篇新闻按 Level 1–3 分级，高频词反复出现、逐级扩展词汇。适合把「看新闻」变成「刻意输入」。",
      why: "高频词反复出现正符合语言学习规律；B1 左右用它练「根据上下文猜词」，不查每个词，训练真实阅读力。",
      free: true
    },
    {
      name: "NPR Marketplace（美式财经广播）",
      url: "https://www.marketplace.org",
      level: "c", domain: ["news", "business"],
      region: "🇺🇸 美音",
      desc: "美国公共广播的每日财经节目，真实语速、无教学级降速，话题涉及行业、供应链、汇率、消费者……",
      why: "B2+ 用：语速接近母语者，且全程都是「经济/贸易」语料，是外贸人过渡到「真实母语」的最佳一跳。",
      free: true
    },
    {
      name: "HBR IdeaCast / TED Talks（商业演讲）",
      url: "https://hbr.org/podcasts",
      level: "c", domain: ["business", "industry"],
      region: "🇺🇸 美音",
      desc: "《哈佛商业评论》的职场/管理播客，讲战略、谈判、领导力、全球化业务；TED 商业演讲同理。",
      why: "高质量、有结构、观点清晰的商务英语；练「听观点 + 复述观点」，正好接上站内「观点讨论」场景。",
      free: true
    },
    {
      name: "The Economist / Financial Times 音频（日报刊）",
      url: "https://www.economist.com",
      level: "c", domain: ["news", "business"],
      region: "🇬🇧 英音",
      desc: "《经济学人》与《金融时报》的付费音频版，标准英式/美式新闻口播，商业与宏观经济深度内容。",
      why: "进阶到 C 级，用真实财经深度报道练听力；站内「出海/合规/供应链」话题可与之对读。",
      free: false
    },
    {
      name: "新概念英语点读（iChochy/NCE · 外链）",
      url: "https://nce.ichochy.com",
      level: "a", domain: ["textbook"],
      region: "📖 教材·点读",
      desc: "《新概念英语》1–4 册的在线点读版（开源项目 iChochy/NCE）：整篇朗读可整段听、也可单句点读，中英逐句对照，手机/平板/电脑通用；四册按「基础→语法→阅读→高阶表达」递进，是目前少见的「按册爬坡 + 句级点读」材料，适合零基础到 A2。⚠️ 两条须知情：① 课文正文与录音版权归原出版方（外研社/朗文），本站只作外链引用、不搬运其内容，授权与可访问性以对方站点为准；② 字幕/中译含 AI 生成成分、偶有错误，务必对照原文核对，录音口音以站内实际为准。",
      why: "本站 A 档此前只有真实新闻/口语（VOA / ELLLO），缺一条「从零起步、按册递进」的教材型来源——它补的正是这一格。用法：只在该站内用它练听读（整段听、单句点读、跟读），不要把它站上的课文取下来，也请勿把受版权保护的课文导入本站任何入口。若你想把「逐句精听、进单词卡、做四维评测」跑一遍，请换成你自己有权使用的材料——例如你本人已获授权可数字化的教材、你自己写的英文、或已明确许可再利用的公开语料。",
      free: true
    }
  ];

  window.FTE_SOURCES = {
    note: "真实母语者声音 · 精选商务/外贸向听音源。以下均为站外公开资源，授权与可访问性以官网为准；本站为纯静态站点、无法跨域嵌入第三方音频，故提供精选目录 + 统一「四步听练闭环」，你链出去听、回本站练。",
    levels: LEVELS,
    domains: DOMAINS,
    method: METHOD,
    warm: WARM,
    items: ITEMS
  };

  window.Sources = { render: render, DATA: window.FTE_SOURCES };

  /* ---------------- 精听闭环（P1-9）----------------
     「四步听练闭环」原先只是文字方法论——看完就完，没有可勾选的账。
     现在每个音源一张可勾选清单（盲听→精听→跟读复述→拾遗）+ 听懂自评（五档）+
     一键带着上下文去 AI 陪练复盘。数据存 localStorage（storage-keys.js 已登记），
     不计入打卡（这是「找材料/磨耳朵」，坚持口径只记那五步）。 */
  const DRILL_KEY = "fte-source-drill-v1";
  const DRILL_STEPS = [
    { k: "blind", label: "🎧 盲听一遍", hint: "不看字幕整段听，能懂多少算多少" },
    { k: "intensive", label: "🔍 精听一遍", hint: "对着文稿/字幕把没听出的词、连读找出来" },
    { k: "shadow", label: "🗣 跟读 30 秒", hint: "挑一段逐句模仿，再关稿复述 2 句" },
    { k: "vocab", label: "🗒 生词进卡", hint: "把生词/顺句收进单词卡（FSRS 排期复习）" }
  ];
  function loadDrills() {
    try { const v = JSON.parse(localStorage.getItem(DRILL_KEY) || "{}"); return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; } catch (e) { return {}; }
  }
  function saveDrill(name, patch) {
    const all = loadDrills();
    const cur = all[name] || { steps: {}, self: null, t: 0 };
    Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
    cur.t = Date.now();
    all[name] = cur;
    try { localStorage.setItem(DRILL_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ }
  }
  /* 干扰最少的名字键：音源名就是它的稳定 ID（DATA 是静态清单） */
  function drillOf(name) { return loadDrills()[name] || null; }
  function srcTutorPrompt(name, d) {
    return "我刚在「" + name + "」听了一段真实英语音频" +
      (d && d.self != null ? "（自评听懂约 " + d.self * 25 + "%）" : "") +
      "。请当我的口语教练做听力复盘：用英语问我 2-3 个关于这段内容的问题，我尽量用英语回答；我答完后指出我的语法与用词问题（点到为止），并把值得记的生词用【新词: word|meaning|example】格式给我。";
  }

  /* ---------------- 渲染 ---------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function levelLabel(id) {
    const h = LEVELS.find(function (l) { return l.id === id; });
    return h ? h.label : id;
  }
  function domLabels(ids) {
    return ids.map(function (id) {
      const h = DOMAINS.find(function (d) { return d.id === id; });
      return h ? h.label : id;
    });
  }

  function render() {
    const app = document.getElementById("app");
    const S = window.FTE_SOURCES;
    const state = window.Sources.state = window.Sources.state || { level: "all", dom: "all" };

    const levelTabs = ['<button class="chip ' + (state.level === "all" ? "active" : "") + '" data-s="src-level" data-v="all">全部水平</button>']
      .concat(LEVELS.map(function (l) {
        return '<button class="chip ' + (state.level === l.id ? "active" : "") + '" data-s="src-level" data-v="' + l.id + '">' + l.label + '</button>';
      })).join("");

    const domTabs = ['<button class="chip ' + (state.dom === "all" ? "active" : "") + '" data-s="src-dom" data-v="all">全部领域</button>']
      .concat(DOMAINS.map(function (d) {
        return '<button class="chip ' + (state.dom === d.id ? "active" : "") + '" data-s="src-dom" data-v="' + d.id + '">' + d.label + '</button>';
      })).join("");

    const items = S.items.filter(function (it) {
      if (state.level !== "all" && it.level !== state.level) return false;
      if (state.dom !== "all" && it.domain.indexOf(state.dom) === -1) return false;
      return true;
    });

    const cards = items.map(function (it) {
      return `
      <div class="card src-card">
        <div class="src-head">
          <div>
            <h3 style="margin:0">${esc(it.name)} ${it.free ? '' : '<span class="badge payment-badge">部分付费</span>'}</h3>
            <div style="margin-top:6px">
              <span class="badge badge-muted">${esc(levelLabel(it.level))}</span>
              <span class="badge badge-muted">${esc(it.region)}</span>
              ${domLabels(it.domain).map(function (l) { return '<span class="badge badge-muted">' + esc(l) + '</span>'; }).join("")}
            </div>
          </div>
          <a class="btn btn-soft btn-sm" href="${esc(it.url)}" target="_blank" rel="noopener">🔗 去听音源</a>
        </div>
        <p style="margin:12px 0 0;font-size:13.8px">${esc(it.desc)}</p>
        <p style="margin:8px 0 0;font-size:13px;color:var(--accent)"><b>为什么适合外贸人：</b>${esc(it.why)}</p>
        <div class="src-warm">
          <button class="btn btn-outline btn-sm" data-s="src-warm" data-t="${esc(S.warm)}">🔊 先热身（站内 TTS 读一遍，再听真实音频）</button>
          <button class="btn btn-outline btn-sm" data-s="src-eval" data-t="${esc(S.warm)}">🎯 跟读热身句</button>
        </div>
        ${drillHtml(it)}
      </div>`;
    }).join("");

    const methodHtml = S.method.map(function (m) {
      return `<div class="src-method"><div class="sm-icon">${m.icon}</div><div><b>${esc(m.t)}</b><p>${esc(m.d)}</p></div></div>`;
    }).join("");

    app.innerHTML = `
    <div class="page-head">
      <div class="crumbs"><a href="#/home">全站地图</a> / 真实听音源</div>
      <h2>🎧 真实商务听音源</h2>
      <div class="en">把「真实母语者声音」补进你的听力练场 · 链出去听，回本站练</div>
      <p style="margin-top:8px;max-width:760px;color:var(--muted)">${esc(S.note)}</p>
      <p style="margin-top:6px;max-width:760px;color:var(--muted)"><b>为什么需要这一页：</b>站内「听」用的是 TTS 合成音（干净标准），先用它热身磨耳朵没问题；但真实母语者的连读、弱读、多国口音只有真人音频才有——外贸天天跟各国客户沟通，这一层必须补上。</p>
    </div>

    <div class="card" style="margin-top:4px;padding:16px 18px">
      <b>🗺 四步听练闭环（每个音源都按这个来）</b>
      <div class="src-methods">${methodHtml}</div>
      <div style="margin-top:10px;font-size:13px;color:var(--muted)">
        练完一站内闭环：<a href="#/speak">🎤 听说训练 / 跟读</a> · <a href="#/eval4">🎯 四维口语实战</a> · <a href="#/listen">👂 辨音</a> · <a href="#/flash">🃏 单词卡收生词</a>
      </div>
    </div>

    <div class="mistake-toolbar" style="margin-top:14px">
      <div class="chip-row">${levelTabs}</div>
      <div class="chip-row" style="margin-top:8px;border-top:1px dashed var(--line,#e2e8f0);padding-top:8px"><span class="mistake-dim">🔎 按领域：</span>${domTabs}</div>
    </div>

    ${cards || '<div class="empty"><div class="e-icon">📭</div>该筛选下暂无音源。</div>'}

    <div class="card" style="margin-top:18px;padding:14px 18px;font-size:13px;color:var(--muted)">
      <b>优先级建议：</b>基础弱 → 从 VOA / ELLLO（A 级）开始，每天 15 分钟，先磨耳朵；A2–B1 → ELLLO + VOA + News in Levels，一套真实、一套分级；B1–B2 → BBC 6 Minute English / Randall（英音 + 场景），开始接触专业与商务；B2+ → NPR Marketplace / HBR / Economist / FT，用英语学真实的商业世界。
      <span style="display:block;margin-top:8px">⚠️ 页面可能有广告，自行辨别；付费音源以官网为准。真实音频授权与可访问性由各官网决定，本站仅作目录引用。</span>
    </div>`;

    /* 模块内事件绑定（自包含，不污染 app.js 的大 switch） */
    app.querySelectorAll("[data-s]").forEach(function (el) {
      el.addEventListener("click", onAction);
    });
  }

  /* 每个音源的精听闭环卡：可勾选四步 + 听懂自评 + AI 复盘跳转 */
  function drillHtml(it) {
    const d = drillOf(it.name) || { steps: {}, self: null };
    const doneCount = DRILL_STEPS.filter(function (s) { return d.steps && d.steps[s.k]; }).length;
    return `
    <details class="src-drill" style="margin-top:10px;border-top:1px dashed var(--line,#e2e8f0);padding-top:8px">
      <summary style="cursor:pointer;font-size:13px"><b>🎯 本音源精听闭环</b>
        <span class="badge badge-muted">${doneCount}/4 步</span>
        ${d.self != null ? '<span class="badge badge-ok">自评听懂 ' + d.self * 25 + '%</span>' : ""}
        <span style="color:var(--muted);font-size:12px">（存在本机，不计入打卡）</span></summary>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
        ${DRILL_STEPS.map(function (s) {
          const on = !!(d.steps && d.steps[s.k]);
          return '<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer">' +
            '<input type="checkbox" data-s="src-step" data-n="' + esc(it.name) + '" data-k="' + s.k + '"' + (on ? " checked" : "") + ">" +
            "<span><b>" + esc(s.label) + "</b> <span style=\"color:var(--muted)\">" + esc(s.hint) + "</span></span></label>";
        }).join("")}
      </div>
      <div style="margin-top:8px;font-size:13px">
        <span style="color:var(--muted)">听完自评（诚实选，下次对比）：</span>
        ${[0, 1, 2, 3, 4].map(function (v) {
          return '<button class="chip' + (d.self === v ? " active" : "") + '" data-s="src-self" data-n="' + esc(it.name) + '" data-v="' + v + '">' + v * 25 + "%</button>";
        }).join("")}
      </div>
      <button class="btn btn-soft btn-sm" style="margin-top:8px" data-s="src-tutor" data-n="${esc(it.name)}">🤖 带着这段音频去 AI 陪练复盘</button>
    </details>`;
  }

  function onAction(e) {
    const el = e.target.closest("[data-s]");
    if (!el) return;
    const act = el.getAttribute("data-s");
    const v = el.getAttribute("data-v");
    const t = el.getAttribute("data-t");
    const n = el.getAttribute("data-n");
    const Player = window.Player;
    if (!window.Sources) return;

    if (act === "src-level") { window.Sources.state.level = v || "all"; render(); }
    else if (act === "src-dom") { window.Sources.state.dom = v || "all"; render(); }
    else if (act === "src-warm") { if (Player && t) Player.speak(t, { rate: 1 }); }
    else if (act === "src-step") {
      /* checkbox 的 checked 已被浏览器翻转，读当前状态存回 */
      const all = loadDrills();
      const cur = all[n] || { steps: {}, self: null, t: 0 };
      cur.steps = cur.steps || {};
      cur.steps[el.getAttribute("data-k")] = !!el.checked;
      saveDrill(n, { steps: cur.steps });
      /* 只更新徽章，不整卡重渲染（避免 checkbox 失焦/详情收起） */
      const card = el.closest(".src-card");
      if (card) {
        const det = card.querySelector("details.src-drill summary");
        const cnt = DRILL_STEPS.filter(function (s) { return cur.steps[s.k]; }).length;
        if (det) det.querySelector(".badge").textContent = cnt + "/4 步";
      }
    }
    else if (act === "src-self") {
      saveDrill(n, { self: parseInt(v, 10) });
      render();
    }
    else if (act === "src-tutor") {
      try { localStorage.setItem("fte-tutor-fill", srcTutorPrompt(n, drillOf(n))); } catch (e) { /* ignore */ }
      location.hash = "#/tutor";
    }
    else if (act === "src-warm") { if (Player && t) Player.speak(t, { rate: 1 }); }
    else if (act === "src-eval") {
      /* 跳站内四维/跟读前，先请求麦克风权限以有更好的跟读体验 */
      if (Player && Player.micRequest) {
        Player.micRequest().then(function () {
          location.hash = "#/speak";
          if (window.ASRUtil && window.ASRUtil.toast) window.ASRUtil.toast("🎤 已开麦克风：在「听说训练」里找一句跟读练习，评评测");
        }).catch(function () {
          location.hash = "#/speak";
        });
      } else {
        location.hash = "#/speak";
      }
    }
  }
})();
