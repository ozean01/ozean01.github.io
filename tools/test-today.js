#!/usr/bin/env node
/* 验收测试：🎯 今日 (js/today.js)。
   最有价值的一条是 ⑤「深链交叉校验」：把 buildSteps() 产出的每个 href 拿去和 app.js
   里真实注册的路由表比对——「今日」是整个站的主入口，它指向一个不存在的页面是最伤的故障，
   而且静态站点没有后端会报 404，只有用户点到才发现。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

/* ---------------- 合成一个可控的 FTE_BOOT ---------------- */
const UNITS = [
  { id: 1, title: "外贸基础术语与贸易流程", icon: "🌐", dialogues: [{ lines: [] }, { lines: [] }] },
  { id: 2, title: "开发新客户与展会英语", icon: "🏢", dialogues: [{ lines: [] }] },
  { id: 3, title: "询盘与报价", icon: "💰", dialogues: [] }
];
const TODAY = (function () { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()); })();
const DAY = 86400000;

function freshProgress() {
  return {
    learned: { "1-0": 1, "1-1": 1 },
    wrong: {},
    flash: {},
    coach: { streak: 3, today: 480, total: 7200, lastDate: TODAY }
  };
}
/* 3 张卡：2 张已到期、1 张未到期 */
function progressWithCards() {
  const p = freshProgress();
  p.flash = {
    "1-0": { due: Date.now() - DAY, reps: 2, stability: 1 },
    "1-1": { due: Date.now() - 5 * DAY, reps: 3, stability: 2 },
    "1-2": { due: Date.now() + 5 * DAY, reps: 1, stability: 9 }
  };
  p.wrong = { "1-0": 3, "2-1": 1 };
  return p;
}

/* 把 window/FTE_BOOT 装好后再 require 模块 */
const appEl = { innerHTML: "" };
global.document = {
  addEventListener: function () { },
  getElementById: function (id) { return id === "app" ? appEl : null; },
  querySelector: function () { return null; }
};
global.localStorage = {
  _d: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};

let PROGRESS = freshProgress();
let GOAL = { patterns: { done: 0, target: 10 }, write: { done: 0, target: 1 } };
let PLACEMENT = null;          /* 水平自测推荐的起点单元 */
let GOAL_ID = "all";           /* 工作目标 id */
const CREDITED = [];
const pctOf = function (u) { return u.id === 1 ? 40 : 0; };

global.window = {
  scrollTo: function () { },
  FTE_BOOT: {
    DATA: { units: UNITS },
    get progress() { return PROGRESS; },
    esc: function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); },
    toast: function () { },
    coachToday: function () { return TODAY; },
    coachStats: function () {
      const c = PROGRESS.coach;
      return { streak: c.streak, today: Math.floor(c.today / 60), totalMin: Math.floor(c.total / 60) };
    },
    unitWords: function (u) { return u.vocab || []; },
    unitLearned: function () { return 2; },
    unitPct: pctOf,
    /* P2：完成判定改为「掌握 ≥80% 或手动标记」，不再要求 100% */
    unitDone: function (u) { return !!((PROGRESS.done || {})[u.id]) || pctOf(u) >= 80; },
    unitStageDone: function () { return 0; },
    UNIT_DONE_PCT: 80,
    /* P2 个人化：工作目标 + 水平自测起点 */
    homeGoalLoad: function () { return GOAL_ID; },
    placementUnit: function () { return PLACEMENT; },
    totalLearned: function () { return Object.keys(PROGRESS.learned).length; },
    getUnit: function (id) { return UNITS.filter(function (u) { return u.id === id; })[0]; },
    pathStagesData: function () {
      return [
        { name: "第一阶段 · 商务基础", emoji: "🟢", desc: "搭起外贸的地基", ids: [1, 2] },
        { name: "第二阶段 · 通用外贸", emoji: "🔵", desc: "覆盖常见场景", ids: [3] }
      ];
    }
  },
  CoachBridge: {
    goal: function () { return GOAL; },
    credit: function (s) { CREDITED.push(s); },
    done: function () { }
  }
};

require(path.join(ROOT, "js", "today.js"));
const T = global.window.Today;
const H = T._t;

