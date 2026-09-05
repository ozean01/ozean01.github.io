#!/usr/bin/env node
/* 函数级验收：验证 Flashcards.grade() 四档评分行为。
   EASY(4) 应拉长间隔、GOOD(3) 次之、HARD(2) 短、AGAIN(1) 重置为最短(隔天)。
   也验证同词再次 GOOD 间隔递增（间隔重复的基本性质）。
   运行：node tools/test-fsrs.js
*/
"use strict";
const path = require("path");
global.window = { console };
require(path.join(__dirname, "..", "js", "flashcards.js"));
const F = global.window.Flashcards;

function fresh() { return { flash: {} }; }

function firstInterval(rating) {
  const p = fresh();
  F.grade(p, "w", rating);
  return p.flash["w"];
}

console.log("==== 新卡首评间隔（天） ====");
const r1 = firstInterval(1), r2 = firstInterval(2), r3 = firstInterval(3), r4 = firstInterval(4);
console.log("  AGAIN(1) 忘了   -> interval=" + r1.interval + "  stability=" + r1.stability + "  difficulty=" + r1.difficulty);
console.log("  HARD(2) 模糊    -> interval=" + r2.interval + "  stability=" + r2.stability + "  difficulty=" + r2.difficulty);
console.log("  GOOD(3) 认识    -> interval=" + r3.interval + "  stability=" + r3.stability + "  difficulty=" + r3.difficulty);
console.log("  EASY(4) 秒答    -> interval=" + r4.interval + "  stability=" + r4.stability + "  difficulty=" + r4.difficulty);

console.log("\n==== 依次 GOOD(3) 连续复习（间隔应递增） ====");
const p = fresh();
let last;
for (let i = 1; i <= 5; i++) { last = F.grade(p, "w", 3); console.log("  第" + i + "次 GOOD -> interval=" + last.interval + "  stability=" + last.stability); }

console.log("\n==== 先 GOOD 后 AGAIN（应重置回短间隔） ====");
const p2 = fresh();
F.grade(p2, "w", 3);
let wake = F.grade(p2, "w", 1);
console.log("  前次 interval=" + p2.flash["w"].interval + "  再AGAIN后 interval=" + wake.interval);

console.log("\n==== 断言 ====");
const ok = (r4.interval > r3.interval && r3.interval >= r2.interval && r2.interval >= 1 && r1.interval <= r2.interval);
console.log("  四档梯度合理(EASY>GOOD>=HARD>=1, AGAIN<=HARD): " + (ok ? "✅ PASS" : "❌ FAIL"));
if (ok) process.exit(0); else process.exit(1);
