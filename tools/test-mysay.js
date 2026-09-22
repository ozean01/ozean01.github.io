#!/usr/bin/env node
/* 验收测试：「🗣 说我想说」(js/mysay.js)。
   两层验证：
     ① 纯函数行为：拆句 / 实词提取 / 语气提示词 / 词数；
     ② 接线门禁：新模块必须在 index.html、sw.js、app.js 三处都挂上——
        这是本站最容易「改了代码但页面没生效」的失手点，故固化成断言。 */
"use strict";
const fs = require("fs");
const path = require("path");

/* 最小假 DOM：让模块在 Node 里也能加载并跑一次 render()，
   模板字面量写错 / 引用了不存在的变量会当场抛错，比只测纯函数更能挡住真事故。 */
const appEl = { innerHTML: "" };
global.document = {
  addEventListener: function () { /* 事件委托只在浏览器里需要 */ },
  getElementById: function (id) { return id === "app" ? appEl : null; }
};
global.localStorage = {
  _d: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};
global.window = { scrollTo: function () {} };

require(path.join(__dirname, "..", "js", "mysay.js"));
const M = global.window.MySay;
const T = M && M._t;
const S = M && M._state;

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

/* ---------------- ① 模块形态 ---------------- */
check("导出 MySay.render", M && typeof M.render === "function");
check("导出测试钩子 _t", !!T && typeof T.splitSentences === "function" && typeof T.extractWords === "function");

/* ---------------- ② 拆句 ---------------- */
const s1 = T.splitSentences("Hello world. This is a test! Is it? New line here.");
check("按句末标点拆成 4 句", s1.length === 4, "n=" + s1.length);
check("保留原句文本", s1[0] === "Hello world." && s1[3] === "New line here.", JSON.stringify(s1));
check("换行被当作空格处理", T.splitSentences("One line here.\nAnother line here.").length === 2);
check("重复句子去重", T.splitSentences("Same one. Same one.").length === 1);
check("空输入返回空数组", T.splitSentences("").length === 0 && T.splitSentences(null).length === 0);
check("纯符号片段被剔除", T.splitSentences("Real sentence here. ... --- ...").length === 1);
check("中文整段不产生句子", T.splitSentences("这是中文，不是英文。").length === 0);

/* ---------------- ③ 实词提取（含停用词过滤与词库回填） ---------------- */
global.window.TutorEnv = {
  lookupWord: function (w) { return w === "courier" ? { ipa: "/ˈkʊriər/", cn: "快递", ex: "x", exCn: "y" } : null; }
};
const cards = T.extractWords(["We will courier the samples to you tomorrow."]);
const words = cards.map(function (c) { return c.w; });
check("停用词被过滤", words.indexOf("the") === -1 && words.indexOf("you") === -1 && words.indexOf("will") === -1, JSON.stringify(words));
check("实词被保留", words.indexOf("courier") !== -1 && words.indexOf("samples") !== -1 && words.indexOf("tomorrow") !== -1, JSON.stringify(words));
const dup = T.extractWords(["We courier now.", "Please courier again."]);
check("同一实词跨句只出现一次", dup.filter(function (c) { return c.w === "courier"; }).length === 1,
  JSON.stringify(dup.map(function (c) { return c.w; })));
check("例句取的是首次出现的那句",
  dup.filter(function (c) { return c.w === "courier"; })[0].ex === "We courier now.");
const courier = cards.filter(function (c) { return c.w === "courier"; })[0];
check("词库命中时回填音标/释义", courier && courier.ipa === "/ˈkʊriər/" && courier.cn === "快递");
check("单词卡 id 带 ms- 前缀，避免与站内词条冲突", cards.every(function (c) { return c.id.indexOf("ms-") === 0; }));
check("例句=该词首次出现的原句", courier && courier.ex === "We will courier the samples to you tomorrow.");

