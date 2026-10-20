#!/usr/bin/env node
/* tools/ui-probe.js —— 零依赖 Chrome CDP 全站 UI 测量探针（task-4 交付物）
 *
 * 用法：
 *   node tools/ui-probe.js --base http://127.0.0.1:8123 --route flash --width 430
 *   node tools/ui-probe.js --route all --width 375,430,768,1280 --out tools/ui-probe-result.json
 *   node tools/ui-probe.js --route flash --pre flash-flip --width 430
 *   node tools/ui-probe.js --list
 *
 * 设计要点：
 *   - 纯 Node（>=22，实测 24）：内置 fetch 拿 /json/version，内置全局 WebSocket 连 CDP。
 *   - 真正用 Emulation.setDeviceMetricsOverride 设排版视口（--window-size 在 headless=new 下压不住视口）。
 *   - 每个场景：导航 -> 等 loadEventFired + FTE_BOOTED -> 跑 --pre 命名动作 -> settle -> Runtime.evaluate 探针。
 *   - 退出码：0 = 无高危；2 = 发现高危（横向溢出 / 文字被裁或溢出卡片面 / 越出容器边框）；1 = 探针自身出错。
 *
 * 只读取页面、不修改任何页面源码。
 */
"use strict";

const { spawn } = require("child_process");
const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");

/* ------------------------------------------------------------------ */
/* 0. 常量与工具                                                       */
/* ------------------------------------------------------------------ */

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_BASE = "http://127.0.0.1:8123";
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(...a) { process.stdout.write(a.join(" ") + "\n"); }
function errlog(...a) { process.stderr.write(a.join(" ") + "\n"); }

/* ------------------------------------------------------------------ */
/* 1. CLI                                                              */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = {
    base: DEFAULT_BASE,
    widths: [375, 430, 768, 1280],
    route: "all",
    pre: null,
    out: path.join(os.tmpdir(), "ui-probe-result.json"),
    settle: 450,
    timeout: 30000,
    chrome: null,
    port: 0,
    keep: false,
    list: false,
    maxFindings: 400,
    quiet: false,
    keepState: false,
    debug: null
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === "--base") out.base = val();
    else if (a === "--width" || a === "--widths") out.widths = String(val()).split(",").map((x) => parseInt(x, 10)).filter((n) => n > 0);
    else if (a === "--route") out.route = val();
    else if (a === "--pre") out.pre = val();
    else if (a === "--out") out.out = path.resolve(ROOT, val());
    else if (a === "--settle") out.settle = parseInt(val(), 10);
    else if (a === "--timeout") out.timeout = parseInt(val(), 10);
    else if (a === "--chrome") out.chrome = val();
    else if (a === "--port") out.port = parseInt(val(), 10);
    else if (a === "--keep") out.keep = true;
    else if (a === "--list") out.list = true;
    else if (a === "--max-findings") out.maxFindings = parseInt(val(), 10);
    else if (a === "--quiet") out.quiet = true;
    else if (a === "--keep-state") out.keepState = true;
    else if (a === "--debug") out.debug = val();
    else if (a === "-h" || a === "--help") { out.help = true; }
    else { errlog("[ui-probe] 未知参数: " + a); out.help = true; }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 2. --pre 命名动作（页面内 JS，async body，可用 await __wait(ms)）      */
/* ------------------------------------------------------------------ */

const PRE_PAGE_HELPERS = `
function __q(s, i) { return document.querySelectorAll(s)[i || 0] || null; }
function __click(s, i) { var e = __q(s, i); if (e) { e.click(); return true; } return false; }
function __set(sel, v) {
  var e = __q(sel); if (!e) return false;
  e.value = v;
  e.dispatchEvent(new Event("input", { bubbles: true }));
  e.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}
function __wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function __nav(h) { location.hash = h; return __wait(320); }
function __has(s) { return !!__q(s); }
function __flashStart(deck) {
  var d = __q("#flashDeckSel");
  if (d && deck) d.value = deck;
  __click('[data-action="flash-start"]');
  return __wait(260);
}
function __flip() { __click("#flashCard"); return __wait(650); }
/* 内容越出元素的边框盒多少 px（正数=越框）。flex 居中时内容会上下同时溢出，
   scrollHeight 只统计下方，不可靠；这里用子元素矩形并集 vs padding box。 */
function __padOverflow(el) {
  if (!el) return { over: 0, top: 0, bottom: 0, left: 0, right: 0 };
  var r = el.getBoundingClientRect(), st = getComputedStyle(el);
  var bt = parseFloat(st.borderTopWidth) || 0, bb = parseFloat(st.borderBottomWidth) || 0;
  var bl = parseFloat(st.borderLeftWidth) || 0, br = parseFloat(st.borderRightWidth) || 0;
  var top = r.top + bt, bottom = r.bottom - bb, left = r.left + bl, right = r.right - br;
  var minT = 1e9, maxB = -1e9, minL = 1e9, maxR = -1e9, any = false;
  for (var i = 0; i < el.children.length; i++) {
    var c = el.children[i];
    if (getComputedStyle(c).display === "none") continue;
    var cr = c.getBoundingClientRect();
    if (cr.width <= 0 && cr.height <= 0) continue;
    any = true;
    if (cr.top < minT) minT = cr.top;
    if (cr.bottom > maxB) maxB = cr.bottom;
    if (cr.left < minL) minL = cr.left;
    if (cr.right > maxR) maxR = cr.right;
  }
  if (!any) return { over: 0, top: 0, bottom: 0, left: 0, right: 0 };
  var oT = top - minT, oB = maxB - bottom, oL = left - minL, oR = maxR - right;
  return { over: Math.max(oT, oB, oL, oR), top: Math.round(oT * 10) / 10, bottom: Math.round(oB * 10) / 10, left: Math.round(oL * 10) / 10, right: Math.round(oR * 10) / 10 };
}
function __measureFaces() {
  var card = __q("#flashCard");
  if (!card) return null;
  var was = card.classList.contains("flipped");
  card.classList.remove("flipped");
  var f = __padOverflow(__q(".flash-front"));
  var b = __padOverflow(__q(".flash-back"));
  if (was) card.classList.add("flipped");
  return { front: f, back: b };
}
`;

