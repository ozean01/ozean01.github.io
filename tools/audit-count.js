#!/usr/bin/env node
/* 构建期一次性脚本：统计全站课程数据的权威数字（词/短语/对话句/IPA）。
   只扫描 js/data*.js 的 FTE_DATA.units，不修改原文件。
   用途：把 README 里互相矛盾的手写数字（691/460+/652）换成脚本生成的真实值，
        避免"每个文件一个数"的漂移。

   运行：node tools/audit-count.js   （在 外贸英语/ 目录下）
   输出：控制台打印统计 + 生成 tools/report-count.json
*/
"use strict";
const fs = require("fs");
const path = require("path");

const JSDIR = path.join(__dirname, "..", "js");
/* 参与课程结构的所有数据文件（data-mistakes.js 是易错点语料，另计，不并入 units） */
const FILES = ["data.js", "data-ops.js", "data-ocean.js", "data-incoterms.js", "data-settle.js", "data-risk.js", "data-deep.js"];
const OUT = path.join(__dirname, "report-count.json");

function loadUnits() {
  const vm = require("vm");
  const ctx = { console };
  vm.createContext(ctx);
  for (const f of FILES) {
    let src = fs.readFileSync(path.join(JSDIR, f), "utf8");
    if (src.charCodeAt(0) === 0xfeff) console.log("!! BOM:", f);
    if (f === "data.js") src += "\nglobalThis.FTE_DATA = FTE_DATA;";
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx.FTE_DATA.units;
}

const UNITS = loadUnits();

let vocab = 0, ipa = 0, phrases = 0, dialogs = 0, lines = 0;
const unitVocab = [];
UNITS.forEach(function (u) {
  const vc = (u.vocab || []).length;
  const ic = (u.vocab || []).filter(function (v) { return v.ipa || v.ipa === "" ? v.ipa && String(v.ipa).trim() !== "" : false; }).length;
  vocab += vc;
  ipa += ic;
  phrases += (u.phrases || []).length;
  dialogs += (u.dialogues || []).length;
  (u.dialogues || []).forEach(function (d) { lines += (d.lines || []).length; });
  unitVocab.push({ id: u.id, title: u.title, vocab: vc, ipa: ic });
});

const result = {
  units: UNITS.length,
  vocab: vocab,
  ipa: ipa,
  phrases: phrases,
  dialogs: dialogs,
  lines: lines,
  unitVocab: unitVocab
};

fs.writeFileSync(OUT, JSON.stringify(result, null, 2));

console.log("======== 全站课程数据统计 ========");
console.log("单元数     : " + result.units);
console.log("词汇总条数 : " + result.vocab);
console.log("含 IPA 数  : " + result.ipa);
console.log("短语数     : " + result.phrases);
console.log("对话段数   : " + result.dialogs);
console.log("对话总句数 : " + result.lines);
console.log("----------------------------------");
console.log("按单元词汇数:");
result.unitVocab.forEach(function (u) { console.log("  U" + u.id + " 词汇 " + u.vocab + " · IPA " + u.ipa + "  " + u.title); });
console.log("统计已写入: " + OUT);
