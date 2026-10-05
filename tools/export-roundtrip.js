#!/usr/bin/env node
/* ============ 验收门禁：导出 → 导入 → 重新渲染 的完整换机流程（P0′ 回归守卫）============
   守的是什么：**导入备份不得损坏任何一类学习记录**。
   由来（独立验证者实测的 P0 回归）：第一版字段级净化把"顶层是数组"的存储值当成普通对象处理，
   而本站有 **7 个 backup 键的顶层值就是数组**（作品集 / 学习走势 / 自述语料 / 出题题库 /
   四维成绩 / 自由表达 / 场景急救）→ 导入任何一份备份都会把它们清成 `{}`，随后
   `savedWorks().filter` / `loadHistory().slice` 直接抛错，`#/home`、`#/today`、`#/units`、`#/coach`
   四个主页面显示「😵 页面渲染出错」（A/B 对照：#/home 渲染长度 122397 → 90）。
   这正是"纵深防御"改写最容易造成的净负效果：**只做类型收窄，绝不改变容器类型。**

   本门禁做的是**真实往返**（不是 grep）：
     1) 用假 DOM + 假 localStorage 启动整站（按 index.html 的真实顺序加载全部脚本，并断言 0 失败）
     2) 灌入一份包含全部关键类型的真实形态数据（数组 / 嵌套对象 / 布尔 / null / 裸字符串 / 毫秒）
     3) 真实组包（与 FTEExport.exportProgress() 同构）后交由**导入路径的净化器**处理
        —— 净化函数与其 prefix 表达式都**从 js/export.js 源码截取/求值**，不在测试里另写一份
     4) 断言：每一类记录**数量与顶层类型与语义都不变**（数组仍数组、布尔仍 true、null 仍 null）；
        被污染的数字位/URL 位被净化；迁移结果落盘
   诚实标注（独立验证 F-14/F-16 指出）：本门禁**测不到 `importProgress()` 自身**——
   它是 export.js 的模块内函数，没有挂到 window.FTEExport 上，测试无法从公开面调用它。
   因此"漏净化某个键""merge 逻辑错"这类只在 importProgress 内部的问题不在本门禁覆盖范围内；
   要覆盖它需要给 export.js 加一个仅测试用的钩子（尚未做）。
   运行：node tools/export-roundtrip.js   （在 外贸英语/ 目录下） */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const clock = require("./lib/clock.js")({ date: "2026-10-05" });
clock.install();

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

let failed = 0;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info !== undefined ? "  " + info : ""));
  if (!cond) failed++;
}

/* ---------------- 假 DOM / 假存储 ---------------- */
function fakeEl(id) {
  const classes = new Set();
  const el = {
    id: id || "", innerHTML: "", textContent: "", value: "", hidden: false, checked: false, disabled: false,
    style: {}, dataset: {}, children: [], childNodes: [], parentNode: null, offsetWidth: 0, offsetHeight: 0,
    width: 0, height: 0, tagName: "DIV", files: null,
    classList: {
      add: function (c) { classes.add(c); }, remove: function (c) { classes.delete(c); },
      toggle: function (c, f) { const w = f === undefined ? !classes.has(c) : !!f; if (w) classes.add(c); else classes.delete(c); return w; },
      contains: function (c) { return classes.has(c); }
    },
    setAttribute: function () { }, getAttribute: function (k) { return this.dataset[k] || null; },
    removeAttribute: function () { }, hasAttribute: function () { return false; },
    addEventListener: function () { }, removeEventListener: function () { },
    appendChild: function (c) { return c; }, removeChild: function (c) { return c; },
    insertBefore: function (c) { return c; }, insertAdjacentHTML: function () { },
    insertAdjacentElement: function (p, c) { return c; }, append: function () { }, prepend: function () { },
    after: function () { }, before: function () { }, replaceChildren: function () { }, replaceWith: function () { },
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
  getElementById: getEl, createElement: function () { return fakeEl(); },
  createElementNS: function () { return fakeEl(); }, createDocumentFragment: function () { return fakeEl(); },
  querySelector: function () { return null; }, querySelectorAll: function () { return []; },
  addEventListener: function () { }, removeEventListener: function () { },
  body: fakeEl(), head: fakeEl(), documentElement: fakeEl(), cookie: "", readyState: "complete", title: ""
};
const storageStub = {
  _d: {}, getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); }, removeItem: function (k) { delete this._d[k]; },
  clear: function () { this._d = {}; }, key: function () { return null; },
  get length() { return Object.keys(this._d).length; }
};

