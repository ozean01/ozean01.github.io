#!/usr/bin/env node
/* 任务1 门禁：📋 一页纸速查小抄（#/cheatsheet）
   守的事：
     ① 7 个阶段齐全、每阶段 ≥6 句、总数 ≥50；
     ② **不新造内容**：每条只存来源 key，解析出来必须是原模块里真实存在的句子（解析失败=红）；
     ③ 来源标注可读（模块 + 单元/阶段/来信 + 句子位置），不允许只写「站内语料」；
     ④ 不新增一级导航；入口在「实操 SOP」页内；
     ⑤ 打印样式：@media print 覆盖本页、隐藏站头/导航、按阶段分页；
     ⑥ 转义安全（CSP、无内联事件）；渲染冒烟：7 段全出、无解析失败、无裸 HTML。
   运行：node tools/test-cheatsheet.js（由 tools/test-all.js 调用；零依赖、无网络、无浏览器） */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
let failed = 0;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) failed++;
}

/* ---------- 文件事实 ---------- */
const html = read("index.html");
const appjs = read("js/app.js");
const sw = read("sw.js");
const css = read("css/style.css");
const csjs = read("js/cheatsheet.js");
const sopjs = read("js/sop.js");

check("index.html 引用 js/cheatsheet.js（defer）", /<script\s+src="js\/cheatsheet\.js"\s+defer><\/script>/.test(html));
const posCs = html.indexOf('src="js/cheatsheet.js"');
const posApp = html.indexOf('src="js/app.js"');
const posSop = html.indexOf('src="js/sop.js"');
const posMail = html.indexOf('src="js/data-mail.js"');
check("cheatsheet.js 排在 SOP 与 data-mail 之后、app.js 之前（依赖顺序）",
  posSop > -1 && posMail > -1 && posCs > posSop && posCs > posMail && posCs < posApp,
  "sop@" + posSop + " mail@" + posMail + " cs@" + posCs + " app@" + posApp);
check("入口在「实操 SOP」页内（不是导航）", /href="#\/cheatsheet"/.test(sopjs) && !/href="#\/cheatsheet"[\s\S]{0,200}?nav-group/.test(html));
const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, "");
check("index.html 无可执行内联 <script>（严格 CSP；JSON-LD 非可执行脚本除外）",
  !/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>[\s\S]*?<\/script>/.test(htmlNoComments));
check("cheatsheet.js 无内联事件处理器（onclick= 等）", !/\son[a-z]+\s*=/i.test(csjs));

/* ---------- 路由接线 ---------- */
/* 任务3（2026-10-31）：白名单尾部追加了 "lookup"，原断言把 "cheatsheet"] 钉成数组结尾会误伤；
   改成「白名单数组里含 cheatsheet」这一事实本身（不放松：仍要求它出现在 .indexOf(parts[0]) 的白名单数组内）。 */
check("app.js 路由白名单含 cheatsheet", /\["units",[^\]]*"cheatsheet"[^\]]*\]\.indexOf\(parts\[0\]\)/.test(appjs));
check("app.js 有 cheatsheet 渲染分支", /route\.view === "cheatsheet"\) window\.Cheatsheet\.render\(\)/.test(appjs));

/* ---------- 预缓存 / 版本 ---------- */
check("sw.js 预缓存含 ./js/cheatsheet.js", /"\.\/js\/cheatsheet\.js"/.test(sw));
const ver = Number((sw.match(/const CACHE = "fte-v(\d+)"/) || [])[1] || NaN);
check("CACHE 已升版（≥ fte-v135）", Number.isFinite(ver) && ver >= 135, ver);

