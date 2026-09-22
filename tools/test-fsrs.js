#!/usr/bin/env node
/* 函数级验收：验证 Flashcards.grade() 四档评分行为 + FSRS 时间演化的增长性。
   由来（S6 · 学习行为与测评专家，F7）：旧版本这一条用例标题写「间隔应递增」，
   但 grade() 内部硬取 Date.now()，测试不推进时钟 → t=0 → r=1 → 稳定度不变，
   输出全是 interval=2 却仍打印 ✅ PASS——「增长性零覆盖」的门禁空转。
   本文件因此：
     ① 通过 Flashcards._now 注入可控时钟（默认仍是 Date.now()，生产行为不变）；
     ② 让它**真断言**：四档评分后间隔严格递增、复习一次后间隔比首次更长；
     ③ 为 S6 缺陷 1（队列重复卡）、缺陷 2（逾期文案）、缺陷 3（isLearned 过宽）各补一条回归守卫。
   运行：node tools/test-fsrs.js
*/
"use strict";
const path = require("path");
global.window = { console };
require(path.join(__dirname, "..", "js", "flashcards.js"));
const F = global.window.Flashcards;

const DAY = 86400000;
const T0 = 1700000000000;   // 固定基准时刻：2023-11-14T22:13:20Z

/* ---- 可控时钟注入（仅测试；不注入时 Flashcards._now === null → Date.now()）---- */
let NOW = T0;
F._now = function () { return NOW; };

let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info != null ? "  " + info : ""));
  if (!cond) pass = false;
  return !!cond;
}

function fresh() { return { flash: {}, flashProd: {}, wrong: {} }; }

function firstInterval(rating) {
  NOW = T0;
  const p = fresh();
  return F.grade(p, "w", rating);
}

console.log("==== 新卡首评（不可变基准：公式与参数不得改动） ====");
const r1 = firstInterval(1), r2 = firstInterval(2), r3 = firstInterval(3), r4 = firstInterval(4);
console.log("  AGAIN(1) 忘了   -> interval=" + r1.interval + "  stability=" + r1.stability + "  difficulty=" + r1.difficulty);
console.log("  HARD(2) 模糊    -> interval=" + r2.interval + "  stability=" + r2.stability + "  difficulty=" + r2.difficulty);
console.log("  GOOD(3) 认识    -> interval=" + r3.interval + "  stability=" + r3.stability + "  difficulty=" + r3.difficulty);
console.log("  EASY(4) 秒答    -> interval=" + r4.interval + "  stability=" + r4.stability + "  difficulty=" + r4.difficulty);

console.log("\n==== 依次 GOOD(3) 连续复习：时钟推进到到期日，间隔应严格递增 ====");
NOW = T0;
const p = fresh();
const seq = [];
let last;
for (let i = 1; i <= 5; i++) {
  last = F.grade(p, "w", 3);
  seq.push(last.interval);
  console.log("  第" + i + "次 GOOD -> interval=" + last.interval + "  stability=" + last.stability +
    "  (距上次 " + (i === 1 ? 0 : seq[i - 2]) + " 天)");
  NOW += last.interval * DAY;   // 真实流逝：到期日当天再复习
}
const strictlyIncreasing = seq.every(function (v, i) { return i === 0 || v > seq[i - 1]; });
check("连续 5 次 GOOD 的间隔序列严格递增", strictlyIncreasing, "[" + seq.join(", ") + "]");
check("复习一次后间隔比首次更长", seq[1] > seq[0], seq[0] + " → " + seq[1]);
check("第 5 次间隔显著大于首次（≥10 倍）", seq[4] >= seq[0] * 10, seq[0] + " → " + seq[4]);

console.log("\n==== 已有历史卡：四档评分后间隔应严格递增 AGAIN < HARD < GOOD < EASY ====");
/* 一张「学过但已 30 天没碰」的卡（S=10 天）：r<1，四档才会走各自的真实分支。
   新卡首评 AGAIN 与 HARD 的稳定度不同、但按天取整后都落到下界 1 天
   （nextInterval 的 max(1,…) 取整，属官方 FSRS 行为，公式不得改动），
   因此「严格递增」用有历史卡来断言，首评那组另按稳定度断言。 */
