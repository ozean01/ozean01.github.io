#!/usr/bin/env node
/* 共享模块：从网页版课程数据构建「小程序版数据源」的纯函数。
   供 sync-miniprogram-data.js（生成写盘）与 check-single-source.js（漂移门禁）复用，
   确保两者对「什么是单一数据源」用同一套逻辑与口径。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WEB_JS = path.join(__dirname, "..", "js");
/* 参与课程结构的所有数据文件（data-mistakes/data-mnemonic 为易错点与助记语料，
   不属于单元结构，小程序版不合并，与 audit-count 口径一致） */
const FILES = ["data.js", "data-ops.js", "data-ocean.js", "data-incoterms.js", "data-settle.js", "data-risk.js", "data-deep.js", "data-meeting.js"];

function loadFTE() {
  const ctx = { console };
  vm.createContext(ctx);
  for (const f of FILES) {
    let src = fs.readFileSync(path.join(WEB_JS, f), "utf8");
    if (f === "data.js") src += "\nglobalThis.FTE_DATA = FTE_DATA;";
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx.FTE_DATA;
}

/* 返回可直接写入 utils/data.js 的字符串（CommonJS 单文件）。 */
function buildMiniprogramSource() {
  const FTE = loadFTE();
  const body = { site: FTE.site || {}, units: FTE.units || [] };
  const HEADER =
    "/**\n" +
    " * 由 外贸英语/js/data*.js 生成（node tools/sync-miniprogram-data.js）。\n" +
    " * ⚠️ 请勿手改——直接改网页版 js/data*.js 后重新生成即可。\n" +
    " * 与网页版保持一致；本文件为 CommonJS 导出（供小程序 require）。\n" +
    " */\n";
  return HEADER + "const FTE_DATA = " + JSON.stringify(body, null, 2) + ";\n\nmodule.exports = FTE_DATA;\n";
}

module.exports = { buildMiniprogramSource, loadFTE, FILES };
