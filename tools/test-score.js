#!/usr/bin/env node
/* 验收测试：🎯 跟读评分全站唯一实现（js/score.js）。
   由来（SLA 专家评审）：句子级跟读评分原先有**两份实现**——app.js 一份、patterns.js 抄一份。
   根因是 patterns.js 加载早于 app.js，拿不到 window.ASRUtil。
   两份还悄悄产生了行为差异：app.js 版 wordSimilar 不做大小写处理、patterns.js 版内部
   toLowerCase()——同一个词在两处可能得到不同判定。

   本测试守住三件事：
     ① 算法正确（含与旧二维实现逐例等价——我把它换成了滚动数组，必须证明没换坏）
     ② **只剩一份实现**：源码里不允许再出现第二份相似度算法
     ③ 用例覆盖到当年那处大小写差异（同一个词大小写不同，两处都必须给出同一结果） */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

global.window = {};
require(path.join(ROOT, "js", "score.js"));
const S = global.window.SpeechScore;
const T = S && S._t;

/* ---------------- ① 模块形态 ---------------- */
check("导出 SpeechScore", !!S);
["norm", "wordSimilar", "evaluateSpeech"].forEach(function (k) {
  check("导出 " + k, typeof S[k] === "function");
});
check("阈值以命名常量导出（便于解释与测试）",
  typeof S.EXACT_THRESHOLD === "number" && typeof S.NEAR_THRESHOLD === "number",
  S.EXACT_THRESHOLD + " / " + S.NEAR_THRESHOLD);

/* ---------------- ② norm ---------------- */
check("转小写", T.norm("Hello") === "hello");
check("去标点", T.norm("Hi, there!") === "hi there");
check("折叠空白", T.norm("  a   b  ") === "a b");
check("保留撇号与连字符内的字母", T.norm("don't") === "don't");
check("null/undefined 安全（不产生字面量 'null'）",
  T.norm(null) === "" && T.norm(undefined) === "", JSON.stringify(T.norm(null)));

/* ---------------- ③ wordSimilar 与旧实现逐例等价 ----------------
   旧实现是 m×n 二维表；我换成了滚动数组（O(n) 空间）。这里用旧算法做参照，
   在大量样本上逐一比对——性能优化不能改变结果。 */