const PRE = {
  "none": { desc: "默认状态（不注入动作）", code: "" },

  /* ---- 单词卡 ---- */
  "flash-front": { desc: "#/flash 正面（单词档，未翻面）", code: `
var d = __q("#flashDeckSel"); if (d) d.value = "word";
if (!__has("#flashCard")) { await __flashStart("word"); }
return JSON.stringify({ card: __has("#flashCard"), flipped: __has(".flash-card.flipped"), deck: "word" });` },
  "flash-flip": { desc: "#/flash 背面（单词档，翻面后）【自检用】", code: `
if (!__has("#flashCard")) { await __flashStart("word"); }
await __flip();
return JSON.stringify({ card: __has("#flashCard"), flipped: __has(".flash-card.flipped"), face: "back" });` },
  "flash-back-word": { desc: "同 flash-flip", code: "/*alias*/" },
  "flash-deck-phrase": { desc: "#/flash 语块档·短语 背面", code: `
await __flashStart("phrase");
await __flip();
return JSON.stringify({ card: __has("#flashCard"), deck: "phrase", flipped: __has(".flash-card.flipped") });` },
  "flash-deck-frame": { desc: "#/flash 语块档·句型骨架 背面", code: `
await __flashStart("frame");
await __flip();
return JSON.stringify({ card: __has("#flashCard"), deck: "frame", flipped: __has(".flash-card.flipped") });` },
  "flash-prod": { desc: "#/flash 产出档（中→英）背面", code: `
await __flashStart("word");
__click('[data-action="flash-prod"]');
await __wait(320);
await __flip();
return JSON.stringify({ card: __has("#flashCard"), prod: __has('[data-action="flash-prod"]'), flipped: __has(".flash-card.flipped") });` },
  "flash-worst": { desc: "#/flash 自动寻找内容最长的牌（正面或背面越框最严重）并恢复显示该牌【默认 pre】", code: `
var configs = [["word", false], ["word", true], ["phrase", false], ["frame", false]];
var best = null;
for (var ci = 0; ci < configs.length; ci++) {
  var deck = configs[ci][0], mk = configs[ci][1];
  if (__has('[data-action="flash-exit"]')) { __q('[data-action="flash-exit"]').click(); await __wait(160); }
  var d = __q("#flashDeckSel"); if (d) d.value = deck;
  var fm = __q("#flashMistakes"); if (fm) fm.checked = !!mk;
  if (!__has('[data-action="flash-start"]')) break;
  __q('[data-action="flash-start"]').click(); await __wait(280);
  for (var i = 0; i < 40; i++) {
    var wrap = __q(".flash-wrap");
    var card = __q("#flashCard");
    if (!wrap || !card) break;
    var m = __measureFaces();
    var mo = Math.max(m.front.over, m.back.over);
    if (!best || mo > best.over) {
      /* 快照时保留真正溢出的那一面朝前，探针才能测到它 */
      if (m.back.over >= m.front.over) card.classList.add("flipped");
      else card.classList.remove("flipped");
      best = { over: mo, front: m.front.over, back: m.back.over, deck: deck, mistakes: mk, idx: i, face: m.back.over >= m.front.over ? "back" : "front", html: wrap.outerHTML };
    }
    var g = __q('[data-action="flash-grade"][data-rating="3"]');
    if (!g) break;
    g.click(); await __wait(60);
  }
}
if (best && best.html) {
  var appEl = document.getElementById("app");
  var tmp = document.createElement("div");
  tmp.innerHTML = best.html;
  var node = tmp.firstElementChild;
  if (appEl && node) { appEl.innerHTML = ""; appEl.appendChild(node); }
}
return JSON.stringify(best ? { over: best.over, front: best.front, back: best.back, face: best.face, deck: best.deck, mistakes: best.mistakes, idx: best.idx, restored: !!__q("#flashCard") } : { over: 0, restored: false });` },
  "flash-scan": { desc: "#/flash 逐张量三种牌型/易错点混排的正反面越框（返回每张数字，诊断用；会改变进度）", code: `
var configs = [["word", false], ["word", true], ["phrase", false], ["frame", false]];
var res = { decks: [] };
for (var ci = 0; ci < configs.length; ci++) {
  var deck = configs[ci][0], mk = configs[ci][1];
  if (__has('[data-action="flash-exit"]')) { __q('[data-action="flash-exit"]').click(); await __wait(160); }
  var d = __q("#flashDeckSel"); if (d) d.value = deck;
  var fm = __q("#flashMistakes"); if (fm) fm.checked = !!mk;
  if (!__has('[data-action="flash-start"]')) break;
  __q('[data-action="flash-start"]').click(); await __wait(280);
  var rec = { deck: deck, mistakes: mk, cards: 0, maxFront: 0, maxBack: 0, worstIndex: -1, worstBackIndex: -1, samples: [] };
  for (var i = 0; i < 40; i++) {
    var card = __q("#flashCard");
    if (!card) break;
    var m = __measureFaces();
    var backEl = __q(".flash-back");
    rec.cards++;
    if (m.front.over > rec.maxFront) rec.maxFront = m.front.over;
    if (m.back.over > rec.maxBack) { rec.maxBack = m.back.over; rec.worstBackIndex = i; }
    if (Math.max(m.front.over, m.back.over) >= Math.max(rec.maxFront, rec.maxBack)) rec.worstIndex = i;
    if (rec.samples.length < 40) rec.samples.push({ i: i, front: m.front.over, back: m.back.over, backTop: m.back.top, backBottom: m.back.bottom, sh: backEl ? backEl.scrollHeight : 0, ch: backEl ? backEl.clientHeight : 0, text: backEl ? String(backEl.innerText || "").replace(/\\s+/g, " ").slice(0, 34) : "" });
    var g = __q('[data-action="flash-grade"][data-rating="3"]');
    if (!g) break;
    g.click(); await __wait(60);
  }
  res.decks.push(rec);
}
return JSON.stringify(res);` },

  /* ---- 单元页 tab ---- */
  "unit-tab-vocab": { desc: "#/unit/1 词汇 tab", code: `__click('[data-action="unit-tab"][data-tab="vocab"]'); await __wait(220); return "ok";` },
  "unit-tab-phrases": { desc: "#/unit/1 短语 tab", code: `__click('[data-action="unit-tab"][data-tab="phrases"]'); await __wait(220); return "ok";` },
  "unit-tab-dialogues": { desc: "#/unit/1 对话 tab", code: `__click('[data-action="unit-tab"][data-tab="dialogues"]'); await __wait(220); return "ok";` },
  "unit-tab-tips": { desc: "#/unit/1 技巧 tab", code: `__click('[data-action="unit-tab"][data-tab="tips"]'); await __wait(220); return "ok";` },

  /* ---- 测验 ---- */
  "quiz-result": { desc: "#/quiz 自动答题到结果页", code: `
var u = __q("#quizUnit"); if (u) u.value = "1";
var c = __q("#quizCount"); if (c) c.value = "5";
var allow = ["en2cn", "cn2en", "listening", "fill"];
var ts = document.querySelectorAll(".quiz-type");
for (var i = 0; i < ts.length; i++) ts[i].checked = allow.indexOf(ts[i].value) !== -1;
__click('[data-action="quiz-start"]');
await __wait(260);
for (var k = 0; k < 80; k++) {
  if (__has('[data-action="quiz-restart"]')) break;
  var opt = __q('[data-action="quiz-opt"]:not([disabled])');
  if (opt) { opt.click(); await __wait(30); continue; }
  var nx = __q('[data-action="quiz-next"]');
  if (nx) { nx.click(); await __wait(30); continue; }
  break;
}
return JSON.stringify({ result: __has('[data-action="quiz-restart"]') });` },

  /* ---- 实操 SOP ---- */
  "sop-tab-docgen": { desc: "#/sop 切到单证生成 tab", code: `__click('[data-action="sop-tab"][data-tab="docgen"]'); await __wait(280); return "ok";` },
  "sop-calc": { desc: "#/sop 实用工具 tab -> 计算器出结果", code: `
__click('[data-action="sop-tab"][data-tab="tools"]'); await __wait(260);
__click('[data-action="sop-cbm"]'); await __wait(160);
__click('[data-action="sop-cif"]'); await __wait(260);
return "ok";` },
  "sop-docgen": { desc: "#/sop 单证生成 tab -> 生成三份单证 + 加 3 行明细", code: `
__click('[data-action="sop-tab"][data-tab="docgen"]'); await __wait(280);
__click('[data-action="dg-gen"]'); await __wait(280);
__click('[data-action="dg-add"]'); await __wait(80);
__click('[data-action="dg-add"]'); await __wait(80);
__click('[data-action="dg-add"]'); await __wait(280);
return JSON.stringify({ gen: document.querySelectorAll(".dg-doc, .dg-table, table").length });` },
  "sop-consist": { desc: "#/sop 一键核对 -> 结果态", code: `
__click('[data-action="sop-consist"]'); await __wait(300);
return "ok";` },

  /* ---- 设置弹窗 ---- */
  "settings": { desc: "打开 ⚙️ 发音设置弹窗", code: `
var b = __q("#settingsBtn"); if (b) b.click();
await __wait(340);
return JSON.stringify({ open: __has("#settingsModal:not([hidden])") });` },

  /* ---- AI 教练 ---- */
  "tutor-settings": { desc: "#/tutor 默认设置/空态", code: `return JSON.stringify({ send: __has('[data-action="tutor-send"]') });` },
  "tutor-chat": { desc: "#/tutor 有对话态（无 Key 时仅能渲染空态，返回 note）", code: `
return JSON.stringify({ note: "needs-api-key", bubbles: document.querySelectorAll(".chat-msg, .tutor-msg, .msg").length });` },

  /* ---- 内嵌面板（weekly / urgent 没有独立路由，挂在 today / material 里）---- */
  "today-urgent": { desc: "#/today 展开内嵌的紧急话术面板并选场景", code: `
var d = __q("details#urgent");
if (d && !d.open) { d.open = true; d.dispatchEvent(new Event("toggle", { bubbles: true })); await __wait(240); }
__click('[data-action="urg-pick"]');
await __wait(260);
return JSON.stringify({ open: !!__q("details#urgent[open]"), chips: document.querySelectorAll('[data-action="urg-pick"]').length });` },
  "today-weekly": { desc: "#/today 展开内嵌周报面板并标记已投料", code: `
var b = __q('[data-action="wk-done"]');
if (!b) {
  /* 只展开「含周报控件」的 details，别把导航下拉等无关 <details> 一起打开（会污染测量） */
  var ds = document.querySelectorAll("details");
  for (var i = 0; i < ds.length; i++) { if (ds[i].querySelector('[data-action="wk-done"]')) ds[i].open = true; }
  await __wait(260);
  b = __q('[data-action="wk-done"]');
}
if (b) b.click();
await __wait(260);
return JSON.stringify({ found: !!b, done: !!__q('[data-action="wk-done"].on, [data-action="wk-done"]') });` },
  "material-weekly": { desc: "#/material 展开内嵌周报面板", code: `
var b = __q('[data-action="wk-done"]');
if (!b) {
  var ds = document.querySelectorAll("details");
  for (var i = 0; i < ds.length; i++) { if (ds[i].querySelector('[data-action="wk-done"]')) ds[i].open = true; }
  await __wait(260);
  b = __q('[data-action="wk-done"]');
}
if (b) b.click();
await __wait(260);
return JSON.stringify({ found: !!b });` },

  /* ---- 其他模块（best effort）---- */
  "write-draft2": { desc: "#/write 要点自查后的二稿态", code: `
__click('[data-action="ws-mail"]'); await __wait(300);
if (!__q("textarea")) { __click('[data-action="ws-pick"]'); await __wait(300); }
var ta = __q("textarea");
if (ta) {
  ta.value = "Dear Anna,\\n\\nThanks for your inquiry. We can offer FOB Shanghai USD 2.50 per piece for 5000 pcs, shipment within 30 days.\\n\\nBest regards,\\nLi";
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
__click('[data-action="ws-submit"]'); await __wait(320);
return JSON.stringify({ textarea: !!ta, aiBtn: __has('[data-action="ws-ai"]') });` },
  "weekly-done": { desc: "#/weekly 标记本周已投料", code: `__click('[data-action="wk-done"]'); await __wait(260); return "ok";` },
  "urgent-scene": { desc: "#/urgent 选中一个场景 -> 话术列表", code: `__click('[data-action="urg-pick"]'); await __wait(280); return "ok";` },
  "placement-evidence": { desc: "#/placement 打分后存证据理由", code: `
__click('[data-action="pl-skill"]'); await __wait(120);
__click('[data-action="pl-score"]'); await __wait(120);
__click('[data-action="pl-evidence-save"]'); await __wait(300);
return "ok";` },
  "listen-quiz": { desc: "#/listen 开始辨音 -> 选中选项后的判对错反馈", code: `
__click('[data-action="mp-start"]'); await __wait(320);
__click('[data-action="mp-opt"]'); await __wait(320);
return JSON.stringify({ feedback: __has('[data-action="mp-next"]') });` },
  "phonemes-table": { desc: "#/phonemes 展开某音素全部例词", code: `__click('[data-action="ph-more"]'); await __wait(280); return "ok";` }
};

PRE["flash-back-word"].code = PRE["flash-flip"].code;

