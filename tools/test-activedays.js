#!/usr/bin/env node
/* ============ 验收门禁：活跃日台账（P3）============
   守的是什么：`js/app.js` 的「活跃日台账」必须在**旗舰路径**上工作。
   由来（评估发现）：`progress.coachDays` 的唯一写入点是 `coachPersist()`，而它只被 `#/coach`
   的 20 分钟计时器调用。于是**只走「今日」五步清单的用户**（走默认路径的核心用户）
   热力图永远全空、首个徽章永不解锁、周报里没有数据。

   本门禁用「截取被测函数 + 受控时钟 + 受控 progress」的方式做**行为级**断言，
   不启动整个站点（不依赖 DOM 沙箱），因此它对现有代码零副作用：
     1) 只走今日路径（调 coachAddSecs）→ activeDaySet 必须出现今天，且 coachBadgeStats().days >= 1
     2) 撤销到 0 分钟 → 今天的键必须被删除（否则徽章会用 Object.keys().length 假解锁）
     3) 历史迁移：只有 coachDays/studioDays 的老进度 → 首次 activeDaySet() 必须回填
     4) 回填只做一次：删掉的那天不会被再次复活
     5) 写点必须在 coachAddSecs 内（源码级断言，防止有人把台账挪回 coachPersist）

   运行：node tools/test-activedays.js   （在 外贸英语/ 目录下） */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const makeClock = require("./lib/clock.js");

const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");

let failed = 0;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info !== undefined ? "  " + info : ""));
  if (!cond) failed++;
}

