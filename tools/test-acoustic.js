#!/usr/bin/env node
/* 验收测试：🎙 声学反馈（js/acoustic.js，P0-1）。
   由来：全站跟读反馈此前只有「ASR 逐词命中 + 出声时长启发式」，语调与停顿从没被测过；
   P0-1 用录音 blob 解码出的 PCM 做自相关基频 + 停顿统计（纯前端 DSP，零 API 零模型）。

   本测试守住四件事：
     ① 算法正确：合成正弦信号下 F0 检出、八度不翻倍/不折半、停顿边界、句尾走势；
     ② 诚实边界：纯静音不给音高统计（pitch=null）、过短样本明确拒判（ok=false）、
        describe 的文案永远用「约/偏/试试」措辞而不做权威结论；
     ③ 接线：acoustic.js 必须前置加载（score.js 之后、app.js 之前）且进 PRECACHE；
        跟读面板必须真的调用（app.js 里有 fillAcoustic / shadowAcoustic）；
     ④ 诚实口径不回退：app.js/acoustic.js 里必须保留「只测你自己的录音」的边界文案。 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

global.window = {};
require(path.join(ROOT, "js", "acoustic.js"));
const A = global.window.Acoustic;
const T = A && A._t;

check("window.Acoustic 暴露且内部 _t 可用于测试", !!A && !!T && typeof A.analyzePcm === "function");

/* ---------- 合成信号工具 ---------- */
const SR = 16000;
function sine(hz, sec, amp) {
  const n = Math.round(SR * sec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (amp || 0.3) * Math.sin(2 * Math.PI * hz * i / SR);
  return out;
}
function silence(sec) { return new Float32Array(Math.round(SR * sec)); }
function concat(parts) {
  let n = 0; parts.forEach(function (p) { n += p.length; });
  const out = new Float32Array(n);
  let off = 0; parts.forEach(function (p) { out.set(p, off); off += p.length; });
  return out;
}
function medianF0(an, fromSec, toSec) {
  const v = [];
  for (let i = 0; i < an.f0.length; i++) {
    const t = i * an.hopSec;
    if (t >= fromSec && t < toSec && an.f0[i] > 0) v.push(an.f0[i]);
  }
  if (!v.length) return 0;
  v.sort(function (a, b) { return a - b; });
  return v[Math.floor(v.length / 2)];
}

/* ---------- ① F0 检出与停顿边界 ---------- */
const seg1 = 1.0, gap = 0.6, seg2 = 0.8;
const an = A.analyzePcm(concat([sine(150, seg1), silence(gap), sine(220, seg2)]), SR);
check("两段正弦 + 一段静音 → 分析成功", an.ok && !an.capped);
const m1 = medianF0(an, 0.2, 0.8);
check("第 1 段（150Hz）检出中位 F0 ≈ 150（±10%）", m1 > 135 && m1 < 165, "实得 " + m1);
const m2 = medianF0(an, seg1 + gap + 0.15, seg1 + gap + seg2 - 0.1);
check("第 2 段（220Hz）检出中位 F0 ≈ 220（±10%）", m2 > 198 && m2 < 242, "实得 " + m2);
check("0.6s 静音 → 恰好 1 处停顿", an.silence.count === 1, "实得 " + an.silence.count);
check("停顿时长落在 [0.4, 0.7]s（窗/跳平滑后不越界）", an.silence.pauses[0] && an.silence.pauses[0].sec >= 0.4 && an.silence.pauses[0].sec <= 0.7,
  an.silence.pauses[0] ? String(an.silence.pauses[0].sec) : "无停顿");
check("句尾走势：结尾 220Hz 高于中段 → rise", an.pitch && an.pitch.tail === "rise", an.pitch && an.pitch.tail);

/* ---------- 八度防护 ---------- */
const an100 = A.analyzePcm(sine(100, 1.5), SR);
const m100 = medianF0(an100, 0.2, 1.3);
check("100Hz 纯音不被折半/翻倍（±8%）", m100 > 92 && m100 < 108, "实得 " + m100);
const an300 = A.analyzePcm(sine(300, 1.5), SR);
const m300 = medianF0(an300, 0.2, 1.3);
check("300Hz 纯音不被误判为倍频（±8%）", m300 > 276 && m300 < 324, "实得 " + m300);

/* ---------- 无停顿 / 语调平直 ---------- */
const anFlat = A.analyzePcm(sine(120, 2.0), SR);
check("连续 2s 朗读 → 0 处停顿", anFlat.silence.count === 0, "实得 " + anFlat.silence.count);
check("平直语调 → 半音范围 < 2 且 tail=level",
  anFlat.pitch.rangeSemitones < 2 && anFlat.pitch.tail === "level",
  "范围 " + anFlat.pitch.rangeSemitones + " tail=" + anFlat.pitch.tail);

/* ---------- ② 诚实边界 ---------- */
const anSilent = A.analyzePcm(silence(2.0), SR);
check("纯静音 → ok 但 pitch=null（不发明音高）", anSilent.ok && anSilent.pitch === null && anSilent.voicedRatio === 0);
check("describe(纯静音) 返回空串（无 pitch 不解读）", A.describe(anSilent) === "");
const anShort = A.analyzePcm(sine(150, 0.1), SR);
check("0.1s 过短样本 → 明确拒判（ok=false, reason=too-short）", !anShort.ok && anShort.reason === "too-short");
const anCapped = A.analyzePcm(sine(150, 31), 8000);
check("31s 录音只分析前 " + T.MAX_SEC + "s 且如实标注 capped", anCapped.ok && anCapped.capped === true);
check("describe 是「约/偏/试试」措辞，无权威断言词",
  (function () {
    const d = A.describe(an);
    return d.indexOf("约") !== -1 && /试试|偏|适中/.test(d) && d.indexOf("停顿") !== -1;
  })(), A.describe(an).slice(0, 40) + "…");

/* ---------- 静音段统计细节 ---------- */
const prof = A.silenceProfile(an.rms, an.hopSec, an.voiceThr || undefined);
check("silenceProfile 可独立调用且与 analyzePcm 一致", prof.count === an.silence.count);

/* ---------- 画布守卫（Node 无 2D 上下文 → 返回 false，不抛错） ---------- */
check("drawPitchCurve 在无 canvas 环境返回 false 不抛错", A.drawPitchCurve({}, an) === false);

/* ---------- ③ 接线 ---------- */
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const posScore = html.indexOf('src="js/score.js"');
const posAcoustic = html.indexOf('src="js/acoustic.js"');
const posApp = html.indexOf('src="js/app.js"');
check("index.html 接线：score.js → acoustic.js → app.js 顺序",
  posScore !== -1 && posAcoustic > posScore && posApp > posAcoustic,
  "score@" + posScore + " acoustic@" + posAcoustic + " app@" + posApp);
check("index.html 的 acoustic.js 是 defer 脚本", /<script src="js\/acoustic\.js" defer><\/script>/.test(html));

const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
check("sw.js PRECACHE 含 ./js/acoustic.js", sw.indexOf('"./js/acoustic.js"') !== -1);

const appSrc = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
check("app.js 跟读面板真的调用声学分析（fillAcoustic + Acoustic.analyzePcm + shadowAcoustic 容器）",
  appSrc.indexOf("function fillAcoustic") !== -1 &&
  appSrc.indexOf("Acoustic.analyzePcm") !== -1 &&
  appSrc.indexOf('id="shadowAcoustic"') !== -1 &&
  appSrc.indexOf("fillAcoustic();") !== -1);
check("app.js 五阶段闯关每句接线音高曲线（data-pitch canvas + drawPitch）",
  appSrc.indexOf('data-pitch=') !== -1 &&
  appSrc.indexOf("function drawPitch") !== -1 &&
  appSrc.indexOf("drawPitch(li);") !== -1);

/* ---------- ④ 诚实口径不回退 ---------- */
const acSrc = fs.readFileSync(path.join(ROOT, "js", "acoustic.js"), "utf8");
check("acoustic.js 头注释保留「不做假对照曲线」的诚实边界",
  acSrc.indexOf("不做") !== -1 && acSrc.indexOf("无法采集对照曲线") !== -1);
check("app.js 保留「只测你自己的录音」的 UI 口径文案",
  appSrc.indexOf("只测你自己的录音") !== -1);
check("player.js 提供 decodeMonoPcm（录音 blob → PCM 的唯一入口）",
  fs.readFileSync(path.join(ROOT, "js", "player.js"), "utf8").indexOf("Player.decodeMonoPcm") !== -1);

console.log(pass ? "\n=== 声学反馈门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);
