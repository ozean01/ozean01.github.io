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
  /* P1-C · .ics 的 DESCRIPTION 里要带站点位置（S12：日历是站外唯一能留下入口的地方）。
     地址口径与 index.html 的 canonical 一致（线上站点：https://ozean01.github.io/）。
     ⚠️ 只在这里声明一次：本文件的 icsText/planTomorrow 各有一份历史副本（重复函数声明合法），
     但同一个作用域里重复声明 const 会直接 SyntaxError。 */
  const SITE_URL = "https://ozean01.github.io/#/today";

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

  /* ---------------- 明天会发生什么（P6 · 明日锚点） ----------------
     为什么需要它（评估发现 G-03）：站内所有回访钩子（中断回归 / 复测提醒 / 本周新料）
     **都是 pull 型**——只有用户自己打开 #/today 才看得到；而 sw.js 没有 push 监听，
     纯静态站也确实做不了推送。于是"回来的决定"完全没有着力点。
     但**离开的那一刻**是用户还在场、且不需要任何后端的唯一位置：现在那里只给了两个
     "再干点别的"链接（口语测评 / 说我想说），没有一句关于明天的话。
     本区块做三件小事，都复用站内既有数据，不新增存储键、不新增导航/路由/第 6 步：
       ① 一句可被验证的"明天第一件事"（到期词数 / 当前单元）
       ② 生成一个**日历提醒**（.ics，本地生成，不上传任何东西）
       ③ 一段可复制的提醒文本（剪贴板不可用时的兜底）

     纪律（沿用中断回归的克制口径，不做"催作业"）：
       · 只陈述事实，不加"别放弃""要坚持"这类话；
       · **不承诺效果**（日历里只写"5 分钟起步"，不写"坚持 30 天口语变流利"）；
       · 不做人格判断，也不把明天说成义务。 */
  function dueWithin(prog, fromTs, toTs) {
    /* 区间语义：**[fromTs, toTs) 左闭右开**。调用方传 [明天 00:00, 后天 00:00) →
       "今天 23:59:59.999"不算、"明天 00:00:00.000"算、"后天 00:00:00.000"**不算**。
       （独立验证抓到过一个 off-by-one：右闭版本把"后天 00:00 整"也算进明天，
        会让明天的到期数虚高 1；而原先用 `fromTs - 1` 补左边界是掩盖问题，现已去掉。） */
    const flash = (prog && prog.flash) || {};
    let n = 0;
    Object.keys(flash).forEach(function (id) {
      const f = flash[id];
      if (!f || typeof f.due !== "number") return;
      if (f.due >= fromTs && f.due < toTs) n++;
    });
    return n;
  }
  /* 明天的 00:00 → 后天的 00:00（本地时区；用本地日界而不是"24 小时后"，
     否则 23:00 打开时会算成"明天到期的很少"） */
  function tomorrowWindow() {
    const a = new Date(); a.setHours(0, 0, 0, 0);
    const b = new Date(a.getTime()); b.setDate(b.getDate() + 1);
    const c = new Date(a.getTime()); c.setDate(c.getDate() + 2);
    return { start: b.getTime(), end: c.getTime(), dayStart: b };
  }
  function planTomorrow() {
    const boot = E();
    const prog = boot.progress || {};
    const units = (boot.DATA && boot.DATA.units) || [];
    const w = tomorrowWindow();
    const due = dueWithin(prog, w.start, w.end);
    const u = startUnit(units, prog);
    const first = due > 0
      ? "先清掉 " + due + " 个到期词（约 4 分钟）"
      : (isNewbie(prog) ? "从 " + (u.title || "第 1 单元") + " 开始（约 5 分钟）"
                        : "继续 " + (u.title || "当前单元") + "（约 5 分钟）");
    return { due: due, unit: u, first: first, at: w.dayStart };
  }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  /* 本地时间 → .ics 的 UTC 时间戳（YYYYMMDDTHHMMSSZ）。日历客户端只认这一种，
     写成带偏移的本地格式在部分客户端会被拒绝。 */
  function icsStamp(ms) {
    const d = new Date(ms);
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + "T" +
      pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + "Z";
  }
  function icsText(plan) {
    /* 定在明天 20:00，时长 20 分钟（与站内 20 分钟模板一致）。默认 20:00 是"下班后"，
       不写死成工作时间，也不假装知道用户的作息——用户可在日历里改。 */
    const at = new Date(plan.at.getTime()); at.setHours(20, 0, 0, 0);
    const end = new Date(at.getTime() + 20 * 60000);
    const line = plan.first;
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//softpackaging-english//today//CN", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:fte-" + icsStamp(at) + "@local",
      "DTSTAMP:" + icsStamp(Date.now()),
      "DTSTART:" + icsStamp(at.getTime()),
      "DTEND:" + icsStamp(end.getTime()),
      /* P1-C · S12：「只响一次」等于回到 pull 型——加日重复（30 天）才有回访作用。
         随用户生活节律走：每天 20:00，20 分钟一场，30 天后自然停（不写"永久"，也不催）。 */
      "RRULE:FREQ=DAILY;COUNT=30",
      "SUMMARY:" + "外贸英语 · 明天这一件",
      "DESCRIPTION:" + line + "\\n20 分钟不够也没关系，做完第一步就算数。\\n站内练习入口：" + SITE_URL,
      "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:外贸英语 · 30 分钟后开始", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"
    ].join("\r\n") + "\r\n";
  }
  function tomorrowAnchor() {
    const plan = planTomorrow();
    const note = plan.due > 0
      ? "今天练过的词会在明天到期；先把它们过一遍，比学新词更划算。"
      : "明天没有到期的词，所以第一件事是往前学一点。";
    return '<div class="td-tomorrow">' +
      '<b>🌙 明天第一件事</b>' +
      '<span class="td-tm-main">' + esc(plan.first) + "</span>" +
      '<span class="td-tm-note">' + esc(note) + "</span>" +
      '<div class="td-tm-ops">' +
      '<button class="btn btn-outline btn-sm" data-action="td-tm-ics">📅 加到日历（本地生成）</button>' +
      '<button class="btn btn-soft btn-sm" data-action="td-tm-copy">📋 复制提醒</button>' +
      "</div>" +
      '<span class="field-note">日历文件在你本机生成，不上传；不想被提醒就不点。' +
      "如果你中途停了几天，站内只会把事实写出来、不会催你补作业。</span>" +
      "</div>";
  }
  function copyTomorrow() {
    const plan = planTomorrow();
    /* 时长只在 plan.first 里出现一次（它已带"约 N 分钟"），
       此前这里又拼了一句"（约 5 分钟…）"，复制出来会变成"（约 4 分钟）（约 5 分钟…）"自相冲突。 */
    const txt = "【外贸英语】明天第一件事：" + plan.first + "，做完一步就算数";
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { toast("📋 已复制，明天看到就照着做"); },
          function () { toast(txt); });
        return;
      }
    } catch (e) { /* 落到下面的兜底 */ }
    toast(txt);
  }
  function downloadTomorrowIcs() {
    const plan = planTomorrow();
    try {
      const blob = new Blob([icsText(plan)], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "外贸英语-明天这一件.ics";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast("📅 已生成日历文件；导入后你会在明天 20:00 收到提醒");
    } catch (e) {
      toast("生成日历文件失败：" + (e && e.message ? e.message : "浏览器不支持下载"));
    }
  }

  /* ---------------- 明天会发生什么（P6 · 明日锚点） ----------------
     为什么需要它（评估发现 G-03）：站内所有回访钩子（中断回归 / 复测提醒 / 本周新料）
     都是 pull 型——只有用户自己打开 #/today 才看得到；而 sw.js 没有 push 监听，
     纯静态站也确实做不了推送。但**离开的那一刻**是用户还在场、且不需要后端的唯一位置：
     现在那里只给了两个"再干点别的"链接，没有一句关于明天的话。
     本区块做三件小事，复用站内既有数据，不新增存储键、不新增导航/路由/第 6 步：
       ① 一句可被验证的"明天第一件事"（到期词数 / 当前单元）
       ② 生成一个日历提醒（.ics，本地生成，不上传任何东西）
       ③ 一段可复制的提醒文本（剪贴板不可用时的兜底）
     纪律（沿用中断回归的克制口径）：只陈述事实、不承诺效果、不做人格判断。 */
  function dueWithin(prog, fromTs, toTs) {
    /* 区间语义：**[fromTs, toTs) 左闭右开**。调用方传 [明天 00:00, 后天 00:00) →
       "今天 23:59:59.999"不算、"明天 00:00:00.000"算、"后天 00:00:00.000"**不算**。
       （独立验证抓到过 off-by-one：右闭版本会把"后天 00:00 整"算进明天，让到期数虚高 1。） */
    const flash = (prog && prog.flash) || {};
    let n = 0;
    Object.keys(flash).forEach(function (id) {
      const f = flash[id];
      if (!f || typeof f.due !== "number") return;
      if (f.due >= fromTs && f.due < toTs) n++;
    });
    return n;
  }
  /* 明天的 00:00 → 后天的 00:00（本地时区；用本地日界而不是"24 小时后"，
     否则 23:00 打开时会算成"明天到期的很少"） */
  function tomorrowWindow() {
    const a = new Date(); a.setHours(0, 0, 0, 0);
    const b = new Date(a.getTime()); b.setDate(b.getDate() + 1);
    const c = new Date(a.getTime()); c.setDate(c.getDate() + 2);
    return { start: b.getTime(), end: c.getTime(), dayStart: b };
  }
  function planTomorrow() {
    const boot = E();
    const prog = boot.progress || {};
    const units = (boot.DATA && boot.DATA.units) || [];
    const w = tomorrowWindow();
    const due = dueWithin(prog, w.start, w.end);
    const u = startUnit(units, prog);
    const first = due > 0
      ? "先清掉 " + due + " 个到期词（约 4 分钟）"
      : (isNewbie(prog) ? "从 " + (u.title || "第 1 单元") + " 开始（约 5 分钟）"
                        : "继续 " + (u.title || "当前单元") + "（约 5 分钟）");
    return { due: due, unit: u, first: first, at: w.dayStart };
  }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  /* 本地时间 → .ics 的 UTC 时间戳（YYYYMMDDTHHMMSSZ）。日历客户端只认这一种，
     写成带偏移的本地格式在部分客户端会被拒绝。 */
  function icsStamp(ms) {
    const d = new Date(ms);
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + "T" +
      pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + "Z";
  }
  function icsText(plan) {
    /* 定在明天 20:00，时长 20 分钟（与站内 20 分钟模板一致）。
       刻意不写"坚持 30 天口语变流利"这类效果承诺——日历里只写要做的那一件事。 */
    const at = new Date(plan.at.getTime()); at.setHours(20, 0, 0, 0);
    const end = new Date(at.getTime() + 20 * 60000);
    const line = plan.first;
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//softpackaging-english//today//CN", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:fte-" + icsStamp(at) + "@local",
      "DTSTAMP:" + icsStamp(Date.now()),
      "DTSTART:" + icsStamp(at.getTime()),
      "DTEND:" + icsStamp(end.getTime()),
      /* P1-C · S12：与上面那份 icsText 副本同口径——只响一次的日历等于没有回访，
         补日重复 30 天；DESCRIPTION 里补站点入口（日历客户端可点）。 */
      "RRULE:FREQ=DAILY;COUNT=30",
      "SUMMARY:" + "外贸英语 · 明天这一件",
      "DESCRIPTION:" + line + "\\n20 分钟不够也没关系，做完第一步就算数。\\n站内练习入口：" + SITE_URL,
      "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:外贸英语 · 30 分钟后开始", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"
    ].join("\r\n") + "\r\n";
  }
  function tomorrowAnchor() {
    const plan = planTomorrow();
    const note = plan.due > 0
      ? "今天练过的词会在明天到期；先把它们过一遍，比学新词更划算。"
      : "明天没有到期的词，所以第一件事是往前学一点。";
    return '<div class="td-tomorrow">' +
      '<b>🌙 明天第一件事</b>' +
      '<span class="td-tm-main">' + esc(plan.first) + "</span>" +
      '<span class="td-tm-note">' + esc(note) + "</span>" +
      '<div class="td-tm-ops">' +
      '<button class="btn btn-outline btn-sm" data-action="td-tm-ics">📅 加到日历（本地生成）</button>' +
      '<button class="btn btn-soft btn-sm" data-action="td-tm-copy">📋 复制提醒</button>' +
      "</div>" +
      '<span class="field-note">日历文件在你本机生成，不上传；不想被提醒就不点。' +
      "如果你中途停了几天，站内只会把事实写出来、不会催你补作业。</span>" +
      "</div>";
  }
  function copyTomorrow() {
    const plan = planTomorrow();
    /* 时长只在 plan.first 里出现一次（它已带"约 N 分钟"）——
       此前这里又拼了一句"（约 5 分钟…）"，复制出来会变成"（约 4 分钟）（约 5 分钟…）"自相冲突。 */
    const txt = "【外贸英语】明天第一件事：" + plan.first + "，做完一步就算数";
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { toast("📋 已复制，明天看到就照着做"); },
          function () { toast(txt); });
        return;
      }
    } catch (e) { /* 落到下面的兜底 */ }
    toast(txt);
  }
  function downloadTomorrowIcs() {
    const plan = planTomorrow();
    try {
      const blob = new Blob([icsText(plan)], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "外贸英语-明天这一件.ics";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast("📅 已生成日历文件；导入后你会在明天 20:00 收到提醒");
    } catch (e) {
      toast("生成日历文件失败：" + (e && e.message ? e.message : "浏览器不支持下载"));
    }
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
    /* ESP 任务画像：显式勾选的岗位任务 > 默认顺序（仍让位于水平自测的位置建议） */
    if (taskProfile(prog).length) {
      const pick = pickUnitByProfile(units, prog, doneOf);
      if (pick) u = pick.unit;
    }
    return u || { id: 1, title: "第 1 单元", icon: "📘", dialogues: [] };
  }

  /* ---------------- 🎯 岗位任务画像（ESP needs analysis）----------------
     由来（外部方法论对标 2026-10-24）：ESP 教学法的标准工作流是「需求分析 → 围绕真实
     岗位任务设计 → 任务型评估」。本站「测起点」测的是 CEFR 水平，但从不问「你的工作里
     哪几件事最常发生」。这里补上第一块：多选岗位任务 → 驱动「今日」的单元推荐与
     AI 实战关卡的推荐（通识 App 结构性做不到，垂直站的护城河）。
     口径：画像只影响**推荐顺序**，不锁死任何内容；不选则维持默认顺序。 */
  const PROFILE_TASKS = [
    { k: "quote", label: "询盘与报价" },
    { k: "order", label: "催单与跟单" },
    { k: "payment", label: "收款与付款" },
    { k: "claim", label: "客诉与纠纷" },
    { k: "logistics", label: "物流与订舱" },
    { k: "exhibition", label: "展会接待" },
    { k: "tech", label: "技术沟通" },
    { k: "compliance", label: "合规与认证" },
    { k: "meeting", label: "会议与汇报" }
  ];
  /* 单元 → 任务映射（按单元 summary/对话场景人工标注；新增单元时同步补） */
  const UNIT_TASKS = {
    1: ["quote"], 2: ["exhibition"], 3: ["quote"], 4: ["quote"], 5: ["quote"],
    6: ["payment"], 7: ["logistics", "compliance"], 8: ["meeting", "order"],
    9: ["claim"], 10: ["claim"], 11: ["tech"], 12: ["order", "logistics"],
    13: ["logistics"], 14: ["quote"], 15: ["payment"], 16: ["claim", "compliance"],
    17: ["tech"], 18: ["compliance", "claim"], 19: ["meeting"]
  };
  function taskProfile(prog) {
    return (prog && Array.isArray(prog.taskProfile)) ? prog.taskProfile : [];
  }
  function unitTaskOverlap(u, profile) {
    const tags = UNIT_TASKS[u && u.id] || [];
    return tags.filter(function (t) { return profile.indexOf(t) !== -1; }).length;
  }
  /* 纯函数：按画像在未完成单元里挑重叠任务最多的（平手取靠前的）；无画像/无命中 → null */
  function pickUnitByProfile(units, prog, doneOf) {
    const profile = taskProfile(prog);
    if (!profile.length) return null;
    let best = null, bestScore = 0;
    (units || []).forEach(function (u) {
      if (doneOf && doneOf(u)) return;
      const score = unitTaskOverlap(u, profile);
      if (score > bestScore) { bestScore = score; best = u; }
    });
    if (!best) return null;
    const matched = (UNIT_TASKS[best.id] || []).filter(function (t) { return profile.indexOf(t) !== -1; })
      .map(function (t) {
        const h = PROFILE_TASKS.filter(function (x) { return x.k === t; })[0];
        return h ? h.label : t;
      });
    return { unit: best, score: bestScore, matched: matched };
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
    const doneOf2 = boot.unitDone || function (u) { return (boot.unitPct ? boot.unitPct(u) : 0) >= 100; };
    const profPick = taskProfile(prog).length ? pickUnitByProfile(units, prog, doneOf2) : null;
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
    /* P11 · 段级复听：到期段优先（唯一数据源 js/seg-review.js；模块缺失时静默回落到原逻辑，
       因为今日页在 tools/test-today.js 里会被单独加载，没有该模块也必须有完整行为）。 */
    const SR = window.SegReview;
    let dueSegs = [];
    try { dueSegs = (SR && SR.dueList) ? SR.dueList(Date.now()) : []; } catch (e) { dueSegs = []; }
    const firstDue = dueSegs[0] || null;
    const dueLabel = firstDue ? ("U" + firstDue.uid + " · " + (firstDue.title || "对话")) : "";

    return [
      {
        key: "flash", icon: "🔁", title: "复习到期词", min: 4, href: "#/flash",
        why: d.due > 0 ? ("FSRS 到期 " + d.due + " 词") : (d.total > 0 ? "今天没有到期的，进度良好" : "还没建卡，先学几个新词"),
        /* P1-C · 完成口径（S01）：每一步在 UI 上写明「怎么才算完成、怎么才记账」，
           不再让用户自己猜。四步是**自报**：点「✓ 完成」才计入打卡。 */
        credit: "自报：做完点「✓ 完成」才计入打卡",
        auto: false
      },
      {
        key: "unit", icon: "📖", title: "学第 " + nextUnit.id + " 单元",
        sub: nextUnit.title, min: 5, href: "#/unit/" + nextUnit.id,
        why: (profPick && profPick.unit.id === nextUnit.id)
          ? ("按你的岗位任务画像：U" + nextUnit.id + " 覆盖你选的「" + profPick.matched.join("、") + "」（已自评标记 " + unitPctVal + "%）")
          : ((fresh && placed && nextUnit.id === placed)
            ? ("按你的水平自测结果，从这里开始（U" + placed + "）")
            : ("当前进度停在 U" + nextUnit.id + "（已自评标记 " + unitPctVal + "%，达 " + threshold + "% 即算完成）")),
        credit: "自报：做完点「✓ 完成」才计入打卡（进度按上面的自评标记百分比算）",
        auto: false
      },
      {
        key: "speak",
        icon: firstDue ? "🔁" : "🎤",
        title: firstDue ? "复听到期段" : "开口跟读",
        min: 5,
        href: firstDue ? ("#/speak/" + firstDue.key) : "#/speak",
        why: firstDue
          ? ("⏰ " + dueSegs.length + " 段到点复听（最早：" + dueLabel + "，" + firstDue.whenText + "）。" +
            (plan ? "目标「" + plan.label + "」的「" + plan.scene + "」可在复听完后补" : "走完五阶段才算记一轮"))
          : (plan
            ? ("你的目标「" + plan.label + "」→ 建议练「" + plan.scene + "」场景")
            : (dlgN > 0 ? ("U" + nextUnit.id + " 有 " + dlgN + " 段对话可以跟" + (stageN > 0 ? "（已闯关 " + stageN + " 段）" : "")) : "用五阶段闯关练一段")),
        credit: firstDue
          ? "自报：点「✓ 完成」只记打卡；复听轮次由「真正走完五阶段」推进（勾完成不推进轮次）"
          : "自报：练完点「✓ 完成」才计入打卡（站内不核对录音）",
        auto: false,
        dueN: dueSegs.length,
        dueKey: firstDue ? firstDue.key : ""
      },
      {
        key: "write", icon: "✍️", title: "写 1 篇", min: 4, href: "#/write",
        /* P1-C · 完成口径（S01）：写作那一步**不是**自报，是站内按词数自动判定
           （js/write.js 的 MIN_PROD_WORDS = 40：不足 40 词仍然保存作品，但不记账）。
           只写「保存即自动记账」会与那条口径冲突，所以在依据与 credit 里都写明词数门槛。 */
        why: "今日写作 " + goal.write.done + "/" + goal.write.target +
          (plan ? " · 推荐场景「" + plan.write + "」" : "") +
          " · 保存且 ≥40 词才自动记账",
        credit: "自动：保存且 ≥40 词（一封最短完整回信）才记账；不足 40 词仍保存作品，但不计入打卡",
        auto: true, done: writeDone
      },
      {
        key: "review", icon: "⚠️", title: "复盘错题", min: 2, href: "#/mistakes",
        why: wrongN > 0 ? ("累计错词 " + wrongN + " 条") : "还没有错题，先看高频易错点避坑",
        credit: "自报：看完点「✓ 完成」才计入打卡",
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
      /* 听后测（P1-8）：听完测「听懂了多少」——从刚播过的句子里抽 3 句选意 */
      S.listenQuizItems = items;
      listenQuizStart(items);
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
    if (btn) {
      btn.textContent = L.on ? "⏸ 暂停连听" : "▶ 开始连听";
      btn.title = L.on ? "暂停当前的连听" : "从当前句开始，一句接一句自动读完";
    }
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
    /* 连听范围是单选胶囊：`.on` 必须跟着 L.scope 走。
       原来这里查的是 `[data-lscope]`，而按钮渲染出来的是 `data-scope`——
       属性名不一致 → 查询永远为空 → 点「词条例句」后高亮仍停在「全部」（实测确认）。 */
    document.querySelectorAll('#app [data-action="td-listen-scope"]').forEach(function (b) {
      const on = b.getAttribute("data-scope") === (L.scope || "all");
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
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
        <button class="btn btn-primary btn-sm" id="tdListenPlay" data-action="td-listen-play" title="${L.on ? "暂停当前的连听" : "从当前句开始，一句接一句自动读完"}">${L.on ? "⏸ 暂停连听" : "▶ 开始连听"}</button>
        <button class="btn btn-outline btn-sm" data-action="td-listen-prev">⏮ 上一句</button>
        <button class="btn btn-outline btn-sm" data-action="td-listen-next">⏭ 下一句</button>
        ${LISTEN_SCOPES.map(function (s) {
          return '<button class="td-lchip' + ((L.scope || "all") === s.key ? " on" : "") + '" data-action="td-listen-scope" data-scope="' + s.key + '" aria-pressed="' + ((L.scope || "all") === s.key ? "true" : "false") + '" title="只连听这个范围的内容">' + s.label + "</button>";
        }).join("")}
        <button class="td-lchip${L.mix ? " on" : ""}" id="tdListenMix" data-action="td-listen-mix" title="英文读完停一下，再读中文">🀄 英中交替</button>
        <span class="badge badge-muted" id="tdListenCount">0 / ${n}</span>
        <span class="field-note">共 ${n} 句 · 听力口音跟随「⚙️ 发音设置」（可切 🇬🇧 英音）；这里只做复习，<b>不计入打卡</b>——打卡只记上面那五步。</span>
      </div>
      <div class="td-listen-now" id="tdListenNow">点「开始连听」，一句接一句自动读完。</div>
      <div id="tdListenQuiz"></div>
      ${lastListenCheckHtml()}
    </section>`;
  }

  /* ---------------- 🎯 连听听懂率检验（P1-8）----------------
     由来：连听（P7）是「放过型」泛听——听完无任何理解度检验，「听过」≠「听懂」。
     做法：连听完毕后，从**刚播过的**句子里抽 3 句，再听一遍 + 从 3 个中文意思里选出听到的那个；
     题目与选项全部本地生成（en/cn 都来自已人工核对的站内语料，零新增未核对英文/中文）。
     口径：结果标「自选听后测」，只作为能力参考展示在连听块内；不计入打卡（坚持/能力分栏纪律）。
     泛听混进"练了多少"的账会污染坚持口径——它记的是「听懂了多少」。 */
  const QUIZ_COUNT = 3;
  /* 纯函数（rnd 可注入便于测试）：从 items 里抽 count 题造「听句选意」题。
     素材不足（可用的带中文释义句子 < 4：1 题 + 至少 3 个不同选项）时返回 null。 */
  function makeListenQuiz(items, count, rnd) {
    const rand = rnd || Math.random;
    const pool = (items || []).filter(function (it) {
      return it && it.en && it.cn && String(it.cn).trim().length > 1;
    });
    if (pool.length < 4) return null;
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
    }
    const qs = [];
    for (let k = 0; k < shuffled.length && qs.length < (count || QUIZ_COUNT); k++) {
      const correct = shuffled[k];
      /* 干扰项：与正确答案中文不同的其它句子的释义 */
      const others = pool.filter(function (it) { return it !== correct && it.cn !== correct.cn; });
      if (others.length < 2) continue;
      const distract = [];
      const seen = {};
      for (let j = 0; j < others.length && distract.length < 2; j++) {
        const c = others[j].cn;
        if (!seen[c]) { seen[c] = true; distract.push(c); }
      }
      if (distract.length < 2) continue;
      const opts = [correct.cn, distract[0], distract[1]];
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const t = opts[i]; opts[i] = opts[j]; opts[j] = t;
      }
      qs.push({ en: correct.en, cn: correct.cn, tag: correct.tag, opts: opts });
    }
    return qs.length ? qs : null;
  }
  function lastListenCheckHtml() {
    try {
      const p = E().progress || null;   /* FTE_BOOT 只暴露 progress getter（无 getProgress 方法） */
      const lc = p && p.listenCheck;
      if (!lc || !lc.n) return "";
      return '<div class="field-note" style="margin-top:6px">📊 最近一次听后测：<b>' + lc.right + "/" + lc.n + "</b>" +
        (lc.t ? " · " + new Date(lc.t).toLocaleDateString() : "") + "（自选听后测，能力参考，不计入打卡）</div>";
    } catch (e) { return ""; }
  }
  function listenQuizStart(items) {
    const qs = makeListenQuiz(items, QUIZ_COUNT);
    if (!qs) { toast("这个范围的句子太少（至少 4 句不同释义），先多听几句再来测"); return; }
    S.listenQuiz = { qs: qs, idx: 0, right: 0, picked: null, phase: "ask" };
    paintListenQuiz();
    const q = qs[0];
    if (window.Player && window.Player.speak) window.Player.speak(q.en, { rate: 0.95 });
  }
  function paintListenQuiz() {
    const box = document.getElementById("tdListenQuiz");
    if (!box) return;
    const Q = S.listenQuiz;
    if (!Q) { box.innerHTML = ""; return; }
    if (Q.phase === "done") {
      box.innerHTML =
        '<div class="td-listen-now" style="margin-top:8px"><b>🎯 听后测完成：' + Q.right + " / " + Q.qs.length + "</b><br>" +
        '<span style="font-size:12.5px;color:var(--muted)">' +
        (Q.right === Q.qs.length ? "全对——这段材料你真的听懂了。" : "错的句子回「精听跟读」里逐句过一遍，下周连听再测一次。") +
        "（自选听后测，能力参考，不计入打卡）</span> " +
        '<button class="btn btn-soft btn-sm" data-action="td-quiz-redo" style="margin-left:6px">🔁 换 3 句再测</button></div>';
      return;
    }
    const q = Q.qs[Q.idx];
    const answered = Q.picked != null;
    box.innerHTML =
      '<div class="td-listen-now" style="margin-top:8px"><span class="td-listen-tag">听后测 ' + (Q.idx + 1) + "/" + Q.qs.length + "</span>你听到的是哪个意思？" +
      '<button class="btn btn-soft btn-sm" data-action="td-quiz-replay" style="margin-left:6px">🔊 再听一遍</button>' +
      '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;align-items:stretch">' +
      q.opts.map(function (opt, k) {
        let cls = "btn btn-outline btn-sm";
        if (answered) {
          if (opt === q.cn) cls = "btn btn-ok btn-sm";
          else if (k === Q.picked) cls = "btn btn-outline btn-sm";
          else cls = "btn btn-soft btn-sm";
        }
        return '<button class="' + cls + '" data-action="td-quiz-pick" data-k="' + k + '"' + (answered ? " disabled" : "") + ">" +
          esc(opt) + (answered && opt === q.cn ? " ✓" : "") + "</button>";
      }).join("") +
      "</div>" +
      (answered
        ? '<div style="margin-top:6px;font-size:12.5px;color:' + (Q.picked === q.opts.indexOf(q.cn) ? "var(--ok)" : "var(--bad)") + '">' +
          (Q.picked === q.opts.indexOf(q.cn) ? "✓ 答对了" : "✗ 正确答案：") + ' <b>' + esc(q.cn) + "</b></div>" +
          '<button class="btn btn-primary btn-sm" data-action="td-quiz-next" style="margin-top:6px">' + (Q.idx + 1 >= Q.qs.length ? "看结果 →" : "下一题 →") + "</button>"
        : "") +
      "</div>";
  }
  function listenQuizFinish() {
    const Q = S.listenQuiz;
    if (!Q) return;
    Q.phase = "done";
    paintListenQuiz();
    try {
      const boot = E();
      const p = boot.progress || null;  /* 同上：progress getter + saveProgress */
      if (p && boot.saveProgress) {
        p.listenCheck = { t: Date.now(), n: Q.qs.length, right: Q.right };
        boot.saveProgress();
      }
    } catch (e) { /* 留存失败不影响展示 */ }
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
          <div class="td-why" data-credit="1">记账口径：${esc(s.credit || "")}</div>
        </div>
        <div class="td-ops">
          <a class="btn btn-primary btn-sm" href="${s.href}">▶ 去做</a>
          ${s.auto
            ? '<span class="td-auto" title="保存且 ≥40 词后由站内自动记账">' + (d ? "已自动记账" : "自动记账") + "</span>"
            : '<button class="td-tick' + (d ? " on" : "") + '" data-action="td-tick" data-key="' + s.key + '" title="' + (d ? "取消完成（会退回时长）" : "自报完成（计入打卡）") + '">' + (d ? "↺ 撤销" : "✓ 完成") + "</button>"}
        </div>
      </div>`;
    }).join("");

    // ⚠️ 这个模板字符串里绝不能出现块注释符号：模板会把注释原样渲染成页面上的可见文字。
    // 真机浏览时曾在「本周」区下方漏出一整段说明文字。需要说明就写在这里（模板之外）。
    //
    // 📅 「本周新料」的位置（P9）：放在**五步清单与连听之下**。它是「每周一条投料节律」，
    //    不是今天必须做的一步——放上面会把「首屏只让人做一个决定」这条设计原则挤掉。
    //
    // 🚨 P1-C · 「场景急救」的位置（S09 实测：首屏 14 个区块，急救排在五步清单**之前**）：
    //    急救是「客户五分钟后打来」的逃生口，但它**不是今天要做的那一步**——排在清单之前时，
    //    首屏第一个可点的东西变成了 15 个场景 chip，把「只让人做一个决定」挤掉（且与
    //    js/urgent.js 自述的「不打断当天进度」、本文件「一屏一决策」自相矛盾）。
    //    现在它**后移到五步清单之下**，并保持 js/urgent.js 自带的默认折叠形态（details 未展开，
    //    入口文案仍是「🚨 客户马上要谈什么？」）——功能一个都不删，只是不再抢首屏。
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
        <span>✅ 已自评标记 <b>${totalLearned}</b> 词</span>
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
          '但<b>已自评标记的词与 FSRS 排期不会清零</b>——进度不会倒退。</span></div>' +
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

    ${(function () {
      const prof = taskProfile(boot.progress);
      return '<details class="td-profile" style="margin:10px 0 0">' +
        '<summary style="cursor:pointer;font-size:13.5px"><b>🎯 岗位任务画像</b>' +
        (prof.length ? '<span class="badge badge-ok" style="margin-left:6px">已选 ' + prof.length + ' 项 · 今日推荐已按此倾斜</span>' : '<span class="badge badge-muted" style="margin-left:6px">未设置</span>') +
        '<span style="color:var(--muted);font-size:12px;margin-left:6px">（ESP 需求分析：选你工作里最常做的事，今日的单元与关卡推荐向它倾斜）</span></summary>' +
        '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">' +
        PROFILE_TASKS.map(function (t) {
          const on = prof.indexOf(t.k) !== -1;
          return '<button class="td-lchip' + (on ? " on" : "") + '" data-action="td-profile" data-k="' + t.k + '" aria-pressed="' + (on ? "true" : "false") + '">' + t.label + "</button>";
        }).join("") +
        "</div>" +
        '<div style="margin-top:6px;font-size:12px;color:var(--muted)">只影响推荐顺序，不锁死内容；随时可改。存在本机（progress.taskProfile），随备份迁移。</div>' +
        "</details>";
    })()}

    <section class="td-list-head">
      <b>今天的清单</b>
      <span class="td-count">${doneN} / ${steps.length} 完成 · 约 ${totalMin(steps, S.short)} 分钟</span>
      <button class="td-short${S.short ? " on" : ""}" data-action="td-short">${S.short ? "↺ 看完整清单" : "⏱ 今天只有 5 分钟"}</button>
    </section>

    <section class="td-list">${rows}</section>

    <div class="field-note" data-credit-legend="1">记账口径：五步各自写明了怎么才算完成——四步由你自己点「✓ 完成」（自报，点了才计入打卡），写作那一步由站内按词数自动判定。连听与场景急救只做练习，<b>不计入打卡</b>；打卡只记上面那五步。</div>

    ${(window.Urgent && window.Urgent.html) ? window.Urgent.html() : ""}

    ${listenHtml()}

    ${(window.Weekly && window.Weekly.html) ? window.Weekly.html() : ""}

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

    ${tomorrowAnchor()}

    <div class="td-migrate">
      <b>🔄 换电脑 / 换手机？</b>
      <span>学习进度只存在本浏览器（本站没有后端，不上传也不同步）。要接着学，就先把进度带走：</span>
      <button class="btn btn-outline btn-sm" data-action="data-export" title="把全部学习进度下载成一个 JSON 备份文件">⬇️ 导出进度备份</button>
      <button class="btn btn-outline btn-sm" data-action="data-import" title="在新设备上选择之前导出的备份文件恢复进度">⬆️ 导入备份</button>
      <span class="field-note">在微信里打开 / 装到桌面 / 分享给同事的办法见 ⚙ 设置页「📱 在微信里打开」。</span>
    </div>

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

    /* 🌙 明日锚点（P6）：两件都不需要联网或后端 */
    if (act === "td-tm-ics") { downloadTomorrowIcs(); return; }
    if (act === "td-tm-copy") { copyTomorrow(); return; }

    /* 🌙 明日锚点（P6）：两件都不需要联网或后端 */
    if (act === "td-tm-ics") { downloadTomorrowIcs(); return; }
    if (act === "td-tm-copy") { copyTomorrow(); return; }

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
      S.listenQuiz = null;
      paintListen();
      const qb2 = document.getElementById("tdListenQuiz");
      if (qb2) qb2.innerHTML = "";
      toast("连听范围：" + (LISTEN_SCOPES.filter(function (s) { return s.key === L.scope; })[0] || {}).label + "（" + L.items.length + " 句）");
      return;
    }

    /* 🎯 听后测（P1-8）：纯局部 DOM 更新，与连听同一位置策略 */
    if (act === "td-quiz-replay") {
      const Q = S.listenQuiz;
      if (Q && Q.qs[Q.idx]) { const P = window.Player; if (P && P.speak) P.speak(Q.qs[Q.idx].en, { rate: 0.95 }); }
      return;
    }
    if (act === "td-quiz-pick") {
      const Q = S.listenQuiz;
      if (!Q || Q.picked != null) return;
      const q = Q.qs[Q.idx];
      Q.picked = parseInt(el.getAttribute("data-k"), 10);
      if (q.opts[Q.picked] === q.cn) Q.right++;
      paintListenQuiz();
      return;
    }
    if (act === "td-quiz-next") {
      const Q = S.listenQuiz;
      if (!Q || Q.picked == null) return;
      Q.picked = null;
      Q.idx++;
      if (Q.idx >= Q.qs.length) { listenQuizFinish(); return; }
      paintListenQuiz();
      const q = Q.qs[Q.idx];
      const P = window.Player;
      if (P && P.speak) P.speak(q.en, { rate: 0.95 });
      return;
    }
    if (act === "td-quiz-redo") {
      listenQuizStart(S.listenQuizItems || S.listen && S.listen.items || []);
      return;
    }

    /* 中断回归的「最小动作」：直接切到精简模式（只做前两步），
       不新增任何机制——它就是把站内已有的「今天只有 5 分钟」按一次。 */
    if (act === "td-comeback-min") { S.short = true; render(); return; }

    if (act === "td-profile") {
      const k = el.getAttribute("data-k");
      const boot2 = E();
      const p = boot2.progress || {};
      const prof = taskProfile(p).slice();
      const i = prof.indexOf(k);
      if (i !== -1) prof.splice(i, 1); else prof.push(k);
      p.taskProfile = prof;
      if (boot2.saveProgress) boot2.saveProgress();
      render();
      return;
    }
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
    /* 🎯 岗位任务画像（ESP）：映射与挑选是纯函数，必须测试盯着 */
    PROFILE_TASKS: PROFILE_TASKS, UNIT_TASKS: UNIT_TASKS, taskProfile: taskProfile, pickUnitByProfile: pickUnitByProfile,
    /* 🎯 听后测（P1-8）：题目生成是纯函数（rnd 可注入），必须测试盯着：
       选项去重、正确答案必在、素材不足明确拒判——测出假题比不测更糟 */
    makeListenQuiz: makeListenQuiz, QUIZ_COUNT: QUIZ_COUNT,
    /* 中断回归 + 复测到期：AI 无法自动判定的部分是「态度」，但这两者都是**可算的**
       （日期差 / 排期锚点），所以必须有测试盯着，见 tools/test-today.js。 */
    comeback: comeback, retestDue: retestDue, dayGap: dayGap,
    /* 🌙 明日锚点（P6）：判据必须可被测试盯着 —— 它决定"明天第一件事"是什么，
       以及 .ics 的时间戳格式（日历客户端只认 UTC 的 YYYYMMDDTHHMMSSZ）。 */
    planTomorrow: planTomorrow, icsText: icsText, icsStamp: icsStamp, dueWithin: dueWithin
  };
})();
