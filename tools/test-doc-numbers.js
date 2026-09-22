#!/usr/bin/env node
/* 验收：文档数字与实测数据对账（Phase 4 · P4-2）

   为什么需要它：README 曾同时写着「848 句骨架」（实测 941）与「691 个词汇」（实测 768），
   而 README 自己又声明「历史上曾出现数字矛盾，现由脚本兜底」——说明当时的兜底只覆盖了
   报告类数字（audit-count 的 report-count.json），**没有覆盖 README 正文里的宣称**。
   本门禁把二者绑死：数字以后只在数据里改，文档必须跟着对。

   口径：所有数字都从 js/ 的实际数据现场计算（含 patterns.js 的骨架抽取），不读任何缓存文件。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const WEB_JS = path.join(ROOT, "js");
let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) pass = false;
}

/* ---------- 现场计算 ---------- */
function loadSite() {
  const ctx = { console };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  ["data.js", "data-ops.js", "data-ocean.js", "data-incoterms.js", "data-settle.js",
    "data-risk.js", "data-deep.js", "data-meeting.js", "data-mail.js",
    "parser.js", "patterns.js"].forEach(function (f) {
    let src = fs.readFileSync(path.join(WEB_JS, f), "utf8");
    if (f === "data.js") src += "\nglobalThis.FTE_DATA = FTE_DATA;";
    vm.runInContext(src, ctx, { filename: f });
  });
  return ctx;
}

const ctx = loadSite();
const DATA = ctx.FTE_DATA;
const MAIL = ctx.FTE_MAIL;

const n = { words: 0, phrases: 0, dialogues: 0, lines: 0, ipa: 0 };
(DATA.units || []).forEach(function (u) {
  n.words += (u.vocab || []).length;
  n.phrases += (u.phrases || []).length;
  n.dialogues += (u.dialogues || []).length;
  (u.dialogues || []).forEach(function (d) { n.lines += (d.lines || []).length; });
  (u.vocab || []).forEach(function (v) { if (v.ipa) n.ipa++; });
});
n.frames = (ctx.window.Patterns && ctx.window.Patterns.build) ? ctx.window.Patterns.build().length : 0;
n.mail = (MAIL && MAIL.threads) ? MAIL.threads.length : 0;
n.units = (DATA.units || []).length;

console.log("-- 实测（现场计算）--");
Object.keys(n).forEach(function (k) { console.log("  " + k.padEnd(10) + n[k]); });

const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

/* ---------- 断言：README 必须出现实测值（允许若干等价写法） ---------- */
function claims(name, value, patterns) {
  const hit = patterns.some(function (p) { return readme.indexOf(p) !== -1; });
  check("README 的数量宣称与实测一致：" + name + " = " + value, hit,
    hit ? "" : "未找到任一写法：" + patterns.join(" / "));
}

const v = String(n.words), p = String(n.phrases), d = String(n.dialogues), f = String(n.frames), l = String(n.lines), u = String(n.units);
claims("词汇", v, [v + " 词汇", v + " 词", v + " 个核心词汇", v + " 个"]);
claims("短语", p, [p + " 条短语", p + " 短语", p + " 条"]);
claims("对话", d, [d + " 段对话", d + " 段"]);
claims("句型骨架", f, [f + " 句", f + " 条骨架", f + " 条"]);
claims("单元数", u, [u + " 个单元", u + " 单元", u + " 个"]);

/* 最容易被顺手改掉的那一行（全站合计） */
check("README 的「全站合计」一行与实测一致",
  readme.indexOf(v + " 词汇 / " + p + " 短语 / " + d + " 段对话") !== -1 ||
  readme.indexOf(v + " 词汇 / " + p + " 短语 / " + d + " 段对话") !== -1,
  "实测：" + v + " 词汇 / " + p + " 短语 / " + d + " 段对话");

/* ---------- 断言：历史遗留的错误数字不得复活 ---------- */
[["848 句", "句型骨架旧值（实测 " + f + "）"], ["691 个", "词汇旧值（实测 " + v + "）"], ["691 词", "词汇旧值"]]
  .forEach(function (pair) {
    check("README 不含历史错误数字「" + pair[0] + "」（" + pair[1] + "）",
      readme.indexOf(pair[0]) === -1);
  });

/* ---------- 断言：报告类数字与数据一致（report-count.json 由 audit-count 重算） ---------- */
let rc = null;
try { rc = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "report-count.json"), "utf8")); } catch (e) { rc = null; }
check("tools/report-count.json 存在且可解析", !!rc);
if (rc) {
  /* 逐字段精确比对（不要用「在 JSON 里搜数字」这种模糊写法——它会被别处的数字偶然命中） */
  [["vocab", n.words], ["ipa", n.ipa], ["phrases", n.phrases], ["dialogs", n.dialogues], ["units", n.units]]
    .forEach(function (pair) {
      check("report-count.json 的 " + pair[0] + " 与实测一致", rc[pair[0]] === pair[1],
        "报告 " + rc[pair[0]] + " vs 实测 " + pair[1] + "（若不一致请跑 node tools/audit-count.js）");
    });
}

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
