#!/usr/bin/env node
/* 未转义注入点复现 / 回归门禁（源自安全审计 A5，已并入权威源码与 npm test）。
   目的：验证「用户可控 / 导入备份可控的字符串 → innerHTML」是否存在真实未转义注入点，
   并在第一阶段补丁（P0′）之后**防止这些出口被改回去**。

   载入方式与 tools/test-boot.js 完全一致：按 index.html 真实脚本顺序在同一个 vm 里跑，
   因而走的是**真实渲染路径**（app.js renderRoute → 各模块 render()），不是 grep 源码。

   判据：命中数 0 → exit 0（门禁通过）；任一出口未转义 → exit 2。
   跑法（在 外贸英语/ 目录下）：node tools/x-repro-injection.js
   说明：本文件**就在权威源码里**，并已登记进 tools/test-all.js（gate: true）。
        需要做破坏性实验时，请复制到临时目录再改。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function fakeEl() {
  const el = {
    innerHTML: "", textContent: "", value: "", hidden: false, checked: false, disabled: false,
    style: {}, dataset: {}, children: [], childNodes: [], parentNode: null,
    offsetWidth: 0, offsetHeight: 0, width: 0, height: 0, tagName: "DIV",
    classList: { add: function () { }, remove: function () { }, toggle: function () { }, contains: function () { return false; } },
    setAttribute: function () { }, getAttribute: function () { return null; },
    removeAttribute: function () { }, hasAttribute: function () { return false; },
    addEventListener: function () { }, removeEventListener: function () { },
    appendChild: function (c) { return c; }, removeChild: function (c) { return c; },
    insertBefore: function (c) { return c; }, insertAdjacentHTML: function () { },
    insertAdjacentElement: function (p, c) { return c; },
    append: function () { }, prepend: function () { }, after: function () { }, before: function () { },
    replaceChildren: function () { }, replaceWith: function () { },
    setAttributeNS: function () { }, getAttributeNS: function () { return null; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    closest: function () { return null; }, matches: function () { return false; },
    focus: function () { }, blur: function () { }, click: function () { }, scrollIntoView: function () { },
    getBoundingClientRect: function () { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; },
    getContext: function () { return null; }, toDataURL: function () { return ""; },
    play: function () { return Promise.resolve(); }, pause: function () { }, load: function () { },
    remove: function () { }, cloneNode: function () { return fakeEl(); }
  };
  return el;
}
const elCache = {};
function getEl(id) { if (!elCache[id]) elCache[id] = fakeEl(id); return elCache[id]; }
const winListeners = {};
const documentStub = {
  getElementById: getEl,
  createElement: function () { return fakeEl(); },
  createElementNS: function () { return fakeEl(); },
  createDocumentFragment: function () { return fakeEl(); },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  addEventListener: function () { }, removeEventListener: function () { },
  body: fakeEl(), head: fakeEl(), documentElement: fakeEl(),
  cookie: "", readyState: "complete", title: ""
};
function makeStorage() {
  return {
    _d: {},
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem: function (k, v) { this._d[k] = String(v); },
    removeItem: function (k) { delete this._d[k]; },
    clear: function () { this._d = {}; },
    key: function () { return null; },
    get length() { return Object.keys(this._d).length; }
  };
}
const sandbox = {
  console: console,
  addEventListener: function (t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
  removeEventListener: function () { },
  dispatchEvent: function (type) { (winListeners[type] || []).forEach(function (fn) { fn({ type: type }); }); return true; },
  scrollTo: function () { }, scrollBy: function () { }, scroll: function () { },
  getComputedStyle: function () { return {}; },
  matchMedia: function () { return { matches: false, addEventListener: function () { } }; },
  document: documentStub,
  localStorage: makeStorage(),
  sessionStorage: makeStorage(),
  location: { hash: "", href: "http://localhost/", protocol: "http:", origin: "http://localhost", reload: function () { }, replace: function () { } },
  history: { replaceState: function () { }, pushState: function () { } },
  navigator: { userAgent: "node", clipboard: null, mediaDevices: null, serviceWorker: null, language: "zh-CN" },
  screen: { width: 1280, height: 800 },
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: setInterval, clearInterval: clearInterval,
  requestAnimationFrame: function (fn) { return setTimeout(fn, 0); },
  cancelAnimationFrame: clearTimeout,
  fetch: function () { return Promise.reject(new Error("no network in test")); },
  Image: function () { return fakeEl(); },
  Audio: function () { return fakeEl(); },
  AudioContext: function () { return { createAnalyser: function () { return {}; }, close: function () { } }; },
  SpeechSynthesisUtterance: function () { return {}; },
  speechSynthesis: { speak: function () { }, cancel: function () { }, getVoices: function () { return []; }, addEventListener: function () { } },
  alert: function () { }, confirm: function () { return false; }, prompt: function () { return null; },
  URL: URL, Blob: function () { }, FileReader: function () { return { readAsText: function () { } }; },
  XMLHttpRequest: function () { return { open: function () { }, send: function () { }, setRequestHeader: function () { } }; }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
const ctx = vm.createContext(sandbox);

const scripts = [];
const re = /<script\s+src="(js\/[^"]+)"/g;
let m;
while ((m = re.exec(html)) !== null) scripts.push(m[1]);
const loadFail = [];
/* app.js 必须在最后加载：它在加载期就会渲染一次 #/today。
   为了让「污染过的 localStorage 被读到」这一场景真实成立，
   先把 app.js 之前的所有脚本载入，留一个 preSeed 钩子，再载入 app.js。 */
