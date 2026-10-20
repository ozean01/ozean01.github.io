#!/usr/bin/env node
/* 验收：Phase 2 · UI 质量与诚信门禁
   P2-1 播放回退不再自锁（连听 / 字幕连播会静默停住）
   P2-2 离线识别不做无凭证的承诺（模型不随站分发）
   P2-3 移动端导航可折叠，触控目标 ≥44px
   P2-4 键盘可达与 ARIA（字幕点读 / tab / 弹窗）
   P2-5 对比度 ≥4.5:1 —— 本门禁**现场计算**，改色即校验
   P2-6 手机横向溢出容器 + 版本号单一来源
   P2-7 … P2-12 2026-10 UI 规范批次回归守卫（单词卡 DOM/高度/对比度/空态/图标/ARIA）
   P2-13（可选）真实浏览器探针，默认不依赖 Chrome
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
const pwa = read("js/pwa-init.js");
const pkg = JSON.parse(read("package.json"));

/* ============ P2-1 播放回退不自锁 ============ */
const nullOut = (player.match(/current = null;/g) || []).length;
check("P2-1：两处回退都在调用 speakNative 前把自己从 current 摘掉（避免自锁）", nullOut >= 2, "n=" + nullOut);
check("P2-1：回退逻辑附带原因说明（防止后人不明就里地删掉）",
  /speakNative.*current\.stop|current\.stop.*stopped/s.test(player) || /静默中断|自锁/.test(player));

/* ============ P2-2 离线识别：**已于 2026-10-12 整体移除** ============
   原 P2-2 守的是"本地离线识别要诚实"（probe/selfTest/未就绪禁用开关…）。实测那个小模型在
   行业术语上错得太多（isocyanate → "isis i and eight"），给出的分会误导人，故整体删除；
   这些检查随之失效 —— 但**不能删完就算**，否则功能会悄悄回来（见 test-p1-invariants.js §10
   的"已移除的文件不得复活"反向守卫）。这里只留一条：设置页必须把"评分走哪个引擎"说清楚。 */
check("P2-2：设置页必须写明跟读评分走浏览器语音识别、并推荐 Edge",
  /id="asrSourceNote"/.test(html) && /Edge/.test(html) && /Web Speech API/.test(html));
check("P2-2：设置页不得再出现「优先本地识别」开关与其说明节点",
  !/setLocalASR|localASRNote/.test(html) && !/id="localASRNote"/.test(read("index.html")));
check("P2-2：app.js 不得再对已移除的开关做禁用/勾选操作",
  !/setLocalASR/.test(appCode) && !/localASRNote/.test(appCode));

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

/* ---------- P0-11 全量文本色对比度（现场计算，含硬编码 hex） ----------
   背景：P2-5 只断言**若干 token 名**。实测有 62 处 `color:#hex` 绕过 token，
   暗色下前景不换、底色变深，比值掉到 2.06–2.91:1（WCAG 1.4.3 硬违规），
   而门禁结构上看不见这些「使用层」声明。
   现在改为扫描 css/style.css 里**所有** `color:` 声明（硬编码 hex 与 var() 一视同仁），
   在浅色与暗色两套主题下现场算比值，逐条打印违规行号与比值。 */
const CC = require("./contrast-check.js");
const ccCss = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
const CC_A = CC.analyze(ccCss);
const ccBad = CC_A.rows.filter(function (r) { return (r.light < 4.5 || r.dark < 4.5) && !CC.WL.has(CC.wlKey(r)); });
const ccWl = CC_A.rows.filter(function (r) { return (r.light < 4.5 || r.dark < 4.5) && CC.WL.has(CC.wlKey(r)); });
check("P0-11：style.css 全部 color 声明（" + CC_A.rows.length + " 条）在浅色/暗色下均 ≥4.5:1",
  ccBad.length === 0,
  ccBad.length ? "违规 " + ccBad.length + " 条" : "现场核算 0 违规");
