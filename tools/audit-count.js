#!/usr/bin/env node
/* 构建期一次性脚本：统计全站课程数据的权威数字（词/短语/对话句/IPA）。
   只扫描 js/data*.js 的 FTE_DATA.units，不修改原文件。
   用途：把 README 里互相矛盾的手写数字（691/460+/652）换成脚本生成的真实值，
        避免"每个文件一个数"的漂移。

   运行：node tools/audit-count.js   （在 外贸英语/ 目录下）
   输出：控制台打印统计 + 生成 tools/report-count.json

   ▲ P1-D（S10-F13）：只读模式。命中环境变量 `FTE_NO_WRITE=1` 或参数 `--no-write` 时，
     本脚本**只计算并打印，不写任何文件**（输出里会写明「只读模式：未写盘」）。
     动机：tools/report-count.json 是**被跟踪**文件，跑一次 npm test 就会重写它 → 污染工作区。
     默认行为不变：独立运行 / `npm run audit` 仍然生成报告。
     ⚠️ 需 Lead 接线：在 tools/test-all.js 给 audit-count / audit-ipa / audit-input 三个 job 设 FTE_NO_WRITE=1。
*/
"use strict";
const fs = require("fs");
const path = require("path");

/* P1-D：只读开关（环境变量或命令行参数，二者任一命中即只读） */
const READ_ONLY = process.env.FTE_NO_WRITE === "1" || process.argv.indexOf("--no-write") !== -1;

const JSDIR = path.join(__dirname, "..", "js");
/* 参与课程结构的所有数据文件（data-mistakes.js 是易错点语料，另计，不并入 units）
   ⚠️ 新增单元时务必同步这里：此前漏了 data-meeting.js（U19），导致统计少 1 单元 / 20 词。 */
const FILES = ["data.js", "data-ops.js", "data-ocean.js", "data-incoterms.js", "data-settle.js", "data-risk.js", "data-deep.js", "data-meeting.js"];
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

if (READ_ONLY) {
  console.log("（只读模式：未写盘）跳过写入 " + OUT);
} else {
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
}

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
console.log(READ_ONLY
  ? "统计未写入（只读模式：未写盘）: " + OUT
  : "统计已写入: " + OUT);
