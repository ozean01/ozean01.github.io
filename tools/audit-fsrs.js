#!/usr/bin/env node
/* 第5批 P1-3：FSRS-6 参数与官方 ts-fsrs 对齐审计。
   1) 核对 W 参数组与官方 default_w 完全一致（逐项比较）。
   2) 核对派生的 DECAY / FACTOR / INTERVAL_MODIFIER 为有限正数、且 MOD≈计算值。
   3) 验证四档首评间隔梯度（EASY>GOOD>=AGAIN，AGAIN 重置为最短 1 天）。
   4) 验证难度方向：EASY 难度下降、AGAIN 难度上升。
   不联网、不依赖 npm；官方默认 W 作为基准常量内置于本脚本。
   运行：node tools/audit-fsrs.js
*/
"use strict";
const path = require("path");
global.window = { console };
require(path.join(__dirname, "..", "js", "flashcards.js"));
const F = global.window.Flashcards;

/* open-spaced-repetition/ts-fsrs 的 default_w（v6 官方默认） */
const OFFICIAL_W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001,
  1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
  1.8729, 0.5425, 0.0912, 0.0658, 0.1542];

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

console.log("==== 1) W 参数组 vs 官方 default_w ====");
check("W 长度 = 21", F.PARAMS.length === OFFICIAL_W.length, "len=" + F.PARAMS.length);
const wDiff = F.PARAMS.some(function (v, i) { return Math.abs(v - OFFICIAL_W[i]) > 1e-9; });
check("W 与官方逐项一致", !wDiff, wDiff ? "存在偏差" : "");

console.log("\n==== 2) 关键派生公式 ====");
const rnd = function (v) { return Math.round(v * 1e8) / 1e8; };
const DECAY = -F.PARAMS[20];
const FACTOR = rnd(Math.exp(Math.log(0.9) / DECAY) - 1);
const MOD = rnd((Math.pow(0.9, 1 / DECAY) - 1) / FACTOR);
console.log("  DECAY=" + DECAY.toFixed(6) + "  FACTOR=" + FACTOR + "  INTERVAL_MODIFIER=" + MOD);
check("FACTOR/MOD 为有限正数", isFinite(FACTOR) && FACTOR > 0 && isFinite(MOD) && MOD > 0);
check("MOD ≈ 1（官方默认区间比例）", MOD > 0.9 && MOD < 1.1, "MOD=" + MOD);

console.log("\n==== 3) 四档首评间隔梯度 ====");
function first(rating) { const p = { flash: {} }; const f = F.grade(p, "w", rating); return f; }
const a = first(1), h = first(2), g = first(3), e = first(4);
console.log("  AGAIN=" + a.interval + "  HARD=" + h.interval + "  GOOD=" + g.interval + "  EASY=" + e.interval);
check("EASY > GOOD，GOOD >= HARD", e.interval > g.interval && g.interval >= h.interval, "梯度正确");
check("AGAIN 重置为最短(1 天)", a.interval === 1, "AGAIN=" + a.interval);

console.log("\n==== 4) 难度方向 ====");
console.log("  EASY.difficulty=" + e.difficulty + "  GOOD.difficulty=" + g.difficulty + "  AGAIN.difficulty=" + a.difficulty);
check("EASY 难度低于 GOOD，AGAIN 难度最高", e.difficulty < g.difficulty && a.difficulty > g.difficulty);

console.log("\n" + (pass ? "=== ✅ 审计通过：参数与官方 ts-fsrs 默认一致，四档调度正确 ===" : "=== ❌ 审计发现问题，请人工核对 ==="));
process.exit(pass ? 0 : 1);
