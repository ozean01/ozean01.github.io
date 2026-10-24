#!/usr/bin/env node
/* 验收测试：P1-6 变异听 + P1-8 连听听懂率检验（2026-10-24）。
   由来（评估报告：听力输入薄且单一）：
     · P1-6 —— 站内原声全部是 TTS 单调音；「变异听」让每句随机 口音×语速，
       是 TTS 材料能做到的最接近真实口音变异的训练；
     · P1-8 —— 连听（P7）是「放过型」泛听，听完无理解度检验，「听过」≠「听懂」。
   本测试守住四件事：
     ① 变异听接线：playDialogue 支持 opts.vary，且口音降级口径诚实（非 native 引擎只变速）；
     ② 听后测题目生成：正确答案必在选项中、选项去重、素材不足明确拒判、题目不重复；
     ③ 听后测接线：连听完毕触发、本地生成（零新增未核对语料）、结果只进能力参考不计打卡；
     ④ 口径：结果留存走既有 progress（listenCheck 字段），UI 保留「不计入打卡」文案。 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

/* today.js 在 Node 中可加载（依赖 window.FTE_BOOT 延迟取用） */
global.window = {};
require(path.join(ROOT, "js", "today.js"));
const T = global.window.Today && global.window.Today._t;

check("today.js 暴露 makeListenQuiz / QUIZ_COUNT（纯函数可测）", !!T && typeof T.makeListenQuiz === "function" && T.QUIZ_COUNT === 3);

/* ---------- ② 听后测题目生成 ---------- */
const ITEMS = [
  { tag: "对话", en: "Our MOQ is 20,000 pieces per design.", cn: "每个款式的最小起订量是 2 万只。" },
  { tag: "对话", en: "What is your lead time for the first shipment?", cn: "首批货的交期是多久？" },
  { tag: "词条例句", en: "The peel strength meets the customer standard.", cn: "剥离强度达到客户标准。" },
  { tag: "词条例句", en: "We need the food contact declaration.", cn: "我们需要食品接触合规声明。" },
  { tag: "短语例句", en: "The container was rolled to next vessel.", cn: "货柜被甩到下一班船。" },
  { tag: "短语例句", en: "Please confirm the cut-off time.", cn: "请确认截关时间。" }
];
/* 可注入的确定性随机：固定序列，保证可复现 */
function seqRand(seq) { let i = 0; return function () { return seq[i++ % seq.length]; }; }
const qs = T.makeListenQuiz(ITEMS, 3, seqRand([0.1, 0.3, 0.5, 0.7, 0.9, 0.2, 0.4, 0.6, 0.8]));
check("素材充足 → 生成 3 题", Array.isArray(qs) && qs.length === 3, qs && ("实得 " + qs.length));
check("每题正确答案必在选项中", qs.every(function (q) { return q.opts.indexOf(q.cn) !== -1; }));
check("每题选项恰好 3 个且互不相同", qs.every(function (q) { return q.opts.length === 3 && new Set(q.opts).size === 3; }));
check("题目之间不重复（同一句不出两次）", new Set(qs.map(function (q) { return q.en; })).size === qs.length);
check("题型结构完整（en/cn/tag/opts）", qs.every(function (q) { return q.en && q.cn && q.tag && Array.isArray(q.opts); }));

check("素材不足（3 句）→ 明确拒判返回 null", T.makeListenQuiz(ITEMS.slice(0, 3), 3, seqRand([0.5, 0.5, 0.5])) === null);
const dupCn = [
  { en: "a1", cn: "同样的意思" }, { en: "a2", cn: "同样的意思" },
  { en: "a3", cn: "同样的意思" }, { en: "a4", cn: "同样的意思" }
];
check("中文释义全部雷同时无干扰项可用 → 返回 null（不出假题）", T.makeListenQuiz(dupCn, 3, seqRand([0.5])) === null);
check("空素材 → 返回 null 不抛错", T.makeListenQuiz([], 3) === null);

/* ---------- ③④ 接线与口径 ---------- */
const todaySrc = fs.readFileSync(path.join(ROOT, "js", "today.js"), "utf8");
check("连听完毕触发听后测（listenStep 完成分支调用 listenQuizStart）",
  /连听完毕[\s\S]{0,120}listenQuizStart\(items\)/.test(todaySrc));
check("连听块有听后测容器 #tdListenQuiz 与上次结果展示", todaySrc.indexOf('id="tdListenQuiz"') !== -1 && todaySrc.indexOf("lastListenCheckHtml") !== -1);
check("四个动作齐备：replay / pick / next / redo",
  ["td-quiz-replay", "td-quiz-pick", "td-quiz-next", "td-quiz-redo"].every(function (a) { return todaySrc.indexOf('"' + a + '"') !== -1; }));
check("结果留存走既有 progress.listenCheck（不新增存储键）",
  todaySrc.indexOf("listenCheck") !== -1 && todaySrc.indexOf("saveProgress") !== -1);
check("不计入打卡的口径文案保留（听后测标注「能力参考，不计入打卡」）",
  todaySrc.indexOf("能力参考，不计入打卡") !== -1);

const appSrc = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
check("app.js：playDialogue 支持 opts.vary（每句走 variedLineOpts）",
  appSrc.indexOf("opts.vary ? variedLineOpts(opts.rate)") !== -1 &&
  /function variedLineOpts\(/.test(appSrc));
check("app.js：盲听卡有「🎲 变异听」按钮（play-dlg-varied）",
  appSrc.indexOf("play-dlg-varied") !== -1 && appSrc.indexOf("变异听") !== -1);
check("口音降级口径诚实：非 native 引擎只变速（hasAccent 守卫 + UI 降级说明）",
  appSrc.indexOf('Player.engine === "native"') !== -1 &&
  appSrc.indexOf("不支持换口音，本次只随机语速") !== -1);
check("变异语速档位固定三档（0.85/1.0/1.15）",
  /VARY_RATES = \[0\.85, 1\.0, 1\.15\]/.test(appSrc));

console.log(pass ? "\n=== P1-6/P1-8 门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);
