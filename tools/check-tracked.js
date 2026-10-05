#!/usr/bin/env node
/* ============ 门禁：index.html 引用的脚本必须已被 git 跟踪（P2）============
   守的是什么：**"改好了但没提交"导致的发布事故**。
   由来（评估实测）：工作树里 `index.html` 已引用 `js/immerse.js` 与 `js/weekly.js`，
   而这两个文件当时**未被 git 跟踪**（`git status` 显示 `??`）。
   此时一次常规的 `git commit -am "..."` **不会带上未跟踪文件** ——
   提交出来的树是"引用了两个不存在的脚本"的站点：
   线上 `/js/immerse.js`、`/js/weekly.js` 会 404，而 `js/app.js:78-80` 的 `_need` 只
   `console.error` 不中断启动 → **不炸站，但功能静默缺失**（全英模式、本周新料整块消失）。
   这类事故没有任何现有门禁能拦：test-assets.js 校验的是"文件在磁盘上存在 + 进了 PRECACHE"，
   而磁盘上确实存在（只是没进版本库），所以它在本地永远绿。

   做法：读 index.html 的每个 `<script src>`，逐个问 git "这个文件被跟踪了吗"。
    · 未跟踪 → exit 1（并逐个列出，告诉你该 `git add` 哪些）
    · git 不可用 / 不在 git 仓库 → exit 78（SKIP，**不显示成功** —— 见下方 V-05 教训）
   运行：node tools/check-tracked.js   （在 外贸英语/ 目录下）

   ⚠️ 第二轮加固（本轮补）：本门禁原先**只查 index.html**，于是漏掉了同一类事故里更隐蔽的
   一处 —— **"被 npm test 自己依赖的工具脚本/模块"没被跟踪**。
   实测（P10 落地时排查发现）当时 `??` 的有：
     tools/check-tracked.js · tools/export-roundtrip.js · tools/test-activedays.js ·
     tools/test-immerse-weekly.js · tools/x-repro-injection.js · tools/lib/
   这些**不是运行时脚本**，所以 index.html 那条检查看不见它们；而它们的后果更糟：
   本地 `npm test` 全绿，**克隆到干净机器后 `npm test` 直接因文件缺失而报错**。
   其中 `tools/lib/clock.js` 最隐蔽：它被 `test-today.js` / `test-activedays.js` /
   `export-roundtrip.js` 三处 `require`，而 `test-today.js` 本身是已跟踪的 ——
   也就是说"引用了不存在的东西"这个洞只在别人 clone 时才炸。
   故第二节：从 tools/test-all.js 出发，**传递地**收集它引用的全部 tools/ 下的文件
   （含各门禁脚本内部的 `require("./...")`），逐个要求"存在且已被跟踪"。

   顺带说明为什么不把"已提交"也算进来：本门禁只回答"会不会被漏带进提交"。
   它故意**不**要求工作树干净（开发中天天不干净），也不联网。 */
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function git(args) {
  return spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

/* ---------- 0. 前置：git 可用且在仓库内 ---------- */
const probe = git(["rev-parse", "--is-inside-work-tree"]);
if (probe.status !== 0 || String(probe.stdout).trim() !== "true") {
  console.log("⏭ SKIP：当前目录不在 git 工作树内（无法判定跟踪状态）。");
  console.log("   注意：SKIP **不是**成功 —— 请不要把本行读成「门禁通过」。");
  process.exit(78);
}

/* ---------- 1. 取出 index.html 里全部本地脚本引用 ---------- */
const srcs = [];
const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
let m;
while ((m = re.exec(html)) !== null) {
  const s = m[1];
  if (/^https?:\/\//i.test(s) || s.startsWith("//")) continue;   /* 外链不归本门禁管 */
  srcs.push(s.replace(/^\.\//, "").split("?")[0].split("#")[0]);
}
if (!srcs.length) {
  console.log("❌ index.html 里没有解析到任何本地 <script src>（解析器坏了？）");
  process.exit(1);
}

/* ---------- 2. 逐个问 git ---------- */
const missing = [], onDiskOnly = [], ok = [];
srcs.forEach(function (s) {
  const r = git(["ls-files", "--error-unmatch", "--", s]);
  if (r.status === 0) { ok.push(s); return; }
  /* 没被跟踪：区分"文件在磁盘上但没 git add"与"文件根本不存在"（后者 test-assets.js 已在管） */
  if (fs.existsSync(path.join(ROOT, s))) onDiskOnly.push(s);
  else missing.push(s);
});

console.log("======== index.html 脚本跟踪状态 ========");
console.log("引用本地脚本：" + srcs.length + " 个 · 已跟踪 " + ok.length + " 个");

if (missing.length) {
  console.log("\n❌ 引用了**磁盘上也不存在**的脚本（站点会 404）：");
  missing.forEach(function (s) { console.log("   - " + s); });
}
if (onDiskOnly.length) {
  console.log("\n❌ 以下 " + onDiskOnly.length + " 个脚本**存在但未被 git 跟踪** —— `git commit -am` 不会带上它们，");
  console.log("   提交出来的站点会引用同样数量的 404（功能静默缺失，见本文件头部说明）：");
  onDiskOnly.forEach(function (s) { console.log("   - " + s + "   →  git add " + s); });
}

if (missing.length || onDiskOnly.length) {
  console.log("\n❌ 失败：index.html 的脚本接线与版本库不一致。");
  process.exit(1);
}
console.log("✅ 全部已跟踪（不会被 `git commit -am` 漏掉）。");

/* ============ 2. 门禁自身的依赖也必须被跟踪（本轮新增）============
   为什么必须有这一节：index.html 那节只看"站点运行时脚本"。
   而 `npm test` 依赖的**工具脚本与模块**同样会"没提交"——后果是本地全绿、
   干净克隆直接报错（详见文件头部第二轮加固说明）。

   收集方式：从 tools/test-all.js 出发**传递地**跟 require：
     · 每条 ${ cmd: "node", args: ["tools/x.js"] } 里的 tools/x.js
     · 每个文件内部 require("./相对路径") 解析出的文件
   只认后缀为 .js/.cjs/.mjs 的目标；只跳到已收集的文件上，天然防环。

   ⚠️ 扫源码前**必须去掉注释**：`tools/lib/clock.js` 的**文档注释里**写着
   `const clock = require("./lib/clock.js")({ date: "..." })` —— 那是给读者看的用法示例，
   却被第一版解析器当成了真依赖，于是解析出 tools/lib/lib/clock.js（不存在）→ 门禁假红。
   所以先用 stripComments() 去掉块注释与行注释（保留换行，行号不漂）。

   exit 78（SKIP）的边界：test-all.js 本身不在（说明目录结构变了）时**不显示成功**，
   与本文件第 0 节同一口径 —— 宁可显式跳过，也不给一个假绿的"✅"。 */
const TOOLS = path.join(ROOT, "tools");
const TEST_ALL = path.join(TOOLS, "test-all.js");

/* 去注释：先块注释（保留换行），再行注释（同上）。刻意避开 "https://" 这类协议写法。 */
function stripComments(s) {
  return String(s)
    .replace(/\/\*[\s\S]*?\*\//g, function (mm) { return mm.replace(/[^\n]/g, " "); })
    .replace(/(^|[^:"'\\])\/\/[^\n]*/g, function (mm, p1) { return p1 + " ".repeat(mm.length - p1.length); });
}

function collectToolDeps() {
  const seen = {};
  const queue = [];
  /* 起点：test-all.js 自己 + 它 args 里点名的 tools/*.js */
  if (!fs.existsSync(TEST_ALL)) return null;
  const allSrc = stripComments(fs.readFileSync(TEST_ALL, "utf8"));
  queue.push(path.join("tools", "test-all.js"));
  const reArgs = /["']tools\/([A-Za-z0-9._\-/]+\.js)["']/g;
  let am;
  while ((am = reArgs.exec(allSrc)) !== null) queue.push(path.join("tools", am[1]));

  while (queue.length) {
    const rel = queue.shift();
    if (seen[rel]) continue;
    seen[rel] = true;
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;          /* 缺文件由下面的"存在性"断言报出 */
    const src = stripComments(fs.readFileSync(abs, "utf8"));
    /* require("./x") / require('../x') —— 只跟相对路径，不跟 npm 包。
       ⚠️ 解析基准是**被读文件的目录**（path.dirname(abs)），再相对 ROOT 取相对路径；
       写成相对 rel 的目录会多套一层 tools/。另外跳过解析到自己的分支（防自引用成环）。 */
    const reReq = /require\(\s*["'](\.[^"']+)["']\s*\)/g;
    let rm;
    while ((rm = reReq.exec(src)) !== null) {
      const target = rm[1];
      if (!/\.(js|cjs|mjs)$/.test(target)) continue;
      const resolved = path.resolve(path.dirname(abs), target);
      if (resolved === abs) continue;           /* 自引用：不去重也不外扩 */
      queue.push(path.relative(ROOT, resolved).split(path.sep).join("/"));
    }
  }
  return Object.keys(seen).sort();
}

const toolDeps = collectToolDeps();

console.log("\n======== 门禁依赖跟踪状态（npm test 的工具脚本/模块）========");
if (!toolDeps) {
  console.log("⏭ SKIP：未找到 tools/test-all.js（目录结构变了？）——本节未执行。");
  console.log("   注意：SKIP **不是**成功。test-all.js 与 0 号那节已通过，故整体仍为 exit 0，");
  console.log("   但请人工确认「被 npm test 依赖的文件」是否也都在版本库里。");
  process.exit(0);
}

const depMissing = [], depUntracked = [], depOk = [];
toolDeps.forEach(function (rel) {
  const abs = path.join(ROOT, rel);
  const r = git(["ls-files", "--error-unmatch", "--", rel]);
  if (!fs.existsSync(abs)) { depMissing.push(rel); return; }
  if (r.status === 0) { depOk.push(rel); return; }
  depUntracked.push(rel);
});

console.log("受检文件：" + toolDeps.length + " 个（含传递 require）· 已跟踪 " + depOk.length + " 个");

if (depMissing.length) {
  console.log("\n❌ 以下文件被 `npm test` 引用，但**磁盘上不存在**（本地就会报错）：");
  depMissing.forEach(function (s) { console.log("   - " + s); });
}
if (depUntracked.length) {
  console.log("\n❌ 以下 " + depUntracked.length + " 个文件**存在但未被 git 跟踪** ——");
  console.log("   本地 `npm test` 全绿，但**克隆到干净机器后会因文件缺失而报错**（本地复现不出来）：");
  depUntracked.forEach(function (s) { console.log("   - " + s + "   →  git add " + s); });
}

if (depMissing.length || depUntracked.length) {
  console.log("\n❌ 失败：npm test 的依赖与版本库不一致。");
  process.exit(1);
}
console.log("✅ 门禁自身依赖全部已跟踪。");
process.exit(0);
