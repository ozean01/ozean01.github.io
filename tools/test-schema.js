#!/usr/bin/env node
/* 验收测试：进度数据结构版本化（js/schema.js）迁移框架。
   运行：node tools/test-schema.js */
"use strict";
const path = require("path");
global.window = { console };
require(path.join(__dirname, "..", "js", "schema.js"));
const S = global.window.FTE_SCHEMA;

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

check("SCHEMA 为 >=1 整数", typeof S.SCHEMA === "number" && S.SCHEMA >= 1 && Number.isInteger(S.SCHEMA), "SCHEMA=" + S.SCHEMA);

/* 旧数据（无 schema 字段）→ 升级到当前版本，且保留原有字段 */
const old = { learned: { "1-0": true }, calc: { x: 1 } };
const m1 = S.migrate(old);
check("无 schema 的旧数据被升级", m1 && m1.schema === S.SCHEMA);
check("旧字段保留", m1 && m1.learned["1-0"] === true && m1.calc.x === 1);

/* 已是当前版本 → 不动 */
const cur = { schema: S.SCHEMA, learned: { "1-1": true } };
const m2 = S.migrate(cur);
check("已是当前版本→原样返回", m2 === cur);

/* 未来版本 → 不降级，保留数据 */
const fut = { schema: S.SCHEMA + 1, learned: { "1-2": true }, futureField: "keepme" };
const m3 = S.migrate(fut);
check("未来版本不降级", m3 && m3.schema === S.SCHEMA + 1 && m3.futureField === "keepme");

/* 非对象 / null → 原样 */
check("null 原样返回", S.migrate(null) === null);
check("非对象原样返回", S.migrate(5) === 5);

console.log(pass ? "=== ALL PASS ===" : "=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
