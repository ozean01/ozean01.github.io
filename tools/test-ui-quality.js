#!/usr/bin/env node
/* 验收：Phase 2 · UI 质量与诚信门禁
   P2-1 播放回退不再自锁（连听 / 字幕连播会静默停住）
   P2-2 离线识别不做无凭证的承诺（模型不随站分发）
   P2-3 移动端导航可折叠，触控目标 ≥44px
   P2-4 键盘可达与 ARIA（字幕点读 / tab / 弹窗）
   P2-5 对比度 ≥4.5:1 —— 本门禁**现场计算**，改色即校验
   P2-6 手机横向溢出容器 + 版本号单一来源
   零依赖。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) pass = false;
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ""); }

const html = read("index.html");
const app = read("js/app.js");
const appCode = stripComments(app);
const css = read("css/style.css");
const player = read("js/player.js");
const subtitle = read("js/subtitle.js");
const asr = read("js/asr-local.js");
const pwa = read("js/pwa-init.js");
const pkg = JSON.parse(read("package.json"));

/* ============ P2-1 播放回退不自锁 ============ */
const nullOut = (player.match(/current = null;/g) || []).length;
check("P2-1：两处回退都在调用 speakNative 前把自己从 current 摘掉（避免自锁）", nullOut >= 2, "n=" + nullOut);
check("P2-1：回退逻辑附带原因说明（防止后人不明就里地删掉）",
  /speakNative.*current\.stop|current\.stop.*stopped/s.test(player) || /静默中断|自锁/.test(player));

