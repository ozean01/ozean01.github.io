#!/usr/bin/env node
/* 门禁：P1 批次不变量

   为什么需要它：P1 改的东西大多是"口径与真话"——口音到底切没切、分数到底由哪台仪器给的、
   完成算不算数、错误提示能不能照着做、发布链会不会把不该传的传上去。
   这类改动**最容易在后续迭代里被无声改回去**（尤其是"看起来更简单"的旧写法），
   故把可机器验证的部分固化下来。

   口径来源：
     · 口音真话 / 发音教学   —— `_fte-review-2/P1/B-口音与发音教学-改动记录.md`（S05/S07）
     · 分数构念与分桶        —— `_fte-review-2/P1/A-测评效度-改动记录.md`（S04）
     · 记账口径 / 错误恢复 / 投料口 / RRULE —— `_fte-review-2/P1/C-四个UX项-改动记录.md`（S01/S09/S12）
     · 发布链 / 缓存桶 / 只读审计 —— `_fte-review-2/P1/D-工程链-改动记录.md`（S10）

   注意：本文件只断言**不变量**（存在性、方向、禁止回退），不复算业务结果——
   那些由各自的专门门禁（test-score / test-term-score / test-honesty / test-outcomes …）负责。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) pass = false;
}
function read(p) { return fs.readFileSync(path.join(ROOT, p), "utf8"); }
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }

/* ---------- 1. 口音：开关必须"真的切"，且 UI 必须说真话（P1-B） ---------- */
const playerSrc = read("js/player.js");
check("player.js 导出口音能力查询 accentCapability（Azure/Google 下能否真切到英音的唯一真相来源）",
  /accentCapability\s*[:=]/.test(playerSrc) || /function accentCapability/.test(playerSrc));
check("player.js 导出人话提示 accentHint（供设置面板/字幕页直接展示）",
  /accentHint\s*[:=]/.test(playerSrc) || /function accentHint/.test(playerSrc));
check("Azure 口音由 voice 的 locale 推导，且英音真的落到 en-GB（不得再写死 en-US）",
  /en-GB/.test(playerSrc) && /xml:lang/.test(playerSrc) && !/xml:lang="en-US"\s*\+\s*Player\.azure\.voice/.test(playerSrc));
check("取不到对应口音人声时不得静默回退（必须留痕或回调）",
  /lastAccentIssue|onAccentUnsupported/.test(playerSrc));
const appSrc = read("js/app.js");
check("设置面板必须展示 accentHint（旧写法在 Azure/Google 下仍显示「当前：英音」= 骗用户）",
  /accentHint/.test(appSrc));
const subtitleSrc = read("js/subtitle.js");
check("字幕页口音按钮必须走 accentCapability（不得只用 hasAccent 假报「已切到英音」）",
  /accentCapability/.test(subtitleSrc));

/* ---------- 2. 分数：构念不得再碰撞，聚合必须按仪器分桶（P1-A） ---------- */
const eval4Src = read("js/eval4.js");
check("saveAzure 必须写独立的 Azure 字段（azPron/azAcc/azFlu/azComp）而不是复用 acc/flu",
  /azPron/.test(eval4Src) && /azAcc/.test(eval4Src) && /azFlu/.test(eval4Src));
check("Azure 记录必须带来源标记（src:\"azure\" / dimSrc），否则无法按仪器分桶",
  /src:\s*"azure"/.test(eval4Src) && /dimSrc/.test(eval4Src));
const radarSrc = read("js/radar.js");
check("radar 聚合必须识别 dimSrc 并按仪器分桶（无来源标记的历史记录不得计入能力轴）",
  /dimSrc/.test(radarSrc) && /(未知来源|不计入)/.test(radarSrc));
const placementSrc = read("js/placement.js");
check("水平自测必须自称「自评定位（自陈，非测评）」（它是用户点选的，不是测评结果）",
  /自评定位/.test(placementSrc) && /自陈/.test(placementSrc));
