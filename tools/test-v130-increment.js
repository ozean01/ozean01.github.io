#!/usr/bin/env node
/* 验收测试：v1.30.0 递增批（2026-11-10，按用户转来的三篇外部参考文章筛选落地）
   四件事 + 打包纪律：
     A 同形异音（js/phonemes.js）：一条词条只能存一个 ipa → 补名词/动词重音对照 9 组；
       断言：组数 / 词形唯一 / 字段齐全 / 音标 GA 合规（含 ˈ、无 ɒ·əʊ）/ 例句必须含该词 /
             两读音标不同 / 名词重音在前·动词重音在后（laminate 例外）/ 区块接线 ph-say / 无内联事件
     B 计时诚实化（js/app.js coachTick）：页面切后台/锁屏不计时不推进倒计时
     C 听音源目录（js/sources.js）新增 4 条：全部 https 外链；每日英语听力标 free:false（口径诚实）
     D 素材投料口（js/material.js）加一句「练自己的话」引导
     E 打包纪律：PRECACHE 仍 69 条、CACHE fte-v146、版本号单一来源 1.30.0 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = function (f) { return fs.readFileSync(path.join(ROOT, f), "utf8"); };
let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) pass = false;
}

/* ---------------- A 同形异音 ---------------- */
const appEl = { innerHTML: "", scrollIntoView: function () { } };
const ctx = vm.createContext({
  console: console,
  document: {
    addEventListener: function () { },
    getElementById: function (id) { return id === "app" ? appEl : null; },
    querySelector: function () { return null; }
  },
  window: {
    scrollTo: function () { },
    FTE_BOOT: { DATA: { units: [] }, State: {}, progress: { rate: 1 } }
  }
});
vm.runInContext(read("js/phonemes.js"), ctx, { filename: "phonemes.js" });
const P = ctx.window.Phonemes;
const T = P && P._t;
check("导出 _t.STRESS_PAIRS 与 _t.stressPairsHtml",
  !!(T && Array.isArray(T.STRESS_PAIRS) && typeof T.stressPairsHtml === "function"));

const SP = (T && T.STRESS_PAIRS) || [];
check("同形异音 ≥ 8 组（外贸高频：合同/进出口/记录/项目/许可/生产/复合/混合料）", SP.length >= 8, "n=" + SP.length);
const words = SP.map(function (p) { return p.w; });
check("词条唯一（重复会出现两张卡教同一个词）", new Set(words).size === words.length);

const BAD = [];
SP.forEach(function (p) {
  if (!/^[a-z]+$/.test(String(p.w || ""))) BAD.push(p.w + " 词形非法");
  ["a", "b"].forEach(function (k) {
    const s = p[k] || {};
    if (!s.pos || !s.ipa || !s.cn || !s.ex || !s.exCn) BAD.push(p.w + "." + k + " 字段不全");
    if (!/^\/.+\/$/.test(String(s.ipa || ""))) BAD.push(p.w + "." + k + " 音标未用 /…/");
    if (String(s.ipa || "").indexOf("ˈ") < 0) BAD.push(p.w + "." + k + " 缺主重音 ˈ");
    if (/ɒ|əʊ/.test(String(s.ipa || ""))) BAD.push(p.w + "." + k + " 用了非 GA 记号 ɒ/əʊ");
    if (String(s.ex || "").toLowerCase().indexOf(p.w) < 0) BAD.push(p.w + "." + k + " 例句未含该词");
  });
  if (p.a && p.b && p.a.ipa === p.b.ipa) BAD.push(p.w + " 两读音标相同");
});
check("每组字段齐全 / 音标 GA 合规 / 例句含该词 / 两读不同", BAD.length === 0, BAD.slice(0, 6).join("；"));

/* laminate 是「元音变化型」（/ˈlæmɪnət/ vs /ˈlæmɪneɪt/，两读首音节都重读），其余是「重音前移型」 */
const badVerb = SP.filter(function (p) { return p.w !== "laminate"; }).filter(function (p) {
  return String((p.b && p.b.ipa) || "").indexOf("/ˈ") === 0;
});
check("名词重音在前、动词重音在后（laminate 例外：元音变，两读都在首音节）",
  badVerb.length === 0, badVerb.map(function (p) { return p.w + ":" + p.b.ipa; }).join(" "));