/* ============ P2-2 离线识别诚实化 ============ */
check("P2-2：LocalASR 提供就绪探测 probe()", /function probe\(/.test(asr) && /probe: probe/.test(asr));
check("P2-2：修掉 KaldiRecognizer 的 API 误用（必须 new，采样率 16000）",
  /new m\.KaldiRecognizer\(16000\)/.test(stripComments(asr)) && !/m\.KaldiRecognizer\(44100\)/.test(stripComments(asr)));
check("P2-2：设置页明确写明「本站不分发该模型」", /本站不分发该模型/.test(html));
check("P2-2：未就绪时禁用开关并清掉已勾选状态",
  /setLocalASR\.disabled = true/.test(appCode) && /setLocalASR\.checked = false/.test(appCode) &&
  /localASRNote/.test(appCode));
check("P2-2：设置了运行时说明节点 id=localASRNote", /id="localASRNote"/.test(html));

/* ============ P2-3 移动端导航 ============ */
check("P2-3：窄屏导航默认收起（display:none）且 .show 才展开",
  /\.main-nav\{display:none/.test(css) && /\.main-nav\.show\{display:flex\}/.test(css));
check("P2-3：☰ 按钮按媒体查询显隐，并维护 aria-expanded",
  /matchMedia\("\(max-width: 720px\)"\)/.test(appCode) &&
  /navToggle\.hidden = !navMQ\.matches/.test(appCode) &&
  /aria-expanded/.test(appCode));
check("P2-3：触控目标 ≥44px（一级项与二级项）",
  /\.main-nav a,\.nav-group summary\{min-height:44px/.test(css) && /\.nav-sub a\{min-height:44px\}/.test(css));
check("P2-3：点导航项后自动收起", /closeNav\(\)/.test(appCode));

/* ============ P2-4 键盘与 ARIA ============ */
check("P2-4：字幕行可键盘触达（role=button + tabindex=0 + aria-label）",
  /role="button" tabindex="0" aria-label=/.test(subtitle));
check("P2-4：字幕列表有 keydown 处理（Enter / Space 与 click 同一动作）",
  /addEventListener\("keydown"/.test(subtitle) && /playCue\(parseInt\(row\.getAttribute\("data-idx"\)/.test(subtitle));
check("P2-4：tab 有 aria-selected 与 tabindex 管理",
  /aria-selected=/.test(appCode) && /tabindex="' \+ \(active/.test(appCode));
check("P2-4：内容区有配对的 tabpanel",
  /setAttribute\("role", "tabpanel"\)/.test(appCode) && /setAttribute\("aria-labelledby"/.test(appCode));
check("P2-4：设置弹窗声明 dialog 语义（role + aria-modal + 标题关联）",
  /role="dialog" aria-modal="true" aria-labelledby="settingsTitle"/.test(html) && /id="settingsTitle"/.test(html));
check("P2-4：弹窗有焦点管理（打开送焦点、关闭还焦点、Esc 可关）",
  /function focusIn\(/.test(appCode) && /function restoreFocus\(/.test(appCode) && /e\.key === "Escape"/.test(appCode));

/* ============ P2-5 对比度（现场计算） ============ */
function sliceBlock(text, startIdx, open, close) {
  let depth = 0;
  for (let i = startIdx; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) { depth--; if (depth === 0) return text.slice(startIdx, i + 1); }
  }
  return "";
}
function parseTokens(block) {
  const out = {};
  const re = /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})/g;
  let m;
  while ((m = re.exec(block)) !== null) out[m[1]] = m[2];
  return out;
}
function lum(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const c = [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255; })
    .map(function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

function rootTokens(cssText, from) {
  const i = cssText.indexOf(":root", from);
  if (i < 0) return {};
  const brace = cssText.indexOf("{", i);
  if (brace < 0) return {};
  return parseTokens(sliceBlock(cssText, brace, "{", "}"));
}
const light = rootTokens(css, 0);
const darkMedia = css.indexOf("@media (prefers-color-scheme: dark)");
const dark = Object.assign({}, light, rootTokens(css, darkMedia));
/* 解析出的键名不带 `--` 前缀，统一用 T() 取值，避免再踩一次 */
const T = function (set, name) { return set[String(name).replace(/^--/, "")]; };

[["--muted"], ["--ok"], ["--bad"], ["--accent"], ["--primary"]].forEach(function (p) {
  const r = ratio(T(light, p[0]), T(light, "--bg"));
  check("P2-5 浅色 " + p[0] + " 对页面底 ≥4.5:1", r >= 4.5, r.toFixed(2) + ":1");
});
[["--muted"], ["--ok"], ["--bad"], ["--accent"], ["--primary-2"]].forEach(function (p) {
  const r = ratio(T(dark, p[0]), T(dark, "--card"));
  check("P2-5 暗色 " + p[0] + " 对暗卡 ≥4.5:1", r >= 4.5, r.toFixed(2) + ":1");
});
["--primary-soft", "--ok-soft", "--bad-soft", "--accent-soft"].forEach(function (k) {
  check("P2-5 暗色覆盖了 " + k + "（浅色底在暗色下会读不出来）",
    T(dark, k) !== T(light, k), T(dark, k) || "未覆盖");
});
/* 暗色 soft 底与其对应前景仍须可读 */
[["--ok", "--ok-soft"], ["--bad", "--bad-soft"], ["--accent", "--accent-soft"], ["--primary-2", "--primary-soft"]]
  .forEach(function (p) {
    const r = ratio(T(dark, p[0]), T(dark, p[1]));
    check("P2-5 暗色 " + p[0] + " 对 " + p[1] + " ≥4.5:1", r >= 4.5, r.toFixed(2) + ":1");
  });

/* ============ P2-6 横向溢出与版本单一来源 ============ */
check("P2-6：单证明细行与单证表格有独立横向滚动容器",
  /\.dg-lines\{overflow-x:auto/.test(css) && /\.dg-doc table\.sop-table\{display:block;overflow-x:auto/.test(css));
check("P2-6：版本号单一来源（pwa-init 里的 FTE_VERSION）", /window\.FTE_VERSION = "\d+\.\d+\.\d+"/.test(pwa));
const ver = (pwa.match(/window\.FTE_VERSION = "([^"]+)"/) || [])[1];
check("P2-6：FTE_VERSION 与 package.json 的 version 一致", ver === pkg.version, ver + " vs " + pkg.version);
check("P2-6：页脚不再硬编码版本号（由脚本注入）",
  /id="appVersion"/.test(html) && !/footer-ver">v\d/.test(html));
check("P2-6：页脚注入逻辑存在", /getElementById\("appVersion"\)/.test(pwa));

/* ============ P2-额外：真实页面里漏出模板注释 ============ */
/* 精确取 render() 的那个主模板（从 app.innerHTML = ` 到收尾的 `;），
   断言其中不含块注释——模板字符串会把注释原样渲染成页面上的可见文字。 */
const todaySrc = read("js/today.js");
const tplStart = todaySrc.indexOf("app.innerHTML = `");
const tplEnd = todaySrc.indexOf("\n    `;", tplStart);
const tplBody = (tplStart >= 0 && tplEnd > tplStart) ? todaySrc.slice(tplStart, tplEnd) : "";
check("P2-额外：today.js 主模板不含块注释（此前会漏出成可见文字）",
  tplBody.length > 1000 && tplBody.indexOf("/*") === -1,
  tplBody ? "模板 " + tplBody.length + " 字符" : "未能定位主模板");

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
