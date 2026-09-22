#!/usr/bin/env node
/* 验收：术语发音分口径（P1-2）
   旧口径的三个致命问题，这里逐条钉住：
     ① 大小写：`MOQ` / `Food Contact` 这类术语在 terms 里是原样大小写，却被拿去和
        归一化后的小写词比 indexOf → 永远不命中；
     ② 多词术语：trial batch / peel strength / declaration of conformity 按「单个词」
        匹配 → 全部沉默，等于 40% 权重里这些术语从未被计分；
     ③ near 记满分：把「猜个大概」当成读对。
   另外钉住「本句无行业术语 → 返回 null（不适用）」而不是 0 分。
   做法：把 eval4.js 里的 termUnits / termScore / termWordSet 三个纯函数与真实 SCENES
   抽出来，在 vm 里配 js/score.js 的 norm 真跑。零依赖。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const eval4Src = fs.readFileSync(path.join(ROOT, "js", "eval4.js"), "utf8");
const scoreSrc = fs.readFileSync(path.join(ROOT, "js", "score.js"), "utf8");

let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) pass = false;
}

/* ---------- 从源码里抽函数 / 字面量（按括号配平，避免正则截断） ---------- */
function sliceBalanced(text, startIdx, open, close) {
  let depth = 0;
  for (let i = startIdx; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) { depth--; if (depth === 0) return text.slice(startIdx, i + 1); }
  }
  return null;
}
function extractFn(text, name) {
  const marker = "function " + name + "(";
  const i = text.indexOf(marker);
  if (i === -1) return null;
  const parenOpen = i + marker.length - 1;
  const brace = text.indexOf("{", parenOpen);
  const body = sliceBalanced(text, brace, "{", "}");
  if (!body) return null;
  return text.slice(i, brace) + body;   /* 原样保留形参，拼出可执行的函数声明 */
}
function extractScenes(text) {
  const i = text.indexOf("const SCENES = [");
  if (i === -1) return null;
  const open = text.indexOf("[", i);
  return sliceBalanced(text, open, "[", "]");
}

/* ---------- 组装沙箱：norm 来自唯一的评分实现 score.js ---------- */
const sandbox = { console: console, window: {} };
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(scoreSrc, ctx, { filename: "js/score.js" });
const norm = sandbox.SpeechScore.norm;
check("js/score.js 提供 norm（唯一实现）", typeof norm === "function");
sandbox.__norm = norm;   /* U().norm 的取值来源：必须是同一个实现 */

const fns = ["termUnits", "termWordSet", "termScore"].map(function (n) { return [n, extractFn(eval4Src, n)]; });
fns.forEach(function (p) { check("能从 eval4.js 抽到 " + p[0], !!p[1]); });
const scenesSrc = extractScenes(eval4Src);
check("能从 eval4.js 抽到真实 SCENES", !!scenesSrc);

const harness =
  "var U = function () { return { norm: __norm }; };\n" +
  fns.map(function (p) { return p[1]; }).join("\n") + "\n" +
  "var SCENES = " + scenesSrc + ";\n" +
  "({ termUnits: termUnits, termWordSet: termWordSet, termScore: termScore, SCENES: SCENES });";
let api = null;
try { api = vm.runInContext(harness, ctx, { filename: "eval4-funcs" }); } catch (e) { api = null; }
check("三个纯函数可在沙箱中执行", !!api, api ? "" : "eval 失败");

