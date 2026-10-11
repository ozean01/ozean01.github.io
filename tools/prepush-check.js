#!/usr/bin/env node
/* ============ 发布前固定动作 prepush-check（P1-D · S10-F11）============
   由来（S10 评审 F11）：本站的发布事故几乎都不是"代码写错"，而是"提交的树 ≠ 测过的树"。
   实测过的那一次最刺眼：`js/data-glossary.js` 等 3 个文件处于 `AM`（已暂存 + 工作区又改过），
   此时不带 `-a` 的 `git commit` 只会提交**旧版**数据文件，而把 `index.html` / `js/app.js` / `sw.js`
   的接线留在本地 → 线上出现"有数据、没接线"的死代码，且 `sw.js` 未升版，老用户什么都看不到。

   S10 给的建议流程：`git add -A` → **单一原子提交** → `git status --porcelain` 为空 → 再 push。
   本脚本把这个流程里**机器能判定**的部分固化成一次检查（零依赖、不联网、不改任何文件）：

     ① 工作区是否干净（`git status --porcelain` 为空）。
        · 有未提交改动即失败 —— 但**它不代替人工判断**：哪些改动属于同一批、
          `sw.js` 升版/基线刷新/文案是否要放进**同一个**提交，只能由人决定。
          输出里会写明「提交顺序需人工确认」，并把 `AM`/`MM`（暂存版 ≠ 工作区版）单独标出来。
     ② `sw.js` 的 `CACHE` 是否相对 `git show HEAD:sw.js` 升过版。
        · 预缓存清单集合的指纹**变了** ⇒ 版本必须**严格大于** HEAD 的版本（否则已安装的 PWA
          继续命中旧缓存桶 = 半更新）；指纹没变 ⇒ 版本不得回退（≥ HEAD）。
     ③ `tools/precache-baseline.json` 与 `sw.js` 是否一致（指纹 / 条数 / cache / minVersion）。
        · 合法改清单必须"先升 CACHE、再刷新基线"，两者错位时这里直接给出**可粘贴**的新基线字段。
     ④ 是否存在"被 `npm test` 依赖、但没被 git 跟踪"的文件。
        · 复用既有门禁 `tools/check-tracked.js` 的判定（直接调用它，不改那个文件）——
          本地 `npm test` 全绿、干净克隆后直接因文件缺失而报错，是同一类事故。

   出口码：**干净可发布 = 0；否则 = 1**（任何一项不过都非零，不给"看起来像通过"的假绿）。
   用法：
     node tools/prepush-check.js          # 发布前跑一次；红了按输出逐条处理
     （配合纪律）git add -A → 单一原子提交 → `git status --porcelain` 为空 → git push
     （CI / pages.yml 里同样跑这一条：检出即干净，因此它同时是"测试有没有污染工作区"的信号）
   ▲ 本脚本**只读**：它不 add、不 commit、不改 sw.js、不改基线。所有写动作由人执行。 */
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
let failed = 0;

function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) failed++;
}
function note(line) { console.log("   " + line); }

function git(args) {
  return spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
}
function sha256Of(s) { return crypto.createHash("sha256").update(s).digest("hex"); }

