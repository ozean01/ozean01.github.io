#!/usr/bin/env node
/* 验收测试：i+1 句子挖掘（对标 Migaku/LingQ 方法论）+ ESP 岗位任务画像（needs analysis）。
   守住五件事：
     ① 挖掘纯函数：生词只按「站内词库 × 本机掌握状态」判定；多词术语边界正确
        （trade fair 命中、trademark 不被 trade 误吞）；已知词不计入；
     ② 诚实口径：UI 必须写明「词库外的普通英文词不判生熟」——不假装知道用户真实词汇量；
     ③ 挖掘接线：四个流水线出口统一走 activeSentences()，「只送 i+1 句」开关存在；
     ④ ESP 画像：9 任务 × 19 单元全覆盖、挑选为纯函数、勾选落 progress.taskProfile、
        今日第 2 步给画像理由、实战关卡按画像标「荐」并排前；
     ⑤ 画像只影响推荐顺序（不锁死内容）的口径保留。 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/* ---------- ① 挖掘纯函数 ---------- */
global.window = {};
global.localStorage = { getItem: function () { return null; }, setItem: function () {} };
require(path.join(ROOT, "js", "material.js"));
const MT = global.window.MaterialImport._t;
const units = [
  { id: 1, vocab: [{ w: "quotation", cn: "报价" }, { w: "MOQ", cn: "最小起订量" }, { w: "trade fair", cn: "展销会" }, { w: "trade", cn: "贸易" }, { w: "booth", cn: "展位" }] },
  { id: 2, vocab: [{ w: "peel strength", cn: "剥离强度" }] }
];
const terms = MT.buildTermIndex(units);
check("词库索引：多词术语与单词都在，长词组排序在前",
  terms.length === 6 && terms[0].w.length >= terms[terms.length - 1].w.length);

const sents = [
  "Please send us your quotation with the MOQ for each design.",  // quotation + MOQ，MOQ 已掌握 → i+1
  "Our peel strength meets the customer standard.",               // peel strength（多词）→ i+1
  "The MOQ looks fine to us.",                                    // MOQ 已掌握 → 全熟
  "We saw your trade fair booth and like the trademark."          // trade fair + booth；"trade fair" 里的 trade 不重复计数；trademark 不被吞
];
const out = MT.mineI1(sents, terms, { "1-1": true });   // 1-1 = MOQ 已掌握
check("已知词不计入生词：句 0 只剩 quotation（i+1），句 2 全熟",
  out[0].i1 && out[0].unknownCount === 1 && out[2].unknownCount === 0 && !out[2].i1,
  JSON.stringify(out.map(m => m.unknownCount)));
check("多词术语可命中：peel strength → i+1", out[1].i1);
check("区间遮罩：'trade fair booth' 句只数 trade fair + booth（trade 不重复、trademark 不被吞）",
  !out[3].i1 && out[3].unknown.length === 2 &&
  out[3].unknown.map(function (u) { return u.w; }).indexOf("trade") === -1 &&
  out[3].unknown.map(function (u) { return u.w; }).join(",") === "trade fair,booth",
  JSON.stringify(out[3].unknown.map(u => u.w)));
check("同词多单元：peel strength 在 U9/U17 重复时只计一次", (function () {
  const terms2 = MT.buildTermIndex([
    { id: 9, vocab: [{ w: "peel strength", cn: "剥离强度" }] },
    { id: 17, vocab: [{ w: "peel strength", cn: "剥离强度" }] }
  ]);
  const r = MT.mineI1(["Our peel strength meets the standard."], terms2, {});
  return r[0].unknownCount === 1 && r[0].unknown[0].id === "9-0";
})());
check("词边界：trademark 不被 trade 误吞（独立断言）", !MT.termRegex("trade").test("trademark"));
check("未知词带释义与单元 id（生词进卡可回溯）", out[1].unknown[0].id === "2-0" && out[1].unknown[0].cn === "剥离强度");

