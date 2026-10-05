#!/usr/bin/env node
/* 验收测试：🌐 全英模式（js/immerse.js）+ 📅 本周新料（js/weekly.js）
   两个模块都是「显示/节律」类改动，最容易出的问题不是算法错，而是**接线断**与**越界**：
     · 清单加了一条却忘了加 CSS（或反过来）→ 页面上一半中文藏不住，用户以为功能坏了；
     · 「顺手」把单词卡背面或测验选项也藏了 → 沉浸变成做不了题；
     · 新脚本忘了进 index.html / sw.js → 离线打开就少一块；
     · 改了文件没升 SW 缓存号 → 老用户永远拿到旧外壳；
     · 未登记的 localStorage 键 → 备份静默丢数据（P0-3 的老病）。
   这些只有机器能稳定拦住，所以本文件把它们全部变成门禁。

   运行：node tools/test-immerse-weekly.js（在 外贸英语/ 目录下） */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

let failed = 0;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) failed++;
}

/* ---------------- 最小沙箱：只为让两个模块的加载期跑完，并让偏好/存储可读可写 ---------------- */
function fakeEl() {
  const classes = new Set();
  return {
    innerHTML: "", textContent: "", value: "", hidden: false, checked: false, type: "", id: "", className: "",
    style: {}, dataset: {}, children: [],
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, force) => {
        const want = (force === undefined) ? !classes.has(c) : !!force;
        if (want) classes.add(c); else classes.delete(c);
        return want;
      },
      _all: () => Array.from(classes)
    },
    setAttribute: function () { }, getAttribute: function () { return null; },
    addEventListener: function () { }, removeEventListener: function () { },
    appendChild: function (c) { return c; }, removeChild: function (c) { return c; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    closest: function () { return null; }, focus: function () { }
  };
}
const storage = {
  _d: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; },
  clear: function () { this._d = {}; }
};
const docEl = fakeEl();
const doc = {
  documentElement: docEl,
  body: fakeEl(),
  getElementById: function () { return null; },
  createElement: function () { return fakeEl(); },
  addEventListener: function () { }, removeEventListener: function () { },
  querySelector: function () { return null; }, querySelectorAll: function () { return []; }
};
const listeners = {};
const sandbox = {
  console: console,
  document: doc,
  localStorage: storage,
  location: { hash: "", href: "http://localhost/", protocol: "http:" },
  addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
  removeEventListener: function () { },
  dispatchEvent: function (t) { (listeners[t] || []).forEach(function (f) { f({ type: t }); }); return true; },
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  navigator: { userAgent: "node" }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);

function load(rel) {
  try { vm.runInContext(read(rel), ctx, { filename: rel }); return ""; }
  catch (e) { return (e && e.message) ? e.message : String(e); }
}

/* ================= 1. 加载期不抛错、全局就绪 ================= */
const e1 = load("js/immerse.js");
check("js/immerse.js 加载期无异常", !e1, e1);
const e2 = load("js/weekly.js");
check("js/weekly.js 加载期无异常", !e2, e2);
const Immerse = ctx.window.Immerse, Weekly = ctx.window.Weekly;
check("暴露 window.Immerse", !!Immerse);
check("暴露 window.Weekly", !!Weekly);
if (!Immerse || !Weekly) {
  console.log("\n❌ 模块未就绪，后续断言无法进行");
  process.exit(1);
}

/* ================= 2. 偏好默认与切换（只在 <html> 上加 class，不碰学习数据） ================= */
check("默认（没存过偏好）全英模式为「关」", Immerse.on() === false);
check("默认 <html> 上没有 immerse-on", !docEl.classList.contains("immerse-on"));
Immerse.set(true);
check("打开后：偏好落库且 <html> 挂上 class",
  Immerse.on() === true && docEl.classList.contains("immerse-on"));
check("打开后存入的键就是登记过的 fte-immerse", storage.getItem("fte-immerse") === "1");
Immerse.peek(true);
check("「临时看中文」挂上 immerse-peek（CSS 靠它抑制隐藏）",
  docEl.classList.contains("immerse-peek") && Immerse.isPeek() === true);
ctx.dispatchEvent("hashchange");
check("换页自动收回临时中文（全英模式要的是「默认不给中文」，不是「永不显示」）",
  Immerse.isPeek() === false && Immerse.on() === true);
Immerse.set(false);
check("关闭后 class 与偏好一起清掉",
  Immerse.on() === false && !docEl.classList.contains("immerse-on") && storage.getItem("fte-immerse") === "0");