ccBad.sort(function (a, b) { return a.line - b.line; }).forEach(function (r) {
  console.log("     ✗ css/style.css:" + r.line + "  " + r.decl + "  浅 " + r.light.toFixed(2) +
    ":1 / 暗 " + r.dark.toFixed(2) + ":1  " + r.sel);
});
check("P0-11：白名单只放行「非文本 / 背景静态不可解析」，且每条都写明理由",
  CC.WHITELIST.length > 0 &&
  CC.WHITELIST.every(function (w) { return w.length === 3 && String(w[2] || "").length > 8; }) &&
  CC.WHITELIST.every(function (w) { return /对比|实测|非正文|浮层|渐变|图标/.test(w[2]); }),
  "白名单 " + CC.WHITELIST.length + " 条，本轮命中 " + ccWl.length + " 条");
/* 语义词色 token 必须在暗色块里被覆盖，否则等于没修 */
const DARK_BLOCK = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
["--primary-text", "--ok-text", "--bad-text", "--accent-text", "--tech-text", "--navy-text",
  "--on-ok", "--on-bad", "--on-accent", "--bad-soft-2", "--accent-soft-2"].forEach(function (k) {
    check("P0-11：暗色块覆盖了 " + k, new RegExp("\\" + k + "\\s*:").test(DARK_BLOCK || ""));
  });
check("P0-11：语义文本 token 在浅色 :root 里齐全",
  ["--primary-text", "--ok-text", "--bad-text", "--accent-text", "--tech-text"].every(function (k) {
    return new RegExp("\\" + k + "\\s*:").test(css.slice(0, css.indexOf("@media")));
  }));
/* 反向验证：把已修的暗色 token 故意改回违规值，核算必须变红 */
const SABOTAGE = ccCss.replace("--primary-text:#93c5fd;", "--primary-text:#6d28d9;");
check("P0-11：反向验证（把 --primary-text 改回 #6d28d9 后必须算出违规）",
  SABOTAGE !== ccCss && CC.analyze(SABOTAGE).rows.some(function (r) {
    return (r.light < 4.5 || r.dark < 4.5) && !CC.WL.has(CC.wlKey(r));
  }));

/* ============ P2-6 横向溢出与版本单一来源 ============ */
/* P0 批次调整：判定改为「顺序无关」。
   原因（第二期 S07 真机实测）：把 overflow-x:auto 直接写在 <table> 上会被浏览器忽略
   （实测 computed overflow-x: visible），正确写法是 `display:block;overflow-x:auto` + 内部元素 min-width。
   原断言写死了 `.dg-lines{overflow-x:auto`（要求 overflow 是第一条声明），修正后的写法会被误判为失败。
   现在只要求该声明块里**存在** overflow-x:auto——仍守得住「没有滚动容器」这个真退化。 */
check("P2-6：单证明细行与单证表格有独立横向滚动容器",
  /\.dg-lines\{[^}]*overflow-x:auto[^}]*\}/.test(css) && /\.dg-doc table\.sop-table\{display:block;overflow-x:auto/.test(css));
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

/* ============================================================================
   P2-7 … P2-12：2026-10 UI 规范批次的回归守卫
   ----------------------------------------------------------------------------
   这一节把本批「按规范做对的事」钉成断言。纪律：每条断言都用同一个 predicate
   跑两遍——现状（必须绿）+ 故意改回违规写法（必须红）——照 P0-11 的反向验证写法。
   predicate 写成纯函数，反向验证只喂入「被改写过的字符串」，不改磁盘。
   ============================================================================ */