let preSeed = function () { };
/* 看板任务在上一次渲染时会被模块内 st.tasks 记忆化，事后改 localStorage 不生效；
   故「导入被污染的备份」这一时序必须在 app.js 首次渲染之前注入。 */
const _d0 = new Date();
const _start0 = new Date(_d0.getFullYear(), 0, 1);
const _w0 = Math.ceil(((_d0 - _start0) / 86400000 + _start0.getDay() + 1) / 7);
const BOARD_WEEK = _d0.getFullYear() + "-W" + _w0;
const PAY = '<img src=x onerror=alert(1)>';
const PAY_ATTR = '"><svg onload=alert(1)>';
preSeed = function () {
  ctx.localStorage.setItem("fte-board-v1", JSON.stringify({
    week: BOARD_WEEK, tasks: [{ id: "a", title: "正常标题", href: 'x" ' + PAY, status: "todo", min: 5 }]
  }));
};
scripts.forEach(function (rel) {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) { loadFail.push(rel + " 缺失"); return; }
  if (rel === "js/app.js") preSeed();
  try { vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: rel }); }
  catch (e) { loadFail.push(rel + " → " + (e && e.message)); }
});
console.log("脚本加载：" + (scripts.length - loadFail.length) + "/" + scripts.length +
  (loadFail.length ? "  失败：" + loadFail.join("; ") : ""));

function renderPage(hash) {
  ctx.location.hash = hash;
  ctx.dispatchEvent("hashchange");
  return getEl("app").innerHTML || "";
}
function resetStorage() { ctx.localStorage._d = {}; ctx.sessionStorage._d = {}; }

let hits = 0;
function report(name, out, needle, where) {
  const hit = out.indexOf(needle) !== -1;
  console.log((hit ? "🔴 注入成功 " : "✅ 已挡住   ") + name + "  [" + where + "]");
  if (hit) {
    hits++;
    const i = out.indexOf(needle);
    console.log("     原始渲染片段: " + out.slice(Math.max(0, i - 90), i + needle.length + 30).replace(/\s+/g, " "));
  }
}

/* ---------- ① js/write.js 作品集：wc 字段（备份 JSON 可控，未转义） ---------- */
resetStorage();
ctx.localStorage.setItem("fte-writes-v1", JSON.stringify([
  { t: 1, scen: "cold", title: "正常标题", text: "hi", wc: PAY }
]));
let out = renderPage("#/write");
report("write.js 作品集 wc 字段 → innerHTML", out, PAY, "js/write.js:386");

/* ---------- ② js/write.js 作品集：indep.rate 落进 title 属性（属性逃逸） ---------- */
resetStorage();
ctx.localStorage.setItem("fte-writes-v1", JSON.stringify([
  { t: 1, scen: "cold", title: "正常标题", text: "hi", wc: 3,
    indep: { at: 1, text: "x", wc: 3, rate: PAY_ATTR } }
]));
out = renderPage("#/write");
report("write.js 作品集 indep.rate → title 属性逃逸", out, PAY_ATTR, "js/write.js:390");

