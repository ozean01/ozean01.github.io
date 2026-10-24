#!/usr/bin/env node
/* 验收测试：音源质量感知层（设置页徽章 / 发音人标注 / native 试听，2026-10-24）。
   由来：设置页的「用 Edge / 用 Azure」是静态说明书——用户不知道当前听的是神经人声
   还是普通本地音、离最佳差几步。本批把「当前状态 + 下一步动作」做成实时徽章。
   本测试守住四件事：
     ① player.js 暴露 voiceQualityInfo / voiceScore（分级口径与内部优选同源，不许另写一套）；
     ② Node 无语音环境下分级返回 none 不崩（降级路径）；
     ③ 设置页接线：徽章容器 + 三引擎分级文案 + Azure Key/Region 输入联动 + native 试听；
     ④ 文案诚实：页脚过时的「发音使用浏览器自带的语音合成」必须被替换。 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/* ---------- ① 模块导出 ---------- */
global.window = {};
global.localStorage = { getItem: function () { return null; }, setItem: function () {} };
require(path.join(ROOT, "js", "player.js"));
const P = global.window.Player;
check("player.js 暴露 voiceQualityInfo 与 voiceScore（同一打分口径）",
  typeof P.voiceQualityInfo === "function" && typeof P.voiceScore === "function");

/* ---------- ② 降级路径（Node 无语音环境） ---------- */
const info = P.voiceQualityInfo();
check("无语音环境 → level=none 不崩", info && info.level === "none" && info.name === "" && info.hasNeural === false,
  JSON.stringify(info));

/* 模拟 voices 后分级正确：直接构造 environment 不可行（voices 是模块私有），
   退而求其次：校验分级依赖的 HIGH_QUALITY 正则口径存在于源码且被 voiceQualityInfo 使用 */
const pSrc = read("js/player.js");
check("分级口径复用 HIGH_QUALITY 正则（natural/online/neural…），未另写一套",
  (pSrc.split("function voiceLevelOf")[1] || "").indexOf("HIGH_QUALITY") !== -1);
check("目标人声选择顺序与 pickVoice 同口径（manual > accent > 全局优选）",
  (pSrc.split("Player.voiceQualityInfo = function")[1] || "").indexOf("defaultVoiceName") !== -1 &&
  (pSrc.split("Player.voiceQualityInfo = function")[1] || "").indexOf("accentVoiceName") !== -1);

/* ---------- ③ 设置页接线 ---------- */
const appSrc = read("js/app.js");
check("设置页徽章 paintEngineQuality：三引擎分级 + 缺语音环境处理",
  /function paintEngineQuality/.test(appSrc) &&
  appSrc.indexOf("神经网络 ✓") !== -1 &&
  appSrc.indexOf("普通本地音") !== -1 &&
  appSrc.indexOf("本浏览器还没有英语发音人") !== -1);
check("Azure 分支讲清 Key/Region 配对与免费额度", appSrc.indexOf("0.5M 字符/月") !== -1 && appSrc.indexOf("必须配对") !== -1);
check("Chrome 升级路径两条（Edge 零成本 / Azure 旗舰）",
  appSrc.indexOf("换 Edge 打开本站") !== -1 && appSrc.indexOf("Azure 语音」填 Key") !== -1);
check("本机有神经人声时引导选 ⭐（而不是空喊升级）", appSrc.indexOf("选 ⭐ 标记的那一个") !== -1);
check("发音人下拉按 voiceScore 排序并加 ⭐ 标注",
  appSrc.indexOf("Player.voiceScore(b) - Player.voiceScore(a)") !== -1 &&
  /natural\|online\|neural\|premium\|enhanced/i.test(appSrc));
check("native 试听接线（testNative 固定商务句 + speakNative 直达）",
  /function testNative/.test(appSrc) && appSrc.indexOf('data-action="settings-test-native"') !== -1 &&
  appSrc.indexOf("walk you through our quotation") !== -1);
check("Azure Key/Region 输入实时联动徽章", /azureKey\.addEventListener\("input", paintEngineQuality\)/.test(appSrc));

/* ---------- ④ index.html 与文案诚实 ---------- */
const html = read("index.html");
check("index.html 有徽章容器 #engineQuality 与试听按钮", html.indexOf('id="engineQuality"') !== -1 && html.indexOf('data-action="settings-test-native"') !== -1);
check("页脚过时文案已替换（不再宣称「使用浏览器自带的语音合成」）",
  html.indexOf("发音使用浏览器自带的语音合成") === -1 &&
  html.indexOf("当前音源质量见 ⚙ 设置页徽章") !== -1);

console.log(pass ? "\n=== 音源质量感知层门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);