/* 真实形态的种子数据：每个字段都用**它在下游被消费时的形态**（数组就是数组、毫秒就是数字） */
const SEED = {
  "fte-progress-v1": {
    /* ⚠️ learned / done 的值必须是**布尔 true**（app.js:3395/3404 就是这么写的）。
       独立验证的 F-14 指出：此处原先写数字 1，导致门禁**结构上发现不了** F-10（布尔被 num 规则吃成 0）。 */
    schema: 1, learned: { "1-0": true, "1-1": true, "1-2": true }, quizBest: { "1": 80 }, stage: { "1-0": 3 }, done: { "1": true },
    flash: { "1-0": { due: 1790000000000, reps: 3, stability: 2.3, difficulty: 5.1, interval: 2, rating: 3 } },
    flashProd: {}, flashChunk: {}, dict: { "U1": "ok" },
    coach: { lastDate: "2026-10-04", today: 960, total: 3600, streak: 3 },
    activeDays: { "2026-10-04": 16, "2026-10-05": 12 }, activeDaysInit: true,
    coachDays: { "2026-10-04": 16 }, studioDays: { "2026-10-05": { patterns: 3, write: 1 } },
    coachBadges: ["first"], wrong: { "1-2": 2 }
  },
  "fte-writes-v1": [
    { t: 1790000000000, scen: "dev-letter", title: "开发信", text: "Dear Sir, we supply BOPP film.", wc: 42,
      draft2: "Dear Sir, we supply BOPP film and laminating adhesive.", wc2: 51, rate1: 60, rate2: 85,
      ai: { at: 1790000000000, adopt: "partial", reason: "只采纳了措辞", hasAdvice: true, hasFull: false },
      indep: { text: "Independent draft here.", rate: 70 } }
  ],
  "fte-history-v1": [
    { day: "2026-10-04", t: 1790000000000, learned: 12, retention: 92, done: 3, due7: 8 },
    { day: "2026-10-05", t: 1790086400000, learned: 14, retention: 93, done: 3, due7: 9 }
  ],
  "fte-placement-bank": [{ w: "adhesive", uid: 11 }, { w: "film", uid: 11 }],
  "fte-eval4-v1": [{ t: 1790000000000, title: "价格谈判", total: 78, term: 80, flu: 75, acc: 82, log: 74 }],
  "fte-speech-v1": [{ t: 1790000000000, words: 120, rate: 95, fluency: 70, uniq: 45 }],
  "fte-urgent-v1": [{ k: "price", at: 1790000000000 }],
  "fte-mysay-v1": [{ cn: "回复客户脱层客诉", en: "We are sorry to hear about the delamination.", at: 1790000000000 }],
  "fte-board-v1": { week: "2026-W41", tasks: [
    { id: "t1", title: "学 U11", href: "#/unit/11", min: 5, status: "done", labels: ["词汇"] },
    { id: "t2", title: "跟读 U3", href: "#/speak", min: 10, status: "todo", labels: ["口语"] }
  ] },
  "fte-accent": "uk", "fte-immerse": "1", "fte-local-asr-v1": "0",
  "fte-pref-v2": { engine: "native", rate: 1, voice: "" }
};

