#!/usr/bin/env node
/* 任务3 门禁：投料口「已学词高亮 + 点词收卡」+ bookmarklet（#/lookup）
   守的事：
     ① 高亮是纯函数：已学优先、大小写不敏感、**词边界**（film 不误标 films）、多词术语整段匹配、
        转义安全（<script> 注入样本）；
     ② 长文分批：批大小常量 ≤60，1 万字纯函数分片数正确，不改原文；
     ③ 点击语义：点词 → lookup、点图例 → filter（不会被行播放等动作抢走）；
     ④ bookmarklet：能构造合法 javascript: URL，?w= 正确编码（不做 javascript: 锚点）；
     ⑤ 接线：index.html 加载 lookup.js（defer、app.js 之前）、sw.js 预缓存含它、路由注册、
        存储键已登记（未命中痕迹不进备份）、不新增一级导航、AI 解释走披露出口。 */
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

const html = read("index.html");
const appjs = read("js/app.js");
const sw = read("sw.js");
const css = read("css/style.css");
const src = read("js/lookup.js");
const matjs = read("js/material.js");
const storage = read("js/storage-keys.js");

/* ---------- 接线 ---------- */
check("index.html 加载 js/lookup.js（defer）", /<script\s+src="js\/lookup\.js"\s+defer><\/script>/.test(html));
check("lookup.js 排在 material.js 之后、app.js 之前",
  html.indexOf('src="js/lookup.js"') > html.indexOf('src="js/material.js"') &&
  html.indexOf('src="js/lookup.js"') < html.indexOf('src="js/app.js"'));