function oldWordSimilar(a, b) {
  a = String(a).toLowerCase(); b = String(b).toLowerCase();
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const dp = [];
  for (let i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - dp[m][n] / Math.max(m, n);
}
const SAMPLES = ["curing", "curing", "coating", "coating", "c", "", "curing", "curring", "curin",
  "laminating", "laminating", "adhesive", "adheseive", "delamination", "delamination",
  "film", "firm", "", "x", "polyurethane", "polyurethan"];
let mism = [];
SAMPLES.forEach(function (a) {
  SAMPLES.forEach(function (b) {
    const x = oldWordSimilar(a, b), y = T.wordSimilar(a, b);
    if (Math.abs(x - y) > 1e-9) mism.push('"' + a + '" vs "' + b + '": 旧 ' + x + ' 新 ' + y);
  });
});
check("滚动数组实现与旧二维实现在 " + (SAMPLES.length * SAMPLES.length) + " 组样本上完全等价",
  mism.length === 0, mism.slice(0, 3).join("；"));

check("相同词返回 1", T.wordSimilar("curing", "curing") === 1);
check("大小写不影响结果", T.wordSimilar("Curing", "curing") === 1);
check("标点不影响结果", T.wordSimilar("curing,", "curing") === 1);
check("近似词给出中间值", (function () {
  const v = T.wordSimilar("curring", "curing");
  return v > 0.6 && v < 1;
})(), String(T.wordSimilar("curring", "curing")));
check("毫不相干给出低值", T.wordSimilar("film", "xyz") < 0.3);
check("空串不抛错", T.wordSimilar("a", "") === 0 && T.wordSimilar("", "abc") === 0);
check("两个空串与原实现一致返回 1（刻意保持行为不变）", T.wordSimilar("", "") === 1);

/* ---------------- ④ evaluateSpeech ---------------- */
const EXACT = ["The", "film", "is", "12", "micron", "thick."];
const rExact = T.evaluateSpeech(EXACT.join(" "), EXACT.join(" "));
check("全对：acc 与 precise 均为 100", rExact.acc === 100 && rExact.precise === 100,
  rExact.acc + " / " + rExact.precise);
check("全对：无漏读无多读", rExact.missed === 0 && rExact.extra === 0);
check("逐词结果带 ok 标记", rExact.matched.length === 6 && rExact.matched.every(function (m) { return m.errType === "ok"; }));

const rMiss = T.evaluateSpeech("The film is thick", "The film");
check("漏读被计数", rMiss.missed === 2, "missed=" + rMiss.missed);
check("漏读拉低 acc", rMiss.acc === 50, "acc=" + rMiss.acc);

const rExtra = T.evaluateSpeech("The film", "The film is very thick");
check("多读被计数", rExtra.extra === 3, "extra=" + rExtra.extra);
check("多读不影响 acc（只计目标词命中）", rExtra.acc === 100, "acc=" + rExtra.acc);

const rNear = T.evaluateSpeech("curing", "curring");
check("近似词判为 near 并带said", rNear.matched[0].errType === "near" && rNear.matched[0].said === "curring",
  JSON.stringify(rNear.matched[0]));
check("近似计 0.5 分（acc=50，precise=0）", rNear.acc === 50 && rNear.precise === 0,
  rNear.acc + " / " + rNear.precise);

check("空转写：acc=0 且全部计为漏读", (function () {
  const r = T.evaluateSpeech("hello world", "");
  return r.acc === 0 && r.missed === 2;
})());
check("空目标不除零", T.evaluateSpeech("", "anything at all").acc === 0);
check("返回结构完整", ["acc", "precise", "matched", "transcript", "missed", "extra"].every(function (k) {
  return Object.prototype.hasOwnProperty.call(rExact, k);
}));

/* 关键：大小写与标点走**同一条**口径（当年两处实现差异就在这里） */
const rCase = T.evaluateSpeech("THE FILM IS THICK.", "the film is thick");
check("目标与转写大小写/标点不同仍判全对", rCase.acc === 100, "acc=" + rCase.acc);

/* ---------------- ⑤ 全站只剩一份实现 ---------------- */
const jsFiles = fs.readdirSync(path.join(ROOT, "js")).filter(function (f) { return f.endsWith(".js"); });
const dups = [];
jsFiles.forEach(function (f) {
  const src = fs.readFileSync(path.join(ROOT, "js", f), "utf8");
  /* 相似度算法的特征行：只有 score.js 允许出现 */
  if (/1 - dp\[m\]\[n\] \/ Math\.max/.test(src) && f !== "score.js") dups.push(f + "（含二维表算法）");
  if (/1 - ?prev\[n\] \/ Math\.max/.test(src) && f !== "score.js") dups.push(f + "（含滚动数组算法）");
});
check("除 score.js 外没有任何文件再实现相似度算法", dups.length === 0, dups.join("、"));

const appjs = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
const patjs = fs.readFileSync(path.join(ROOT, "js", "patterns.js"), "utf8");
check("app.js 的 wordSimilar 改为委托 SCORE", /function wordSimilar\(a, b\) \{\s*return SCORE\.wordSimilar\(a, b\)/.test(appjs));
check("app.js 的 evaluateSpeech 改为委托 SCORE", /function evaluateSpeech\(target, transcript\) \{\s*return SCORE\.evaluateSpeech\(target, transcript\)/.test(appjs));
check("app.js 的 norm 改为委托 SCORE", /function norm\(s\) \{\s*return SCORE\.norm\(s\)/.test(appjs));
check("patterns.js 不再自带算法，改为引用 SpeechScore", /window\.SpeechScore/.test(patjs) && !/1 - dp\[m\]\[n\]/.test(patjs));

/* ---------------- ⑥ 加载顺序：score.js 必须早于所有使用方 ---------------- */
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const order = [];
const re = /<script src="(js\/[^"]+)"/g;
let m;
while ((m = re.exec(html)) !== null) order.push(m[1]);
const iScore = order.indexOf("js/score.js");
check("index.html 已引入 js/score.js", iScore !== -1, "位置 #" + (iScore + 1));
["js/app.js", "js/patterns.js", "js/eval4.js"].forEach(function (f) {
  check("score.js 早于 " + f + " 加载", iScore !== -1 && iScore < order.indexOf(f),
    "score@" + (iScore + 1) + " " + f + "@" + (order.indexOf(f) + 1));
});
check("app.js 启动校验注册了 SpeechScore", /_need\("跟读评分 score\.js", !!window\.SpeechScore\)/.test(appjs));
check("ASRUtil 仍导出 evaluateSpeech（eval4 依赖它，不能断）", /evaluateSpeech: evaluateSpeech/.test(appjs));

const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
check("sw.js 预缓存含 ./js/score.js", /"\.\/js\/score\.js"/.test(sw));

console.log("\n-- 评分口径样例 --");
console.log('  目标 "The film is 12 micron thick."');
[["The film is 12 micron thick.", "全对"], ["The film is 12 micron tick.", "近似"], ["The film", "部分漏读"]].forEach(function (c) {
  const r = T.evaluateSpeech("The film is 12 micron thick.", c[0]);
  console.log("   " + c[1].padEnd(8) + " acc=" + String(r.acc).padStart(3) +
    "  precise=" + String(r.precise).padStart(3) +
    "  漏读=" + r.missed + " 多读=" + r.extra + "  → " + c[0]);
});

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
