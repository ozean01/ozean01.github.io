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

/* 棘轮上限（2026-10-24 首次设定：基于当日实测 +2% 余量）
   P11（2026-10-26）唯一一次上调：subResources 55 → 56，理由如下（按本文件第 11 行的规矩）：
     · 段级复听调度器必须**独立于 app.js / today.js** 才能被 tools/test-seg-review.js 直接单测
       （推进/提前练/断点过期这些边界在页面里测不出来）；塞进 today.js 会让今日页在无 FTE_BOOT
       的测试环境里被调度逻辑绑死，塞进 app.js 则无法验证「只有一处实现」。
     · 代价只有一个请求：gzip 总量仍在上限内（749KB / 751KB，未动 gzTotalKB），
       最大单文件仍是 app.js（113KB / 114KB，未动 biggestGzKB）。
     · 其余两条上限**不放松**；若今后还要加脚本，须先给旧脚本减负或按同一格式写明理由。
   P14（2026-10-27）第二次上调 gzTotalKB 751 → 757（+6KB，约 +0.8%），理由如下：
     · 本批是**内容批**不是功能膨胀：新增 14 条真实听音源（每条含 desc + why 两段中文，
       全在 js/sources.js，约占 3.2KB gzip），以及 tutor.js 的「首响计时 + 先给半句」面板
       （含口径说明与三件套，约占 2.9KB gzip）；实测 756KB（本门禁口径），未新增任何脚本/请求。
     · 已先按同一纪律**减负**：tutor.js 的注释与面板文案压过一轮（比初稿少约 0.4KB gzip），
       且本批没有新增 PRECACHE 条目、没有新增外部依赖。
     · 余量只留 2KB（≈0.3%，与首次设定的 749→751 同比例）；其余两条上限**不动**，
       最大单文件仍是 app.js。今后若还要加体积，须先给旧脚本减负，或按同一格式写明理由。
   P20（2026-10-30）第三次上调 gzTotalKB 757 → 766（+9KB，约 +1.2%），理由如下：
     · 本批是**功能批**：js/quiz.js 新增 QuizAI（生成 → 延迟答案 → 逐题讲错，约 4.4KB gzip），
       app.js / material.js 各一个挂载点与入口文案（约 0.4KB），tutor.js 的 callChat 可选 opts（约 0.1KB）。
     · 已守两条硬约束：**不新增脚本、不新增请求**（subResources 仍 56，PRECACHE 清单仍 64 条），
       全站只新增 1 个 LLM 调用点（已进 AI 调用点基线，带 FACT_GUARD 与披露出口）；
       最大单文件仍是 app.js（未动 biggestGzKB）。
     · 余量只留 2KB（实测 764KB / 766KB），与 P11/P14 的比例一致；其余两条上限**不放松**。
   任务1（2026-10-31）第四次上调：subResources 56 → 57、gzTotalKB 766 → 772（+6KB，约 +0.8%），理由如下：
     · 本批**确实新增 1 个脚本** js/cheatsheet.js（一页纸速查小抄）：只做「来源 key → 原有整句」的
       重排渲染，约 5.6KB gzip；样式与打印（@media print）约 0.4KB，合计实测 770KB（本门禁口径）。
     · 为什么不能塞进 app.js：它要读 SOP._t / FTE_MAIL / 单元词条例句，塞进 app.js 会让「来源解析+
       打印版式」与 app.js 的渲染主循环耦合；独立文件也让 tools/test-cheatsheet.js 能在最小桩环境单独加载。
     · PRECACHE 64 → 65 条（+js/cheatsheet.js），请求数 +1；最大单文件仍是 app.js（114KB，未动 biggestGzKB）。
     · 余量 2KB（实测 770KB / 772KB）；其余两条上限不放松。
   任务3（2026-10-31）第五次上调：subResources 57 → 58、gzTotalKB 772 → 782（+10KB，约 +1.3%），理由如下：
     · 本批是**功能批**：新增 1 个脚本 js/lookup.js（投料口全文精读高亮 + 点词小卡 + #/lookup 查词页 +
       bookmarklet 落点，实测 raw 25,459B / gzip 9,325B ≈ 9.1KB），另有接线与样式约 1KB
       （css/style.css +566B、material.js +299B、app.js 挂载 +118B、storage-keys.js +142B、index.html +98B）。
       本门禁口径实测 **779KB**（797,988B），782KB 是 2KB 容差（约 0.26%）——**超过即红**；
       下一批若还要动这条上限，必须重新拍板。
     · 为什么不能塞进 app.js：高亮要复用 material.js 的抓取结果与词库命中，还要能被
       tools/test-reader-highlight.js 在最小桩环境单独加载（词边界/已学优先/esc 注入/批大小四条断言）；
       塞进 346KB 的 app.js 既加不动体积，也测不了。
     · **biggestGzKB 不升**：本批没往 app.js 加净体积，反而删掉了文件头那份已漂移约 2000 行的
       分区索引注释（审计 P2-3），app.js 实测 gzip 116,088B（113.37KB）回到 114KB 内；
       今后 app.js 再贴线，先减负（注释/死代码）再说，不要再抬这条。
     · 余量 2KB（实测 779KB / 782KB）；其余两条上限不放松。 */
const BUDGET = {
  subResources: 58,      // 实测 58（57 脚本 + 1 样式表；任务3 新增 js/lookup.js）
  gzTotalKB: 782,        // 实测 779KB（任务3：全文精读高亮 + 查词页，+10KB gzip）
  biggestGzKB: 114       // 实测 app.js 113KB（任务3 删掉漂移的索引注释后回落到 114KB 内）
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
