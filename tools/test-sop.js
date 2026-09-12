#!/usr/bin/env node
/* 验收测试：🧭 外贸实操 SOP 的英文接入练习引擎（js/sop.js）。
   由来（SLA 专家评审）：SOP 里的英文句子此前**只能看和复制，点不进任何练习引擎**；
   而一线教师反馈 SOP 是「唯一明天就能用的」功能。本批把它接上了两个既有引擎。

   核心断言：**每个 SOP 英文句子都必须有一条练习路径**——单句「🎤 练」覆盖全部句子
   （因为全部句子都经由同一个 enLineHtml 渲染），另外整阶段/整节还各有批量入口。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

/* ---------------- 最小环境 ---------------- */
const appEl = { innerHTML: "" };
global.document = {
  addEventListener: function () { },
  getElementById: function (id) { return id === "app" ? appEl : null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; }
};
global.localStorage = {
  _d: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};
global.location = { hash: "" };
const TOASTS = [];
global.window = {
  ASRUtil: { toast: function (m) { TOASTS.push(m); } },
  TutorEnv: {
    toast: function (m) { TOASTS.push(m); },
    lookupWord: function (w) { return w === "curing" ? { ipa: "/ˈkjʊərɪŋ/", cn: "熟化", exCn: "" } : null; }
  },
  FTE_BOOT: {
    State: {},
    get progress() { return { rate: 1 }; },
    esc: function (s) { return String(s == null ? "" : s); }
  },
  Player: null
};

require(path.join(ROOT, "js", "sop.js"));
const SOP = global.window.SOP;
const T = SOP && SOP._t;

/* ---------------- ① 模块形态 ---------------- */
check("SOP 仍导出 render 与 stats", SOP && typeof SOP.render === "function" && typeof SOP.stats === "function");
check("SOP 导出练习相关测试钩子",
  !!T && typeof T.allStepLines === "function" && typeof T.extractWords === "function" &&
  typeof T.sendToStage === "function" && typeof T.sendToFlash === "function");

/* ---------------- ② 句子收集 ---------------- */
const all = T.allStepLines();
check("收集到全部 27 步", all.length === 27, "n=" + all.length);
check("每一步都带英文句子", all.every(function (s) { return s.en && s.en.length > 20; }));
check("每一步都带中文对照", all.every(function (s) { return s.enCn && s.enCn.length > 4; }));
check("四阶段结构完整", T.STAGES.length === 4 && T.STAGES.every(function (s) { return s.steps.length; }),
  T.STAGES.map(function (s) { return s.steps.length; }).join("+"));
check("催款话术 5 句可用", T.CHASE_LINES.length === 5 && T.CHASE_LINES.every(function (l) { return l.en; }));

const lines = T.toLines(all);
check("toLines 过滤并映射出纯句子", lines.length === 27 && lines[0].en && typeof lines[0].cn === "string");
check("toLines 容忍脏数据", T.toLines([null, {}, { en: "" }, { en: "ok here" }]).length === 1);

/* ---------------- ③ 实词提取 ---------------- */
const cards = T.extractWords(lines);
const ws = cards.map(function (c) { return c.w; });
check("提取到实词若干", cards.length > 60, "n=" + cards.length);
check("停用词被过滤", ws.indexOf("the") === -1 && ws.indexOf("we") === -1 && ws.indexOf("that") === -1);
check("实词不重复", new Set(ws).size === ws.length);
check("词库命中时回填音标与释义", (function () {
  const c = cards.filter(function (x) { return x.w === "curing"; })[0];
  return c && c.ipa === "/ˈkjʊərɪŋ/" && c.cn === "熟化";
})());
check("卡 id 带 sop- 前缀，避免与站内词条冲突", cards.every(function (c) { return c.id.indexOf("sop-") === 0; }));
check("例句取自 SOP 原句", cards[0].ex && cards[0].ex.length > 15);

/* ---------------- ④ 送进五阶段闯关 ---------------- */
const bootState = global.window.FTE_BOOT.State;
T.sendToStage("测试阶段", [{ en: "We have received your deposit today.", cn: "我们今天收到定金。" }]);
const sp = bootState.speak;
check("sendToStage 写入了 State.speak", !!sp);
check("模式为五阶段闯关 mode=stage", sp.mode === "stage");
check("句子进入 dialogues（含中英对照）",
  sp.unit.dialogues[0].lines.length === 1 &&
  sp.unit.dialogues[0].lines[0].en === "We have received your deposit today." &&
  sp.unit.dialogues[0].lines[0].cn === "我们今天收到定金。");
