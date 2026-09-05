#!/usr/bin/env node
/* 验收测试：测验「✍️ 写作产出（write）」题型的构建。
   验证：生成 write 题、prompt=中文义、answer=目标英文、无选项（自由输入）、带 wid/kw。
   运行：node tools/test-quiz-write.js */
"use strict";
const path = require("path");
global.window = { FTE_LVL: {} };
require(path.join(__dirname, "..", "js", "quiz.js"));
const Q = global.window.Quiz;

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

const units = [{
  id: 1, title: "T", vocab: [
    { w: "courier", ipa: "/ˈkʊriər/", pos: "v.", cn: "快递", ex: "We will courier two samples to you tomorrow.", exCn: "我们明天将快递两个样品给您。" }
  ]
}];
const qs = Q.build(units, { count: 5, types: ["write"] });

check("write 题型已生成", qs.length > 0 && qs.every(function (q) { return q.type === "write"; }), "n=" + qs.length);
const q = qs[0];
check("prompt 为中文义（exCn）", q && typeof q.prompt === "string" && q.prompt === "我们明天将快递两个样品给您。");
check("answer 为目标英文（ex）", q && typeof q.answer === "string" && q.answer.indexOf("courier") !== -1);
check("无 options（自由输入，非选择）", q && q.options === undefined);
check("带 wid 与关键词 kw/kcn", q && q.wid === "1-0" && q.kw === "courier" && q.kcn === "快递");
check("TYPES 含 write", Q.TYPES.some(function (t) { return t.id === "write"; }));

console.log("\n-- write 样例 --");
console.log("  prompt: " + q.prompt);
console.log("  answer: " + q.answer);

console.log(pass ? "=== ALL PASS ===" : "=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
