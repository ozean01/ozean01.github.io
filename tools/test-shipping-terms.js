#!/usr/bin/env node
/* 验收测试：U13 船务术语补丁批（2026-11-21）
   本批按「重建不搬运」执行：借第三方清单的覆盖面，但每条按 UCP 600 / ICC / 船公司公开单证说明 / 通用实务重建。
   守的东西：
     A 24 条全部追加到 U13 且字段齐全、IPA 为站内 GA 口径（无 ɒ/əʊ、有主重音）
     B 与站内既有词条不重复（22 个候选因已存在被剔除；这里反向防它们被加回来）
     C 材料已知错误不进库（ETD=delivery、ORC/PSS 错拼、FCL/LCL 错全称、双重否定、Incoterms 2000 四条）
     D 附加费/计费类只写定义与计费基础，不写金额/费率
     E tools/vocab-shipping-sources.json 覆盖 100%、来源类别合法、拒收清单有理由 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = function (f) { return fs.readFileSync(path.join(ROOT, f), "utf8"); };
let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

const FILES = ["data.js", "data-ops.js", "data-ocean.js", "data-incoterms.js", "data-settle.js",
  "data-risk.js", "data-deep.js", "data-meeting.js"];
const ctx = vm.createContext({ console: console, window: {} });
FILES.forEach(function (f) { vm.runInContext(read("js/" + f), ctx, { filename: f }); });
const units = vm.runInContext("FTE_DATA.units", ctx);
const u13 = units.filter(function (u) { return u.id === 13; })[0];
check("U13 单元存在", !!u13);
const vocab = (u13 && u13.vocab) || [];
const allVocab = [];
units.forEach(function (u) { (u.vocab || []).forEach(function (v) { allVocab.push({ unit: u.id, w: v.w, cn: v.cn, ipa: v.ipa }); }); });
const totalWords = allVocab.length;

const sources = JSON.parse(read("tools/vocab-shipping-sources.json"));
const NEW = Object.keys(sources.terms || {});
check("依据文件 terms 恰好 23 条（本批实收，notify party 因 U12 已有而剔除）", NEW.length === 23, "n=" + NEW.length);
check("U13 词条 52 + 23 = 75", vocab.length === 75, "n=" + vocab.length);
console.log("  全站词条 = " + totalWords + "（U13 = " + vocab.length + "）");

/* A 字段 / IPA 口径 */
const byW = {};
vocab.forEach(function (v) { byW[String(v.w).toLowerCase()] = v; });
const miss = NEW.filter(function (w) { return !byW[w.toLowerCase()]; });
check("23 条全部已追加到 U13", miss.length === 0, miss.join(" / "));
const BAD = [];
NEW.forEach(function (w) {
  const v = byW[w.toLowerCase()];
  if (!v) return;
  ["w", "ipa", "pos", "cn", "ex", "exCn"].forEach(function (k) {
    if (!String(v[k] || "").trim()) BAD.push(w + " 缺 " + k);
  });
  if (!/^\/.+\/$/.test(String(v.ipa || ""))) BAD.push(w + " IPA 未用 /…/");
  if (/ɒ|əʊ/.test(String(v.ipa || ""))) BAD.push(w + " IPA 用了非 GA 记号 ɒ/əʊ");
  if (String(v.ipa || "").indexOf("ˈ") < 0) BAD.push(w + " IPA 缺主重音 ˈ");
  if (!/^n\.$/.test(String(v.pos || ""))) BAD.push(w + " pos 应为 n.");
  if (String(v.ex || "").toLowerCase().indexOf(String(w).toLowerCase().split(" ")[0]) < 0 &&
      /bill of lading|l\/l|ton|shipment|port|charges|party|land|water|measurement/.test(w)) {
    /* 只对「全称型」词要求例句含核心词；缩写型不强制 */
  }
});
check("23 条字段齐全 / IPA GA 合规 / 有主重音", BAD.length === 0, BAD.slice(0, 6).join("；"));

/* B 不重复：本批 23 条在全站各只出现一次；22 个既有概念不得被本批重复收录 */
const BAD2 = [];
NEW.forEach(function (w) {
  const hits = allVocab.filter(function (v) { return String(v.w).toLowerCase() === w.toLowerCase(); });
  if (hits.length !== 1) BAD2.push(w + " 全站出现 " + hits.length + " 次（应为 1 次）");
});
check("23 条在全站各只出现一次（无重复词条）", BAD2.length === 0, BAD2.slice(0, 6).join("；"));
const DUP_CONCEPTS = [
  "house B/L", "master B/L", "container yard", "container freight station", "full container load",
  "less than container load", "TEU", "FEU", "ocean freight", "BAF", "CAF", "THC", "ORC", "DDC",
  "PSS", "PCS", "GRI", "port of discharge", "place of delivery", "ETD", "ETA", "shipping order"
];
const dupBad = [];
DUP_CONCEPTS.forEach(function (c) {
  if (NEW.some(function (w) { return w.toLowerCase() === c.toLowerCase(); })) dupBad.push(c + " 被本批重复收录");
  const hits = allVocab.filter(function (v) { return String(v.w).toLowerCase() === c.toLowerCase(); }).length;
  if (hits > 1) dupBad.push(c + " 全站出现 " + hits + " 次（既有条目应只有 1 份）");
});
check("22 个已存在概念没有被本批重复收录（既有条目各仍只有 1 份）", dupBad.length === 0, dupBad.join(" / "));
check("站内仍只有一份 S/O（材料里三种冲突解释未带入）",
  allVocab.filter(function (v) { return String(v.w).toUpperCase() === "S/O"; }).length === 1);
