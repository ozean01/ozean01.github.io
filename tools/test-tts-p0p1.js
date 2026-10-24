#!/usr/bin/env node
/* 验收测试：设置页诚实性修正 P0+P1（2026-10-24）。
   P0：数据去向「浏览器语音在本机合成，不出网」对 Edge Online (Natural) 是错误陈述——
       Online (Natural) 人声由微软云端合成，被朗读文本会上行到微软；
       离线清单「需要联网」漏列 Online (Natural)、且「断网发音会失败」对本地人声不成立。
   P1：口音区三个口径统一为「实际生效人声」（手动指定覆盖映射时如实标注未生效）；
       Azure 英音自动映射文案（不再让用户手动改 SoniaNeural）；去掉「对标 Google」的过时参照。 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

const html = read("index.html");
const appSrc = read("js/app.js");

/* ---------- P0：数据去向与离线清单的事实修正 ---------- */
check("数据去向：浏览器语音区分本地人声（不出网）与 Online (Natural)（微软云端合成上行）",
  html.indexOf("本地人声（如 Microsoft Huihui）在<b>本机合成，不出网</b>") !== -1 &&
  html.indexOf("Online (Natural) 人声由微软云端合成") !== -1 &&
  html.indexOf("被朗读的文本会上行到微软服务器") !== -1);
check("错误陈述「在本机合成，不出网」（不区分人声）已移除",
  html.indexOf("在本机合成，不出网。<br>") === -1);
check("离线清单：Online (Natural) 列入需要联网，本地人声明确断网可用",
  html.indexOf("发音朗读的在线音源（Edge 的 Online (Natural)、Google/Azure）") !== -1 &&
  html.indexOf("名字里没有 Online/Natural 的）断网可用") !== -1);

/* ---------- P1：口径统一 ---------- */
check("口音区：手动指定时显示「实际生效」，映射人声标注「未生效」",
  appSrc.indexOf("实际生效：手动指定的「") !== -1 &&
  appSrc.indexOf("未生效（已手动指定发音人）") !== -1);
check("实际生效取自 modal 当前手选（voiceSel.value），与 open() 回填 progress.voice 的路径一致",
  /const manualName = voiceSel\.value \|\| "";/.test(appSrc));
check("旧的双口径文案（「人声：…」与手动提示并列）已移除",
  appSrc.indexOf("下方已手动指定发音人，切口音会自动改回") === -1);
check("Azure 英音改为自动映射说明（不再让用户手动改 SoniaNeural）",
  html.indexOf("自动</b>换用对应人声——英音即 <code>en-GB-SoniaNeural</code>") !== -1 &&
  html.indexOf("请把上面的发音人改成") === -1);
check("「质量对标 Google 在线语音」过时参照已移除", html.indexOf("质量对标 Google 在线语音") === -1);
check("无障碍守卫：azurePlan 的英音自动映射实现仍在（文案与实现一致）",
  read("js/player.js").indexOf('uk: "en-GB-SoniaNeural"') !== -1);

/* ---------- 设置页说明的科学与规范口径（2026-10-24 第二轮）---------- */
check("引擎说明：浏览器语音注明「云端神经语音 + 需联网 + 文本上行」并与数据去向交叉引用",
  html.indexOf("云端神经网络语音") !== -1 && html.indexOf("被朗读的文本会上行到微软，见下方「🔍 数据去向」") !== -1);
check("Google 端点措辞规范化（非官方公开接口、无可用性承诺，不再用「封禁」这种拟人说法）",
  html.indexOf("非官方公开端点，无可用性承诺") !== -1 && html.indexOf("常被 Google 封禁") === -1);
check("Azure PA 维度规范化：准确度/流利度/完整度/韵律（prosody），不再是自造的「完整性/发音」",
  html.indexOf("流利度 / 完整度 / 韵律（prosody）") !== -1 && html.indexOf("准确率/流利度/完整性/发音") === -1);
check("ASR 机制说明：识别返回转写文本、逐词分是站内文本比对——「识别 ≠ 发音」有机制依据",
  html.indexOf("SpeechRecognition") !== -1 && html.indexOf("转写文本") !== -1 &&
  html.indexOf("不是声学发音评分") !== -1 && html.indexOf("识别 ≠ 发音") !== -1);
check("GA 首次出现给全称（General American）", html.indexOf("General American，GA") !== -1);
check("语速给科学口径（1.0× ≈ 140–160 词/分钟 + 跟读建议档）",
  html.indexOf("140–160 词/分钟") !== -1 && html.indexOf("跟读建议 0.85–1.0×") !== -1);
check("导出清单补齐新备份项（FSRS 全称 / 岗位任务画像 / AI 陪练对话 / 听后测）",
  html.indexOf("Free Spaced Repetition Scheduler") !== -1 && html.indexOf("岗位任务画像、AI 陪练对话记录、精听闭环进度、连听听后测") !== -1);
check("Azure 冗余旧说明已并入「开通三步」（不再两处重复人声清单）",
  (html.match(/常见英文神经人声/g) || []).length === 1);

console.log(pass ? "\n=== 设置页诚实性修正门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);