/* ---------- 运行期：加载数据 + 模块，校验来源与渲染 ---------- */
function fakeEl() {
  return {
    innerHTML: "", textContent: "", value: "", hidden: false, style: {}, dataset: {},
    _handlers: {},
    addEventListener: function (t, fn) { this._handlers[t] = fn; },
    removeEventListener: function () { },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    setAttribute: function () { }, getAttribute: function () { return null; },
    classList: { add: function () { }, remove: function () { }, toggle: function () { }, contains: function () { return false; } },
    closest: function () { return null; }, focus: function () { }, setSelectionRange: function () { }
  };
}
const els = {};
function makeCtx() {
  const c = {
    console,
    document: {
      getElementById: function (id) { if (!els[id]) els[id] = fakeEl(); return els[id]; },
      querySelectorAll: function () { return []; },
      addEventListener: function () { },
      createElement: function () { return fakeEl(); },
      body: fakeEl(),
      execCommand: function () { return false; }
    },
    navigator: { clipboard: null, userAgent: "node" },
    localStorage: { getItem: function () { return null; }, setItem: function () { }, removeItem: function () { } },
    location: { href: "http://localhost/", hash: "#/cheatsheet" },
    Player: { speak: function () { } },
    ASRUtil: { toast: function () { } },
    print: function () { },
    setTimeout: setTimeout,
    window: null
  };
  c.window = c; c.self = c; c.globalThis = c;
  return vm.createContext(c);
}
const ctx = makeCtx();
const loadErrs = [];
["js/data.js", "js/data-ops.js", "js/data-ocean.js", "js/data-incoterms.js", "js/data-settle.js",
 "js/data-risk.js", "js/data-deep.js", "js/data-meeting.js", "js/data-mail.js",
 "js/sop.js", "js/cheatsheet.js"].forEach(function (f) {
  try { vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f, timeout: 20000 }); }
  catch (e) { loadErrs.push(f + ": " + e.message); }
});
check("数据与模块可在最小桩环境加载", loadErrs.length === 0, loadErrs.join("；"));
const CS = ctx.window.Cheatsheet;
check("window.Cheatsheet.render 已暴露", !!(CS && typeof CS.render === "function"));
const T = (CS && CS._t) || {};

/* 阶段结构 */
const stages = T.STAGES || [];
check("7 个阶段齐全、id 1–7 连续且标题非空",
  stages.length === 7 && stages.every(function (s, i) { return s.id === i + 1 && s.title; }),
  "阶段数 " + stages.length);
/* 条目与来源 */
const entries = T.ENTRIES || [];
const total = entries.length;
check("总句数 ≥ 50", total >= 50, "实测 " + total);
const perStage = {};
entries.forEach(function (e) { perStage[e.stage] = (perStage[e.stage] || 0) + 1; });
check("每个阶段 ≥ 6 句", stages.every(function (s) { return (perStage[s.id] || 0) >= 6; }),
  JSON.stringify(perStage));
const resolved = entries.map(function (e) { return { src: e.src, stage: e.stage, r: T.resolve ? T.resolve(e.src) : null }; });
const badResolve = resolved.filter(function (x) { return !x.r || !x.r.en || !x.r.cn; });
check("每条来源 key 都能解析出真实文本（英文+中文都非空）", badResolve.length === 0,
  badResolve.slice(0, 5).map(function (x) { return x.src; }).join(", "));
check("来源标注可读：写明模块与出处（SOP / 真实来信 / U 词汇）",
  resolved.every(function (x) { return x.r && /(SOP|真实来信|^U\d+ 词汇|^U\d+ 短语)/.test(x.r.label); }) &&
  resolved.every(function (x) { return x.r && x.r.module; }));
check("来源不含 HTML 标签（转义后的纯文本）", resolved.every(function (x) { return x.r && !/<[a-z]/i.test(x.r.en + x.r.cn); }));
/* 不新造：解析结果必须与来源模块里的原句逐字一致（按来源类型复查一遍） */
function realTextFor(src) {
  const i = src.indexOf(":");
  const kind = src.slice(0, i), rest = src.slice(i + 1);
  if (kind === "sop") {
    const S = ctx.window.SOP && ctx.window.SOP._t;
    if (!S) return null;
    if (rest.indexOf("chase.") === 0) { const c = S.CHASE_LINES[Number(rest.slice(6))]; return c ? c.en : null; }
    const m = rest.match(/^s(\d+)\.(\d+)$/); if (!m) return null;
    const st = S.STAGES[Number(m[1]) - 1]; if (!st || !st.steps) return null;
    const step = st.steps[Number(m[2]) - 1]; return step ? step.en : null;
  }
  if (kind === "mail") {
    const m = rest.match(/^([^.]+)\.(\d+)$/); if (!m) return null;
    const T2 = ctx.window.FTE_MAIL && ctx.window.FTE_MAIL.threads; if (!T2) return null;
    const t = T2.filter(function (x) { return x.id === m[1]; })[0];
    const d = t && t.drill && t.drill[Number(m[2])];
    return d ? d.en : null;
  }
  if (kind === "vocab" || kind === "phrase") {
    const m = rest.match(/^U(\d+)\.(.+)$/); if (!m) return null;
    const D = vm.runInContext("typeof FTE_DATA !== 'undefined' ? FTE_DATA : null", ctx);
    const u = D && D.units.filter(function (x) { return Number(x.id) === Number(m[1]); })[0];
    if (!u) return null;
    if (kind === "vocab") { const v = (u.vocab || []).filter(function (x) { return x.w === m[2]; })[0]; return v ? v.ex : null; }
    const p = (u.phrases || [])[Number(m[2])]; return p ? p.ex : null;
  }
  return null;
}
const wrong = resolved.filter(function (x) { return x.r && x.r.en !== realTextFor(x.src); });
check("解析出的英文与来源模块逐字一致（不得改写/拼接）", wrong.length === 0,
  wrong.slice(0, 3).map(function (x) { return x.src; }).join(", "));