/* ---------- 通用小工具（CSS 规则块 / 声明 / 颜色） ---------- */
function ruleBody(text, sel) {
  const key = sel + "{";
  const i = text.indexOf(key);
  if (i < 0) return "";
  const open = i + key.length - 1;
  let depth = 0;
  for (let j = open; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}") { depth--; if (depth === 0) return text.slice(open + 1, j); }
  }
  return "";
}
function declIn(block, prop) {
  const m = stripComments(block).match(new RegExp("(?:^|[;{])\\s*" + prop + "\\s*:\\s*([^;}]*)", "i"));
  return m ? m[1].trim() : "";
}
/* 固定高度：height:（不是 min-height / max-height / line-height） */
function hasFixedHeight(block) { return /(?:^|[;\s])height\s*:/.test(stripComments(block)); }
function isAbsPos(block) { return /position\s*:\s*(?:absolute|fixed)\b/.test(stripComments(block)); }
function toRGBA(v) {
  v = String(v == null ? "" : v).trim();
  let m = v.match(/^#([0-9a-fA-F]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length === 6) return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
    if (h.length === 8) return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: parseInt(h.slice(6, 8), 16) / 255 };
    return null;
  }
  m = v.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(",").map(function (x) { return parseFloat(x); });
    if (p.length < 3 || p.some(function (x) { return isNaN(x); })) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  m = v.match(/^var\(\s*--([a-z0-9-]+)\s*\)$/i);
  if (m) return toRGBA(T(light, m[1]));
  return null;
}
function compositeOn(c, bg) {   /* 把半透明前景压到不透明背景上 */
  const a = c.a;
  const mix = function (f, b) { return Math.round(f * a + b * (1 - a)); };
  return { r: mix(c.r, bg.r), g: mix(c.g, bg.g), b: mix(c.b, bg.b), a: 1 };
}
function lumRGB(c) {
  const f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function ratioRGB(a, b) {
  const l1 = lumRGB(a), l2 = lumRGB(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function hexRGB(h) { const c = toRGBA(h); return c ? { r: c.r, g: c.g, b: c.b, a: 1 } : null; }

const UI_JS_FILES = fs.readdirSync(path.join(ROOT, "js")).filter(function (f) { return /\.js$/.test(f); });
const SOURCES = UI_JS_FILES.map(function (f) { return { name: "js/" + f, text: read("js/" + f) }; });
SOURCES.push({ name: "index.html", text: html });

/* ============ P2-7 单词卡 DOM / 交互契约 ============ */
function fcTagOf(src) {
  const i = src.indexOf('<div class="flash-card" id="flashCard"');
  return i < 0 ? "" : src.slice(i, src.indexOf(">", i) + 1);
}
function backRegionOf(src) {
  const i = src.indexOf("flash-face flash-back");
  if (i < 0) return "";
  const j = src.indexOf("flash-actions-hint", i);
  return src.slice(i, j < 0 ? i + 4000 : j);
}
function flashContract(srcApp, srcCode) {
  const tag = fcTagOf(srcApp);
  const back = backRegionOf(srcApp);
  return {
    bothFaces: srcApp.indexOf("flash-face flash-front") >= 0 && srcApp.indexOf("flash-face flash-back") >= 0,
    keyboardable: /role="button"/.test(tag) && /tabindex="0"/.test(tag) && /aria-pressed=/.test(tag),
    singleEntry: tag.length > 0 && tag.indexOf("data-action=") === -1 &&
      /closest\("\.flash-card"\)/.test(srcCode) &&
      /closest\("button, a, input, select, textarea, label"\)/.test(srcCode),
    keydownScoped: /e\.target\.closest\("\.flash-card"\)/.test(srcCode) &&
      /closest\("input, textarea, select, button, a"\)/.test(srcCode),
    gradeIdempotent: /lastGradedKey/.test(srcCode),
    noInlineColorOnBack: back.length > 0 && !/style="[^"]*(?:color\s*:|background\s*:)/.test(back),
    noUndefinedToTTS: /if \(!text\) break;/.test(srcCode)
  };
}
const FC = flashContract(app, appCode);
check("P2-7a：单词卡正面与背面都在同一模板里", FC.bothFaces);
check("P2-7b：卡片可键盘触达（role=button + tabindex=0 + aria-pressed）", FC.keyboardable);
check("P2-7c：翻面走单一入口（卡片自身不挂 data-action；点击排除按钮/链接/输入控件）", FC.singleEntry);
check("P2-7d：Space/Enter 只在卡片内翻面，且排除输入控件与按钮", FC.keydownScoped);
check("P2-7e：评分有幂等键（焦点在评分按钮上一次按键只评一张）", FC.gradeIdempotent);
check("P2-7f：背面不使用内联硬编码颜色（不得绕过 token）", FC.noInlineColorOnBack);
check("P2-7g：背面朗读分支不会把 undefined 交给 TTS", FC.noUndefinedToTTS);
/* 反向验证：各构造一个「改回违规写法」的样本，证明 predicate 会变红 */
const SAB7C = app.replace('<div class="flash-card" id="flashCard" role="button"', '<div class="flash-card" id="flashCard" data-action="flash-flip" role="button"');
check("P2-7c：反向验证（卡片改回挂 data-action=flash-flip 必须变红）",
  SAB7C !== app && flashContract(SAB7C, appCode).singleEntry === false);
const _bk = backRegionOf(app);
const _bk2 = _bk.replace('<div class="hint">按真实掌握程度评分 ↓</div>', '<div class="hint" style="color:#2563eb;background:#fff">按真实掌握程度评分 ↓</div>');
check("P2-7f：反向验证（背面加回内联 color/background 必须变红）",
  _bk2 !== _bk && flashContract(app.replace(_bk, _bk2), appCode).noInlineColorOnBack === false);
const SAB7G = appCode.replace(/if \(!text\) break;/, "");
check("P2-7g：反向验证（删掉 !text 守卫必须变红）",
  SAB7G !== appCode && flashContract(app, SAB7G).noUndefinedToTTS === false);

/* ============ P2-8 卡片高度契约（正面必须参与高度计算） ============ */
/* 缺陷背景（实测数字）：第一版修复把 .flash-back 改成在流内撑高，但 .flash-front 仍是
   position:absolute;inset:0，于是 `.flash-inner` 高度 = max(240/300, **背面**内容高)，
   正面内容根本不参与。句型骨架卡正面因此溢出卡片：375px 53px / 430px 53px / 768px 45px。
   任何人只要把任一面改回绝对定位，这个缺陷就会复活——所以钉死「两面都在流内/同格」。 */
function layoutContract(cssText) {
  const inner = ruleBody(cssText, ".flash-inner");
  const face = ruleBody(cssText, ".flash-face");
  const front = ruleBody(cssText, ".flash-front");
  return {
    innerNotFixedHeight: inner.length > 0 && !hasFixedHeight(inner),
    stacked: /display\s*:\s*grid/.test(inner) && /grid-area\s*:/.test(face),
    faceInFlow: face.length > 0 && !isAbsPos(face),
    frontInFlow: front.length > 0 && !isAbsPos(front)
  };
}
const LC = layoutContract(css);
check("P2-8a：.flash-inner 不得用固定 height（min-height 允许）", LC.innerNotFixedHeight);
check("P2-8b：两面叠在同一网格单元（display:grid + grid-area:1/1）", LC.stacked);
check("P2-8c：.flash-front 不得是绝对定位覆盖层（否则退出高度计算）", LC.frontInFlow);
check("P2-8d：.flash-face 不得绝对定位（两面都必须参与高度）", LC.faceInFlow);
const SAB8F = css.replace(".flash-front{", ".flash-front{position:absolute;inset:0;");
check("P2-8c：反向验证（把 .flash-front 改回 absolute 必须变红）",
  SAB8F !== css && layoutContract(SAB8F).frontInFlow === false);
const SAB8I = css.replace(".flash-inner{", ".flash-inner{height:300px;");
check("P2-8a：反向验证（把 .flash-inner 改回 height:300px 必须变红）",
  SAB8I !== css && layoutContract(SAB8I).innerNotFixedHeight === false);

/* ============ P2-9 背面文字对比度（opacity 感知） + btn-ghost 使用层 ============ */
/* 为什么 P0-11 不够：它只扫「声明了 color: 的规则」。背面文字坐在**固定深蓝渐变**上，
   且多处靠 opacity / rgba alpha 降低不透明度——静态门禁既看不见 opacity，也算不对渐变。
   实测教训：.hint 0.72、.ex-cn 0.85 一度只有 3.44:1 / 4.20:1，而 P0-11 全绿。
   这里对背面每一类正文，取「颜色 alpha × 链上 opacity」合成后与渐变**最浅端**现场算比值。 */
const BACK_GRAD = ruleBody(css, ".flash-back");
const BACK_STOPS = (function () {
  const hs = [], re = /#[0-9a-fA-F]{3,6}/g; let m;
  while ((m = re.exec(BACK_GRAD)) !== null) hs.push(m[0]);
  return hs.length ? hs : ["#2563eb"];
})();
const BACK_WORST = (function () {   /* 亮度最高的那一端：白字对比度最低 */
  let w = BACK_STOPS[0];
  BACK_STOPS.forEach(function (h) { if (ratio(h, "#000000") > ratio(w, "#000000")) w = h; });
  return w;
})();
/* [选择器, 字号, 字重] —— 与 app.js 背面模板一一对应 */
const BACK_TEXT = [
  [".flash-back .cn-ok", 26, 800], [".flash-back .cn-why", 20, 600],
  [".flash-back .cn-frame", 19, 700], [".flash-back .cn-slot", 17, 600],
  [".flash-back .cn-memo", 13.5, 800], [".flash-back .hint", 12.5, 400],
  [".flash-back .ex", 15, 400], [".flash-back .ex-cn", 15, 400],
  [".flash-back .ipa", 13.5, 400], [".flash-back .big-back", 30, 800],
  [".flash-back .cn-soft", 26, 800], [".flash-back .big-frame", 23, 700],
  [".flash-back .cn", 26, 800]
];
/* 取某条背面规则：优先精确选择器；找不到时做「同类归一」匹配——
   同一个元素在 CSS 里可能被写成 `.flash-back .cn.cn-memo`（多一个类提高特异性，
   用来压过窄屏媒体查询 `.flash-face .cn{font-size:22px}`）。
   门禁必须跟着命中真实那条规则，否则会退回「继承 .flash-back 的纯白」算出偏乐观的值。 */
function backRule(cssText, sel) {
  const direct = ruleBody(cssText, sel);
  if (direct) return direct;
  const cls = sel.replace(/^\.flash-back\s*/, "").replace(/^\./, "");
  if (!cls) return "";
  const rules = CC.parseRules(stripComments(cssText));
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (r.at || r.sel.indexOf(".flash-back") === -1 || r.sel.indexOf(cls) === -1) continue;
    return r.body;
  }
  return "";
}
function backTextRatio(sel, cssText) {
  const own = backRule(cssText, sel);
  const base = ruleBody(cssText, ".flash-back");
  const c = toRGBA(declIn(own, "color") || declIn(base, "color") || "#fff");
  if (!c || !BACK_WORST) return null;
  let op = parseFloat(declIn(own, "opacity"));
  if (isNaN(op)) {   /* 同元素上还有 .flash-face <类> 那条规则（如 .flash-face .hint） */
    const cls = sel.replace(/^\.flash-back\s*/, "");
    const alt = parseFloat(declIn(ruleBody(cssText, ".flash-face " + cls), "opacity"));
    op = isNaN(alt) ? 1 : alt;
  }
  const bg = hexRGB(BACK_WORST);
  const eff = { r: c.r, g: c.g, b: c.b, a: c.a * op };
  return ratioRGB(eff.a < 1 ? compositeOn(eff, bg) : eff, bg);
}
const backRows = BACK_TEXT.map(function (row) { return { sel: row[0], need: (row[1] >= 24 || (row[1] >= 18.66 && row[2] >= 700)) ? 3 : 4.5, r: backTextRatio(row[0], css) }; });
const backBad = backRows.filter(function (x) { return x.r != null && x.r < x.need; });
check("P2-9a：背面 " + BACK_TEXT.length + " 类文字对固定深蓝最浅端（" + BACK_WORST + "）均达标（正文≥4.5 / 大字≥3）",
  backBad.length === 0,
  backBad.length ? backBad.map(function (x) { return x.sel + " " + x.r.toFixed(2) + ":1"; }).join("；")
    : "最差 " + Math.min.apply(null, backRows.map(function (x) { return x.r == null ? 99 : x.r; })).toFixed(2) + ":1");
const SAB9 = css.replace(/(\.flash-back \.hint\{[^}]*opacity\s*:\s*)[0-9.]+/, "$1.72");
const SAB9R = backTextRatio(".flash-back .hint", SAB9);
check("P2-9a：反向验证（把 .flash-back .hint 改回 opacity:.72 必须算出 <4.5）",
  SAB9 !== css && SAB9R != null && SAB9R < 4.5, SAB9R == null ? "n/a" : SAB9R.toFixed(2) + ":1");
/* P2-9c：背面助记（💡 只在背面渲染）必须用「≥3 个类」的选择器。
   真实实测：窄屏媒体查询里有一条 `.flash-face .cn{font-size:22px}`（0,0,2,0），
   与 `.flash-back .cn-memo`（0,0,2,0）**同特异性**，靠书写顺序压过它 →
   助记在窄屏按 22px/800 渲染（本该 13.5px）。用 `.flash-back .cn.cn-memo`（3 个类）才压得住。
   这条断言守的是「特异性够不够」，不是「值写没写」。 */
function memoRuleSelector(cssText) {
  /* 必须先剥注释再解析：注释里可能写着 `.flash-face .cn{font-size:22px}` 这类示例，
     花括号会让 parseRules 的配对错位，把注释尾巴当成选择器（我踩过这个坑）。 */
  const rules = CC.parseRules(stripComments(cssText));
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (r.at || r.sel.indexOf(".flash-back") === -1 || r.sel.indexOf("cn-memo") === -1) continue;
    if (!/font-size\s*:/.test(stripComments(r.body))) continue;
    return r.sel;
  }
  return "";
}
function classCount(sel) { return (sel.match(/\.[A-Za-z][\w-]*/g) || []).length; }
const MEMO_SEL = memoRuleSelector(css);
check("P2-9c：背面助记规则的特异性 ≥3 个类（否则被窄屏 .flash-face .cn{font-size:22px} 压成 22px）",
  classCount(MEMO_SEL) >= 3, MEMO_SEL || "未找到助记规则");