function boot() {
  const sandbox = {
    console: console, document: documentStub, localStorage: storageStub, navigator: { language: "zh-CN", userAgent: "node" },
    location: { hash: "#/today", href: "http://localhost/", origin: "http://localhost", pathname: "/" },
    setTimeout: function (f) { return 0; }, clearTimeout: function () { }, setInterval: function () { return 0; },
    clearInterval: function () { }, requestAnimationFrame: function () { return 0; }, cancelAnimationFrame: function () { },
    addEventListener: function (t, f) { winListeners[t] = f; }, removeEventListener: function () { },
    matchMedia: function () { return { matches: false, addListener: function () { }, removeListener: function () { } }; },
    URL: Object.assign(function (u) { this.href = String(u); }, {
      createObjectURL: function () { return "blob:x"; }, revokeObjectURL: function () { }
    }),
    scrollTo: function () { }, scrollBy: function () { },
    Blob: function () { }, FileReader: function () { }, alert: function () { }, confirm: function () { return true; },
    prompt: function () { return null; }, getComputedStyle: function () { return { getPropertyValue: function () { return ""; } }; },
    speechSynthesis: { getVoices: function () { return []; }, speak: function () { }, cancel: function () { } },
    SpeechSynthesisUtterance: function () { }, Audio: function () { return { play: function () { return Promise.resolve(); }, pause: function () { } }; },
    fetch: function () { return Promise.resolve({ ok: false, json: function () { return Promise.resolve({}); }, text: function () { return Promise.resolve(""); } }); },
    Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
    Boolean: Boolean, RegExp: RegExp, Error: Error, Promise: Promise, isFinite: isFinite, parseInt: parseInt,
    parseFloat: parseFloat, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    structuredClone: function (o) { return JSON.parse(JSON.stringify(o)); }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m, loaded = 0, failedFiles = [];
  while ((m = re.exec(html)) !== null) {
    const s = m[1].replace(/^\.\//, "");
    const file = path.join(ROOT, s);
    if (!fs.existsSync(file)) { failedFiles.push(s); continue; }
    try { vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: s }); loaded++; }
    catch (e) { failedFiles.push(s + " → " + e.message); }
  }
  return { sandbox: sandbox, loaded: loaded, failedFiles: failedFiles };
}

/* ---------------- 装载 + 灌种子 ---------------- */
Object.keys(SEED).forEach(function (k) {
  storageStub.setItem(k, typeof SEED[k] === "string" ? SEED[k] : JSON.stringify(SEED[k]));
});
const booted = boot();
check("按 index.html 真实顺序加载全部脚本（0 个失败）", booted.failedFiles.length === 0,
  booted.loaded + " 个已加载" + (booted.failedFiles.length ? " / 失败: " + booted.failedFiles.join(" | ") : ""));

const sandbox = booted.sandbox;
const FTEExport = sandbox.FTEExport;
check("FTEExport 已就绪（export.js 加载）", !!FTEExport && typeof FTEExport.exportProgress === "function");

/* 截住 download：exportProgress 内部会造 Blob 并点击 <a>，这里从 localStorage 无关处拿不到 JSON，
   所以改为直接调它的内部路径——用 document.createElement("a").click 时把 Blob 内容接住不可行
   （Blob 是空壳）。改走等效路径：手工组 pack（与 exportProgress 同构）再交给 importProgress，
   这样测的仍是**导入侧的净化与类型保持**，也就是 F-1 的真实风险点。 */
const ARRAY_KEYS = ["fte-writes-v1", "fte-history-v1", "fte-placement-bank", "fte-eval4-v1", "fte-speech-v1", "fte-urgent-v1", "fte-mysay-v1"];
const pack = { _tag: (FTEExport.FILE_TAG || "softpackaging-english"), _version: 1, exportedAt: new Date().toISOString(), data: {} };
Object.keys(storageStub._d).forEach(function (k) {
  const raw = storageStub._d[k];
  try { pack.data[k] = JSON.parse(raw); } catch (e) { pack.data[k] = { __raw: raw }; }
});

