#!/usr/bin/env node
/* P1 体验修正批门禁（v1.22.0 / 2026-10-31）——四项审计的「改完不再回退」守卫：
     ① SW 更新原子性：install 全有或全无（addAll）、失败清掉本次桶、不自动 skipWaiting、
        「立即刷新」按钮经 postMessage("skip-waiting") 推进 waiting 的 SW；
     ② 首访不重复下载：预缓存请求 cache:"no-cache"（不再 cache:"reload" 绕过 HTTP 缓存）；
     ③ 单脚本失败不静默：app.js 写 FTE_BOOT_FAILED，pwa-init 挂非白屏横幅点名缺失模块；
     ④ 首页 hero：引导句白系 ≥4.5:1（含渐变父底，contrast-check 必须真的解析到 gradient），
        装饰层在四个验收宽度都不与 .hero-tags/.hero-cta 矩形相交。

   说明：这些行为在 v107/v113 已实现，但没有门禁守；本批补的是「守」，并修掉 P1-4 在 768/1280
   仍存在的矩形重叠（装饰层走廊）。断言写法都对着「旧实现会红」来设计，改前/改后见提交说明。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = function (p) { return fs.readFileSync(path.join(ROOT, p), "utf8"); };
let failed = 0;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) failed++;
}

const sw = read("sw.js");
const pwa = read("js/pwa-init.js");
const appjs = read("js/app.js");
const css = read("css/style.css");

/* ---------------- ① SW 更新原子性 ---------------- */
const installAt = sw.indexOf('self.addEventListener("install"');
const activateAt = sw.indexOf('self.addEventListener("activate"');
const installBlock = (installAt >= 0 && activateAt > installAt) ? sw.slice(installAt, activateAt) : "";
check("install 块可定位（sw.js 结构未变）", installBlock.length > 200, "len=" + installBlock.length);
check("install 用 addAll（任一条失败 ⇒ 整个 install 失败，旧 SW/旧桶原样保留）",
  /c\.addAll\(PRECACHE\.map\(function \(url\) \{/.test(installBlock));
check("install 不再逐条 add + catch 吞失败（旧实现会红）",
  !/c\.add\(\s*new Request\(url/.test(installBlock) && !/\.catch\(function \(\) \{ \/\* ignore \*\/ \}\)/.test(installBlock));
check("install 失败时显式删掉本次 CACHE 桶（不留空桶/半桶）",
  /\.catch\(function \(err\) \{[\s\S]{0,240}caches\.delete\(CACHE\)/.test(installBlock));
check("install 内没有自动 self.skipWaiting()（新外壳停在 waiting）",
  !/self\.skipWaiting\(\)/.test(installBlock));
check("只有 message(\"skip-waiting\") 才 skipWaiting（由页面按钮触发）",
  /addEventListener\("message", function \(e\) \{\s*if \(e\.data === "skip-waiting"\) self\.skipWaiting\(\);\s*\}\)/.test(sw));
check("activate 仍清理「非当前 CACHE」的旧桶（只保留新桶）",
  /keys\.filter\(function \(k\) \{ return k !== CACHE; \}\)[\s\S]{0,120}caches\.delete\(k\)/.test(sw));

/* ---------------- ② 首访不重复下载 ---------------- */
check("预缓存请求用 cache:\"no-cache\"（命中 HTTP 缓存只做 304 校验）",
  /new Request\(url, \{ cache: "no-cache" \}\)/.test(installBlock));
check("全仓 sw.js 不再出现 cache:\"reload\"（旧实现会红）", !/cache: "reload"/.test(sw));

/* ---------------- ③ 立即刷新按钮真的能推进 waiting 的 SW ---------------- */
check("「立即刷新」按钮向 waiting 的 SW 发 skip-waiting",
  /if \(reg\.waiting\) reg\.waiting\.postMessage\("skip-waiting"\)/.test(pwa));
check("刷新按钮监听 controllerchange 后再 reload（不是盲 reload 回旧外壳）",
  /navigator\.serviceWorker\.addEventListener\("controllerchange", go\)/.test(pwa) &&
  /var go = function \(\) \{ if \(done\) return; done = true; location\.reload\(\); \};/.test(pwa));

/* ---------------- ④ 单脚本失败：非白屏横幅点名缺失模块 ---------------- */
check("app.js 把缺失模块写到 window.FTE_BOOT_FAILED",
  /window\.FTE_BOOT_FAILED = _missing\.slice\(\);/.test(appjs));
check("pwa-init 有 showPartial（读 FTE_BOOT_FAILED）",
  /function showPartial\(\)[\s\S]{0,400}window\.FTE_BOOT_FAILED/.test(pwa));
check("缺失模块横幅文案点名「部分模块未加载」并给重新加载按钮",
  /部分模块未加载/.test(pwa) && /重新加载/.test(pwa));
check("部分模块横幅挂在 body 上（不替换页面、不遮挡学习内容）",
  /document\.body\.appendChild\(bar\)/.test(pwa));
check("启动失败面板只在「应用没起来」时出现（缺模块走横幅，不是白屏）",
  /function showFailure\(\) \{\s*if \(shown \|\| window\.FTE_BOOTED\) return;/.test(pwa));
check("应用起来了但缺模块 ⇒ 调 showPartial（不是 showFailure）",
  /if \(window\.FTE_BOOTED\) \{ showPartial\(\); backupHint\(\); \}\s*else showFailure\(\);/.test(pwa));
check("缺失模块按单元 id 逐个点名（不再用累计阈值，避免点错模块）",
  /function _hasUnit\(n\) \{ return _unitIds\.indexOf\(n\) !== -1; \}/.test(appjs) &&
  /_need\("U12 单证 data-ops\.js", _hasUnit\(12\)\)/.test(appjs) &&
  /_need\("U19 会议\/汇报 data-meeting\.js", _hasUnit\(19\)\)/.test(appjs) &&
  !/_unitsOk >=/.test(appjs));

/* ---------------- ⑤ hero 可读性 + 装饰层几何 ---------------- */
check("hero 引导句用白系 92%（不再用 --muted 压在深蓝渐变上）",
  /\.hero \.hero-sub\{[^}]*color:rgba\(255,255,255,\.92\)/.test(css));
check("≤1023px 隐藏右侧装饰层（窄屏无走廊，不再压标签/按钮）",
  /@media \(max-width:1023px\)\{\.hero \.hero-layers\{display:none\}\}/.test(css));
check("≥1024px 给装饰层留独立走廊（padding-right:260px ≥ 层宽 200 + right 28）",
  /@media \(min-width:1024px\)\{[\s\S]{0,160}\.hero\{padding-right:260px\}/.test(css));

const CC = require("./contrast-check");
const A = CC.analyze(css);
const heroSub = A.rows.filter(function (r) { return r.sel === ".hero .hero-sub"; })[0];
check("contrast-check 能解析到 .hero .hero-sub 这一行", !!heroSub, heroSub ? "line " + heroSub.line : "未找到");
if (heroSub) {
  check("hero 引导句的父级渐变被真的解析（gradient=true，不是退回页面底）", heroSub.gradient === true,
    "gradient=" + heroSub.gradient);
  check("hero 引导句浅色主题对比度 ≥4.5:1", heroSub.light >= 4.5, heroSub.light.toFixed(2) + ":1");
  check("hero 引导句暗色主题对比度 ≥4.5:1", heroSub.dark >= 4.5, heroSub.dark.toFixed(2) + ":1");
  /* 逐色标最差值就是门禁口径：再把 92% 白与三个色标合成后手算一遍，防「工具口径漂移」 */
  const stops = ["#1e3a8a", "#1e40af", "#5b21b6"];   /* .hero 的 linear-gradient 三个色标（见 style.css） */
  const worst = stops.map(function (s) { return CC.contrast(CC.blend("#ffffffeb", s), s); }).sort(function (a, b) { return a - b; })[0];
  check("92% 白对 .hero 三个色标的最差对比度 ≥4.5:1（独立手算复核）", worst >= 4.5, worst.toFixed(2) + ":1");
}

console.log("\n=== " + (failed ? "有断言失败（" + failed + "）" : "全部通过") + " ===");
process.exit(failed ? 1 : 0);
