#!/usr/bin/env node
/* 单一数据源漂移门禁：验证「当前提交的小程序 utils/data.js」与「从网页版重新生成」是否一致。

   行为（P0 第三批 · α 组按 S10-F3 收紧后，**默认 strict**）：
   - 小程序数据文件存在 → 严格比较，不一致则 fail（exit 1），提醒重新生成。
   - 小程序数据文件不存在 / 生成器跑不起来（缺源数据）→ **exit 1 失败**。
     理由：原实现缺文件时打印 `⏭ skip` 并 exit 0，于是任何 clone / 异地 / CI
     （.github/workflows/ci.yml 在 ubuntu-latest 上跑）里这一行"Single-source drift check"
     都是**永久 no-op 却显示成功** —— 这是与 check-tracked 相反方向的同一类假绿（S10-F3）。
     "什么都没测"不得被读成"通过"。
   - 确实需要在没有小程序数据的机器上跑（例如只想验证生成器稳定性）时，**必须显式**
     `--allow-missing` 才允许跳过；跳过的输出明确写着"这不是成功"。
   - `--strict` 被接受且是默认值（写上它不改变行为，只为让 CI 里的意图显式）。

   运行：node tools/check-single-source.js          （默认 strict，缺数据即失败）
         node tools/check-single-source.js --allow-missing   （显式允许跳过比对）
   返回：一致 exit 0；漂移 / 缺数据 / 生成器异常 exit 1。
*/
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { buildMiniprogramSource } = require("./lib-data.js");

const DATA = path.join(__dirname, "..", "..", "外贸英语小程序", "utils", "data.js");

/* P0 第三批 · α 组（P0-08）：默认 strict（缺数据 = 失败）；--allow-missing 才允许显式跳过。
   `--strict` 也被接受（默认即 strict，写上它不改变行为，只为让 CI 的意图显式）。 */
const ALLOW_MISSING = process.argv.indexOf("--allow-missing") !== -1;

function normalize(s) { return s.replace(/\r/g, "").trim(); }

/* 先做稳定性检查：生成器必须产出可加载的合法 CommonJS 且单元数 > 0。
   ⚠️ 生成器读的是网页版源数据（js/data*.js 等，经 tools/lib-data.js）——**缺源数据同样按失败处理**，
   不能让它抛栈或静默产出 0 个单元。 */
let generated;
try {
  generated = buildMiniprogramSource();
} catch (e) {
  console.error("❌ 生成器无法从网页版数据生成小程序数据源：" + (e && e.message));
  console.error("   这属于「缺源数据 / 源数据损坏」——本门禁按失败处理（不是跳过）。");
  console.error("   检查 js/data*.js 是否齐全、能否被 tools/lib-data.js 正常读取。");
  process.exit(1);
}
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
  if (ALLOW_MISSING) {
    console.log("⚠️  跳过比对：未找到小程序数据文件（" + DATA + "）。");
    console.log("   这是显式 --allow-missing 才允许的跳过 —— **这不是成功**，本次没有做任何漂移比对。");
    console.log("   生成器自身已验证可产出 " + unitsCount + " 个单元（稳定性 OK）。");
    process.exit(0);
  }
  console.error("❌ 未找到小程序数据文件，无法比对单一数据源漂移：");
  console.error("   " + DATA);
  console.error("   本门禁默认 strict：**测不了 = 失败**，不允许「什么都没测还绿」（S10-F3）。");
  console.error("   怎么办（任选其一）：");
  console.error("     ① 把 外贸英语小程序/utils/data.js 放到上面这个路径（与网页版同工作区）；");
  console.error("     ② 若本机确实没有小程序数据、且你只想验证生成器稳定性，");
  console.error("        请显式运行：node tools/check-single-source.js --allow-missing");
  console.error("        （CI 若要走这条路，请在 workflow 里写明，别让它伪装成通过）");
  process.exit(1);
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