const SAB9C = css.replace(".flash-back .cn.cn-memo{", ".flash-back .cn-memo{");
check("P2-9c：反向验证（把助记规则降回 2 个类必须变红）",
  SAB9C !== css && classCount(memoRuleSelector(SAB9C)) < 3,
  SAB9C === css ? "样本未命中" : classCount(memoRuleSelector(SAB9C)) + " 个类");
/* .btn-ghost 是白字透明底，只能出现在固定深色面上。以前光看 CSS 声明看不见「用在哪」，
   于是浅底上的白字（radar/write 两处）一直漏。这里扫**使用层**：每次出现都必须与
   .hero / .ob-bar / .flash-back 同一模板上下文，否则必须改成 .btn-outline。 */
function btnGhostAudit(sources) {
  const bad = [];
  sources.forEach(function (src) {
    const text = src.text;
    let i = text.indexOf("btn-ghost");
    while (i >= 0) {
      const ctx = text.slice(Math.max(0, i - 1500), i + 200);
      if (!/(hero|ob-bar|flash-back)/.test(ctx)) {
        bad.push(src.name + ":" + (text.slice(0, i).split("\n").length));
      }
      i = text.indexOf("btn-ghost", i + 1);
    }
  });
  return bad;
}
const bgBad = btnGhostAudit(SOURCES);
check("P2-9b：.btn-ghost（白字透明底）只允许出现在深色面模板里", bgBad.length === 0,
  bgBad.length ? "浅底使用 " + bgBad.length + " 处：" + bgBad.join(", ") : "0 处浅底使用");