/* ---- 场景矩阵（--route all 时使用）---- */
function defaultScenarios() {
  const s = [];
  const add = (route, pre, note) => s.push({ route, pre: pre || "none", note: note || "" });

  add("home", "none");
  add("today", "none");
  add("units", "none");
  add("unit/1", "none");
  add("unit/1", "unit-tab-phrases");
  add("unit/1", "unit-tab-dialogues");
  add("unit/1", "unit-tab-tips");

  add("flash", "flash-front", "正面");
  add("flash", "flash-flip", "背面 ← 首张卡");
  add("flash", "flash-worst", "内容最长的一张背面/正面 ← 自检主用");
  add("flash", "flash-deck-phrase", "语块档·短语 背面");
  add("flash", "flash-deck-frame", "语块档·骨架 背面");
  add("flash", "flash-prod", "产出档 背面");
  add("flash", "flash-scan", "三种牌型逐张越框数字（诊断）");

  add("quiz", "none");
  add("quiz", "quiz-result");

  add("sop", "none");
  add("sop", "sop-tab-docgen");
  add("sop", "sop-docgen");
  add("sop", "sop-calc");
  add("sop", "sop-consist");

  add("tutor", "none");
  add("tutor", "tutor-chat");
  add("home", "settings", "设置弹窗");

  add("search", "none", "空态");
  add("search/FOB", "none", "有结果态");
  add("search/zzzqqq", "none", "无结果态");

  ["speak", "material", "mysay", "glossary", "write", "placement", "patterns",
   "phonemes", "coach", "mistakes", "sources", "board", "speaking",
   "subtitle", "listen", "eval4", "speech"].forEach((r) => add(r, "none"));

  /* weekly / urgent / immerse 不是独立路由（parseHash 白名单没有），
     它们内嵌在 #/today 与 #/material 里，所以按宿主页 + 展开面板来测。 */
  add("today", "today-urgent", "真实入口 #/today（内嵌 #urgent 面板展开）");
  add("today", "today-weekly", "真实入口 #/today（内嵌周报面板）");
  add("material", "material-weekly", "真实入口 #/material（内嵌周报面板）");

  add("write", "write-draft2");
  add("placement", "placement-evidence");
  add("listen", "listen-quiz");
  add("phonemes", "phonemes-table");
  return s;
}

/* ------------------------------------------------------------------ */
/* 3. 页面内探针脚本                                                    */
/* ------------------------------------------------------------------ */