/* ---------------- 源码级断言：写点必须在全站时长入口里 ---------------- */
check("js/app.js 里存在 activeDaySet / activeDaysMark", /function activeDaySet\s*\(/.test(APP) && /function activeDaysMark\s*\(/.test(APP));
const addSecsBody = (function () {
  const i = APP.indexOf("function coachAddSecs(");
  if (i < 0) return "";
  const j = APP.indexOf("\n  function ", i + 20);
  return APP.slice(i, j > 0 ? j : i + 900);
})();
check("coachAddSecs() 内调用了 activeDaysMark()（旗舰路径必须记账）", /activeDaysMark\s*\(\s*\)/.test(addSecsBody));
/* P3 的第二半：台账有了还不够——**徽章必须真的被授予**，否则用户仍然看不到反馈。
   （独立验证发现：只断言 coachBadgeStats().days >= 1 只覆盖了"输入"，没覆盖"被授予"：
   coachCheckBadges() 原先的唯一调用点在 coachPersist()，只被 #/coach 计时器触发。） */
const markBody = sliceFn("activeDaysMark");
/* 断言前**先剥掉注释**：独立验证的 F-11 指出，直接对源码正则会被函数体注释里的
   "coachCheckBadges()" 满足——把真实调用删掉、只留注释，门禁照样绿（漏过）。 */
const markCode = markBody.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
check("activeDaysMark() 会触发徽章评定（只走今日清单也要解锁首个徽章；已剔除注释干扰）",
  /coachCheckBadges\s*\(\s*\)/.test(markCode));

/* ---------------- 行为级：首个徽章的条件必须能被"今日路径"满足 ----------------
   独立验证指出：只断言 coachBadgeStats().days >= 1 覆盖的是"输入"，
   而用户看到的"解锁"发生在 coachCheckBadges() 里。这里不再自造一份评价逻辑
   （那正是"自证式测试"），而是**直接求值 js/app.js 源码里 COACH_BADGES[0].ok**：
     · ok(coachBadgeStats()) 必须为真 —— 证明"只走今日清单"这条路的统计量确实能满足首个徽章；
     · activeDaysMark() 必须调用 coachCheckBadges() —— 证明评定会被触发（上面已断言）。
   两者合起来，等于"首个徽章会被授予"，且用的都是产品源码。 */
(function () {
  const i = APP.indexOf("const COACH_BADGES = [");
  const j = APP.indexOf("];", i);
  check("能定位 COACH_BADGES 定义", i >= 0 && j > i);
  const badges = vm.runInNewContext("(function(){ " + APP.slice(i, j + 2) + " return COACH_BADGES; })()", {});
  check("COACH_BADGES 可求值且首个徽章带 ok 判定", Array.isArray(badges) && badges.length > 0 && typeof badges[0].ok === "function",
    badges.length + " 个徽章");
  const first = badges[0];
  /* 用**今日路径真实能产生的**统计量：只走一遍五步清单 → days=1、streak=1、total=0 */
  check("首个徽章（" + first.title + "）的条件能被「只走今日清单」满足",
    first.ok({ days: 1, streak: 1, total: 0, sessionDone: false }) === true);
  /* 反向：没有任何活跃日时不得满足（防止把条件写成恒真） */
  check("首个徽章在 0 活跃日时**不**满足（条件不是恒真）",
    first.ok({ days: 0, streak: 0, total: 0, sessionDone: false }) === false);
})();
check("FTE_BOOT 暴露 activeDaySet（供门禁与外部只读）", /activeDaySet:\s*activeDaySet/.test(APP));

/* ---------------- 截取被测函数，在受控上下文里求值 ---------------- */
function sliceFn(name) {
  const start = APP.indexOf("function " + name + "(");
  if (start < 0) throw new Error("找不到函数 " + name);
  /* 从函数头往后做花括号配平（跳过字符串/注释里的花括号：本文件这几个函数体内没有
     「{」出现在字符串字面量里的情况，配平足够可靠；配平失败会在断言里直接暴露） */
  let i = APP.indexOf("{", start), depth = 0, end = -1;
  for (let k = i; k < APP.length; k++) {
    const c = APP[k];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  if (end < 0) throw new Error("花括号配平失败：" + name);
  return APP.slice(start, end);
}

function buildHarness(fakeToday) {
  /* 受控时钟：`FTE_FAKE_DATE` + install() 会把**本进程**的 Date 冻结（clock.js 的实现），
     再把 Date 显式注入被测上下文 —— 否则 vm 里 new Date() 用的是宿主真实时间，
     断言就会"有时通过、有时失败"（本门禁第一版就踩过这个坑）。 */
  const clock = makeClock({ date: fakeToday });
  clock.install();
  const progress = {};
  const src = [
    sliceFn("coachPad"),
    sliceFn("coachToday"),
    sliceFn("activeDaySet"),
    sliceFn("activeDaysMark"),
    sliceFn("coachStats"),
    sliceFn("coachBadgeStats"),
    "return { activeDaySet: activeDaySet, activeDaysMark: activeDaysMark, coachToday: coachToday, coachBadgeStats: coachBadgeStats };"
  ].join("\n");
  const fn = vm.runInNewContext("(function(progress){ " + src + " })", { Object: Object, Math: Math, Date: Date });
  return { clock: clock, progress: progress, api: fn(progress) };
}

/* ---------------- 断言 1：只走「今日」路径也要留下活跃日 ---------------- */
(function () {
  const h = buildHarness("2026-10-05");
  h.progress.coach = { lastDate: "", today: 0, total: 0, streak: 0 };
  /* 今日五步：第 1/2/3/5 步是 4/5/5/2 分钟 → creditMin(min) → credit(min*60) 秒 */
  [4, 5, 5, 2].forEach(function (m) { h.progress.coach.today += m * 60; h.progress.coach.total += m * 60; h.api.activeDaysMark(); });
  const set = h.api.activeDaySet();
  check("只走今日五步清单 → 今天进入活跃日台账", set["2026-10-05"] >= 16, JSON.stringify(set));
  check("只走今日五步清单 → 徽章统计 days >= 1（修复前恒为 0）", h.api.coachBadgeStats().days >= 1, "days=" + h.api.coachBadgeStats().days);
})();

/* ---------------- 断言 2：撤销到 0 分钟必须删键（防徽章假解锁） ---------------- */
(function () {
  const h = buildHarness("2026-10-05");
  h.progress.coach = { lastDate: "", today: 0, total: 0, streak: 0 };
  h.progress.coach.today += 4 * 60; h.api.activeDaysMark();
  check("先记 4 分钟 → 今天在台账里", h.api.activeDaySet()["2026-10-05"] >= 4);
  h.progress.coach.today -= 4 * 60;                  /* today.js:617 的「撤销」= creditMin(-min) */
  h.api.activeDaysMark();
  check("撤销到 0 分钟 → 今天的键必须被删除（徽章不得假解锁）", !("2026-10-05" in h.api.activeDaySet()), JSON.stringify(h.api.activeDaySet()));
  check("撤销后徽章统计 days === 0", h.api.coachBadgeStats().days === 0);
})();

/* ---------------- 断言 3：历史迁移（老用户的 coachDays/studioDays 不能丢） ---------------- */
(function () {
  const h = buildHarness("2026-10-05");
  h.progress.coach = { lastDate: "2026-10-01", today: 0, total: 0, streak: 3 };
  h.progress.coachDays = { "2026-09-20": 12, "2026-09-21": 8, "2026-09-22": 0 };
  h.progress.studioDays = { "2026-09-21": { patterns: 3, write: 0 }, "2026-09-25": { patterns: 0, write: 1 } };
  const set = h.api.activeDaySet();
  check("迁移：coachDays 有分钟的日子被回填（2026-09-20）", set["2026-09-20"] >= 1);
  check("迁移：coachDays 里 0 分钟的日子**不**被回填（2026-09-22）", !("2026-09-22" in set));
  check("迁移：studioDays 的日子被回填（2026-09-25）", set["2026-09-25"] >= 1);
  check("迁移：只在首次进行，标记已置位", h.progress.activeDaysInit === true);
  check("迁移后徽章天数 = 3", h.api.coachBadgeStats().days === 3, "days=" + h.api.coachBadgeStats().days);
  delete set["2026-09-20"];
  h.api.activeDaySet();
  check("回填只做一次：手动删掉的那天不会被复活", !("2026-09-20" in h.api.activeDaySet()));
})();

/* ---------------- 断言 4：日期口径与全站唯一实现一致 ---------------- */
(function () {
  /* 注意：install() 一旦冻结本进程的 Date，就无法在同一进程里再换一个冻结日
     （clock.js 有意只冻结一次，避免"同一进程两个现在"这种更危险的状态）。
     所以这里做两件可判定的事：
       ① 用 clock.js 的 dateStr 直接验证补零口径（这是全站唯一实现）；
       ② 验证 coachToday() 在受控时钟下输出严格 YYYY-MM-DD 且与 clock.today() 同源。 */
  const probe = makeClock({ date: "2026-01-05" });
  check("全站唯一日期实现：月与日都补零", probe.dateStr(new Date(2026, 0, 5)) === "2026-01-05", probe.dateStr(new Date(2026, 0, 5)));
  check("全站唯一日期实现：个位数月份也补零", probe.dateStr(new Date(2026, 8, 9)) === "2026-09-09", probe.dateStr(new Date(2026, 8, 9)));
  const h = buildHarness("2026-10-05");
  const t = h.api.coachToday();
  check("coachToday() 输出严格 YYYY-MM-DD（10 位，月日各 2 位）", /^\d{4}-\d{2}-\d{2}$/.test(t), t);
  check("coachToday() 与受控时钟同源", t === h.clock.today(), t + " vs " + h.clock.today());
})();

console.log("\n========================================");
if (failed > 0) { console.log("❌ 失败断言数：" + failed); process.exit(1); }
console.log("✅ 活跃日台账（P3）全部断言通过。");
process.exit(0);
