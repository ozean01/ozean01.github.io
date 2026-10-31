#!/usr/bin/env node
/* 验收测试：P20 · AI 周测 + 投料口 AI 理解题（js/quiz.js 的 QuizAI，2026-10-30）。
   由来（外部素材评估）：法语学习提示词里命中本站缺口的两条——
     · 「按本周内容出 10 题，答完前不显示答案，最后打分并逐题讲错」（智能测验只有固定题库）；
     · 「把材料翻译后围绕词汇/短语/阅读理解提问」（投料口只有听/说/写三个出口）。
   本测试守住五件事：
     ① 引擎纯函数：JSON 解析/校验（围栏、越界答案、非数组）与本周上下文拼装；
     ② 延迟给答案：作答态 HTML 不得出现正确答案/依据，交卷后才给逐题讲错；
     ③ 只作练习：quiz.js 不写 localStorage，结果不落盘、不计成绩（源码与渲染文案双重断言）；
     ④ 事实边界：唯一 LLM 调用点的 system 提示词解析到 FACT_GUARD，结果块带 AI 披露出口；
     ⑤ 接线与口径：app.js/material.js 各一个挂载点（不新增导航/脚本/存储键），
        README/CHANGELOG 已记，CACHE 与 precache 基线同步。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/* ---------- 最小 DOM 桩（零依赖，沿用 smoke-p14-render.js 的做法） ---------- */
const clickHandlers = [];
function fakeEl(id) {
  return {
    id: id, innerHTML: "", textContent: "", value: "", className: "",
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    focus: function () {}, getAttribute: function () { return null; }, setAttribute: function () {}
  };
}
const nodes = {};
const documentStub = {
  getElementById: function (id) { if (!nodes[id]) nodes[id] = fakeEl(id); return nodes[id]; },
  querySelector: function () { return null; }, querySelectorAll: function () { return []; },
  addEventListener: function (type, fn) { if (type === "click") clickHandlers.push(fn); },
  body: { contains: function () { return true; } }
};
function esc(s) { return String(s == null ? "" : s); }

/* 本周上下文所需的站内数据：两个单元 + 3 个已学词 + 1 个常错词 */
const DATA = {
  units: [
    { id: 1, title: "询盘与报价", vocab: [{ w: "inquiry", cn: "询盘", ex: "Thank you for your inquiry." }, { w: "quotation", cn: "报价" }], phrases: [{ en: "quote a price", cn: "报价" }] },
    { id: 3, title: "付款方式", vocab: [{ w: "deposit", cn: "定金", ex: "We need a 30% deposit." }], phrases: [] }
  ]
};
const progress = { learned: { "1-0": true, "1-1": true, "3-0": true }, wrong: { "1-1": 2 } };
const MISTAKES = { groups: [{ items: [{ wrong: "Please kindly do the needful", right: "Please take the necessary action" }] }] };

const answered = [];
const win = {};
win.FTE_BOOT = { esc: esc, toast: function () {}, DATA: DATA, progress: progress };
win.FTE_MISTAKES = MISTAKES;
win.Tutor = {
  FACT_GUARD: "=== FACT BOUNDARY (always in force; non-negotiable) ===",
  wrapUserContent: function (t) { return "<<<STUDENT_CONTENT_START>>>\n" + t + "\n<<<STUDENT_CONTENT_END>>>"; },
  callChat: function (msgs, opts) {
    answered.push({ msgs: msgs, opts: opts });
    return Promise.resolve(JSON.stringify({
      questions: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) {
        return {
          type: ["en2cn", "cn2en", "fill", "reply"][i % 4],
          prompt: "Q" + (i + 1) + " inquiry",
          sub: "",
          options: ["correct", "b1", "b2", "b3"],
          answer: 0,
          explain: "依据：CONTEXT 里 inquiry = 询盘"
        };
      })
    }));
  }
};
win.AIDisclosure = { html: function () { return '<div class="ai-disclosure" data-ai-disclosure="1">AI 可能出错</div>'; } };
win.window = win;
win.document = documentStub;

vm.createContext(win);
vm.runInContext(read("js/quiz.js"), win, { filename: "quiz.js" });