const PROBE_PAGE = `(function () {
  var LW = document.documentElement.clientWidth;
  var LH = document.documentElement.clientHeight;
  var out = {
    layoutWidth: LW,
    innerWidth: window.innerWidth,
    layoutHeight: LH,
    docScrollWidth: document.documentElement.scrollWidth,
    docScrollHeight: document.documentElement.scrollHeight,
    docOverflowX: document.documentElement.scrollWidth - LW,
    findings: [],
    clickables: [],
    counts: {},
    scanned: 0
  };

  function norm(s) { return String(s == null ? "" : s).replace(/\\s+/g, " ").trim(); }
  function cut(s, n) { s = norm(s); n = n || 70; return s.length > n ? s.slice(0, n) + "\\u2026" : s; }
  function px(n) { return Math.round(n * 10) / 10; }

  function cssPath(e) {
    if (!e || e.nodeType !== 1) return "";
    if (e === document.body) return "body";
    var parts = [], cur = e, depth = 0;
    while (cur && cur.nodeType === 1 && cur !== document.body && depth < 6) {
      var s = cur.tagName.toLowerCase();
      if (cur.id) { parts.unshift(s + "#" + cur.id); break; }
      var cls = norm(cur.getAttribute("class") || "").split(" ").filter(Boolean).slice(0, 2);
      if (cls.length) s += "." + cls.join(".");
      var da = cur.getAttribute("data-action");
      if (da) s += '[data-action="' + da + '"]';
      var p = cur.parentElement;
      if (p) {
        var sibs = [].slice.call(p.children).filter(function (c) { return c.tagName === cur.tagName; });
        if (sibs.length > 1) s += ":nth-of-type(" + (sibs.indexOf(cur) + 1) + ")";
      }
      parts.unshift(s);
      cur = cur.parentElement; depth++;
    }
    return parts.join(" > ");
  }

  function ownText(e) {
    var t = "";
    for (var i = 0; i < e.childNodes.length; i++) {
      var n = e.childNodes[i];
      if (n.nodeType === 3) t += n.nodeValue;
    }
    return norm(t);
  }
  function hasOwnText(e) { return ownText(e).length > 0; }
  function visibleText(e) { return norm(e.innerText || e.textContent || ""); }
  /* 纯 emoji/符号（彩色字形是位图，CSS color 对它无效）——对比度检查应跳过 */
  function isEmojiOnly(s) {
    s = String(s || "");
    var rest = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.codePointAt(i);
      if (c > 0xFFFF) i++;
      if (c === 0x20 || c === 0x09 || c === 0x0A || c === 0x0D) continue;
      if (c === 0xFE0F || c === 0xFE0E || c === 0x200D || c === 0x20E3) continue;
      if ((c >= 0x1F000 && c <= 0x1FAFF) || (c >= 0x2600 && c <= 0x27BF) ||
          (c >= 0x2B00 && c <= 0x2BFF) || (c >= 0x2190 && c <= 0x21FF) ||
          (c >= 0x2300 && c <= 0x23FF) || (c >= 0x25A0 && c <= 0x25FF) ||
          (c >= 0x1F1E6 && c <= 0x1F1FF)) continue;
      rest += String.fromCodePoint(c);
    }
    return rest.length === 0 && s.length > 0;
  }

  function styleHidden(e) {
    var st = getComputedStyle(e);
    if (st.display === "none" || st.visibility === "hidden" || st.visibility === "collapse") return true;
    if (parseFloat(st.opacity) === 0) return true;
    if (e.hasAttribute("hidden")) return true;
    if (e.closest("[hidden]")) return true;
    /* 完全未渲染（无客户端矩形）：比 rect 宽高为 0 更早发现 */
    if (e.getClientRects().length === 0) return true;
    /* 关闭的 <details>：Chrome 仍为内容保留布局盒（实测 .urg-body top=1837 h=594），
       但不绘制。除 <summary> 外一律视为不可见，否则折叠面板会刷出成百条假「越框/重叠」。 */
    var closed = e.closest("details:not([open])");
    if (closed && !(e.tagName === "SUMMARY" && e.parentElement === closed)) return true;
    /* content-visibility:hidden 的子树同理不渲染 */
    var cur = e.parentElement, guard = 0;
    while (cur && cur !== document.body && guard < 8) {
      if (getComputedStyle(cur).contentVisibility === "hidden") return true;
      cur = cur.parentElement; guard++;
    }
    /* 祖先 display:none：Chrome 对 display:none 子树里的**绝对定位**后代有时仍给布局盒
       （rect/getClientRects 非空），只查自身与 getClientRects 会漏。用带记忆的祖先检查兜底。 */
    if (ancestorDisplayNone(e)) return true;
    var r = e.getBoundingClientRect();
    if (r.width <= 0.5 && r.height <= 0.5) return true;
    if (e.closest(".sr-only,.visually-hidden,.a11y-hidden")) return true;
    return false;
  }
  /* 记忆化：按 DOM 顺序遍历时父节点先算过，整体 O(n) */
  var _dispMemo = new WeakMap();
  function ancestorDisplayNone(e) {
    if (!e || e.nodeType !== 1) return false;
    if (_dispMemo.has(e)) return _dispMemo.get(e);
    var st = getComputedStyle(e);
    var hidden = (st.display === "none");
    if (!hidden) {
      var p = e.parentElement;
      if (p && p !== document.documentElement) hidden = ancestorDisplayNone(p);
    }
    _dispMemo.set(e, hidden);
    return hidden;
  }

  /* 3D 翻卡：backface-visibility:hidden 的面计算样式仍是 visible，且 Chrome 的
     elementFromPoint 仍会命中背面的隐藏面，所以不能用命中测试判断可见性。
     改为读翻卡容器的 .flipped 状态：未翻面显示 .flash-front，翻面显示 .flash-back。 */
  function flipShown(e) {
    var card = e.closest(".flash-card");
    if (!card) return null;
    var face = e.closest(".flash-face");
    if (!face) return null;
    var cls = " " + face.className + " ";
    var isBack = cls.indexOf(" flash-back ") !== -1;
    var isFront = cls.indexOf(" flash-front ") !== -1;
    if (!isBack && !isFront) return null;
    var flipped = card.classList.contains("flipped");
    return flipped ? isBack : isFront;
  }
  function backfaceAncestor(e) {
    var cur = e;
    while (cur && cur.nodeType === 1 && cur !== document.body) {
      var bf = getComputedStyle(cur).backfaceVisibility;
      if (bf === "hidden") return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  function hitSelf(e) {
    var r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var x = Math.min(Math.max(r.left + r.width / 2, 1), LW - 1);
    var y = Math.min(Math.max(r.top + r.height / 2, 1), LH - 1);
    var top = document.elementFromPoint(x, y);
    return !!(top && (top === e || e.contains(top)));
  }
  function visible(e) {
    if (!e || e.nodeType !== 1) return false;
    if (styleHidden(e)) return false;
    var shown = flipShown(e);
    if (shown === false) return false;
    if (shown === null && backfaceAncestor(e) && !hitSelf(e)) return false;
    return true;
  }

  function rectOf(e) {
    var r = e.getBoundingClientRect();
    return { x: px(r.x), y: px(r.y), w: px(r.width), h: px(r.height), right: px(r.right), bottom: px(r.bottom) };
  }
  function infoOf(e) {
    return {
      selector: cssPath(e),
      tag: e.tagName.toLowerCase(),
      classes: norm(e.getAttribute("class") || ""),
      action: e.getAttribute("data-action") || "",
      id: e.id || "",
      text: cut(e.innerText || e.textContent || "", 70),
      title: e.getAttribute("title") || "",
      ariaLabel: e.getAttribute("aria-label") || "",
      rect: rectOf(e)
    };
  }
  function push(cat, sev, e, detail, numbers, note) {
    if (!e) return;
    var f = infoOf(e);
    f.category = cat;
    f.severity = sev;
    f.detail = detail;
    f.numbers = numbers || {};
    if (note) f.note = note;
    out.findings.push(f);
  }

  function scrollableAncestor(e, axis) {
    var cur = e.parentElement;
    while (cur && cur !== document.body) {
      var st = getComputedStyle(cur);
      var v = axis === "x" ? st.overflowX : st.overflowY;
      if (v === "auto" || v === "scroll") return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function childUnion(e) {
    var minT = Infinity, minL = Infinity, maxB = -Infinity, maxR = -Infinity, any = false;
    for (var i = 0; i < e.children.length; i++) {
      var c = e.children[i];
      if (!visible(c)) continue;
      var r = c.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) continue;
      any = true;
      if (r.top < minT) minT = r.top;
      if (r.left < minL) minL = r.left;
      if (r.bottom > maxB) maxB = r.bottom;
      if (r.right > maxR) maxR = r.right;
    }
    if (!any) return null;
    return { top: minT, left: minL, bottom: maxB, right: maxR };
  }
  function paddingBox(e) {
    var st = getComputedStyle(e);
    var r = e.getBoundingClientRect();
    var bt = parseFloat(st.borderTopWidth) || 0, bb = parseFloat(st.borderBottomWidth) || 0;
    var bl = parseFloat(st.borderLeftWidth) || 0, br = parseFloat(st.borderRightWidth) || 0;
    return { top: r.top + bt, left: r.left + bl, bottom: r.bottom - bb, right: r.right - br };
  }
  function isSurface(e) {
    var st = getComputedStyle(e);
    var rad = Math.max(parseFloat(st.borderTopLeftRadius) || 0, parseFloat(st.borderTopRightRadius) || 0,
      parseFloat(st.borderBottomLeftRadius) || 0, parseFloat(st.borderBottomRightRadius) || 0);
    var bg = st.backgroundColor;
    var transparentBg = !bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)";
    var bw = (parseFloat(st.borderTopWidth) || 0) + (parseFloat(st.borderLeftWidth) || 0);
    return { radius: rad, surface: rad >= 4 || !transparentBg || bw > 0 || st.backgroundImage !== "none", st: st };
  }
  function scrollableSelf(e, axis) {
    var v = axis === "x" ? getComputedStyle(e).overflowX : getComputedStyle(e).overflowY;
    return v === "auto" || v === "scroll";
  }

  var all = document.querySelectorAll("body *");
  out.scanned = all.length;

  /* 页面级横向溢出延后到「逐元素」扫描之后判定：只有当**确实有渲染中的元素**越界时才算，
     避免 display:none / 闭合 <details> 子树把 html.scrollWidth 顶大而误报（见 §1b）。 */
  var pageOverflowPlaceholder = null;

  /* ---- 路由兜底检测：路由不在 parseHash 白名单时会静默渲染首页 ---- */
  var hashStr = String(location.hash || "");
  var routeTop = (hashStr.indexOf("#/") === 0 ? hashStr.slice(2) : hashStr.replace("#", "")).split("/")[0];
  out.route = routeTop;
  if (routeTop && routeTop !== "home") {
    var homeMarker = document.querySelector(".home-zones, .home-collapse");
    if (homeMarker) {
      out.findings.push({
        category: "route-fallback", severity: "medium",
        selector: cssPath(homeMarker), tag: homeMarker.tagName.toLowerCase(), classes: norm(homeMarker.className),
        action: "", id: homeMarker.id || "", text: "", title: "", ariaLabel: "",
        rect: rectOf(homeMarker),
        detail: "路由 #/" + routeTop + " 渲染成了首页（parseHash() 白名单里没有它）",
        numbers: { hash: String(location.hash) }
      });
      out.counts.routeFallback = 1;
    }
  }

  var overflowX = [], clipText = [], escapeBox = [];
  var interactiveSelector = "button,a[href],[data-action],input,select,textarea,summary,[role='button']";

  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    if (!visible(e)) continue;
    var st = getComputedStyle(e);
    var r = e.getBoundingClientRect();
    var cb = childUnion(e);

    /* ---- 1b. 单个元素横向溢出（只用 getBoundingClientRect vs 排版视口，数字同源） ---- */
    var right = r.right - LW, left = -r.left;
    if ((right > 1 || left > 1) && !scrollableAncestor(e, "x")) {
      overflowX.push({ e: e, right: px(right), left: px(left), rect: rectOf(e), kind: "escape" });
    } else if (cb && e.scrollWidth > e.clientWidth + 1 && (st.overflowX === "hidden" || st.overflowX === "clip") && st.textOverflow !== "ellipsis") {
      /* overflow:hidden 的内容截断：必须由真实子元素造成，排除 ::before/::after 撑大的 scrollWidth */
      var pbx = paddingBox(e);
      var childR = cb.right - pbx.right, childL = pbx.left - cb.left;
      if (childR > 1 || childL > 1) {
        overflowX.push({ e: e, right: px(childR), left: px(childL), rect: rectOf(e), kind: "truncate", scrollWidth: e.scrollWidth, clientWidth: e.clientWidth });
      }
    }

    /* ---- 2 + 3. 内容越出自身盒 / 越出最近的有边框半径祖先 ---- */
    if (cb) {
      var pb = paddingBox(e);
      var overTop = pb.top - cb.top, overBottom = cb.bottom - pb.bottom;
      var overLeft = pb.left - cb.left, overRight = cb.right - pb.right;
      var vOver = Math.max(overTop, overBottom), hOver = Math.max(overLeft, overRight);
      var surf = isSurface(e);
      var hasText = visibleText(e).length > 0;
      var clipKind = (st.overflowY === "hidden" || st.overflowY === "clip") ? "clip" : (surf.surface ? "spill-surface" : "spill");
      var need = clipKind === "clip" ? 1.5 : 3; /* 可见溢出的卡片面 2px 级差异属于排版误差，不算缺陷 */

      /* <details> 是「披露/下拉」触发器，不是内容盒：它开着的绝对定位面板
         （如 nav .nav-group > .nav-sub 下拉）本来就叠在盒外，不算文字被裁。 */
      var isDisclosure = (e.tagName === "DETAILS");
      if (vOver > need && hasText && !scrollableSelf(e, "y") && !isDisclosure) {
        var kind = clipKind;
        var sev = (kind === "clip" || kind === "spill-surface") ? "high" : "medium";
        clipText.push({
          e: e, kind: kind, sev: sev,
          over: px(vOver), overTop: px(overTop), overBottom: px(overBottom),
          sh: e.scrollHeight, ch: e.clientHeight,
          contentHeight: px(cb.bottom - cb.top), boxHeight: px(pb.bottom - pb.top),
          rect: rectOf(e), pb: pb, cb: cb
        });
      }
      /* 3：子元素越出最近的有 radius / overflow 的祖先 padding box（由祖先视角检查） */
    }
  }

  /* ---- 1. 页面级横向溢出：只在「有渲染中的元素确实越出视口」时才判 ---- */
  var visibleEscape = false;
  for (var oe = 0; oe < overflowX.length; oe++) {
    if (overflowX[oe].kind === "escape") { visibleEscape = true; break; }
  }
  if (out.docOverflowX > 1 && visibleEscape) {
    out.findings.push({
      category: "page-overflow-x",
      severity: "high",
      selector: "html",
      tag: "html",
      classes: "",
      action: "",
      id: "",
      text: "",
      title: "",
      ariaLabel: "",
      rect: { x: 0, y: 0, w: px(LW), h: px(LH) },
      detail: "document.scrollWidth " + document.documentElement.scrollWidth + " > 视口 " + LW + "（整页可横向滚动 " + px(out.docOverflowX) + "px）",
      numbers: { scrollWidth: document.documentElement.scrollWidth, clientWidth: LW, overflow: px(out.docOverflowX) }
    });
  } else if (out.docOverflowX > 1) {
    out.counts.pageOverflowIgnored = 1; /* scrollWidth 被未渲染子树撑大，不计缺陷 */
  }

  /* ---- 3. 逐元素相对「最近圆角容器」越框 ---- */
  for (var i2 = 0; i2 < all.length; i2++) {
    var el = all[i2];
    if (el === document.body) continue;
    if (!visible(el)) continue;
    if (!hasOwnText(el) && !el.getAttribute("data-action") && el.tagName !== "IMG") continue;
    var anc = el.parentElement, host = null;
    while (anc && anc !== document.body) {
      var s2 = isSurface(anc);
      if (s2.radius >= 4 || getComputedStyle(anc).overflow !== "visible") { host = anc; break; }
      anc = anc.parentElement;
    }
    if (!host) continue;
    if (host.tagName === "DETAILS") continue; /* 下拉披露面板：面板叠在盒外是设计，不算越框 */
    if (scrollableSelf(host, "y") || scrollableSelf(host, "x")) continue; /* 可滚动容器不算越框 */
    var hr = host.getBoundingClientRect();
    var hpb = paddingBox(host);
    var er = el.getBoundingClientRect();
    var oT = hpb.top - er.top, oB = er.bottom - hpb.bottom, oL = hpb.left - er.left, oR = er.right - hpb.right;
    var worst = Math.max(oT, oB, oL, oR);
    if (worst > 3) {
      var dirs = [];
      if (oT > 2) dirs.push("上 " + px(oT));
      if (oB > 2) dirs.push("下 " + px(oB));
      if (oL > 2) dirs.push("左 " + px(oL));
      if (oR > 2) dirs.push("右 " + px(oR));
      escapeBox.push({
        e: el, host: host, worst: px(worst), dirs: dirs.join(" / "),
        rect: rectOf(el), hostRect: rectOf(host)
      });
    }
  }

  /* ---- 5. 触控目标（把 ::before/::after 撑出来的真实命中区算进去）----
     style.css 里 .play-btn::after 是 44×44 的透明扩边（命中区 44、视觉 40），
     只看 getBoundingClientRect 会误报。这里从元素中心向外做命中测试，量真实可点范围。 */
  function hitExtent(e) {
    var r = e.getBoundingClientRect();
    var cx = Math.min(Math.max(r.left + r.width / 2, 1), LW - 1);
    var cy = Math.min(Math.max(r.top + r.height / 2, 1), LH - 1);
    /* 用 elementsFromPoint（整条命中栈）而不是 elementFromPoint：
       相邻小圆钮的 44px ::after 会互相重叠，最顶层的点可能落在邻居上，
       但本元素的伪元素也在栈里——只要栈中有本元素或其子节点就算命中。 */
    function hits(x, y) {
      if (x < 0 || y < 0 || x >= LW || y >= LH) return false;
      var st = document.elementsFromPoint(x, y);
      for (var i = 0; i < st.length; i++) if (st[i] === e || e.contains(st[i])) return true;
      return false;
    }
    if (!hits(cx, cy)) return null;
    var x0 = cx, x1 = cx, y0 = cy, y1 = cy;
    while (x0 > 1 && hits(x0 - 1, cy)) x0--;
    while (x1 < LW - 1 && hits(x1 + 1, cy)) x1++;
    while (y0 > 1 && hits(cx, y0 - 1)) y0--;
    while (y1 < LH - 1 && hits(cx, y1 + 1)) y1++;
    return { w: px(x1 - x0 + 1), h: py(y1 - y0 + 1) };
  }
  function py(n) { return Math.round(n * 10) / 10; }
  var touch = [];
  var interactives = [].slice.call(document.querySelectorAll(interactiveSelector));
  var hitBudget = 160;
  for (var t = 0; t < interactives.length; t++) {
    var it = interactives[t];
    if (!visible(it)) continue;
    /* WCAG 2.5.8 Inline 豁免：正文里的行内链接（display:inline 的 <a>）不计触控目标 */
    if (it.tagName === "A" && getComputedStyle(it).display === "inline") continue;
    var ir = it.getBoundingClientRect();
    if (ir.width >= 44 && ir.height >= 44) continue;
    var hit = null;
    if (hitBudget > 0) { hit = hitExtent(it); hitBudget--; }
    var w = ir.width, h = ir.height;
    if (hit) { w = hit.w; h = hit.h; }
    if (w < 44 || h < 44) {
      touch.push({ e: it, w: px(w), h: px(h), rect: rectOf(it), hit: hit, expanded: !!(hit && (hit.w > ir.width + 1 || hit.h > ir.height + 1)) });
    }
  }

  /* ---- 6. 可点元素登记表（直接喂给 task-2/task-3 核对语义）---- */
  for (var c2 = 0; c2 < interactives.length; c2++) {
    var ie = interactives[c2];
    var iv = visible(ie);
    var ieTitle = ie.getAttribute("title") || "";
    var ieDisabled = !!(ie.disabled || ie.getAttribute("aria-disabled") === "true");
    out.clickables.push({
      selector: cssPath(ie),
      tag: ie.tagName.toLowerCase(),
      action: ie.getAttribute("data-action") || "",
      text: cut(ie.innerText || ie.textContent || ie.value || "", 80),
      title: ieTitle,
      hasTitle: !!ieTitle,
      ariaLabel: ie.getAttribute("aria-label") || "",
      hasAriaLabel: !!ie.getAttribute("aria-label"),
      ariaPressed: ie.hasAttribute("aria-pressed") ? ie.getAttribute("aria-pressed") : null,
      ariaExpanded: ie.hasAttribute("aria-expanded") ? ie.getAttribute("aria-expanded") : null,
      role: ie.getAttribute("role") || "",
      disabled: ieDisabled,
      disabledExplained: ieDisabled ? !!ieTitle : null,
      visible: iv,
      rect: iv ? rectOf(ie) : null,
      href: ie.getAttribute("href") || ""
    });
  }
  /* 同一 data-action 的文案/标题分歧自动归组（task-2/task-3 用来找「同一动作两种说法」） */
  var groups = {}, order = [];
  out.clickables.forEach(function (c) {
    if (!c.action) return;
    if (!groups[c.action]) { groups[c.action] = { action: c.action, count: 0, variants: [], _keys: {} }; order.push(c.action); }
    var g = groups[c.action];
    g.count++;
    var key = c.text + "\u0001" + c.title + "\u0001" + c.ariaLabel;
    if (!g._keys[key]) {
      g._keys[key] = 1;
      g.variants.push({ text: c.text, title: c.title, ariaLabel: c.ariaLabel, disabled: c.disabled, selector: c.selector });
    }
  });
  out.actionGroups = order.map(function (k) { var g = groups[k]; delete g._keys; return g; })
    .filter(function (g) { return g.variants.length > 1; })
    .sort(function (a, b) { return b.variants.length - a.variants.length; });
  /* 更窄的一类：同一 data-action 下「可见文字相同但 title/aria-label 不同」或
     「title 相同但可见文字不同」——这是真正的语义/说辞分歧，参数化文案（如不同单元名）不算。
     图标态 vs 文字态（如 ✕ 与「关闭（不保存）」）属于同一控件的两种呈现，不算冲突。 */
  out.labelConflicts = out.actionGroups.filter(function (g) {
    for (var i = 0; i < g.variants.length; i++) {
      for (var j = i + 1; j < g.variants.length; j++) {
        var a = g.variants[i], b = g.variants[j];
        var at = a.text || "", bt = b.text || "";
        if (isEmojiOnly(at) || isEmojiOnly(bt)) continue;      /* 纯图标节点不参与口径分歧 */
        var al = a.title || a.ariaLabel || "", bl = b.title || b.ariaLabel || "";
        if (at && at === bt && al !== bl) return true;         /* 同字不同说明 */
        var la = at.length, lb = bt.length;
        var mn = Math.min(la, lb), mx = Math.max(la, lb);
        if (mn <= 2 && mx >= 4) continue;                      /* 极短标签更像图标/缩写，跳过 */
        if (mn <= 3 && mx >= mn * 2.5 && mn > 0) return true;  /* 带字按钮 vs 较长说明 */
        if ((la === 0) !== (lb === 0)) return true;            /* 一个无字、一个有字 */
      }
    }
    return false;
  });

  /* ---- 4. 重叠（同一父元素的兄弟可交互元素，相交面积 > 较小者 20%）----
     只比同父兄弟：跨父元素（尤其跨不同 <details>/面板）用 offsetParent 相等判断会把
     折叠面板之间的元素配成对，实测全是假阳性。 */
  var overlap = [];
  var cand = interactives.filter(function (x) { return visible(x); });
  for (var a1 = 0; a1 < cand.length; a1++) {
    for (var b1 = a1 + 1; b1 < cand.length; b1++) {
      var ea = cand[a1], eb = cand[b1];
      if (ea.parentElement !== eb.parentElement) continue;
      if (ea.contains(eb) || eb.contains(ea)) continue;
      var pa = getComputedStyle(ea).position, pb = getComputedStyle(eb).position;
      var absA = (pa === "absolute" || pa === "fixed"), absB = (pb === "absolute" || pb === "fixed");
      if (absA !== absB) continue; /* 绝对定位盖在流内元素上是刻意的层叠，不算缺陷 */
      /* 行内文本元素（<a>/<span> 的 display:inline）的 rect 是各行的并集，相邻行会天然相交，不是遮盖 */
      if (getComputedStyle(ea).display === "inline" || getComputedStyle(eb).display === "inline") continue;
      var ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
      var ix = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
      var iy = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
      var area = ix * iy;
      if (area <= 0) continue;
      var smaller = Math.min(ra.width * ra.height, rb.width * rb.height);
      if (smaller <= 0) continue;
      var pct = area / smaller;
      if (pct > 0.2) overlap.push({ a: ea, b: eb, pct: Math.round(pct * 100), rect: { a: rectOf(ea), b: rectOf(eb) } });
    }
  }

  /* ---- 7. 对比度 ---- */
  function parseRGB(c) {
    c = String(c || "");
    var m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    var p = m[1].split(",").map(function (x) { return parseFloat(x); });
    if (p.length < 3 || isNaN(p[0])) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function over(fg, bg) {
    var a = fg.a + bg.a * (1 - fg.a);
    if (a <= 0) return { r: 255, g: 255, b: 255, a: 1 };
    return {
      r: Math.round((fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a),
      g: Math.round((fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a),
      b: Math.round((fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a),
      a: a
    };
  }
  function parseColorAny(s) {
    var c = parseRGB(s);
    if (c) return c;
    var m = String(s || "").match(/#([0-9a-fA-F]{3,8})/);
    if (!m) return null;
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    };
  }
  /* 按顶层逗号切分 background-image 的多层（gradient() 内部的逗号不能切） */
  function splitBgLayers(img) {
    var out = [], depth = 0, cur = "";
    for (var i = 0; i < img.length; i++) {
      var ch = img.charAt(i);
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (ch === "," && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  function layerColors(layer) {
    var re = /rgba?\\([^)]+\\)|#[0-9a-fA-F]{3,8}/g, m, out = [];
    while ((m = re.exec(layer))) { var c = parseColorAny(m[0]); if (c && c.a > 0) out.push(c); }
    return out;
  }
  /* 返回 CSS 顺序的图层（最上层在前）。含位图 url() 时返回 null=不可计算。 */
  function bgLayers(st) {
    var img = st.backgroundImage || "";
    var layers = [];
    if (img && img !== "none") {
      var parts = splitBgLayers(img);
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].indexOf("url(") !== -1) return null;
        var cols = layerColors(parts[i]);
        if (cols.length) layers.push(cols);
      }
    }
    return layers;
  }
  /* 返回 { candidates:[...], opacity:n, approx:bool }；candidates=null 表示背景不可计算（位图）。
     从内到外收集每一层实际的背景（元素自身半透明背景要继续向上合成，不能直接当白底），
     再按「外层先画、层内 background-color 在下 / background-image 在下层」的顺序合成。
     approx=true 表示含渐变，对比度是静态估算，不作为 high。 */
  function dedupe(arr, cap) {
    var seen = {}, out = [];
    for (var i = 0; i < arr.length; i++) {
      var key = Math.round(arr[i].r) + "," + Math.round(arr[i].g) + "," + Math.round(arr[i].b);
      if (!seen[key]) { seen[key] = 1; out.push(arr[i]); }
    }
    return out.length > cap ? out.slice(0, cap) : out;
  }
  function effBg(e) {
    var stack = [], cur = e, opacity = 1, approx = false, unknown = false;
    while (cur && cur.nodeType === 1) {
      var st = getComputedStyle(cur);
      var op = parseFloat(st.opacity);
      if (!isNaN(op) && op < 1) opacity *= op;
      var ls = bgLayers(st);
      if (ls === null) { unknown = true; break; }
      var bc = parseRGB(st.backgroundColor);
      var opaqueBg = bc && bc.a >= 0.999;
      if (ls.length) {
        var opaqueStop = false;
        for (var j = 0; j < ls.length; j++) {
          for (var k = 0; k < ls[j].length; k++) if (ls[j][k].a >= 0.999) opaqueStop = true;
        }
        stack.push({ layers: ls, bg: (bc && bc.a > 0) ? bc : null });
        approx = true;
        if (opaqueBg || opaqueStop) break;
        cur = cur.parentElement; continue;
      }
      if (bc && bc.a > 0) {
        stack.push({ layers: null, bg: bc });
        if (opaqueBg) break;
        cur = cur.parentElement; continue;
      }
      cur = cur.parentElement;
    }
    if (unknown && !stack.length) return { candidates: null, opacity: opacity, approx: true };
    var base = [{ r: 255, g: 255, b: 255, a: 1 }];
    for (var i = stack.length - 1; i >= 0; i--) {
      var layer = stack[i];
      if (layer.bg) base = base.map(function (b) { return over(layer.bg, b); });
      if (layer.layers) {
        for (var g = layer.layers.length - 1; g >= 0; g--) {
          var next = [];
          for (var b2 = 0; b2 < base.length; b2++) {
            for (var c = 0; c < layer.layers[g].length; c++) next.push(over(layer.layers[g][c], base[b2]));
          }
          base = dedupe(next, 40);
        }
      }
    }
    return { candidates: base, opacity: opacity, approx: approx };
  }
  function lum(c) {
    function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function contrast(a, b) {
    var l1 = lum(a), l2 = lum(b);
    if (l1 < l2) { var t = l1; l1 = l2; l2 = t; }
    return (l1 + 0.05) / (l2 + 0.05);
  }
  var contrastList = [];
  for (var k2 = 0; k2 < all.length; k2++) {
    var ce = all[k2];
    if (!hasOwnText(ce)) continue;
    if (!visible(ce)) continue;
    /* 纯 emoji/符号文本：彩色字形是位图，color 不生效 → 假阳性，跳过 */
    if (isEmojiOnly(ownText(ce))) continue;
    var cst = getComputedStyle(ce);
    if (cst.webkitTextFillColor === "rgba(0, 0, 0, 0)") continue;
    var fg = parseRGB(cst.color);
    if (!fg || fg.a === 0) continue;
    var bgInfo = effBg(ce);
    if (!bgInfo.candidates || !bgInfo.candidates.length) continue; /* 位图背景：无法计算，跳过不误报 */
    var fs = parseFloat(cst.fontSize) || 16;
    var fw = parseInt(cst.fontWeight, 10) || 400;
    var large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    var need = large ? 3 : 4.5;
    var effAlpha = fg.a * (isNaN(bgInfo.opacity) ? 1 : bgInfo.opacity);
    var best = null;
    for (var bi = 0; bi < bgInfo.candidates.length; bi++) {
      var bgc = bgInfo.candidates[bi];
      var fgc = effAlpha < 1 ? over({ r: fg.r, g: fg.g, b: fg.b, a: effAlpha }, bgc) : fg;
      var cr = contrast(fgc, bgc);
      if (!best || cr < best.ratio) best = { ratio: cr, bg: bgc, fg: fgc };
    }
    if (best && best.ratio < need) {
      var isDisabled = !!(ce.closest('[disabled], [aria-disabled="true"]'));
      contrastList.push({
        e: ce, ratio: Math.round(best.ratio * 100) / 100, need: need, fs: fs, fw: fw,
        approx: !!bgInfo.approx,
        disabled: isDisabled,
        opacityComposite: !!(bgInfo.opacity < 0.999) || fg.a < 0.999,
        effOpacity: Math.round((isNaN(bgInfo.opacity) ? 1 : bgInfo.opacity) * 100) / 100,
        fgAlpha: Math.round(fg.a * 100) / 100,
        fg: "rgb(" + Math.round(best.fg.r) + "," + Math.round(best.fg.g) + "," + Math.round(best.fg.b) + ")",
        bg: "rgb(" + best.bg.r + "," + best.bg.g + "," + best.bg.b + ")"
      });
    }
  }

  /* ---- 汇总入 findings（限流防止 JSON 爆炸）---- */
  var MAX = 400;
  function capped(arr) { return arr.slice(0, MAX); }
  capped(overflowX).forEach(function (o) {
    var leftSide = !(o.right > 1) && o.left > 1; /* 左越界时 right 是负数，不能照抄 */
    push("overflow-x", o.kind === "truncate" ? "medium" : "high", o.e,
      o.kind === "truncate"
        ? "横向内容被 overflow-x:hidden 截断：真实子元素右溢 " + o.right + "px（scrollWidth " + o.scrollWidth + " > clientWidth " + o.clientWidth + "，视口 " + LW + "）"
        : (leftSide
          ? "横向溢出：getBoundingClientRect().left 越出排版视口左侧 " + o.left + "px（rect.left " + o.rect.x + "，视口 " + LW + "），且无横向滚动祖先"
          : "横向溢出：getBoundingClientRect().right 超出排版视口 " + o.right + "px（rect.right " + o.rect.right + "，视口 " + LW + "），且无横向滚动祖先"),
      o.kind === "truncate"
        ? { layoutWidth: LW, childOverflowRight: o.right, childOverflowLeft: o.left, scrollWidth: o.scrollWidth, clientWidth: o.clientWidth, rect: o.rect, kind: o.kind }
        : { layoutWidth: LW, direction: leftSide ? "left" : "right", overflowRight: o.right, overflowLeft: o.left, rect: o.rect, kind: o.kind });
  });
  capped(clipText).forEach(function (o) {
    var d = o.kind === "clip"
      ? "文字被裁：内容高 " + o.contentHeight + "（scrollHeight " + o.sh + "）> 盒高 " + o.boxHeight + "，overflow-y:hidden/clip 裁掉 " + o.over + "px（上 " + o.overTop + " / 下 " + o.overBottom + "）"
      : "文字溢出固定高卡片面（无 overflow:auto）：内容高 " + o.contentHeight + " > 盒高 " + o.boxHeight + "，溢出 " + o.over + "px（上 " + o.overTop + " / 下 " + o.overBottom + "），超出部分压在圆角/背景之外";
    push("text-clip", o.sev, o.e, d,
      { contentHeight: o.contentHeight, boxHeight: o.boxHeight, overflow: o.over, overflowTop: o.overTop, overflowBottom: o.overBottom, scrollHeight: o.sh, clientHeight: o.ch, kind: o.kind, rect: o.rect });
  });
  /* 每个容器只报最严重的一个越框子元素，附带越框子元素总数（否则一个卡片能刷几十条） */
  var escHost = {}, escOrder = [];
  escapeBox.forEach(function (o) {
    var k = cssPath(o.host);
    if (!escHost[k]) { escHost[k] = { o: o, count: 1 }; escOrder.push(k); }
    else { escHost[k].count++; if (o.worst > escHost[k].o.worst) escHost[k].o = o; }
  });
  escOrder.slice(0, MAX).forEach(function (k) {
    var g = escHost[k], o = g.o;
    push("escape-box", o.worst > 8 ? "high" : "medium", o.e,
      "越出容器 " + k + " 的 padding box：" + o.dirs + "px" + (g.count > 1 ? "（该容器共 " + g.count + " 个子元素越框，此处为最严重者）" : ""),
      { overflow: o.worst, rect: o.rect, hostRect: o.hostRect, host: k, escapingChildren: g.count });
  });
  capped(touch).forEach(function (o) {
    push("touch-target", "medium", o.e,
      "触控目标 < 44px：真实命中区 " + o.w + " × " + o.h + "（视觉盒 " + o.rect.w + " × " + o.rect.h + (o.expanded ? "，已含伪元素扩边" : "") + "）",
      { hitWidth: o.w, hitHeight: o.h, rectWidth: o.rect.w, rectHeight: o.rect.h, pseudoExpanded: !!o.expanded, rect: o.rect });
  });
  capped(overlap).forEach(function (o) {
    push("overlap", "medium", o.a,
      "与 " + cssPath(o.b) + " 重叠 " + o.pct + "%（无包含关系）",
      { overlapPct: o.pct, rectA: o.rect.a, rectB: o.rect.b });
    out.findings[out.findings.length - 1].other = { selector: cssPath(o.b), text: cut(o.b.innerText || "", 50) };
  });
  capped(contrastList).forEach(function (o) {
    var sev = o.disabled ? "info" : ((!o.approx && o.ratio < 3) ? "high" : "medium");
    push(o.disabled ? "contrast-disabled" : "contrast", sev, o.e,
      "对比度 " + o.ratio + ":1 < " + o.need + ":1（字号 " + Math.round(o.fs) + "px / " + o.fw + "）"
      + (o.disabled ? " [disabled，WCAG 1.4.3 豁免，仅提示]" : "")
      + (o.approx ? " [渐变底静态估算]" : "")
      + (o.opacityComposite ? " [opacity 合成降对比，静态 CSS 门禁看不见]" : ""),
      { ratio: o.ratio, required: o.need, fontSize: Math.round(o.fs), fontWeight: o.fw, fg: o.fg, bg: o.bg, approx: !!o.approx, disabled: !!o.disabled, opacityComposite: !!o.opacityComposite, effectiveOpacity: o.effOpacity, textAlpha: o.fgAlpha });
  });

  out.counts.overflowX = overflowX.length;
  out.counts.textClip = clipText.length;
  out.counts.escapeBox = escapeBox.length;
  out.counts.touch = touch.length;
  out.counts.overlap = overlap.length;
  out.counts.contrast = contrastList.length;
  out.counts.clickables = out.clickables.length;
  var bySev = { high: 0, medium: 0, low: 0, info: 0 };
  out.findings.forEach(function (f) { bySev[f.severity] = (bySev[f.severity] || 0) + 1; });
  out.counts.bySeverity = bySev;
  out.counts.findingsTotal = out.findings.length;

  /* --debug <选择器> 用：把某个元素的颜色/背景合成链完整吐出来，供人工裁定对比度 */
  try {
    window.__uiProbeDebug = function (sel) {
      var els = [].slice.call(document.querySelectorAll(sel)).slice(0, 20);
      return els.map(function (el) {
        var st = getComputedStyle(el);
        var bgInfo = effBg(el);
        var fg = parseRGB(st.color);
        var d = {
          selector: cssPath(el),
          text: cut(el.innerText || el.textContent || "", 50),
          ownText: ownText(el),
          emojiOnly: isEmojiOnly(ownText(el)),
          color: st.color, backgroundColor: st.backgroundColor,
          backgroundImage: cut(st.backgroundImage || "", 140),
          opacity: st.opacity, fontSize: st.fontSize, fontWeight: st.fontWeight,
          position: st.position, display: st.display,
          effBgApprox: bgInfo ? !!bgInfo.approx : null,
          effBgCandidates: (bgInfo && bgInfo.candidates) ? bgInfo.candidates.slice(0, 6).map(function (c) {
            return "rgb(" + c.r + "," + c.g + "," + c.b + ") a=" + (Math.round(c.a * 100) / 100);
          }) : null,
          chain: []
        };
        if (fg && bgInfo && bgInfo.candidates) {
          var needC = (parseFloat(st.fontSize) >= 24 || (parseFloat(st.fontSize) >= 18.66 && (parseInt(st.fontWeight, 10) || 400) >= 700)) ? 3 : 4.5;
          d.ratios = bgInfo.candidates.slice(0, 8).map(function (b) {
            var fa = fg.a * (isNaN(bgInfo.opacity) ? 1 : bgInfo.opacity);
            var f2 = fa < 1 ? over({ r: fg.r, g: fg.g, b: fg.b, a: fa }, b) : fg;
            return { bg: "rgb(" + b.r + "," + b.g + "," + b.b + ")", ratio: Math.round(contrast(f2, b) * 100) / 100 };
          });
          d.required = needC;
        }
        var cur = el, gap = 0;
        while (cur && cur.nodeType === 1 && gap < 6) {
          var cst = getComputedStyle(cur);
          d.chain.push({ sel: cssPath(cur), color: cst.color, bg: cst.backgroundColor, bgImage: cut(cst.backgroundImage || "", 90), opacity: cst.opacity, position: cst.position });
          cur = cur.parentElement; gap++;
        }
        return d;
      });
    };
  } catch (e) { /* debug 钩子失败不影响主流程 */ }
  return out;
})()`;

