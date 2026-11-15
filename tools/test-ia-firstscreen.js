#!/usr/bin/env node
/* 验收：首访首屏「一屏一决策」（P12 · 外部反馈「菜单很多 / 找不到重点和如何开始」的落地）
   守的是三件在后续加功能时最容易悄悄回退的事：
     ① **导航入口只减不增**：P12 基线为 18 个入口 / 9 个一级项 / 17 个唯一目标；
        P25 收到 17，P28 摘除地图组后收到 **15 个入口 / 6 个一级项 / 15 个唯一目标**，
        只允许继续下降（新增功能不许再往导航里塞；要加先减）。
     ② **首次引导只留一个主行动**：横幅里只允许一个 .btn-primary（= 今天第 1 步），
        「测起点」只能是文字链（.ob-bar-alt），不许再有第二个并列按钮（原 ob-unit 已删）。
     ③ **首屏顺序**：五步清单必须在「岗位任务画像 / 记账口径 / 急救 / 连听 / 本周」之前，
        且清单头（含「今天只有 5 分钟」）紧贴清单——画像块已被挪到清单之后。
   几何层面的兜底（按钮是否真的在第一屏内）由 tools/smoke-ia-firstscreen.js 用真浏览器测，
   不进 npm test（CI 无浏览器）；本门禁只做**静态可回归**的那一半。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info !== undefined ? "  " + info : ""));
  if (!cond) pass = false;
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/* ---------------- ① 导航入口棘轮 ---------------- */
const html = read("index.html");
const navBlock = (html.match(/<nav class="main-nav" id="mainNav">([\s\S]*?)<\/nav>/) || [])[1] || "";
check("能定位到 #mainNav 导航块", !!navBlock);

