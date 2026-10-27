#!/usr/bin/env node
/* P14 渲染冒烟：真正跑一遍 Tutor.render()，确认「⏱ 首响计时 + 先给半句」面板与徽章能渲染、不抛错。
   为什么单独一道门禁：tools/test-p14.js 只做静态断言（源码里有这个字符串），
   而这一批改的偏偏是**模板字符串拼出来的 HTML**——静态断言挡不住 ${} 拼错、字段未转义、
   条件写反导致「每轮都提示先给半句」这类只有渲染才暴露的问题。
   做法：最小 DOM 桩（不引 jsdom、零依赖），按真实启动顺序加载 js/tutor.js，
   预置 localStorage 的 cfg（Key 已配置 → 进入有 Key 分支）与 chat（两条带 ms 的用户消息），
   然后检查徽章、统计、慢轮提示与口径文案。
   注意：本脚本只读源码、不写任何文件。 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

const store = {
  "fte-tutor-cfg": JSON.stringify({
    provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat",
    apiKey: "sk-test", systemPrompt: "", coach: {}, profile: {}
  }),
  "fte-tutor-chat-v1": JSON.stringify([
    { role: "user", content: "We can ship in 20 days.", ms: 4200 },
    { role: "assistant", content: "Good — but what about the deposit?" },
    { role: "user", content: "Hmm, let me check.", ms: 7200 }
  ])
};
const localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fakeEl(name) {
  return {
    name: name, innerHTML: "", textContent: "", value: "", placeholder: "", checked: false,
    scrollTop: 0, scrollHeight: 0,
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    addEventListener: function () {}, focus: function () {},
    getAttribute: function () { return null; }, setAttribute: function () {}, closest: function () { return null; }
  };
}
const nodes = {};
const documentStub = {
  getElementById: function (id) { if (!nodes[id]) nodes[id] = fakeEl(id); return nodes[id]; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  addEventListener: function () {},
  createElement: function () { return fakeEl("el"); },
  body: fakeEl("body")
};
const Player = {
  speak: function () {}, recognitionSupported: function () { return false; },
  micRequest: function () { return Promise.resolve(); }, recognize: function () { return null; },
  vadSupported: function () { return false; }, recognizeAuto: function () { return null; },
  recErrorText: function (e) { return String(e); }, testSpeechReach: function () { return Promise.resolve({}); }
};
const win = {};
win.TutorEnv = {
  esc: esc, toast: function () {},
  getProgress: function () {
    return { coachWeekly: { wk: "2026-W43", lines: [] }, eval4: [], tutorReview: [], wordbook: [], drillRecords: [] };
  },
  saveProgress: function () {}, lookupWord: function () { return null; }, Player: Player
};

const src = fs.readFileSync(path.join(ROOT, "js", "tutor.js"), "utf8");
try {
  new Function("window", "document", "localStorage", "location", "confirm", "performance", "TutorEnv", src + "\n;")(
    win, documentStub, localStorage, { hash: "#/tutor" }, function () { return false; }, { now: function () { return Date.now(); } }, win.TutorEnv
  );
} catch (e) {
  check("js/tutor.js 在最小 DOM 桩下可加载", false, String(e && e.message));
  process.exit(1);
}
check("js/tutor.js 在最小 DOM 桩下可加载", typeof win.Tutor === "object" && typeof win.Tutor.render === "function");

let html = "";
try {
  win.Tutor.render();
  html = documentStub.getElementById("app").innerHTML || "";
  check("Tutor.render() 不抛错并产出 HTML", html.length > 2000, "长度 " + html.length);
} catch (e) {
  check("Tutor.render() 不抛错并产出 HTML", false, String(e && e.message));
}
check("「⏱ 首响计时」面板已渲染（.lat-panel）", html.indexOf("lat-panel") !== -1 && html.indexOf("首响计时") !== -1);
check("会话统计正确：2 次 · 中位 5.7s · 最好 4.2s",
  html.indexOf("本次 2 次") !== -1 && html.indexOf("中位 5.7s") !== -1 && html.indexOf("最好 4.2s") !== -1);
check("4.2s → 偏慢徽章、7.2s → 太慢徽章",
  html.indexOf("⏱ 首响 4.2s · 偏慢") !== -1 && html.indexOf("⏱ 首响 7.2s · 太慢") !== -1);
check("「先给半句」提示只出现在慢于 6s 的那一轮（恰好 1 次）",
  (html.match(/客户已经等了/g) || []).length === 1 && html.indexOf("客户已经等了 7.2 秒") !== -1);
check("三件套的 🔊 按钮已渲染（data-action=tutor-lat-speak ×3）",
  (html.match(/tutor-lat-speak/g) || []).length === 3);
check("口径说明在位：偏保守 / 打字不算 / 不写盘 / 不是能力证据",
  html.indexOf("偏保守") !== -1 && html.indexOf("打字不算") !== -1 &&
  html.indexOf("不写盘") !== -1 && html.indexOf("不是能力证据") !== -1);
check("没有未替换的模板残留（${）", html.indexOf("${") === -1);

console.log(pass ? "\n=== P14 渲染冒烟通过 ===" : "\n=== P14 渲染冒烟失败 ===");
process.exit(pass ? 0 : 1);
