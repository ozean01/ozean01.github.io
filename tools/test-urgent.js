#!/usr/bin/env node
/* 验收测试：🚨 场景急救 (js/urgent.js)。
   最有价值的两条：
     ①【每个场景都必须真能产出「现成话」】——急救功能一旦给不出话就等于不存在，
        而且场景的 unit 是写死的编号，课程数据一变（单元合并/重排）就会静默失配，
        所以这里拿真实课程数据逐场景校验。
     ②【架构冻结守卫】——它是纯增量功能，不得新增一级导航入口。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const DATA_FILES = ["data.js", "data-ops.js", "data-ocean.js", "data-incoterms.js", "data-settle.js", "data-risk.js", "data-deep.js", "data-meeting.js"];

const ctx = vm.createContext({ console: console, window: {} });
DATA_FILES.forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", f), "utf8"), ctx, { filename: f });
});
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "difficulty-map.js"), "utf8"), ctx, { filename: "difficulty-map.js" });
const UNITS = vm.runInContext("FTE_DATA.units", ctx);
global.FTE_DIFF = ctx.window.FTE_DIFF;

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

/* ---- 最小假 DOM ---- */
const appEl = { innerHTML: "" };
global.document = {
  addEventListener: function () { },
  getElementById: function (id) { return id === "app" ? appEl : null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; }
};
global.localStorage = {
  _d: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};
/* navigator 在 Node 里是只读内置对象，且复制按钮只在点击时才用它，测试不需要注入 */
global.window = {
  FTE_BOOT: {
    DATA: { units: UNITS },
    esc: function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); },
    toast: function () { },
    getUnit: function (id) { return UNITS.filter(function (u) { return u.id === id; })[0] || null; }
  }
};

require(path.join(ROOT, "js", "urgent.js"));
const U = global.window.Urgent;
const T = U._t;

/* ---------------- ① 模块形态 ---------------- */
check("导出 Urgent.html", U && typeof U.html === "function");
check("导出 Urgent.wire", typeof U.wire === "function");
check("导出测试钩子 _t", !!T && Array.isArray(T.SCENES) && typeof T.matchScene === "function");

/* ---------------- ② 场景库自洽 ---------------- */
const S = T.SCENES;
check("场景库不少于 12 个", S.length >= 12, "n=" + S.length);
check("场景 id 唯一", new Set(S.map(function (s) { return s.id; })).size === S.length);
check("每个场景都有 图标/标题/关键词/关联单元/提示/出口",
  S.every(function (s) { return s.icon && s.title && s.kw && s.kw.length >= 4 && s.unit && s.hint && s.next; }));

/* ---------------- ③ 场景的关联单元必须真实存在（编号写死的静默失配） ---------------- */
const unitIds = UNITS.map(function (u) { return u.id; });
const badUnit = S.filter(function (s) { return unitIds.indexOf(s.unit) === -1; });
check("每个场景的关联单元都真实存在", badUnit.length === 0,
  badUnit.map(function (s) { return s.id + "→U" + s.unit; }).join(", "));

/* ---------------- ④ 每个场景都必须真能给出「现成话」（核心） ---------------- */
const emptyScenes = [];
S.forEach(function (s) {
  const lines = T.linesFor(s, 3);
  if (!lines.length || !lines[0].en) emptyScenes.push(s.id);
});
check("每个场景都能产出至少一句现成话", emptyScenes.length === 0, emptyScenes.join(", "));

const thinScenes = S.filter(function (s) { return T.linesFor(s, 3).length < 3; });
console.log("  给出满 3 句的场景：" + (S.length - thinScenes.length) + " / " + S.length +
  (thinScenes.length ? "（不足 3 句：" + thinScenes.join(", ") + "）" : ""));

/* 现成话必须来自站内已核对内容（phrases[].ex），而不是新写的英文 */
const first = T.linesFor(S[0], 3);
check("现成话来源是站内 phrases[].ex", (function () {
  const u = UNITS.filter(function (x) { return x.id === S[0].unit; })[0];
  const exs = (u.phrases || []).map(function (p) { return p.ex; });
  return exs.indexOf(first[0].en) !== -1;
})(), first[0].en);
check("每句都带中文对照或至少有英文", first.every(function (l) { return l.en && typeof l.cn === "string"; }));

/* ---------------- ⑤ 关键词匹配 ---------------- */
const cases = [
  ["客户说太贵了要折扣", "price"],
  ["客户问 MOQ 和样品", "moq"],
  ["明天客户要开视频会", "meeting"],
  ["客户投诉复合膜脱层", "quality"],
  ["客户一直在催交期", "lead"],
  ["客户问 L/C 付款", "payment"]
];
cases.forEach(function (c) {
  const hit = T.matchScene(c[0]);
  check("匹配「" + c[0] + "」→ " + c[1], hit && hit.id === c[1], hit ? hit.id : "null");
});
check("空输入返回 null", T.matchScene("") === null && T.matchScene(null) === null);
check("无关输入返回 null", T.matchScene("今天天气不错") === null);