const SAB9B = SOURCES.map(function (s) {
  return s.name === "js/today.js" ? { name: s.name, text: s.text + "\nvar _x = '<button class=\"btn btn-ghost\">测试</button>';" } : s;
});
check("P2-9b：反向验证（在浅色模板里加一处 btn-ghost 必须变红）", btnGhostAudit(SAB9B).length > 0);

/* ============ P2-10 空态不得撒谎 ============ */
function emptyStateContract(srcApp) {
  const i = srcApp.indexOf("function flashEmptyHtml(");
  const j = srcApp.indexOf("function flashSetupHtml(");
  const body = (i >= 0 && j > i) ? srcApp.slice(i, j) : "";
  return {
    hadCardsSplit: /s\.hadCards === false \? flashEmptyHtml\(s\) : flashDoneHtml\(s\)/.test(srcApp),
    emptyNoMastered: body.length > 0 && !/全部掌握/.test(body) && !/已掌握/.test(body),
    noDueBranch: /本轮没有到期卡片/.test(srcApp)
  };
}
const ES = emptyStateContract(app);
check("P2-10a：队列为空必须区分「本来就没内容」与「本轮没有到期卡」（hadCards 分水岭）", ES.hadCardsSplit);
check("P2-10b：flashEmptyHtml 不得说「（已）全部掌握」", ES.emptyNoMastered);
check("P2-10c：有卡但未到期时要写明「本轮没有到期卡片」+ 下次到期时间", ES.noDueBranch);
const SAB10 = app.replace("s.hadCards === false ? flashEmptyHtml(s) : flashDoneHtml(s)", "s.queue.length === 0 ? flashEmptyHtml(s) : flashDoneHtml(s)");
check("P2-10a：反向验证（改回只看 queue.length 必须变红：有卡未到期会被误判成没内容）",
  SAB10 !== app && emptyStateContract(SAB10).hadCardsSplit === false);

