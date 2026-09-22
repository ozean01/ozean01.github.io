#!/usr/bin/env node
/* 验收/审计：**可理解输入量**与「每词复现次数」（Phase 3 · P3-2 的度量基座）

   为什么需要它：S1 席位的结论是「可理解输入总量 ≈1.4 万词、每词平均 1 条例句，
   按 Nation 的复现次数标准差 1–2 个数量级」——但这是个**看不出趋势**的口头结论。
   本脚本把它变成可复算、可追踪、可设下限的数字，并产出 tools/report-input.json。

   报告口径（写在输出里，避免后人另发明一套）：
     · 输入量 = 全部**英文**教学文本的词数：词条例句 + 短语例句 + 对话台词 + 真实来信正文 + 来信模板句；
     · 复现次数 = 某个词条在**多少条不同的句子**里出现过（去重句，不是出现总次数）；
     · 目标参考：Nation 的词汇习得经验值——一个词在**不同语境**中出现 ≥3 次才算初步掌握。

   门槛：总输入量不得低于 FLOOR（下限只能上调，不能下调）。这条门禁的作用是
   防止将来删内容时把输入量悄悄削掉而没人发现。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const WEB_JS = path.join(ROOT, "js");
const FLOOR = 14000;   /* 2026-09 实测基线之上的整数下限；只允许上调 */

let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) pass = false;
}

/* ---------- 载入数据（与 lib-data 同源，另加真实来信） ---------- */
function loadAll() {
  const ctx = { console };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  ["data.js", "data-ops.js", "data-ocean.js", "data-incoterms.js", "data-settle.js",
    "data-risk.js", "data-deep.js", "data-meeting.js", "data-mail.js"].forEach(function (f) {
    let src = fs.readFileSync(path.join(WEB_JS, f), "utf8");
    /* data.js 用的是 `const FTE_DATA`（词法声明，不会成为全局属性）——与 lib-data.js 同法补一行 */
    if (f === "data.js") src += "\nglobalThis.FTE_DATA = FTE_DATA;";
    vm.runInContext(src, ctx, { filename: f });
  });
  return { data: ctx.FTE_DATA, mail: ctx.FTE_MAIL };
}

