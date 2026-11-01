#!/usr/bin/env node
/* AI 对练「功能对齐批（A 层 · 替代桌面 realtime_client）」门禁：
   A. 场景库（vm 加载 js/tutor.js，用最小 DOM 桩）
      · SCENARIOS = 18，id/en/cn 唯一；类别齐全；每个场景有 en/cn/opener/openerCn
      · 现有 DRILL_TOPICS（深度操练话题库）与 starterChips（快速开始）扩而不删
   B. 双语字幕解析（纯函数）
      · 正常（英文 + ---ZH--- + 中文 + ---USER-ZH--- + 学生句中文）
      · 缺分隔 → fallback=true（回退英文单语，保留「🌐 翻译」）
      · 多分隔 → 只取第一对、不吞内容、不出现残留标记
   C. 求助 / 生词 / 请求数 / 披露 / 无内联
      · [HELP-I-CANNOT-SAY] 接线、求助面板、编号选项逐句跟读
      · [[word]] 解析 → 可点高亮 → 小卡 → 加单词卡队列（FSRS）
      · 一条用户句最多 1 次请求（sendPending 里 callChat 恰好 1 处；没有为「用户句翻译」再发请求）
      · 术语保留、FACT_GUARD 仍在 system 最末、披露出口、无内联事件
*/
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log("✅ " + name + (detail ? "  " + detail : "")); }
  else { fail++; console.log("❌ " + name + (detail ? "  " + detail : "")); }
}

/* ---------- 最小 DOM/存储桩，加载 tutor.js ---------- */
const src = fs.readFileSync(path.join(ROOT, "js", "tutor.js"), "utf8");
const store = {};
const localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
const stubEl = { addEventListener: function () {}, classList: { add: function () {}, remove: function () {}, toggle: function () {} }, style: {}, value: "", hidden: true, textContent: "", innerHTML: "", appendChild: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; } };
const documentStub = {
  getElementById: function () { return null; }, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
  addEventListener: function () {}, createElement: function () { return Object.assign({}, stubEl); }, body: Object.assign({}, stubEl)
};
const windowStub = { addEventListener: function () {}, location: { hash: "" }, FTE_BOOT: null, Player: null, navigator: { userAgent: "node" } };
windowStub.window = windowStub;
windowStub.document = documentStub;
windowStub.localStorage = localStorage;
const ctx = {
  window: windowStub, document: documentStub, localStorage: localStorage, console: console,
  JSON: JSON, Math: Math, Object: Object, Array: Array, String: String, Number: Number, Date: Date,
  setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
  fetch: function () { return Promise.reject(new Error("no network")); }
};
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: "js/tutor.js" });
const Tutor = ctx.window.Tutor;
const T = (Tutor && Tutor._t) || {};

check("tutor.js 仍导出 window.Tutor.callChat / FACT_GUARD / AIDisclosure", !!(Tutor && Tutor.callChat && Tutor.FACT_GUARD && ctx.window.AIDisclosure));

/* ---------- A. 场景库 ---------- */
const S = T.SCENARIOS || [];
check("场景数 = 18", S.length === 18, "n=" + S.length);
check("场景 id 唯一", new Set(S.map(function (s) { return s.id; })).size === S.length);
check("场景 en 唯一（角色说明不重复）", new Set(S.map(function (s) { return s.en; })).size === S.length);
check("场景 cn 唯一（中文名不重复）", new Set(S.map(function (s) { return s.cn; })).size === S.length);
const cats = T.SCENE_CATS || [];
check("类别 = 10 组（开发客户/询盘报价/谈判/订单单证/生产催货/出货物流/收款售后/客诉与质量/展会与验厂/技术答疑）",
  cats.length === 10, cats.map(function (c) { return c.cn; }).join("/"));
check("每个场景属于已定义类别", S.every(function (s) { return cats.some(function (c) { return c.id === s.cat; }); }));
check("每个类别至少 1 个场景", cats.every(function (c) { return S.some(function (s) { return s.cat === c.id; }); }));
check("每个场景都有老师开场白（英文 + 中文）",
  S.every(function (s) { return /[A-Za-z]/.test(s.opener) && /[\u4e00-\u9fa5]/.test(s.openerCn); }));
check("开场白是「老师先说」的第一句（不是学生指令）",
  S.every(function (s) { return !/^Role-play:/i.test(s.opener); }));
