#!/usr/bin/env node
/* 性能预算门禁（批次 A，2026-10-24）。
   由来：Lighthouse 基线（2026-10-24，线上）Performance 仅 50 分——
   52 个脚本 696KB 传输 + 未压缩 JS 143KiB 潜在节省 + CLS 0.824（骨架屏无样式）。
   本门禁把「体积与请求数」变成硬上限（棘轮式：只许降不许涨），防止性能随功能膨胀悄悄回退。

   口径（离线可算，CI ubuntu 无浏览器也能跑）：
     · subResources  = index.html 引用的 script src + stylesheet 数（≈ 真实请求数的子集）
     · gzTotal       = 上述文件 gzip 后的总字节（模拟传输体积；线上为 gzip/br，此处略保守）
     · biggestGz     = 最大单文件 gzip（当前 app.js）——单文件膨胀单独盯
   棘轮规则：上限 = 发布时实测值 + 2% 余量；要抬高上限必须改这里的常量并在 commit 里说明理由。
   CLS 修复（骨架屏撑满视口）由 CSS 与 test-ui-quality 的类名断言兜底，不在此重复。 */
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);

let gzTotal = 0, biggestGz = 0, biggestName = "";
scripts.concat(styles).forEach(function (f) {
  const buf = fs.readFileSync(path.join(ROOT, f.replace(/^\.\//, "")));
  const g = zlib.gzipSync(buf).length;
  gzTotal += g;
  if (/\.js$/.test(f) && g > biggestGz) { biggestGz = g; biggestName = f; }
});
const subResources = scripts.length + styles.length;
const kb = function (n) { return Math.round(n / 1024) + "KB"; };

/* 棘轮上限（2026-10-24 首次设定：基于当日实测 +2% 余量） */
const BUDGET = {
  subResources: 55,      // 实测 53（52 脚本 + 1 样式表）
  gzTotalKB: 751,        // 实测 735KB
  biggestGzKB: 114       // 实测 app.js 111KB
};

check("引用子资源数 ≤ " + BUDGET.subResources, subResources <= BUDGET.subResources,
  "实测 " + subResources + "（新增脚本必须给旧脚本减负或调高上限并说明理由）");
check("JS+CSS gzip 总量 ≤ " + BUDGET.gzTotalKB + "KB", gzTotal <= BUDGET.gzTotalKB * 1024,
  "实测 " + kb(gzTotal) + "（加功能前先减负：超限即失败，棘轮只紧不松）");
check("最大单文件 gzip ≤ " + BUDGET.biggestGzKB + "KB（当前最大：" + biggestName + "）",
  biggestGz <= BUDGET.biggestGzKB * 1024, "实测 " + kb(biggestGz));
check("index.html 含启动骨架占位块（CLS 修复的载体，不得移除）",
  /boot-skeleton[\s\S]*?sk-block/.test(html));
check("boot-skeleton 有 CSS（min-height 撑满视口，防首屏布局跳动）",
  /boot-skeleton\{min-height:calc\(100vh/.test(fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8")));

console.log(pass ? "\n=== 性能预算门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);
