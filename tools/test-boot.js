#!/usr/bin/env node
/* 验收测试：启动完整性（boot smoke test）。
   零构建站点没有模块系统兜底——37 个 <script> 靠加载顺序共享全局。任何一处
   **加载期抛错**（TDZ、引用了尚未声明的 const、缺依赖、顺序错）都会让某个功能静默坏掉，
   而浏览器里只有打开对应页面才看得见。

   本测试按 index.html 的**真实脚本顺序**在同一个 vm 上下文里逐个执行它们，
   然后核对 app.js 自己声明的启动校验清单（_need(...)）是否全部就绪。

   由来：js/phonemes.js 与 js/urgent.js 先后踩过同一个坑——把测试钩子 `_t` 写在
   文件开头，引用了后面才声明的 const，触发 TDZ 导致**整模块加载即抛错**。
   人工评审没能拦住第二次，所以把它变成机器检查。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

/* ---------------- 拼一个「够宽」的假 DOM ----------------
   目的不是模拟浏览器，而是让模块能在加载期跑完不炸。所以元素一律返回对象而非 null，
   集合一律返回 []，避免被测代码在 null 上取属性。 */
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
const documentStub = {
  getElementById: function () { return fakeEl(); },
  createElement: function () { return fakeEl(); },
  createElementNS: function () { return fakeEl(); },
  createDocumentFragment: function () { return fakeEl(); },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  addEventListener: function () { }, removeEventListener: function () { },
  body: fakeEl(), head: fakeEl(), documentElement: fakeEl(),
  cookie: "", readyState: "complete", title: ""
};
const storageStub = {
  _d: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; },
  clear: function () { this._d = {}; },
  key: function () { return null; },
  get length() { return Object.keys(this._d).length; }
};

const sandbox = {
  console: console,
  /* 模块会直接调 window.addEventListener（如 eval4.js / app.js 绑定 hashchange），
     假 DOM 必须提供，否则会把"stub 缺方法"误报成"模块加载失败" */
  addEventListener: function () { }, removeEventListener: function () { },
  dispatchEvent: function () { return true; },
  scrollTo: function () { }, scrollBy: function () { }, scroll: function () { },
  getComputedStyle: function () { return {}; },
  matchMedia: function () { return { matches: false, addEventListener: function () { } }; },
  document: documentStub,
  localStorage: storageStub,
  sessionStorage: Object.assign({}, storageStub, { _d: {} }),
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
  XMLHttpRequest: function () { return { open: function () { }, send: function () { }, setRequestHeader: function () { } }; },
  getComputedStyle: function () { return {}; },
  matchMedia: function () { return { matches: false, addEventListener: function () { } }; }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
const ctx = vm.createContext(sandbox);

/* ---------------- 按 index.html 的真实顺序执行 ---------------- */
const scripts = [];
const re = /<script\s+src="(js\/[^"]+)"/g;
let m;
while ((m = re.exec(html)) !== null) scripts.push(m[1]);
check("从 index.html 提取到脚本清单", scripts.length >= 30, "n=" + scripts.length);

const failures = [];
scripts.forEach(function (rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { failures.push(rel + "（文件不存在）"); return; }
  try {
    vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: rel });
  } catch (e) {
    failures.push(rel + " → " + (e && e.message ? e.message : String(e)));
  }
});
check("全部脚本都能在加载期跑通（无 TDZ / 顺序错 / 缺失依赖）", failures.length === 0,
  failures.length ? "\n      " + failures.join("\n      ") : "");

/* ---------------- 核对 app.js 自己声明的启动校验清单 ---------------- */
const appjs = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
const needList = [];
const reNeed = /_need\("([^"]+)",\s*(?:typeof [^\n]*?!==\s*"undefined"[^)]*|!!window\.([A-Za-z_$][\w$]*)|([^)]*))\)/g;
let n;
while ((n = reNeed.exec(appjs)) !== null) {
  const g = n[2];
  if (g) needList.push({ label: n[1], global: g });
}
check("从 app.js 提取到启动校验清单", needList.length >= 15, "n=" + needList.length);

const missingGlobals = needList.filter(function (x) { return typeof ctx.window[x.global] === "undefined"; });
check("启动校验清单里的每个模块全局都已就绪",
  missingGlobals.length === 0,
  missingGlobals.map(function (x) { return x.label + "(" + x.global + ")"; }).join(", "));

console.log("\n  已就绪模块（" + (needList.length - missingGlobals.length) + "/" + needList.length + "）：" +
  needList.map(function (x) { return x.global; }).join(", "));

/* ---------------- 为什么不另做「_t 位置」静态检查 ----------------
   曾试过一条静态断言：要求 `window.X._t = ...` 出现在本文件最后一个顶层 const/let 之后。
   它被废弃，因为两头都不可靠：
     · 假阴性：正则写的是 ^(?:const|let)，只匹配【顶格】声明；而真实模块的 const 全部
       缩进在 IIFE 里 —— 这条断言从未真正生效过（它通过不是因为代码对，是因为检测不到）。
     · 假阳性：js/mysay.js 的 _t 确实写在文件开头，但它只引用【函数声明】（会提升），
       没有任何 TDZ 风险，静态规则无从判断。
   结论：与其猜，不如跑。上面「按 index.html 真实顺序执行全部脚本」这一步会真正执行代码，
   任何加载期抛错（TDZ / 顺序 / 缺依赖）都会当场暴露。已实测验证：把 js/urgent.js 的 _t
   挪到 const SCENES 之前，本测试即报 "Cannot access 'SCENES' before initialization"。 */

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