/* ---------- ① 引擎导出与纯函数 ---------- */
check("js/quiz.js 导出 window.QuizAI（mount/start/_t.parse）", !!win.QuizAI && typeof win.QuizAI.mount === "function" && typeof win.QuizAI.start === "function" && typeof win.QuizAI._t.parse === "function");
const P = win.QuizAI._t.parse;
const okJson = '```json\n{"questions":[{"type":"en2cn","prompt":"p","options":["a","b","c","d"],"answer":1,"explain":"e"}]}\n```';
const parsed = P(okJson, 10);
check("解析器能吃下带 ``` 围栏的 JSON", parsed.length === 1 && parsed[0].answer === 1 && parsed[0].options.length === 4);
check("解析器丢弃答案越界/选项为空/非对象的坏题",
  P('{"questions":[{"prompt":"p","options":["a"],"answer":5},{"prompt":"","options":["a","b"],"answer":0},null]}', 10).length === 0);
check("解析器截断到想要的题数（want=5）", P('{"questions":[' + [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '{"prompt":"p' + i + '","options":["a","b"],"answer":0}'; }).join(",") + ']}', 5).length === 5);
check("非 JSON 返回空数组（不抛错）", P("sorry, I cannot", 10).length === 0);

/* ---------- ② 本周上下文拼装 ---------- */
const ctx = win.QuizAI._t.weekContext();
check("本周上下文含已学单元标题/词条/例句", ctx.indexOf("# UNIT 1") !== -1 && ctx.indexOf("inquiry | 询盘") !== -1 && ctx.indexOf("Thank you for your inquiry.") !== -1);
check("本周上下文含常错词（带错次）", ctx.indexOf("WORDS YOU OFTEN GET WRONG") !== -1 && ctx.indexOf("wrong 2x") !== -1);
check("本周上下文含中式英语纠错样本", ctx.indexOf("do the needful") !== -1);
check("本周上下文长度有上限（≤4500 字符）", ctx.length <= 4500, "len=" + ctx.length);

/* ---------- ③ 渲染：挂载 → 生成 → 作答（延迟答案）→ 交卷 ---------- */
function fire(attrs) {
  const target = { closest: function () { return { getAttribute: function (k) { return attrs[k] == null ? null : attrs[k]; } }; } };
  clickHandlers.forEach(function (fn) { fn({ target: target }); });
}
const box = { innerHTML: "" };
win.QuizAI.mount(box, "week");
check("挂载后渲染「AI 周测」入口与生成按钮", box.innerHTML.indexOf("AI 周测") !== -1 && box.innerHTML.indexOf('data-aiq="start"') !== -1);
check("入口文案写明「只作练习 / 不计成绩 / 不作为能力证据」", box.innerHTML.indexOf("不计入智能测验最好成绩") !== -1 && box.innerHTML.indexOf("不作为能力证据") !== -1);

/* 触发 start（同步进入 loading，随后 Promise 落地） */
fire({ "data-aiq": "start", "data-aiq-kind": "week" });
check("点击生成后立即进入 loading（不卡住按钮）", box.innerHTML.indexOf("正在出题") !== -1);
check("只调用一次 LLM，且传了低温度/长输出 opts", answered.length === 1 && answered[0].opts && answered[0].opts.temperature === 0.35 && answered[0].opts.maxTokens === 1800);
check("system 提示词里带 FACT_GUARD（调用现场）", answered[0].msgs[0].role === "system" && answered[0].msgs[0].content.indexOf("FACT BOUNDARY") !== -1);
check("user 提示词里带上下文与题数要求", answered[0].msgs[1].content.indexOf("WEEK CONTEXT") !== -1 && answered[0].msgs[1].content.indexOf("10 questions") !== -1);