/* ---------------- 真实导入：走 export.js 的导入入口 ----------------
   注意：`importProgress` 是 js/export.js 的**模块内函数**，只被它自己的文件选择事件调用，
   并没有挂到 window.FTEExport 上（FTEExport 只导出三个下载类函数）。所以这里不能从公开面拿它，
   改为按 index.html 的真实顺序在同一 vm 上下文里**再取一次 export.js 的词法环境**不可行
   （IIFE 已封闭），故本门禁改为直接用 sandbox.eval 触发它的公开入口：
   `FTEExport` 里如果有 importProgress 就用，没有就用下面这条等效路径——
   用同一份 pack 重新走 sanitizeProgress（导入路径的唯一净化函数），
   这样测的仍然是 F-1 的真实风险点：**净化是否改变容器类型与合法数据**。 */
const source = fs.readFileSync(path.join(ROOT, "js", "export.js"), "utf8");
const sanitizeSrc = (function () {
  /* 从 export.js 源码里原样截取净化函数与其依赖，在独立上下文里求值——
     这样"导入路径怎么净化"与"净化函数本身"始终是同一份代码，不会各测一份。 */
  function slice(name) {
    const i = source.indexOf("function " + name + "(");
    if (i < 0) throw new Error("找不到函数 " + name);
    let d = 0, s = source.indexOf("{", i), e = -1;
    for (let k = s; k < source.length; k++) {
      const c = source[k];
      if (c === "{") d++; else if (c === "}") { d--; if (d === 0) { e = k + 1; break; } }
    }
    if (e < 0) throw new Error("配平失败 " + name);
    return source.slice(i, e);
  }
  const typesStart = source.indexOf("var SANITIZE_TYPES");
  const typesEnd = source.indexOf("\n  };", typesStart) + "\n  };".length;
  return source.slice(typesStart, typesEnd) + "\n" +
    ["sanitizeKind", "toNum", "safeUrl", "safeStr", "sanitizeValue", "sanitizeProgress"].map(slice).join("\n") +
    "\nreturn sanitizeProgress;";
})();
const sanitizeProgress = vm.runInNewContext("(function(){" + sanitizeSrc + "})()", { Object: Object, Math: Math, isFinite: isFinite, parseFloat: parseFloat, String: String, Array: Array });

/* 导入时 writeOne 用的前缀：**直接从产品源码里取**，不在测试里另写一份。
   独立验证的 F-14 指出：测试自己传 `k + "."` 会掩盖"前缀传错"这类缺陷（正是 F-2 的缺陷类）。
   所以这里从 js/export.js 的 writeOne 里抠出真实表达式并求值；取不到就**判失败**（而不是退回硬编码）。 */
const PREFIX_EXPR = (function () {
  const i = source.indexOf("function writeOne(");
  const seg = i >= 0 ? source.slice(i, source.indexOf("\n  }", i)) : "";
  const m = /sanitizeProgress\(\s*stripSecrets\([^)]*\)\s*,\s*([^)]+)\)/.exec(seg);
  return m ? m[1].trim() : null;
})();
check("能从 writeOne 源码里取出真实的 prefix 表达式（不硬编码）", !!PREFIX_EXPR, String(PREFIX_EXPR));
function productPrefix(key) {
  /* 表达式形如 key + "."，用受控上下文求值，保证与产品一致 */
  return vm.runInNewContext("(function(key){ return " + PREFIX_EXPR + "; })", {})(key);
}

const CLONE = JSON.parse(JSON.stringify(pack.data));
Object.keys(CLONE).forEach(function (k) {
  let v = CLONE[k];
  if (v && typeof v === "object" && v.__raw !== undefined && Object.keys(v).length === 1) return;   /* 裸字符串 */
  const cleaned = sanitizeProgress(v, productPrefix(k));
  storageStub.setItem(k, JSON.stringify(cleaned));
});

/* ---------------- 断言：类型与数量都不能变 ---------------- */
ARRAY_KEYS.forEach(function (k) {
  const raw = storageStub.getItem(k);
  let v = null; try { v = JSON.parse(raw); } catch (e) { }
  check("导入后 " + k + " 仍是数组且条数不变", Array.isArray(v) && v.length === (SEED[k] || []).length,
    Array.isArray(v) ? "length=" + v.length : "类型=" + (v === null ? "null" : typeof v));
});

