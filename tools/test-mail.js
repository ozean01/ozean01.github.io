#!/usr/bin/env node
/* 验收测试：📨 真实业务语料（js/data-mail.js + js/write.js 的来信阅读与回信）
   由来（SLA 专家评审遗留项「补真实业务语料」）：
     站内 768 词 / 174 短语 / 28 段对话 + SOP 英文，**全部是为教学构造的英文**：
     语法正确、句子完整、信息清楚。学员在站内读得懂，一收真实客户来信就卡住。
   本门禁除了校验数据结构，更守两件**容易在后续维护中悄悄退化**的事：
     1) 「真实」这个性质本身——每封信必须带足逐句注释与「坑」，且必须存在非标准英语；
     2) 渲染安全——来信里有 > 引用层级与 & 等字符，必须真的被转义（曾因此单独写过 escM）。
*/
"use strict";
const path = require("path");
const fs = require("fs");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

/* ---- 真实课程数据（用于校验来信关联的单元确实存在）---- */
const REAL = require("./lib-data").loadFTE();
const REAL_IDS = (REAL.units || []).map(function (u) { return u.id; });

/* ---- 最小运行环境：只为能 require 这两个模块 ---- */
global.window = {};
global.FTE_DATA = REAL;
global.window.FTE_DATA = REAL;
global.document = { addEventListener: function () { } };
global.localStorage = { getItem: function () { return null; }, setItem: function () { } };
global.sessionStorage = { getItem: function () { return null; }, setItem: function () { }, removeItem: function () { } };

require(path.join(__dirname, "..", "js", "data-mail.js"));
require(path.join(__dirname, "..", "js", "write.js"));

const MAIL = global.window.FTE_MAIL;
const W = global.window.WriteStudio._t;

check("data-mail.js 暴露 window.FTE_MAIL", !!(MAIL && MAIL.threads));
const T = (MAIL && MAIL.threads) || [];
check("语料非空", T.length >= 6, T.length + " 封");

/* ---------------- ① 结构完整性 ---------------- */
const REQ = ["id", "icon", "title", "who", "tag", "subject", "unitIds", "body", "gloss", "traps", "drill", "points", "task"];
let badField = null;
T.forEach(function (t) {
  REQ.forEach(function (k) { if (t[k] == null) badField = t.id + " 缺 " + k; });
});
check("每封信都有全部必需字段", !badField, badField || "");

const ids = T.map(function (t) { return t.id; });
check("id 唯一", new Set(ids).size === ids.length);

const badUnit = [];
T.forEach(function (t) {
  (t.unitIds || []).forEach(function (u) { if (REAL_IDS.indexOf(u) === -1) badUnit.push(t.id + "→U" + u); });
});
check("关联单元在真实课程数据里都存在", badUnit.length === 0, badUnit.join(", "));
check("每封信都关联了至少一个单元", T.every(function (t) { return (t.unitIds || []).length > 0; }));

const badKind = [];
T.forEach(function (t) {
  (t.body || []).forEach(function (b) {
    if (["h", "p", "q"].indexOf(b.k) === -1 || !String(b.s || "").trim()) badKind.push(t.id);
  });
});
check("正文块只有 h/p/q 三种且非空", badKind.length === 0, badKind.join(", "));

/* ---------------- ② 「真实」这一性质本身（防后续退化）---------------- */
const thinGloss = T.filter(function (t) { return (t.gloss || []).length < 5; });
check("每封信的逐句注释 ≥ 5 条", thinGloss.length === 0, thinGloss.map(function (t) { return t.id; }).join(","));

const thinTrap = T.filter(function (t) { return (t.traps || []).length < 3; });
check("每封信的「坑」≥ 3 条（这才是这个功能的真正价值）", thinTrap.length === 0, thinTrap.map(function (t) { return t.id; }).join(","));

const badDrill = T.filter(function (t) { return (t.drill || []).length < 3 || (t.drill || []).length > 6; });
check("每封信的开口练模板句 3–6 条", badDrill.length === 0, badDrill.map(function (t) { return t.id; }).join(","));

const shortPoints = T.filter(function (t) { return (t.points || []).length < 6; });
check("每条回信任务的要点 ≥ 6 项", shortPoints.length === 0, shortPoints.map(function (t) { return t.id; }).join(","));

const badPoint = [];
T.forEach(function (t) {
  const seen = {};
  (t.points || []).forEach(function (p) {
    if (!p.t || !p.cn) badPoint.push(t.id + " 要点缺字段");
    if (seen[p.t]) badPoint.push(t.id + " 要点重复：" + p.t);
    seen[p.t] = 1;
  });
});
check("回信要点字段齐全且不重复", badPoint.length === 0, badPoint.slice(0, 3).join("; "));

