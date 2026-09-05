#!/usr/bin/env node
/* 验收测试：句块切分器 chunks() —— 块保持原词序 + 打乱后非原序 + 短句/过短正确处理 */
"use strict";
const path = require("path");
global.window = {};
require(path.join(__dirname, "..", "js", "parser.js"));
const sp = global.window.SentenceParser;

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

const s = "The peel strength of our two-component adhesive reaches 3 N/15mm.";
const r = sp.chunks(s);
check("长句切出 ≥2 块", r && r.blocks.length >= 2, r ? "块数=" + r.blocks.length : "(null)");
if (r) {
  const orig = r.blocks.map(function (b) { return b.o; });
  const isSorted = orig.every(function (v, i) { return v === i; });
  check("打乱为非原序", !isSorted, "o序列=" + orig.join(","));
  // 块内词序应属原句片语（子串校验）
  const joinedByO = r.blocks.slice().sort(function (a, b) { return a.o - b.o; }).map(function (b) { return b.t; }).join(" ");
  check("按 o 重排后拼回原句", joinedByO.toLowerCase().replace(/\s+/g, " ") === s.toLowerCase().replace(/\s+/g, " "), "-> " + joinedByO);
}
const short = sp.chunks("We shipped it today.");
check("中句切出块", short && short.blocks.length >= 2);
check("过短句返回 null", sp.chunks("Hi.") === null);
check("空句返回 null", sp.chunks("") === null);

console.log(pass ? "=== ALL PASS ===" : "=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