/* 纯函数 */
check("filterEntries：阶段筛选正确", T.filterEntries(T.computeAll(), 3, "").every(function (e) { return e.stage === 3; }));
check("filterEntries：关键词大小写不敏感且过滤生效",
  T.filterEntries(T.computeAll(), 0, "BALANCE").length > 0 &&
  T.filterEntries(T.computeAll(), 0, "BALANCE").length < T.computeAll().length);
check("filterEntries：无匹配时返回空数组", T.filterEntries(T.computeAll(), 0, "zzzqqq").length === 0);
check("textOf：每条输出英文+中文（两行），条目之间空一行", (function () {
  const l = T.computeAll().slice(0, 2);
  const t = T.textOf(l);
  const nonEmpty = t.split("\n").filter(function (x) { return x.trim(); });
  return t.indexOf(l[0].en) === 0 && nonEmpty.length === 4 && t.indexOf(l[1].cn) !== -1;
})());
/* 转义 */
check("esc() 转义示例：<script> 注入样本被吃掉",
  T.esc('<script>alert(1)</script>') === "&lt;script&gt;alert(1)&lt;/script&gt;");
check("模块里没有 localStorage 写入（不计打卡、不写学习数据）", csjs.indexOf("localStorage") === -1);

/* 渲染冒烟 */
let out = "";
try { CS.render(); out = els.app.innerHTML; } catch (e) { out = ""; console.log("  渲染抛错：" + e.message); }
check("render() 产出页面且含 7 个阶段区块", out.length > 2000 && (out.match(/class="cs-stage"/g) || []).length === 7,
  "阶段块 " + (out.match(/class="cs-stage"/g) || []).length);
check("render() 渲染出全部条目且无「来源解析失败」",
  (out.match(/class="cs-row"/g) || []).length === total && out.indexOf("来源解析失败") === -1,
  "行数 " + (out.match(/class="cs-row"/g) || []).length + " / " + total);
check("页面写明「不计入打卡/不计成绩」与打印入口",
  out.indexOf("不计入打卡") !== -1 && out.indexOf("打印") !== -1);
check("每行有朗读按钮与来源行", (out.match(/data-action="cs-say"/g) || []).length === total &&
  (out.match(/class="cs-src"/g) || []).length === total);

/* 打印样式 */
check("style.css 有 @media print 且覆盖小抄", /@media print\s*\{[\s\S]*?\.cs-stage/.test(css));
const printBlock = (css.match(/@media print\s*\{([\s\S]*?)\n\}/) || [])[1] || "";
check("打印样式隐藏站头与导航", /\.site-header/.test(printBlock) && /\.main-nav/.test(printBlock) && /display:none/.test(printBlock));
check("打印样式按阶段分页（break-before / page-break-before）", /page-break-before|break-before/.test(printBlock));
check("打印样式声明 A4 页面与黑白可读", /@page\s*\{[^}]*A4/.test(printBlock) && /#000/.test(printBlock));

/* 导航棘轮：一级导航仍 6 项，小抄不进导航 */
const navBlock = (html.match(/<nav class="main-nav"[\s\S]*?<\/nav>/) || [])[0] || "";
const navTop = (navBlock.match(/class="nav-home-link"|class="nav-group"/g) || []).length;
check("一级导航仍为 6 项（不新增导航）", navTop === 6, "实测 " + navTop);
check("小抄入口不在导航里", navBlock.indexOf("cheatsheet") === -1);

console.log("\n=== " + (failed ? "有断言失败（" + failed + "）" : "全部通过") + " ===");
process.exit(failed ? 1 : 0);