/* 英文正文必须真有一定信息量——三五行的话就不是「真实来信」 */
const shortBody = T.filter(function (t) {
  const words = (t.body || []).map(function (b) { return String(b.s); }).join(" ")
    .split(/\s+/).filter(function (w) { return /[A-Za-z]/.test(w); });
  return words.length < 60;
});
check("每封信的英文正文 ≥ 60 词（有真实信息量）", shortBody.length === 0,
  shortBody.map(function (t) { return t.id; }).join(","));

/* 这整套语料的价值就在「非标准英语」——必须有信带 fix（更地道改法），也必须覆盖多国英语特征 */
let fixCount = 0;
T.forEach(function (t) { (t.gloss || []).forEach(function (g) { if (g.fix) fixCount++; }); });
check("存在 gloss.fix（更地道改法）", fixCount >= 8, fixCount + " 条");
const nonStd = T.filter(function (t) {
  return (t.gloss || []).some(function (g) { return /印式|中式|巴西|葡语|母语|时态|倒装|直译/.test(String(g.cn)); });
});
check("覆盖非标准英语（印式/中式/葡式/母语迁移）", nonStd.length >= 3,
  nonStd.map(function (t) { return t.id; }).join(","));
/* 单位与体系差异（mil / °F / 8D / letter of guaranty）是真实业务的硬门槛 */
const unitsMention = T.filter(function (t) {
  return (t.gloss || []).some(function (g) { return /mil|华氏|°F|8D|guaranty|usance|after arrival/.test(String(g.t) + String(g.cn)); });
});
check("覆盖中美/中欧单位与体系差异", unitsMention.length >= 2, unitsMention.map(function (t) { return t.id; }).join(","));

/* ---------------- ③ 渲染：真实调用，不查源码字符串 ---------------- */
const listHtml = W.mailListHtml();
check("列表页渲染出来非空", listHtml.length > 200);
let missedTitle = null;
T.forEach(function (t) { if (listHtml.indexOf(t.title) === -1) missedTitle = t.title; });
check("列表页列出每一封信", !missedTitle, missedTitle || "");
check("列表页每项都是可点的 ws-mail 入口",
  (listHtml.match(/data-action="ws-mail"/g) || []).length === T.length,
  (listHtml.match(/data-action="ws-mail"/g) || []).length + " / " + T.length);

/* 逐封渲染阅读页 */
const renderErrs = [];
T.forEach(function (t) {
  const h = W.mailReaderHtml({ mail: t.id, text: "", checked: false }, t);
  if (!h || h.length < 500) renderErrs.push(t.id + " 渲染过短");
  if (h.indexOf("undefined") !== -1) renderErrs.push(t.id + " 渲染出 undefined");
  if (h.indexOf("Subject") === -1) renderErrs.push(t.id + " 缺主题行");
  if (h.indexOf("wsText") === -1) renderErrs.push(t.id + " 缺回信输入框");
  if (h.indexOf("ws-mail-drill") === -1) renderErrs.push(t.id + " 缺闯关入口");
  if (h.indexOf("ws-mail-flash") === -1) renderErrs.push(t.id + " 缺单词卡入口");
  if (h.indexOf(t.task) === -1) renderErrs.push(t.id + " 缺回信任务");
  (t.gloss || []).forEach(function (g) { if (h.indexOf(W.escM(g.t)) === -1) renderErrs.push(t.id + " 注释未渲染：" + g.t.slice(0, 20)); });
  (t.traps || []).forEach(function (x) { if (h.indexOf(W.escM(x.t)) === -1) renderErrs.push(t.id + " 坑未渲染：" + x.t.slice(0, 20)); });
  (t.drill || []).forEach(function (d) { if (h.indexOf(W.escM(d.en)) === -1) renderErrs.push(t.id + " 模板句未渲染"); });
});
check("每封信都能渲染出注释/坑/模板句/回信框", renderErrs.length === 0, renderErrs.slice(0, 4).join("; "));