/* ---------------- ⑥ 术语与出口 ---------------- */
const terms = T.termsOf(S[0].unit, 6);
check("能取到该场景的行业术语（带专角标）", terms.length > 0, terms.map(function (t) { return t.w; }).slice(0, 4).join(", "));
check("出口链接指向真实路由", S.every(function (s) {
  return s.next.every(function (k) { return /^#\//.test(T.nextHref(k, s)); });
}));

/* ---------------- ⑦ 渲染冒烟 ---------------- */
let err = null, html = "";
try { html = U.html(); } catch (e) { err = e; }
check("html() 不抛错", !err, err && err.message);
check("渲染出急救面板", html.indexOf('id="urgent"') !== -1);
/* 场景 chip：注意不能用 class="urg-chip 匹配，那是 class="urg-chips"（容器）的前缀 */
check("渲染出全部场景 chip", (html.match(/data-action="urg-pick"/g) || []).length === S.length,
  (html.match(/data-action="urg-pick"/g) || []).length + " / " + S.length);

/* 不同场景不应给出雷同的三句——多个场景共用一个单元时必须靠 pick 关键词区分开 */
const sig = {};
let dupGroup = [];
S.forEach(function (s) {
  const k = T.linesFor(s, 3).map(function (l) { return l.en; }).join("|");
  if (sig[k]) dupGroup.push(sig[k] + " 与 " + s.id + " 完全相同");
  else sig[k] = s.id;
});
check("没有两个场景给出完全相同的三句", dupGroup.length === 0, dupGroup.join("；"));
check("渲染出自由输入框", html.indexOf('id="urgText"') !== -1);
check("未选场景时不渲染结果区", html.indexOf("urg-res") === -1);

U._state.sceneId = "price";
let err2 = null, res = "";
try { res = T.resultHtml(); } catch (e) { err2 = e; }
check("选中场景后结果区不抛错", !err2, err2 && err2.message);
check("结果区含 3 句现成话", (res.match(/class="urg-line"/g) || []).length === 3,
  (res.match(/class="urg-line"/g) || []).length + " 句");
check("结果区含朗读与复制按钮", res.indexOf('data-action="urg-say"') !== -1 && res.indexOf('data-action="urg-copy"') !== -1);
check("结果区含出口按钮", res.indexOf("urg-next") !== -1);

/* 全部场景逐一渲染，确保没有某个场景会渲染崩 */
let renderBad = [];
S.forEach(function (s) {
  U._state.sceneId = s.id;
  try { const h = T.resultHtml(); if (!h || h.indexOf("urg-res") === -1) renderBad.push(s.id); }
  catch (e) { renderBad.push(s.id + ":" + e.message); }
});
check("全部场景的结果区都能渲染", renderBad.length === 0, renderBad.join(", "));
U._state.sceneId = "";

/* ---------------- ⑧ 架构冻结守卫：纯增量，不得新增一级入口 ---------------- */
const htmlSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const appjs = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
const todayjs = fs.readFileSync(path.join(ROOT, "js", "today.js"), "utf8");

check("index.html 已引入 js/urgent.js", /<script\s+src="js\/urgent\.js"[^>]*><\/script>/.test(htmlSrc));
check("urgent.js 在 app.js 之前加载", htmlSrc.indexOf("js/urgent.js") < htmlSrc.indexOf("js/app.js"));
check("sw.js 预缓存含 ./js/urgent.js", /"\.\/js\/urgent\.js"/.test(sw));
check("app.js 启动校验注册了 Urgent", /_need\("场景急救 urgent\.js", !!window\.Urgent\)/.test(appjs));
check("挂载在「今日」页内", /window\.Urgent\.html\(\)/.test(todayjs));

const navBlock = (htmlSrc.match(/<nav class="main-nav" id="mainNav">([\s\S]*?)<\/nav>/) || [])[1] || "";
const navCount = (navBlock.match(/<a [^>]*href="#\/[a-z0-9]+"/g) || []).length;
check("架构冻结：导航入口仍为 16 项（未新增一级入口）", navCount === 16, "n=" + navCount);
check("急救未占用独立路由", !/urgent/.test((htmlSrc.match(/mainNav[\s\S]*?<\/nav>/) || [""])[0]));
check("急救未新增路由表条目", !/"urgent"/.test(appjs));

console.log("\n-- 场景 → 关联单元 → 首句 --");
S.slice(0, 6).forEach(function (s) {
  const l = T.linesFor(s, 1)[0] || { en: "（无）" };
  const u = UNITS.filter(function (x) { return x.id === s.unit; })[0];
  console.log("  " + s.icon + " " + s.title + "  → U" + s.unit + " " + (u ? u.title : "?") + "\n      " + l.en);
});

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