/* ============ P2-11 按钮语言：同一动作同一图标 ============ */
function iconAudit(sources) {
  const bad = [];
  sources.forEach(function (src) {
    let m, re = /title="朗读[^"]*"[^>]*>\s*▶/g;
    while ((m = re.exec(src.text)) !== null) bad.push(src.name + "：朗读配了 ▶");
    let i = src.text.indexOf('data-action="shadow-eval"');
    while (i >= 0) {
      if (src.text.slice(i, i + 400).indexOf("🎯") < 0) bad.push(src.name + "：shadow-eval 不是 🎯");
      i = src.text.indexOf('data-action="shadow-eval"', i + 1);
    }
    i = src.text.indexOf('data-action="shadow"');
    while (i >= 0) {
      if (src.text.slice(i, i + 400).indexOf("🎙") < 0) bad.push(src.name + "：shadow 不是 🎙");
      i = src.text.indexOf('data-action="shadow"', i + 1);
    }
  });
  return bad;
}
const iconBad = iconAudit(SOURCES);
check("P2-11a：全站图标一致（朗读 🔊 不得配 ▶；评测 🎯；跟读录音 🎙）", iconBad.length === 0,
  iconBad.length ? iconBad.join("；") : "0 处不一致");
check("P2-11b：牌型按钮写动作（⇄ 切换牌型）而不是状态名",
  /data-action="flash-deck"[\s\S]{0,240}?>\s*⇄ 切换牌型/.test(app));
