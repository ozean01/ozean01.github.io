#!/usr/bin/env node
/* 验收测试：✍️ 反馈二稿闭环 (js/write.js)。
   学理依据（SLA 专家评审称其为「全站最大学理缺口」）：
     反馈必须经过「注意 + 修改性输出」才产生习得；只读一遍 AI 批改学不到东西。
   故这里重点验证三件事：
     ① compareDrafts 的对比算法正确（要点覆盖 / 新增 / 丢失 / 未用）；
     ② 二稿区块只在收到反馈后出现（不在写第一稿时就堆上来）；
     ③ 教学守卫——二稿与一稿一模一样时**不通过**，否则「闭环」是假的。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

/* ---------------- 最小假 DOM ---------------- */
const els = {};
function fakeEl(id) {
  return {
    id: id || "", innerHTML: "", textContent: "", value: "", hidden: true,
    classList: { add: function () { }, remove: function () { }, toggle: function () { } },
    setAttribute: function () { }, getAttribute: function () { return null; },
    addEventListener: function () { }, querySelectorAll: function () { return []; }
  };
}
const appEl = fakeEl("app");
els.app = appEl;
global.document = {
  addEventListener: function () { },
  getElementById: function (id) { return els[id] || (id === "app" ? appEl : null); },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; }
};
global.sessionStorage = {
  _d: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};
global.localStorage = {
  _d: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};

/* 课程数据：只要够 keyPhrases 与 checkKeywords 用 */
global.FTE_DATA = {
  units: [
    { id: 2, icon: "🏢", title: "开发新客户", vocab: [], phrases: [
      { p: "develop new customers", cn: "开发新客户", ex: "We are developing new customers in Europe.", exCn: "" },
      { p: "product catalog", cn: "产品目录", ex: "Please find our product catalog attached.", exCn: "" }
    ]},
    { id: 4, icon: "✉️", title: "商务邮件写作", vocab: [], phrases: [
      { p: "look forward to", cn: "期待", ex: "We look forward to your reply.", exCn: "" },
      { p: "quotation", cn: "报价", ex: "Please send us your quotation.", exCn: "" }
    ]}
  ]
};

global.window = {
  TutorEnv: {
    esc: function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); },
    toast: function () { }
  },
  CoachBridge: { text: function () { return ""; }, done: function () { } },
  Tutor: { hasConfig: function () { return false; } }
};

require(path.join(ROOT, "js", "write.js"));
const W = global.window.WriteStudio;
const T = W._t;

/* ---------------- ① 模块形态 ---------------- */
check("导出 WriteStudio.render", W && typeof W.render === "function");
check("导出 _t 钩子", !!T && typeof T.compareDrafts === "function" && typeof T.draft2Html === "function");

/* ---------------- ② compareDrafts 算法正确性 ---------------- */
const kw = T.keyPhrases([2, 4]);
check("keyPhrases 取到关联单元的关键表达", kw.length === 4, "n=" + kw.length);

const d1 = "We want to sell products to you.";
const d2 = "We are developing new customers in Europe. Please find our product catalog attached.";
const c = T.compareDrafts(d1, d2, kw);
check("词数分别统计", c.wc1 === 7 && c.wc2 === 13, c.wc1 + " / " + c.wc2);
check("一稿要点覆盖为 0%", c.rate1 === 0, c.rate1 + "%");
check("二稿要点覆盖提升（2/4 = 50%）", c.rate2 === 50, c.rate2 + "%");
check("新增表达被列出", c.added.length === 2, c.added.join(", "));
check("无丢失表达", c.lost.length === 0, c.lost.join(", "));
check("仍未用到的表达被列出", c.stillMissing.length === 2, c.stillMissing.join(", "));

/* 反向：二稿丢掉了表达 */
const c2 = T.compareDrafts(
  "We are developing new customers in Europe. Please send us your quotation.",
  "We want to sell products to you.",
  kw);
check("能识别出二稿丢掉的表达", c2.lost.length === 2, c2.lost.join(", "));
check("覆盖下降时 rate2 < rate1", c2.rate1 === 50 && c2.rate2 === 0, c2.rate1 + "→" + c2.rate2);

/* 边界 */
check("空串不抛错且覆盖为 0", (function () {
  const x = T.compareDrafts("", "", kw);
  return x.wc1 === 0 && x.wc2 === 0 && x.rate1 === 0 && x.rate2 === 0 && x.added.length === 0;
})());
check("null 输入不抛错", (function () {
  try { T.compareDrafts(null, null, kw); return true; } catch (e) { return false; }
})());
check("空关键词表不除零", T.compareDrafts("a b", "a b c", []).rate1 === 0);

