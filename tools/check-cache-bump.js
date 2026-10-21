#!/usr/bin/env node
/* tools/check-cache-bump.js —— CI 侧「内容变了必须升 CACHE」门禁（投用前检查 P2-3）。
 *
 * 为什么需要它：tools/prepush-check.js 的升版检查在 CI 的**干净检出**里是恒真的
 * （工作区 sw.js 与 HEAD:sw.js 相同，版本≥自身永远成立），它只在本地工作区有改动时有约束力。
 * 于是「绕过本地检查直接 commit+push 且忘了升 CACHE」这种情况没有任何门禁会拦，
 * 老用户会一直吃旧缓存桶。
 *
 * 本脚本比对 HEAD 与 HEAD^：
 *   ① 取出 HEAD 的 sw.js PRECACHE 文件清单；
 *   ② 看这些文件在 HEAD^..HEAD 之间有没有内容变化；
 *   ③ 有变化 ⇒ HEAD 的 CACHE 数字必须**严格大于** HEAD^ 的；没有变化则不作要求。
 * 首次提交 / HEAD^ 不存在 / 浅克隆拿不到 HEAD^ 时：打印说明并 exit 0（不制造假红）。
 *
 * 运行：node tools/check-cache-bump.js
 */
"use strict";
const { execFileSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
}
function cacheOf(text) {
  const m = String(text).match(/const CACHE = "fte-v(\d+)"/);
  return m ? Number(m[1]) : null;
}
function precacheOf(text) {
  const block = (String(text).match(/const PRECACHE = \[([\s\S]*?)\];/) || [])[1];
  if (!block) return null;
  return (block.match(/"(\.\/[^"]+)"/g) || []).map(function (s) { return s.slice(1, -1); });
}

let headSw, prevSw;
try {
  headSw = git(["show", "HEAD:sw.js"]);
  prevSw = git(["show", "HEAD^:sw.js"]);
} catch (e) {
  console.log("⏭ 跳过：取不到 HEAD^（首次提交 / 浅克隆 / 初始推送），本门禁不适用。");
  process.exit(0);
}

const headCache = cacheOf(headSw);
const prevCache = cacheOf(prevSw);
const files = precacheOf(headSw);
if (headCache === null || prevCache === null || !files) {
  console.log("❌ 无法从 sw.js 解析 CACHE 或 PRECACHE 清单。");
  process.exit(1);
}

let changed = [];
try {
  const diff = git(["diff", "--name-only", "HEAD^", "HEAD", "--"].concat(files.map(function (p) { return p.replace(/^\.\//, ""); }))).trim();
  changed = diff ? diff.split("\n").map(function (s) { return s.trim(); }).filter(Boolean) : [];
} catch (e) {
  console.log("⏭ 跳过：git diff 失败（" + e.message + "），本门禁不适用。");
  process.exit(0);
}

if (!changed.length) {
  console.log("✅ 预缓存文件没有内容变化 ⇒ 不要求升 CACHE（HEAD fte-v" + headCache + "）。");
  process.exit(0);
}

if (headCache > prevCache) {
  console.log("✅ 预缓存文件有变化（" + changed.length + " 个）⇒ CACHE 已升版 fte-v" + prevCache + " → fte-v" + headCache + "。");
  process.exit(0);
}

console.log("❌ 预缓存文件变了，但 CACHE 没有升版：HEAD fte-v" + headCache + " ≤ HEAD^ fte-v" + prevCache + "。");
console.log("   变了的文件：" + changed.slice(0, 8).join(", ") + (changed.length > 8 ? " …共 " + changed.length + " 个" : ""));
console.log("   怎么修：把 sw.js 的 CACHE +1，并同步刷新 tools/precache-baseline.json（cache/minVersion）。");
process.exit(1);
