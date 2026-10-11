#!/usr/bin/env node
/* 反向验证：故意把暗色 token 改回实测不达标的 #6d28d9，门禁必须变红，然后恢复原状。
   证明门禁是**现场算数字**，而不是写死的断言。 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const FILE = path.join(ROOT, "css/style.css");
const GATE = path.join(__dirname, "test-ui-quality.js");
const original = fs.readFileSync(FILE, "utf8");

function runGate() {
  try {
    return { code: 0, out: execFileSync(process.execPath, [GATE], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 }) };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: String(e.stdout || "") + String(e.stderr || "") };
  }
}
const before = runGate();
console.log("恢复原状运行：exit=" + before.code + "  " + (before.out.includes("ALL PASS") ? "ALL PASS" : "FAILED"));

const SABOTAGE = [["--primary-text:#93c5fd;", "--primary-text:#6d28d9;"], ["--ok-text:#a7f3d0;", "--ok-text:#047857;"]];
let injected = original, hits = 0;
for (const [a, b] of SABOTAGE) { if (injected.includes(a)) { injected = injected.replace(a, b); hits++; } }
if (!hits) { console.error("注入失败：找不到锚点"); process.exit(2); }
fs.writeFileSync(FILE, injected);
const after = runGate();
fs.writeFileSync(FILE, original);
console.log("注入 " + hits + " 处违规后运行：exit=" + after.code + "  " + (after.out.includes("SOME FAILED") ? "SOME FAILED" : "ALL PASS"));
console.log("\n门禁打印的违规明细：");
after.out.split("\n").filter((l) => l.includes("P0-11") || l.includes("✗ css/style.css")).forEach((l) => console.log("  " + l.trim()));

const restored = runGate();
console.log("\n恢复后运行：exit=" + restored.code + "  " + (restored.out.includes("ALL PASS") ? "ALL PASS" : "FAILED"));
const ok = before.code === 0 && after.code !== 0 && restored.code === 0;
console.log("\n反向验证结论：" + (ok ? "通过 —— 门禁确实现场计算，注入违规立刻变红，恢复后立刻变绿" : "未通过，需排查"));
process.exit(ok ? 0 : 1);