/* ---------------- ④ 语气提示词 ---------------- */
const pe = T.tonePrompt("email"), pt = T.tonePrompt("talk"), pm = T.tonePrompt("meeting");
check("三种语气提示词互不相同", pe !== pt && pt !== pm && pe !== pm);
check("未知语气回退到邮件语气", T.tonePrompt("nope") === pe && T.tonePrompt(undefined) === pe);
check("口语语气包含缩写提示", /缩写/.test(pt));

/* ---------------- ⑤ 词数 ---------------- */
check("wordCount 正常计数", T.wordCount("a b c") === 3);
check("wordCount 处理空值", T.wordCount("") === 0 && T.wordCount(null) === 0);

/* ---------------- ⑥ 渲染冒烟（模板字面量 + 状态联动） ---------------- */
S.cn = ""; S.en = ""; S.title = ""; S.tone = "email";
let renderErr = null;
try { M.render(); } catch (e) { renderErr = e; }
const html0 = appEl.innerHTML;
check("render() 不抛错", !renderErr, renderErr && renderErr.message);
check("渲染出中文输入区 #msCn", html0.indexOf('id="msCn"') !== -1);
check("渲染出英文编辑区 #msEn", html0.indexOf('id="msEn"') !== -1);
check("渲染出标题输入 #msTitle", html0.indexOf('id="msTitle"') !== -1);
check("渲染出语料库区块", html0.indexOf("我的自述语料库") !== -1);
check("无英文时四个引擎按钮置灰", html0.indexOf('data-action="ms-stage" disabled') !== -1 && html0.indexOf('data-action="ms-flash" disabled') !== -1);
check("无英文时保存按钮置灰", html0.indexOf('data-action="ms-save" disabled') !== -1);

S.cn = "这批货的复合膜脱层了，我想说我们会免费补货。";
S.en = "We found the delamination was caused by low surface tension. We will send a free replacement. We have already adjusted the coating weight.";
try { M.render(); } catch (e) { renderErr = e; }
const html1 = appEl.innerHTML;
check("有英文时按钮解禁", html1.indexOf('data-action="ms-stage" disabled') === -1 && html1.indexOf('data-action="ms-save" disabled') === -1);
check("逐句预览渲染 3 句", (html1.match(/class="sub-row"/g) || []).length === 3);
check("中文内容被转义后回填", html1.indexOf("复合膜脱层") !== -1);

S.tone = "talk";
M.render();
check("当前语气 chip 带 on 高亮", appEl.innerHTML.indexOf('class="scen-chip on" data-action="ms-tone" data-id="talk"') !== -1);
check("同一时刻只有一个语气被选中", (appEl.innerHTML.match(/class="scen-chip on"/g) || []).length === 1);

/* ---------------- ⑦ 接线门禁（改代码没接上 = 页面白干） ---------------- */
const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const appjs = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
const style = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");

check("index.html 已引入 js/mysay.js", /<script\s+src="js\/mysay\.js"[^>]*><\/script>/.test(html));
check("mysay.js 在 app.js 之前加载", html.indexOf("js/mysay.js") < html.indexOf("js/app.js"));
check("index.html 导航含 #/mysay 入口", /href="#\/mysay"/.test(html));
check("app.js 路由表含 mysay", /"material",\s*"mysay"/.test(appjs));
check("app.js renderRoute 分派 MySay.render", /route\.view === "mysay"\)\s*window\.MySay\.render\(\)/.test(appjs));
check("app.js 启动校验注册了 MySay", /_need\("说我想说 mysay\.js", !!window\.MySay\)/.test(appjs));
check("sw.js 预缓存含 ./js/mysay.js", /"\.\/js\/mysay\.js"/.test(sw));
check("已选中语气 chip 有高亮样式", /\.scen-chip\.on\{/.test(style));

console.log("\n-- 拆句样例 --");
s1.forEach(function (s, i) { console.log("  " + (i + 1) + ". " + s); });
console.log("\n-- 实词样例 --");
console.log("  " + words.join(", "));

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
