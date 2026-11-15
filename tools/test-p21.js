#!/usr/bin/env node
/* P21 通用地基批门禁（2026-11-15）
   本批按「通用英语是专业英语的基础」补两处地基：
     ① 免按键通话的插话打断（可打断 AI 朗读）+ 卡壳容忍（静音判停可调）+ 中英识别切换
     ② 词卡「词族 / 形近」按需计算（不落关系数据文件）
   断言口径与仓库纪律一致：断言**行为与口径**，不只断言字符串存在。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) pass = false;
}
function read(f) { return fs.readFileSync(path.join(ROOT, f), "utf8"); }

const player = read("js/player.js");
const tutor = read("js/tutor.js");
const lookup = read("js/lookup.js");
const html = read("index.html");
const css = read("css/style.css");
const sw = read("sw.js");

/* ---------------- ① 插话打断：哨兵在 player，接线在 tutor ---------------- */
check("player.js 导出 listenLevel（朗读期电平哨兵）", /Player\.listenLevel\s*=\s*function/.test(player));
check("listenLevel 用 getUserMedia 取流，且返回 { stop() }",
  /getUserMedia\(\{\s*audio:\s*true\s*\}\)/.test(player) && /return\s*\{\s*stop:\s*function/.test(player));
check("listenLevel 只在「连续超阈值 holdMs」后才触发（不靠单帧尖峰）",
  /loudMs\s*>=\s*holdMs/.test(player) && /loudMs\s*=\s*\(rms\s*>=\s*th\)/.test(player));
check("listenLevel 触发一次即自我停止（不重复回调）",
  /if\s*\(dead\)\s*return;\s*dead\s*=\s*true/.test(player.replace(/\r/g, "")));
check("listenLevel 取流失败静默降级（catch 里 done(false)，不抛错）", /\.catch\(function\s*\(\)\s*\{\s*done\(false\)/.test(player));

check("tutor.js 朗读前挂哨兵，且**默认关闭**（cfg.bargeIn 默认 false）",
  /bargeIn:\s*false/.test(tutor) && /if\s*\(cfg\.bargeIn\s*&&\s*autoMic\)\s*\{[\s\S]{0,200}?listenLevel\(/.test(tutor));
check("哨兵触发 → 先掐朗读（Player.stop）再开麦（不是只停哨兵）",
  /onTrigger:\s*function\s*\(\)\s*\{[\s\S]{0,260}?E\(\)\.Player\.stop\(\)[\s\S]{0,120}?startAutoMic\(\)/.test(tutor));
check("朗读结束/退出通话都会关哨兵（不常驻占麦克风）",
  /onend:\s*function\s*\(\)\s*\{\s*bargeStop\(\)/.test(tutor) &&
  /function stopAutoMic\(\)\s*\{[\s\S]{0,120}?bargeStop\(\)/.test(tutor));

/* ---------------- ② 卡壳容忍 + 中英切换 ---------------- */
check("静音判停真的透传进 recognizeAuto（不是只存设置）", /silenceMs:\s*cfg\.recSilence\s*\|\|\s*undefined/.test(tutor));
check("两处识别都用 cfg.recLang（🎤 与 🔁 一致，无第二处写死 en-US）",
  (tutor.match(/lang:\s*cfg\.recLang\s*\|\|\s*"en-US"/g) || []).length === 2 &&
  !/recognizeAuto\(\{[\s\S]{0,60}?lang:\s*"en-US"/.test(tutor));
check("判停文案单一来源 silText()（提示语不各写一套 1.2 秒）",
  /function silText\(\)/.test(tutor) && (tutor.match(/silText\(\)/g) || []).length >= 3);
check("三个设置项都在界面里且都被 saveSettings 读回",
  /id="tBargeIn"/.test(tutor) && /id="tRecSilence"/.test(tutor) && /id="tRecLang"/.test(tutor) &&
  /getElementById\("tBargeIn"\)/.test(tutor) &&
  /getElementById\("tRecSilence"\)/.test(tutor) &&
  /getElementById\("tRecLang"\)/.test(tutor));

/* ---------------- ③ 隐私口径：麦克风常开必须写进数据去向 ---------------- */
check("数据去向如实写明「朗读期间麦克风保持开启」+ 只在本机判音量",
  /数据去向/.test(html) && /插话打断/.test(html) && /朗读期间麦克风保持开启/.test(html) &&
  /只在本机做音量判定/.test(html));

/* ---------------- ④ 词族/形近：按需算、不落数据文件 ---------------- */
check("lookup.js 有 relHintHtml 现算入口（不是读预生成关系表）", /function relHintHtml\(/.test(lookup));
check("形近复用 js/score.js 的 wordSimilar（单一实现），并带同口径降级副本",
  /window\.SpeechScore[\s\S]{0,80}?wordSimilar/.test(lookup) && /1 - dp\[b\.length\] \/ Math\.max/.test(lookup));
check("词卡渲染里接上关系块（不是死代码）", /relHintHtml\(info \? info\.w : word\)/.test(lookup));
check("多词术语不做形近（噪声控制：含空格即早退/跳过）",
  /if \(!w \|\| w\.indexOf\(" "\) !== -1\) return ""/.test(lookup) && /cl\.indexOf\(" "\) !== -1/.test(lookup));
check("关系块文案标明「按词形推，非释义关联」（口径诚实）", /按词形推/.test(lookup) && /非释义关联/.test(lookup));
check("CSS 有 .rd-rel 规则（不是裸标签）", /\.rd-rel\{/.test(css));

/* ---------------- ⑤ 不新增依赖 / 请求 / 存储键 ---------------- */
const pre = /const PRECACHE\s*=\s*\[([\s\S]*?)\];/.exec(sw);
const entries = pre ? (pre[1].match(/"[^"]+"/g) || []) : [];
check("PRECACHE 仍 69 条（本批无新脚本）", entries.length === 69, "n=" + entries.length);
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
check("引用子资源仍 61（无新脚本/样式表）", scripts.length + styles.length === 61, "n=" + (scripts.length + styles.length));
/* 词关系必须是「纯函数式现算」：只读不写。
   断言范围限定在 relHintHtml / lkCore / lkWs 三个函数体内（lookup.js 里 lsSet 是既有偏好存储，
   不属本批新增，故不能对整文件断言）。 */
const relBody = (lookup.match(/function lkCore[\s\S]*?function relHintHtml[\s\S]*?\n  \}/) || [""])[0];
check("词关系现算不写盘（函数体内无 localStorage / lsSet 写入）",
  relBody.length > 200 && !/localStorage|lsSet|setItem/.test(relBody), "len=" + relBody.length);
check("新控件无内联事件处理器（严格 CSP，只有 data-action 委托）",
  !/on(click|change|input)="/i.test(tutor));

console.log(pass ? "\n=== P21 通用地基批门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);