/* 扩而不删：深度操练话题库与快速开始仍存在 */
const drillBlock = src.slice(src.indexOf("const DRILL_TOPICS"), src.indexOf("];", src.indexOf("const DRILL_TOPICS")));
const drillCount = (drillBlock.match(/\{ en:/g) || []).length;
check("深度操练话题库 DRILL_TOPICS 扩而不删（≥12 条）", drillCount >= 12, "n=" + drillCount);
check("快速开始 starterChips 保留（旧场景/模式没被删）", src.indexOf("function starterChipsHtml") !== -1 && src.indexOf("starter-chip") !== -1);
check("免按键 VAD 保留", src.indexOf("autoMic") !== -1 && src.indexOf("startAutoMic") !== -1);
check("教练规则 / 纠错节奏保留", src.indexOf("function coachLines") !== -1 && src.indexOf("correctMode") !== -1);

/* ---------- B. 双语解析 ---------- */
const normal = T.parseTutorReply("That's a fair point.\n---ZH---\n这个说法有道理。\n---USER-ZH---\n我想确认交期。");
check("解析：英文正文", normal.en === "That's a fair point.", JSON.stringify(normal.en));
check("解析：中文对照", normal.zh === "这个说法有道理。", JSON.stringify(normal.zh));
check("解析：用户句中文（USER-ZH）", normal.userZh === "我想确认交期。", JSON.stringify(normal.userZh));
check("解析：正常时 fallback=false", normal.fallback === false);
const missing = T.parseTutorReply("Only English, no markers here.");
check("解析失败（缺 ---ZH---）→ fallback=true（回退单语）", missing.fallback === true && missing.zh === "");
const extra = T.parseTutorReply("English.\n---ZH---\n中文一。\n---ZH---\n中文二。\n---USER-ZH---\n学生句。");
check("多重分隔：只取第一对、不抛错", extra.fallback === false && extra.zh.indexOf("中文一") === 0, JSON.stringify(extra.zh));
check("多重分隔：不残留标记", extra.zh.indexOf("---") === -1 && extra.userZh.indexOf("---") === -1);
check("回退时保留「🌐 翻译」按钮（渲染按 m.zh 有无判断）", /m\.zh \? "" : '<button[^']*tutor-translate/.test(src));

/* ---------- C. 求助 / 生词 / 请求数 / 披露 ---------- */
check("求助：发送时带 [HELP-I-CANNOT-SAY] 标记", src.indexOf("[HELP-I-CANNOT-SAY]") !== -1);
check("求助：面板与按钮接线（tutor-help-toggle / tutor-help-send / tutorHelpInput）",
  src.indexOf('case "tutor-help-toggle"') !== -1 && src.indexOf('case "tutor-help-send"') !== -1 && src.indexOf('id="tutorHelpInput"') !== -1);
check("求助：提示词要求 1–2 个说法 + 让学员复述（编号行）", /1-2 natural English options/.test(src) && /beginning with '1\. '/.test(src));
check("求助：编号选项逐句 🔊 跟读（复用 shadow 动作）", /data-action="shadow" data-text=/.test(src) && /optionLines/.test(src));

const words = T.extractWords("Try [[coating weight]] and [[lead time]] and [[coating weight]].");
check("生词解析：[[word]] 去重保序", JSON.stringify(words) === JSON.stringify(["coating weight", "lead time"]), JSON.stringify(words));
check("生词解析：stripWordMarks 去掉标记", T.stripWordMarks("a [[coating weight]] b") === "a coating weight b");
check("生词：渲染成可点高亮（tutor-word + data-w）", /class="tutor-word" data-action="tutor-word" data-w=/.test(src));
check("生词：小卡 + 加入单词卡（复用 FSRS 队列）", src.indexOf("function wordCardHtml") !== -1 && src.indexOf("function addWordsToFlash") !== -1 && /FTE_BOOT/.test(src) && /State\.flash/.test(src));
check("生词：AI 释义兜底且带披露", src.indexOf("function explainWordWithAI") !== -1 && /aiDisclosureHtml\(\)/.test(src));
check("生词：本场景生词一键全收", src.indexOf("function allSceneWords") !== -1 && src.indexOf('case "tutor-words-all"') !== -1);

/* 请求数上限：sendPending 内只有 1 处 callChat；没有「用户句再翻一次」的第二次请求 */
const sendStart = src.indexOf("function sendPending");
const sendEnd = src.indexOf("function afterReply", sendStart);
const sendBody = src.slice(sendStart, sendEnd);
check("请求数：一条用户句只发 1 次请求（sendPending 内 callChat 恰 1 处）",
  (sendBody.match(/callChat\s*\(/g) || []).length === 1, "calls=" + (sendBody.match(/callChat\s*\(/g) || []).length);
check("请求数：用户句中文来自同一次回复（---USER-ZH---），不再单独请求",
  /USER_ZH_SPLIT/.test(src) && !/translateMsgUser|userTranslate/.test(src));
check("术语保留：提示词要求行业术语英文原样", /keep industry terms in English as-is/.test(T.PARITY_PROMPT || src));
check("FACT_GUARD 仍在 system 最末（PARITY 之前）", /PARITY_PROMPT, FACT_GUARD\]\.filter/.test(src));
check("披露：AI 回复接 aiDisclosureHtml", /aiDisclosureHtml\(\)/.test(src));
check("无内联事件处理器", !/\son(click|change|input|submit|keydown|load|error)\s*=\s*["']/i.test(src));
check("无内联 <script>", !/<script\b/i.test(src));
check("场景入口不新增路由（没有新 hash 白名单/导航）", !/#\/scenario|#\/tutor-scene/.test(src));

console.log("\n" + (fail ? "=== 有断言失败 ===" : "=== 全部通过 ===") + "  pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