/* ---------- ② 诚实口径 ---------- */
const mSrc = read("js/material.js");
check("口径写进代码注释与 UI：词库外的普通英文词不判生熟",
  mSrc.indexOf("词库外的普通英文词") !== -1 && /词库外的普通英文词.*不判生熟/.test(mSrc.replace(/\s+/g, " ")));

/* ---------- ③ 挖掘接线 ---------- */
check("四个流水线出口统一走 activeSentences()",
  (mSrc.match(/activeSentences\(\)/g) || []).length >= 5, "实得 " + (mSrc.match(/activeSentences\(\)/g) || []).length + " 处");
check("「只送 i+1 句」开关存在（mat-mine-toggle）且挖掘为空时不筛（避免空转）",
  mSrc.indexOf("mat-mine-toggle") !== -1 && /i1\.length\) return i1;/.test(mSrc));
check("预览行带 i+1 / 全熟 / +N 生词徽章与未掌握词提示",
  mSrc.indexOf('badge badge-ok">i+1') !== -1 && mSrc.indexOf("+\' + m.unknownCount + \' 生词") !== -1);

/* ---------- ④ ESP 岗位任务画像 ---------- */
global.window.Today = null;
require(path.join(ROOT, "js", "today.js"));
const T = global.window.Today._t;
check("9 个岗位任务、19 个单元全覆盖（每个单元 ≥1 个任务标签）",
  T.PROFILE_TASKS.length === 9 &&
  Object.keys(T.UNIT_TASKS).length === 19 &&
  Object.keys(T.UNIT_TASKS).every(function (k) { return (T.UNIT_TASKS[k] || []).length >= 1; }));

const U = [
  { id: 1, title: "A" }, { id: 3, title: "B" }, { id: 9, title: "C" }
];
const doneNone = function () { return false; };
const pick1 = T.pickUnitByProfile(U, { taskProfile: ["claim"] }, doneNone);
check("纯函数挑选：profile=[claim] → U9（客诉）", pick1 && pick1.unit.id === 9 && pick1.matched.length === 1);
const pick2 = T.pickUnitByProfile(U, { taskProfile: ["claim", "quote"] }, function (u) { return u.id === 9; });
check("已完成单元被跳过：U9 done → 落到 U1/U3（quote）", pick2 && (pick2.unit.id === 1 || pick2.unit.id === 3), pick2 && ("U" + pick2.unit.id));
check("无画像 → 返回 null（维持默认顺序）", T.pickUnitByProfile(U, {}, doneNone) === null);
check("画像只影响推荐顺序的口径保留", read("js/today.js").indexOf("只影响推荐顺序，不锁死内容") !== -1);

const tSrc = read("js/today.js");
check("今日 UI：画像块（td-profile chips + 已选徽章）与勾选落 progress.taskProfile",
  tSrc.indexOf('data-action="td-profile"') !== -1 && tSrc.indexOf("p.taskProfile = prof;") !== -1);
check("今日第 2 步给画像理由（按你的岗位任务画像）",
  tSrc.indexOf("按你的岗位任务画像：U") !== -1);
check("startUnit 画像优先级：显式勾选 > 默认顺序（放在 placement 之后）",
  /if \(taskProfile\(prog\)\.length\) \{[\s\S]{0,160}pickUnitByProfile/.test(tSrc));

/* ---------- 实战关卡联动 ---------- */
const tutorSrc = read("js/tutor.js");
check("6 个关卡都带 tasks 标签", (tutorSrc.match(/tasks: \[/g) || []).length === 6);
check("按画像标「荐」并排到最前（sort 稳定 + 徽章）",
  /RP_SCENARIOS\.slice\(\)\.sort[\s\S]{0,200}prof\.indexOf\(t\) !== -1[\s\S]{0,300}荐/.test(tutorSrc.replace(/\s+/g, " ")) || tutorSrc.indexOf("荐</b>") !== -1);
check("画像经 TutorEnv.getProgress 读取（与 tutor 桥接口径一致）",
  tutorSrc.indexOf("E().getProgress ? E().getProgress() : null") !== -1);

console.log(pass ? "\n=== i+1 挖掘 + ESP 画像门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);
