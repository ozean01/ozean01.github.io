#!/usr/bin/env node
/* AI 双语字幕（播客第 2 批）门禁：
   A. 纯函数（vm 加载 js/subtranslate.js，无 DOM / 无网络 / 无 Key）
      · cue 文本 hash（稳定、空白归一、不同句不同键）
      · 待翻译集合（跳过已有中文/空句）
      · 成本估算（句数 / 千字符）
      · 分批：每批 15–20（BATCH 断言），不整集一次发
      · 回复解析：纯数组 / ```json 围栏 / 数量不符 / 非数组 / 无数组
      · 消息组装：system 在前且带 FACT_GUARD；user 只含本批句子
   B. 源码 / 接线纪律
      · 无 Key 时置灰 + 「去设置」入口
      · 披露：渲染点接 window.AIDisclosure，文案含「AI 生成 / 仅供理解」
      · 缓存键 fte-sub-zh-v1 已在 storage-keys.js 登记且 backup:false（派生数据）
      · 命中缓存不重复请求（runBatch 里先查 cache，全命中直接返回）
      · 长集二次确认含成本数字
      · 无内联事件；index.html defer 外链；PRECACHE 含 subtranslate.js、无音频
      · app.js _need 点名 */
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

const src = fs.readFileSync(path.join(ROOT, "js", "subtranslate.js"), "utf8");
const ctx = { window: {}, console, JSON, Math, String, Object, Array };
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: "js/subtranslate.js" });
const S = ctx.window.SubTranslate;
const T = (S && S._t) || {};
check("subtranslate.js 导出 window.SubTranslate.mount 与纯函数 _t", !!(S && typeof S.mount === "function" && S._t));

/* ---------- A1. hash ---------- */
const h1 = T.hashText("Retort pouches need BOPA.");
const h2 = T.hashText("  Retort   pouches need BOPA. ");
const h3 = T.hashText("Thermal lamination runs hotter.");
check("hashText：空白归一后同一句同键", h1 === h2, h1 + " / " + h2);
check("hashText：不同句不同键", h1 !== h3);
check("hashText：8 位十六进制", /^[0-9a-f]{8}$/.test(h1), h1);
check("hashText：空串也有稳定键", T.hashText("") === T.hashText("   "));

/* ---------- A2. 待翻译集合 ---------- */
const cues = [
  { text: "Line one.", zh: "" },
  { text: "Line two.", zh: "第二句" },
  { text: "", zh: "" },
  { text: "Line three." }
];
const pend = T.pendingOf(cues);
check("pendingOf：只取缺中文且有文本的句", pend.length === 2 && pend[0].i === 0 && pend[1].i === 3,
  JSON.stringify(pend.map(function (x) { return x.i; })));

/* ---------- A3. 成本估算 ---------- */
const est = T.estimate(pend);
check("estimate：句数与字符数", est.count === 2 && est.chars === "Line one.Line three.".length, JSON.stringify(est));
check("estimate：千字符保留 1 位", /^\d+(\.\d)?$/.test(String(est.kilo)), String(est.kilo));

/* ---------- A4. 分批 ---------- */
check("BATCH 在 15–20 之间（规格）", T.BATCH >= 15 && T.BATCH <= 20, String(T.BATCH));
const many = [];
for (let i = 0; i < 40; i++) many.push({ i: i, text: "sentence " + i });
const batches = T.chunk(many, T.BATCH);
check("chunk：40 句 → 3 批（18/18/4）", batches.length === 3 && batches[0].length === T.BATCH && batches[2].length === 4,
  batches.map(function (b) { return b.length; }).join("/"));
check("chunk：不产生空批", batches.every(function (b) { return b.length > 0; }));
check("chunk：每批不超过 20 句（不整集一次发）", batches.every(function (b) { return b.length <= 20; }));

/* ---------- A5. 回复解析 ---------- */
check("parseReply：纯 JSON 数组", JSON.stringify(T.parseReply('["一","二"]', 2)) === '["一","二"]');
check("parseReply：```json 围栏", JSON.stringify(T.parseReply('```json\n["一","二"]\n```', 2)) === '["一","二"]');
let threw = "";
try { T.parseReply('["一"]', 2); } catch (e) { threw = e.message; }
check("parseReply：数量不符 → 抛错（整批可重试）", /数量不符/.test(threw), threw);
threw = "";
try { T.parseReply('{"a":1}', 1); } catch (e) { threw = e.message; }
check("parseReply：非数组 → 抛错", /JSON 数组|不是数组/.test(threw), threw);
threw = "";
try { T.parseReply("抱歉，我无法完成", 1); } catch (e) { threw = e.message; }
check("parseReply：没有数组 → 抛错", /JSON 数组/.test(threw), threw);

