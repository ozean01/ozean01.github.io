#!/usr/bin/env node
/* 验收测试：🔤 音素课 (js/phonemes.js)。
   最有分量的一条断言是「分词器对全语料 0 未识别」——它保证音素表与 768 条真实音标
   永远对得上：将来有人加了带新音素的词条，这里会立刻报警，而不是页面悄悄少给例词。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const DATA_FILES = ["data.js", "data-ops.js", "data-ocean.js", "data-incoterms.js", "data-settle.js", "data-risk.js", "data-deep.js", "data-meeting.js"];

/* ---- 用 vm 共享上下文加载真实课程数据（FTE_DATA 是词法全局，不是 window 属性） ---- */
const ctx = vm.createContext({ console: console, window: {} });
DATA_FILES.forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", f), "utf8"), ctx, { filename: f });
});
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "difficulty-map.js"), "utf8"), ctx, { filename: "difficulty-map.js" });
const UNITS = vm.runInContext("FTE_DATA.units", ctx);
const DIFF = ctx.window.FTE_DIFF;
global.FTE_DIFF = DIFF;

/* ---- 最小假 DOM ---- */
const appEl = { innerHTML: "", scrollIntoView: function () { } };
global.document = {
  addEventListener: function () { },
  getElementById: function (id) { return id === "app" ? appEl : null; },
  querySelector: function () { return null; }
};
global.window = { scrollTo: function () { }, FTE_BOOT: { DATA: { units: UNITS }, State: {}, progress: { rate: 1 } } };

require(path.join(ROOT, "js", "phonemes.js"));
const P = global.window.Phonemes;
const T = P._t;

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

/* ---------------- ① 模块形态与音素表自洽 ---------------- */
check("导出 Phonemes.render", P && typeof P.render === "function");
check("导出测试钩子 _t", !!T && typeof T.tokenize === "function" && Array.isArray(T.PHONEMES));
const PH = T.PHONEMES;
check("音素表 41 条", PH.length === 41, "n=" + PH.length);

const byType = {};
PH.forEach(function (p) { byType[p.type] = (byType[p.type] || 0) + 1; });
check("单元音 12 / 双元音 5 / 辅音 24",
  byType.vowel === 12 && byType.diphthong === 5 && byType.consonant === 24, JSON.stringify(byType));

const symbols = PH.map(function (p) { return p.ipa; });
check("音素符号无重复", new Set(symbols).size === symbols.length);
check("每条都有中文名与发音要点",
  PH.every(function (p) { return p.zh && p.zh.length > 1 && p.tip && p.tip.length > 8; }));
check("发音要点不含未渲染的 markdown 标记",
  PH.every(function (p) { return p.tip.indexOf("**") === -1 && p.tip.indexOf("__") === -1; }));
check("易混音都指向表内存在的音素",
  PH.every(function (p) { return (p.contrast || []).every(function (c) { return symbols.indexOf(c) !== -1; }); }));
check("易混音不含自己", PH.every(function (p) { return (p.contrast || []).indexOf(p.ipa) === -1; }));
check("至少 20 个音素给了易混音对",
  PH.filter(function (p) { return (p.contrast || []).length; }).length >= 20);

/* ---------------- ② 分词器：对真实语料零未识别（核心断言） ---------------- */
let checked = 0, unknown = {}, samples = [];
UNITS.forEach(function (u) {
  (u.vocab || []).forEach(function (v) {
    if (!v.ipa) return;
    checked++;
    T.tokenize(v.ipa).forEach(function (t) {
      if (t[0] === "?") {
        unknown[t] = (unknown[t] || 0) + 1;
        if (samples.length < 8) samples.push(u.id + " " + v.w + " " + v.ipa);
      }
    });
  });
});
check("扫描到全部 768 条音标", checked === 768, "n=" + checked);
check("分词器零未识别字符", Object.keys(unknown).length === 0,
  Object.keys(unknown).length ? JSON.stringify(unknown) + "  例: " + samples.join(" | ") : "");

/* 多字符音素必须整体成词，不能被拆开 */
const tk = T.tokenize("/ˈmænjuˈfæktʃərər/");
check("tʃ 未被拆成 t+ʃ", tk.indexOf("tʃ") !== -1 && tk.indexOf("t") === -1, JSON.stringify(tk));
check("多字符音素排在单字符之前（最长匹配）", T.INVENTORY.indexOf("aɪ") < T.INVENTORY.indexOf("a"));
check("重音符号与斜杠不入 token", tk.indexOf("ˈ") === -1 && tk.indexOf("/") === -1);
check("多读音逗号被跳过", T.tokenize("/ˌtiː iː ˈjuː, ˌef iː ˈjuː/").indexOf(",") === -1);
check("空值安全", T.tokenize("").length === 0 && T.tokenize(null).length === 0);

/* ---------------- ③ 索引：每个音素都有站内行业例词 ---------------- */
const idx = T.buildIndex(UNITS);
check("索引覆盖全部 41 个音素", PH.every(function (p) { return Array.isArray(idx[p.ipa]); }));
const empty = PH.filter(function (p) { return (idx[p.ipa] || []).length === 0; });
check("每个音素都至少有一个站内例词", empty.length === 0,
  empty.length ? "无例词: " + empty.map(function (p) { return p.ipa; }).join(" ") : "");