/* 转义：线程那封的 > 引用层级必须渲染成字面的 >，不能把后面的内容吞进标签 */
const thr = W.findThread("thread-long");
check("线程来信存在（关键的「历史轮次」场景）", !!thr);
const thrHtml = W.mailReaderHtml({ mail: "thread-long", text: "", checked: false }, thr);
check("> 引用层级被转义（不会破坏 DOM）", thrHtml.indexOf("&gt;&gt;&gt;") !== -1);
check("没有裸露的 >>> 留在 HTML 里", thrHtml.indexOf(">>>") === -1);
check("线程里更早一轮的关键修改仍然渲染出来（关键信息不在最新一封）",
  thrHtml.indexOf("bottom right") !== -1 && thrHtml.indexOf("20 %") !== -1);

/* textarea 预填不能出现 <br>：换行要保留为真实换行 */
const taHtml = W.mailReaderHtml({ mail: "in-enquiry", text: "Dear Mr. Sharma,\n\nThank you for your enquiry.", checked: false },
  W.findThread("in-enquiry"));
check("回信框预填保留真实换行（未被 <br> 污染）", taHtml.indexOf("Dear Mr. Sharma,\n\nThank you") !== -1);
check("回信框预填不含 <br>", taHtml.indexOf("Dear Mr. Sharma,<br>") === -1);
check("escTA 保留换行、但转义尖括号",
  W.escTA("a\nb<c") === "a\nb&lt;c");

/* 要点自查：真实走一遍反馈管线 */
const kw = W.currentKw({ mail: "in-enquiry" });
check("来信的要点取自该信的 points（不是关联单元的词汇）",
  kw.length === W.findThread("in-enquiry").points.length &&
  kw.some(function (k) { return k.t === "MOQ"; }));
const fb = W.feedbackHtml({ checked: true, text: "Thank you for your enquiry. Our MOQ is 500 kg and the lead time is 25 days." }, kw);
check("回信后要点自查能算出覆盖度", fb.indexOf("要点自查：覆盖") !== -1);
const hit = (fb.match(/kw-hit/g) || []).length;
check("写到位的关键表达被判为命中", hit >= 2, hit + " 项命中");

/* 场景写作那条路径没有被改坏（currentKw 必须仍走 keyPhrases） */
const skw = W.currentKw({ scen: "cold" });
check("场景写作的要点仍取自关联单元", skw.length > 0 && skw[0].t !== undefined);
check("currentTitle 对来信返回信标题", W.currentTitle({ mail: "tr-price" }) === W.findThread("tr-price").title);
check("currentTitle 对场景返回场景标题", W.currentTitle({ scen: "quote" }) === "回复询盘 · 报价");
check("currentCtx 对来信返回回信任务", W.currentCtx({ mail: "cn-draft" }).indexOf("延误") !== -1);

/* ---------------- ④ 接线 ---------------- */
const ROOT = path.join(__dirname, "..");
const idx = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const iMail = idx.indexOf("js/data-mail.js");
const iWrite = idx.indexOf("js/write.js");
check("index.html 引入了 data-mail.js", iMail !== -1);
check("data-mail.js 在 write.js **之前**加载（write.js 读取时要用）", iMail !== -1 && iMail < iWrite);

const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
check("sw.js 预缓存包含 data-mail.js", sw.indexOf("./js/data-mail.js") !== -1);

const appjs = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
check("启动清单校验 FTE_MAIL 已加载", /_need\("真实业务语料 data-mail\.js"/.test(appjs));

const wjs = fs.readFileSync(path.join(ROOT, "js", "write.js"), "utf8");
check("四个来信动作都已接线",
  ['act === "ws-mail"', 'act === "ws-mail-say"', 'act === "ws-mail-drill"', 'act === "ws-mail-flash"']
    .every(function (s) { return wjs.indexOf(s) !== -1; }));
check("来信复用 SOP 的两个既有出口（未新造引擎）",
  /sop\.sendToStage\(/.test(wjs) && /sop\.sendToFlash\(/.test(wjs));
check("切换来信时会清掉场景写作的草稿状态（两模式互斥）",
  /if \(act === "ws-mail"\) \{ s\.mail = [^}]*s\.scen = null;/.test(wjs));
check("作品回顾能区分来信与场景（否则点开会渲染成另一个场景）",
  /if \(findThread\(w\.scen\)\)/.test(wjs));
check("AI 批改对来信也用同一套（改走 currentTitle/currentCtx）",
  /currentCtx\(s\)/.test(wjs) && /\+ title \+ "」场景/.test(wjs));

console.log("\n-- 语料概览 --");
T.forEach(function (t) {
  console.log("  " + t.icon + " " + t.title +
    "  · 注释 " + t.gloss.length + " · 坑 " + t.traps.length +
    " · 模板句 " + t.drill.length + " · 要点 " + t.points.length);
});

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
