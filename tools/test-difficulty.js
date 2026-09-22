#!/usr/bin/env node
/* 验收测试：难度标定系统 P3-4 修订（Phase 3）。
   依据 _fte-review/S1-英语教学SLA专家.md「发现 3｜难度标定效度」的实测证据，
   守住四处修复不被回退：

     ① CEFR 命中数门限：单元命中数 < 10 时 avgCefr 是 1–2 个词的噪声，必须置 null、
        cefrUsed=false，并把 0.5 权重按比例重分配给音节与词长（0.6/0.4）。
     ② 条目数量项：load = (1 + baseScore) × log2(nVocab)，order/norm/band 由 load 决定。
        目标：201 词的 U11 回到后段（旧口径下它排第 14/19，比 32 词的 U3 还「容易」）。
     ③ 同形异义假命中排除表 CEFR_EXCLUDE：pet/reach/collection/drawer 等词的 CEFR 档
        来自通用义项，贴到本站义项上就是假命中，必须回落兜底轴。
     ④ dom 收窄：film/container/inspection/certificate/quotation/shipment/customs 是
        通用商务英语，不该贴「专」角标。

   运行：node tools/test-difficulty.js   （在 外贸英语/ 目录下）
   返回：全部通过 exit 0；任一断言失败 exit 1。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const GEN = require("./gen-difficulty.js");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

/* ---------------- 载入产物（window.FTE_DIFF） ---------------- */
const ctx = { console: console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "difficulty-map.js"), "utf8"), ctx, { filename: "difficulty-map.js" });
const D = ctx.FTE_DIFF;
check("载入 js/difficulty-map.js 并读到 FTE_DIFF", !!D && !!D.units && !!D.difficultyBasis);
if (!D) { console.log("\n=== SOME FAILED ==="); process.exit(1); }

const ids = Object.keys(D.units).map(function (k) { return Number(k); }).sort(function (a, b) { return a - b; });
const UNIT_N = ids.length;
check("产物为 P3-4 修订后的 version 4", D.version === 4, "version=" + D.version);

/* ---------------- ① CEFR 命中数门限 ---------------- */
check("gen 与产物共用同一门限常量", GEN.CEFR_MIN_HITS === 10, "CEFR_MIN_HITS=" + GEN.CEFR_MIN_HITS);

const fieldsOk = ids.every(function (id) {
  const u = D.units[id];
  return typeof u.cefrHits === "number" && typeof u.cefrUsed === "boolean" && typeof u.baseScore === "number" && typeof u.load === "number";
});
check("每个单元都显式记录 cefrHits / cefrUsed / baseScore / load", fieldsOk);

const used = ids.filter(function (id) { return D.units[id].cefrUsed; });
const below = ids.filter(function (id) { return D.units[id].cefrHits < GEN.CEFR_MIN_HITS; });
check("存在命中数 < 门限的单元（否则这条门禁是空转）", below.length > 0, below.length + " 个：" + below.join(","));
check("① 命中数 < 门限的单元 cefrUsed === false", below.every(function (id) { return D.units[id].cefrUsed === false; }),
  below.map(function (id) { return "U" + id + "(hits=" + D.units[id].cefrHits + ")"; }).join(" "));
check("① 命中数 < 门限的单元 avgCefr === null", below.every(function (id) { return D.units[id].avgCefr === null; }),
  below.map(function (id) { return "U" + id + "=" + D.units[id].avgCefr; }).join(" "));
check("① cefrUsed === false 的单元权重已归一为 0 / 0.6 / 0.4（0.5 按比例分给音节与词长）",
  below.every(function (id) {
    const u = D.units[id];
    return u.weightCefr === 0 && u.weightSyl === 0.6 && u.weightLen === 0.4 && u.cefrPct === null;
  }));
check("① cefrUsed === true 的单元仍是未归一权重 0.5 / 0.3 / 0.2 且 avgCefr 非空",
  used.every(function (id) {
    const u = D.units[id];
    return u.avgCefr !== null && u.weightCefr === 0.5 && u.weightSyl === 0.3 && u.weightLen === 0.2;
  }),
  used.map(function (id) { return "U" + id + "(" + D.units[id].cefrHits + ")"; }).join(" "));
