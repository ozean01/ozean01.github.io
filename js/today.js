/* ============ 🎯 今日（Today）============
   全站唯一权威入口：一个页面回答三件事——我在哪 / 今天做什么 / 为什么是这些。

   设计原则（这三点决定它和首页的区别）：
     · 一屏一决策：首屏只让用户做一个决定（现在首页首屏要他做五个）。
     · 唯一权威：任何时刻只有这一处回答「今天练什么」，不再和首页 6 大区 / 锚点 /
       目标筛选 / 旅程 Tab 并列竞争。
     · 有序而非推荐：下面是一条【有先后顺序】的清单，不是「推荐区」——用户不需要选，
       只需要按 1→5 做。

   刻意不发明新东西：这条日循环是把站内既有的「20 分钟模板」（3 热身 / 8 主题 /
   5 复盘 / 4 重说）与「今日任务」（句型 10 句 · 写作 1 篇）装配到一起，五个步骤全部
   深链到已有页面；完成打勾走已有的 CoachBridge 记账，立即进连续打卡 / 热力图 / 周报。

   依赖（按需读取）：window.FTE_BOOT（DATA/progress/coachStats/unitPct/pathStagesData）、
   window.CoachBridge（goal/done/credit）。零构建、无第三方依赖。
   渲染：window.Today.render()。 */