/* ------------------------------------------------------------------ */
/* 4. 极简 CDP 客户端                                                   */
/* ------------------------------------------------------------------ */

class CDP {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.eventWaiters = new Map();
    this.closed = false;
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve());
      this.ws.addEventListener("error", (ev) => reject(new Error("WebSocket error: " + (ev && ev.message ? ev.message : "unknown"))));
    });
    this.ws.addEventListener("message", (ev) => this._onMessage(ev.data));
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const [, p] of this.pending) p.reject(new Error("CDP closed") + "\n");
      this.pending.clear();
    });
  }
  _onMessage(data) {
    let m;
    try { m = JSON.parse(typeof data === "string" ? data : String(data)); } catch (e) { return; }
    if (m.id != null && this.pending.has(m.id)) {
      const p = this.pending.get(m.id);
      this.pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.error) p.reject(new Error(m.method + " " + JSON.stringify(m.error)));
      else p.resolve(m.result);
      return;
    }
    if (m.method) {
      const waiters = this.eventWaiters.get(m.method);
      if (waiters && waiters.length) {
        const w = waiters.shift();
        clearTimeout(w.timer);
        w.resolve(m.params);
      }
    }
  }
  send(method, params, timeoutMs) {
    if (this.closed) return Promise.reject(new Error("CDP closed"));
    const id = ++this.id;
    const payload = { id, method, params: params || {} };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("CDP timeout: " + method));
      }, timeoutMs || 20000);
      this.pending.set(id, { resolve, reject, timer, method });
      this.ws.send(JSON.stringify(payload));
    });
  }
  once(method, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("event timeout: " + method)), timeoutMs || 20000);
      const arr = this.eventWaiters.get(method) || [];
      arr.push({ resolve, timer });
      this.eventWaiters.set(method, arr);
    });
  }
  async evaluate(expression, opts) {
    const o = opts || {};
    const res = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: !!o.awaitPromise,
      returnByValue: o.returnByValue !== false,
      userGesture: true,
      timeout: o.timeout || 20000
    }, (o.timeout || 20000) + 5000);
    if (res.exceptionDetails) {
      const txt = res.exceptionDetails.exception && res.exceptionDetails.exception.description
        ? res.exceptionDetails.exception.description
        : JSON.stringify(res.exceptionDetails);
      throw new Error("page exception: " + txt);
    }
    return res.result ? res.result.value : undefined;
  }
  close() {
    try { this.ws.close(); } catch (e) { /* ignore */ }
  }
}