function histProg() {
  const q = fresh();
  q.flash["w"] = {
    stability: 10, difficulty: 5, reps: 3, ef: 2.5, interval: 10,
    due: T0 + 10 * DAY, last: T0 - 30 * DAY, rating: 3, retv: 0.81
  };
  return q;
}
NOW = T0;
const g1 = F.grade(histProg(), "w", 1);
const g2 = F.grade(histProg(), "w", 2);
const g3 = F.grade(histProg(), "w", 3);
const g4 = F.grade(histProg(), "w", 4);
console.log("  AGAIN(1) -> interval=" + g1.interval + "  stability=" + g1.stability);
console.log("  HARD(2)  -> interval=" + g2.interval + "  stability=" + g2.stability);
console.log("  GOOD(3)  -> interval=" + g3.interval + "  stability=" + g3.stability);
console.log("  EASY(4)  -> interval=" + g4.interval + "  stability=" + g4.stability);
check("四档间隔严格递增 AGAIN<HARD<GOOD<EASY",
  g1.interval < g2.interval && g2.interval < g3.interval && g3.interval < g4.interval,
  "[" + [g1, g2, g3, g4].map(function (x) { return x.interval; }).join(" < ") + "]");
check("四档稳定度严格递增 AGAIN<HARD<GOOD<EASY",
  g1.stability < g2.stability && g2.stability < g3.stability && g3.stability < g4.stability,
  "[" + [g1, g2, g3, g4].map(function (x) { return x.stability; }).join(" < ") + "]");
check("评分越低的卡难度越高（EASY 最简单）",
  g4.difficulty < g3.difficulty && g3.difficulty < g2.difficulty && g2.difficulty < g1.difficulty,
  "[" + [g4, g3, g2, g1].map(function (x) { return x.difficulty; }).join(" < ") + "]");

console.log("\n==== 首评四档梯度（稳定度严格递增；间隔受「按天取整、下界 1 天」约束） ====");
console.log("  首评间隔: AGAIN=" + r1.interval + " HARD=" + r2.interval + " GOOD=" + r3.interval + " EASY=" + r4.interval);
check("首评稳定度严格递增 AGAIN<HARD<GOOD<EASY",
  r1.stability < r2.stability && r2.stability < r3.stability && r3.stability < r4.stability);
check("首评间隔单调不减，且 GOOD>HARD、EASY>GOOD",
  r1.interval <= r2.interval && r2.interval < r3.interval && r3.interval < r4.interval);

console.log("\n==== 先 GOOD 后 AGAIN（时钟推进后应重置回短间隔） ====");
NOW = T0;
const p2 = fresh();
F.grade(p2, "w", 3);
const before = p2.flash["w"].interval;
NOW += before * DAY;              // 到到期日
const wake = F.grade(p2, "w", 1);
console.log("  前次 interval=" + before + "  再AGAIN后 interval=" + wake.interval + "  stability=" + wake.stability);
check("答错(AGAIN)后稳定度下降", wake.stability < p2.flash["w"].stability || wake.interval < before,
  "stability " + before + "天卡 → " + wake.stability);
check("答错(AGAIN)后间隔回到 1 天", wake.interval === 1, wake.interval + " 天");

console.log("\n==== 缺陷1 回归守卫：buildQueue 不得含重复卡，优先级最高者胜 ====");
/* S6 探针实测 queue=[a,b,a,b]：weak 兜底分支没有排除已入队的到期卡。
   构造：B/A 已到期且都是错题（应进 due 且只进一次），C 未到期但是错题（应只进 weak 尾部）。 */
NOW = T0;
const qp = fresh();
function hist(reps, interval, dueOffsetDays, ef) {
  return { stability: interval, difficulty: 5, reps: reps, ef: ef, interval: interval,
    due: T0 + dueOffsetDays * DAY, last: T0 - 30 * DAY, rating: 3, retv: 0.8 };
}
qp.flash["A"] = hist(3, 10, -2, 2.6);
qp.flash["B"] = hist(5, 10, -5, 2.6);
qp.flash["C"] = hist(2, 10, +10, 2.6);
qp.wrong = { A: 1, B: 3, C: 7 };
const cards3 = [{ id: "A", w: "a" }, { id: "B", w: "b" }, { id: "C", w: "c" }];
const q = F.buildQueue(cards3, qp, 30, 15);
const qIds = q.queue.map(function (c) { return c.id; });
console.log("  queue = [" + qIds.join(", ") + "]");
check("队列无重复卡（长度 == 唯一数）", qIds.length === new Set(qIds).size,
  "长度 " + qIds.length + " / 唯一 " + new Set(qIds).size);