const spHtml = T.stressPairsHtml();
check("区块渲染接上 🔊 例句按钮（data-action=ph-say）与网格容器",
  /data-action="ph-say"/.test(spHtml) && /spair-grid/.test(spHtml));
check("区块写明诚实口径：TTS 按拼写读、拿不准人工核对",
  /TTS 按拼写读/.test(spHtml) && /人工核对/.test(spHtml));
P.render();
check("音素页 render 内含「🔀 同形异音」区块（不是死数据）",
  /同形异音/.test(appEl.innerHTML) && /spair-grid/.test(appEl.innerHTML));

const phSrc = read("js/phonemes.js");
const blkStart = phSrc.indexOf("const STRESS_PAIRS");
const blkEnd = phSrc.indexOf("function highRiskHtml");
const blk = phSrc.slice(blkStart, blkEnd);
check("同形异音区块无内联事件处理器（严格 CSP：只有 data-action 委托）",
  blkStart > 0 && blkEnd > blkStart && !/\son[a-z]+\s*=/i.test(blk));

/* ---------------- B 计时诚实化 ---------------- */
const appSrc = read("js/app.js");
const tickStart = appSrc.indexOf("function coachTick");
const tick = appSrc.slice(tickStart, appSrc.indexOf("function coachFinish"));
check("coachTick 在记账前先判 document.hidden",
  tick.indexOf("document.hidden") >= 0 && tick.indexOf("document.hidden") < tick.indexOf("coachCreditSecs()"));
check("隐藏态直接收尾：既不记账也不推进倒计时（不是只跳过一行）",
  /if \(typeof document !== "undefined" && document\.hidden\) \{ coachRedraw\(\); return; \}/.test(tick));

/* ---------------- C 听音源 +4 ---------------- */
global.window = {};
require(path.join(ROOT, "js", "sources.js"));
const S = global.window.FTE_SOURCES;
const items = (S && S.items) || [];
const NEW = [
  "Breaking News English · 分级新闻课（3600+ 课）",
  "每日英语听力（欧路）· 分级听力库",
  "Merriam-Webster · 英文释义 + 真人发音",
  "EnglishClub · 语法/发音/写作分区参考"
];
const missing = NEW.filter(function (n) { return !items.some(function (it) { return it.name === n; }); });
check("新增 4 条音源都在目录里", missing.length === 0, missing.join(" / "));
check("新增条目全部站外 https 外链（纯静态站不嵌第三方音频）", NEW.every(function (n) {
  const it = items.filter(function (x) { return x.name === n; })[0];
  return it && /^https:\/\/[^\s]+$/.test(String(it.url || ""));
}));
check("口径诚实：每日英语听力标 free:false（部分课程需登录或会员，不假装全免费）",
  items.some(function (it) { return /每日英语听力/.test(it.name) && it.free === false; }));
check("音源 name 仍全站唯一", new Set(items.map(function (it) { return it.name; })).size === items.length, "n=" + items.length);

/* ---------------- D 素材投料口引导 ---------------- */
const matSrc = read("js/material.js");
check("投料口有「练自己的话」引导（邮件 / 朋友圈原话 → 拆成句子 → AI 改成地道说法）",
  /别只练别人的文章/.test(matSrc) && /朋友圈/.test(matSrc) && /拆成句子/.test(matSrc));

/* ---------------- E 打包纪律 ---------------- */
const sw = read("sw.js");
const pre = /const PRECACHE\s*=\s*\[([\s\S]*?)\];/.exec(sw);
const entries = pre ? (pre[1].match(/"[^"]+"/g) || []) : [];
check("PRECACHE 仍 69 条（本批无新脚本、不加请求）", entries.length === 69, "n=" + entries.length);
check("CACHE 已升到 fte-v146", /const CACHE = "fte-v146"/.test(sw));
check("版本号单一来源：pwa-init.js 与 package.json 同为 1.30.0",
  /window\.FTE_VERSION = "1\.30\.0"/.test(read("js/pwa-init.js")) &&
  /"version": "1\.30\.0"/.test(read("package.json")));

console.log(pass ? "\n=== v1.30.0 递增批门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);
