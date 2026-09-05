#!/usr/bin/env node
/* 验收测试：句型克隆库 frame 生成（js/patterns.js build()）。
   验证：从示例例句挖出固定骨架 display（含 ____）+ 答案块 slot + 中文义 cn。 */
"use strict";
const path = require("path");
/* 模块读的是「词法全局」FTE_DATA（const，非 window），测试里用 global.FTE_DATA 提供 */
global.FTE_DATA = {
  units: [
    { id: 1, title: "T1", vocab: [
      { w: "courier", ipa: "/x/", cn: "快递", ex: "We will courier the samples to you tomorrow.", exCn: "我们明天将把样品快递给您。" }
    ], phrases: [
      { p: "place an order", cn: "下订单", ex: "We are ready to place an order for 500 units.", exCn: "我们准备下单 500 台。" }
    ] }
  ]
};
global.window = { Player: {} };
require(path.join(__dirname, "..", "js", "parser.js"));
require(path.join(__dirname, "..", "js", "patterns.js"));
const P = global.window.Patterns;

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

const frames = P.build();
check("已生成 frame", frames.length >= 2, "n=" + frames.length);
const f = frames[0];
check("含固定骨架 display", f && typeof f.display === "string" && f.display.indexOf("＿") !== -1, f && f.display);
check("含答案块 slot", f && typeof f.slot === "string" && f.slot.trim().length > 0, f && f.slot);
check("含中文义 cn", f && typeof f.cn === "string" && f.cn.length > 0);
check("含关键表达 key", f && f.key);
check("带关联单元", f && f.unit && f.unit.id === 1);
check("帧带功能标签", frames.every(function (x) { return typeof x.tag === "string" && x.tag.length > 0; }));
const tagIds = P.TAGS.map(function (t) { return t.id; });
check("标签属于已知分类", frames.every(function (x) { return tagIds.indexOf(x.tag) !== -1; }));

/* 功能分类 heuristic 抽查：应能正确归类 */
const tagSet = {};
frames.forEach(function (x) { tagSet[x.tag] = (tagSet[x.tag] || 0) + 1; });
console.log("  功能分布：", JSON.stringify(tagSet));

console.log("\n-- 样例 --");
if (f) { console.log("  display: " + f.display); console.log("  slot   : " + f.slot); console.log("  cn     : " + f.cn); console.log("  tag    : " + f.tag); }

console.log(pass ? "=== ALL PASS ===" : "=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
