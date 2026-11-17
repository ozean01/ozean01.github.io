#!/usr/bin/env node
/* 验收测试：语音可靠性 + 引导 + Azure 增强（2026-10-24 第二/三批）。
   守住四件事：
     ① 无声 watchdog：speakNative 的 utterance 7 秒未 started → lastEngineIssue + onEngineIssue；
        另（v1.28.1）在线人声 2.5 秒未 started → 自动降级本机人声重播同一句（仅未出声时，无双声）；
        onstart/onend/onerror 都要清计时器；被 cancel 的旧 utterance 由 trySeq 作废；
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
check("onstart / onend / onerror 三条路径都清计时器（clearTimers）",
  (pSrc.match(/clearTimers\(\)/g) || []).length >= 5,
  "实得 " + (pSrc.match(/clearTimers\(\)/g) || []).length + " 处");
/* v1.28.1 起：在线人声静默时会降级重播，但**只在「一个字都没出来」时**发生（无双声）；
   并把被 cancel 的旧 utterance 作废（trySeq），避免同句重复推进。 */
check("重播只在未 started 时发生、且仅针对在线人声（无双声）",
  /if \(myTry !== trySeq \|\| startedFlag \|\| stopped \|\| didFallback\) return;/.test(pSrc) &&
  /!HIGH_QUALITY\.test\(String\(v\.name \|\| ""\)\)\) return;/.test(pSrc));
check("在线人声 2.5 秒未出声 → 自动降级本机人声重播同一句",
  /fbTimer = setTimeout[\s\S]{0,800}pickLocalVoice\(\)/.test(pSrc) &&
  /didFallback = true;[\s\S]{0,400}speakPart\(i, local, true\)/.test(pSrc));
check("没有本机人声可降级时不假装降级：走 no-local-voice 指引",
  /if \(!local\) \{[\s\S]{0,400}no-local-voice/.test(pSrc));
check("被 cancel 的旧 utterance 三条回调都被 trySeq 守卫（不重复推进/不双声）",
  (pSrc.match(/if \(myTry !== trySeq\) return;/g) || []).length >= 3,
  "实得 " + (pSrc.match(/if \(myTry !== trySeq\) return;/g) || []).length + " 处");
check("speak 前解 Chrome「卡 paused」：paused 时先 resume()",
  /if \(window\.speechSynthesis\.paused\) window\.speechSynthesis\.resume\(\)/.test(pSrc));
check("本机没有可离线人声时给可执行指引（no-local-voice，不干等 7 秒）",
  /kind: "no-local-voice"/.test(pSrc) && appSrc.indexOf("no-local-voice") !== -1 &&
  /安装「英语（美国）」语音包/.test(pSrc) && /noLocalVoiceToast/.test(appSrc));
check("app 侧降级提示 30 秒去重（连听不刷屏）", appSrc.indexOf("_lastVoiceFallbackToast") !== -1 && appSrc.indexOf("onVoiceFallback") !== -1);
check("app 侧 7 秒判死提示 30 秒去重（原语义不变）", appSrc.indexOf("_lastIssueToast") !== -1);

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

/* ---------- ⑤ 行为验证（v1.39.1）：在线人声静默 → 本机人声重播同一句 ---------- */
(async function () {
  const modPath = path.join(ROOT, "js", "player.js");
  delete require.cache[require.resolve(modPath)];
  const calls = [];
  const online = { name: "Microsoft Ava Multilingual Online (Natural) - English (United States)", lang: "en-US" };
  const local = { name: "Microsoft Zira Desktop", lang: "en-US" };
  function U(text) { this.text = text; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1; }
  global.SpeechSynthesisUtterance = U;
  global.localStorage = { getItem: function () { return null; }, setItem: function () { } };
  global.window = {
    speechSynthesis: {
      paused: false,
      getVoices: function () { return [online, local]; },
      speak: function (u) {
        calls.push({ name: (u.voice && u.voice.name) || "", text: u.text });
        if (calls.length === 1) return;              /* 模拟在线人声静默：一个事件都不给 */
        setTimeout(function () { if (u.onstart) u.onstart(); }, 0);
        setTimeout(function () { if (u.onend) u.onend(); }, 20);
      },
      cancel: function () { }, resume: function () { }
    }
  };
  global.window.window = global.window;
  require(modPath);
  const P2 = global.window.Player;
  P2.speakNative("laminating adhesive", {});
  await new Promise(function (r) { setTimeout(r, 3200); });
  check("行为：2.5 秒未出声 → 自动用本机人声重播同一句（第二次发声是本机人声、文本相同）",
    calls.length === 2 && calls[1].name === local.name && calls[1].text === calls[0].text,
    JSON.stringify(calls.map(function (c) { return c.name; })));
  check("行为：lastVoiceFallback 记录 from（在线）/ to（本机），且不再误报 7 秒 issue",
    !!P2.lastVoiceFallback && P2.lastVoiceFallback.to === local.name &&
    /Online \(Natural\)/.test(P2.lastVoiceFallback.from) && P2.lastEngineIssue === null);

  console.log(pass ? "\n=== 语音可靠性/引导/Azure 增强门禁全部通过 ===" : "\n=== 有断言失败 ===");
  process.exit(pass ? 0 : 1);
})();