/* ---------------- ②′ 要点匹配的标点处理（既有缺陷修正） ---------------- */
/* 修前：短语末尾带标点时永远匹配不上（"Please find attached..." 会被切成 "attached..."） */
const kwPunct = [{ t: "Please find attached...", cn: "随函附上" }, { t: "We look forward to your reply.", cn: "期待回复" }];
const rp = T.checkKeywords("Please find attached our quotation. We look forward to your reply.", kwPunct);
check("带省略号的短语现在能匹配上", rp[0].hit === true, rp[0].t);
check("带句号的短语现在能匹配上", rp[1].hit === true, rp[1].t);
check("原文里的标点不影响匹配",
  T.checkKeywords("please find attached, our catalog!", [{ t: "Please find attached", cn: "" }])[0].hit === true);
check("不相关短语仍然不匹配（没有放宽成无条件命中）",
  T.checkKeywords("hello world", [{ t: "Please find attached", cn: "" }])[0].hit === false);
check("normKw 去掉标点并归一空白",
  T.normKw("  Hello,   WORLD!  ") === "hello world", T.normKw("  Hello,   WORLD!  "));

/* ---------------- ③ 二稿区块的渲染与出现时机 ---------------- */
const state = { scen: "cold", text: d1, checked: false };
let html0 = "";
try { appEl.innerHTML = ""; global.sessionStorage.setItem("fte-write-state", JSON.stringify(state)); W.render(); html0 = appEl.innerHTML; }
catch (e) { check("render() 不抛错", false, e.message); }
check("未做要点自查时不显示二稿区块", html0.indexOf("ws-d2") === -1);

state.checked = true;
global.sessionStorage.setItem("fte-write-state", JSON.stringify(state));
W.render();
const html1 = appEl.innerHTML;
check("要点自查后才出现二稿区块", html1.indexOf('class="ws-d2"') !== -1);
check("二稿默认用一稿预填（让用户改，而非从空白重写）",
  html1.indexOf('id="wsDraft2"') !== -1 && html1.indexOf(d1) !== -1);
check("二稿区块含完成与重置两个操作",
  html1.indexOf('data-action="ws-d2-done"') !== -1 && html1.indexOf('data-action="ws-d2-reset"') !== -1);
check("未完成二稿时不显示对比", html1.indexOf("ws-cmp") === -1);

/* 完成二稿后 → 出现对比 */
state.draft2 = d2; state.d2done = true;
global.sessionStorage.setItem("fte-write-state", JSON.stringify(state));
W.render();
const html2 = appEl.innerHTML;
check("完成二稿后渲染出对比块", html2.indexOf('class="ws-cmp"') !== -1);
check("对比块显示 一稿→二稿 的两个指标", /要点覆盖/.test(html2) && /词数/.test(html2));
check("对比块显示提升结论", /覆盖提升|要点更完整|覆盖持平|覆盖下降/.test(html2));

/* compareHtml 各分支都渲染得出来 */
const branches = [
  T.compareDrafts(d1, d2, kw),      /* 提升 */
  T.compareDrafts(d2, d2, kw),      /* 持平 */
  T.compareDrafts(d2, d1, kw)       /* 下降 */
];
check("compareHtml 三种情形都不抛错", branches.every(function (b) {
  try { return typeof T.compareHtml(b) === "string" && T.compareHtml(b).length > 50; } catch (e) { return false; }
}));

/* ---------------- ④ 教学守卫：二稿必须真的改过 ---------------- */
const src = fs.readFileSync(path.join(ROOT, "js", "write.js"), "utf8");
check("二稿与一稿完全相同时会被拒绝", /二稿和一稿一模一样/.test(src));
check("二稿为空时会被拒绝", /第二稿还是空的/.test(src));
check("二稿区块的文案说明了为什么必须改（uptake）", /反馈只有转化成自己的修改才算学会/.test(src));

/* ---------------- ⑤ 保存时一并存下二稿与前后分数 ---------------- */
check("保存时会写入 draft2 / rate1 / rate2",
  /draft2: has2 \? s\.draft2 : ""/.test(src) && /rate1: c \? c\.rate1 : null/.test(src));
check("作品集列表显示「已改二稿 x%→y%」", /已改二稿/.test(src));

