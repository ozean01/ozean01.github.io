#!/usr/bin/env node
/* 验收：安全与数据可信（P0-1 转义 / P0-2 CSP / P0-3 备份全覆盖 / P0-5 启动兜底）
   零依赖。分两类：
     · 静态契约：index.html 的 CSP 与脚本形态、注册表与代码里的存储键对账；
     · 行为验证：把 js 源文件放进 vm 里**真跑**——转义函数必须真的转义，
       备份导出的 JSON 必须真的覆盖全部可备份键、且真的不含凭据。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) pass = false;
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/* ============ ① 转义函数必须真的转义（行为验证） ============ */
function bodyOf(text, header) {
  const i = text.indexOf(header);
  if (i === -1) return null;
  const start = text.indexOf("{", i);
  if (start === -1) return null;
  let depth = 0;
  for (let k = start; k < text.length; k++) {
    if (text[k] === "{") depth++;
    else if (text[k] === "}") { depth--; if (depth === 0) return text.slice(start + 1, k); }
  }
  return null;
}
const PAYLOAD = '<img src=x onerror=alert(1)> & "q" \'a\'';
[["js/write.js", "const esc = function (s) {", true], ["js/patterns.js", "const esc = function (s) {", true], ["js/subtitle.js", "function esc(s) {", false]]
  .forEach(function (pair) {
    const body = bodyOf(read(pair[0]), pair[1]);
    if (!body) { check(pair[0] + " 能定位到 esc 实现", false); return; }
    let out;
    try { out = new Function("s", body)(PAYLOAD); } catch (e) { out = "THROW:" + e.message; }
    check(pair[0] + " 的 esc 真的转义尖括号", out.indexOf("<img") === -1 && out.indexOf("&lt;img") !== -1, out.slice(0, 46));
    check(pair[0] + " 的 esc 转义和号与双引号",
      out.indexOf("&amp;") !== -1 && (out.indexOf("&quot;") !== -1 || out.indexOf("&#34;") !== -1));
    /* 单引号：全站口径是「属性一律双引号包裹」，故不要求转义单引号
       （转义了反而会把正文里的撇号写成 &#39;，影响可读与文本比对） */
  });

/* ============ ② 字幕 toast 默认转义 ============ */
const sub = read("js/subtitle.js");
const toastBody = bodyOf(sub, "function toastMsg(msg, isHtml) {");
check("subtitle.js 的 toastMsg 能定位", !!toastBody);
check("toastMsg 默认走 esc，只有显式 isHtml 才按 HTML 渲染",
  !!toastBody && /isHtml\s*\?\s*msg\s*:\s*esc\(msg\)/.test(toastBody), toastBody ? toastBody.replace(/\s+/g, " ").slice(0, 70) : "");

/* ============ ③ index.html 的 CSP 与脚本形态 ============ */
const html = read("index.html");
const head = html.slice(0, html.indexOf("</head>"));
/* 注释不会执行，也常用来解释「不要再写内联脚本」，判据必须先剔除注释 */
const htmlNoComment = html.replace(/<!--[\s\S]*?-->/g, "");