/* ------------------------------------------------------------------ */
/* 5. Chrome 生命周期                                                   */
/* ------------------------------------------------------------------ */

function findChrome(explicit) {
  const list = explicit ? [explicit].concat(CHROME_CANDIDATES) : CHROME_CANDIDATES;
  for (const p of list) {
    try { if (p && fs.existsSync(p)) return p; } catch (e) { /* ignore */ }
  }
  return null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

async function fetchJSON(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 3000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function launchChrome(opts) {
  const exe = findChrome(opts.chrome);
  if (!exe) throw new Error("找不到 Chrome/Edge，可用 --chrome <路径> 或设置 CHROME_PATH");
  let port = opts.port;
  if (!port) port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fte-uiprobe-"));
  const args = [
    "--headless=new",
    "--remote-debugging-port=" + port,
    "--user-data-dir=" + profile,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-gpu",
    "--force-device-scale-factor=1",
    "--hide-crash-restore-bubble",
    "about:blank"
  ];
  const child = spawn(exe, args, { stdio: "ignore", windowsHide: true });
  const info = { exe, port, profile, child, version: null, wsUrl: null };
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try {
      const v = await fetchJSON("http://127.0.0.1:" + port + "/json/version", 1500);
      if (v && v.webSocketDebuggerUrl) {
        info.version = v.Browser || "";
        info.wsUrl = v.webSocketDebuggerUrl;
        return info;
      }
    } catch (e) { /* retry */ }
    if (child.exitCode != null) throw new Error("Chrome 退出，exitCode=" + child.exitCode);
    await sleep(250);
  }
  throw new Error("等待 Chrome CDP 端口超时（port " + port + "）");
}

async function firstPageTarget(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const list = await fetchJSON("http://127.0.0.1:" + port + "/json/list", 1500);
      const page = (list || []).filter((t) => t.type === "page" && t.webSocketDebuggerUrl)[0];
      if (page) return page;
    } catch (e) { /* retry */ }
    await sleep(200);
  }
  throw new Error("找不到可连接的 page target");
}