/* ---------------- ① 模块形态 ---------------- */
check("导出 Today.render", T && typeof T.render === "function");
check("导出测试钩子 _t", !!H && typeof H.buildSteps === "function" && typeof H.countDue === "function");

/* ---------------- ② 五步的顺序与字段（顺序本身就是教学法，锁死它） ---------------- */
const steps = H.buildSteps();
check("产出 5 个步骤", steps.length === 5, "n=" + steps.length);
check("顺序为 复习→学→说→写→复盘",
  steps.map(function (s) { return s.key; }).join(",") === "flash,unit,speak,write,review",
  steps.map(function (s) { return s.key; }).join(","));
check("每步都有标题/时长/依据/深链",
  steps.every(function (s) { return s.title && s.min > 0 && s.why && /^#\//.test(s.href); }));
check("时长合计 20 分钟（复用站内 20 分钟模板）",
  steps.reduce(function (a, s) { return a + s.min; }, 0) === 20,
  steps.reduce(function (a, s) { return a + s.min; }, 0) + " 分钟");
check("第 2 步指向当前（未完成）单元 U1", steps[1].href === "#/unit/1", steps[1].href);
check("第 2 步依据里带掌握度与完成阈值", /40%/.test(steps[1].why) && /80%/.test(steps[1].why), steps[1].why);

/* ---------------- ③′ P2 个人化：工作目标 + 水平自测起点 ---------------- */
check("未设目标时第 3 步依据用单元对话数", /段对话可以跟/.test(steps[2].why), steps[2].why);
check("未设目标时第 4 步依据为自动记账", /自动记账/.test(steps[3].why), steps[3].why);

GOAL_ID = "claim";
const sg = H.buildSteps();
check("设了「客诉索赔」目标后第 3 步指向对应场景",
  /客诉索赔/.test(sg[2].why) && /售后客诉处理/.test(sg[2].why), sg[2].why);
check("设了目标后第 4 步推荐对应写作场景",
  /售后客诉 · 复合膜脱层/.test(sg[3].why), sg[3].why);
check("goalPlan 对未知目标返回 null", (function () { GOAL_ID = "nope"; return H.goalPlan(); })() === null);
GOAL_ID = "all";
check("goals 为 all 时不做场景改写", H.goalPlan() === null);
check("GOAL_PLAN 覆盖首页全部 6 个工作目标",
  Object.keys(H.GOAL_PLAN).length === 6, Object.keys(H.GOAL_PLAN).join(","));

/* 起点：全新用户 + 做过水平自测 → 不默认从 U1 开始 */
PROGRESS = { learned: {}, wrong: {}, flash: {}, coach: { streak: 0, today: 0, total: 0 } };
PLACEMENT = 3;
const sp = H.buildSteps();
check("全新用户 + 自测推荐 U3 → 第 2 步指向 U3", sp[1].href === "#/unit/3", sp[1].href);
check("第 2 步依据说明来自水平自测", /水平自测/.test(sp[1].why), sp[1].why);
PLACEMENT = null;
const sp2 = H.buildSteps();
check("没有自测结果时回落到 U1", sp2[1].href === "#/unit/1", sp2[1].href);
/* 已有进度的用户不受自测结果影响（进度优先） */
PROGRESS = progressWithCards();
PLACEMENT = 3;
const sp3 = H.buildSteps();
check("已有进度时忽略自测起点（进度优先）", sp3[1].href === "#/unit/1", sp3[1].href);
PLACEMENT = null;
PROGRESS = freshProgress();

/* isNewbie 判定 */
check("isNewbie 全空为 true", H.isNewbie({ learned: {}, flash: {}, done: {} }) === true);
check("isNewbie 有词即 false", H.isNewbie({ learned: { "1-0": 1 } }) === false);
check("isNewbie 有卡即 false", H.isNewbie({ flash: { a: {} } }) === false);
check("isNewbie 容忍 null", H.isNewbie(null) === true);

/* ---------------- ③ 依据随数据变化 ---------------- */
PROGRESS = progressWithCards();
const s2 = H.buildSteps();
check("到期词数从 FSRS 的 due 算出（3 张卡里 2 张到期）",
  /到期 2 词/.test(s2[0].why), s2[0].why);
check("错词数进第 5 步依据", /累计错词 2 条/.test(s2[4].why), s2[4].why);
check("当前单元有 2 段对话时依据正确", /2 段对话/.test(s2[2].why), s2[2].why);

GOAL = { patterns: { done: 0, target: 10 }, write: { done: 1, target: 1 } };
const s3 = H.buildSteps();
check("写作完成时第 4 步标记为自动完成（auto + done）",
  s3[3].auto === true && s3[3].done === true);
check("写作未完成时不标记", s2[3].done === false);

/* ---------------- ④ 边界：全新用户（无任何进度） ---------------- */
PROGRESS = { learned: {}, wrong: {}, flash: {}, coach: { streak: 0, today: 0, total: 0 } };
GOAL = { patterns: { done: 0, target: 10 }, write: { done: 0, target: 1 } };
const s0 = H.buildSteps();
check("全新用户不报错且仍给 5 步", s0.length === 5);
check("全新用户第 2 步指向 U1", s0[1].href === "#/unit/1", s0[1].href);
check("全新用户到期词依据为「还没建卡」", /还没建卡/.test(s0[0].why), s0[0].why);
check("全新用户错题为「还没有错题」", /还没有错题/.test(s0[4].why), s0[4].why);

/* ---------------- ⑤ 深链交叉校验：每个 href 都必须是 app.js 里真实注册的路由 ---------------- */
const appjs = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
const routeBlob = (appjs.match(/if \(\[([\s\S]*?)\]\.indexOf\(parts\[0\]\)/) || [])[1] || "";
const ROUTES = (routeBlob.match(/"([a-z]+)"/g) || []).map(function (s) { return s.replace(/"/g, ""); });
/* 另有一批路由走单独分支（parts[0] === "unit" / "search"），不在数组里，必须一并收集，
   否则会把合法的 #/unit/N 误判成坏链。 */
(appjs.match(/parts\[0\] === "([a-z]+)"/g) || []).forEach(function (s) {
  const r = s.replace(/.*"([a-z]+)"/, "$1");
  if (ROUTES.indexOf(r) === -1) ROUTES.push(r);
});
check("成功提取 app.js 路由表（含单独分支）", ROUTES.length > 18 && ROUTES.indexOf("unit") !== -1, "n=" + ROUTES.length);

PROGRESS = progressWithCards();
const allSteps = H.buildSteps();
const badRoutes = allSteps.map(function (s) { return s.href.split("/")[1]; })
  .filter(function (v) { return ROUTES.indexOf(v) === -1; });
check("今日的每个深链都指向真实注册的路由", badRoutes.length === 0, badRoutes.join(", "));
check("路由表里含 today", ROUTES.indexOf("today") !== -1);

/* ---------------- ⑥ countDue / stageOf / todayStr / totalMin ---------------- */
const d = H.countDue(progressWithCards());
check("countDue 数出 2 个到期 / 共 3 张", d.due === 2 && d.total === 3, JSON.stringify(d));
check("countDue 忽略缺 due 字段的脏数据",
  H.countDue({ flash: { a: { reps: 1 }, b: { due: Date.now() - 1 } } }).due === 1);
check("countDue 容忍空进度", H.countDue(null).due === 0 && H.countDue({}).total === 0);

check("stageOf 把 U1 归到第一阶段", (H.stageOf(1) || {}).idx === 1);
check("stageOf 把 U3 归到第二阶段", (H.stageOf(3) || {}).idx === 2);
check("stageOf 对未知单元返回 null", H.stageOf(999) === null);
check("todayStr 形如 YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(H.todayStr()), H.todayStr());
check("totalMin 完整模式为 20", H.totalMin(allSteps, false) === 20);
check("totalMin 精简模式只算前 2 步（9 分钟）", H.totalMin(allSteps, true) === 9, H.totalMin(allSteps, true) + "");

/* ---------------- ⑦ 渲染冒烟 ---------------- */
PROGRESS = progressWithCards();
let renderErr = null;
try { T.render(); } catch (e) { renderErr = e; }
const html = appEl.innerHTML;
check("render() 不抛错", !renderErr, renderErr && renderErr.message);
check("渲染出 5 个步骤行", (html.match(/class="td-step/g) || []).length === 5,
  "n=" + (html.match(/class="td-step/g) || []).length);
check("渲染出「我在哪」区块与阶段信息",
  html.indexOf("第 1 / 2 阶段") !== -1 && html.indexOf("商务基础") !== -1 && html.indexOf("连续") !== -1);
check("渲染出完成计数 0/5", /0 \/ 5 完成/.test(html));
check("渲染出「今天只有 5 分钟」快捷开关", html.indexOf('data-action="td-short"') !== -1);
check("渲染出「为什么是这五步」说明", html.indexOf("为什么是这五步") !== -1);
check("未全完成时不显示完成庆祝", html.indexOf("td-finish") === -1);

/* 精简模式只渲染前 2 步 */
T._state.short = true;
T.render();
check("精简模式只渲染 2 步", (appEl.innerHTML.match(/class="td-step/g) || []).length === 2,
  "n=" + (appEl.innerHTML.match(/class="td-step/g) || []).length);
check("精简模式时间显示为 9 分钟", /约 9 分钟/.test(appEl.innerHTML));
T._state.short = false;

/* 全部完成（含自动判定项）→ 显示庆祝 */
GOAL = { patterns: { done: 0, target: 10 }, write: { done: 1, target: 1 } };
localStorage.setItem("fte-today-v1", JSON.stringify({
  day: H.todayStr(), done: { flash: true, unit: true, speak: true, review: true }
}));
T.render();
check("全部完成时渲染庆祝块", appEl.innerHTML.indexOf("td-finish") !== -1);
check("全部完成时计数为 5/5", /5 \/ 5 完成/.test(appEl.innerHTML));

/* 跨天自动重置 */
localStorage.setItem("fte-today-v1", JSON.stringify({ day: "2000-01-01", done: { flash: true } }));
GOAL = { patterns: { done: 0, target: 10 }, write: { done: 0, target: 1 } };
T.render();
check("昨天的勾不带到今天（跨天重置）", /0 \/ 5 完成/.test(appEl.innerHTML));

/* ---------------- ⑧ 接线门禁 ---------------- */
const htmlSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const style = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.webmanifest"), "utf8"));

check("index.html 已引入 js/today.js", /<script src="js\/today\.js"><\/script>/.test(htmlSrc));
check("today.js 在 app.js 之前加载", htmlSrc.indexOf("js/today.js") < htmlSrc.indexOf("js/app.js"));
check("index.html 导航含 #/today 且带 data-nav", /href="#\/today" data-nav="today"/.test(htmlSrc));
check("品牌 logo 指向今日", /<a class="brand" href="#\/today">/.test(htmlSrc));
check("app.js 路由表含 today", /"phonemes",\s*"today"/.test(appjs));
check("app.js renderRoute 分派 Today.render", /route\.view === "today"\)\s*window\.Today\.render\(\)/.test(appjs));
check("app.js 启动校验注册了 Today", /_need\("今日 today\.js", !!window\.Today\)/.test(appjs));
check("默认落地页是 #/today", /if \(!location\.hash\) location\.hash = "#\/today";/.test(appjs));
check("PWA start_url 指向 #/today", /#\/today$/.test(manifest.start_url), manifest.start_url);
check("sw.js 预缓存含 ./js/today.js", /"\.\/js\/today\.js"/.test(sw));
check("今日页样式已定义", /\.td-step\{/.test(style) && /\.td-list\{/.test(style));

/* FTE_BOOT 必须暴露「今日」要用到的既有计算，否则页面上会是空数字 */
["coachStats", "unitPct", "totalLearned", "pathStagesData", "coachToday"].forEach(function (k) {
  check("FTE_BOOT 暴露 " + k, new RegExp("\\b" + k + ":\\s*" + k + "\\b").test(appjs));
});

console.log("\n-- 今日清单（合成数据） --");
allSteps.forEach(function (s, i) {
  console.log("  " + (i + 1) + ". " + s.icon + " " + s.title + "  (" + s.min + "min)  → " + s.href + "   [" + s.why + "]");
});

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
