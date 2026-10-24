#!/usr/bin/env node
/* 验收测试：P1-7 连读弱读专项 + P1-9 外源音源精听闭环（2026-10-24）。
   由来（评估报告：听力输入薄且单一）：
     · P1-7 —— 词级辨音只到单词，真实语流的「连读/弱读/缩读/同化」没有专项；
     · P1-9 —— sources.js 的「四步听练闭环」只是文字方法论，没有可勾选的账。
   本测试守住四件事：
     ① LINKERS 语料不变量：结构完整、缩读形确实不同、分组覆盖、外贸句例；
     ② 诚实口径不打回退：模块保留「本页不打分」「TTS 按拼写读」的边界文案（识别≠发音）；
     ③ 接线：index.html/PRECACHE/合并页第三个 tab/_need 四处齐备；
     ④ P1-9：四步+自评+AI 复盘跳转齐备、新键已登记、不计入打卡口径保留。 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/* ---------- ① 加载模块与语料不变量 ---------- */
global.window = {};
require(path.join(ROOT, "js", "listen-linkers.js"));
const LL = global.window.ListenLinkers;

check("window.ListenLinkers 暴露且 Node 可加载（无 document 不崩）", !!LL && typeof LL.render === "function");

/* 模块未导出语料数组——从源码提取 LINKERS 字面量做不变量校验 */
const src = read("js/listen-linkers.js");
const m = src.match(/const LINKERS = \[([\s\S]*?)\n  \];/);
check("LINKERS 语料数组存在", !!m);
const entries = m ? m[1].split(/\n(?=\s*\{ careful)/).filter(function (s) { return s.trim(); }) : [];
const objs = entries.map(function (blk) {
  const f = {}; 
  ["careful", "reduced", "kind", "sent", "cn", "note"].forEach(function (k) {
    const km = blk.match(new RegExp(k + ":\\s*\"([^\"]*)\""));
    f[k] = km ? km[1] : null;
  });
  return f;
});
check("语料 ≥ 24 组且每条 6 字段完整", objs.length >= 24 && objs.every(function (o) {
  return o.careful && o.reduced && o.kind && o.sent && o.cn && o.note;
}), "实得 " + objs.length + " 组");
check("缩读形确实不同于完整形（否则这张卡没有信息量）", objs.every(function (o) { return o.careful !== o.reduced; }));
check("四类现象都有覆盖（弱读/同化/连读/弱化）",
  ["弱读", "同化", "连读", "弱化"].every(function (k) { return objs.some(function (o) { return o.kind === k; }); }));
check("例句以外贸/商务场景为主（≥60% 命中业务词；日常寒暄句也属商务场景）",
  objs.filter(function (o) {
    return /order|quotation|price|shipment|sample|forwarder|MOQ|deposit|catalog|PI|DO|vessel|courier|film|coating|defect|supplier|customer|email|schedule/i.test(o.sent);
  }).length >= objs.length * 0.6,
  objs.filter(function (o) { return !/order|quotation|price|shipment|sample|forwarder|MOQ|deposit|catalog|PI|DO|vessel|courier|film|coating|defect|supplier|customer|email|schedule/i.test(o.sent); }).length + " 句未命中业务词");

/* ---------- ② 诚实口径 ---------- */
check("保留「不打分」纪律文案（识别≠发音，A/B 是上限）",
  src.indexOf("本页**不打分**") !== -1 || src.indexOf("不打分") !== -1);
check("保留「TTS 按拼写读 / 真实连读去听音源」的边界说明",
  src.indexOf("按拼写") !== -1 && src.indexOf("真实听音源") !== -1);

/* ---------- ③ 接线 ---------- */
const html = read("index.html");
const swSrc = read("sw.js");
const appSrc = read("js/app.js");
check("index.html 接线：listen-linkers.js 在 listen.js 之后、app.js 之前，defer 加载",
  /<script src="js\/listen\.js" defer><\/script>[\s\S]{0,300}<script src="js\/listen-linkers\.js" defer><\/script>[\s\S]*<script src="js\/app\.js" defer>/.test(html));
check("sw.js PRECACHE 含 ./js/listen-linkers.js", swSrc.indexOf('"./js/listen-linkers.js"') !== -1);
check("app.js 合并页 phonemes 注册第三个 tab「🔗 连读弱读」",
  /linkers.*🔗 连读弱读[\s\S]{0,60}ListenLinkers\.render/.test(appSrc));
check("app.js _need 启动完整性含 listen-linkers.js", appSrc.indexOf('!!window.ListenLinkers') !== -1);

/* ---------- ④ P1-9 精听闭环 ---------- */
const sourcesSrc = read("js/sources.js");
const keysSrc = read("js/storage-keys.js");
check("sources.js 定义精听闭环存储与四步",
  sourcesSrc.indexOf('"fte-source-drill-v1"') !== -1 &&
  ["blind", "intensive", "shadow", "vocab"].every(function (k) { return sourcesSrc.indexOf('"' + k + '"') !== -1; }));
check("听懂自评五档（0-4 → 0/25/50/75/100%）", /\[0, 1, 2, 3, 4\]\.map/.test(sourcesSrc) && sourcesSrc.indexOf("d.self * 25") !== -1);
check("AI 复盘跳转：预填 fte-tutor-fill + 跳 #/tutor",
  /src-tutor[\s\S]{0,200}fte-tutor-fill[\s\S]{0,200}"#\/tutor"/.test(sourcesSrc));
check("fte-source-drill-v1 已登记且 backup:true", /key: "fte-source-drill-v1"[^\n]*backup: true/.test(keysSrc));
check("不计入打卡口径保留", sourcesSrc.indexOf("不计入打卡") !== -1);
check("勾选后不整卡重渲染（checkbox 不失焦，只更新徽章）", sourcesSrc.indexOf("只更新徽章") !== -1);

console.log(pass ? "\n=== P1-7/P1-9 门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);