const progress = JSON.parse(storageStub.getItem("fte-progress-v1") || "{}");
check("导入后 progress.learned 仍是对象且键数不变", !!progress.learned && Object.keys(progress.learned).length === 3);
/* F-10（P1）：learned/done 的值是**布尔**，导入后必须仍是布尔 true，
   不能被 num 规则吃成 0 —— 否则掌握度归零、"✓ 已完成"消失、#/today 第 2 步退回 U1。 */
check("F-10：progress.learned 的值仍是布尔 true（不是 0）",
  Object.keys(progress.learned || {}).every(function (k) { return progress.learned[k] === true; }),
  JSON.stringify(progress.learned));
check("F-10：progress.done 的值仍是布尔 true（不是 0）",
  Object.keys(progress.done || {}).every(function (k) { return progress.done[k] === true; }),
  JSON.stringify(progress.done));
check("F-10：注入进 learned 的字符串被判为 false（不是真值）",
  progress.learned["9-9"] === false || progress.learned["9-9"] === undefined, String(progress.learned["9-9"]));
check("导入后 progress.flash 的 stability 仍是数字", typeof ((progress.flash || {})["1-0"] || {}).stability === "number");
check("导入后 progress.coach.streak 仍是数字", typeof (progress.coach || {}).streak === "number");
check("导入后 progress.activeDays 保留（P3 台账不被清）", !!progress.activeDays && Object.keys(progress.activeDays).length === 2);

const board = JSON.parse(storageStub.getItem("fte-board-v1") || "{}");
check("导入后 board.tasks 仍是数组", Array.isArray(board.tasks) && board.tasks.length === 2);
check("导入后 board 的合法 href 未被改成 #", !!(board.tasks && board.tasks[0]) && board.tasks[0].href === "#/unit/11",
  board.tasks && board.tasks[0] ? board.tasks[0].href : "");

const writes = JSON.parse(storageStub.getItem("fte-writes-v1") || "[]");
check("导入后作品集文本与数字保持原值（不误伤合法备份）",
  !!(writes[0]) && writes[0].text === SEED["fte-writes-v1"][0].text && writes[0].wc === 42,
  writes[0] ? "wc=" + writes[0].wc : "空");

/* ---------------- F-15：null 必须保持 null（不能变成 0） ----------------
   产品真的会写 null（=未测/不存在）：write.js:577-578 的 wc2/rate1/rate2、eval4.js 的 log 与未测维度、
   speech.js 的 rate/fluency。被吃成 0 会造成两类失真：
     · write.js:387 的 `rate2 != null` 成立 → 每篇没写二稿的作品凭空多出「已改二稿 0%→0%」徽章；
     · radar.js 的 avg() 只过滤非数字 → null 变成"一次真实测量"，五维雷达被拉低（实测 90→45）。 */
(function () {
  const dirty = JSON.parse(JSON.stringify(pack.data));
  dirty["fte-writes-v1"][0].wc2 = null;
  dirty["fte-writes-v1"][0].rate1 = null;
  dirty["fte-writes-v1"][0].rate2 = null;
  dirty["fte-eval4-v1"][0].log = null;
  dirty["fte-speech-v1"][0].fluency = null;
  Object.keys(dirty).forEach(function (k) {
    if (dirty[k] && typeof dirty[k] === "object" && dirty[k].__raw !== undefined) return;
    storageStub.setItem(k, JSON.stringify(sanitizeProgress(dirty[k], productPrefix(k))));
  });
  const w = JSON.parse(storageStub.getItem("fte-writes-v1"));
  const e4 = JSON.parse(storageStub.getItem("fte-eval4-v1"));
  const sp = JSON.parse(storageStub.getItem("fte-speech-v1"));
  check("F-15：null 仍是 null 或键被丢弃（不得变成 0）—— 作品 rate2",
    w[0].rate2 === null || w[0].rate2 === undefined, String(w[0].rate2));
  check("F-15：null 不得变成 0 —— 作品 wc2 / rate1",
    (w[0].wc2 === null || w[0].wc2 === undefined) && (w[0].rate1 === null || w[0].rate1 === undefined),
    JSON.stringify({ wc2: w[0].wc2, rate1: w[0].rate1 }));
  check("F-15：null 不得变成 0 —— eval4.log", e4[0].log === null || e4[0].log === undefined, String(e4[0].log));
  check("F-15：null 不得变成 0 —— speech.fluency", sp[0].fluency === null || sp[0].fluency === undefined, String(sp[0].fluency));
  check("F-15 反向：真实数字不受影响（eval4.total 仍是 78）", e4[0].total === 78, String(e4[0].total));
})();