check("SCORE-INTERPRETATION.md 存在（分数解释手册：能声称什么 / 不能声称什么）",
  exists("SCORE-INTERPRETATION.md"));

/* ---------- 3. 记账口径、错误恢复、投料口、.ics（P1-C） ---------- */
const todaySrc = read("js/today.js");
const rruleCount = (todaySrc.match(/RRULE:FREQ=/g) || []).length;
check("今日页导出的 .ics 必须含 RRULE（否则提醒只响一次）", rruleCount >= 1, "RRULE 出现 " + rruleCount + " 处");
check(".ics 的 DESCRIPTION 必须带站内练习入口（提醒点得回来）",
  /站内练习入口|ozean01\.github\.io/.test(todaySrc));
check("今日页必须在 UI 上写明每步的记账口径（自报 / 自动 / 词数门槛）",
  /data-credit-legend/.test(todaySrc) && /记账口径/.test(todaySrc));
/* 首屏顺序：五步清单必须排在场景急救之前（S09：首屏只让人做一个决定） */
const iSteps = todaySrc.indexOf("td-step");
const iUrgent = todaySrc.indexOf("Urgent.html()", todaySrc.indexOf("class=\"td-list\""));
check("今日页首屏顺序：五步清单必须先于场景急救（但不删除场景急救）",
  iSteps !== -1 && iUrgent !== -1 && iSteps < iUrgent, "steps@" + iSteps + " urgent@" + iUrgent);
const exportSrc = read("js/export.js");
check("导入失败必须有就地错误块（不是只有 3 秒 toast）",
  /showImportError/.test(exportSrc) && /role="alert"/.test(exportSrc));
const materialSrc = read("js/material.js");
check("素材投料口必须有真正的 URL 判定函数（原 !A && !B 条件恒假）", /looksLikeUrl/.test(materialSrc));

