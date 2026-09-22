#!/usr/bin/env node
/* 验收测试：首页 P1 重构 + 导航信息架构。
   两道核心门禁：
     ① 导航 ↔ 路由【双向对账】：每个导航入口都要有对应路由（防孤儿入口点到空白页），
        每个路由也要有导航入口（防孤儿页面用户永远找不到）。
     ② 旧机制不许回来：首页曾同时存在 9 套「该从哪开始」的机制，P1 收敛为「🎯 今日」唯一权威。
        这些机制一旦被重新加回来，用户又会陷入「不知道该信谁」——所以固化成断言。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const appjs = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

/* ---------------- ① 导航分组：同维度 ---------------- */
const navBlock = (html.match(/<nav class="main-nav" id="mainNav">([\s\S]*?)<\/nav>/) || [])[1] || "";
check("提取到主导航块", navBlock.length > 200, "len=" + navBlock.length);

const groups = [];
const reGroup = /<details class="nav-group" data-group="([a-z]+)">([\s\S]*?)<\/details>/g;
let g;
while ((g = reGroup.exec(navBlock)) !== null) {
  groups.push({ id: g[1], links: (g[2].match(/<a href="#\/[a-z0-9]+"/g) || []).length });
}
check("导航为 6 个功能分组", groups.length === 6, groups.map(function (x) { return x.id; }).join(", "));
check("分组为任务维度 course/practice/memory/writing/tools/progress",
  groups.map(function (x) { return x.id; }).join(",") === "course,practice,memory,writing,tools,progress",
  groups.map(function (x) { return x.id; }).join(","));
check("每组都有入口", groups.every(function (x) { return x.links > 0; }));
console.log("  分组入口数：" + groups.map(function (x) { return x.id + "=" + x.links; }).join(" · "));

["today", "home", "sop"].forEach(function (k) {
  check("「" + k + "」是一级入口（不在任何分组里）",
    new RegExp('<a class="nav-home-link" href="#/' + k + '"').test(navBlock));
});
check("写作已从「背与测」拆出，独立成组", /data-group="writing"/.test(navBlock));
check("「记与测」已改名为任务导向的「背与测」", /ng-name">背与测</.test(navBlock) && !/ng-name">记与测</.test(navBlock));
/* 「背与测」组内顺序：先输入（背）→ 后检验（测）→ 再纠偏（易错点） */
const memBlk = (navBlock.match(/data-group="memory">([\s\S]*?)<\/details>/) || [])[1] || "";
const memOrder = (memBlk.match(/href="#\/([a-z0-9]+)"/g) || [])
  .map(function (s) { return s.replace(/.*"#\//, "").replace(/"/, ""); });
check("背与测组内顺序为 单词卡 → 测验证 → 易错点", memOrder.join(",") === "flash,quiz,mistakes", memOrder.join(","));