/* 从任意一份 sw.js 源码解析出预缓存事实；解析不出返回 null（取不到依据 = 失败，不给恒真分支） */
function swFacts(src) {
  const text = String(src || "");
  const block = (text.match(/const PRECACHE = \[([\s\S]*?)\];/) || [])[1];
  const raw = ((text.match(/const CACHE = "([^"]+)";/) || [])[1] || "").trim();
  const ver = Number((raw.match(/^fte-v(\d+)$/) || [])[1] || NaN);
  if (block === undefined || !Number.isFinite(ver)) return null;
  const ents = [...block.matchAll(/"([^"]*)"/g)].map(function (m) { return m[1].trim(); })
    .filter(function (s) { return !!s; });
  if (!ents.length) return null;
  return {
    fingerprint: sha256Of(ents.slice().sort().join("\n")),
    count: ents.length,
    version: ver,
    cache: raw
  };
}

console.log("======== 发布前固定动作 prepush-check（P1-D）========");
console.log("仓库：" + ROOT);
console.log("提醒：本脚本只做**机器能判定**的四项；哪些改动属于同一批、提交顺序如何安排，");
console.log("      **提交顺序需人工确认** —— 本脚本不能代替这个判断。\n");

/* ---------- 0. 前置：git 可用且在仓库内（不满足 = 失败，不是跳过） ---------- */
const probe = git(["rev-parse", "--is-inside-work-tree"]);
if (probe.error || probe.status !== 0 || String(probe.stdout || "").trim() !== "true") {
  console.error("❌ 拿不到 git 判定（" + (probe.error ? probe.error.message : ("exit " + probe.status)) + "）：" + ROOT);
  console.error("   为什么不能跳过：本脚本守的是「提交的树 = 测过的树」，没有 git 判定就等于没跑，");
  console.error("   而「没跑」被读成「通过」正是假绿的来源（S10-F2/F3）。");
  console.error("   怎么办：在真实检出里运行（`git rev-parse --is-inside-work-tree` 应输出 true）。");
  process.exit(1);
}

/* ---------- 1. 工作区必须干净 ---------- */
const status = git(["status", "--porcelain"]);
const porcelain = String(status.stdout || "").replace(/\r\n/g, "\n").trimEnd();
const lines = porcelain ? porcelain.split("\n") : [];
check("工作区干净（git status --porcelain 为空）", lines.length === 0,
  lines.length ? (lines.length + " 项未提交改动") : "");
if (lines.length) {
  note("未提交改动的完整清单（`XY 路径`：X = 暂存区状态，Y = 工作区状态）：");
  lines.forEach(function (l) { note("   " + l); });
  const mismatched = lines.filter(function (l) { return /^(A|M|R|C)[MD]$/.test(l.slice(0, 2)); });
  if (mismatched.length) {
    note("");
    note("⚠️ 以下 " + mismatched.length + " 个文件是 `暂存区 ≠ 工作区`（AM/MM…）——这正是 S10-F11 记录的事故源头：");
    mismatched.forEach(function (l) { note("   " + l.slice(3)); });
    note("   此时**不带 `-a`** 的 commit 只会提交暂存的那一版（可能是旧版数据），");
    note("   而把接线 / sw.js 升版 / 文档留在本地。");
  }
  const reports = lines.filter(function (l) { return /tools\/(report-count\.json|report-input\.json|report-ipa\.csv|data-lvl-patch\.js)$/.test(l); });
  if (reports.length) {
    note("");
    note("⚠️ 检出 `npm test` 的写盘产物被改脏：" + reports.map(function (l) { return l.slice(3); }).join(", "));
    note("   如果只是「跑测试弄脏的」，请在跑测试时设 `FTE_NO_WRITE=1`（三个审计脚本支持只读模式），");
    note("   并把这几个文件恢复成它该有的内容；如果数据确实变了，请把**报告与数据放进同一个原子提交**。");
  }
  note("");
  note("建议流程：`git add -A` → **单一原子提交**（含 sw.js 升版 + tools/precache-baseline.json 刷新）");
  note("          → `git status --porcelain` 为空 → 再 `git push`。");
  note("⚠️ 提交顺序需人工确认：本条只回答「干不干净」，不回答「该不该一起提交」。");
}

/* ---------- 2. sw.js 的 CACHE 相对 HEAD 必须升版（清单变了没升版 = 失败） ---------- */
const SW = path.join(ROOT, "sw.js");
let work = null;
try { work = swFacts(fs.readFileSync(SW, "utf8")); } catch (e) { /* 下面统一报 */ }
check("sw.js 可解析出 PRECACHE 清单与 CACHE 版本", !!work, work ? (work.cache + " · " + work.count + " 条") : "读不到或解析失败：" + SW);

let head = null;
if (work) {
  const show = git(["show", "HEAD:sw.js"]);
  head = (show.status === 0 && !show.error) ? swFacts(show.stdout) : null;
  check("能从 git HEAD:sw.js 取到比对依据（取不到即失败，不给恒真分支）", !!head,
    head ? ("HEAD " + head.cache + " · " + head.count + " 条") : "HEAD 里没有 sw.js 或解析失败");
}
if (work && head) {
  const listUnchanged = work.fingerprint === head.fingerprint;
  const cond = listUnchanged ? work.version >= head.version : work.version > head.version;
  check(listUnchanged
    ? "预缓存清单与 HEAD 一致 ⇒ CACHE 版本不得回退（≥ " + head.cache + "）"
    : "预缓存清单较 HEAD 有变更 ⇒ CACHE 版本必须 > " + head.cache + "（否则老用户命中旧缓存桶）",
    cond,
    (listUnchanged ? "指纹一致 " + work.fingerprint.slice(0, 12)
                   : "指纹 " + work.fingerprint.slice(0, 12) + " ≠ HEAD " + head.fingerprint.slice(0, 12)) +
    " · 当前 " + work.cache + " · 清单 " + work.count + " 条（HEAD " + head.count + " 条）");
  if (!cond) {
    note("怎么办：按本站纪律把 sw.js 的 CACHE 版本号 +1（改动 PRECACHE 集合或清单内文件内容都要 +1），");
    note("        然后**先升版、再刷新 tools/precache-baseline.json**。");
  }
}

/* ---------- 3. tools/precache-baseline.json 必须与 sw.js 一致 ---------- */
const BASE = path.join(ROOT, "tools", "precache-baseline.json");
let base = null, baseWhy = "";
try { base = JSON.parse(fs.readFileSync(BASE, "utf8")); }
catch (e) { baseWhy = (e && e.code === "ENOENT") ? "文件不存在" : ("读取/解析失败：" + (e && e.message)); }
check("tools/precache-baseline.json 可读且字段完整", !!base, base ? "" : baseWhy);

if (base && work) {
  check("基线的清单指纹 = sw.js 的 PRECACHE 指纹", String(base.sha256) === work.fingerprint,
    "基线 " + String(base.sha256 || "").slice(0, 12) + " vs sw.js " + work.fingerprint.slice(0, 12));
  check("基线的条数 = sw.js 的 PRECACHE 条数", Number(base.count) === work.count,
    "基线 " + base.count + " vs sw.js " + work.count);
  check("基线的 cache 版本 = sw.js 的 CACHE 版本", String(base.cache) === work.cache,
    "基线 " + base.cache + " vs sw.js " + work.cache);
  check("基线的 minVersion = 其 cache 版本（防回退下限 = 快照点）",
    Number(base.minVersion) === Number(String(base.cache || "").replace("fte-v", "")),
    String(base.minVersion));
  const consistent = String(base.sha256) === work.fingerprint && Number(base.count) === work.count &&
    String(base.cache) === work.cache;
  if (!consistent) {
    note("怎么办：**升完 CACHE 版本之后**，把 tools/precache-baseline.json 刷成下面这组值：");
    note('   { "sha256": "' + work.fingerprint + '", "count": ' + work.count +
      ', "cache": "' + work.cache + '", "minVersion": ' + work.version + ' }');
    note("   （test-p0-content.js / test-outcomes.js 会把三者错位判红）");
  }
}

/* ---------- 4. npm test 的依赖必须已被 git 跟踪（复用既有门禁的判定） ---------- */
const TRACKED = path.join(ROOT, "tools", "check-tracked.js");
if (!fs.existsSync(TRACKED)) {
  check("tools/check-tracked.js 存在（未跟踪依赖检查的判定方）", false, "文件缺失：" + TRACKED);
} else {
  const r = spawnSync(process.execPath, [TRACKED], { cwd: ROOT, encoding: "utf8" });
  const out = String(r.stdout || "").trim();
  check("index.html 脚本与 npm test 的工具依赖均已被 git 跟踪", r.status === 0,
    r.status === 0 ? "" : "check-tracked.js exit " + r.status);
  if (r.status !== 0) {
    out.split("\n").filter(function (l) { return /^❌|^   -/.test(l); }).forEach(note);
    note("怎么办：按上面列出的路径逐个 `git add`；这是「克隆到干净机器后 npm test 报错」的同一类事故。");
  }
}

/* ---------- 出口码 ---------- */
console.log("\n========================================");
if (failed) {
  console.log("❌ 发布前检查未通过：" + failed + " 项 —— **先别 push**。逐条处理后重跑本脚本。");
  console.log("   （清理完请再确认一次：`git status --porcelain` 为空 ⇒ 提交顺序已由人确认。）");
  process.exit(1);
}
console.log("✅ 发布前检查通过：工作区干净 · CACHE 已相对 HEAD 升版 · 基线与 sw.js 一致 · 依赖全部已跟踪。");
console.log("   仍需人工确认：这次原子提交的内容边界（哪些批次、哪些文件属于同一批）。");
process.exit(0);