if (api) {
  const allOk = function (ref) { return sandbox.SpeechScore.evaluateSpeech(ref, ref).matched; };

  /* ---------- ① 大小写：MOQ ---------- */
  const refMoq = "Could you confirm the MOQ and the unit price?";
  const unitsMoq = api.termUnits(refMoq, ["MOQ", "unit price"]);
  check("MOQ（大写术语）能被定位", unitsMoq.length === 2, "units=" + unitsMoq.length);
  check("大小写不同的术语都能得满分", api.termScore(refMoq, allOk(refMoq), ["MOQ", "unit price"]) === 100);

  /* ---------- ② 多词术语 ---------- */
  const refMulti = "We suggest a trial batch before the bulk order.";
  const unitsMulti = api.termUnits(refMulti, ["trial batch"]);
  check("多词术语 trial batch 被当作一个连续词序列定位",
    unitsMulti.length === 1 && unitsMulti[0].words.length === 2, JSON.stringify(unitsMulti.map(function (u) { return u.words; })));
  check("多词术语读对得满分", api.termScore(refMulti, allOk(refMulti), ["trial batch"]) === 100);

  /* ---------- ③ near 不得记满分 ---------- */
  const refNear = "The peel strength is fine.";
  const nearMatched = allOk(refNear).map(function (m) {
    return m.errType === "ok" && (m.w === "peel" || m.w === "strength")
      ? { w: m.w, ok: true, near: true, errType: "near", said: m.w.slice(0, -1) } : m;
  });
  const nearScore = api.termScore(refNear, nearMatched, ["peel strength"]);
  check("多词术语里有一个词只是「近似」→ 0.5 分而不是满分", nearScore === 50, "score=" + nearScore);

  /* ---------- ④ 漏读记 0 ---------- */
  const missMatched = allOk(refNear).map(function (m) {
    return m.w === "strength" ? { w: m.w, ok: false, near: false, errType: "miss" } : m;
  });
  check("术语词漏读 → 0 分", api.termScore(refNear, missMatched, ["peel strength"]) === 0);

  /* ---------- ⑤ 不适用必须返回 null（不是 0） ---------- */
  const refPlain = "Thanks for your email.";
  const na = api.termScore(refPlain, allOk(refPlain), ["MOQ", "peel strength"]);
  check("参考句里没有术语 → 返回 null（不适用），而不是 0 分", na === null, "got=" + na);

  /* ---------- ⑥ 真实场景回归：terms 确实出现在 ref 的场景必须能拿满分 ---------- */
  let scenesWithTerms = 0, brokenScenes = [];
  api.SCENES.forEach(function (sc, i) {
    const units = api.termUnits(sc.ref, sc.terms || []);
    if (!units.length) return;
    scenesWithTerms++;
    const s = api.termScore(sc.ref, allOk(sc.ref), sc.terms || []);
    if (s !== 100) brokenScenes.push(i + ":" + (sc.title || "") + "=" + s);
  });
  check("真实场景里所有「术语确实在参考句中」的场景都能拿到 100（旧实现这些恒为 0）",
    brokenScenes.length === 0 && scenesWithTerms >= 4,
    "scenesWithTerms=" + scenesWithTerms + (brokenScenes.length ? " broken=" + brokenScenes.join(",") : ""));

  /* ---------- ⑥b 每个 scene 的 terms 必须**全部**出现在它的 ref 里 ----------
     否则该术语的发音维度会静默失效（termUnits 找不到它 → 不计分 → 40% 权重里少了一项），
     而界面上什么提示都不会有。这是 P4-3 审校时发现的真实空档：
     qc-claim 的 peel strength、compliance-claim 的 breach of contract 当时都不在 ref 中。 */
  const deadTerms = [];
  api.SCENES.forEach(function (sc) {
    (sc.terms || []).forEach(function (t) {
      const hit = api.termUnits(sc.ref, [t]).length > 0;
      if (!hit) deadTerms.push((sc.id || sc.title) + " / " + t);
    });
  });
  check("每个场景的每个术语都出现在参考句中（术语维度不得静默失效）",
    deadTerms.length === 0, deadTerms.join("；"));

  /* ---------- ⑦ 逐词着色用的词集合与术语单元同口径 ---------- */
  const set = api.termWordSet(refMoq, ["MOQ", "unit price"]);
  check("termWordSet 用归一化后的词（供逐词着色）", !!set["moq"] && !!set["unit"] && !!set["price"]);
}

/* ---------- ⑧ 源码级守卫：旧写法不得复活（先剔注释，否则会命中解释性文字） ---------- */
const eval4Code = eval4Src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
check("eval4.js 不再用 terms.indexOf 直接比词（大小写陷阱）", eval4Code.indexOf("terms.indexOf(") === -1);
check("eval4.js 不再把 near 与 ok 一起算满分", eval4Code.indexOf("m.ok || m.near") === -1);
check("eval4.js 的 finishDiagnose 不再用参考句冒充识别结果",
  !/callPhonemize\(mod,\s*text\s*\|\|\s*scene\.ref\)/.test(eval4Code));
check("eval4.js 在无识别结果时明确拒绝诊断",
  /没有识别到你说的话，本次不做音素诊断/.test(eval4Src));

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