check("最逾期的到期卡排第一（优先级最高者胜）", qIds[0] === "B", "[" + qIds.join(", ") + "]");
check("已到期的错题卡只出现一次且排在尾部 weak 之前",
  qIds.filter(function (x) { return x === "A" || x === "B"; }).length === 2 &&
  qIds.indexOf("C") > Math.max(qIds.indexOf("A"), qIds.indexOf("B")),
  "[" + qIds.join(", ") + "]");

console.log("\n==== 缺陷2 回归守卫：到期文案区分 已逾期 N 天 / 今天到期 / N 天后到期 ====");
NOW = T0;
const sp = fresh();
const s1 = F.grade(sp, "w", 3);            // GOOD → due = T0 + 2 天
const dueAt = s1.due;
NOW = T0;
const labelFuture = F.stateOf(sp, "w");
NOW = dueAt;                                // 恰好到期当天
const labelToday = F.stateOf(sp, "w");
NOW = dueAt + 3 * DAY;                      // 逾期 3 天
const labelOverdue = F.stateOf(sp, "w");
console.log("  未到期: " + labelFuture.label + " (" + labelFuture.cls + ")");
console.log("  到期当天: " + labelToday.label + " (" + labelToday.cls + ")");
console.log("  逾期 3 天: " + labelOverdue.label + " (" + labelOverdue.cls + ")");
check("未到期同时给出「牢固/易遗忘」与距到期天数（两样信息都不丢）",
  /^(牢固|易遗忘) · 2 天后到期$/.test(labelFuture.label), labelFuture.label);
check("到期当天显示「今天到期」", labelToday.label === "今天到期", labelToday.label);
check("逾期显示「逾期 N 天」", labelOverdue.label === "逾期 3 天", labelOverdue.label);
check("三种到期状态的文案互不相同",
  new Set([labelFuture.label, labelToday.label, labelOverdue.label]).size === 3);
check("逾期文案不再复述上一次的 interval（旧 bug：『2天后到期』）",
  labelOverdue.label.indexOf("天后到期") === -1, labelOverdue.label);
check("未到期仍保留记忆状态文字与配色",
  /^(牢固|易遗忘)/.test(labelFuture.label) &&
  (labelFuture.cls === "strong" || labelFuture.cls === "weak"), labelFuture.label + " / " + labelFuture.cls);

console.log("\n==== 缺陷3 回归守卫：isLearned 保守口径（答错一次不算掌握） ====");
NOW = T0;
const lp = fresh();
check("新词不是已掌握", F.isLearned(lp, "w") === false);
F.grade(lp, "w", 3);
check("一次 GOOD 后 → 已掌握（冻结门禁 test-flashprod.js 的要求）", F.isLearned(lp, "w") === true);
const lpAgain = fresh(); F.grade(lpAgain, "w", 1);
check("★ 一次 AGAIN(忘了) 后 → 不是已掌握（旧口径 bug）", F.isLearned(lpAgain, "w") === false);
const lpHard = fresh(); F.grade(lpHard, "w", 2);
check("一次 HARD(模糊) 后 → 不是已掌握", F.isLearned(lpHard, "w") === false);
const lpLapse = fresh();
F.grade(lpLapse, "w", 3);
NOW += 2 * DAY;
F.grade(lpLapse, "w", 1);
check("GOOD 后又答错 → 回到未掌握（唯一依据是最近一次评分）", F.isLearned(lpLapse, "w") === false);
const lpProd = fresh();
F.grade(lpProd, "w", 1, "flashProd");
check("isLearned 按 storeKey 分线（产出线的答错不影响接受线）",
  F.isLearned(lpProd, "w") === false && F.isLearned(lpProd, "w", "flashProd") === false);

F._now = null;   // 归还默认时钟

console.log("\n==== 汇总 ====");
console.log(pass ? "=== ALL PASS ===" : "=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