/* ---------------- ⑥ 架构冻结守卫：纯增量，未新增导航项 ---------------- */
const htmlSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const navBlock = (htmlSrc.match(/<nav class="main-nav" id="mainNav">([\s\S]*?)<\/nav>/) || [])[1] || "";
const navCount = (navBlock.match(/<a [^>]*href="#\/[a-z0-9]+"/g) || []).length;
check("架构冻结：导航仍为 16 项", navCount === 16, "n=" + navCount);
check("本功能未新增路由", !/#\/draft/.test(htmlSrc) && !/"draft"/.test(fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8")));

/* ---------------- ⑦ AI 留痕与「先自己写」纪律（P7） ----------------
   由来（写作篇 / AI 篇）：原提示词第 3 条直接要「一封更专业自然的英文版本」——**那就是整段代写**；
   而且稿子存进作品集后，看不出用过 AI 没有、采纳了什么。这里盯四件事：
     ① AI 契约（可以做 / 不可以做）必须是显式的、写在按钮旁边的；
     ② 第一档批改**只指问题不给整段改写**，「地道版本」要等二稿完成才解锁（先交自己的版本）；
     ③ 留痕三元组：介入前的样本 / 关闭工具后的独立样本 / 采纳·拒绝 + 理由；
     ④ 独立复测环节里**不能出现任何 AI 入口**（不是禁用，是根本不渲染）。 */

check("导出 AI 契约两侧清单", Array.isArray(T.AI_CAN) && Array.isArray(T.AI_CANNOT) &&
  T.AI_CAN.length >= 3 && T.AI_CANNOT.length >= 3);
check("契约「不可以做」明确禁止代写整段", T.AI_CANNOT.some(function (x) { return /整段/.test(x); }));
check("契约里没有把「给整段改写」列进「可以做」",
  !T.AI_CAN.some(function (x) { return /整段|代写|改写/.test(x); }), T.AI_CAN.join(" / "));

const contract = T.aiContractHtml();
check("契约区块同时渲染可以做与不可以做", /AI 可以做/.test(contract) && /AI 不可以做/.test(contract));
check("契约写明「先提交你自己的版本」", /先提交你自己的版本/.test(contract));
check("契约写明地道版本要二稿后才解锁", /二稿才解锁/.test(contract));
check("契约写明「聊天记录不能单独作为能力证明」", /不能单独作为能力证明/.test(contract));
check("契约出现在反馈区（按钮旁边，而不是藏在提示词里）", html1.indexOf("ws-contract") !== -1);

/* ---- 两档批改：第一档禁止整段改写，第二档要二稿后才可用 ---- */
check("第一档提示词明令禁止整段改写", /严禁输出整段改写的英文版本/.test(src));
check("第一档要求「引用他的原句」并给最小提示", /每条都要引用他的原句/.test(src) && /最小提示/.test(src));
check("第二档（地道版本）要求已写过二稿才允许调用", /先自己写完二稿，再对照 AI 的地道版本/.test(src));
check("按钮文案标明「只指问题 · 不代写」", /只指问题 · 不代写/.test(src));
check("解锁按钮只在二稿完成后渲染", /s\.d2done \? '<button[^']*ws-ai-full/.test(src));
check("两档共用同一次调用，没有复制第二份实现",
  (src.match(/function writeAi\(/g) || []).length === 1);

/* 行为验证：未完成二稿时调用 full 档必须被拒（不发出请求） */
let chatCalls = 0;
global.window.Tutor = {
  hasConfig: function () { return true; },
  callChat: function () { chatCalls++; return Promise.resolve("x"); }
};
els.wsAi = fakeEl("wsAi");
global.sessionStorage.setItem("fte-write-state", JSON.stringify({ scen: "cold", text: d1, checked: true, d2done: false }));
T.writeAi({ scen: "cold", text: d1, d2done: false }, "full");
check("★ 二稿没写完时「地道版本」被拒绝（顺序反了就成代写）", chatCalls === 0, "calls=" + chatCalls);
T.writeAi({ scen: "cold", text: d1, d2done: false }, "review");
check("第一档批改正常发出请求", chatCalls === 1, "calls=" + chatCalls);

/* ---- 留痕三元组 ---- */
check("没有用过 AI 时不渲染留痕块", T.aiLedgerHtml({ text: d1 }) === "");
const led = T.aiLedgerHtml({ text: d1, aiAt: Date.now(), aiAdopt: "partial", aiReason: "它把我的 MOQ 写丢了" });
check("用过 AI 后渲染留痕三行", /介入前的样本/.test(led) && /我的处理/.test(led) && /独立样本/.test(led));
check("① 介入前的样本标记为只读保留", /只读保留/.test(led));
check("② 采纳方式三个选项齐全", /全部采纳/.test(led) && /部分采纳/.test(led) && /拒绝/.test(led));
check("② 选了处理方式后才要求填理由（必填）", /理由（必填）/.test(led) && /wsAiReason/.test(led));
check("未选处理方式时不显示理由输入（不提前堆字段）",
  T.aiLedgerHtml({ text: d1, aiAt: Date.now() }).indexOf("wsAiReason") === -1);
check("③ 没有独立稿时明确指出去第三步", /还没有——见下面第三步/.test(led));

/* ---- 平行任务：每个场景都有，且必须换条件 ---- */
check("平行任务表覆盖全部场景",
  T.SCENARIOS.every(function (sc) { return !!T.PARALLEL[sc.id]; }),
  Object.keys(T.PARALLEL).join(","));
const pt = T.parallelTask({ scen: "cold" });
check("场景写作的平行任务给出「换条件」的具体指令", !!pt && /换/.test(pt.text) && pt.kind === "scen");
const ptMail = T.parallelTask({ mail: (T.MAIL()[0] || {}).id });
check("真实来信的平行任务换成另一封信（同技能不同材料）",
  !ptMail || (ptMail.kind === "mail" && ptMail.id !== (T.MAIL()[0] || {}).id));
check("未知场景返回 null（不硬编）", T.parallelTask({ scen: "nope" }) === null);

/* ---- 第三步：关掉 AI 的独立复测 ---- */
check("二稿没完成时不出现第三步", T.indepHtml({ scen: "cold", d2done: false }, kw) === "");
const ind = T.indepHtml({ scen: "cold", d2done: true }, kw);
check("二稿完成后出现第三步", ind.indexOf("关掉 AI 独立复测") !== -1);
check("★ 第三步区块内没有任何 AI 入口（不是禁用，是不渲染）",
  ind.indexOf("ws-ai") === -1 && ind.indexOf("AI 批改") === -1);
check("第三步给出平行任务原文", ind.indexOf(T.parallelTask({ scen: "cold" }).text) !== -1);
check("第三步说明「工具介入过的样本不能证明你独立能做到」", /不能证明你独立能做到/.test(ind));
const indDone = T.indepHtml({ scen: "cold", d2done: true, indepDone: true, indep: { at: Date.now(), text: d2, wc: 13, rate: 50 } }, kw);
check("完成独立稿后显示词数与要点覆盖", /13 词/.test(indDone) && /要点覆盖 50%/.test(indDone));
check("完成态写明「只有这一栏能被当作能力证据」", /只有这一栏能被当作能力证据/.test(indDone));
check("完成态可回看与重做", /ws-indep-view/.test(indDone) && /ws-indep-reset/.test(indDone));

/* ---- 教学守卫与接线 ---- */
check("独立稿为空时被拒", /独立稿是空的/.test(src));
check("独立稿与前面那稿雷同时被拒（这一步要换条件自己写）", /独立稿和前面那稿一模一样/.test(src));
check("五个新动作都已接线",
  ['act === "ws-ai-adopt"', 'act === "ws-indep-done"', 'act === "ws-indep-fill"',
   'act === "ws-indep-view"', 'act === "ws-indep-reset"'].every(function (s) { return src.indexOf(s) !== -1; }));
/* 断言行为而不是运算符写法：input 监听把两格都写进会话状态即可，
   至于是 "a || b" 还是 "a !== x && b !== x" 的守卫形式，不属于契约。 */
check("理由与独立稿都是「输入即存」（按钮重渲染不会冲掉文字）",
  /document\.addEventListener\("input"/.test(src) &&
  /s\.aiReason = el\.value/.test(src) && /s\.indepText = el\.value/.test(src));
check("保存时一并写入 ai 与 indep 留痕",
  /ai: s\.aiAt \? \{/.test(src) && /indep: \(s\.indep && s\.indep\.text\)/.test(src));
check("作品集区分「有 AI 参与」与「独立稿」两种含金量", /有 AI 参与/.test(src) && /🔒 独立稿/.test(src));
check("完成任务时同步计入打卡（复用 CoachBridge）",
  /CoachBridge\.done\(\)|CoachBridge\.done\("write"\)/.test(src));

console.log("\n-- 一稿 → 二稿 对比样例 --");
console.log("  一稿(" + c.wc1 + "词，" + c.rate1 + "%)：" + d1);
console.log("  二稿(" + c.wc2 + "词，" + c.rate2 + "%)：" + d2);
console.log("  新增：" + c.added.join("、"));
console.log("  仍未用到：" + c.stillMissing.join("、"));

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
