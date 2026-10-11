#!/usr/bin/env node
/* 验收测试：专业术语速查（术语库 P11）
   这一页的数据是**离线生成、人工校订**的，最容易出的三类事故都在这里钉住：
     ① 数据自坏：英文重复、缺字段、类别不在 cats 里、空字符串；
     ② 音标口径漂移：本站口径是美式 GA（r 不写 ɹ、ɑː 不写 ɒ、oʊ 不写 əʊ），
        混进英式或 espeak 原始符号就与全站词库不一致；
     ③ 与课程词库重复：术语库立页的前提就是「站内已有的不重复收录」，
        一旦有人把 course vocab 里的词又抄进来，U11 的口径就出现两份真相。
   另外钉住接线（index.html / sw.js / app.js）与渲染冒烟（真跑一遍 render）。

   用例：node tools/test-glossary.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

/* ---------- 载入术语库数据 ---------- */
const dataSrc = fs.readFileSync(path.join(ROOT, "js", "data-glossary.js"), "utf8");
const ctx = { console: console, window: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(dataSrc, ctx, { filename: "js/data-glossary.js" });
const G = ctx.FTE_GLOSSARY;

check("data-glossary.js 定义 window.FTE_GLOSSARY", !!G && Array.isArray(G.terms));
check("术语条数 ≥ 300（首批入库量）", G.terms.length >= 300, "n=" + G.terms.length);
check("别名条数 ≥ 50（写法对齐清单）", (G.aliases || []).length >= 50, "n=" + (G.aliases || []).length);
check("note / provenance 均已写", !!G.note && !!G.provenance);

/* ---------- ① 数据自坏 ---------- */
const cats = new Set(G.cats || []);
const seenW = new Map(), badField = [], badCat = [];
G.terms.forEach(function (t) {
  ["w", "cn", "pos", "cat"].forEach(function (k) {
    if (!t[k] || String(t[k]).trim() === "") badField.push((t.w || "?") + "." + k);
  });
  const key = String(t.w || "").toLowerCase();
  if (seenW.has(key)) badField.push("英文重复：" + t.w);
  seenW.set(key, t);
  if (!cats.has(t.cat)) badCat.push(t.w + " → " + t.cat);
});
check("每条都有 w/pos/cn/cat 且非空", badField.length === 0, badField.join("；"));
check("每条 cat 都在 cats 清单内", badCat.length === 0, badCat.join("；"));
check("cats 与 terms 实际使用的类别完全一致",
  (G.cats || []).length === new Set(G.terms.map(function (t) { return t.cat; })).size,
  (G.cats || []).join("/"));

/* 同义中文 alt 不得与主中文重复 */
const dupAlt = [];
G.terms.forEach(function (t) {
  (t.alt || []).forEach(function (a) { if (a === t.cn) dupAlt.push(t.w); });
});
check("alt 同义中文不与主中文重复", dupAlt.length === 0, dupAlt.join("；"));

/* ---------- ② 音标口径 ---------- */
const BAD = /[ɹɒᵻɚ]/;
const ipaBad = [], ipaShape = [], stressBad = [];
/* 音节核计数（与构建脚本同口径）：双元音算一个核，长音符号不另计，成音节 l/n 另加一个。
   本站重音写法：多音节词标 ˈ/ˌ，单音节词不标（如 peel strength /piːl streŋθ/）。 */
const DIPH = ["aɪ", "aʊ", "eɪ", "oʊ", "ɔɪ"];
const VOW = "iɪeɛæɑɔoʊuʌəɜ";
function nuclei(tok) {
  const t = tok.replace(/[ˈˌ]/g, "");
  let n = 0, i = 0;
  while (i < t.length) {
    if (DIPH.indexOf(t.slice(i, i + 2)) !== -1) { n++; i += 2; continue; }
    if (VOW.indexOf(t[i]) !== -1) { n++; i++; continue; }
    i++;
  }
  const t2 = t.replace(/ː/g, "");
  if (t2.length >= 2 && "ln".indexOf(t2[t2.length - 1]) !== -1 &&
      VOW.indexOf(t2[t2.length - 2]) === -1 && t2[t2.length - 2] !== "r") n++;
  return n;
}
G.terms.forEach(function (t) {
  if (!t.ipa) return;
  if (!/^\/.+\/$/.test(t.ipa)) ipaShape.push(t.w + " " + t.ipa);
  if (BAD.test(t.ipa)) ipaBad.push(t.w + " " + t.ipa);
  const noStress = t.ipa.slice(1, -1).split(" ").filter(function (tk) {
    return nuclei(tk) > 1 && tk.indexOf("ˈ") === -1 && tk.indexOf("ˌ") === -1;
  });
  if (noStress.length) stressBad.push(t.w + " → " + noStress.join("/"));
});
const withIpa = G.terms.filter(function (t) { return !!t.ipa; }).length;
const withEx = G.terms.filter(function (t) { return !!t.ex; }).length;
const pairBad = G.terms.filter(function (t) { return t.ex && !t.exCn; }).map(function (t) { return t.w; });
check("全部词条都已人工校订音标（覆盖 100%）", withIpa === G.terms.length, withIpa + "/" + G.terms.length);
check("音标一律用斜杠包裹", ipaShape.length === 0, ipaShape.join("；"));
check("音标不含非美式符号 ɹ/ɒ/ᵻ/ɚ", ipaBad.length === 0, ipaBad.join("；"));
check("多音节词都标了重音（单音节可不标）", stressBad.length === 0, stressBad.slice(0, 3).join("；"));
check("全部词条都配有英文例句与中译（覆盖 100%）",
  withEx === G.terms.length && pairBad.length === 0,
  withEx + "/" + G.terms.length + (pairBad.length ? "；缺中译：" + pairBad.slice(0, 3).join("；") : ""));

/* 例句必须真的包含该术语（大小写不敏感，忽略连字符差异） */
const exMiss = [];
function flat(s) { return String(s).toLowerCase().replace(/[-\s]+/g, ""); }
G.terms.forEach(function (t) {
  if (!t.ex) return;
  if (flat(t.ex).indexOf(flat(t.w)) === -1) exMiss.push(t.w + " ≠ " + t.ex);
});
check("例句都包含对应术语（忽略大小写与连字符）", exMiss.length === 0, exMiss.slice(0, 3).join("；"));

/* ---------- ③ 与课程词库不重复 ---------- */
const lib = require("./lib-data.js");
const FTE = lib.loadFTE();
const courseW = new Set();
FTE.units.forEach(function (u) {
  (u.vocab || []).forEach(function (v) { courseW.add(String(v.w).toLowerCase()); });
});
const collide = G.terms.filter(function (t) { return courseW.has(String(t.w).toLowerCase()); })
  .map(function (t) { return t.w; });
check("术语库不与课程词库重复收录（一个概念一条）", collide.length === 0, collide.join("；"));

/* 别名必须指向站内真实存在的词条 */
const badAlias = (G.aliases || []).filter(function (a) {
  return !a.site || !courseW.has(String(a.site).toLowerCase());
}).map(function (a) { return a.cn + "→" + a.site; });
check("每个别名的站内目标词都真实存在", badAlias.length === 0, badAlias.join("；"));

/* ---------- ④ 接线 ---------- */
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const appjs = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");

check("index.html 引用了 data-glossary.js", /<script\s+src="js\/data-glossary\.js"/.test(html));
check("index.html 引用了 glossary.js", /<script\s+src="js\/glossary\.js"/.test(html));
check("index.html 有术语速查导航入口", /href="#\/glossary"/.test(html));
["js/data-glossary.js", "js/glossary.js"].forEach(function (f) {
  check("sw.js 预缓存含 " + f, sw.indexOf('"./' + f + '"') !== -1);
});
check("app.js 注册了 glossary 路由",
  /"glossary"\]\.indexOf\(parts\[0\]\)|,\s*"glossary"\]/.test(appjs) || /"glossary",\s*"today"\]/.test(appjs));