const anchors = navBlock.match(/<a\b[^>]*data-nav="[^"]+"/g) || [];
const hrefs = (navBlock.match(/href="#\/[^"]*"/g) || []).map(function (s) { return s.slice(6, -1); });
const uniqueHrefs = hrefs.filter(function (h, i) { return hrefs.indexOf(h) === i; });
const topLevel = (navBlock.match(/<a class="nav-home-link"/g) || []).length +
  (navBlock.match(/<details class="nav-group"/g) || []).length;

// P25：基线 18 → 17（只减不增；删重复入口后同一页不再挂两个入口）
// P28（2026-11-15）：基线 17 → 15（「全站地图」「计划与打卡」降为今日页内入口，导航摘除）。
check("导航入口数不超过基线 15（只减不增）", anchors.length <= 15, "n=" + anchors.length + " / 基线 15");
check("导航一级项不超过基线 6（P13 收敛：9 → 6，只减不增）", topLevel <= 6, "n=" + topLevel + " / 基线 6");
// P25：加严为「17 个入口且目标全部唯一」；P28 起改为 15（改前/改后：=== 17 → === 15）。
check("导航 15 个入口且目标全部唯一（不再有重复入口）",
  anchors.length === 15 && uniqueHrefs.length === anchors.length,
  "anchors=" + anchors.length + " / unique=" + uniqueHrefs.length);
check("导航里不出现「从这里开始 / 新手 / 推荐」类第 19 个起点",
  !/从这里开始|新手|推荐入口/.test(navBlock));
/* P28：改前断言「首页改名全站地图，且收进『地图 · 进度』组」。
   改后组已摘除，守卫目标换成「降级不是消失」：导航里不许再出现，但今日页必须有真链接可达
   （P3/v1.37.0 已建好出口：顶部「计划与打卡」+ 底部「全站地图」低权链）。 */
const todaySrcForNav = read("js/today.js");
check("P28：「全站地图」「计划与打卡」都已移出导航，但今日页有真链接（降级不是消失）",
  !/data-nav="home"/.test(navBlock) && !/data-nav="coach"/.test(navBlock) &&
  /href="#\/home"/.test(todaySrcForNav) && /href="#\/coach"/.test(todaySrcForNav));
check("P4：「首页」不再出现在导航（默认落地仍是「今日」，地图页不是起点）",
  !/>🏠 首页</.test(navBlock) && !/href="#\/home"/.test(navBlock));

/* ---------------- ② 首次引导横幅：一个主行动 ---------------- */
const appSrc = read("js/app.js");
const obBody = (appSrc.match(/function showOnboarding\(\) \{([\s\S]*?)\n  \}/) || [])[1] || "";
check("能定位到 showOnboarding 实现", !!obBody);
check("横幅里只有 **一个** .btn-primary（唯一的并列主按钮）",
  (obBody.match(/class="btn btn-primary/g) || []).length === 1,
  "n=" + (obBody.match(/class="btn btn-primary/g) || []).length);
check("主行动指向「今天第 1 步」而不是跳去别页（ob-go + gotoFirstStep）",
  /data-act="ob-go"/.test(obBody) && /function gotoFirstStep/.test(obBody) && /#\/today/.test(obBody));
check("「测起点」已降为文字链（.ob-bar-alt），不再是第二个按钮",
  /class="[^"]*ob-bar-alt[^"]*"[^>]*data-act="ob-start"/.test(obBody) &&
  !/class="btn[^"]*"[^>]*data-act="ob-start"/.test(obBody));
check("旧的第二个起点按钮（ob-unit / 从第 1 单元开始）已删除",
  !/ob-unit|从第 1 单元开始/.test(obBody));
check("关闭入口仍在（可随时关掉导流）", /data-act="ob-close"/.test(obBody));
check("关闭/点击后仍写 fte-onboarded（不再反复出现）", /bannerMark\("ob"\)/.test(obBody));

/* ---------------- ③ 今日页首屏顺序 ---------------- */
const todaySrc = read("js/today.js");
const iProf = todaySrc.indexOf('class="td-profile"');
const iListHead = todaySrc.indexOf('<section class="td-list-head">');
const iList = todaySrc.indexOf('<section class="td-list">');
const iCredit = todaySrc.indexOf("data-credit-legend");
/* 只取「画像块之后」的模板位置：Urgent / listenHtml 的函数定义在文件更早处，用全文件 indexOf 会误判 */
const iUrgent = todaySrc.indexOf("window.Urgent.html()", iProf);
const iListen = todaySrc.indexOf("listenHtml()", iProf);
check("五步清单头 → 清单 → 记账口径 → 画像 → 急救 → 连听 的顺序成立",
  iListHead !== -1 && iListHead < iList && iList < iCredit && iCredit < iProf && iProf < iUrgent && iUrgent < iListen,
  [iListHead, iList, iCredit, iProf, iUrgent, iListen].join(" < "));
check("「岗位任务画像」已挪到五步清单之后（不再抢首屏第 3 个可点位置）",
  iProf > iList, "profile@" + iProf + " list@" + iList);
check("清单头仍保留「今天只有 5 分钟」的快捷开关（不是把它删了）",
  /data-action="td-short"/.test(todaySrc));
check("清单之前没有「岗位任务画像」块（新访客清单前只剩页头/状态条/清单头）",
  todaySrc.slice(0, iList).indexOf('class="td-profile"') === -1);

/* ---------------- ④ 首页 hero 仍只有一个主 CTA ---------------- */
const homeSrc = appSrc;
check("首页 hero 的 .hero-cta 仍只有一个链接（P1 的收敛没有回退）",
  (function () {
    const block = (homeSrc.match(/<div class="hero-cta">([\s\S]*?)<\/div>/) || [])[1] || "";
    return (block.match(/<a\b/g) || []).length === 1 && /href="#\/today"/.test(block);
  })());

/* ---------------- ⑤ 横幅文案不再并列给两个方向 ---------------- */
check("横幅副文案不再写「或直接从第 1 单元学起」（以前是两个并列起点）",
  !/或直接从第 1 单元学起/.test(obBody));

console.log("\n" + (pass ? "=== ALL PASS ===" : "=== SOME FAILED ==="));
process.exit(pass ? 0 : 1);