check("P2-11c：产出档按钮写动作（⇄ 切到产出档 / ⇄ 切回接受档），不是状态名",
  /"⇄ 切到产出档（中→英）"/.test(app) && /"⇄ 切回接受档（英→中）"/.test(app));
const SAB11 = SOURCES.map(function (s) {
  return s.name === "js/app.js" ? { name: s.name, text: s.text.replace('title="朗读这个单词">🔊', 'title="朗读这个单词">▶') } : s;
});
check("P2-11a：反向验证（把一处朗读改回 ▶ 必须变红）", iconAudit(SAB11).length > 0);
const SAB11B = app.replace("⇄ 切换牌型（当前：", "当前牌型：");
check("P2-11b：反向验证（把动作文案改回状态名必须变红）",
  SAB11B !== app && !/data-action="flash-deck"[\s\S]{0,240}?>\s*⇄ 切换牌型/.test(SAB11B));

/* ============ P2-12 flash 段 title / ARIA 一致性 ============ */
function flashA11yAudit(srcApp) {
  const i = srcApp.indexOf("function renderFlash()");
  const j = srcApp.indexOf("function flashEmptyHtml(");
  const tpl = (i >= 0 && j > i) ? srcApp.slice(i, j) : "";
  const tags = tpl.match(/<(?:button|a)\b[^>]*>[\s\S]*?<\/(?:button|a)>/g) || [];
  const bad = [];
  tags.forEach(function (t) {
    const open = t.slice(0, t.indexOf(">") + 1);
    const text = t.replace(/<[^>]*>/g, "").replace(/\$\{[^}]*\}/g, " ").replace(/\s+/g, "");
    const title = (open.match(/title="([^"]*)"/) || [])[1] || "";
    if (!title && text.length < 1) bad.push("无 title 且无可见文字：" + open.slice(0, 60));
    const al = (open.match(/aria-label="([^"]*)"/) || [])[1];
    if (al && text) {   /* 有可见文字时，aria-label 不得与它完全对不上（至少共享 2 连字） */
      const a = al.replace(/\s+/g, "");
      let shared = false;
      for (let k = 0; k + 2 <= a.length; k++) { if (text.indexOf(a.substr(k, 2)) >= 0) { shared = true; break; } }
      if (!shared) bad.push("aria-label 与可见文字无共同语义：" + al + " / " + text);
    }
  });
  return { count: tags.length, bad: bad };
}
const A11Y = flashA11yAudit(app);
check("P2-12：flash 段每个可点元素都有 title 或可见文字，且 aria-label 不与可见文字矛盾",
  A11Y.count >= 5 && A11Y.bad.length === 0,
  A11Y.count + " 个可点元素" + (A11Y.bad.length ? "；" + A11Y.bad.join("；") : "，0 冲突"));