setTimeout(function () {
  check("题目返回后进入作答态（第 1 / 10 题）", box.innerHTML.indexOf("第 1 / 10 题") !== -1 && box.innerHTML.indexOf("Q1 inquiry") !== -1);
  check("作答态不显示正确答案与依据（延迟给答案）",
    box.innerHTML.indexOf("正确答案") === -1 && box.innerHTML.indexOf("依据：") === -1 && box.innerHTML.indexOf("你答对了") === -1);
  check("未选择时「下一题」是 disabled", /data-aiq="next"[^>]*disabled/.test(box.innerHTML));

  /* 逐题选 A（index 0 = 正确答案）→ 下一题；第 10 题后交卷 */
  for (let i = 0; i < 10; i++) {
    fire({ "data-aiq": "pick", "data-aiq-kind": "week", "data-i": "0" });
    fire({ "data-aiq": "next", "data-aiq-kind": "week" });
  }
  check("十题答完进入结果页（逐题讲错）", box.innerHTML.indexOf("逐题讲错") !== -1 && box.innerHTML.indexOf("答对") !== -1);
  check("结果页标明「只作练习」口径", box.innerHTML.indexOf("只作练习") !== -1 && box.innerHTML.indexOf("不作为能力证据") !== -1);
  check("结果页接上 AI 披露出口（data-ai-disclosure）", box.innerHTML.indexOf("data-ai-disclosure") !== -1);
  check("结果页分数为 100%（全选正确项）", box.innerHTML.indexOf("100%") !== -1);

  /* ---------- ④ 投料口材料理解题：换材料作废旧题 ---------- */
  const box2 = { innerHTML: "" };
  win.QuizAI.mount(box2, "material", { text: "The customer asked for a 30% deposit before production. " + "Send the proforma invoice today. ".repeat(4) });
  check("材料态渲染「AI 理解题」入口（5 题）", box2.innerHTML.indexOf("AI 理解题") !== -1 && box2.innerHTML.indexOf("生成 5 道题") !== -1);
  win.QuizAI.mount(box2, "material", { text: "A completely different passage about retort pouches and sealing. ".repeat(2) });
  check("换材料后旧入口仍在（状态机不抛错）", box2.innerHTML.indexOf("AI 理解题") !== -1);

  /* ---------- ⑤ 未配置模型：给可执行指引而不是裸报错 ---------- */
  const origChat = win.Tutor.callChat;
  win.Tutor.callChat = function () { return Promise.reject(new Error("no-key")); };
  fire({ "data-aiq": "start", "data-aiq-kind": "material" });

  setTimeout(function () {
    check("未配模型时给「还没配置模型 + 去配置」指引（不是裸报错）",
      box2.innerHTML.indexOf("还没配置模型") !== -1 && box2.innerHTML.indexOf("#/tutor") !== -1 && box2.innerHTML.indexOf("重试") !== -1);
    win.Tutor.callChat = origChat;

    /* ---------- ⑥ 静态口径与接线 ---------- */
    const quizJs = read("js/quiz.js");
    check("全模块只有一处 LLM 调用（callChat 出现 1 次）", (quizJs.match(/callChat\(/g) || []).length === 1);
    check("quiz.js 不写 localStorage（只作练习、不落盘）", !/localStorage\.(get|set|remove)Item/.test(quizJs));
    check("作答模板函数不引用 q.answer（渲染层也不提前泄露答案）",
      (quizJs.match(/function aiqQuestionHtml[\s\S]*?\n  \}/) || [""])[0].indexOf("q.answer") === -1);
    check("结果模板函数含披露出口（aiqResultHtml → aiqDisclosure）",
      /function aiqResultHtml[\s\S]*?aiqDisclosure\(\)/.test(quizJs));

    const appJs = read("js/app.js");
    const matJs = read("js/material.js");
    check("app.js 测验设置页有 AI 周测挂载点", appJs.indexOf('id="quizAiWeek"') !== -1 && /QuizAI\.mount\(document\.getElementById\("quizAiWeek"\), "week"\)/.test(appJs));
    check("material.js 投料口有 AI 理解题挂载点", matJs.indexOf('id="matAIQ"') !== -1 && /QuizAI\.mount\(document\.getElementById\("matAIQ"\), "material"/.test(matJs));
    check("material.js 把当前拆出的句子作为材料传给引擎", /text: activeSentences\(\)\.join/.test(matJs));
    const tutorJs = read("js/tutor.js");
    check("callChat 支持可选 opts，且默认仍是 0.7 / 600（教学语义不变）",
      /function callChat\(messages, opts\)/.test(tutorJs) && /temperature: 0\.7, maxTokens: 600/.test(tutorJs));
    const navHtml = read("index.html");
    const navBlock = (navHtml.match(/<nav class="main-nav" id="mainNav">([\s\S]*?)<\/nav>/) || [])[1] || "";
    check("不新增导航项（index.html 导航仍是 18 个入口）", (navBlock.match(/<a [^>]*href="#\//g) || []).length === 18);

    const sw = read("sw.js");
    const base = JSON.parse(read("tools/precache-baseline.json"));
    check("sw.js CACHE 与 precache 基线同步（任务1 批次：fte-v135）", /const CACHE = "fte-v135"/.test(sw) && base.cache === "fte-v135" && base.minVersion === 135);

    console.log(pass ? "\n=== P20 全部通过 ===" : "\n=== P20 有断言失败 ===");
    process.exit(pass ? 0 : 1);
  }, 30);
}, 30);
