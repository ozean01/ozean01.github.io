#!/usr/bin/env node
/* 验收测试：P14 —— 外部材料评估（Hy-SimulMT + 英语学习导航站）的落地批（2026-10-27）。
   由来（docs 评估口径，见 README P14）：Hy-SimulMT 那个 30B 同传模型本站跑不动（无后端 / 离线静态 /
   本机核显），"导航站"那类目录本站也早就做得更深。所以这一批只落两件低风险高收益的事：
     · A 项 —— 把「延迟—质量权衡」从模型变成**训练器**：tutor.js 的「⏱ 首响计时 + 先给半句」，
       量「轮到你说话 → 第一个词」的间隔，并对 >6s 给可执行提示；
     · D 项 —— 给 sources.js 的精选听音源目录**补库存**（商务/外贸/制造业向，全部站外外链）。

   本测试守 5 件事（任何一条不成立都说明这批要么没落地、要么越界）：
     ① A：计时口径存在且**会话内内存态**——新代码段不碰 localStorage（不落盘、不计入打卡）；
     ② A：只在语音链路挂点（🎤 / 🔁 / 回合一结束），打字不计；消息上能挂 ms 并渲染徽章；
     ③ A：诚实边界不丢——明写「偏保守 / 含识别器延迟 / 过程指标≠能力证据 / 不写盘」；
     ④ A：零导航膨胀——没有新增路由 hash、没有新增导航项；
     ⑤ D：听音源目录结构与版权纪律——字段完整、域名合法、水平/领域取值合法、名称唯一、
           既有 11 条不被改名（name 是 localStorage 的稳定键）、全部外链且仍为 https。 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

const tutorSrc = read("js/tutor.js");
const appSrc = read("js/app.js");
const keysSrc = read("js/storage-keys.js");

/* ---------- ① 计时口径 + 内存态（不落盘） ---------- */
const latSection = (function () {
  const a = tutorSrc.indexOf("⏱ 首响计时（P14");
  const b = tutorSrc.indexOf("/* ---------------- 工具 ---------------- */", a);
  return (a !== -1 && b > a) ? tutorSrc.slice(a, b) : "";
})();
check("A1 tutor.js 有 P14 首响计时代码段", latSection.length > 400, "长度 " + latSection.length);
check("A2 判定阈值可核对：≤3s 达标 / 3–6s 偏慢 / >6s 太慢",
  /LAT_OK_MS\s*=\s*3000/.test(tutorSrc) && /LAT_WARN_MS\s*=\s*6000/.test(tutorSrc) &&
  /latTier[\s\S]{0,200}return "slow"/.test(tutorSrc));
check("A3 计时段**不碰 localStorage**（会话内内存态，不新增存储键、不落盘）",
  latSection.length > 0 && latSection.indexOf("localStorage") === -1 && latSection.indexOf("setItem") === -1);
check("A4 storage-keys.js 没有为首响新增任何键（防「顺手持久化」）",
  !/fte-[a-z0-9-]*lat/i.test(keysSrc) && keysSrc.indexOf("首响") === -1);
check("A5 超时作废（LAT_EXPIRE_MS）：测到的值不会张冠李戴挂到下一条消息上",
  /LAT_EXPIRE_MS\s*=\s*60000/.test(tutorSrc) && /latPendingAt/.test(tutorSrc));

