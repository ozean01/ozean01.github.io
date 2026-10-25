#!/usr/bin/env node
/* 验收测试：批次 B（2026-10-24）——可用性测试脚本 + 无后端反馈通道。
   守住四件事：
     ① docs/usability-script.md 存在且结构完整（3 任务 × 成功标准 × 红旗 × 记录模板）；
     ② 反馈通道零后端：导出走本地 Blob 下载，路径里不得出现 fetch/XHR/上传端点；
     ③ 反馈不落库：不写 localStorage（不新增存储键，注册表对账不破）；
     ④ 测试脚本与站内现实一致：任务引用的功能（场景急救/i+1 挖掘）真实存在。 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

const script = read("docs/usability-script.md");
const appSrc = read("js/app.js");
const html = read("index.html");
const keysSrc = read("js/storage-keys.js");

/* ---------- ① 测试脚本 ---------- */
check("usability-script.md 存在且含 3 个任务", script.indexOf("任务 1") !== -1 && script.indexOf("任务 2") !== -1 && script.indexOf("任务 3") !== -1);
check("每个任务有成功标准与红旗", (script.match(/成功标准/g) || []).length === 3 && (script.match(/红旗/g) || []).length >= 3);
check("含记录模板与汇总规则（完成率目标）", script.indexOf("记录模板") !== -1 && script.indexOf("完成率目标") !== -1);

/* ---------- ② 反馈通道 ---------- */
check("设置页有反馈入口（textarea + 导出按钮）",
  html.indexOf('id="feedbackText"') !== -1 && html.indexOf('data-action="settings-feedback"') !== -1);
check("导出实现走本地 Blob 下载（URL.createObjectURL + a.click）",
  /exportFeedback[\s\S]{0,600}createObjectURL[\s\S]{0,300}a\.click\(\)/.test(appSrc));
check("反馈路径零后端：exportFeedback 函数体内无 fetch/XHR/sendBeacon",
  (function () {
    const seg = appSrc.split("function exportFeedback")[1] || "";
    const body = seg.split("function testAzure")[0];
    return body.indexOf("fetch") === -1 && body.indexOf("XMLHttpRequest") === -1 && body.indexOf("sendBeacon") === -1;
  })());
check("反馈不落库（函数体内无 localStorage.setItem）",
  (function () {
    const seg = appSrc.split("function exportFeedback")[1] || "";
    return seg.split("function testAzure")[0].indexOf("localStorage.setItem") === -1;
  })());
check("导出文件带版本号与时间戳", appSrc.indexOf("FTE_VERSION") !== -1 && appSrc.indexOf("toLocaleString") !== -1);

/* ---------- ③ 注册表对账 ---------- */
check("无新增存储键（反馈是即写即导出，不持久化）", keysSrc.indexOf("fte-feedback") === -1);

/* ---------- ④ 与站内现实一致 ---------- */
check("任务 2 引用的场景急救真实存在（urgent.js 接线未拆）", html.indexOf('js/urgent.js') !== -1);
check("任务 3 引用的 i+1 挖掘真实存在（material.js 的 mat-mine-toggle 接线未拆）",
  html.indexOf('js/material.js') !== -1 && read("js/material.js").indexOf("mat-mine-toggle") !== -1);

console.log(pass ? "\n=== 批次 B 门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);