/* ------------------------------------------------------------------ */
/* 6. 单场景测量                                                        */
/* ------------------------------------------------------------------ */

async function measure(cdp, opts, scenario, width) {
  const url = opts.base.replace(/\/$/, "") + "/index.html?probe=" + Date.now() + "#/" + scenario.route;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: width,
    height: width < 768 ? 800 : 900,
    deviceScaleFactor: 1,
    mobile: width < 768,
    screenWidth: width,
    screenHeight: width < 768 ? 800 : 900
  });

  const loadP = cdp.once("Page.loadEventFired", 20000).catch(() => null);
  await cdp.send("Page.navigate", { url });
  await loadP;
  await sleep(opts.settle);

  /* 等 app 挂载完成并稳定：只等 FTE_BOOTED 会在「首页已渲染、路由页还没挂上」时抢跑
     （机器负载高时实测出现过 ready=true 但 #app 只有 header/nav、路由内容缺失）。
     这里要求 booted 且 #app.innerHTML 长度连续两次采样不变，或 booted 后最多再等 1.5s。 */
  const readyDeadline = Date.now() + 15000;
  let ready = false, lastLen = -1, stable = 0, bootedAt = 0;
  while (Date.now() < readyDeadline) {
    let info = null;
    try {
      info = await cdp.evaluate(
        "(function(){var a=document.getElementById('app');return {booted:!!window.FTE_BOOTED,len:a?a.innerHTML.length:0,hash:location.hash};})()"
      );
    } catch (e) { info = null; }
    if (info && info.booted && info.len > 0) {
      ready = true;
      if (!bootedAt) bootedAt = Date.now();
      if (info.len === lastLen) stable++; else stable = 0;
      lastLen = info.len;
      if (stable >= 2 || Date.now() - bootedAt > 1500) break;
    } else { stable = 0; lastLen = -1; }
    await sleep(140);
  }

  /* 跑 --pre */
  let preMeta = null, preError = null;
  const preName = scenario.pre || "none";
  const preDef = PRE[preName];
  if (!preDef && preName !== "none") preError = "未定义的 --pre 动作: " + preName;
  const code = preDef ? preDef.code : "";
  if (code) {
    try {
      const r = await cdp.evaluate("(async function(){\n" + PRE_PAGE_HELPERS + "\n" + code + "\n})()", { awaitPromise: true, timeout: 25000 });
      preMeta = r;
    } catch (e) {
      preError = String(e.message || e);
    }
    await sleep(opts.settle);
  }

  let data = null, probeError = null;
  try {
    data = await cdp.evaluate(PROBE_PAGE, { timeout: 30000 });
  } catch (e) {
    probeError = String(e.message || e);
  }
  let debug = null;
  if (opts.debug) {
    try {
      debug = await cdp.evaluate("(window.__uiProbeDebug ? window.__uiProbeDebug(" + JSON.stringify(opts.debug) + ") : null)", { timeout: 15000 });
    } catch (e) { debug = String(e.message || e); }
  }

  return {
    route: scenario.route,
    note: scenario.note || "",
    pre: preName,
    width: width,
    height: width < 768 ? 800 : 900,
    mobile: width < 768,
    url,
    ready: ready,
    preMeta: preMeta,
    preError: preError,
    probeError: probeError,
    debug: debug,
    debugSelector: opts.debug || null,
    data: data
  };
}