check("sw.js 预缓存含 ./js/lookup.js", /"\.\/js\/lookup\.js"/.test(sw));
const ver = Number((sw.match(/const CACHE = "fte-v(\d+)"/) || [])[1] || NaN);
check("CACHE 已升版（≥ fte-v136）", Number.isFinite(ver) && ver >= 136, ver);
check("app.js 路由白名单含 lookup", /"cheatsheet",\s*"lookup"\]/.test(appjs) || /"lookup"\]/.test(appjs));
check("app.js 有 lookup 渲染分支", /route\.view === "lookup"\) window\.Lookup\.render\(route\)/.test(appjs));
check("app.js 解析 hash 里的 ?w= 参数", /lookup\(\?:\\\?\|\\\$\)/.test(appjs) || /lookup\(\?:\\\?\|\)/.test(appjs) || /URLSearchParams\(h\.slice/.test(appjs));
check("material.js 有站内查词入口（真链接）", /href="#\/lookup"/.test(matjs));
check("不新增一级导航（仍 6 项）",
  (html.match(/class="nav-home-link"|class="nav-group"/g) || []).length === 6);
check("导航里没有 lookup 入口", !/href="#\/lookup"/.test((html.match(/<nav class="main-nav"[\s\S]*?<\/nav>/) || [])[0] || ""));

/* ---------- 存储键 ---------- */
check("存储键 fte-lookup-pref-v1 已登记且进备份", /"fte-lookup-pref-v1"[\s\S]*?backup:\s*true/.test(storage));
check("存储键 fte-lookup-miss-v1 已登记且不进备份", /"fte-lookup-miss-v1"[\s\S]*?backup:\s*false/.test(storage));
check("lookup.js 只用这两个键（无额外 fte- 字面量）", (src.match(/fte-lookup-[a-z0-9-]+/g) || [])
  .every(function (k) { return k === "fte-lookup-pref-v1" || k === "fte-lookup-miss-v1"; }));

/* ---------- 运行期加载 ---------- */
function fakeEl() {
  return {
    innerHTML: "", textContent: "", value: "", hidden: false, style: {}, dataset: {}, className: "",
    _handlers: {},
    addEventListener: function (t, fn) { this._handlers[t] = fn; }, removeEventListener: function () { },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    setAttribute: function () { }, getAttribute: function () { return null; }, appendChild: function () { },
    classList: { add: function () { }, remove: function () { }, toggle: function () { }, contains: function () { return false; } },
    closest: function () { return null; }, focus: function () { }, getBoundingClientRect: function () { return { top: 0, left: 0, bottom: 0, width: 0 }; }
  };
}
const els = {};
const store = {};
const c = {
  console,
  document: {
    getElementById: function (id) { if (!els[id]) els[id] = fakeEl(); return els[id]; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    addEventListener: function () { }, createElement: function () { return fakeEl(); },
    body: fakeEl(), execCommand: function () { return false; }
  },
  navigator: { clipboard: null, userAgent: "node" },
  localStorage: { getItem: function (k) { return store[k] === undefined ? null : store[k]; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
  location: { origin: "https://ozean01.github.io", pathname: "/index.html", hash: "#/lookup?w=film", href: "https://ozean01.github.io/" },
  Player: { speak: function () { } }, print: function () { }, setTimeout: setTimeout,
  performance: { now: function () { return Date.now(); } }
};
c.window = c; c.self = c; c.globalThis = c;
const ctx = vm.createContext(c);
const loadErrs = [];
["js/data.js", "js/data-ops.js", "js/data-ocean.js", "js/data-incoterms.js", "js/data-settle.js", "js/data-risk.js",
 "js/data-deep.js", "js/data-meeting.js", "js/data-glossary.js", "js/data-mail.js", "js/lookup.js"].forEach(function (f) {
  try { vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f, timeout: 20000 }); }
  catch (e) { loadErrs.push(f + ": " + e.message); }
});
check("数据与 lookup.js 可在最小桩环境加载", loadErrs.length === 0, loadErrs.join("；"));
const L = ctx.window.Lookup;
const T = (L && L._t) || {};
check("window.Lookup 暴露 render / mountReader / _t", !!(L && L.render && L.mountReader && T.highlightSegments));

/* ---------- 高亮纯函数 ---------- */
const H = T.highlightSegments;
function kinds(segs) { return segs.map(function (s) { return s.k + ":" + s.t; }).join("|"); }
function rebuild(segs) { return segs.map(function (s) { return s.t; }).join(""); }
const vocab = new Set(["film", "laminate", "lead time"]);
const learned = new Set(["film"]);
check("已学优先：同词同时命中已学与词库 → learned",
  kinds(H("The film is strong.", { learned: learned, vocab: vocab })).indexOf("learned:film") !== -1);
check("未学的词库词 → vocab",
  kinds(H("We laminate it.", { learned: learned, vocab: vocab })).indexOf("vocab:laminate") !== -1);
check("大小写不敏感：Film 也被标", kinds(H("Film rolls.", { learned: learned, vocab: vocab })).indexOf("learned:Film") !== -1);
check("词边界：films 不被当成 film（不产生任何高亮片段）",
  !H("films are rolls", { learned: learned, vocab: vocab }).some(function (s) { return s.k !== "text"; }));
check("多词术语整段匹配：lead time 是一个片段",
  H("The lead time is short.", { learned: learned, vocab: vocab }).some(function (s) { return s.k === "vocab" && s.t === "lead time"; }));
check("多词术语词边界：lead times 不算",
  !H("lead times vary", { learned: learned, vocab: vocab }).some(function (s) { return s.k !== "text" && /^lead time/i.test(s.t); }));
check("拼接后与原文完全一致（不增删字符）",
  rebuild(H("Flexible film & laminate: lead time?", { learned: learned, vocab: vocab })) === "Flexible film & laminate: lead time?");
check("被屏蔽词不高亮", kinds(H("The film is here.", { learned: learned, vocab: vocab, muted: new Set(["film"]) })).indexOf("learned:film") === -1);
check("只看已学：未学词库词变普通文本",
  kinds(H("We laminate the film.", { learned: learned, vocab: vocab, onlyLearned: true })).indexOf("vocab:laminate") === -1 &&
  kinds(H("We laminate the film.", { learned: learned, vocab: vocab, onlyLearned: true })).indexOf("learned:film") !== -1);
check("html 转义：<script> 注入样本被吃掉",
  T.segsToHtml([{ t: "<script>alert(1)</script>", k: "text" }]) === "&lt;script&gt;alert(1)&lt;/script&gt;");
check("高亮片段渲染成按钮且带 data-w", /data-action="rd-word"[^>]*data-w="film"/.test(T.segsToHtml(H("film", { learned: learned, vocab: vocab }))));

/* ---------- 已学主键口径（真浏览器验收抓到的 bug：早先读 v.id 恒 undefined，已学高亮永远为空） ---------- */
const DATA = vm.runInContext("(typeof FTE_DATA !== 'undefined' ? FTE_DATA : null)", ctx);
const u0 = DATA && DATA.units && DATA.units[0];
const first = u0 && u0.vocab && u0.vocab[0];
check("data.js 词条确实没有 id 字段（learned 主键只能由「单元 id + 词序号」拼）", !!first && first.id === undefined);
c.FTE_BOOT = { progress: { learned: {} } };
c.FTE_BOOT.progress.learned[u0.id + "-0"] = 1;
const sets = T.buildSets();
check("buildSets 的已学主键与 app.js wordId(u,i)=u.id+'-'+i 逐字一致",
  sets.learned.has(String(first.w).toLowerCase()) && sets.byId[u0.id + "-0"] === String(first.w).toLowerCase(),
  "key=" + u0.id + "-0 · 词=" + first.w);
const lw = L.lookupWord(first.w);
check("lookupWord 返回的主键同口径（词卡「标记已会」要写进 progress.learned）",
  !!lw && lw.id === u0.id + "-0", lw ? ("id=" + lw.id) : "未命中");

check("点词小卡锚在阅读区（相对定位），否则滚动后卡片会按 body 坐标错位",
  /host\.style\.position\s*=\s*"relative"/.test(src) && /\.rd-card-pop\{position:absolute/.test(css));

/* ---------- 分批 ---------- */
check("PARA_BATCH 是常量且 ≤60", typeof T.PARA_BATCH === "number" && T.PARA_BATCH > 0 && T.PARA_BATCH <= 60, T.PARA_BATCH);
const para = "Flexible film is used for food packaging. ";
const big = new Array(120).fill(para).map(function (s, i) { return s + "Para " + i; }).join("\n\n");
const chunks = T.chunkParagraphs(big, T.PARA_BATCH);
check("长文分批：每批段数 ≤ PARA_BATCH、批数 = ceil(段数/批大小)",
  chunks.every(function (c2) { return c2.length <= T.PARA_BATCH; }) &&
  chunks.length === Math.ceil(120 / T.PARA_BATCH), chunks.length + " 批");
check("分批后段落拼接与原文段落一致（不改原文）",
  chunks.reduce(function (a, b) { return a.concat(b); }, []).join("\n\n") === big);
const huge = new Array(400).fill(para).join("\n\n");   /* >1 万字符 */
check("1 万字符级别文本的分片数正确", huge.length > 10000 &&
  T.chunkParagraphs(huge, T.PARA_BATCH).length === Math.ceil(400 / T.PARA_BATCH));

/* ---------- 点击语义 ---------- */
check("点词 → lookup 动作", T.intentOf("rd-word") === "lookup");
check("点图例 → filter 动作（不被行播放抢走）", T.intentOf("rd-only") === "filter");
check("其它动作不误判", T.intentOf("rd-say") === "other" && T.intentOf("mat-parse") === "other");

/* ---------- bookmarklet ---------- */
const bm = T.buildBookmarklet("https://ozean01.github.io", "/index.html");
check("bookmarklet 以 javascript: 开头且单行", /^javascript:/.test(bm) && bm.indexOf("\n") === -1);
check("bookmarklet 跳转到本站 #/lookup?w=", bm.indexOf("index.html#/lookup?w=") !== -1);
check("bookmarklet 对选中词做 encodeURIComponent 且截断 ≤50",
  bm.indexOf("encodeURIComponent(s.slice(0,50))") !== -1);
check("bookmarklet 不做成锚点（页面只给 code + 复制按钮）",
  !/href="javascript:/.test(matjs + src) && /rd-bm-copy/.test(src));
check("带子路径部署时 base 正确", T.buildBookmarklet("https://x.test", "/softpack/index.html").indexOf("https://x.test/softpack/index.html#/lookup?w=") !== -1);

/* ---------- 查词与 AI 披露 ---------- */
check("词库查询命中课程词", (function () { const r = T.lookupWord("film"); return r && r.w && r.cn; })());
check("多词术语可查（lead time）", (function () { const r = T.lookupWord("lead time"); return r && r.w; })());
check("未命中返回 null", T.lookupWord("zzzqqq") === null);
check("AI 解释渲染点带披露标记与 AIDisclosure 出口",
  /data-ai-disclosure="1"/.test(src) && /AIDisclosure/.test(src) && /FACT_GUARD/.test(src));
check("AI 调用走 Tutor.callChat（不自己 fetch）", /T\.callChat\(msgs/.test(src) && src.indexOf("fetch(") === -1);
check("未命中词只在本地记录且可清空（不发送选中文本）",
  /fte-lookup-miss-v1/.test(src) && /lk-miss-clear/.test(src) && !/navigator\.sendBeacon|XMLHttpRequest/.test(src));
check("查词页说明「不记录选中内容」的隐私口径", /不记录你选中了什么/.test(src));
check("样式含高亮两色与词卡/打印无关的响应式规则", /\.rd-word\.rd-learned/.test(css) && /\.rd-word\.rd-vocab/.test(css) && /\.rd-card-pop/.test(css));

console.log("\n=== " + (failed ? "有断言失败（" + failed + "）" : "全部通过") + " ===");
process.exit(failed ? 1 : 0);