function words(s) {
  return String(s == null ? "" : s).toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

const { data, mail } = loadAll();
check("载入 19 个单元的课程数据", !!(data && data.units && data.units.length === 19), "units=" + (data && data.units ? data.units.length : 0));
check("载入真实来信语料", !!(mail && mail.threads && mail.threads.length), "threads=" + (mail && mail.threads ? mail.threads.length : 0));

/* ---------- 收集全部英文教学文本，按来源分桶 ---------- */
const buckets = {
  vocabEx: [], phraseEx: [], dialogue: [], mailBody: [], mailDrill: []
};
const perUnit = [];

(data.units || []).forEach(function (u) {
  const bucket = { id: u.id, vocab: (u.vocab || []).length, input: 0, sentences: 0 };
  (u.vocab || []).forEach(function (v) { if (v.ex) { buckets.vocabEx.push({ u: u.id, s: v.ex, w: v.w }); } });
  (u.phrases || []).forEach(function (p) { if (p.ex) buckets.phraseEx.push({ u: u.id, s: p.ex }); });
  (u.dialogues || []).forEach(function (d) {
    (d.lines || []).forEach(function (l) { if (l.en) buckets.dialogue.push({ u: u.id, s: l.en }); });
  });
  const mine = buckets.vocabEx.concat(buckets.phraseEx).filter(function (x) { return x.u === u.id; });
  mine.forEach(function (x) { bucket.input += words(x.s).length; bucket.sentences++; });
  (u.dialogues || []).forEach(function (d) {
    (d.lines || []).forEach(function (l) { if (l.en) { bucket.input += words(l.en).length; bucket.sentences++; } });
  });
  perUnit.push(bucket);
});

(mail && mail.threads ? mail.threads : []).forEach(function (t) {
  /* 来信正文在 `body`（不是 lines）；主题行也是英文输入，一并计入 */
  if (t.subject) buckets.mailBody.push({ s: t.subject });
  (t.body || t.lines || []).forEach(function (l) { if (l.s) buckets.mailBody.push({ s: l.s }); });
  const dr = t.drill || t.reply || [];
  dr.forEach(function (x) { if (x.en) buckets.mailDrill.push({ s: x.en }); });
});

const sum = function (arr) { return arr.reduce(function (a, x) { return a + words(x.s).length; }, 0); };
const totals = {
  vocabEx: sum(buckets.vocabEx),
  phraseEx: sum(buckets.phraseEx),
  dialogue: sum(buckets.dialogue),
  mailBody: sum(buckets.mailBody),
  mailDrill: sum(buckets.mailDrill)
};
const totalInput = Object.keys(totals).reduce(function (a, k) { return a + totals[k]; }, 0);

/* ---------- 复现次数：词条出现在多少条**不同的句子**里 ---------- */
const sentenceSet = {};
["vocabEx", "phraseEx", "dialogue", "mailBody", "mailDrill"].forEach(function (k) {
  buckets[k].forEach(function (x) { sentenceSet[x.s] = true; });
});
const sentenceTexts = Object.keys(sentenceSet).map(function (s) { return words(s); });

const vocabAll = [];
(data.units || []).forEach(function (u) {
  (u.vocab || []).forEach(function (v) { vocabAll.push({ u: u.id, w: v.w, key: words(v.w)[0] || "" }); });
});
const occ = { "1": 0, "2": 0, "3+": 0 };
const occDetail = {};
vocabAll.forEach(function (v) {
  if (!v.key) return;
  let n = 0;
  for (let i = 0; i < sentenceTexts.length; i++) {
    if (sentenceTexts[i].indexOf(v.key) !== -1) n++;
  }
  occDetail[v.u + ":" + v.w] = n;
  if (n <= 1) occ["1"]++; else if (n === 2) occ["2"]++; else occ["3+"]++;
});

/* ---------- 输出与门禁 ---------- */
console.log("\n-- 输入量（英文词数）--");
Object.keys(totals).forEach(function (k) { console.log("  " + k.padEnd(10) + totals[k]); });
console.log("  " + "合计".padEnd(9) + totalInput + " 词 · 去重句 " + sentenceTexts.length + " 条");

console.log("\n-- 词条复现次数（不同句子数）--");
const total = vocabAll.length || 1;
console.log("  仅 1 次：" + occ["1"] + "（" + Math.round(occ["1"] / total * 100) + "%）" +
  " · 2 次：" + occ["2"] + "（" + Math.round(occ["2"] / total * 100) + "%）" +
  " · ≥3 次：" + occ["3+"] + "（" + Math.round(occ["3+"] / total * 100) + "%）");

console.log("\n-- 每单元输入密度（词数 / 词条数）--");
perUnit.forEach(function (b) {
  const density = b.vocab ? (b.input / b.vocab).toFixed(1) : "0";
  console.log("  U" + String(b.id).padStart(2, "0") + "  词条 " + String(b.vocab).padStart(3) +
    " · 输入 " + String(b.input).padStart(5) + " 词 · 句 " + String(b.sentences).padStart(3) + " · 密度 " + density);
});

const report = {
  generatedAt: new Date().toISOString(),
  basis: "输入量=英文教学文本词数；复现次数=词条出现于多少条不同句子；目标参考 Nation：不同语境 ≥3 次",
  totals: totals, totalInput: totalInput, sentences: sentenceTexts.length,
  vocab: total, occurrences: occ, perUnit: perUnit
};
try {
  fs.writeFileSync(path.join(ROOT, "tools", "report-input.json"), JSON.stringify(report, null, 2));
  console.log("\n报告已写入: tools/report-input.json");
} catch (e) {
  check("写出 report-input.json", false, e.message);
}

check("输入量不低于下限（防止删内容悄悄缩水）", totalInput >= FLOOR, totalInput + " ≥ " + FLOOR);
check("复现次数分布已统计（三类之和 = 词条数）", occ["1"] + occ["2"] + occ["3+"] === total, occ["1"] + occ["2"] + occ["3+"] + " vs " + total);
check("每个单元都有输入（无空壳单元）", perUnit.every(function (b) { return b.input > 0; }));

/* 把「还差多少」也明确打印出来，避免这个门禁读起来像在自夸 */
const need3 = total - occ["3+"];
console.log("\n参考差距：若要每个词都在 ≥3 个不同语境出现，还缺 " + need3 +
  " 个词的复现（当前 ≥3 次的有 " + occ["3+"] + " 个）。本脚本只负责**量化**，不假装已解决。");

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