/* ---------- ② 挂点：只在语音链路，打字不计 ---------- */
const startHooks = (tutorSrc.match(/latStart\(\)/g) || []).length;
const firstHooks = (tutorSrc.match(/latFirstWord\(\)/g) || []).length;
check("A6 起点挂点 ≥3 处（🎤 开麦 / 🔁 自动开麦 / 回合一结束）", startHooks >= 3, "实得 " + startHooks);
check("A7 终点挂点 ≥2 处（🎤 onResult / 🔁 onResult 第一个词）", firstHooks >= 2, "实得 " + firstHooks);
check("A8 🎤 权限弹窗时间不算（latStart 在 recognize 之前、micRequest 之后）",
  /if \(input\) \{ input\.placeholder = "🎙 正在听[\s\S]{0,200}latStart\(\)[\s\S]{0,120}E\(\)\.Player\.recognize\(/.test(tutorSrc));
check("A9 用户消息能挂 ms 且渲染徽章 + 慢于 6s 给「先给半句」提示",
  /typeof m\.ms === "number"/.test(tutorSrc) && /latBadge\(lat\)/.test(tutorSrc) &&
  /tier === "slow"/.test(tutorSrc) && /先给半句/.test(tutorSrc));
check("A10 首响只在 send() 里挂到 user 消息（assistant 不挂、无第二个写入点）",
  (tutorSrc.match(/\.ms = /g) || []).length === 1);

/* ---------- ③ 诚实边界（这批最容易被写飘的地方） ---------- */
check("A11 明写「含识别器启动延迟 → 偏保守」", tutorSrc.indexOf("偏保守") !== -1 && tutorSrc.indexOf("识别器启动") !== -1);
check("A12 明写「过程指标，不是能力证据」（坚持/能力分栏纪律）",
  tutorSrc.indexOf("过程指标") !== -1 && tutorSrc.indexOf("不是能力证据") !== -1);
check("A13 明写「不写盘 / 不计入打卡」", /不写盘/.test(tutorSrc) && /不计入打卡/.test(tutorSrc));
check("A14 明写「打字不算」（不然数字会被输入法时间污染）", tutorSrc.indexOf("打字不算") !== -1);
check("A15 不承诺替代评测、不声称「接近同传水平」", !/接近同传|同传水平/.test(tutorSrc));

/* ---------- ④ 零导航膨胀 ---------- */
check("A16 没有新增路由（无 #/lat 之类）", !/#\/lat/.test(tutorSrc));
check("A17 面板挂在对话卡内（latPanelHtml 由 chatHtml 调用，不是新页面）",
  /latPanelHtml\(\)/.test(tutorSrc) && /function latPanelHtml\(\)/.test(tutorSrc));
check("A18 没有动 app.js 的路由表（本批零导航改动）",
  !/tutor-lat|首响/.test(appSrc));

/* ---------- ⑤ D：听音源目录 ---------- */
global.window = {};
require(path.join(ROOT, "js", "sources.js"));
const S = global.window.FTE_SOURCES;
check("D1 sources.js 可被 Node 加载并暴露 FTE_SOURCES", !!S && Array.isArray(S.items));

const items = (S && S.items) || [];
const LEVELS = ["a", "b", "c"];
const DOMAINS = ((S && S.domains) || []).map(function (d) { return d.id; });
const EXIST = [
  "BBC Learning English · 6 Minute English",
  "BBC · Business English 系列（商务向）",
  "VOA Learning English（新闻速听 + 经济）",
  "VOA · Words and Their Stories",
  "ELLLO · One Minute English / Mixer",
  "Randall's ESL Cyber Listening Lab",
  "News in Levels（分级新闻·读听结合）",
  "NPR Marketplace（美式财经广播）",
  "HBR IdeaCast / TED Talks（商业演讲）",
  "The Economist / Financial Times 音频（日报刊）",
  "新概念英语点读（iChochy/NCE · 外链）"
];
check("D2 目录扩到 ≥ 22 条（原 11 条 + 本批新增）", items.length >= 22, "实得 " + items.length);
check("D3 既有 11 条 name 一字不改（它们是 localStorage 的稳定键）",
  EXIST.every(function (n) { return items.some(function (it) { return it.name === n; }); }),
  EXIST.filter(function (n) { return !items.some(function (it) { return it.name === n; }); }).join(" / ") || "");

const bad = [];
items.forEach(function (it) {
  if (!it.name || typeof it.name !== "string") bad.push("name 缺失");
  if (!/^https:\/\/[^\s]+$/.test(String(it.url || ""))) bad.push((it.name || "?") + " url 非 https");
  if (LEVELS.indexOf(it.level) === -1) bad.push((it.name || "?") + " level 非法");
  if (!Array.isArray(it.domain) || !it.domain.length ||
      it.domain.some(function (d) { return DOMAINS.indexOf(d) === -1; })) bad.push((it.name || "?") + " domain 非法");
  if (String(it.region || "").trim().length < 2) bad.push((it.name || "?") + " region 缺失");
  if (String(it.desc || "").trim().length < 20) bad.push((it.name || "?") + " desc 过短");
  if (String(it.why || "").trim().length < 15) bad.push((it.name || "?") + " why 过短（要说清对外贸人有什么用）");
  if (typeof it.free !== "boolean") bad.push((it.name || "?") + " free 非布尔");
});
check("D4 每条字段完整且取值合法（url/level/domain/region/desc/why/free）", bad.length === 0, bad.slice(0, 6).join("；"));
check("D5 name 唯一（重复会让精听闭环账记错）",
  new Set(items.map(function (it) { return it.name; })).size === items.length);

const biz = items.filter(function (it) {
  return (it.domain || []).some(function (d) { return d === "business" || d === "industry" || d === "news"; });
});
check("D6 商务/行业/经贸向音源 ≥ 14 条（本批补的方向不是泛泛学英语）", biz.length >= 14, "实得 " + biz.length);
check("D7 版权纪律：目录仍写明「只作外链引用、不搬运内容」",
  /仅作目录引用|不搬运|授权与可访问性以官网为准/.test(String((S && S.note) || "") + read("js/sources.js")));
check("D8 付费音源明确标 false 而不是假装免费",
  items.filter(function (it) { return it.free === false; }).length >= 1);

/* ---------- 接线：新测试必须进统一 runner，否则等于没跑 ---------- */
const runner = read("tools/test-all.js");
check("D9 tools/test-p14.js 已注册进 test-all.js（门禁）",
  /test-p14\.js[\s\S]{0,120}gate:\s*true/.test(runner));

console.log(pass ? "\n=== P14 门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);