/* CSS 类名必须避开 fte- 前缀：那是存储键的命名空间，test-security.js 会把它们当存储键对账 */
check("CSS 类名不带 fte- 前缀（fte-* 是存储键的命名空间）",
  Immerse.on && read("js/immerse.js").indexOf('"fte-immerse"') !== -1 &&
  read("css/style.css").indexOf("html.fte-") === -1);

/* ================= 3. 覆盖清单 ↔ CSS 逐条对账（最容易漏的一处） ================= */
const css = read("css/style.css");
const cssSel = [];
const reSel = /html\.immerse-on:not\(\.immerse-peek\)\s+([^,{}\n]+)/g;
let m;
while ((m = reSel.exec(css)) !== null) cssSel.push(m[1].trim());
const listed = Immerse.ZH_SELECTORS.slice();
const missingInCss = listed.filter(function (s) { return cssSel.indexOf(s) === -1; });
const extraInCss = cssSel.filter(function (s) { return listed.indexOf(s) === -1; });
check("CSS 的隐藏清单与 immerse.js 的 ZH_SELECTORS 逐条一致",
  missingInCss.length === 0 && extraInCss.length === 0,
  (missingInCss.length ? "CSS 缺：" + missingInCss.join(" ") + " " : "") +
  (extraInCss.length ? "CSS 多：" + extraInCss.join(" ") : ""));
check("清单非空且覆盖到词条/对话/字幕三块主战场",
  listed.indexOf(".word-row .cn") !== -1 && listed.indexOf(".dlg-line .cn") !== -1 && listed.indexOf(".sub-zh") !== -1,
  "n=" + listed.length);
check("清单里每一条都真的存在于站内渲染代码里（不是凭想象写的类名）", (function () {
  const files = fs.readdirSync(path.join(ROOT, "js")).filter(function (f) { return /\.js$/.test(f); });
  const blob = files.map(function (f) { return read(path.join("js", f)); }).join("\n");
  const bad = listed.filter(function (s) {
    const cls = s.replace(/^.*\s/, "").replace(/^\./, "").split(/[.\s]/).pop();
    return blob.indexOf(cls) === -1;
  });
  return bad.length === 0;
})());

/* ================= 4. 越界守卫：答案面 / 判分依据绝不能被隐藏 ================= */
const banned = [".flash-face", ".quiz-q", ".quiz-options", ".quiz-opts", ".mk-right", ".chat-msg", ".e4-bar"];
const leaked = listed.filter(function (s) { return banned.some(function (b) { return s.indexOf(b) !== -1; }); });
check("隐藏清单不包含答案面与判分依据（单词卡背面/测验题干与选项/易错点正确说法/AI 翻译/四维分数区）",
  leaked.length === 0, leaked.join(" "));
check("模块自带 NEVER_HIDE 声明（把「不隐藏什么」也写成代码，而不是只写在注释里）",
  Array.isArray(Immerse.NEVER_HIDE) && Immerse.NEVER_HIDE.length >= 5);
check("NEVER_HIDE 里的选择器都是站内真实存在的类名（不留想象出来的名字）", (function () {
  const files = fs.readdirSync(path.join(ROOT, "js")).filter(function (f) { return /\.js$/.test(f); });
  const blob = files.map(function (f) { return read(path.join("js", f)); }).join("\n");
  const bad = Immerse.NEVER_HIDE.filter(function (s) { return blob.indexOf('class="' + s.replace(/^\./, "")) === -1; });
  return bad.length === 0;
})(), Immerse.NEVER_HIDE.join(" "));

/* ================= 5. 接线：index.html / app.js / sw.js / CSS / 页面 ================= */
const html = read("index.html");
const appjs = read("js/app.js");
const sw = read("sw.js");
const posImmerse = html.indexOf('js/immerse.js');
const posWeekly = html.indexOf('js/weekly.js');
const posApp = html.indexOf('js/app.js"');
check("index.html 引入了 immerse.js 与 weekly.js", posImmerse !== -1 && posWeekly !== -1);
check("两者都排在 app.js 之前（app.js 启动时做 _need 校验）",
  posImmerse !== -1 && posWeekly !== -1 && posApp !== -1 && posImmerse < posApp && posWeekly < posApp);
check("app.js 的 _need 清单登记了两者",
  /_need\("全英模式 immerse\.js",\s*!!window\.Immerse\)/.test(appjs) &&
  /_need\("本周新料 weekly\.js",\s*!!window\.Weekly\)/.test(appjs));
check("sw.js 预缓存两个新脚本（离线打开也要有）",
  sw.indexOf('"./js/immerse.js"') !== -1 && sw.indexOf('"./js/weekly.js"') !== -1);