check("unit 标题带 🧭 且标注非站内单元",
  /🧭/.test(sp.unit.title) && /非站内/.test(sp.unit.desc));
check("跳转到 #/speak", global.location.hash === "#/speak", global.location.hash);
check("给出 toast 反馈", TOASTS.some(function (m) { return /五阶段闯关/.test(m); }));

/* 整阶段批量 */
global.location.hash = ""; TOASTS.length = 0;
T.sendToStage(T.STAGES[0].t, T.STAGES[0].steps);
check("整阶段批量：句子数等于该阶段步数",
  bootState.speak.unit.dialogues[0].lines.length === T.STAGES[0].steps.length,
  bootState.speak.unit.dialogues[0].lines.length + " 句");

/* 空列表不炸也不跳转 */
global.location.hash = ""; TOASTS.length = 0;
T.sendToStage("空", []);
check("空列表：不跳转且给出提示",
  global.location.hash === "" && TOASTS.some(function (m) { return /没有可练/.test(m); }));

/* ---------------- ⑤ 送进单词卡 FSRS ---------------- */
T.sendToFlash("测试", lines.slice(0, 4));
const fl = bootState.flash;
check("sendToFlash 写入了 State.flash", !!fl);
check("queue 为抽取的实词", Array.isArray(fl.queue) && fl.queue.length > 0);
check("卡片字段完整（w/ipa/cn/ex）",
  fl.queue.every(function (c) { return c.w && typeof c.ipa === "string" && typeof c.cn === "string" && c.ex; }));
check("跳转到 #/flash", global.location.hash === "#/flash", global.location.hash);
check("上限 40 张，避免一次灌爆",
  (function () { T.sendToFlash("大", lines); return bootState.flash.queue.length <= 40; })());

/* ---------------- ⑥ 渲染：每个句子都有练习入口 ---------------- */
const html = fs.readFileSync(path.join(ROOT, "js", "sop.js"), "utf8");
check("enLineHtml 里加了「🎤 练」按钮", /data-action="sop-practice"/.test(html));
check("该按钮是唯一渲染出口，故覆盖全部 SOP 句子",
  (html.match(/function enLineHtml/g) || []).length === 1);
check("暴露了「练」按钮的英文与中文（供点击时直接送练）",
  /data-en="' \+ esc\(en\) \+ '" data-cn="' \+ esc\(cn \|\| ""\)/.test(html));
check("每阶段有批量送练入口", /data-action="sop-practice-stage"/.test(html));
check("全部 27 步有总入口", /data-action="sop-practice-all"/.test(html));
check("催款话术有批量送练入口", /data-action="sop-practice-chase"/.test(html));
check("批量入口也提供「实词进单词卡」",
  /sop-flash-stage/.test(html) && /sop-flash-all/.test(html) && /sop-flash-chase/.test(html));
check("总览处说明了英文可直接拿去练", /不只看和复制/.test(html));

/* 事件处理已接上 */
["sop-practice", "sop-practice-stage", "sop-practice-all", "sop-practice-chase"].forEach(function (a) {
  check("事件分支已实现：" + a, new RegExp('act === "' + a + '"').test(html));
});

/* ---------------- ⑦ 架构冻结守卫 ---------------- */
const htmlSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const navBlock = (htmlSrc.match(/<nav class="main-nav" id="mainNav">([\s\S]*?)<\/nav>/) || [])[1] || "";
const navCount = (navBlock.match(/<a [^>]*href="#\/[a-z0-9]+"/g) || []).length;
check("架构冻结：导航仍为 16 项", navCount === 16, "n=" + navCount);
check("未新增路由（复用 #/speak 与 #/flash）",
  !/"sop-practice"/.test(fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8")));

console.log("\n-- SOP 英文句子抽样（每阶段一句）--");
T.STAGES.forEach(function (s) {
  console.log("  " + s.icon + " " + s.t + "\n      " + s.steps[0].en);
});
console.log("  共可练 " + all.length + " 句（另有催款话术 " + T.CHASE_LINES.length + " 句）");

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