/* ------------------------------------------------------------------ */
/* 7. 控制台摘要                                                        */
/* ------------------------------------------------------------------ */

const SEV_ORDER = { high: 0, medium: 1, low: 2, info: 3 };
const CAT_LABEL = {
  "page-overflow-x": "整页横向溢出",
  "overflow-x": "横向溢出",
  "text-clip": "文字被裁/溢出卡面",
  "escape-box": "越出容器边框",
  "overlap": "元素重叠",
  "touch-target": "触控目标 <44px",
  "contrast": "对比度不足",
  "contrast-disabled": "对比度不足·disabled（豁免）",
  "route-fallback": "路由兜底到首页"
};

function printRun(run) {
  const d = run.data;
  const head = "=== #/" + run.route + " @" + run.width + "x" + run.height + (run.mobile ? " (mobile)" : "") + "  pre=" + run.pre + (run.note ? "  [" + run.note + "]" : "") + " ===";
  log(head);
  if (run.preError) log("  ⚠ --pre 失败: " + run.preError);
  if (run.probeError) log("  ⚠ 探针失败: " + run.probeError);
  if (run.preMeta != null) log("  · pre: " + (typeof run.preMeta === "string" ? run.preMeta : JSON.stringify(run.preMeta)));
  if (run.debug != null) log("  · debug(" + run.debugSelector + "): " + JSON.stringify(run.debug, null, 1));
  if (!d) { log("  (无测量数据)"); log(""); return; }
  log("  · 视口 " + d.layoutWidth + "px / 内容宽 " + d.docScrollWidth + "px / 可点元素 " + d.counts.clickables + " / 扫描 " + d.scanned + " 个元素");
  if (d.actionGroups && d.actionGroups.length) {
    log("  · 同 data-action 文案分歧 " + d.actionGroups.length + " 组（其中语义口径分歧 " + ((d.labelConflicts || []).length) + " 组）：");
    (d.labelConflicts && d.labelConflicts.length ? d.labelConflicts : d.actionGroups).slice(0, 8).forEach(function (g) {
      log("     " + g.action + " ×" + g.count + " -> " + g.variants.map(function (v) { return JSON.stringify(v.text || v.title || v.ariaLabel); }).join(" | "));
    });
  }
  const fs2 = (d.findings || []).slice().sort((a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) || a.category.localeCompare(b.category));
  if (!fs2.length) log("  ✅ 未发现问题");
  fs2.forEach((f) => {
    const tag = f.severity === "high" ? "[HIGH]" : f.severity === "medium" ? "[MED ]" : f.severity === "info" ? "[INFO]" : "[LOW ]";
    const loc = f.selector + (f.action ? "  data-action=" + f.action : "");
    log("  " + tag + " [" + f.category + "] " + loc);
    log("         " + f.detail);
    if (f.text) log('         text="' + f.text.replace(/"/g, "'") + '"');
  });
  log("");
}

function printSummary(allRuns) {
  const totals = { high: 0, medium: 0, low: 0, info: 0, runs: allRuns.length, findings: 0 };
  const byCat = {};
  allRuns.forEach((r) => {
    if (!r.data) return;
    r.data.findings.forEach((f) => {
      totals[f.severity] = (totals[f.severity] || 0) + 1;
      totals.findings++;
      byCat[f.category] = (byCat[f.category] || 0) + 1;
    });
  });
  log("================ 汇总 ================");
  log("场景数 " + totals.runs + " · 发现 " + totals.findings + " 条（HIGH " + totals.high + " / MED " + totals.medium + " / INFO " + totals.info + " / LOW " + totals.low + "）");
  Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).forEach((c) => {
    log("  " + (CAT_LABEL[c] || c) + ": " + byCat[c]);
  });
  const highs = [];
  allRuns.forEach((r) => {
    if (!r.data) return;
    r.data.findings.forEach((f) => { if (f.severity === "high") highs.push({ run: r, f: f }); });
  });
  if (highs.length) {
    log("---- HIGH（前 40 条，含定位）----");
    highs.slice(0, 40).forEach((h) => {
      log("  #/" + h.run.route + " @" + h.run.width + " pre=" + h.run.pre + " | " + h.f.selector + " | " + h.f.detail);
    });
    if (highs.length > 40) log("  ... 另外 " + (highs.length - 40) + " 条见 JSON");
  }
}

/* ------------------------------------------------------------------ */
/* 8. main                                                             */
/* ------------------------------------------------------------------ */

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    log("用法: node tools/ui-probe.js [--base URL] [--route hash|all] [--width 375,430,768,1280]");
    log("       [--pre <命名动作|js:代码>] [--out 路径] [--chrome 路径] [--settle ms] [--port n]");
    log("       [--debug <CSS 选择器>]  # 打印该元素的 color/background 合成链与各候选背景对比度");
    log("       [--keep-state] [--quiet] [--list]");
    return 0;
  }
  if (opts.list) {
    log("--pre 命名动作:");
    Object.keys(PRE).forEach((k) => log("  " + k.padEnd(22) + PRE[k].desc));
    log("");
    log("默认 --route all 场景矩阵（route | pre | note）:");
    defaultScenarios().forEach((s) => log("  " + s.route.padEnd(14) + " " + s.pre.padEnd(22) + s.note));
    return 0;
  }

  const widths = opts.widths.length ? opts.widths : [430];
  let scenarios;
  if (opts.route === "all") {
    scenarios = defaultScenarios();
  } else {
    const route = String(opts.route).replace(/^#?\/?/, "");
    const pre = opts.pre || (route === "flash" ? "flash-worst" : "none");
    scenarios = [{ route: route, pre: pre, note: opts.pre ? "" : "默认 pre" }];
  }
  if (opts.pre && opts.route !== "all") {
    scenarios = scenarios.map((s) => ({ route: s.route, pre: opts.pre.startsWith("js:") ? "none" : opts.pre, note: opts.pre.startsWith("js:") ? "raw-js" : "" }));
  }
  const rawJS = opts.pre && opts.pre.startsWith("js:") ? opts.pre.slice(3) : null;

  const chromeInfo = await launchChrome(opts);
  log("[ui-probe] Chrome: " + chromeInfo.exe);
  log("[ui-probe] CDP: ws://127.0.0.1:" + chromeInfo.port + "  " + chromeInfo.version);
  log("[ui-probe] base=" + opts.base + " widths=" + widths.join(",") + " scenarios=" + scenarios.length);

  const page = await firstPageTarget(chromeInfo.port);
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  try { await cdp.send("Network.setBypassServiceWorker", { bypass: true }); } catch (e) { /* 旧版本不支持则忽略 */ }
  if (!opts.keepState) {
    /* 每个新文档在 app 脚本执行前清空 localStorage/sessionStorage：
       flash 场景会评分并消耗卡片队列，不清空会让同一进程里的后续视口/场景拿到空队列。 */
    try {
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source: "try{localStorage.clear();sessionStorage.clear();}catch(e){}"
      });
    } catch (e) { /* 忽略 */ }
  }

  const runs = [];
  let fatal = null;
  try {
    for (const sc of scenarios) {
      for (const w of widths) {
        const useSc = rawJS ? { route: sc.route, pre: "none", note: "raw-js", rawJS: rawJS } : sc;
        let run;
        try {
          if (useSc.rawJS) {
            /* raw js 作为 pre 注入：临时包装 */
            const saved = PRE.__raw;
            PRE.__raw = { desc: "raw", code: useSc.rawJS };
            run = await measure(cdp, opts, { route: useSc.route, pre: "__raw", note: useSc.note }, w);
            if (saved) PRE.__raw = saved; else delete PRE.__raw;
          } else {
            run = await measure(cdp, opts, useSc, w);
          }
        } catch (e) {
          run = { route: sc.route, note: sc.note, pre: sc.pre, width: w, height: w < 768 ? 800 : 900, mobile: w < 768, ready: false, preError: null, probeError: null, data: null, fatal: String(e.message || e) };
          errlog("[ui-probe] 场景失败 #/" + sc.route + " @" + w + ": " + (e.message || e));
        }
        runs.push(run);
        if (!opts.quiet) printRun(run);
      }
    }
  } catch (e) {
    fatal = e;
  } finally {
    if (!opts.quiet) printSummary(runs);
    const result = {
      tool: "tools/ui-probe.js",
      generatedAt: new Date().toISOString(),
      base: opts.base,
      chrome: chromeInfo.version,
      widths: widths,
      runs: runs
    };
    try {
      fs.mkdirSync(path.dirname(opts.out), { recursive: true });
      fs.writeFileSync(opts.out, JSON.stringify(result, null, 2), "utf8");
      log("[ui-probe] JSON -> " + opts.out);
    } catch (e) {
      errlog("[ui-probe] 写 JSON 失败: " + e.message);
    }
    cdp.close();
    try { chromeInfo.child.kill(); } catch (e) { /* ignore */ }
    if (!opts.keep) {
      await sleep(300);
      try { fs.rmSync(chromeInfo.profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
  }

  if (fatal) { errlog("[ui-probe] 致命错误: " + fatal.message); return 1; }
  /* 门禁只看「溢出 / 裁切 / 越框」（规范 1/2/3 类）；对比度、触控、重叠只报告不拦门禁。 */
  const SEVERE = { "page-overflow-x": 1, "overflow-x": 1, "text-clip": 1, "escape-box": 1 };
  let severe = 0, highs = 0, probeErrs = 0;
  runs.forEach((r) => {
    if (r.probeError) probeErrs++;
    if (r.data) r.data.findings.forEach((f) => {
      if (f.severity === "high") highs++;
      if (f.severity === "high" && SEVERE[f.category]) severe++;
    });
  });
  if (probeErrs === runs.length && runs.length) { errlog("[ui-probe] 所有场景探针都失败"); return 1; }
  if (severe > 0) { log("[ui-probe] 严重问题(溢出/裁切/越框) " + severe + " 条，另有 high " + (highs - severe) + " 条（对比度等）→ exit 2"); return 2; }
  log("[ui-probe] 无严重问题 → exit 0（high " + highs + " 条非溢出类，详见 JSON）");
  return 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  errlog("[ui-probe] 未捕获: " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