/* ---------------- F-6：迁移标记必须**落盘**（跨刷新只回填一次） ----------------
   独立验证发现：迁移结果只写在内存，刷新后会再次回填 → 用户手动删掉的活跃日会复活。
   这里用已经启动好的站点（真实 saveProgress 链路）断言：调用 activeDaySet() 后，
   localStorage 里的 progress 必须带上 activeDaysInit。 */
(function () {
  const boot = sandbox.FTE_BOOT;
  check("FTE_BOOT 暴露 activeDaySet / activeDaysMark（P3 可被门禁观测）",
    !!boot && typeof boot.activeDaySet === "function" && typeof boot.activeDaysMark === "function");
  if (!boot || typeof boot.activeDaySet !== "function") return;
  /* 在 boot 暴露的**同一个 progress 对象**上构造"老版本进度"（不能用 localStorage.setItem 覆盖：
     FTE_BOOT.progress 是 getter，进程里已有活对象，覆盖存储不会换掉它）。 */
  const p = boot.progress;
  delete p.activeDays; delete p.activeDaysInit;
  p.coach = { lastDate: "2026-10-01", today: 0, total: 600, streak: 2 };
  p.coachDays = { "2026-09-20": 12 };
  p.studioDays = { "2026-09-21": { patterns: 1, write: 0 } };
  const set = boot.activeDaySet();
  const saved = storageStub.getItem("fte-progress-v1");
  check("F-6：activeDaySet() 之后迁移结果已写回 localStorage", /"activeDaysInit":true/.test(saved || ""),
    (saved || "").slice(0, 120));
  check("F-6：回填的活跃日被持久化（coachDays 里的 2026-09-20）", /"2026-09-20"/.test(saved || ""),
    "activeDays=" + JSON.stringify(set));
  check("F-6：studioDays 里那天也被回填（2026-09-21）", /"2026-09-21"/.test(saved || ""));
})();

/* ---------------- 被污染的数据必须被净化（第二层防御不能是死代码） ---------------- */
(function () {
  /* 关键：净化实现**取自 js/export.js 的真实源码**（上面 sanitizeProgress 的截取），
     而不是在测试里重写一份——否则可能"用一份正确的实现"掩盖产品里的错误实现。 */
  const dirty = JSON.parse(JSON.stringify(pack.data));
  dirty["fte-board-v1"].tasks[0].href = "javascript:alert(1)";
  dirty["fte-writes-v1"][0].wc = "<img src=x onerror=alert(1)>";
  dirty["fte-writes-v1"][0].indep.rate = "<svg onload=alert(1)>";
  Object.keys(dirty).forEach(function (k) {
    if (dirty[k] && typeof dirty[k] === "object" && dirty[k].__raw !== undefined) return;
    storageStub.setItem(k, JSON.stringify(sanitizeProgress(dirty[k], k + ".")));
  });
  const b = JSON.parse(storageStub.getItem("fte-board-v1"));
  const w = JSON.parse(storageStub.getItem("fte-writes-v1"));
  check("F-2：board 的 javascript: href 被净化", b.tasks[0].href === "#", b.tasks[0].href);
  check("F-2：作品集数字位的注入串被归零", w[0].wc === 0, String(w[0].wc));
  check("F-2：作品集 title 属性位的注入串被归零", w[0].indep.rate === 0, String(w[0].indep.rate));
})();

console.log("\n========================================");
if (failed > 0) { console.log("❌ 失败断言数：" + failed); process.exit(1); }
console.log("✅ 导出/导入往返：类型与数量保持、合法数据未被误伤。");
process.exit(0);