/* ---------------- ② 导航 ↔ 路由 双向对账 ---------------- */
const blob = (appjs.match(/if \(\[([\s\S]*?)\]\.indexOf\(parts\[0\]\)/) || [])[1] || "";
/* 用 [a-z0-9]+ 而不是 [a-z]+：路由里存在带数字的标识（eval4）。旧正则会把 eval4
   在导航与路由【两侧同时漏掉】，双向对账于是"通过"却少算一项——盲点必须堵上。 */
const ROUTES = (blob.match(/"([a-z0-9]+)"/g) || []).map(function (s) { return s.replace(/"/g, ""); });
/* 参数化路由（#/unit/N、#/search/x）走单独分支，不在数组里 */
const PARAM_ROUTES = [];
(appjs.match(/parts\[0\] === "([a-z]+)"/g) || []).forEach(function (s) {
  const r = s.replace(/.*"([a-z]+)"/, "$1");
  PARAM_ROUTES.push(r);
  if (ROUTES.indexOf(r) === -1) ROUTES.push(r);
});
check("提取到路由表", ROUTES.length >= 20, "n=" + ROUTES.length);

const NAV = [];
/* 注意：一级入口是 <a class="nav-home-link" href="#/today">，href 前还有 class，
   所以正则必须允许 href 前面出现其它属性——只写 <a href= 会漏掉今日与首页。
   同理字符集要含数字，否则会漏掉 eval4。 */
const reNav = /<a [^>]*href="#\/([a-z0-9]+)"/g;
let n;
while ((n = reNav.exec(navBlock)) !== null) if (NAV.indexOf(n[1]) === -1) NAV.push(n[1]);

/* 盲点回归断言：含数字的路由必须被提取到，否则"没有孤儿"可能只是两边同时漏看 */
check("路由提取正则覆盖含数字的路由（eval4）", ROUTES.indexOf("eval4") !== -1);

/* 合并页的【别名路由】：已被并入其它页的功能，其旧路由仍可访问（作 tab），
   因此不需要独立的一级导航入口。对账时必须把它们算作"可达"。 */
const ALIAS = (appjs.match(/const MERGED_ALIAS = \{([\s\S]*?)\};/) || [])[1] || "";
const ALIAS_ROUTES = (ALIAS.match(/^\s*([a-z0-9]+):/gm) || []).map(function (s) { return s.trim().replace(":", ""); });
/* 整页重定向（#/board → #/today）：同样不需要独立导航入口 */
const REDIR = (appjs.match(/const REDIRECT_ROUTES = \{([\s\S]*?)\};/) || [])[1] || "";
const REDIR_ROUTES = (REDIR.match(/([a-z0-9]+)\s*:/g) || []).map(function (s) { return s.replace(/\s*:/, ""); });
check("提取到合并页别名路由", ALIAS_ROUTES.length >= 6, ALIAS_ROUTES.join(", "));
check("别名提取正则同样覆盖含数字的路由（eval4）", ALIAS_ROUTES.indexOf("eval4") !== -1, ALIAS_ROUTES.join(", "));
check("提取到整页重定向路由", REDIR_ROUTES.length >= 1, REDIR_ROUTES.join(", "));
check("被合并的路由已从导航移除（降为页内 tab 或重定向）",
  ALIAS_ROUTES.concat(REDIR_ROUTES).every(function (r) { return NAV.indexOf(r) === -1; }),
  ALIAS_ROUTES.concat(REDIR_ROUTES).join(", "));
check("看板已并入今日（无独立导航入口）", NAV.indexOf("board") === -1 && REDIR_ROUTES.indexOf("board") !== -1);

const noRoute = NAV.filter(function (v) { return ROUTES.indexOf(v) === -1; });
check("每个导航入口都有对应路由（无孤儿入口）", noRoute.length === 0, noRoute.join(", "));

const REACHABLE = ALIAS_ROUTES.concat(REDIR_ROUTES);
const noEntry = ROUTES.filter(function (v) {
  return NAV.indexOf(v) === -1 && PARAM_ROUTES.indexOf(v) === -1 && REACHABLE.indexOf(v) === -1;
});
check("每个路由都有导航入口或已并入合并页（无孤儿页面）", noEntry.length === 0, noEntry.join(", "));
console.log("  导航 " + NAV.length + " 项 / 路由 " + ROUTES.length + " 条（参数化：" + PARAM_ROUTES.join(", ") +
  "；别名：" + ALIAS_ROUTES.join(", ") + "；重定向：" + REDIR_ROUTES.join(", ") + "）");

/* ---------------- ③ 旧机制不许回来 ---------------- */
const DEAD_FUNCS = ["homeAnchorBarHtml", "homeGoalPathHtml", "firstStepHtml", "homeTabBarHtml",
  "homeTabNewHtml", "homeTabStudyHtml", "homeTabOpsHtml", "unitCardsByIdsHtml"];
DEAD_FUNCS.forEach(function (f) {
  check("已删除的 " + f + " 未复活", appjs.indexOf(f) === -1);
});
["home-tab", "home-anchor"].forEach(function (a) {
  const pat = 'data-action="' + a + '"';
  check('已废弃的 ' + pat + " 未复活", appjs.indexOf(pat) === -1);
});
check("首页不再渲染旅程 Tab", appjs.indexOf("home-tabs") === -1);
check("首页不再渲染「我的第一步」", appjs.indexOf("mfs-card") === -1);

/* ---------------- ④ 首页结构：一屏一决策 + 骨架 + 收敛 ---------------- */
const homeFn = appjs.slice(appjs.indexOf("function renderHome()"), appjs.indexOf("/* 首页用户旅程 Tab 栏"));
check("提取到 renderHome 源码", homeFn.length > 800, "len=" + homeFn.length);

const heroCta = (homeFn.match(/<div class="hero-cta">([\s\S]*?)<\/div>/) || [])[1] || "";
check("hero 只有一个 CTA（一屏一决策）", (heroCta.match(/class="btn/g) || []).length === 1,
  (heroCta.match(/class="btn/g) || []).length + " 个");
check("该 CTA 指向今日", /href="#\/today"/.test(heroCta));

check("三阶段路径上移为首页骨架（renderHome 直接调用）", /pathStagesHtml\(\)/.test(homeFn));
/* P4：统计卡从「3 张并列」改为「能力 / 坚持 两组各 2 张」——见 test-boot.js 里的渲染级断言 */
check("首页统计卡分为「能力」与「坚持」两组", /prog-h-ability/.test(homeFn) && /prog-h-behavior/.test(homeFn));
check("首页含「全站地图」折叠区", /id="home-map"/.test(homeFn) && /home-map-box/.test(homeFn));
check("全站地图内含 6 大区与收藏", /homeZonesHtml\(\)/.test(homeFn) && /homeFavsRowHtml\(\)/.test(homeFn));
check("SOP 入口保留在首页", /sopBannerHtml\(\)/.test(homeFn));
check("首页不再渲染 19 单元网格（与路径 chip 重复）", homeFn.indexOf("unitCardHtml") === -1);
check("首页统计区为 4 张卡（能力 2 + 坚持 2）", (homeFn.match(/class="stat-card/g) || []).length === 4,
  (homeFn.match(/class="stat-card/g) || []).length + " 张");
/* 内容规模（768 词 / 28 对话）保留在 hero-tags 里，不应再有独立的 4 张内容统计卡 */
check("首页不再有内容规模统计卡（核心词汇/常用短语/场景对话/对话语句）",
  (homeFn.match(/class="lbl">(核心词汇|常用短语|场景对话|对话语句)</g) || []).length === 0);

/* 进度数据折叠面板应已把趋势 / 周回顾并入 */
const collapseFn = (appjs.match(/function homeDataCollapseHtml\(\)[\s\S]*?\n  \}/) || [])[0] || "";
check("进度数据折叠并入学习趋势", /renderTrendHtml/.test(collapseFn));
check("进度数据折叠并入本周回顾", /weekReviewHtml/.test(collapseFn));

/* ---------------- ⑤ 样式 ---------------- */
const style = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");
check("新增样式已定义",
  /\.hero-sub\{/.test(style) && /\.linklike\{/.test(style) &&
  /\.stats-row-3\{/.test(style) && /\.home-map-box\{/.test(style));

/* ---------------- ⑥ P2：完成度口径 + 个人化接线 ---------------- */
check("定义了 UNIT_DONE_PCT = 80", /const UNIT_DONE_PCT = 80;/.test(appjs));
check("完成判定收敛到 unitDone()", /function unitDone\(u\) \{/.test(appjs));
check("unitDone 同时接受手动标记", /progress\.done\[u\.id\] \|\| unitPct\(u\) >= UNIT_DONE_PCT/.test(appjs));

/* 旧的「词汇 100% 才算完成」不应再出现在完成判定里。
   注意排除 sopBannerHtml：那是「实操清单完成度」，用 100% 是对的，与单元完成无关。 */
const staleUnitDone = appjs.match(/unitPct\([a-z]+\) === 100/g) || [];
check("完成判定里不再残留「词汇 100%」口径", staleUnitDone.length === 0, staleUnitDone.join(", "));

const sopFn = (appjs.match(/function sopBannerHtml\(\)[\s\S]*?\n  \}/) || [])[0] || "";
const pctFullAll = (appjs.match(/pct === 100 \? "full"/g) || []).length;
const pctFullSop = (sopFn.match(/pct === 100 \? "full"/g) || []).length;
check("进度条 full 判定只剩 SOP 清单那一处（其余已改用 done 判定）",
  pctFullAll === pctFullSop && pctFullSop >= 1,
  "全文 " + pctFullAll + " 处 / SOP 内 " + pctFullSop + " 处");

/* STAGE_DONE_N 必须与 STAGE_DEFS 条数一致：markStage 存的是 idx+1，两处一旦脱钩，
   「五阶段走完」的判定就会整体偏移一个阶段（这正是原先 >= 4 的错） */
const stageDefs = (appjs.match(/const STAGE_DEFS = \[([\s\S]*?)\];/) || [])[1] || "";
const stageCount = (stageDefs.match(/\{ k: "/g) || []).length;
const stageDoneN = parseInt((appjs.match(/const STAGE_DONE_N = (\d+);/) || [])[1], 10);
check("STAGE_DONE_N 与 STAGE_DEFS 条数一致", stageCount > 0 && stageDoneN === stageCount,
  "STAGE_DEFS=" + stageCount + "  STAGE_DONE_N=" + stageDoneN);
check("阶段完成判定已改用 STAGE_DONE_N（不再硬编码 4）", /stageDone >= STAGE_DONE_N/.test(appjs));

check("FTE_BOOT 暴露 unitDone", /unitDone: unitDone/.test(appjs));
check("FTE_BOOT 暴露 unitStageDone", /unitStageDone: unitStageDone/.test(appjs));
check("FTE_BOOT 暴露 placementUnit（水平自测起点）", /placementUnit: function \(\)/.test(appjs));
check("FTE_BOOT 暴露 homeGoalLoad（工作目标）", /homeGoalLoad: homeGoalLoad/.test(appjs));
check("单元卡显示跟读维度", /class="uc-stage/.test(appjs));
check("unitDone 用于路径/首页/单元页/目录", (appjs.match(/unitDone\(/g) || []).length >= 5,
  (appjs.match(/unitDone\(/g) || []).length + " 处");

/* ---------------- ⑤ 导航中文标签不得被拆成孤行字 ----------------
   实际发生过的排版事故：.main-nav 是 flex 且子项可收缩，中文没有空格可断行，
   浏览器就按**字**断行——「今日」渲染成竖排的「今/日」、「工具箱」断成「工具/箱」，
   整个标题栏是一列孤字。肉眼一看就知道丑，但**没有任何测试会发现它**，
   因为它不是逻辑错误，而是 flex 收缩 + 中文断行的组合后果。

   这里守的是成因而不是外观（无浏览器无法测量行高）：
   标签必须 nowrap（禁止词内断行），子项不得被压扁，容器要允许整块换行。
   只要有人删掉其中一条，这套组合就会重新退化成孤行字。 */
const css = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");
function cssRule(sel) {
  const i = css.indexOf(sel + "{");
  if (i === -1) return "";
  const j = css.indexOf("}", i);
  return j === -1 ? "" : css.slice(i, j + 1);
}
const navA = cssRule(".main-nav a");
const navSummary = cssRule(".nav-group summary");
const navBox = cssRule(".main-nav");
check("导航链接禁止词内断行（white-space:nowrap）", /white-space:nowrap/.test(navA), navA.slice(0, 80));
check("导航分组标签同样禁止词内断行", /white-space:nowrap/.test(navSummary), navSummary.slice(0, 90));
check("导航子项不被 flex 压扁（flex:0 0 auto）", /flex:0 0 auto/.test(navA));
check("导航容器允许整块换行（flex-wrap:wrap）", /flex-wrap:wrap/.test(navBox), navBox.slice(0, 70));
check("桌面端导航独占一行（否则 9 个中文项挤不进 1120px）",
  /@media \(min-width:721px\)\{[\s\S]{0,200}?\.main-nav\{order:3;flex:1 0 100%/.test(css));

/* ---------------- ⑦ 首页难度角标的**渲染级**回归（T16-1 / P1-B 配套） ----------------
   背景：P1-B 要在单元卡旁并列一块「出口能力断言」，而首页 `ps-d` 角标正是难度的**最先被看到**
   的触点（t15 给角标加了「语言·」前缀、t16 独立验证）。一旦有人为了放新块而重排这段渲染，
   角标可能被挤掉、被改成裸档位（读成「业务难度」），或掉到口径句**前面**（先看到标签再看解释）——
   这些都不是逻辑错误，纯文本断言（上面的正则检查）一条也发现不了。
   所以这里真的把 app.js 在沙箱里跑一遍、渲染 `#/home`，再对**渲染产物**做三条断言。 */
const vm = require("vm");
function fakeEl() {
  return {
    innerHTML: "", textContent: "", value: "", hidden: false, checked: false, disabled: false,
    style: {}, dataset: {}, children: [], childNodes: [], parentNode: null,
    offsetWidth: 0, offsetHeight: 0, width: 0, height: 0, tagName: "DIV",
    classList: { add: function () { }, remove: function () { }, toggle: function () { }, contains: function () { return false; } },
    setAttribute: function () { }, getAttribute: function () { return null; },
    removeAttribute: function () { }, hasAttribute: function () { return false; },
    addEventListener: function () { }, removeEventListener: function () { },
    appendChild: function (c) { return c; }, removeChild: function (c) { return c; },
    insertBefore: function (c) { return c; }, insertAdjacentHTML: function () { },
    insertAdjacentElement: function (p, c) { return c; },
    append: function () { }, prepend: function () { }, after: function () { }, before: function () { },
    replaceChildren: function () { }, replaceWith: function () { },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    closest: function () { return null; }, matches: function () { return false; },
    focus: function () { }, blur: function () { }, click: function () { }, scrollIntoView: function () { },
    getBoundingClientRect: function () { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; },
    getContext: function () { return null; }, toDataURL: function () { return ""; },
    play: function () { return Promise.resolve(); }, pause: function () { }, load: function () { },
    remove: function () { }, cloneNode: function () { return fakeEl(); }
  };
}
const elCache = {};
function getEl(id) { if (!elCache[id]) elCache[id] = fakeEl(); return elCache[id]; }
const winListeners = {};
const storageStub = {
  _d: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; },
  clear: function () { this._d = {}; },
  key: function () { return null; },
  get length() { return Object.keys(this._d).length; }
};
const sandbox = {
  console: console,
  addEventListener: function (t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
  removeEventListener: function () { },
  dispatchEvent: function (type) {
    (winListeners[type] = winListeners[type] || []).forEach(function (fn) { fn({ type: type }); });
    return true;
  },
  scrollTo: function () { }, scrollBy: function () { }, scroll: function () { },
  getComputedStyle: function () { return {}; },
  matchMedia: function () { return { matches: false, addEventListener: function () { } }; },
  document: {
    getElementById: getEl,
    createElement: function () { return fakeEl(); },
    createElementNS: function () { return fakeEl(); },
    createDocumentFragment: function () { return fakeEl(); },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () { }, removeEventListener: function () { },
    body: fakeEl(), head: fakeEl(), documentElement: fakeEl(),
    cookie: "", readyState: "complete", title: ""
  },
  localStorage: storageStub,
  sessionStorage: Object.assign({}, storageStub, { _d: {} }),
  location: { hash: "", href: "http://localhost/", protocol: "http:", origin: "http://localhost", reload: function () { }, replace: function () { } },
  history: { replaceState: function () { }, pushState: function () { } },
  navigator: { userAgent: "node", clipboard: null, mediaDevices: null, serviceWorker: null, language: "zh-CN" },
  screen: { width: 1280, height: 800 },
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: setInterval, clearInterval: clearInterval,
  requestAnimationFrame: function (fn) { return setTimeout(fn, 0); },
  cancelAnimationFrame: clearTimeout,
  fetch: function () { return Promise.reject(new Error("no network in test")); },
  Image: function () { return fakeEl(); },
  Audio: function () { return fakeEl(); },
  AudioContext: function () { return { createAnalyser: function () { return {}; }, close: function () { } }; },
  SpeechSynthesisUtterance: function () { return {}; },
  speechSynthesis: { speak: function () { }, cancel: function () { }, getVoices: function () { return []; }, addEventListener: function () { } },
  alert: function () { }, confirm: function () { return false; }, prompt: function () { return null; },
  URL: URL, Blob: function () { }, FileReader: function () { return { readAsText: function () { } }; },
  XMLHttpRequest: function () { return { open: function () { }, send: function () { }, setRequestHeader: function () { } }; }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
const ctx = vm.createContext(sandbox);

/* 按 index.html 的真实脚本顺序执行（数量从文档里读，不写死） */
const scriptSrcs = [];
let reS;
const reScr = /<script\s+src="(js\/[^"]+)"/g;
while ((reS = reScr.exec(html)) !== null) scriptSrcs.push(reS[1]);
const loadFails = [];
scriptSrcs.forEach(function (rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { loadFails.push(rel + "（文件不存在）"); return; }
  try { vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: rel }); }
  catch (e) { loadFails.push(rel + " → " + (e && e.message ? e.message : String(e))); }
});
check("首页渲染沙箱：全部脚本按真实顺序加载通过", loadFails.length === 0, loadFails.join("；"));

let unitN = -1;
try {
  unitN = vm.runInContext("(typeof FTE_DATA !== 'undefined' && FTE_DATA && FTE_DATA.units) ? FTE_DATA.units.length : -1", ctx);
} catch (e) { unitN = -1; }
check("渲染沙箱里读到站点单元数", unitN === 19, "n=" + unitN);

let homeHtml = "";
try {
  ctx.location.hash = "#/home";
  ctx.dispatchEvent("hashchange");
  homeHtml = getEl("app").innerHTML || "";
} catch (e) { homeHtml = ""; }
check("首页在沙箱里真实渲染出内容", homeHtml.length > 2000, "len=" + homeHtml.length);

/* title 是悬停提示，触屏端看不到也不参与「可见文本」——口径句与角标的位置关系必须在
   **去掉 title 之后**仍然成立，否则触屏用户先看到的是没有解释的标签。 */
const homeVisible = homeHtml.replace(/\stitle="[^"]*"/g, "");
const badgeRe = /<em class="ps-d"[^>]*>([^<]*)<\/em>/g;
const badges = [];
let bm;
while ((bm = badgeRe.exec(homeVisible)) !== null) badges.push(bm[1]);
check("① 首页 ps-d 难度角标数 = 单元数（19）", badges.length === unitN && unitN > 0,
  badges.length + " 枚 / 单元 " + unitN + " 个");
check("② ps-d 可见文本匹配 /^语言·(基础|进阶|拔高)$/（裸档位会被读成「业务难度」）",
  badges.length > 0 && badges.every(function (t) { return /^语言·(基础|进阶|拔高)$/.test(t); }),
  Array.from(new Set(badges)).join(" / "));

const basisAt = homeVisible.indexOf("不是业务难度");
const badgeAt = homeVisible.indexOf('class="ps-d"');
check("③ 口径句「不是业务难度」仍在首页可见文本里", basisAt !== -1);
check("③ ps-d 角标的 offset > 口径句的 offset（先读口径，再看到标签）",
  basisAt !== -1 && badgeAt > basisAt, "口径 @" + basisAt + " / 角标 @" + badgeAt);

/* P1-B 并行改动（出口能力断言）不得把难度触点挤掉：断言块与 ps-d 必须同页共存 */
check("P1-B：首页仍渲染难度角标（出口能力断言没有替换掉它）", badgeAt !== -1);
check("P1-B：单元卡上出口能力断言与难度角标并存（并列不替换，门禁 3）",
  /class="uc-outcome"/.test(appjs) && /class="badge uc-diff"/.test(appjs));

/* ---------------- ⑧ P1-C2：「全部课程」页的已完成 M / 口径 / 进度展示面计数 ----------------
   由来：方案 §5.2-P1-C2 验收①要求本页出现 `已完成 M / N`，验收②要求「全站进度展示面计数不增加
   （仍是 3 处）」。t2（_p1-eval/02-c2-decision.md §3.3）逐行核对过：原有的
   `③ 旧机制不许回来`（本文件 :99-110）只守 8 个已删函数名 + 2 个 data-action + 2 个容器指纹，
   **完全不覆盖进度展示面计数**，也没有任何断言覆盖页头那条 `N/总量` 的 pill
   —— 所以这一节是新增的，不是既有断言的复述。

   计数口径（先写死，否则无法独立复算；沿用 t2 §7.2 的定义）：
   「页面级进度面」= 在某个路由的顶层渲染里聚合表达「我的课程进度」的语句；逐单元的进度条 /
   百分比 / 徽标不计，难度分母（站内从易到难第 n/N）不计，页头常驻 pill 与默认折叠的历史快照
   面板单列为**区块级**、不并入计数。
   a) 首页：#/home 的聚合进度语句 = 1（「已完成单元」统计卡；路径区另有 3 枚阶段徽标 = 3 个阶段）
   b) 全部课程页：#/units 的聚合进度语句 = 1（本项新增，分子在前）
   c) 单元页：#/unit/N 仍只有逐单元进度，**不得**出现跨单元聚合语句（否则就是第 4 处）
   d) 区块级红线 6 处（t2 §3.2-B）：页头 pill / 当前进度卡 / 历史快照折叠 / 单元掌握度块 /
      单元页难度序 / SOP 清单完成度 —— 逐项确认仍在且未被 M 吞并或复制。
   说明：本节的 A1–A6 沿用 t2 §7.2 的编号，但 A1 的分子分母按本任务契约用 recordUnits().length
   （不是 t2 建议稿里的 DATA.units.length）——契约要求「分母必须同步」，否则 P2-G 去重后会
   出现分子去重、分母不去重的更坏失真。 */
function renderPage(hash) {
  ctx.location.hash = hash;
  ctx.dispatchEvent("hashchange");
  return getEl("app").innerHTML || "";
}
let unitsHtml2 = "", unitHtml2 = "";
try {
  unitsHtml2 = renderPage("#/units");
  unitHtml2 = renderPage("#/unit/" + unitN);
} catch (e) { unitsHtml2 = ""; unitHtml2 = ""; }
check("⑧ 沙箱里能渲染「全部课程」页与单元页", unitsHtml2.length > 1000 && unitHtml2.length > 1000,
  "units=" + unitsHtml2.length + " unit=" + unitHtml2.length);
const unitsVisible2 = unitsHtml2.replace(/\stitle="[^"]*"/g, "");
const unitVisible2 = unitHtml2.replace(/\stitle="[^"]*"/g, "");

/* ---- A1：写法②（分子在前）+ 本页不引入第二个大分母 + 既有那行保留 ---- */
const ruSrc = (appjs.match(/function renderUnits\(\)[\s\S]*?\n  \}/) || [])[0] || "";
/* 注释里的解释性说明不参与判定：验收约束的是**渲染出来的数**与**代码里的判定式**，
   注释引用历史行号或反例不算违规。 */
const ruCode = ruSrc.replace(/\/\*[\s\S]*?\*\//g, "");
check("A1 提取到 renderUnits 源码（注释已剥离）", ruSrc.length > 400 && ruCode.length > 200,
  "src=" + ruSrc.length + " code=" + ruCode.length);
check("A1 M 行采用写法②「已完成 M / N 单元」（分子在前，与全站既有进度语句同构）",
  /已完成 \$\{doneCount\} \/ \$\{recordUnits\(\)\.length\} 单元/.test(ruCode));
check("A1 既有「N 个单元 · 覆盖外贸全流程」那行保留，M 行在它下方新增（不替换）",
  /class="en">\$\{recordUnits\(\)\.length\} 个单元 · 覆盖外贸全流程<\/div>/.test(ruCode) &&
  ruCode.indexOf("uc-progress") > ruCode.indexOf("覆盖外贸全流程"));
check("A1 本页不引入第二个大分母（无 768 / totals.words / totals.dlg）",
  !/768|totals\.(words|dlg)/.test(ruCode));
check("A1 渲染产物的 M 语句确实分子在前（正则读真实 HTML，不是只读源码）",
  /已完成 \d+ \/ \d+ 单元/.test(unitsVisible2) && !/\d+ 单元 \/ 已完成/.test(unitsVisible2),
  (unitsVisible2.match(/已完成 \d+ \/ \d+ 单元/) || [])[0]);

/* ---- A2：口径唯一（复用 unitDone，不另写判定式，阈值只经 UNIT_DONE_PCT） ---- */
check("A2 M 的判定复用 unitDone()（不在本页另写一套）", /recordUnits\(\)\.filter\(unitDone\)/.test(ruCode));
check("A2 本页不出现 unitPct( / === 100 / 任何字面量阈值（阈值只能来自 UNIT_DONE_PCT）",
  !/unitPct\(/.test(ruCode) && !/===\s*100/.test(ruCode) && !/(?<!\d)80(?!\d)/.test(ruCode));
check("A2 全站「完成」判定仍收敛在 unitDone() 与 UNIT_DONE_PCT=80（既有断言未被绕过）",
  /const UNIT_DONE_PCT = 80;/.test(appjs) && /function unitDone\(u\) \{/.test(appjs));

/* ---- A3：口径串单一常量，title 与可见说明同源；且可见（不靠 title） ---- */
const mBasisSrc = (appjs.match(/const UNIT_M_BASIS = [\s\S]{0,240}?;\n/) || [])[0] || "";
check("A3 M 口径串是单一常量，且 80 由 UNIT_DONE_PCT 拼出（不写死第二个阈值）",
  /const UNIT_M_BASIS = "已完成 = 该单元内已掌握词汇达 " \+ UNIT_DONE_PCT/.test(appjs));
check("A3 同一常量在渲染里出现两次：title 提示 + 可见说明（触屏端可读）",
  (ruCode.match(/\$\{esc\(UNIT_M_BASIS\)\}/g) || []).length === 2 &&
  /title="\$\{esc\(UNIT_M_BASIS\)\}"/.test(ruCode));
check("A3 口径句在去 title 后的可见文本里仍在（触屏端不显示 title 是站内既有教训）",
  unitsVisible2.indexOf("已完成 = 该单元内已掌握词汇达 80%") !== -1 &&
  unitsVisible2.indexOf("每个单元只计一次") !== -1);
check("A3 M 口径句不借用水平/难度口径词（无 CEFR / 等级 / 档位 / 基础 / 进阶 / 拔高）",
  mBasisSrc.length > 60 && !/CEFR|等级|档位|基础|进阶|拔高/.test(mBasisSrc));
check("A3 M 口径句与页头难度口径分处两段（不混进难度说明块 diffLegendHtml）",
  /function diffLegendHtml\(\)[\s\S]*?\n  \}/.test(appjs) &&
  !/UNIT_M_BASIS/.test((appjs.match(/function diffLegendHtml\(\)[\s\S]*?\n  \}/) || [])[0] || ""));

/* ---- A4：进度展示面计数 ---- */
/* P1-4：首页「能力」栏不再放自评口径的「已掌握单词」「已完成单元」——它们移到了「坚持 · 进度」
   一侧的说明行（不是统计卡）。能力栏只留两块有留痕的结果：最近四维得分、有产出证据的单元。 */
const homeSelfAssessCards = (homeVisible.match(/class="lbl">(已掌握单词|已完成单元)</g) || []).length;
const homeEvidenceCard = (homeVisible.match(/class="lbl">有产出证据的单元</g) || []).length;
const psBadge = (homeVisible.match(/class="ps-badge"/g) || []).length;
const unitsAgg = (unitsVisible2.match(/已完成 \d+ \/ \d+ 单元/g) || []).length;
const unitAgg = (unitVisible2.match(/已完成 \d+ \/ \d+ 单元/g) || []).length;
check("A4 首页「能力」栏不含自评统计卡（已掌握单词 / 已完成单元）", homeSelfAssessCards === 0, "n=" + homeSelfAssessCards);
check("A4 首页「能力」栏有且仅有 1 张「有产出证据的单元」", homeEvidenceCard === 1, "n=" + homeEvidenceCard);
check("A4 自评进度仍可见（移到说明行，不作为能力证据）", /已掌握单词/.test(homeVisible) && /学完单元/.test(homeVisible));
check("A4 首页路径区阶段徽标 = 3（= 3 个阶段，不是第 4 个页面级面）", psBadge === 3, "n=" + psBadge);
check("A4 「全部课程」页聚合进度语句 = 1（本项新增处，且只有 1 处）", unitsAgg === 1, "n=" + unitsAgg);
check("A4 单元页不含跨单元聚合进度语句（不新增第四处页面级面）", unitAgg === 0, "n=" + unitAgg);
console.log("  页面级进度面实测：首页能力栏 2 张留痕卡 + 坚持栏说明行；路径区 " + psBadge + " 枚阶段徽标；全部课程页 " +
  unitsAgg + " 条（本项新增，分子在前）；单元页 " + unitAgg + " 条跨单元聚合语句");

/* ---- A4 配套：6 处区块级红线（不得增加 / 不得被 M 吞并或复制） ---- */
check("B1 页头常驻 pill 仍只有 1 处（app.js updateHeaderStat + index.html #headerStat）",
  (appjs.match(/getElementById\("headerStat"\)/g) || []).length === 1 &&
  (html.match(/id="headerStat"/g) || []).length === 1);
check("B2 首页「当前进度卡」仍在（未被 M 复制或替换）",
  (homeVisible.match(/当前进度：/g) || []).length === 1);
check("B3 「进度数据」历史快照仍在，且 M 不读它（M 必须实时计算）",
  /function renderTrendHtml/.test(appjs) && /recordSnapshot/.test(appjs) && !/recordSnapshot/.test(ruCode));
check("B4 首页「单元掌握度」块仍在", homeVisible.indexOf("单元掌握度") !== -1);
check("B5 单元页难度序仍在，且没被写进 M（M 里不含 sortIdx / 难度分量）",
  /站内从易到难第 /.test(appjs) && !/sortIdx|难度/.test(ruCode));
check("B6 SOP 清单完成度仍是独立口径，未并入 M",
  /实操清单完成度/.test(fs.readFileSync(path.join(ROOT, "js", "sop.js"), "utf8")) &&
  !/实操清单|sop\./i.test(ruCode));

/* ---- A5：口径隔离（M 与 P1-B 出口断言共用一张卡、零个字段） ---- */
const outcomesSrc2 = fs.readFileSync(path.join(ROOT, "js", "outcomes.js"), "utf8");
check("A5 outcomes.js 不含进度/难度口径符号（progress / unitDone / UNIT_DONE_PCT / done / cefr / band）",
  !/progress|unitDone|UNIT_DONE_PCT|\bdone\b|cefr|band/i.test(outcomesSrc2));
check("A5 M 行不读出口断言（renderUnits 不含 FTE_OUTCOMES / uc-outcome）",
  !/FTE_OUTCOMES|uc-outcome/.test(ruCode));
check("A5 出口断言的显示不依赖完成状态（断言块不以 unitDone 为门槛）",
  !/\$\{oc && [a-zA-Z]*(done|Done|pct)/.test(appjs));

/* ---- A6：P2-G 接口预留（别名为空 ⇒ 行为逐字节不变；去重漏配立刻失败） ---- */
let recLen = -1, sameOrder = false;
try {
  recLen = vm.runInContext("(typeof FTE_BOOT !== 'undefined' && FTE_BOOT.recordUnits) ? FTE_BOOT.recordUnits().length : -1", ctx);
  sameOrder = vm.runInContext(
    "(function(){var r=FTE_BOOT.recordUnits(),u=FTE_DATA.units;" +
    "if(r.length!==u.length)return false;" +
    "for(var i=0;i<r.length;i++){if(r[i]!==u[i])return false;}return true;})()", ctx) === true;
} catch (e) { recLen = -1; sameOrder = false; }
check("A6 recordUnits().length === 19（P2-G 给单元挂第二个入口却漏配别名时，这条立刻失败）",
  recLen === unitN && recLen > 0, "n=" + recLen + " / 单元 " + unitN);
check("A6 CONTENT_ID_ALIAS 默认为空对象 ⇒ recordUnits() 与 DATA.units 逐项同序同对象（行为逐字节不变）",
  /const CONTENT_ID_ALIAS = \{\};/.test(appjs) && sameOrder === true);
check("A6 三个纯函数齐备（contentKeyOf / dedupeUnits / recordUnits）且已从 FTE_BOOT 暴露",
  /function contentKeyOf\(unitId\)/.test(appjs) && /function dedupeUnits\(units\)/.test(appjs) &&
  /function recordUnits\(\) \{ return dedupeUnits\(DATA\.units\); \}/.test(appjs) &&
  /contentKeyOf: contentKeyOf,/.test(appjs) && /recordUnits: recordUnits,/.test(appjs));
check("A6 M 的分母同步走 recordUnits()：本页不再残留 DATA.units.length（分子去重、分母不去重是最坏的失真）",
  /\$\{recordUnits\(\)\.length\} 个单元 · 覆盖外贸全流程/.test(ruCode) && !/DATA\.units\.length/.test(ruCode));

/* ---- A4 配套：M 必须真的在算（防空壳数字 / 硬编码） ---- */
let mAfter = "";
try {
  vm.runInContext("(function(){FTE_BOOT.progress.done[3]=true;return true;})()", ctx);
  mAfter = (renderPage("#/units").replace(/\stitle="[^"]*"/g, "").match(/已完成 \d+ \/ \d+ 单元/) || [])[0] || "";
} catch (e) { mAfter = ""; }
check("A4 M 随进度实时变化：手动标记 1 个单元完成后，本页 M 由 0 变 1（不是硬编码数字）",
  mAfter === "已完成 1 / 19 单元", "渲染得：" + (mAfter || "（未渲染出）"));

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