check("app.js 有 glossary 渲染分支", /route\.view === "glossary"/.test(appjs));
check("app.js 启动校验含术语库全局",
  appjs.indexOf("!!window.FTE_GLOSSARY") !== -1 && appjs.indexOf("window.Glossary && window.Glossary.render") !== -1);
const ver = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
check("缓存版本号已提升（fte-v91 起）", !!ver && parseInt(ver.replace("fte-v", ""), 10) >= 91, ver);

/* ---------- ⑤ 渲染冒烟：真跑一遍 render ---------- */
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
const sandbox = {
  console: console,
  document: {
    getElementById: function (id) { if (!els[id]) els[id] = fakeEl(); return els[id]; },
    querySelectorAll: function () { return []; },
    addEventListener: function () { }
  },
  location: { href: "http://localhost/", hash: "#/glossary" },
  Player: { speak: function () { } }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const rctx = vm.createContext(sandbox);
vm.runInContext(dataSrc, rctx, { filename: "js/data-glossary.js" });
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "glossary.js"), "utf8"), rctx, { filename: "js/glossary.js" });
check("glossary.js 暴露 window.Glossary.render", !!(sandbox.Glossary && typeof sandbox.Glossary.render === "function"));

let htmlOut = "";
try { sandbox.Glossary.render(); htmlOut = els.app.innerHTML; } catch (e) { htmlOut = ""; console.log("  渲染抛错：" + e.message); }
check("render() 能产出页面", htmlOut.indexOf("专业术语速查") !== -1 && htmlOut.length > 2000, "len=" + htmlOut.length);
check("页面渲染出全部术语条目数",
  htmlOut.split('class="card gl-card"').length - 1 === G.terms.length,
  "渲染 " + (htmlOut.split('class="card gl-card"').length - 1) + " / 数据 " + G.terms.length);
check("渲染结果不含 undefined / NaN",
  htmlOut.indexOf("undefined") === -1 && htmlOut.indexOf("NaN") === -1);
check("页面不出现「音标待校订」（全量已校订）", htmlOut.indexOf("音标待校订") === -1);
check("每条都渲染出例句区块",
  htmlOut.split('class="gl-ex"').length - 1 === G.terms.length,
  "渲染 " + (htmlOut.split('class="gl-ex"').length - 1) + " / 数据 " + G.terms.length);

/* 搜索过滤：改名后命中数应下降，且别名提示要能出现 */
const G2 = sandbox.Glossary;
const all = G2.DATA.terms.length;
sandbox.Glossary.state.q = "剥离";
let n = 0;
try { sandbox.Glossary.render(); n = els.app.innerHTML.split('class="card gl-card"').length - 1; } catch (e) { n = -1; }
check("搜索「剥离」能过滤出少量条目", n > 0 && n < all, "命中 " + n + " / " + all);
sandbox.Glossary.state.q = "自立袋";
let aliasShown = false;
try { sandbox.Glossary.render(); aliasShown = els.app.innerHTML.indexOf("站内已有，无需重复收录") !== -1; } catch (e) { aliasShown = false; }
check("搜索「自立袋」时给出站内写法对齐提示", aliasShown);
sandbox.Glossary.state.q = "";

console.log("\n-- 术语库统计 --");
console.log("  词条 " + G.terms.length + " · 别名 " + (G.aliases || []).length + " · 带音标 " + withIpa +
  " · 类别 " + (G.cats || []).length + " 个");

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
