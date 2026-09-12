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

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
