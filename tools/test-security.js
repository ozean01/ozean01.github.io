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
/* P0′ 起契约收紧为 isHtml === true（严格等于）：任何"真值"（对象/字符串/数字）一律按转义处理。
   由来：调用点曾把 info 对象当 isHtml 传 → 真值 → 词库命中分支走未转义 innerHTML（实测可注入）。 */
check("toastMsg 默认走 esc，只有 isHtml === true 才按 HTML 渲染",
  !!toastBody && /isHtml\s*===\s*true\s*\?\s*msg\s*:\s*esc\(msg\)/.test(toastBody), toastBody ? toastBody.replace(/\s+/g, " ").slice(0, 90) : "");
/* 三个已知的"可控字符串进 innerHTML"出口在 P0′ 里都补了转义，且做法必须在源码里可见，
   防止后续重构把它们改回去（渲染点级断言，与 js/export.js 的 sanitizeProgress 形成纵深）。 */
const writeJs = read("js/write.js");
const boardJs = read("js/board.js");
check("P0′：write.js 作品集的 wc 数字位走 esc", /esc\(String\(w\.wc\)\)/.test(writeJs));
check("P0′：write.js 的 indep.rate（title 属性位）走 esc", /esc\(String\(w\.indep\.rate\)\)/.test(writeJs));
check("P0′：board.js 的属性位转义 escAttr 存在且用于 t.href",
  /(function escAttr\(|escAttr\s*=\s*function\s*\()/.test(boardJs) && /escAttr\(t\.href\)/.test(boardJs));
check("P0′：app.js 的 toast 换行分支先转义再插 <br>", /t\.innerHTML\s*=\s*esc\(text\)\.replace\(\/\\n\/g,\s*"<br>"\)/.test(read("js/app.js")));
const exportJs = read("js/export.js");
check("P0′：js/export.js 具备字段级净化 sanitizeProgress", /function sanitizeProgress\(/.test(exportJs));
/* ▲ P0 第三批 · α 组（P0-08）改法 —— S11-N-3：原第 66-67 行只做**正则计数**
     `(exportJs.match(/sanitizeProgress\(stripSecrets\(/g) || []).length === 2`，
   于是"净化前缀写错 / 白名单整体不命中 / 净化被摘掉"时它仍可能全绿 ——
   它证明的只是"源码里出现过这个字样两次"，不是"导入的坏值真的被净化"。
   现在保留一条**结构下限**（字样必须还在），真正的判据放到 ⑥ 的**行为验证**：
   在 vm + localStorage 桩里真跑 importProgress，喂坏类型值，断言写盘产物已被净化。 */
check("P0′：导入写入路径在源码里确实调用了 sanitizeProgress(stripSecrets(...))（结构下限，行为见 ⑥）",
  (exportJs.match(/sanitizeProgress\(stripSecrets\(/g) || []).length >= 2,
  "n=" + (exportJs.match(/sanitizeProgress\(stripSecrets\(/g) || []).length);

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
/* ★ 第三/四轮真机定位与加固（2026-10-11 晚）：
   离线识别 vosk-browser 的 Kaldi 引擎原本跑在一个 **blob: Worker** 里，而 blob Worker
   **继承本文档的 CSP**；该 worker 内的 Emscripten 胶水要执行字符串形式的 JS。CSP 若不含
   'unsafe-eval'，worker 内部抛 EvalError，而上游库只等 "load" 事件、**不把 worker 的 error
   映射成 promise rejection** → `createModel()` 既不 resolve 也不 reject（真机实测 >120 秒）
   → 表现为"离线识别永远建不出来"。
   当时的止损是给 script-src 加 'unsafe-eval'；**最终解法**是把那段 worker 抽成**同源真实文件**
   `js/vendor/vosk-worker.js`（同源文件的 CSP 来自它自己的响应头，不继承文档）——
   实测同一份严格 CSP 下：blob 形态 EVAL-BLOCKED、同源文件形态 EVAL-OK。
   所以这里要反过来守：**script-src 不得再出现 'unsafe-eval'**，别"顺手加回来"。 */
check("CSP 的 script-src 不得含 'unsafe-eval'（离线识别已改为同源 worker 文件，不再需要它；见上方注释）",
  !!csp && !/script-src[^;]*'unsafe-eval'/.test(csp));
/* 守卫的第二半：既然不需要 eval，就必须确实在用同源 worker 文件（否则删掉 unsafe-eval 会让离线识别再次失效） */
const asrForCsp = read("js/asr-local.js");
check("离线识别必须走同源 worker 文件（js/vendor/vosk-worker.js），不得再依赖 blob Worker / dist/vosk.js",
  /WORKER_FILE = "js\/vendor\/vosk-worker\.js"/.test(asrForCsp) &&
  /new Worker\(WORKER_URL\)/.test(asrForCsp) &&
  !/createObjectURL/.test(asrForCsp) &&
  !/js\/vendor\/vosk\.js"/.test(asrForCsp));

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
const domListeners = {};
function FileReaderStub() { }
FileReaderStub.prototype.readAsText = function (file) {
  this.result = file && file._text;
  if (typeof this.onload === "function") this.onload();
};
const sandbox = {
  console: console,
  setTimeout: function () { }, clearTimeout: function () { },
  localStorage: {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  },
  document: {
    addEventListener: function (t, fn) { (domListeners[t] = domListeners[t] || []).push(fn); },
    getElementById: function () { return null; },
    createElement: function () { return elStub; },
    body: { appendChild: function () { }, removeChild: function () { } }
  },
  Blob: function (parts) { captured = parts.join(""); },
  URL: { createObjectURL: function () { return "blob:test"; }, revokeObjectURL: function () { } },
  FTE_DATA: { site: { name: "测试站" }, units: [{ id: 1 }] },
  ASRUtil: { toast: function () { } },
  /* ⑥ 行为验证用：走 export.js 真实的 importProgress 路径需要这三个桩 */
  FileReader: FileReaderStub,
  confirm: function () { return true; },
  location: { reload: function () { } }
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

/* ============ ⑥ 导入侧：真跑 importProgress，断言坏类型值真的被净化（行为验证）============
   ▲ P0 第三批 · α 组（P0-08）改法 —— S11-N-3（N-2 之所以没被拦下的直接原因）：
   原实现在这一节只做源码正则（/!isSecretKey\(k\)/、/stripSecrets\(PROG_KEY,\s*merged\)/），
   而上面 ⑤ 的导出侧却是真跑 —— 导入侧是整条备份链路里**唯一没有行为门禁**的一段，
   偏偏它也是当时唯一还带着真缺陷的一段（S11-N-2：净化 prefix 错位使白名单在部分键上永不命中）。
   现在复用同一个 vm + localStorage 桩，通过 export.js 自己注册的 change 监听器，
   喂一份**被篡改过的备份 JSON**，再断言写盘产物：
     · 数字位（coach.streak / writes[].wc / tasks[].min）里的字符串必须被净化为 0；
     · URL 位（tasks[].href）里的坏值必须被净化为 "#"；
     · str 文本位按契约原样保留（渲染层另走 esc），证明净化没有"一刀切"误伤；
     · 布尔位 learned.* 保留 true/false（历史事故：被当数字吃成 0 → 进度看起来全丢）；
     · 凭据键/字段（fte-tutor-cfg / progress.azureKey）不得被写回。
   验收：把 export.js 的净化故意摘掉（writeOne 或进度键写入路径），本节必须变红。 */
const BAD = '<img src=x onerror=alert(1)>';
const BAD_SECRET = "SECRET-AZURE-KEY";
const BAD_TUTOR = "SECRET-TUTOR-KEY";

Object.keys(store).forEach(function (k) { delete store[k]; });
/* 先放一份"当前进度"进去，让导入走**合并分支**（mergeObject）而不是直通分支 */
store["fte-progress-v1"] = JSON.stringify({
  schema: 1, learned: { c: true }, coach: { streak: 5, today: 60, total: 3600 }, azureKey: BAD_SECRET
});

const evilPack = {
  _tag: "soft-packaging-fte",
  _version: 1,
  exportedAt: "2026-01-01T00:00:00.000Z",
  data: {}
};
evilPack.data["fte-progress-v1"] = {
  schema: 99,
  learned: { a: true, b: false },
  coach: { streak: BAD, today: BAD, total: BAD },
  writes: [{ t: 1, wc: BAD, rate1: BAD, text: BAD }],
  azureKey: BAD_SECRET,
  azureRegion: "eastasia"
};
evilPack.data["fte-board-v1"] = {
  week: "2026-W01",
  tasks: [{ id: "a", title: "正常标题", href: BAD, min: BAD, status: "todo", due: "2026-01-02" }]
};
evilPack.data["fte-tutor-cfg"] = { apiKey: BAD_TUTOR };
evilPack.data["fte-sop-v1"] = { checks: { s1: 1 } };

const changeHandlers = domListeners["change"] || [];
check("⑥ 行为验证：export.js 注册了 change 监听（导入入口存在）", changeHandlers.length > 0,
  "n=" + changeHandlers.length);

let importThrew = null;
try {
  changeHandlers.forEach(function (fn) {
    fn({ target: { id: "dataImportFile", files: [{ _text: JSON.stringify(evilPack) }] } });
  });
} catch (e) { importThrew = e; }
check("⑥ 行为验证：importProgress 在 vm 沙箱里真跑完（不抛错）",
  !importThrew, importThrew ? String(importThrew && importThrew.message) : "");

let imported = null;
try { imported = JSON.parse(store["fte-progress-v1"]); } catch (e) { imported = null; }
check("⑥ 行为验证：导入真的写回了 fte-progress-v1", !!imported);
if (imported) {
  check("⑥ 进度键：坏类型 coach.streak（字符串）被净化成 0",
    !!(imported.coach) && imported.coach.streak === 0, "coach=" + JSON.stringify(imported.coach));
  check("⑥ 进度键：坏类型 coach.today / coach.total 被净化成 0",
    !!(imported.coach) && imported.coach.today === 0 && imported.coach.total === 0);
  check("⑥ 进度键：坏类型 writes[0].wc / rate1 被净化成 0",
    Array.isArray(imported.writes) && imported.writes[0] &&
    imported.writes[0].wc === 0 && imported.writes[0].rate1 === 0,
    "writes=" + JSON.stringify(imported.writes));
  check("⑥ 进度键：str 文本位 writes[0].text 原样保留（净化只做类型收窄，不误伤文本）",
    Array.isArray(imported.writes) && imported.writes[0] && imported.writes[0].text === BAD);
  check("⑥ 进度键：布尔位 learned.* 保留 true/false（不得被当数字吃成 0）",
    !!(imported.learned) && imported.learned.a === true && imported.learned.b === false && imported.learned.c === true,
    "learned=" + JSON.stringify(imported.learned));
  check("⑥ 进度键：导入不把 azureKey 写回（字段级凭据剥离）",
    imported.azureKey === undefined);
}

let board = null;
try { board = JSON.parse(store["fte-board-v1"]); } catch (e) { board = null; }
check("⑥ 独立键：fte-board-v1 真的被写回（restKeys → writeOne 路径）", !!board);
if (board) {
  const task = (board.tasks || [])[0] || {};
  check("⑥ 独立键：URL 位 t.href 的坏值被净化成 \"#\"（白名单前缀命中）",
    task.href === "#", "href=" + JSON.stringify(task.href));
  check("⑥ 独立键：数字位 t.min 的坏值被净化成 0", task.min === 0, "min=" + JSON.stringify(task.min));
  check("⑥ 独立键：文本位 t.title 原样保留（没被净化误伤）", task.title === "正常标题");
}

check("⑥ 导入侧：凭据键 fte-tutor-cfg 不被写回 localStorage", store["fte-tutor-cfg"] === undefined);
check("⑥ 导入侧：凭据明文没有落进任何写回的键",
  JSON.stringify(store).indexOf(BAD_SECRET) === -1 && JSON.stringify(store).indexOf(BAD_TUTOR) === -1);
check("⑥ 导入侧：数字位 / URL 位上都不再是注入串",
  [imported && imported.coach && imported.coach.streak,
   imported && imported.writes && imported.writes[0] && imported.writes[0].wc,
   imported && imported.writes && imported.writes[0] && imported.writes[0].rate1,
   board && board.tasks && board.tasks[0] && board.tasks[0].href,
   board && board.tasks && board.tasks[0] && board.tasks[0].min
  ].every(function (v) { return typeof v === "number" || v === "#"; }));

/* 结构下限（保留）：导入循环仍必须跳过凭据键、仍必须由注册表生成导出清单 */
const exportSrc = read("js/export.js");
check("导入循环跳过凭据键（结构）", /!isSecretKey\(k\)/.test(exportSrc));
check("导入不把 azureKey 写回进度（结构）", /stripSecrets\(PROG_KEY,\s*merged\)/.test(exportSrc));
check("导出清单由注册表生成（不再手写 EXTRA_KEYS）", /window\.FTE_STORAGE/.test(exportSrc) && !/EXTRA_KEYS/.test(exportSrc));

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
