#!/usr/bin/env node
/* 单一数据源：从网页版课程数据（js/data*.js）重新生成微信小程序版 utils/data.js，
   使两端使用同一份内容。

   运行：node tools/sync-miniprogram-data.js    （在 外贸英语/ 目录下）
   输出：外贸英语小程序/utils/data.js
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { buildMiniprogramSource } = require("./lib-data.js");

const OUT = path.join(__dirname, "..", "..", "外贸英语小程序", "utils", "data.js");

const out = buildMiniprogramSource();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out, "utf8");

/* 顺手打印统计 */
const vm = require("vm");
const sandbox = { module: { exports: {} } };
vm.createContext(sandbox);
vm.runInContext(out, sandbox);
const units = sandbox.module.exports.units || [];
const vocab = units.reduce(function (n, u) { return n + (u.vocab || []).length; }, 0);
console.log("已生成: " + OUT);
console.log("单元数: " + units.length + "  |  词汇 : " + vocab);