/* S1 点名的噪声单元：U12 1/46、U13 1/50、U14 2/40、U17 1/30 —— 必须全部退出 CEFR 合成 */
const S1_NOISE = { 12: 1, 13: 1, 14: 2, 17: 1 };
check("① S1 点名的噪声单元（U12 1/U13 1/U14 2/U17 1 命中）cefrUsed 全为 false",
  Object.keys(S1_NOISE).every(function (k) { return D.units[k].cefrUsed === false && D.units[k].avgCefr === null; }),
  Object.keys(S1_NOISE).map(function (k) { return "U" + k + "(hits=" + D.units[k].cefrHits + ",avgCefr=" + D.units[k].avgCefr + ")"; }).join(" "));

/* ---------------- ② 条目数量项 + 排序 ---------------- */
const loadSorted = ids.slice().sort(function (a, b) { return D.units[a].load - D.units[b].load; });
check("② order 与按 load 升序排序完全一致（order/norm/band 由 load 决定）",
  D.order.length === UNIT_N && D.order.every(function (id, i) { return id === loadSorted[i]; }),
  "order=" + JSON.stringify(D.order));
check("② sortIdx 与 order 位置一致（1 = 最易）",
  D.order.every(function (id, i) { return D.units[id].sortIdx === i + 1; }));
check("② load 确实含条目量项：nVocab 相同而 baseScore 更大的单元 load 更大",
  (function () {
    const byN = {};
    ids.forEach(function (id) { (byN[D.units[id].nVocab] = byN[D.units[id].nVocab] || []).push(id); });
    return Object.keys(byN).some(function (n) {
      const g = byN[n];
      if (g.length < 2) return false;
      const a = g[0], b = g[1];
      return (D.units[a].baseScore - D.units[b].baseScore) * (D.units[a].load - D.units[b].load) > 0;
    });
  })());

/* 修订前实测：order = [4,10,13,8,7,2,6,5,1,9,19,12,17,11,16,3,14,15,18]
   → U11 = 第 14 名，U13 = 第 3 名（本文件写成常量，供回归对比） */
const BEFORE = { 11: 14, 13: 3 };
const u11 = D.units[11].sortIdx, u13 = D.units[13].sortIdx;
check("② U11（201 词）order 排名不在前 10（回到后段）", u11 > 10,
  "U11 #" + u11 + "/" + UNIT_N + "（修订前 #" + BEFORE[11] + "，nVocab=" + D.units[11].nVocab + "）");
check("② U11 是当前最重负载单元（load 最大）", D.units[11].load === Math.max.apply(null, ids.map(function (id) { return D.units[id].load; })),
  "load=" + D.units[11].load);
check("② U13 的排名比修订前更靠后", u13 > BEFORE[13],
  "U13 #" + u13 + "（修订前 #" + BEFORE[13] + "，nVocab=" + D.units[13].nVocab + "）");
/* U11 比修订前「更靠后」的对照组：旧口径下它比这些单元更「容易」，现在必须更「难」 */
check("② U11 现在比 U3/U14/U15/U16/U18（修订前排它前面）都更难",
  [3, 14, 15, 16, 18].every(function (id) { return D.units[id].sortIdx < u11; }),
  [3, 14, 15, 16, 18].map(function (id) { return "U" + id + "#" + D.units[id].sortIdx; }).join(" ") + " vs U11 #" + u11);
check("② 档位仍由 load 的 norm 切出（≥0.6 拔高 / ≥0.3 进阶 / 否则基础）",
  ids.every(function (id) {
    const u = D.units[id];
    const want = u.norm >= 0.6 ? 3 : u.norm >= 0.3 ? 2 : 1;
    return u.bandNo === want && u.band === ["", "基础", "进阶", "拔高"][want];
  }));

/* ---------------- ③ 同形异义排除表 ---------------- */
const EXCL = Object.keys(GEN.CEFR_EXCLUDE);
check("③ 排除表至少覆盖 S1 点名的 8 个词",
  ["pet", "reach", "collection", "drawer", "stand", "hold", "message", "review"].every(function (w) { return EXCL.indexOf(w) !== -1; }),
  EXCL.length + " 词：" + EXCL.join(" / "));
check("③ 排除表每个词都有非空理由", EXCL.every(function (w) { return typeof GEN.CEFR_EXCLUDE[w] === "string" && GEN.CEFR_EXCLUDE[w].length > 8; }));
const inDict = EXCL.filter(function (w) { return Object.prototype.hasOwnProperty.call(D.words, w); });
check("③ 排除表里的词确实出现在 words 字段（覆盖非空转）", inDict.length === EXCL.length, inDict.length + "/" + EXCL.length);
check("③ 排除表里的词在 words 字段里不再带 CEFR 档",
  inDict.every(function (w) { return D.words[w].cefr === null; }),
  inDict.map(function (w) { return w + "=" + D.words[w].cefr; }).join(" "));