/* ---------- A6. 消息组装 ---------- */
const msgs = T.buildMessages(many.slice(0, T.BATCH));
check("buildMessages：system 在前", msgs[0].role === "system" && msgs[1].role === "user");
check("buildMessages：system 末尾带 FACT_GUARD", /FACT BOUNDARY/.test(msgs[0].content) && /FACT_GUARD|FACT BOUNDARY/.test(src));
const payload = JSON.parse(msgs[1].content);
check("buildMessages：user 只含本批句子（不整集）", payload.length === T.BATCH && payload[0].hasOwnProperty("i") && payload[0].hasOwnProperty("en"),
  "payload=" + payload.length);
check("提示词要求保留行业术语原样", /术语保留英文原样/.test(T.SYS) || /保留英文原样/.test(T.SYS));
check("提示词要求逐句对应/数量一致", /长度与输入完全一致/.test(T.SYS));
check("提示词禁止解释/加戏", /不要解释/.test(T.SYS));

/* ---------- B. 源码纪律 ---------- */
check("no-key：按钮置灰并给「去设置」入口", /disabled/.test(src) && /去设置里配置 AI/.test(src) && /LLM\.ready|L\.ready/.test(src));
check("未载入字幕时不谎称「已有中文轨」", /先载入字幕或音频/.test(src) && /还没有载入字幕/.test(src));
check("披露：渲染点接 AIDisclosure", /AIDisclosure/.test(src) && /function aiNoticeHtml\(/.test(src));
check("披露文案：AI 生成 / 仅供理解", /AI 生成/.test(src) && /仅供理解/.test(src));
check("命中缓存不发请求（runBatch 先查缓存，全命中直接返回）",
  /var hit = cache\[hashText\(it\.text\)\]/.test(src) && /if \(!need\.length\) \{[^}]*return Promise\.resolve\(\);/.test(src));
check("长集二次确认带成本数字（句数 / 千字符）", T.LONG_CONFIRM > 0 && /约 " \+ est\.count \+ " 句 \/ 约 " \+ est\.kilo \+ " 千字符/.test(src));
check("不自己 fetch（走 Tutor.callChat）", src.indexOf("fetch(") === -1 && /T\.callChat\(messages/.test(src));
check("无内联事件处理器", !/\son(click|change|input|submit|keydown|load|error)\s*=\s*["']/i.test(src));
check("无内联 <script>", !/<script\b/i.test(src));

const reg = fs.readFileSync(path.join(ROOT, "js", "storage-keys.js"), "utf8");
const keyLine = (reg.split("\n").filter(function (l) { return l.indexOf('"fte-sub-zh-v1"') !== -1; })[0] || "");
check("storage-keys 登记了 fte-sub-zh-v1", !!keyLine);
check("缓存键 backup:false（派生数据不进备份）", /backup:\s*false/.test(keyLine));
check("缓存键注明可重新生成 / 派生", /派生/.test(keyLine) && /重新生成/.test(keyLine));

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
check("index.html 以 defer 外链加载 js/subtranslate.js", /<script src="js\/subtranslate\.js" defer><\/script>/.test(html));
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const pre = (sw.match(/const PRECACHE = \[([\s\S]*?)\];/) || [])[1] || "";
check("PRECACHE 含 ./js/subtranslate.js", /"\.\/js\/subtranslate\.js"/.test(pre));
check("PRECACHE 不含音频", !/\.(mp3|m4a|aac|ogg|wav|opus|flac)["']/i.test(pre));
check("app.js _need 声明了 subtranslate.js", /_need\("AI 中文轨 subtranslate\.js"/.test(fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8")));
const sub = fs.readFileSync(path.join(ROOT, "js", "subtitle.js"), "utf8");
check("subtitle.js 挂载 AI 中文轨卡并暴露 getCues/applyZh",
  /window\.SubTranslate\.mount\(document\.getElementById\("subTranslate"\)/.test(sub) && /getCues: function/.test(sub) && /applyZh: applyZh/.test(sub));

console.log("\n" + (fail ? "=== 有断言失败 ===" : "=== 全部通过 ===") + "  pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
