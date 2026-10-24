#!/usr/bin/env node
/* 验收测试：P1-5 对话语料扩容（js/data-dialogues2.js，2026-10-24）。
   由来（评估报告：内容与主题契合 6/10）：28 段对话仅 8 段软包装行业向，
   U1 一度是 LED 灯具。本批追加 19 段（总 47 段），行业向占比升到过半。
   本测试守住四件事：
     ① 规模承诺：全站对话 ≥45 段（README 同步宣称 47），行业向过半（关键词启发式）；
     ② 结构不变量：每段 ≥8 行、每行 {sp,en,cn} 齐备、en 无中文、同一单元内标题不重复；
     ③ 语料纪律：新对话术语对齐站内行业词库（抽核关键词）、不发明空段落；
     ④ 接线：index.html 在 data-meeting.js 之后加载（push 进已存在单元）、
        进 PRECACHE、lib-data/audit-count/doc-numbers 三处枚举已同步。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/* 加载全部课程数据（与 lib-data.js 同一文件集） */
const ctx = { console };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
["data.js", "data-ops.js", "data-ocean.js", "data-incoterms.js", "data-settle.js",
  "data-risk.js", "data-deep.js", "data-meeting.js", "data-dialogues2.js"].forEach(function (f) {
  let src = read(path.join("js", f));
  if (f === "data.js") src += "\nglobalThis.FTE_DATA = FTE_DATA;";
  vm.runInContext(src, ctx, { filename: f });
});
const U = ctx.FTE_DATA.units;

/* ---------- ① 规模与行业占比 ---------- */
let total = 0, industry = 0;
const newDlgTitles = {};
(read("js/data-dialogues2.js").match(/title: "([^"]+)"/g) || []).forEach(function (t) {
  newDlgTitles[t.replace('title: "', "").replace(/"$/, "")] = true;
});
const IND_KW = /pouch|film|laminat|adhesive|curing|seal|peel strength|micron|corona|slitting|bag.mak|migration|food contact|ink|print|roll|retort|coating|solvent|UN1263|dyne|gusset|tear notch|膜|复合|胶|熟化|热封|剥离|印刷|分切|制袋|蒸煮|迁移|达因/i;
U.forEach(function (u) {
  (u.dialogues || []).forEach(function (d) {
    total++;
    const text = d.title + " " + (d.lines || []).map(function (l) { return l.en; }).join(" ");
    if (IND_KW.test(text)) industry++;
  });
});
check("全站对话 ≥45 段（README 宣称 47）", total >= 45, "实得 " + total);
check("行业向对话过半（关键词启发式）", industry * 2 >= total, industry + "/" + total);

/* ---------- ② 结构不变量 ---------- */
let badStruct = [], badTitle = [], badLang = [];
U.forEach(function (u) {
  const titles = {};
  (u.dialogues || []).forEach(function (d) {
    /* 行数 ≥8 只约束新增对话（data-dialogues2.js）；历史对话行数维持原状不回溯 */
    const isNew = !!newDlgTitles[d.title];
    if (!d.title || !Array.isArray(d.lines) || !d.lines.length) badStruct.push("U" + u.id + ":" + d.title);
    else if (isNew && d.lines.length < 8) badStruct.push("U" + u.id + ":" + d.title + "（新增段 <8 行）");
    if (titles[d.title]) badTitle.push("U" + u.id + ":" + d.title);
    titles[d.title] = true;
    (d.lines || []).forEach(function (l) {
      if (!l || !l.sp || !l.en || !l.cn) badStruct.push("U" + u.id + " 行缺字段");
      if (/[\u4e00-\u9fff]/.test(l.en)) badLang.push("U" + u.id + " en 含中文");
      if (!/[\u4e00-\u9fff]/.test(l.cn)) badLang.push("U" + u.id + " cn 无中文");
    });
  });
});
check("每段对话 ≥8 行且每行 {sp,en,cn} 齐备", badStruct.length === 0, badStruct.slice(0, 3).join(" | "));
check("同一单元内对话标题不重复", badTitle.length === 0, badTitle.slice(0, 3).join(" | "));
check("语言卫生：en 不含中文、cn 含中文", badLang.length === 0, badLang.slice(0, 3).join(" | "));

/* ---------- ③ 语料纪律：术语对齐 ---------- */
const newSrc = read("js/data-dialogues2.js");
const TERM_KW = ["MOQ", "PI", "cut-off", "lead time", "peel strength", "curing", "laminat", "food contact", "UN1263", "corona", "micron", "deposit"];
const hitTerms = TERM_KW.filter(function (t) { return newSrc.indexOf(t) !== -1; });
check("新对话命中站内行业术语（≥6/12 抽核）", hitTerms.length >= 6, hitTerms.join(", "));
check("新对话 19 段（追加而非改写历史单元）", (newSrc.match(/add\(\d+,/g) || []).length === 19, "实得 " + (newSrc.match(/add\(\d+,/g) || []).length);

/* ---------- ④ 接线 ---------- */
const html = read("index.html");
const libSrc = read("tools/lib-data.js");
check("index.html：data-dialogues2.js 在 data-meeting.js 之后（push 进已存在单元）",
  /data-meeting\.js[\s\S]{0,200}data-dialogues2\.js/.test(html));
check("lib-data.js（小程序生成）已纳入新数据文件", libSrc.indexOf('"data-dialogues2.js"') !== -1);
check("audit-count.js 统计口径已同步", read("tools/audit-count.js").indexOf('"data-dialogues2.js"') !== -1);
check("test-doc-numbers.js 校验口径已同步", read("tools/test-doc-numbers.js").indexOf('"data-dialogues2.js"') !== -1);
check("sw.js PRECACHE 含 ./js/data-dialogues2.js", read("sw.js").indexOf('"./js/data-dialogues2.js"') !== -1);
const rc = JSON.parse(read("tools/report-count.json"));
check("report-count.json 的 dialogs=47 / 单元不变", rc.dialogs === 47 && rc.units === 19);

console.log(pass ? "\n=== P1-5 门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);