check("③ 排除后这些词的 dif 回落到兜底轴（仍是 易/中/难，不是 null）",
  inDict.every(function (w) { return ["easy", "mid", "hard"].indexOf(D.words[w].dif) !== -1; }),
  inDict.map(function (w) { return w + "=" + D.words[w].dif; }).join(" "));
/* 反向断言：排除表不能把全站 CEFR 命中打到 0（只要剔除确实不同义项的那些词） */
check("③ 全站 CEFR 命中率仍 > 0.15 且 < 0.25（只剔假命中，没把 CEFR 轴整体删掉）",
  D.coverage.cefrHitRate > 0.15 && D.coverage.cefrHitRate < 0.25, "cefrHitRate=" + D.coverage.cefrHitRate);

/* ---------------- ④ dom 收窄 ---------------- */
const GENERIC = ["film", "container", "inspection", "certificate", "quotation", "shipment", "customs"];
check("④ DOM_GENERIC 至少含 S1 点名的 7 个通用商务词", GENERIC.every(function (w) { return GEN.DOM_GENERIC.has(w); }));
check("④ 这 7 个词在 words 字段里 dom 已不再是 true",
  GENERIC.every(function (w) { return D.words[w] && D.words[w].dom === false; }),
  GENERIC.map(function (w) { return w + "=" + (D.words[w] ? D.words[w].dom : "缺失"); }).join(" "));
check("④ 行业专有术语仍被标注（区别于通用词，防止收窄过度）",
  ["bopp film", "customs declaration", "certificate of origin", "solventless adhesive"].every(function (w) { return D.words[w] && D.words[w].dom === true; }),
  ["bopp film", "customs declaration", "certificate of origin", "solventless adhesive"].map(function (w) { return w + "=" + (D.words[w] ? D.words[w].dom : "缺失"); }).join(" "));

/* ---------------- ⑤ difficultyBasis 是新口径的唯一权威表述 ---------------- */
const basis = JSON.stringify(D.difficultyBasis);
check("⑤ difficultyBasis 含「命中数门限」", basis.indexOf("命中数门限") !== -1);
check("⑤ difficultyBasis 含「条目量项」", basis.indexOf("条目量项") !== -1);
check("⑤ difficultyBasis 写出门限值 10 与重分配后的 0.6 / 0.4",
  basis.indexOf("CEFR 命中数 < 10") !== -1 && basis.indexOf("0.6×分位") !== -1 && basis.indexOf("0.4×分位") !== -1);
check("⑤ difficultyBasis 写出 load = (1 + baseScore) × log2(nVocab)",
  basis.indexOf("load = (1 + baseScore) × log2(nVocab)") !== -1);
check("⑤ difficultyBasis 说明排除表的存在与位置（CEFR_EXCLUDE @ tools/gen-difficulty.js）",
  basis.indexOf("CEFR_EXCLUDE") !== -1 && basis.indexOf("tools/gen-difficulty.js") !== -1);
check("⑤ difficultyBasis 说明 dom 收窄（DOM_GENERIC）",
  basis.indexOf("DOM_GENERIC") !== -1 && GENERIC.every(function (w) { return basis.indexOf(w) !== -1; }));
check("⑤ 旧的 0.5/0.3/0.2 公式已不再作为唯一表述出现（unitScore 已改）",
  D.difficultyBasis.unitScore.indexOf("cefrUsed=false") !== -1 || D.difficultyBasis.unitScore.indexOf("cefrUsed = false") !== -1,
  D.difficultyBasis.unitScore.slice(0, 60) + "…");
check("⑤ 生成文件头部注释也同步为新公式",
  fs.readFileSync(path.join(ROOT, "js", "difficulty-map.js"), "utf8").indexOf("load = (1 + baseScore) × log2(nVocab)") !== -1);

console.log("\n  实测难度升序 order：" + JSON.stringify(D.order));
console.log("  实测 U11 #" + u11 + " / U13 #" + u13 + "（修订前 U11 #" + BEFORE[11] + " / U13 #" + BEFORE[13] + "）");
console.log("  cefrUsed 单元 " + used.length + "/" + UNIT_N + "：U" + used.join(", U"));
console.log("  cefrHitRate=" + D.coverage.cefrHitRate + "（修订前 0.206）");

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
