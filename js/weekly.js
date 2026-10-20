/* ============ 📅 本周新料（Weekly Fresh Material）============
   由来：站内 19 个单元是**一次性写完的静态语料**——学完就没有新东西了。「今日」再聪明，
   也只是把旧料重新装配；泛听音源又全都指向站外、且与自己的业务无关。
   外部分享里被长期使用的全英站点，靠的恰恰是「每天都更新」这一件事。
   本站没有内容团队，也不该为更新而更新。所以这里**不生产新材料**，只做**每周一条投料节律**：
   给本周一个业务主题 + 三个可抓取的公开行业来源，一键把链接送进站内既有的「素材投料口」，
   抓回来的正文由 material.js 自动拆句，接上四个既有引擎——
   字幕逐句点读 / 五阶段闯关 / 实词进 FSRS 单词卡 / 四维口语评分。

   ⚠️ 五条边界：
     ① **不新增导航、不新增第 6 步**：与「场景急救」「连听本单元」同一位置策略——
        它作为「今日」页内区块存在，并在「素材投料口」页顶部给一份完整面板（工序相邻）。
     ② **不预置任何英文正文**：本站对外语料有「人工核对」纪律（见 README 的语料口径），
        所以这里只给**主题与来源**，正文由你抓取真实公开文章或自行粘贴。
     ③ **不计入打卡**：投料本身不计分；只有当材料真的进了五阶段/单词卡，才走各自的既有记账。
        把「找材料」混进「练了多少」的账里会污染坚持口径。
     ④ **周几都是这一周**：按 ISO 周数轮换（6 条一组），纯本地计算、不依赖网络与服务器。
        跨周自动归零（下周重新计「已投料」），不需要任何定时任务。
     ⑤ **不替你做判断**：来源是公开行业媒体，不保证与你的市场/客户相关；
        拿到正文后仍需自己核对事实与法规原文。 */