const SAB12 = app.replace('aria-label="切换卡片牌型"', 'aria-label="清空全部学习数据"');
check("P2-12：反向验证（把 flash-deck 的 aria-label 改成与可见文字矛盾必须变红）",
  SAB12 !== app && flashA11yAudit(SAB12).bad.length > 0);

/* ============ P2-13（可选）真实浏览器探针：默认不依赖 Chrome ============ */
if (process.env.FTE_UI_PROBE === "1") {
  const probe = path.join(ROOT, "tools", "ui-probe.js");
  let out = "", code = 0;
  if (!fs.existsSync(probe)) {
    check("P2-13：ui-probe.js 存在（FTE_UI_PROBE=1 时）", false);
  } else {
    try {
      out = String(require("child_process").execFileSync(process.execPath,
        [probe, "--route", "flash", "--pre", "flash-worst", "--width", "375,430",
          "--out", path.join(require("os").tmpdir(), "fte-ui-probe-gate.json")],
        { encoding: "utf8", timeout: 240000 }));
    } catch (e) {
      code = (e && e.status != null) ? e.status : -1;
      out = String((e && e.stdout) || "") + String((e && e.stderr) || "");
    }
    const badProbe = /\[HIGH\] \[(?:text-clip|overflow-x|escape-box)\]/.test(out);
    check("P2-13：真实浏览器下 #/flash 无越框/被裁（FTE_UI_PROBE=1 时）", !badProbe && code === 0,
      "exit=" + code + (badProbe ? "，出现 HIGH 越框/被裁" : ""));
  }
} else {
  console.log("⏭ P2-13：跳过真实浏览器探针（默认不依赖 Chrome；设 FTE_UI_PROBE=1 启用）");
}

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