/* 内联脚本只允许数据块（ld+json），其余一律禁止（CSP 不含 unsafe-inline 的前提） */
const inlineScripts = (htmlNoComment.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []);
const badInline = inlineScripts.filter(function (t) { return !/type="application\/ld\+json"/.test(t); });
check("index.html 没有可执行的内联 <script>（只留 ld+json 数据块）", badInline.length === 0, badInline.join(" "));
check("index.html 没有内联事件处理器（onclick / onerror / …）",
  !/\son[a-z]+\s*=\s*["']/.test(htmlNoComment.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "")));

const csp = (head.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
check("index.html 声明了 CSP", !!csp);
check("CSP 的 script-src 不含 'unsafe-inline'（否则注入的内联处理器仍会执行）",
  !!csp && !/script-src[^;]*'unsafe-inline'/.test(csp));
check("CSP 的 script-src 允许自身与外置 vendor 源", !!csp && /script-src[^;]*'self'/.test(csp) && /script-src[^;]*cdn\.jsdelivr\.net/.test(csp));
check("CSP 保留 wasm（音素 IPA / 离线识别需要）", !!csp && /'wasm-unsafe-eval'/.test(csp));

/* 脚本形态：全部 defer（解析后再按序执行），pwa-init 必须第一个、app.js 必须最后 */
const tags = [];
const reTag = /<script\s+src="([^"]+)"([^>]*)>/g;
let m;
while ((m = reTag.exec(html)) !== null) tags.push({ src: m[1], attrs: m[2] });
check("从 index.html 提取到脚本清单", tags.length >= 40, "n=" + tags.length);
const noDefer = tags.filter(function (t) { return !/\bdefer\b/.test(t.attrs); });
check("全部脚本都带 defer", noDefer.length === 0, noDefer.map(function (t) { return t.src; }).join(", "));
check("js/pwa-init.js 是第一个脚本（先装错误兜底）", tags.length > 0 && tags[0].src === "js/pwa-init.js", tags[0] && tags[0].src);
check("js/app.js 仍是最后一个脚本", tags[tags.length - 1] && tags[tags.length - 1].src === "js/app.js");

/* 启动兜底接线：骨架 + 就绪标记 */
check("index.html 内含启动骨架（加载中不白屏）", /id="bootFallback"/.test(html));
const appjs = read("js/app.js");
check("app.js 渲染成功后设置 window.FTE_BOOTED", /window\.FTE_BOOTED\s*=\s*true/.test(appjs));
const pwaInit = read("js/pwa-init.js");
check("pwa-init.js 依据 FTE_BOOTED 决定是否显示失败面板",
  /FTE_BOOTED/.test(pwaInit) && /showFailure/.test(pwaInit) && /addEventListener\("load"/.test(pwaInit));
check("pwa-init.js 里没有内联事件处理器（CSP 下会失效）", !/\son[a-z]+\s*=\s*["']/.test(pwaInit));

/* ============ ④ 存储注册表与代码里的键对账 ============ */
const SK = vm.createContext({ window: {} });
vm.runInContext(read("js/storage-keys.js"), SK, { filename: "js/storage-keys.js" });
const reg = SK.window.FTE_STORAGE;
check("js/storage-keys.js 暴露 window.FTE_STORAGE", !!(reg && Array.isArray(reg.keys)));

const regKeys = (reg.keys || []).map(function (k) { return k.key; });
const dup = regKeys.filter(function (k, i) { return regKeys.indexOf(k) !== i; });
check("注册表无重复键", dup.length === 0, dup.join(", "));
check("注册表规模与站点实际使用的键数量相符", regKeys.length >= 25, "n=" + regKeys.length);

/* 代码里出现的每个 "fte-*" 字面量都必须登记（否则新增存储键会静默漏出备份） */
const NON_STORAGE = ["fte-tutor", "fte-eval4-probe"]; // 前者是 UA 字符串，后者是 sessionStorage
const seen = {};
fs.readdirSync(path.join(ROOT, "js")).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
  const src = read("js/" + f);
  const re = /"fte-[a-z0-9\-]+"/g;
  let x;
  while ((x = re.exec(src)) !== null) seen[x[0].slice(1, -1)] = true;
});
const unregistered = Object.keys(seen).filter(function (k) {
  return regKeys.indexOf(k) === -1 && NON_STORAGE.indexOf(k) === -1;
});
check("代码里的每个 fte-* 存储键都已在注册表登记", unregistered.length === 0, unregistered.join(", "));

const secretKeys = reg.secretKeys || [];
check("凭据键被标记为不可备份",
  secretKeys.length > 0 && secretKeys.every(function (k) {
    const row = (reg.keys || []).filter(function (r) { return r.key === k; })[0];
    return row && row.backup === false;
  }), secretKeys.join(", "));
check("progress 里的 azureKey 被声明为敏感字段", !!(reg.secretFields && reg.secretFields["fte-progress-v1"] && reg.secretFields["fte-progress-v1"].indexOf("azureKey") !== -1));

/* ============ ⑤ 备份导出：真跑一遍，覆盖全部可备份键且不含凭据（行为验证） ============ */
const store = {};
let captured = null;
const elStub = { click: function () { }, setAttribute: function () { }, appendChild: function () { }, removeChild: function () { }, style: {} };
const sandbox = {
  console: console,
  setTimeout: function () { }, clearTimeout: function () { },
  localStorage: {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  },
  document: {
    addEventListener: function () { },
    getElementById: function () { return null; },
    createElement: function () { return elStub; },
    body: { appendChild: function () { }, removeChild: function () { } }
  },
  Blob: function (parts) { captured = parts.join(""); },
  URL: { createObjectURL: function () { return "blob:test"; }, revokeObjectURL: function () { } },
  FTE_DATA: { site: { name: "测试站" }, units: [{ id: 1 }] },
  ASRUtil: { toast: function () { } }
};
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(read("js/storage-keys.js"), ctx, { filename: "js/storage-keys.js" });
vm.runInContext(read("js/export.js"), ctx, { filename: "js/export.js" });

/* 造一份「什么键都有值」的存储，其中两个含凭据 */
const seed = {
  "fte-progress-v1": JSON.stringify({ learned: { a: 1, b: 2 }, flash: { a: {} }, wrong: {}, coach: { streak: 3, total: 3600 }, azureKey: "SECRET-AZURE-KEY", azureRegion: "eastasia" }),
  "fte-tutor-cfg": JSON.stringify({ apiKey: "SECRET-TUTOR-KEY", base: "https://api.deepseek.com" }),
  "fte-accent": "uk",
  "fte-subtitle-mode": "en",
  "fte-sop-v1": JSON.stringify({ checks: { s1: 1 } }),
  "fte-board-v1": JSON.stringify({ week: "x", tasks: [] }),
  "fte-writes-v1": JSON.stringify([{ title: "作品" }]),
  "fte-placement-v2": JSON.stringify({ baseline: { at: "2026-01-01" } })
};
Object.keys(seed).forEach(function (k) { store[k] = seed[k]; });

check("FTEExport 暴露 exportProgress", !!(ctx.window.FTEExport && ctx.window.FTEExport.exportProgress));
let pack = null;
try {
  ctx.window.FTEExport.exportProgress();
  pack = JSON.parse(captured);
} catch (e) { pack = null; }
check("导出真的产出了 JSON 备份", !!pack && !!pack.data);

if (pack) {
  const keys = Object.keys(pack.data);
  ["fte-progress-v1", "fte-accent", "fte-subtitle-mode", "fte-sop-v1", "fte-board-v1", "fte-writes-v1", "fte-placement-v2"]
    .forEach(function (k) {
      check("备份覆盖 " + k, keys.indexOf(k) !== -1);
    });
  check("裸字符串键按 __raw 原样保留（" + "uk）", pack.data["fte-accent"] && pack.data["fte-accent"].__raw === "uk");
  check("progress 中的 azureKey 未进入备份", !pack.data["fte-progress-v1"] || pack.data["fte-progress-v1"].azureKey === undefined);
  check("凭据键 fte-tutor-cfg 未进入备份", keys.indexOf("fte-tutor-cfg") === -1);
  check("备份文本里不出现任何凭据明文",
    captured.indexOf("SECRET-AZURE-KEY") === -1 && captured.indexOf("SECRET-TUTOR-KEY") === -1);
  check("备份声明了自己覆盖了多少类记录", typeof pack.keyCount === "number" && pack.keyCount >= 7, "keyCount=" + pack.keyCount);
}

/* 导入侧：不得把凭据写回 */
const exportSrc = read("js/export.js");
check("导入循环跳过凭据键", /!isSecretKey\(k\)/.test(exportSrc));
check("导入不把 azureKey 写回进度", /stripSecrets\(PROG_KEY,\s*merged\)/.test(exportSrc));
check("导出清单由注册表生成（不再手写 EXTRA_KEYS）", /window\.FTE_STORAGE/.test(exportSrc) && !/EXTRA_KEYS/.test(exportSrc));

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
