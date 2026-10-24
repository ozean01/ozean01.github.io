#!/usr/bin/env node
/* 验收测试：P2 批次（2026-10-24）。
   P2-12 LLM 传输层收敛：js/llm.js 是全站唯一的 chat/completions fetch 实现，
         tutor/eval4/speech 保留各自的 callChat/callLLM 薄委托与教学语义（温度/max_tokens）；
   P2-10 AI 对练场景状态机：结构化场景（客户人设/阶段目标/判定标准）+ JSON 协议回复，
         复用既有对话回路；模型不守协议时降级显示、状态不动；
   P2-11 影子跟读节奏反馈：开口延迟/出声时长/有效语速（声学实测），
         逐词延迟需 ASR 时间戳——诚实不做（UI 必须写明）。 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/* ---------- P2-12：传输层收敛 ---------- */
const jsDir = path.join(ROOT, "js");
/* 传输实现的特征串：拼接 URL 的代码（注释里的「chat/completions 接口」不算） */
const transportFiles = fs.readdirSync(jsDir).filter(function (f) {
  return /\.js$/.test(f) && read("js/" + f).indexOf('+ "/chat/completions"') !== -1;
});
check("chat/completions 传输实现只存在于 js/llm.js", transportFiles.length === 1 && transportFiles[0] === "llm.js",
  transportFiles.join(", "));

const html = read("index.html");
const posLLM = html.indexOf('src="js/llm.js"');
const posTutor = html.indexOf('src="js/tutor.js"');
const posEval4 = html.indexOf('src="js/eval4.js"');
const posSpeech = html.indexOf('src="js/speech.js"');
check("index.html：llm.js 在 tutor/eval4/speech 之前", posLLM !== -1 && posLLM < posTutor && posLLM < posEval4 && posLLM < posSpeech);
check("sw.js PRECACHE 含 ./js/llm.js", read("sw.js").indexOf('"./js/llm.js"') !== -1);

const tutorSrc = read("js/tutor.js");
const eval4Src = read("js/eval4.js");
const speechSrc = read("js/speech.js");
check("tutor.callChat 薄委托（温度 0.7 / maxTokens 600 保留在本文件）",
  /callChat\(messages\)\s*\{\s*return window\.LLM\.chat\(messages,\s*\{\s*temperature: 0\.7, maxTokens: 600/.test(tutorSrc));
check("eval4.callLLM 薄委托（温度 0.3 / maxTokens 700）",
  eval4Src.indexOf("window.LLM.chat(messages, { temperature: 0.3, maxTokens: 700") !== -1);
check("speech.callLLM 薄委托（温度 0.3 / maxTokens 520）",
  speechSrc.indexOf("window.LLM.chat(messages, { temperature: 0.3, maxTokens: maxTokens || 520") !== -1);
check("tutor 连通性测试改走 LLM.probe（分诊 toast 留在 tutor）",
  tutorSrc.indexOf("window.LLM.probe(b, m, k)") !== -1 && tutorSrc.indexOf("API 401") !== -1);

/* llm.js 可在 Node 加载，ready/isLocal 口径正确 */
global.window = {};
global.localStorage = {
  _s: {}, getItem: function (k) { return this._s[k] || null; },
  setItem: function (k, v) { this._s[k] = String(v); }
};
require(path.join(ROOT, "js", "llm.js"));
const L = global.window.LLM;
check("llm.js 暴露 cfg/isLocal/ready/chat/probe", !!L && typeof L.chat === "function" && typeof L.probe === "function");
check("ready 口径：本地端点免 Key，缺 baseUrl/model 判不可用", (function () {
  const local = { provider: "ollama", baseUrl: "http://localhost:11434/v1", model: "qwen" };
  const remote = { provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", apiKey: "sk-x" };
  const noKey = { baseUrl: "https://api.deepseek.com", model: "deepseek-chat" };
  const noModel = { baseUrl: "https://api.deepseek.com", apiKey: "sk-x" };
  return L.ready(local) && L.ready(remote) && !L.ready(noKey) && !L.ready(noModel);
})());
check("cfg() 从 localStorage 读取 fte-tutor-cfg", (function () {
  localStorage.setItem("fte-tutor-cfg", JSON.stringify({ baseUrl: "https://api.deepseek.com", model: "m", apiKey: "k" }));
  const c = L.cfg();
  return !!c && c.model === "m" && L.CFG_KEY === "fte-tutor-cfg";
})());

/* ---------- P2-10：场景状态机 ---------- */
check("tutor.js 定义 ≥6 个场景，每个 ≥4 阶段且判定标准齐备", (function () {
  const m = tutorSrc.match(/const RP_SCENARIOS = \[([\s\S]*?)\n  \];/);
  if (!m) return false;
  const blocks = m[1].split(/\n    \{\n/).slice(1);
  if (blocks.length < 6) return false;
  return blocks.every(function (b) {
    const stages = (b.match(/label: "/g) || []).length;
    const judges = (b.match(/judge: "/g) || []).length;
    return stages >= 4 && stages === judges && b.indexOf('id: "') !== -1 && b.indexOf("buyer:") !== -1 && b.indexOf("opener:") !== -1;
  });
})());
check("JSON 协议进 system 提示词（say/stageDone/coach 三字段）",
  /rpSystemPrompt[\s\S]*\{\\"say\\":[\s\S]*stageDone[\s\S]*coach/.test(tutorSrc));
check("rpSystemPrompt 无条件追加 FACT_GUARD（关卡不豁免事实边界）",
  (function () {
    const seg = tutorSrc.split("function rpSystemPrompt")[1] || "";
    const body = seg.split("function rpBarHtml")[0];
    return body.indexOf("FACT_GUARD") !== -1;
  })());
check("协议失败降级：不守 JSON 时原样显示、状态不动",
  tutorSrc.indexOf("未按关卡协议回复") !== -1 && /if \(p\) \{/.test(tutorSrc));
check("关卡开场白入对话历史（opener 注入）",
  /case "rp-start":[\s\S]{0,400}sc\.opener[\s\S]{0,120}saveChat\(\)/.test(tutorSrc));
check("阶段推进有界（最后阶段标记完成，不无限推进）",
  tutorSrc.indexOf("rp.done = true") !== -1);
check("fte-tutor-rp-v1 已登记且 backup:true", /key: "fte-tutor-rp-v1"[^\n]*backup: true/.test(read("js/storage-keys.js")));

/* ---------- P2-11：节奏反馈 ---------- */
/* 合成信号：0.5s 静音 + 0.8s 150Hz → onset ≈ 0.5s */
const SR = 16000;
const pcm = new Float32Array(Math.round(SR * 1.3));
for (let i = Math.round(SR * 0.5); i < pcm.length; i++) {
  pcm[i] = 0.3 * Math.sin(2 * Math.PI * 150 * (i - Math.round(SR * 0.5)) / SR);
}
require(path.join(ROOT, "js", "acoustic.js"));
const an = global.window.Acoustic.analyzePcm(pcm, SR);
check("analyzePcm 返回 onsetSec（开口延迟）", an.ok && an.onsetSec != null && an.onsetSec > 0.4 && an.onsetSec < 0.62,
  "实得 " + an.onsetSec);
const appSrc2 = read("js/app.js");
check("跟读面板含节奏反馈（开口延迟/有效语速）", appSrc2.indexOf("开口延迟") !== -1 && appSrc2.indexOf("有效语速") !== -1);
check("逐词延迟的诚实边界写明（需 ASR 时间戳，本页不做）", appSrc2.indexOf("逐词延迟需语音识别时间戳") !== -1);

console.log(pass ? "\n=== P2 批次门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);
