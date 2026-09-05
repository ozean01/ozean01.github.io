#!/usr/bin/env node
/* 单一数据源漂移门禁：验证「当前提交的小程序 utils/data.js」与「从网页版重新生成」是否一致。

   行为分两种：
   - 小程序文件存在（与网页版同仓库/同工作区）→ 严格比较，不一致则 fail，提醒重新生成。
   - 小程序文件不存在（网页版独立仓库，小程序另行托管或被搁置）→ 跳过比较，仅验证
     生成器能产出合法 CommonJS（稳定性检查），并打印提示，exit 0。

   运行：node tools/check-single-source.js    （在 外贸英语/ 目录下）
   返回：一致/跳过 exit 0；漂移 exit 1。
*/
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { buildMiniprogramSource } = require("./lib-data.js");

const DATA = path.join(__dirname, "..", "..", "外贸英语小程序", "utils", "data.js");

function normalize(s) { return s.replace(/\r/g, "").trim(); }

/* 先做稳定性检查：生成器必须产出可加载的合法 CommonJS 且单元数 > 0 */
const generated = buildMiniprogramSource();
let unitsCount = 0;
try {
  const sandbox = { module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(generated, sandbox);
  unitsCount = (sandbox.module.exports.units || []).length;
} catch (e) {
  console.error("❌ 生成器输出不是合法的 CommonJS：" + e.message);
  process.exit(1);
}
if (!unitsCount) { console.error("❌ 生成器输出单元数为 0，数据源异常"); process.exit(1); }

if (!fs.existsSync(DATA)) {
  console.log("⏭  skip：未找到小程序数据文件（" + DATA + "）。");
  console.log("   网页版为独立仓库时属正常；生成器已验证可产出 " + unitsCount + " 个单元，稳定性 OK。");
  process.exit(0);
}

const committed = normalize(fs.readFileSync(DATA, "utf8"));
const expected = normalize(generated);

if (committed === expected) {
  console.log("✅ 单一数据源一致：小程序 utils/data.js（" + unitsCount + " 单元）可由网页版直接重生成。");
  process.exit(0);
}

const diff = committed.length - expected.length;
console.error("❌ 单一数据源漂移：小程序数据与网页版不一致。");
console.error("   提交文件 " + committed.length + " 字节；重生成 " + expected.length + " 字节（差 " + diff + "）。");
console.error("   请运行：node tools/sync-miniprogram-data.js 后一并提交。");
process.exit(1);