(function () {
  "use strict";
  if (typeof window === "undefined") return;

  const KEY = "fte-weekly-v1";     // 已登记于 js/storage-keys.js（backup: true）

  /* ---------------- 六周一个循环的主题表 ----------------
     选材标准：① 是软包装外贸业务员**真的会被客户问到**的话题；
               ② 每个主题都有公开、稳定、可长期访问的行业来源；
               ③ 三条来源尽量覆盖「法规 / 技术 / 市场」三种视角。 */
  const PLAN = [
    {
      key: "compliance", icon: "⚖️", topic: "食品接触合规与迁移限量",
      why: "客户邮件里最高频的「合规雷区」：EU 10/2011、FDA 21 CFR、GB 4806。看懂原文才敢回复客户。",
      look: "关键词建议：food contact compliance / migration limit / declaration of compliance",
      srcs: [
        { name: "Packaging Europe", url: "https://packagingeurope.com/" },
        { name: "Packaging Digest", url: "https://www.packagingdigest.com/" },
        { name: "Plastics News", url: "https://www.plasticsnews.com/" }
      ]
    },
    {
      key: "sustain", icon: "♻️", topic: "可持续、可回收与 EPR",
      why: "欧洲买家近两年最常拿来压供应商的一条线：mono-material、recyclability、EPR 费用由谁承担。",
      look: "关键词建议：recyclable flexible packaging / mono-material PE / EPR packaging fee",
      srcs: [
        { name: "Sustainable Plastics", url: "https://www.sustainableplastics.com/" },
        { name: "Packaging Europe", url: "https://packagingeurope.com/" },
        { name: "Recycling Today", url: "https://www.recyclingtoday.com/" }
      ]
    },
    {
      key: "tech", icon: "🧪", topic: "膜材结构与复合工艺",
      why: "PET 12 / AL 7 / PE 60 这种结构怎么用英文讲清楚、上胶量与熟化时间怎么谈，是技术沟通的基本盘。",
      look: "关键词建议：solventless lamination / coating weight / bond strength / barrier film structure",
      srcs: [
        { name: "Converting Quarterly", url: "https://www.convertingquarterly.com/" },
        { name: "Flexible Packaging", url: "https://www.flexiblepackagingmag.com/" },
        { name: "Plastics News", url: "https://www.plasticsnews.com/" }
      ]
    },
    {
      key: "freight", icon: "🚢", topic: "运费、舱位与船期",
      why: "报价里最容易吃掉利润的一块。运价指数、旺季附加费、绕行与延误的说法，客户和货代都在用。",
      look: "关键词建议：container freight rate / peak season surcharge / blank sailing / schedule reliability",
      srcs: [
        { name: "The Loadstar", url: "https://theloadstar.com/" },
        { name: "Freightos", url: "https://www.freightos.com/" },
        { name: "JOC.com", url: "https://www.joc.com/" }
      ]
    },
    {
      key: "claim", icon: "🛡️", topic: "客诉与质量根因",
      why: "脱层、针孔、鱼眼、溶剂残留、COF 异常——8D 报告怎么写、根因怎么用英文说明白，是保住客户的关键。",
      look: "关键词建议：delamination root cause / pinhole defect / solvent retention / seal failure analysis",
      srcs: [
        { name: "Converting Quarterly", url: "https://www.convertingquarterly.com/" },
        { name: "Packaging Digest", url: "https://www.packagingdigest.com/" },
        { name: "Flexible Packaging", url: "https://www.flexiblepackagingmag.com/" }
      ]
    },
    {
      key: "market", icon: "📈", topic: "展会、新品与市场动向",
      why: "展会上客户第一句往往是「你们有什么新的」。看得懂新品发布稿，才有话可接。",
      look: "关键词建议：flexible packaging launch / trade show recap / new film grade / packaging innovation",
      srcs: [
        { name: "Packaging Europe", url: "https://packagingeurope.com/" },
        { name: "Flexible Packaging", url: "https://www.flexiblepackagingmag.com/" },
        { name: "Plastics News", url: "https://www.plasticsnews.com/" }
      ]
    }
  ];

  const E = function () { return window.FTE_BOOT || {}; };
  function esc(s) { const f = E().esc; return f ? f(s) : String(s == null ? "" : s); }
  function toast(m) { const t = E().toast; if (t) t(m); else console.log(m); }

  /* ---------------- ISO 周（纯函数：不依赖 Date.now，便于测试） ----------------
     用 ISO 口径而不是「本月第几周」：跨年那一周不会算错，且每周恰好 7 天。 */
  function weekIndex(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;                 // 周一=1 … 周日=7
    t.setUTCDate(t.getUTCDate() + 4 - day);         // 移到本周的周四
    const y = t.getUTCFullYear();
    const yStart = new Date(Date.UTC(y, 0, 1));
    const n = Math.ceil(((t - yStart) / 86400000 + 1) / 7);
    return { year: y, week: n };
  }
  function weekKey(d) {
    const w = weekIndex(d || new Date());
    return w.year + "-W" + String(w.week).padStart(2, "0");
  }
  /* 本周的主题：按 ISO 周数取模轮换（同一周内永远同一个，跨周自动换） */
  function current(d) {
    const day = d || new Date();
    const w = weekIndex(day);
    const idx = (w.week - 1) % PLAN.length;
    return Object.assign({ week: w, isoKey: weekKey(day) }, PLAN[idx]);
  }

  /* ---------------- 本周状态（跨周自动失效） ---------------- */
  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || "{}");
      return (o && typeof o === "object") ? o : {};
    } catch (e) { return {}; }
  }
  function save(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* 存储不可用：本次生效 */ }
  }
  function isDone(d) {
    const o = load();
    return !!o.done && o.week === weekKey(d || new Date());
  }
  function markDone(v, d) {
    const now = d || new Date();
    const wk = weekKey(now);
    const o = load();
    if (v === undefined) v = !(!!o.done && o.week === wk);
    save({ week: wk, done: !!v, at: new Date().toISOString() });
    return !!v;
  }

  /* ---------------- 「抓这个来源」→ 素材投料口 ----------------
     跨页传参不走 hash（会把 URL 塞进地址栏、污染路由），而是放在本模块的内存里，
     由 material.js 渲染时取走（takePending 取一次即清空）。 */
  let pendingUrl = "";
  function sendToMaterial(url) {
    pendingUrl = String(url || "");
    if (location.hash.indexOf("material") !== -1) {
      if (window.MaterialImport && window.MaterialImport.render) window.MaterialImport.render();
      return;
    }
    location.hash = "#/material";
  }
  function takePending() {
    const u = pendingUrl;
    pendingUrl = "";
    return u;
  }

  /* ---------------- 今日页区块（紧凑版：只给主题 + 入口 + 打卡） ----------------
     刻意不做成「永远挂着的全尺寸卡片」：站内对提醒的纪律是「不在日子上就不打扰」
     （见复测到期提醒）。本周投过料之后就收缩成一行事实，只留一个撤销入口。 */
  function html(d) {
    const c = current(d);
    const done = isDone(d);
    const wkn = "第 " + c.week.week + " 周";
    if (done) {
      return `
    <section class="td-weekly done">
      <div class="td-wk-head">
        <b>📅 本周新料 · ${wkn}</b>
        <span class="td-wk-sub">✅ 本周已投料：<b>${esc(c.topic)}</b>（下周自动换主题，不用管它）</span>
        <button class="td-lchip on" data-action="wk-done" aria-pressed="true" title="取消本周的「已投料」标记">↺ 撤销</button>
        <a class="td-lchip" href="#/material">📥 再投一篇也行</a>
      </div>
    </section>`;
    }
    return `
    <section class="td-weekly">
      <div class="td-wk-head">
        <b>📅 本周新料 · ${wkn}</b>
        <span class="td-wk-sub">站内 19 单元是静态语料；这一条给它每周续一次<b>新鲜的真实输入</b>（做完就换下一周的主题）</span>
        <button class="td-lchip" data-action="wk-done" aria-pressed="false" title="标记本周已投料">✓ 标记本周已投料</button>
      </div>
      <div class="td-wk-topic"><span class="td-wk-ic">${c.icon}</span><b>${esc(c.topic)}</b></div>
      <div class="td-wk-why">${esc(c.why)}</div>
      <div class="td-wk-ops">
        <a class="btn btn-primary btn-sm" href="#/material">📥 去投料（来源已备好）</a>
        ${c.srcs.map(function (s) {
          return '<button class="btn btn-soft btn-sm" data-action="wk-fetch" data-url="' + esc(s.url) + '" title="抓取这个来源，自动拆句后可送进字幕点读 / 五阶段闯关 / 单词卡 / 四维评分">🌐 抓 ' + esc(s.name) + "</button>";
        }).join("")}
      </div>
      <div class="field-note">抓回来会自动拆句，可一键送进<b>字幕点读 / 五阶段闯关 / 单词卡 / 四维评分</b>四个既有引擎。<b>投料本身不计入打卡</b>——打卡只记上面那五步。来源是公开行业媒体，本站不预置英文正文（站内语料有「人工核对」纪律），事实与法规请回到原文核对。</div>
    </section>`;
  }

  /* ---------------- 素材投料口顶部面板（完整版：主题 / 关键词 / 三个来源） ---------------- */
  function panelHtml(d) {
    const c = current(d);
    const done = isDone(d);
    return `
    <div class="card wk-panel" style="margin-top:8px;padding:14px 16px">
      <div class="td-wk-head">
        <b>📅 本周新料 · 第 ${c.week.week} 周 · ${esc(c.topic)}</b>
        <button class="td-lchip${done ? " on" : ""}" data-action="wk-done" aria-pressed="${done ? "true" : "false"}" title="${done ? "取消本周的「已投料」标记" : "标记本周已投料"}">${done ? "↺ 撤销已投料" : "✓ 标记本周已投料"}</button>
      </div>
      <div class="td-wk-why">${esc(c.why)}</div>
      <div class="field-note" style="margin:6px 0 8px">${esc(c.look)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${c.srcs.map(function (s) {
          return '<button class="btn btn-soft btn-sm" data-action="wk-fetch" data-url="' + esc(s.url) + '">🌐 抓 ' + esc(s.name) + "</button>";
        }).join("")}
        <span class="field-note" style="align-self:center">点一下会把该来源填进下面的输入框；再点「🌐 抓取网页正文」取回正文（走 Jina Reader，需联网）。抓不到就直接把正文粘贴进来，完全离线也能练。</span>
      </div>
      <div class="field-note" style="margin-top:8px">本周主题每周一自动轮换（按 ISO 周数，共 ${PLAN.length} 个主题循环）；「已投料」只记本周，跨周归零。<b>不计入打卡</b>：这里的动作是「找材料」，不是「练了多少」。</div>
    </div>`;
  }

  /* ---------------- 事件（全站委托，与站内其它模块同一写法） ---------------- */
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("click", function (e) {
      const el = e.target.closest ? e.target.closest("[data-action]") : null;
      if (!el) return;
      const act = el.getAttribute("data-action");
      if (act !== "wk-fetch" && act !== "wk-done") return;

      if (act === "wk-fetch") {
        const url = el.getAttribute("data-url") || "";
        if (!url) return;
        sendToMaterial(url);
        toast("📥 已带来源到「素材投料口」，点「🌐 抓取网页正文」取回正文");
        return;
      }
      /* wk-done：只记「本周投过料」，不动打卡、不动任何学习进度 */
      const nowDone = markDone(undefined);
      toast(nowDone ? "✅ 记下：本周已投料（跨周自动归零）" : "已取消本周的「已投料」标记");
      /* 原地重绘：今日页 / 素材页各自有 render，避免整页刷新丢输入 */
      try {
        if (location.hash.indexOf("material") !== -1 && window.MaterialImport && window.MaterialImport.render) window.MaterialImport.render();
        else if (window.Today && window.Today.render) window.Today.render();
      } catch (err) { /* 重绘失败不影响标记本身 */ }
    });
  }

  /* 供自动化测试/诊断使用（放在末尾，避免 const 的 TDZ——见 test-boot.js 头注） */
  window.Weekly = {
    html: html, panelHtml: panelHtml, current: current,
    weekIndex: weekIndex, weekKey: weekKey,
    isDone: isDone, markDone: markDone,
    sendToMaterial: sendToMaterial, takePending: takePending,
    PLAN: PLAN, KEY: KEY
  };
  window.Weekly._t = { weekIndex: weekIndex, weekKey: weekKey, current: current };
})();