const iLong = idx["iː"] || [];
check("例词条目字段完整",
  iLong.every(function (x) { return x.w && x.ipa && x.unitId && typeof x.cn === "string"; }));
const iLongWords = iLong.map(function (x) { return x.w; });
const iLongDup = iLongWords.filter(function (w, i) { return iLongWords.indexOf(w) !== i; });
check("同一个词在同一个音素下不重复", iLongDup.length === 0,
  "n=" + iLong.length + " 去重后=" + new Set(iLongWords).size + " 重复=" + JSON.stringify(iLongDup.slice(0, 8)));

/* 全部 41 个音素都不许有重复词 */
let allDup = 0;
Object.keys(idx).forEach(function (p) {
  const ws = idx[p].map(function (x) { return x.w; });
  allDup += ws.length - new Set(ws).size;
});
check("41 个音素例词全部无重复", allDup === 0, "重复总数=" + allDup);

/* 行业术语优先排序：造一份合成数据验证 */
const synth = [{ id: 99, title: "T", vocab: [
  { w: "aaaa", ipa: "/æ/", cn: "" },
  { w: "laminating adhesive", ipa: "/æ/", cn: "复合胶" }
] }];
const sIdx = T.buildIndex(synth);
const first = sIdx["æ"][0];
const d = DIFF && DIFF.words && DIFF.words["laminating adhesive"];
check("行业术语（专）优先排在例词前面",
  !!(d && d.dom) && first.w === "laminating adhesive", "first=" + first.w + " dom=" + !!(d && d.dom));
check("非术语时短词优先", sIdx["æ"][1].w === "aaaa");

/* 覆盖率统计（不设门限，仅输出，便于观察课程与语料的贴合度） */
const cover = PH.map(function (p) { return { ipa: p.ipa, n: (idx[p.ipa] || []).length }; });
console.log("\n-- 例词最多的 8 个音素 --");
cover.slice().sort(function (a, b) { return b.n - a.n; }).slice(0, 8)
  .forEach(function (c) { console.log("  " + c.ipa + "  " + c.n + " 词"); });
console.log("-- 例词最少的 8 个音素 --");
cover.slice().sort(function (a, b) { return a.n - b.n; }).slice(0, 8)
  .forEach(function (c) { console.log("  " + c.ipa + "  " + c.n + " 词"); });

/* ---------------- ④ 渲染冒烟 ---------------- */
let renderErr = null;
try { P.render(); } catch (e) { renderErr = e; }
const html = appEl.innerHTML;
check("render() 不抛错", !renderErr, renderErr && renderErr.message);
check("渲染出音素卡片网格", html.indexOf('class="ph-grid"') !== -1);
check("渲染出全部 41 张卡片", (html.match(/class="ph-card/g) || []).length === 41,
  "n=" + (html.match(/class="ph-card/g) || []).length);
check("卡片含音素符号与中文名", html.indexOf("长音「衣」") !== -1 && html.indexOf("卷舌近音") !== -1);
check("卡片含站内例词按钮", html.indexOf('class="ph-word"') !== -1);
check("渲染出分组筛选 chip", html.indexOf('data-action="ph-group" data-id="vowel"') !== -1);

/* 分组筛选后卡片数量正确 */
P._state.group = "consonant";
P.render();
check("切到「辅音」只渲染 24 张", (appEl.innerHTML.match(/class="ph-card/g) || []).length === 24,
  "n=" + (appEl.innerHTML.match(/class="ph-card/g) || []).length);
P._state.group = "vowel";
P.render();
check("切到「单元音」只渲染 12 张", (appEl.innerHTML.match(/class="ph-card/g) || []).length === 12);
P._state.group = "all";

/* ---------------- ⑤ 接线门禁 ---------------- */
const htmlSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const appjs = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
const style = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");

check("index.html 已引入 js/phonemes.js", /<script src="js\/phonemes\.js"><\/script>/.test(htmlSrc));
check("phonemes.js 在 app.js 之前加载", htmlSrc.indexOf("js/phonemes.js") < htmlSrc.indexOf("js/app.js"));
check("index.html 导航含 #/phonemes 入口", /href="#\/phonemes"/.test(htmlSrc));
check("app.js 路由表含 phonemes", /"mysay",\s*"phonemes"/.test(appjs));
check("app.js renderRoute 分派 Phonemes.render", /route\.view === "phonemes"\)\s*window\.Phonemes\.render\(\)/.test(appjs));
check("app.js 启动校验注册了 Phonemes", /_need\("音素课 phonemes\.js", !!window\.Phonemes\)/.test(appjs));
check("sw.js 预缓存含 ./js/phonemes.js", /"\.\/js\/phonemes\.js"/.test(sw));
check("音素课样式已定义", /\.ph-card\{/.test(style) && /\.ph-word\{/.test(style) && /\.ph-grid\{/.test(style));

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
