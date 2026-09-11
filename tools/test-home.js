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
check("导航为 5 个功能分组", groups.length === 5, groups.map(function (x) { return x.id; }).join(", "));
check("分组为任务维度 course/practice/memory/tools/progress",
  groups.map(function (x) { return x.id; }).join(",") === "course,practice,memory,tools,progress",
  groups.map(function (x) { return x.id; }).join(","));
check("每组都有入口", groups.every(function (x) { return x.links > 0; }));
console.log("  分组入口数：" + groups.map(function (x) { return x.id + "=" + x.links; }).join(" · "));

check("「今日」是一级入口（不在任何分组里）", /<a class="nav-home-link" href="#\/today"/.test(navBlock));

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
check("提取正则覆盖含数字的路由（eval4）", ROUTES.indexOf("eval4") !== -1 && NAV.indexOf("eval4") !== -1,
  "routes=" + (ROUTES.indexOf("eval4") !== -1) + " nav=" + (NAV.indexOf("eval4") !== -1));

const noRoute = NAV.filter(function (v) { return ROUTES.indexOf(v) === -1; });
check("每个导航入口都有对应路由（无孤儿入口）", noRoute.length === 0, noRoute.join(", "));

const noEntry = ROUTES.filter(function (v) { return NAV.indexOf(v) === -1 && PARAM_ROUTES.indexOf(v) === -1; });
check("每个路由都有导航入口（无孤儿页面）", noEntry.length === 0, noEntry.join(", "));
console.log("  导航 " + NAV.length + " 项 / 路由 " + ROUTES.length + " 条（参数化：" + PARAM_ROUTES.join(", ") + "）");

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
check("首页只保留 3 张进度卡", /stats-row stats-row-3/.test(homeFn));
check("首页含「全站地图」折叠区", /id="home-map"/.test(homeFn) && /home-map-box/.test(homeFn));
check("全站地图内含 6 大区与收藏", /homeZonesHtml\(\)/.test(homeFn) && /homeFavsRowHtml\(\)/.test(homeFn));
check("SOP 入口保留在首页", /sopBannerHtml\(\)/.test(homeFn));
check("首页不再渲染 19 单元网格（与路径 chip 重复）", homeFn.indexOf("unitCardHtml") === -1);
check("首页统计区只保留 3 张卡", (homeFn.match(/class="stat-card/g) || []).length === 3,
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

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
