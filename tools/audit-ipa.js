#!/usr/bin/env node
/* 构建期一次性脚本：审计 652 个词汇条目的 IPA 与词频难度标注。
   只扫描 js/data*.js 的 FTE_DATA.units 结构，不修改原文件；
   把结果写成 tools/report-ipa.csv 报告 + 一个 data-lvl-patch.js（可选手动合并）。

   两大输入：
   1) IPA 格式规则（零歧义，直接修）
      - ipa 是否以 / / 包裹（或空）
      - 内是否含空格、中文、非 IPA 字符、重复分隔符
      - 英美混用检测：英式 RP 特有音标 /ɒ/ 与美式 /ɑː/ 混用（作提示，不强制改）
      - 多音/斜杠里含逗号（如 /ˌeɪ, ˌiː/）提示需人工
   2) 词频难度（来自语料内部信号 + 结构规则）
      - 多词条目 / 含连字符或数字 / 命中专业词根（adhesive、resin、film、pouch…
         与 U11 技术词）→ lvl:'tech'
      - 命中高频白名单（商务基础词）→ lvl:'high'
      - 其余 → lvl:'common'
   说明：本次为离线、无外部词典条件下实现的近合格版本；后续若引入 ECDICT/ipa-dict，
   可直接把本脚本的数据源替换为词典文件并对齐（见评估文档 P0-5）。 */
"use strict";
const fs = require("fs");
const path = require("path");

const JSDIR = path.join(__dirname, "..", "js");
const FILES = ["data.js", "data-ops.js", "data-ocean.js", "data-incoterms.js", "data-settle.js"];
const OUT = path.join(__dirname, "report-ipa.csv");
const PATCH = path.join(__dirname, "data-lvl-patch.js");

/* 专业词根：命中即 tech（软包装 / 化工 / 货代 / 结算） */
const TECH = /(adhesive|resin|poly|isocyan|catal|solvent|laminate|lamination|coating|film|pouch|bag|pack|carton|container|freight|vessel|voyage|customs|tariff|inspection|invoice|shipment|remitt|letter.?of.?credit|documentary|negotiat|incoterm|fob|cif|cfr|cpt|cip|exw|fca|fas|dap|dpu|ddp|consignee|shipper|vessel|demurrage|detention|telex|endorsement|term|conform|discrepan|beneficiary|applicant|insur|average|salvage|bill.?of.?exchange|promissory|fcl|lcl|teu|feu|etd|eta|vgm|nvo|isof|certif|quota|crg|bond|neigh|biti|anil|unwind|rewind|heat.?seal|peel|slack|wind|slitt|bag.?mak|sachet)/;
// 补充常见单：membrane、barrier、retort、boil、freezer、gravure、flexo、die.?cut、reliab
const TECH_EXTRA = /(membrane|barrier|retort|boil|freezer|gravure|flexo|die.?cut|reliab|collab|hygien|vitai)/;

/* 高频白名单：商务英语基础词（本语料里反复出现的核心动词/名词/形容词） */
const HIGH = new Set(("a about accept according account actual additional address advise after again agent all allow also always amount and any are around as at available back balance bank base be because before below benefit between bill both buyer by can case change charge check claim clear client close come company confirm contact contract correct cost could country customer date day deal deliver delivery deposit detail do document door during each early email end english estimate even every exchange export final find first for from full get give goods have he here high how if import include inbox into invoice it its just know last lead letter level line list load local long look made make market me meet more most need new no not number of offer office on one only or order our out pack package payment place plan please price product quality quantity quote receive reply report request sale sample send ship shipping show signature site so some specification still subject supply team that the their them there these they this time to total trade transport try us use vendor very want way we weight what when where which while who will with work would write year you your").split(/\s+/));

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
const words = [];
UNITS.forEach(function (u) {
  u.vocab.forEach(function (v, i) {
    words.push({ id: u.id + "-" + i, u: u, v: v });
  });
});

/* ---------------- IPA 校验 ---------------- */
const ipaIssues = [];
/* 只报「明显不该出现在 IPA 里的」信号，避免过噪：
   - 数字、中文、markdown 残留、反斜杠、下划线
   空格在「多词条目」（international trade）与缩略语（FOB=/ˌef oʊ ˈbiː/）里是合法的，不算问题。 */
const SUSPICIOUS = /[0-9\u4e00-\u9fff\\_*#<>()[\]{}|`↑↓^~]/;
const comma = /,/;   // 斜杠内逗号 = 多音/多读，提示人工
words.forEach(function (x) {
  const ipa = String(x.v.ipa || "");
  const w = x.v.w;
  let issues = [];
  if (!ipa) return;
  if (!/^\/.*\/$/.test(ipa)) issues.push("未用斜杠包裹");
  else {
    const inner = ipa.slice(1, -1);
    if (comma.test(inner)) issues.push("含逗号（多读/多音，需人工确认）");
    if (SUSPICIOUS.test(inner)) issues.push("含异常字符");
    if (inner.indexOf("ɒ") !== -1) issues.push("含英式[ɒ]（与美式[ɑː]取舍，提示）");
    if (inner.indexOf("ɑ") !== -1 && inner.indexOf("ɒ") !== -1) issues.push("英/美符号混用（提示）");
  }
  if (issues.length) ipaIssues.push({ id: x.id, u: x.u.id, w: w, ipa: ipa, by: issues.join(" / ") });
});

/* ---------------- 词频难度 ---------------- */
const patch = [];   // {id, lvl, node}
words.forEach(function (x) {
  const w = String(x.v.w || "").toLowerCase();
  const spaces = /\s/.test(w);
  let lvl;
  if (TECH.test(w) || TECH_EXTRA.test(w) || spaces || /[-\d]/.test(w) || w.length > 12) lvl = "tech";
  else if (HIGH.has(w)) lvl = "high";
  else lvl = "common";
  patch.push({ id: x.id, w: x.v.w, lvl: lvl, spaces: spaces });
});

/* ---------------- 写出 ---------------- */
let csv = "\ufeffID,Unit,Word,IPA,Issue\n";
ipaIssues.forEach(function (i, n) { csv += i.id + "," + i.u + "," + i.w + ',"' + i.ipa + '","' + i.by + '"\n'; });
fs.writeFileSync(OUT, csv, "utf8");

let js = "/* 词频难度补丁（脚本生成，仅作参考；如需应用请用 audit-lvl 或手动合并到各 data*.js 条目\n" +
  "   {w, ipa, pos, cn, ex, exCn} 中加 lvl 字段） */\n";
js += "window.FTE_LVL_PATCH = " + JSON.stringify(patch) + ";\n";
fs.writeFileSync(PATCH, js, "utf8");

const lv = { tech: 0, high: 0, common: 0 };
patch.forEach(function (p) { lv[p.lvl]++; });
console.log("=== 审计报告 ===");
console.log("扫描词汇：" + words.length + " 条");
console.log("IPA 问题条目：" + ipaIssues.length + " 条（详见报告）");
console.log("难度分布：tech " + lv.tech + " / high " + lv.high + " / common " + lv.common);
const dist = {};
ipaIssues.forEach(function (i) { dist[i.by] = (dist[i.by] || 0) + 1; });
Object.keys(dist).forEach(function (k) { console.log("  - '" + k + "': " + dist[k]); });
console.log("\n报告：" + OUT);
console.log("难度补丁：" + PATCH);