(function () {
  "use strict";

  window.Today = { render: render };
  /* 会话内状态：short = 「今天只有 5 分钟」精简模式 */
  const S = window.Today._state = { short: false };

  const KEY = "fte-today-v1";

  const E = function () { return window.FTE_BOOT || {}; };
  function esc(s) { const f = E().esc; return f ? f(s) : String(s == null ? "" : s); }
  function toast(m) { const t = E().toast; if (t) t(m); else console.log(m); }

  /* ---------------- 当日打勾状态（存 localStorage，不改进度 schema） ---------------- */
  function todayStr() {
    const bt = E().coachToday;
    if (bt) return bt();
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function loadDone() {
    const today = todayStr();
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (o && o.day === today && o.done && typeof o.done === "object") return o.done;
    } catch (e) { /* ignore */ }
    return {};   /* 跨天自动重置：昨天的勾不再算数 */
  }
  function saveDone(done) {
    try { localStorage.setItem(KEY, JSON.stringify({ day: todayStr(), done: done })); } catch (e) { /* ignore */ }
  }

  /* ---------------- 到期词数：直接读 FSRS 的 due，不触发建队/不产生副作用 ---------------- */
  function countDue(prog) {
    const now = Date.now();
    const flash = (prog && prog.flash) || {};
    let due = 0, total = 0;
    Object.keys(flash).forEach(function (id) {
      const f = flash[id];
      if (!f || typeof f.due !== "number") return;
      total++;
      if (f.due <= now) due++;
    });
    return { due: due, total: total };
  }

  /* ---------------- 当我所在的阶段 ---------------- */
  function stageOf(unitId) {
    const fn = E().pathStagesData;
    if (!fn) return null;
    const stages = fn();
    for (let i = 0; i < stages.length; i++) {
      if (stages[i].ids.indexOf(unitId) !== -1) {
        return { idx: i + 1, total: stages.length, name: stages[i].name, emoji: stages[i].emoji, desc: stages[i].desc, ids: stages[i].ids };
      }
    }
    return null;
  }

  /* ---------------- 工作目标 → 今天的练法（P2 个人化） ----------------
     用户在首页或看板选过「工作目标」（localStorage fte-home-goal）之前只影响首页高亮，
     「今日」完全不知道——于是无论目标是什么，当天清单都长一个样。这里把目标接进来：
     第 3 步（开口）按目标指向对应的实战场景，第 4 步（写作）按目标提示对应场景。 */
  const GOAL_PLAN = {
    prospect: { label: "开客户", unit: 2, scene: "展会接待 / 开发新客户", write: "开发信" },
    quote: { label: "报价议价", unit: 3, scene: "询盘报价", write: "回复询盘 · 报价" },
    negot: { label: "谈判签约", unit: 5, scene: "商务谈判", write: "商务谈判" },
    doc: { label: "跟单单证", unit: 12, scene: "物流与货运", write: "装运通知" },
    claim: { label: "客诉索赔", unit: 9, scene: "售后客诉处理", write: "售后客诉 · 复合膜脱层" },
    fair: { label: "展会接待", unit: 2, scene: "展会接待", write: "开发信" }
  };
  function goalPlan() {
    const load = E().homeGoalLoad;
    if (!load) return null;
    const id = load();
    return (id && id !== "all" && GOAL_PLAN[id]) ? GOAL_PLAN[id] : null;
  }

  /* 是否完全没开始过：决定「起点」是沿用进度，还是采用水平自测的推荐单元 */
  function isNewbie(prog) {
    return Object.keys((prog && prog.learned) || {}).length === 0 &&
      Object.keys((prog && prog.flash) || {}).length === 0 &&
      Object.keys((prog && prog.done) || {}).length === 0;
  }
  function startUnit(units, prog) {
    const boot = E();
    const doneOf = boot.unitDone || function (u) { return (boot.unitPct ? boot.unitPct(u) : 0) >= 100; };
    const pending = units.filter(function (u) { return !doneOf(u); });
    let u = pending[0] || units[units.length - 1] || null;
    /* 全新用户不默认从 U1 起步：若做过水平自测（#/placement），按它推荐的位置开始 */
    if (isNewbie(prog) && boot.placementUnit) {
      const placed = boot.placementUnit();
      if (placed) {
        const p = units.filter(function (x) { return x.id === placed; })[0];
        if (p && !doneOf(p)) u = p;
      }
    }
    return u || { id: 1, title: "第 1 单元", icon: "📘", dialogues: [] };
  }

  /* ---------------- 发音提醒（行为设计） ----------------
     一线教师评审的判断：「学员分不清 /θ/ /s/ **不是不懂口型，而是不练**」。
     所以光把高危音讲清楚没用——**得让它在日常动作里出现**。
     做法：从用户**自己错过的词**（progress.wrong）反查它们含哪些高危音，
     在「今日」上给一条**有证据、可点进去**的提示。
     没有证据（还没错过词 / 只错一两个）就不显示，避免变成永远挂着的装饰。
     高危音组与分词器都取自 js/phonemes.js，不另建一套数据。 */
  function pronFocus() {
    const boot = E();
    const prog = boot.progress || {};
    const ids = Object.keys(prog.wrong || {});
    if (!ids.length) return null;
    const P = window.Phonemes && window.Phonemes._t;
    if (!P || !P.HIGH_RISK || !P.tokenize || !P.INVENTORY) return null;
    const units = (boot.DATA && boot.DATA.units) || [];
    const count = {};
    let scanned = 0;
    ids.forEach(function (id) {
      const m = /^(\d+)-(\d+)$/.exec(String(id));
      if (!m) return;
      const u = units.filter(function (x) { return x.id === parseInt(m[1], 10); })[0];
      if (!u || !u.vocab) return;
      const v = u.vocab[parseInt(m[2], 10)];
      if (!v || !v.ipa) return;
      scanned++;
      const toks = P.tokenize(v.ipa);
      P.HIGH_RISK.forEach(function (g) {
        /* 一组可能有多个可匹配符号（如 "ks/kt/st"）；只取真正是音素 token 的 */
        const syms = String(g.sym).split("/").filter(function (s) { return P.INVENTORY.indexOf(s) !== -1; });
        if (syms.some(function (s) { return toks.indexOf(s) !== -1; })) {
          count[g.key] = (count[g.key] || 0) + 1;
        }
      });
    });
    if (!scanned) return null;
    const best = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })[0];
    if (!best || count[best] < 2) return null;   /* 只错 1 个词不足以说明问题，不打扰 */
    const g = P.HIGH_RISK.filter(function (x) { return x.key === best; })[0];
    return g ? { key: g.key, sym: g.sym, name: g.name, n: count[best], scanned: scanned } : null;
  }

  /* ---------------- 🧭 复测到期提醒（诊断层） ----------------
     由来：「水平自测」原先答完只写一个起点单元号——没有日期、没有分项、没有历史，
     于是站点结构上无法回答「我比 30 天前好了吗」。js/placement.js 补上了带日期的分项定级
     与第 7/30/90 天复测排期；这里负责**到日子了把人叫回来**——排期不提醒等于没有排期。
     不在日子上就完全不显示，避免变成永远挂着的装饰。 */
  function retestDue() {
    const boot = E();
    if (!boot.placementRetest) return null;
    const st = boot.placementRetest();
    if (!st || st.future) return null;           /* 还没到日子：不打扰 */
    return st;
  }

  /* ---------------- 🔄 中断回归协议 ----------------
     由来（节律账本 / 90 天计划）：站点有连续打卡与热力图，但**中断之后怎么办**完全没有设计——
     而「停了两周」恰恰是最常见的真实情况。最容易毁掉习惯的两种做法是**补作业**和**熬夜还债**，
     所以这里要做的不是催，而是给一条**小到不可能失败**的回归路径，并明确写清「这次不补什么」。
     三行事实 + 一条最小动作，不做人格判断。 */
  function comeback() {
    const boot = E();
    if (!boot.coachLastDate || !boot.coachToday) return null;
    const last = boot.coachLastDate();
    if (!last) return null;                       /* 从没练过：不算中断，走正常清单 */
    const today = boot.coachToday();
    const gap = dayGap(last, today);
    if (gap == null || gap < 2) return null;      /* 昨天练过 → 不算中断 */
    return { lastDate: last, gapDays: gap };
  }
  /* 两个 YYYY-MM-DD 之间的整天数（本地时区，不用 Date.parse 以免被当 UTC） */
  function dayGap(from, to) {
    const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(from || ""));
    const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(to || ""));
    if (!a || !b) return null;
    const d1 = new Date(+a[1], +a[2] - 1, +a[3]);
    const d2 = new Date(+b[1], +b[2] - 1, +b[3]);
    return Math.round((d2 - d1) / 86400000);
  }


  /* ---------------- 今天的五个步骤（有序） ----------------
     每步给：序号 / 图标 / 标题 / 预计分钟 / 依据（为什么是它）/ 深链 / 是否可自动判定。 */
  function buildSteps() {
    const boot = E();
    const units = (boot.DATA && boot.DATA.units) || [];
    const prog = boot.progress || {};
    const pctOf = boot.unitPct || function () { return 0; };

    const nextUnit = startUnit(units, prog);
    const unitPctVal = pctOf(nextUnit);
    const dlgN = (nextUnit.dialogues || []).length;
    const fresh = isNewbie(prog);
    const placed = fresh && boot.placementUnit ? boot.placementUnit() : null;
    const plan = goalPlan();

    const d = countDue(prog);
    const wrongN = Object.keys(prog.wrong || {}).length;
    const goal = (window.CoachBridge && window.CoachBridge.goal)
      ? window.CoachBridge.goal()
      : { write: { done: 0, target: 1 }, patterns: { done: 0, target: 10 } };
    const writeDone = goal.write.done >= goal.write.target;
    const stageN = boot.unitStageDone ? boot.unitStageDone(nextUnit) : 0;
    const threshold = boot.UNIT_DONE_PCT || 80;

    return [
      {
        key: "flash", icon: "🔁", title: "复习到期词", min: 4, href: "#/flash",
        why: d.due > 0 ? ("FSRS 到期 " + d.due + " 词") : (d.total > 0 ? "今天没有到期的，进度良好" : "还没建卡，先学几个新词"),
        auto: false
      },
      {
        key: "unit", icon: "📖", title: "学第 " + nextUnit.id + " 单元",
        sub: nextUnit.title, min: 5, href: "#/unit/" + nextUnit.id,
        why: (fresh && placed && nextUnit.id === placed)
          ? ("按你的水平自测结果，从这里开始（U" + placed + "）")
          : ("当前进度停在 U" + nextUnit.id + "（已掌握 " + unitPctVal + "%，达 " + threshold + "% 即算完成）"),
        auto: false
      },
      {
        key: "speak", icon: "🎤", title: "开口跟读", min: 5, href: "#/speak",
        why: plan
          ? ("你的目标「" + plan.label + "」→ 建议练「" + plan.scene + "」场景")
          : (dlgN > 0 ? ("U" + nextUnit.id + " 有 " + dlgN + " 段对话可以跟" + (stageN > 0 ? "（已闯关 " + stageN + " 段）" : "")) : "用五阶段闯关练一段"),
        auto: false
      },
      {
        key: "write", icon: "✍️", title: "写 1 篇", min: 4, href: "#/write",
        why: "今日写作 " + goal.write.done + "/" + goal.write.target +
          (plan ? " · 推荐场景「" + plan.write + "」" : "（保存即自动记账）"),
        auto: true, done: writeDone
      },
      {
        key: "review", icon: "⚠️", title: "复盘错题", min: 2, href: "#/mistakes",
        why: wrongN > 0 ? ("累计错词 " + wrongN + " 条") : "还没有错题，先看高频易错点避坑",
        auto: false
      }
    ];
  }

  function totalMin(steps, short) {
    return (short ? steps.slice(0, 2) : steps).reduce(function (a, s) { return a + s.min; }, 0);
  }

  /* ---------------- 🎧 连听本单元（P7 · 借鉴 ENGSENCE「连听所有例句」） ----------------
     碎片时间（通勤 / 做家务 / 看不了屏幕）的复习方式：把当前单元的英文素材串成一条音频，
     一句接一句自动读完，不用点、不用看。
     ⚠️ 三条边界：① 不新增第 6 步（五步清单与 20 分钟模板是站内冻结的架构）；
     ② 不加导航项（它作为「今日」页内区块存在，与「场景急救」同一位置策略）；
     ③ **不计入打卡**——打卡只记上面那五步，泛听混进"练了多少"的账会污染坚持口径。
     素材全部来自当前单元（词条例句 / 短语例句 / 对话），默认只读英文轨。 */
  const LISTEN_SCOPES = [
    { key: "all", label: "全部" },
    { key: "ex", label: "词条例句" },
    { key: "ph", label: "短语例句" },
    { key: "dlg", label: "对话" }
  ];
  function listenUnit() {
    const boot = E();
    const units = (boot.DATA && boot.DATA.units) || [];
    return startUnit(units, boot.progress || {});
  }
  /* 纯函数：把单元素材拍平成连听清单（无 DOM、无播放副作用，便于测试） */
  function listenItems(unit, scope) {
    const u = unit || listenUnit();
    if (!u) return [];
    const out = [];
    const push = function (tag, en, cn) {
      const e = String(en == null ? "" : en).trim();
      if (!e) return;
      out.push({ tag: tag, en: e, cn: String(cn == null ? "" : cn).trim() });
    };
    (u.vocab || []).forEach(function (v) { if (v && v.ex) push("词条例句", v.ex, v.exCn); });
    (u.phrases || []).forEach(function (p) { if (p && p.ex) push("短语例句", p.ex, p.exCn); });
    (u.dialogues || []).forEach(function (d) {
      ((d && d.lines) || []).forEach(function (l) { if (l && l.en) push("对话 · " + (d.title || "对话"), l.en, l.cn); });
    });
    const s = scope || "all";
    if (s === "all") return out;
    const want = s === "ex" ? "词条例句" : s === "ph" ? "短语例句" : "对话";
    return out.filter(function (x) { return x.tag.indexOf(want) === 0; });
  }
  function listenStop() {
    const L = S.listen || (S.listen = {});
    L.on = false;
    L.gen = (L.gen || 0) + 1;   // 让已排队/被打断的 onend 失效，避免"停了又自己往下读"
    if (L.timer) { clearTimeout(L.timer); L.timer = null; }
    try { if (window.Player && window.Player.stop) window.Player.stop(); } catch (e) { /* ignore */ }
    paintListen();
  }
  function listenStep() {
    const L = S.listen || (S.listen = {});
    const items = L.items || [];
    if (!L.on) return;
    if (L.i < 0) L.i = 0;
    if (L.i >= items.length) {
      L.on = false; L.i = items.length - 1;
      paintListen();
      toast("🎧 连听完毕（" + items.length + " 句）");
      return;
    }
    const it = items[L.i];
    paintListen();
    const P = window.Player;
    if (!P || !P.speak) { L.on = false; paintListen(); toast("当前环境不支持朗读"); return; }
    const g = L.gen || 0;
    const alive = function () { return L.on && (L.gen || 0) === g; };
    const advance = function (gap) {
      L.timer = setTimeout(function () {
        if (!alive()) return;
        L.i++;
        listenStep();
      }, gap);
    };
    P.speak(it.en, {
      rate: 0.95,
      onend: function () {
        if (!alive()) return;
        if (L.mix && it.cn) {
          L.timer = setTimeout(function () {
            if (!alive()) return;
            P.speak(it.cn, { rate: 1, onend: function () { if (alive()) advance(500); } });
          }, 400);
        } else advance(300);
      }
    });
  }
  function listenStart() {
    const L = S.listen || (S.listen = {});
    const items = listenItems(null, L.scope || "all");
    if (!items.length) { toast("本单元没有可连听的素材"); return; }
    L.items = items;
    L.gen = (L.gen || 0) + 1;
    if (L.i < 0 || L.i >= items.length) L.i = 0;
    L.on = true;
    listenStep();
  }
  /* 只做局部 DOM 更新，不整页 render()——否则每读一句都会把页面滚回顶部 */
  function paintListen() {
    const L = S.listen || {};
    const items = L.items || [];
    const btn = document.getElementById("tdListenPlay");
    if (btn) btn.textContent = L.on ? "⏸ 暂停连听" : "▶ 开始连听";
    const c = document.getElementById("tdListenCount");
    if (c) c.textContent = items.length ? Math.min(items.length, (L.i < 0 ? 0 : L.i) + 1) + " / " + items.length : "0 / 0";
    const now = document.getElementById("tdListenNow");
    if (now) {
      const it = items[L.i];
      now.innerHTML = it
        ? '<span class="td-listen-tag">' + esc(it.tag) + "</span>" + esc(it.en) +
          (L.mix && it.cn ? '<span class="td-listen-cn">' + esc(it.cn) + "</span>" : "")
        : "点「开始连听」，一句接一句自动读完。";
    }
    document.querySelectorAll("#app [data-lscope]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-lscope") === (L.scope || "all"));
    });
    const mix = document.getElementById("tdListenMix");
    if (mix) mix.classList.toggle("on", !!L.mix);
  }
  function listenHtml() {
    const L = S.listen || (S.listen = {});
    const n = listenItems(null, L.scope || "all").length;
    return `
    <section class="td-listen">
      <div class="td-listen-head">
        <b>🎧 连听本单元</b>
        <span class="td-listen-sub">通勤 / 做家务 / 看不了屏幕时的复习：一句接一句自动读完，不用点、不用看</span>
      </div>
      <div class="td-listen-ops">
        <button class="btn btn-primary btn-sm" id="tdListenPlay" data-action="td-listen-play">▶ 开始连听</button>
        <button class="btn btn-outline btn-sm" data-action="td-listen-prev">⏮ 上一句</button>
        <button class="btn btn-outline btn-sm" data-action="td-listen-next">⏭ 下一句</button>
        ${LISTEN_SCOPES.map(function (s) {
          return '<button class="td-lchip' + ((L.scope || "all") === s.key ? " on" : "") + '" data-action="td-listen-scope" data-scope="' + s.key + '">' + s.label + "</button>";
        }).join("")}
        <button class="td-lchip${L.mix ? " on" : ""}" id="tdListenMix" data-action="td-listen-mix" title="英文读完停一下，再读中文">🀄 英中交替</button>
        <span class="badge badge-muted" id="tdListenCount">0 / ${n}</span>
        <span class="field-note">共 ${n} 句 · 听力口音跟随「⚙️ 发音设置」（可切 🇬🇧 英音）；这里只做复习，<b>不计入打卡</b>——打卡只记上面那五步。</span>
      </div>
      <div class="td-listen-now" id="tdListenNow">点「开始连听」，一句接一句自动读完。</div>
    </section>`;
  }

  /* ---------------- 记账：打勾即计入连续打卡 / 今日时长 ---------------- */
  function creditMin(min) {
    try { if (window.CoachBridge && window.CoachBridge.credit) window.CoachBridge.credit(min * 60); } catch (e) { /* ignore */ }
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    const app = document.getElementById("app");
    if (!app) return;
    const boot = E();
    const steps = buildSteps();
    const done = loadDone();
    const st = boot.coachStats ? boot.coachStats() : { streak: 0, today: 0, totalMin: 0 };
    const totalLearned = boot.totalLearned ? boot.totalLearned() : 0;
    const cur = steps[1];                       /* 第 2 步一定指向当前单元 */
    const curId = parseInt((cur.href.match(/\/unit\/(\d+)/) || [])[1], 10) || 1;
    const stage = stageOf(curId);

    const visible = S.short ? steps.slice(0, 2) : steps;
    const isDone = function (s) { return s.auto ? s.done : !!done[s.key]; };
    const doneN = steps.filter(isDone).length;
    const allDone = doneN === steps.length;

    /* 只读「本周」区：看板并入今日后，全站计划源收敛为一处。
       默认展开（专家要求「本周入口常驻可见」），但可折叠以免挤压当天清单。 */
    let weekHtml = "";
    try {
      if (window.TaskBoard && window.TaskBoard.weekSummaryHtml) weekHtml = window.TaskBoard.weekSummaryHtml() || "";
    } catch (e) { weekHtml = ""; }

    const plan = goalPlan();
    const stageBar = (stage || plan)
      ? '<div class="td-stage">' +
        (stage ? '<span class="td-stage-n">' + stage.emoji + " 第 " + stage.idx + " / " + stage.total + " 阶段</span>" +
          '<b>' + esc(stage.name.replace(/^第[一二三]阶段\s*·\s*/, "")) + "</b>" : "") +
        (plan ? '<span class="td-goal" title="在首页「🗺 全站地图 → 按你的目标筛选」里修改">🎯 目标：' + esc(plan.label) + "</span>" : "") +
        '<span class="td-stage-d">' + esc(stage ? stage.desc : "") + "</span>" +
        "</div>"
      : "";

    const rows = visible.map(function (s, i) {
      const d = isDone(s);
      return `
      <div class="td-step${d ? " done" : ""}">
        <div class="td-n">${d ? "✓" : (i + 1)}</div>
        <div class="td-main">
          <div class="td-t"><span class="td-ic">${s.icon}</span><b>${esc(s.title)}</b>${
            s.sub ? '<span class="td-sub">' + esc(s.sub) + "</span>" : ""}<span class="td-min">${s.min} 分钟</span></div>
          <div class="td-why">${esc(s.why)}</div>
        </div>
        <div class="td-ops">
          <a class="btn btn-primary btn-sm" href="${s.href}">▶ 去做</a>
          ${s.auto
            ? '<span class="td-auto" title="保存写作后自动记账">' + (d ? "已自动记账" : "自动记账") + "</span>"
            : '<button class="td-tick' + (d ? " on" : "") + '" data-action="td-tick" data-key="' + s.key + '" title="' + (d ? "取消完成（会退回时长）" : "标记完成（计入打卡）") + '">' + (d ? "↺ 撤销" : "✓ 完成") + "</button>"}
        </div>
      </div>`;
    }).join("");

    // ⚠️ 这个模板字符串里绝不能出现块注释符号：模板会把注释原样渲染成页面上的可见文字。
    // 真机浏览时曾在「本周」区下方漏出一整段说明文字。需要说明就写在这里（模板之外）。
    app.innerHTML = `
    <div class="page-head">
      <div class="crumbs">今日</div>
      <h2>🎯 今天练这些 <span class="en">按顺序做完就行，不用挑</span></h2>
    </div>

    <section class="td-where">
      ${stageBar}
      <div class="td-where-row">
        <span>🔥 连续 <b>${st.streak}</b> 天</span>
        <span>⏱ 今天 <b>${st.today}</b> 分</span>
        <span>📚 累计 <b>${st.totalMin}</b> 分</span>
        <span>✅ 已掌握 <b>${totalLearned}</b> 词</span>
      </div>
    </section>

    ${(function () {
      const pf = pronFocus();
      if (!pf) return "";
      return '<div class="td-pron">🔤 <b>发音提醒</b>：你错过 <b>' + pf.scanned + "</b> 个词，其中 <b>" + pf.n +
        "</b> 个含 <b>" + esc(pf.sym) + "</b>（" + esc(pf.name) + "）。" +
        "这类音错了客户会直接听成别的词——先到 <a href=\"#/phonemes\">音素与辨音</a> 把那组过一遍，再回来跟读。</div>";
    })()}

    ${(function () {
      const cb = comeback();
      if (!cb) return "";
      return '<div class="td-comeback">' +
        '<div class="td-cb-head">🔄 <b>欢迎回来</b><span>距上次练习 ' + cb.gapDays + ' 天</span></div>' +
        '<div class="td-cb-row"><i>①</i><span><b>只记事实</b>：你上次练到 <b>' + esc(cb.lastDate) +
          '</b>，中间停了 <b>' + cb.gapDays + ' 天</b>。这只是记录，不作人格判断。</span></div>' +
        '<div class="td-cb-row"><i>②</i><span><b>24 小时内只做这一件</b>：' +
          '<button class="btn btn-primary btn-sm" data-action="td-comeback-min">⏱ 只做前两步（约 9 分钟）</button>' +
          '<em>不需要补完，做完这两步就算今天回来了。</em></span></div>' +
        '<div class="td-cb-row"><i>③</i><span><b>这次明确不补做</b>：不补那 ' + cb.gapDays +
          ' 天的作业，也不熬夜还债。连续打卡会从今天重新算（回到 1 天），' +
          '但<b>已掌握的词与 FSRS 排期不会清零</b>——进度不会倒退。</span></div>' +
        '<div class="td-cb-row"><i>④</i><span><b>如果同一个阻力已经连续出现三次</b>：改条件——' +
          '换时间盒、把任务缩小、换环境或换时段，而不是再逼自己一次。</span></div>' +
        '</div>';
    })()}

    ${(function () {
      const rt = retestDue();
      if (!rt) return "";
      const when = rt.overdue
        ? "第 " + rt.day + " 天复测已逾期 <b>" + rt.overdueDays + "</b> 天"
        : "今天是<b>第 " + rt.day + " 天复测日</b>";
      return '<div class="td-retest">🧭 <b>复测到期</b>：' + when + '（原定 ' + esc(rt.dueAt) + '）。' +
        '照<b>同样的四项任务</b>再测一次，但<b>换主题、换听众、换材料</b>——这才测的是能力，' +
        '把同一篇改一遍只测到记忆。到 <a href="#/placement">🧭 水平自测</a> 更新分项定级，' +
        '系统会跟上次逐项对比。</div>';
    })()}

    ${(window.Urgent && window.Urgent.html) ? window.Urgent.html() : ""}

    <section class="td-list-head">
      <b>今天的清单</b>
      <span class="td-count">${doneN} / ${steps.length} 完成 · 约 ${totalMin(steps, S.short)} 分钟</span>
      <button class="td-short${S.short ? " on" : ""}" data-action="td-short">${S.short ? "↺ 看完整清单" : "⏱ 今天只有 5 分钟"}</button>
    </section>

    <section class="td-list">${rows}</section>

    ${listenHtml()}

    ${weekHtml
      ? '<details class="td-week" open><summary><b>📅 本周</b>' +
        '<span class="td-week-sub">只读视图 · 计划源已统一到「今日」，不再另设看板</span></summary>' +
        '<div class="td-week-body">' + weekHtml + "</div></details>"
      : ""}

    ${allDone
      ? '<div class="td-finish"><b>🎉 今天这五步做完了</b><span>连续 ' + st.streak + " 天 · 今天 " + st.today + " 分。明天回来接着走，进度会自动往前推。</span>" +
        '<div class="td-finish-ops"><a class="btn btn-outline btn-sm" href="#/speaking">📡 看看口语水平</a>' +
        '<a class="btn btn-soft btn-sm" href="#/mysay">🗣 再多说一段也行</a></div></div>'
      : ""}

    <details class="td-why-box">
      <summary>为什么是这五步？</summary>
      <div class="td-why-body">
        <p>这条日循环不是新发明的，是站内两样东西装到一起：<b>20 分钟模板</b>（3 热身 / 8 主题 / 5 复盘 / 4 重说）与<b>今日任务</b>（句型 10 句 · 写作 1 篇）。</p>
        <p><b>顺序有讲究</b>：先复习到期词（记忆保质）→ 再学当前单元（输入新知）→ 立刻开口跟读（把刚学的说出来）→ 产出 1 篇（逼自己用出去）→ 最后复盘错题（把坑填上）。中间任何一步做完就算数，不用一次做完。</p>
        <p><b>想自己选？</b>全站功能在 <a href="#/home">🏠 首页</a>的「全站地图」里，随便逛；这里是「不知道练什么就直接照做」的那一条路。</p>
      </div>
    </details>
    `;
    window.scrollTo(0, 0);
  }

  /* ---------------- 事件 ---------------- */
  if (typeof document !== "undefined") document.addEventListener("click", function (e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const act = el.getAttribute("data-action");
    if (!act || act.indexOf("td-") !== 0) return;

    if (act === "td-short") { S.short = !S.short; render(); return; }

    /* 🎧 连听本单元（P7）：全部走局部 DOM 更新，不 render()，避免每读一句就滚回顶部 */
    if (act === "td-listen-play") {
      const L = S.listen || (S.listen = {});
      if (L.on) listenStop(); else listenStart();
      return;
    }
    if (act === "td-listen-prev" || act === "td-listen-next") {
      const L = S.listen || (S.listen = {});
      const items = listenItems(null, L.scope || "all");
      if (!items.length) { toast("本单元没有可连听的素材"); return; }
      L.items = items;
      const cur = (typeof L.i === "number" && L.i >= 0) ? L.i : 0;
      L.i = (cur + (act === "td-listen-next" ? 1 : -1) + items.length) % items.length;
      listenStop();          // 停当前句（会递增 gen，作废已排队的 onend）
      L.on = true;
      listenStep();
      return;
    }
    if (act === "td-listen-mix") {
      const L = S.listen || (S.listen = {});
      L.mix = !L.mix;
      paintListen();
      return;
    }
    if (act === "td-listen-scope") {
      const L = S.listen || (S.listen = {});
      L.scope = el.getAttribute("data-scope") || "all";
      listenStop();
      L.i = -1;
      L.items = listenItems(null, L.scope);
      paintListen();
      toast("连听范围：" + (LISTEN_SCOPES.filter(function (s) { return s.key === L.scope; })[0] || {}).label + "（" + L.items.length + " 句）");
      return;
    }

    /* 中断回归的「最小动作」：直接切到精简模式（只做前两步），
       不新增任何机制——它就是把站内已有的「今天只有 5 分钟」按一次。 */
    if (act === "td-comeback-min") { S.short = true; render(); return; }

    if (act === "td-tick") {
      const key = el.getAttribute("data-key");
      const step = buildSteps().filter(function (s) { return s.key === key; })[0];
      if (!step) return;
      const done = loadDone();
      if (done[key]) { delete done[key]; creditMin(-step.min); toast("已撤销「" + step.title + "」（退回 " + step.min + " 分钟）"); }
      else { done[key] = true; creditMin(step.min); toast("✅ 完成「" + step.title + "」，计入打卡 +" + step.min + " 分钟"); }
      saveDone(done);
      render();
      return;
    }
  });

  /* 供自动化测试/诊断使用（不影响运行时）。放在文件末尾：避免 const 的 TDZ。 */
  window.Today._t = {
    buildSteps: buildSteps, countDue: countDue, stageOf: stageOf, todayStr: todayStr, totalMin: totalMin,
    goalPlan: goalPlan, startUnit: startUnit, isNewbie: isNewbie, GOAL_PLAN: GOAL_PLAN,
    pronFocus: pronFocus,
    /* 🎧 连听本单元（P7）：清单构建是纯函数，必须有测试盯着——它决定"连听到底读什么" */
    listenItems: listenItems, LISTEN_SCOPES: LISTEN_SCOPES, listenUnit: listenUnit,
    /* 中断回归 + 复测到期：AI 无法自动判定的部分是「态度」，但这两者都是**可算的**
       （日期差 / 排期锚点），所以必须有测试盯着，见 tools/test-today.js。 */
    comeback: comeback, retestDue: retestDue, dayGap: dayGap
  };
})();