/* ---------- ③ js/app.js toast()：含换行即走 innerHTML（注释声称内部固定文本） ---------- */
resetStorage();
getEl("toast").innerHTML = "";
const toastText = "⚠️ 接口返回 500：<img src=x onerror=alert(1)>\n第二行（服务商返回的 error.message）";
ctx.window.FTE_BOOT.toast(toastText);
report("app.js toast() 换行分支 → innerHTML", getEl("toast").innerHTML, PAY, "js/app.js:447（调用点 js/tutor.js:1321-1324）");

/* ---------- ④ js/board.js 本周只读区：t.href 未转义（备份 JSON 可控） ---------- */
resetStorage();
ctx.localStorage.setItem("fte-board-v1", JSON.stringify({
  week: BOARD_WEEK, tasks: [{ id: "a", title: "正常标题", href: 'x" ' + PAY, status: "todo", min: 5 }]
}));
out = renderPage("#/today");
report("board.js 本周任务 href 未转义 → #/today", out, PAY, "js/board.js:259（渲染于 today.js:427）");
console.log("     （若上面未命中：见脚本开头 preSeed 说明——本周区在 app.js 首渲染时已记忆化；" +
  "静态阅读 js/board.js:259 的 href=\"' + t.href + '\" 未走 esc，属于同一类未转义出口）");

/* ---------- ⑤ subtitle.js toastMsg：转义极性反了（本需 HTML 的分支被转义，不需 HTML 的分支未转义） ---------- */
(function () {
  const src = fs.readFileSync(path.join(ROOT, "js", "subtitle.js"), "utf8");
  const header = "function toastMsg(msg, isHtml) {";
  const i = src.indexOf(header);
  if (i === -1) { console.log("⚠️ 未能定位 toastMsg"); return; }
  let depth = 0, start = src.indexOf("{", i), end = -1;
  for (let k = start; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") { depth--; if (depth === 0) { end = k; break; } }
  }
  const body = src.slice(start + 1, end);
  const box = { innerHTML: "", hidden: true, classList: { remove: function () { }, add: function () { } }, offsetWidth: 0 };
  const esc = function (s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };
  const f = new Function("msg", "isHtml", "document", "setTimeout", "clearTimeout", "esc",
    "let toastTimer = null;\n" + body);
  f(PAY, { cn: "释义" }, { getElementById: function () { return box; } }, function () { }, function () { }, esc);
  console.log((box.innerHTML.indexOf(PAY) !== -1 ? "🔴 未转义 " : "✅ 已转义 ") +
    "subtitle.js toastMsg(msg, 真值) —— 词库命中分支走 innerHTML  [js/subtitle.js:869 + :876-879]");
  if (box.innerHTML.indexOf(PAY) !== -1) {
    hits++;
    console.log("     实际 innerHTML: " + box.innerHTML.slice(0, 80));
  }
  box.innerHTML = "";
  /* F-13：这里必须传**真实调用点的签名**（js/subtitle.js:875 `false`、:878 `true`）。
     此前传的是 `null` —— 产品里不存在这种调用；而在 `isHtml === true` 的收紧契约下，
     它会走转义分支、把 #/units 链接显示成纯文本，于是每次都打印一条**误导性 ⚠️**
     （让人以为"链接坏了"，其实真实路径正常）。这里分别验证两种真实分支。 */
  const withLink = "其余：可到 <a href='#/units'>单元词汇</a> 找同源词";
  f(withLink, true, { getElementById: function () { return box; } }, function () { }, function () { }, esc);
  console.log((box.innerHTML.indexOf("<a href='#/units'>") === -1
    ? "🔴 未命中分支的链接没渲染出来: " : "✅ 未命中分支按 HTML 渲染（链接正常）: ") + box.innerHTML.slice(0, 60));
  box.innerHTML = "";
  f("<img src=x onerror=alert(1)>", false, { getElementById: function () { return box; } }, function () { }, function () { }, esc);
  console.log((box.innerHTML.indexOf("<img") === -1
    ? "✅ 词库命中分支走转义（isHtml=false）: " : "🔴 词库命中分支未转义: ") + box.innerHTML.slice(0, 60));
})();

console.log("\n结论：未转义注入点命中 " + hits + " 处。");
console.log("注：本脚本只证明「可控字符串未经转义进入了 innerHTML」；是否真的执行脚本取决于浏览器 CSP" +
  "（本页 CSP 无 script-src 'unsafe-inline'，内联 onerror/onload 会被拦下）。");
process.exit(hits > 0 ? 2 : 0);