check("站内仍只有一份 B/L 基础条目（新增的是「种类」，不是重复基础词）",
  allVocab.filter(function (v) { return String(v.w).toUpperCase() === "B/L"; }).length === 1);

/* C 材料错误不得进库 */
const FORBIDDEN = ["DAF", "DES", "DEQ", "DDU"];
const obsolete = allVocab.filter(function (v) { return FORBIDDEN.indexOf(String(v.w).toUpperCase()) !== -1; });
check("已废止的 Incoterms 2000 术语（DAF/DES/DEQ/DDU）未被新增", obsolete.length === 0);
const textAll = allVocab.map(function (v) { return v.w + "|" + v.cn; }).join("\n");
check("材料里的 ETD=delivery 口径未进库（ETD 只按 departure）",
  !/ETD[^|\n]*Estimated time of delivery/i.test(textAll));
check("材料里的 ORC/PSS 错拼未沿用（Origen Recevie / Sucharges）",
  !/Origen Recevie|Sucharges/i.test(textAll));
check("材料里的 FCL/LCL 错全称未沿用（CONTAINER CARGO LOAD / ONECONTAINER）",
  !/CONTAINER CARGO LOAD|ONECONTAINER/i.test(textAll));
check("材料里的双重否定未进库（partial shipment not unacceptable）",
  !/not unacceptable/i.test(textAll));
check("通知人沿用站内已有的 notify party（U12 一条；材料里的 notice party 未采用、本批不重复收）",
  allVocab.filter(function (v) { return String(v.w).toLowerCase() === "notify party"; }).length === 1 &&
  !byW["notify party"] && !allVocab.some(function (v) { return String(v.w).toLowerCase() === "notice party"; }));

/* D 计费类只写定义与基础，不写金额/费率 */
const MONEY = /\b(USD|EUR|RMB)\b|[$€¥]|美元|人民币|元\/|每箱\s*\d|\d+\s*美元/;
const moneyHit = NEW.filter(function (w) { const v = byW[w.toLowerCase()]; return v && (MONEY.test(v.cn) || MONEY.test(v.ex) || MONEY.test(v.exCn)); });
check("23 条里没有具体金额/费率（附加费只写定义、收取方、计费基础）", moneyHit.length === 0, moneyHit.join(" / "));

/* E 依据文件 */
const ALLOWED = [/^Incoterms 2020 官方/, /^ICC/, /^船公司公开单证说明/, /^通用实务/];
const srcBad = [];
NEW.forEach(function (w) {
  const t = sources.terms[w] || {};
  if (!t.source || !t.note) srcBad.push(w + " 缺 source/note");
  if (t.source && !ALLOWED.some(function (re) { return re.test(t.source); })) srcBad.push(w + " 来源类别非法：" + t.source);
  if (/用户转|用户提供|清单里|二手清单/.test(String(t.source) + String(t.note))) srcBad.push(w + " 依据写了材料来源");
});
check("每条都有合法依据（Incoterms 2020 官方 / ICC / 船公司公开单证说明 / 通用实务）", srcBad.length === 0, srcBad.slice(0, 5).join("；"));
const rej = sources.rejected || [];
check("拒收清单存在且 ≥ 7 条（材料错误逐条记录）", rej.length >= 7, "n=" + rej.length);
const rejBad = rej.filter(function (r) { return !r.item || !r.reason || String(r.reason).trim().length < 10; });
check("每条拒收都有条目名与理由", rejBad.length === 0);
check("拒收清单覆盖材料已知错误类型（ETD=delivery / ORC / PSS / FCL / LCL / 双重否定 / 2000 版术语 / S/O 多义 / DDC 混写 / notice party）",
  ["ETD = Estimated time of delivery", "ORC", "PSS", "FCL", "LCL", "partial shipment", "DAF", "S/O", "DDC", "notice party"].every(function (k) {
    return rej.some(function (r) {
      const s = (r.item + " " + r.reason).toLowerCase();
      return s.indexOf(k.toLowerCase()) !== -1;
    });
  }));
/* 暂缓项（不是「重复」）：place of delivery 与 U14 point of delivery 近义，待复核 */
const deferred = sources.deferred || [];
check("place of delivery 记为「近义暂不收，待复核」而不是「重复」",
  deferred.some(function (d) { return d.item === "place of delivery" && /待复核/.test(d.note) && /不是.*重复|并非.*重复/.test(d.note); }));

/* F UCP 口径在文案里写清（不是只写词） */
check("partial shipment 写明 UCP 600 第31(a) 允许分批", /第31\(a\)/.test(byW["partial shipment"].cn));
check("immediate / prompt shipment 写明 UCP 600 第3条银行不予理会",
  /第3条/.test(byW["immediate shipment"].cn) && /第3条/.test(byW["prompt shipment"].cn));
check("clean B/L 写明 UCP 600 第27条（无不良批注即清洁）", /第27条/.test(byW["clean b/l"].cn));
check("received for shipment B/L 写明需 on board 批注（UCP 600 第20条）", /第20条/.test(byW["received for shipment b/l"].cn));

console.log(pass ? "\n=== 船务术语补丁批门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);