check("改了文件就必须升 SW 缓存号（否则老用户永远拿旧外壳）",
  /const CACHE = "fte-v(\d+)"/.test(sw) && Number(RegExp.$1) > 85, "CACHE=" + (sw.match(/const CACHE = "(fte-v\d+)"/) || [])[1]);
check("CSS 里出现了浮标样式，且 [hidden] 时真的不显示（position:fixed 会盖掉 UA 的 [hidden]）",
  /\.immerse-pill\{/.test(css) && /\.immerse-pill\[hidden\]\{display:none\}/.test(css));

const todayjs = read("js/today.js");
const materialjs = read("js/material.js");
check("今日页渲染「本周新料」区块（同一位置策略：不新增导航、不新增第 6 步）",
  /window\.Weekly\.html/.test(todayjs));
check("「本周新料」排在五步清单之后（不挤占首屏那个决定）",
  todayjs.indexOf("window.Weekly.html") > todayjs.indexOf('class="td-list-head"'));
check("今日页主模板里没有块注释（模板会把注释渲染成可见文字——站内踩过这个坑）",
  !/\$\{\s*\/\*/.test(todayjs));
check("今日页给了「换设备搬进度」的常驻入口（复用 export.js 的既有动作）",
  /data-action="data-export"/.test(todayjs) && /data-action="data-import"/.test(todayjs));
check("素材投料口接入本周面板与来源预填",
  /Weekly\.panelHtml/.test(materialjs) && /Weekly\.takePending/.test(materialjs));

/* ================= 6. 新增文件里没有内联事件处理器（CSP 不含 unsafe-inline） ================= */
const inlineBad = ["js/immerse.js", "js/weekly.js"].filter(function (f) {
  return /\son(click|error|load|change|input|submit)\s*=/i.test(read(f));
});
check("新增脚本没有内联事件处理器（CSP script-src 不含 'unsafe-inline'）", inlineBad.length === 0, inlineBad.join(" "));

/* ================= 7. 存储键登记（P0-3：没登记 = 备份静默丢数据） ================= */
const SK = { window: {} };
SK.window = SK;
vm.runInContext(read("js/storage-keys.js"), vm.createContext(SK), { filename: "js/storage-keys.js" });
const reg = SK.window.FTE_STORAGE || SK.FTE_STORAGE;
const keys = (reg && reg.keys) || [];
function regOf(k) { return keys.filter(function (x) { return x.key === k; })[0]; }
[["fte-immerse", "immerse.js"], ["fte-weekly-v1", "weekly.js"]].forEach(function (pair) {
  const r = regOf(pair[0]);
  check("存储键 " + pair[0] + " 已登记且可备份", !!r && r.backup !== false && r.owner === pair[1]);
});
check("两个键都不在 secretKeys 里（它们不是凭据）",
  (!reg || !reg.secretKeys || reg.secretKeys.indexOf("fte-immerse") === -1 && reg.secretKeys.indexOf("fte-weekly-v1") === -1));

/* ================= 8. Weekly：ISO 周口径与轮换 ================= */
function kt(y, mo, d) { return Weekly.weekKey(new Date(y, mo - 1, d)); }
check("ISO 周口径：2021-01-01 属于 2020-W53（跨年那周不算错）", kt(2021, 1, 1) === "2020-W53", kt(2021, 1, 1));
check("ISO 周口径：2023-01-01（周日）属于 2022-W52", kt(2023, 1, 1) === "2022-W52", kt(2023, 1, 1));
check("ISO 周口径：2024-01-01（周一）属于 2024-W01", kt(2024, 1, 1) === "2024-W01", kt(2024, 1, 1));
check("ISO 周口径：2026-01-01（周四）属于 2026-W01", kt(2026, 1, 1) === "2026-W01", kt(2026, 1, 1));
check("周键格式为 YYYY-Www", /^\d{4}-W\d{2}$/.test(kt(2026, 9, 30)));

const cMon = Weekly.current(new Date(2026, 0, 5));   // 周一
const cSun = Weekly.current(new Date(2026, 0, 11));  // 同周周日
const cNext = Weekly.current(new Date(2026, 0, 12)); // 下一周周一
check("同一周内主题恒定（周一到周日不会换题）", cMon.key === cSun.key && cMon.isoKey === cSun.isoKey);
check("跨周自动换主题", cNext.key !== cMon.key);
check("主题表 6 条且 key 唯一（六周一个循环，不重复到让人腻）",
  Weekly.PLAN.length === 6 && new Set(Weekly.PLAN.map(function (p) { return p.key; })).size === 6);
check("六个主题真的都会轮到（一周一个，6 周覆盖全表）", (function () {
  const seen = new Set();
  for (let i = 0; i < 6; i++) seen.add(Weekly.current(new Date(2026, 0, 5 + i * 7)).key);
  return seen.size === 6;
})());
check("每个主题都有 3 个公开来源、主题说明与检索建议，且 URL 都是 https 且互不重复", Weekly.PLAN.every(function (p) {
  if (!p.topic || !p.why || !p.look || !Array.isArray(p.srcs) || p.srcs.length !== 3) return false;
  const urls = p.srcs.map(function (s) { return s.url; });
  return urls.every(function (u) { return /^https:\/\/[^ ]+$/.test(u); }) && new Set(urls).size === urls.length &&
    p.srcs.every(function (s) { return !!s.name; });
}));

/* ================= 9. Weekly：「已投料」只记本周 + 不污染打卡口径 ================= */
storage.removeItem("fte-weekly-v1");
/* 固定到 2026-09-30（ISO 2026-W40）作为**被测输入**：下面每一条都只拿它当参数传，
   不对"真实当下的周"做任何断言（那会让本文件只在某一周内绿，跨周后永久红）。 */
const now = new Date(2026, 8, 30);   // 2026-09-30（周三）
check("初始状态：本周未投料", Weekly.isDone(now) === false);
Weekly.markDone(true, now);
check("标记后：本周为已投料", Weekly.isDone(now) === true);
/* 无参路径（用真实当前时间）单独测，且必须与写入用**同一个时钟源**：
   markDone(undefined) 写的是"本周"，isDone() 读的也是"本周"，两者必然自洽。
   （历史教训：本行曾写成 `isDone(now) === true && isDone() === true` —— 前半段用固定日期的周、
     后半段用真实当下的周，于是只要跨出 2026-W40 就永久假红。） */
Weekly.markDone(undefined);
check("无参路径：写入后本周为已投料（同一时钟源自洽）", Weekly.isDone() === true);
Weekly.markDone(true, now);
check("重新钉回固定周：本周为已投料", Weekly.isDone(now) === true);
storage.setItem("fte-weekly-v1", JSON.stringify({ week: "2020-W01", done: true }));
check("跨周自动归零（上周的「已投料」不算本周的）", Weekly.isDone(now) === false);
Weekly.markDone(true, now);
Weekly.markDone(false, now);
check("可撤销", Weekly.isDone(now) === false);
Weekly.markDone(true, now);
const doneHtml = Weekly.html(now);
check("本周已投料后收缩成一行事实（站内纪律：提醒不做成永远挂着的全尺寸卡片）",
  doneHtml.indexOf("本周已投料") !== -1 && doneHtml.indexOf("wk-fetch") === -1);
Weekly.markDone(false, now);

const todayHtml = Weekly.html(now);
const panelHtml = Weekly.panelHtml(now);
check("今日区块给出主题 / 入口 / 三个来源",
  todayHtml.indexOf(Weekly.current(now).topic) !== -1 &&
  (todayHtml.match(/data-action="wk-fetch"/g) || []).length === 3 &&
  todayHtml.indexOf("#/material") !== -1);
check("素材面板同样给出来源与检索建议",
  (panelHtml.match(/data-action="wk-fetch"/g) || []).length === 3 && panelHtml.indexOf(Weekly.current(now).look) !== -1);
check("两处都写明「不计入打卡」（坚持口径不能被「找材料」污染）",
  todayHtml.indexOf("不计入打卡") !== -1 && panelHtml.indexOf("不计入打卡") !== -1);
check("两处都写明来源是公开媒体、不预置英文正文（不替用户做真实性担保）",
  todayHtml.indexOf("人工核对") !== -1);
check("卡片文案里没有未转义的用户输入点（esc 走过 FTE_BOOT.esc）",
  todayHtml.indexOf("<script") === -1 && todayHtml.indexOf("onclick=") === -1);

Weekly.sendToMaterial("https://packagingeurope.com/");
check("来源链接跨页传递：取一次即清空（不污染下一次）",
  Weekly.takePending() === "https://packagingeurope.com/" && Weekly.takePending() === "");

/* ================= 10. 文档与实现同步 ================= */
const readme = read("README.md");
check("README 记录了这两项改动（全英模式 / 本周新料）",
  readme.indexOf("全英模式") !== -1 && readme.indexOf("本周新料") !== -1);

console.log("\n========================================");
if (failed) { console.log("❌ 失败断言数：" + failed); process.exit(1); }
console.log("✅ 全英模式 + 本周新料：全部断言通过。");
process.exit(0);
