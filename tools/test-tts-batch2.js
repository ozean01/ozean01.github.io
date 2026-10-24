#!/usr/bin/env node
/* 验收测试：语音可靠性 + 引导 + Azure 增强（2026-10-24 第二/三批）。
   守住四件事：
     ① 无声 watchdog：speakNative 的 utterance 7 秒未 started → lastEngineIssue + onEngineIssue
        （不自动重播，避免双声）；onstart/onend/onerror 都要清计时器；
     ② 无神经人声一次性提示：本地音首读回调 onNoNeuralNotice（去重/落存储归 app，键已登记）；
     ③ Azure 增强：customerservice 风格 SSML（白名单 + 用户可关）与 48kHz 输出开关（默认关）；
     ④ 引导升级：Azure 三步开通 + 用量估算进设置页；Google 选项标「遗留」。 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

const pSrc = read("js/player.js");
const appSrc = read("js/app.js");
const html = read("index.html");
const keysSrc = read("js/storage-keys.js");

/* ---------- ① 无声 watchdog ---------- */
check("speakNative 有 7 秒无声 watchdog（lastEngineIssue + onEngineIssue）",
  /startTimer = setTimeout[\s\S]{0,200}lastEngineIssue[\s\S]{0,120}onEngineIssue/.test(pSrc));
check("onstart / onend / onerror 三条路径都清计时器",
  (pSrc.match(/clearWatch\(\)/g) || []).length >= 3,
  "实得 " + (pSrc.match(/clearWatch\(\)/g) || []).length + " 处");
check("watchdog 只记录与通知，不自动重播（无双声风险）",
  (function () {
    const seg = (pSrc.split("startTimer = setTimeout")[1] || "").split("\n    const handle = {")[0];
    return seg.indexOf("speakNative") === -1;
  })());
check("app 侧提示 30 秒去重（连听不刷屏）", appSrc.indexOf("_lastIssueToast") !== -1);

/* ---------- ② 无神经人声一次性提示 ---------- */
check("本地音首读回调 onNoNeuralNotice（仅在本机确实没有神经人声时）",
  /noNeuralFired[\s\S]{0,300}onNoNeuralNotice/.test(pSrc) &&
  pSrc.indexOf("hasNeural") !== -1);
check("app 侧去重落存储 fte-tts-nudge，文案指向设置页徽章",
  /onNoNeuralNotice = function[\s\S]{0,400}fte-tts-nudge[\s\S]{0,400}质量徽章/.test(appSrc));
check("fte-tts-nudge 已登记且 backup:false", /key: "fte-tts-nudge"[^\n]*backup: false/.test(keysSrc));

/* ---------- ③ Azure 增强 ---------- */
check("express-as 风格：customerservice + 人声白名单 + 用户可关（azure.style !== false）",
  /style !== false[\s\S]{0,120}AZURE_STYLE_VOICES\.test\(plan\.voice\)[\s\S]{0,120}mstts:express-as style="customerservice"/.test(pSrc));
check("48kHz 开关：azureOutputFormat 按 azure.hq 切换（默认 24kHz）",
  /azure\.hq\) \? "audio-48khz-192kbitrate-mono-mp3" : "audio-24khz-48kbitrate-mono-mp3"/.test(pSrc));
check("试连通性与正式合成共用同一输出格式口径（azureOutputFormat 定义 + 两处调用）",
  (pSrc.match(/azureOutputFormat\(\)/g) || []).length === 3,
  "实得 " + (pSrc.match(/azureOutputFormat\(\)/g) || []).length);
check("Player.azure 由 progress 注入 style/hq（默认：风格开、HQ 关）",
  appSrc.indexOf("style: progress.azureStyle !== false, hq: !!progress.azureHQ") !== -1 &&
  appSrc.indexOf("azureStyle: true, azureHQ: false") !== -1);
check("设置页两个新开关保存/回填齐备",
  appSrc.indexOf("progress.azureStyle = azureStyle ? azureStyle.checked : true") !== -1 &&
  appSrc.indexOf("progress.azureHQ = azureHQ ? !!azureHQ.checked : false") !== -1 &&
  appSrc.indexOf("azureStyle.checked = progress.azureStyle !== false") !== -1);

/* ---------- ④ 引导升级 ---------- */
check("Azure 三步开通引导（portal → Key 1 → Region 配对）",
  html.indexOf("portal.azure.com") !== -1 && html.indexOf("Key 1") !== -1 && html.indexOf("不配对会 403") !== -1);
check("免费额度用量估算（0.5M/月 · 连听一遍 ≈ 5K 字符）",
  html.indexOf("0.5M 字符/月") !== -1 && html.indexOf("5K 字符") !== -1);
check("两个新开关与 Google 遗留标注进设置页",
  html.indexOf('id="setAzureStyle"') !== -1 && html.indexOf('id="setAzureHQ"') !== -1 &&
  html.indexOf("Google 在线音源（遗留 · 不推荐，下版移除）") !== -1);

/* ---------- 模块仍可 Node 加载（回归守卫） ---------- */
global.window = {};
global.localStorage = { getItem: function () { return null; }, setItem: function () {} };
require(path.join(ROOT, "js", "player.js"));
const P = global.window.Player;
check("player.js Node 加载回归：watchdog 回调位与质量 API 仍在",
  P.onEngineIssue === null && P.onNoNeuralNotice === null &&
  typeof P.voiceQualityInfo === "function" && P.lastEngineIssue === null);

console.log(pass ? "\n=== 语音可靠性/引导/Azure 增强门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);