/* ---------- 4. 发布链与工程化（P1-D） ---------- */
const pagesSrc = read(".github/workflows/pages.yml");
/* 只在**有效配置**上断言：注释里说明"原实现是 path: \".\"" 是允许且有价值的（第一版就踩了这个坑） */
const pagesCode = pagesSrc.replace(/^\s*#.*$/gm, "");
check("pages.yml 的 deploy 必须依赖 test（门禁不绿不得上线）", /needs:\s*test/.test(pagesCode));
check("pages.yml 必须上传显式白名单目录，而不是仓库根（原 path: \".\"）",
  /path:\s*"_site"/.test(pagesCode) && !/path:\s*"\."/.test(pagesCode));
const ciSrc = read(".github/workflows/ci.yml");
check("ci.yml 的单一数据源检查必须显式 --allow-missing（小程序是兄弟目录，CI 里必然缺数据）",
  /check-single-source\.js\s+--allow-missing/.test(ciSrc));
const swSrc = read("sw.js");
check("sw.js 必须有缓存写入闸 cacheGate（原实现让缓存桶随 query 无上限增长）",
  /cacheGate/.test(swSrc));
["audit-count.js", "audit-ipa.js", "audit-input.js"].forEach(function (f) {
  check(f + " 必须支持 FTE_NO_WRITE / --no-write 只读模式（npm test 不得污染工作区）",
    /FTE_NO_WRITE/.test(read("tools/" + f)));
});
check("tools/prepush-check.js 存在（发布前固定动作：工作区干净 + CACHE 已升版 + 基线一致）",
  exists("tools/prepush-check.js"));

/* ---------- 5. 周报不得因维度缺数据而输出全 0（P1-A 修复的跨组耦合） ---------- */
const tutorSrc = read("js/tutor.js");
check("周报的四维汇总必须按维度分别计数（g.cnt），不得用总记录数当分母（否则缺数据维度显示 0 分）",
  /g\.cnt\s*\[/.test(tutorSrc) && /样本不足/.test(tutorSrc));

/* ---------- 6. 真实使用反馈修复：跟读与评分必须真的能用（2026-10-11 用户反馈） ----------
   反馈原文：「单词及句子我只能听系统播放，我还需要跟读及评分以帮助我纠正发音，这个功能缺失」。
   两条根因都要有机器守卫，否则下次"重构"很容易再退回"只能听"：
     ① Player.recognize 必须**离线优先**（Chrome 的在线识别走 Google，国内不可达）；
     ② 看词的界面（课程单元词汇表）必须有 🎤 跟读入口，不能只有 🔊 朗读。 */
check("player.js 必须实现离线优先识别（recognizeLocal）并导出 localASROn",
  /function recognizeLocal/.test(playerSrc) && /Player\.localASROn\s*=/.test(playerSrc));
check("Player.recognize 必须先判断本地离线识别，再回退浏览器识别",
  /Player\.recognize = function[\s\S]{0,700}?localASROn\(\)[\s\S]{0,120}?recognizeLocal/.test(playerSrc));
check("recognitionSupported 必须把「本地识别可用」也算作支持（否则跟读按钮会被隐藏）",
  /Player\.recognitionSupported = function \(\) \{ return !!\(SR \|\|/.test(playerSrc));
check("课程单元词汇表每个词必须有 🎤 跟读按钮（data-action=\"word-shadow\"）",
  /data-action="word-shadow"/.test(appSrc));
check("词级跟读必须复用既有评测引擎与诚实口径（evaluateSpeech + 识别≠发音 提示）",
  /startWordShadow/.test(appSrc) && /识别≠发音/.test(appSrc));
check("模型就绪时必须默认打开离线识别，并尊重用户的明确关闭（localASROff）",
  /localASROff/.test(appSrc));

/* ---------- 7. 跟读必须与「识别」解耦：火狐也能练（2026-10-11 第二次使用反馈） ----------
   反馈：「用火狐发现 语块卡 · 短语 也没有跟读以及评测功能」「一定要 Edge 才可以吗」。
   事实：火狐**完全不支持** SpeechRecognition；Chrome 的识别走 Google、国内不可达。
   所以"跟读"必须有一条**不依赖识别**的路径（听→跟读→录音→A/B 回放），否则火狐用户
   连练发音的入口都没有。这条守卫防止以后又被改回"没有识别就没有跟读"。 */
check("app.js 必须有不依赖识别的跟读实现（shadowRun）——火狐没有 SpeechRecognition",
  /function shadowRun/.test(appSrc) && /Player\.startRecording/.test(appSrc));
check("跟读必须同时提供「评测」（需要识别）且两者分离（shadow-eval 独立存在）",
  /function shadowEval/.test(appSrc) && /case "shadow-eval"/.test(appSrc));
check("三个实际学习面都必须有跟读入口：单元词汇 / 短语 / 语块卡（至少 3 处 data-action=\"shadow\"）",
  (appSrc.match(/data-action="shadow"/g) || []).length >= 3);
check("评测不可用时必须写明两条出路（本地离线识别 / Edge），不能只报失败",
  /本地离线识别/.test(appSrc) && /Edge/.test(appSrc));

/* ---------- 8. 启动脚本：自动优先 Edge + 保持 ASCII-only ---------- */
const bootSrc = read("start-site.ps1");
check("start-site.ps1 必须保持 ASCII-only（Windows PowerShell 5.1 按 ANSI 读取，中文会破引号）",
  (function () {
    const buf = fs.readFileSync(path.join(ROOT, "start-site.ps1"));
    for (let i = 0; i < buf.length; i++) if (buf[i] > 127) return false;
    return true;
  })());
check("start-site.ps1 必须支持 -Browser 且 auto 模式优先 Edge（评测需要能用的识别服务）",
  /\[ValidateSet\('auto', 'edge', 'chrome', 'firefox', 'default'\)\]/.test(bootSrc) &&
  /Resolve-BrowserExe/.test(bootSrc) && /Resolve-BrowserExe 'edge'/.test(bootSrc));

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
