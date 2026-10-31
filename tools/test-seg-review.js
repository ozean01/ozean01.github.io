#!/usr/bin/env node
/* 验收：P11 段级间隔复听 + 阶段内断点续学（js/seg-review.js）
   守的是三件容易在后续改动里被悄悄改坏的事：
     ① **阶梯与推进口径**：6h/18h/24h/48h/72h/168h/336h（累计 = 6h→1d→2d→4d→7d→14d→28d）；
        只有「到点后真正走完」才推进；提前练不推进、也不推迟到期日（否则可以永久逃掉复习）。
     ② **段级复习不进打卡账**：打卡只记今日五步；段级轮次只由闯关完成推进（README「完成≠证据」）。
     ③ **接线唯一**：阶梯与判定只许存在于 seg-review.js；app.js 只在「完成本关」时打点；
        今日第 3 步只在**有到期段**时才改指向，且仍是那 5 步（不新增第 6 步）。
   另测：存储键已登记（否则备份静默丢失）、脚本已进 index.html 与 sw.js 预缓存、
        脏数据/越界不抛错、断点 >3 天不恢复。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info !== undefined ? "  " + info : ""));
  if (!cond) pass = false;
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/* ---------------- 沙箱：只装 seg-review.js ---------------- */
function makeSandbox() {
  const store = {};
  const sandbox = {
    console: console,
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    FTE_DATA: {
      units: [
        { id: 1, title: "外贸基础", dialogues: [{ title: "首次询盘" }, { title: "报价还盘" }] },
        { id: 9, title: "客诉处理", dialogues: [{ title: "质量投诉电话" }] }
      ]
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read("js/seg-review.js"), sandbox, { filename: "js/seg-review.js" });
  sandbox._store = store;
  return sandbox;
}

const S = makeSandbox();
const SR = S.window.SegReview;
check("暴露 window.SegReview", !!SR && typeof SR.markDone === "function");

const H = 3600000;
const DAY = 86400000;
const T0 = 1761400000000; /* 固定时钟，避免真实时间导致偶发 */

/* ---------------- ① 阶梯 ---------------- */
check("阶梯是 7 轮：6/18/24/48/72/168/336 小时（累计 = 6h→28d）",
  SR.DELTAS_H.join(",") === "6,18,24,48,72,168,336" && SR.TOTAL === 7,
  SR.DELTAS_H.join(",") + " / TOTAL=" + SR.TOTAL);

/* ---------------- ② 首学完成 → 建排期 ---------------- */
const KEY = SR.keyOf(1, 1);
check("keyOf 产出与 progress.stage 同构的键", KEY === "1-1", KEY);
check("parseKey 容错", JSON.stringify(SR.parseKey("12-0")) === '{"uid":12,"di":0}' && SR.parseKey("x") === null);

let r = SR.markDone(KEY, T0);
check("首学完成：建排期，首轮 6 小时后", r.ok && r.action === "created" && r.round === 0 && r.due === T0 + 6 * H,
  r.action + " due+=" + (r.due - T0) / H + "h");
check("首轮给出一句人话（含日期与「今日」入口）", /段级复习/.test(SR.verdictText(r)) && /今日/.test(SR.verdictText(r)));

/* ---------------- ③ 提前练：不推进、不推迟 ---------------- */
r = SR.markDone(KEY, T0 + 1 * H);
check("提前练（距到期还有 5h）：不推进轮次", r.action === "early" && r.round === 0, r.action);
const dueAfterEarly = S.window.SegReview.statusOf(KEY, T0 + 1 * H).due;
check("提前练不推迟到期日（仍是首轮 +6h）", dueAfterEarly === T0 + 6 * H, (dueAfterEarly - T0) / H + "h");
check("提前练的文案明说「只算练、不记轮次」", /不记轮次/.test(SR.verdictText(r)));

/* ---------------- ④ 到点后推进：1d → 2d → 4d → 7d → 14d → 28d ---------------- */
const steps = [
  { at: T0 + 6 * H, round: 1, nextH: 18 },
  { at: T0 + 24 * H, round: 2, nextH: 24 },
  { at: T0 + 48 * H, round: 3, nextH: 48 },
  { at: T0 + 96 * H, round: 4, nextH: 72 },
  { at: T0 + 168 * H, round: 5, nextH: 168 },
  { at: T0 + 336 * H, round: 6, nextH: 336 }
];
steps.forEach(function (x) {
  const rr = SR.markDone(KEY, x.at);
  check("第 " + x.round + " 轮：到点后推进，下一次 +" + x.nextH + "h",
    rr.action === "advanced" && rr.round === x.round && rr.due === x.at + x.nextH * H,
    rr.action + " round=" + rr.round);
});
const grad = SR.markDone(KEY, T0 + 672 * H);
check("第 7 轮完成后毕业（due 清空，不再排期）", grad.action === "advanced" && grad.round === 7 && grad.due === null,
  grad.action + " round=" + grad.round);
const again = SR.markDone(KEY, T0 + 700 * H);
check("毕业后重练：只记录，不重开复习", again.action === "graduated" && again.round === 7, again.action);

/* ---------------- ⑤ 到期清单（今日第 3 步的输入） ---------------- */
S.window.SegReview._reset();
SR.markDone("1-0", T0);                  /* 首轮到期 = T0+6h → 在 T0+7h 刚到期、未逾期 */
SR.markDone("1-1", T0 - 30 * H);         /* 首轮到期 = T0-24h → 在 T0+7h 已逾期 31h */
SR.markDone("9-0", T0 + 100 * H);        /* 首轮到期 = T0+106h → 还没到 */
let list = SR.dueList(T0 + 7 * H);
check("dueList 只返回已到期的段（3 段里 2 段到期）", list.length === 2, "n=" + list.length);
check("dueList 按到期时间升序（逾期最久的排前面）", list[0].key === "1-1" && list[1].key === "1-0", list.map(function (x) { return x.key; }).join(","));
check("dueList 带标签（单元/对话标题）", list[0].uid === 1 && list[0].title === "报价还盘", JSON.stringify(list[0]).slice(0, 90));
/* 回归守卫：真实 js/data.js 用 `const FTE_DATA = …`（全局词法绑定，不挂 window）。
   只读 window.FTE_DATA 会让 labelOf 返回空标题 → 到期卡整块不渲染（浏览器冒烟里实测踩过）。 */
(function () {
  const s2 = {
    console: console,
    localStorage: { getItem: function () { return null; }, setItem: function () { }, removeItem: function () { } }
  };
  s2.window = s2;
  vm.createContext(s2);
  vm.runInContext(read("js/data.js"), s2, { filename: "js/data.js" });
  vm.runInContext(read("js/seg-review.js"), s2, { filename: "js/seg-review.js" });
  const lab = s2.window.SegReview.labelOf("1-0");
  check("真实 data.js 下 labelOf 能取到单元/对话标题（const 全局绑定回归）",
    !!lab.unitTitle && !!lab.title, JSON.stringify(lab).slice(0, 80));
})();
check("dueList 逾期标记：超过 24h 才算 overdue", list[0].overdue === true && list[1].overdue === false,
  list[0].overdue + "/" + list[1].overdue);
check("dueList 不包含已毕业的段", (function () {
  S.window.SegReview._reset();
  var k = "9-0";
  SR.markDone(k, T0);                       /* 首轮到期 = T0+6h */
  var t = T0 + 6 * H;
  for (var i = 0; i < 7; i++) { SR.markDone(k, t); t += 1000 * H; }   /* 每次都远过到期日 → 连续推进 */
  return SR.statusOf(k, T0 + 500 * DAY).state === "graduated" && SR.dueList(T0 + 500 * DAY).length === 0;
})());
check("dueList 容忍空存储", (function () {
  S.window.SegReview._reset();
  try { return SR.dueList(T0).length === 0 && SR.dueCount(T0) === 0; } catch (e) { return false; }
})());
check("dueList 容忍空存储", (function () {
  S.window.SegReview._reset();
  try { return SR.dueList(T0).length === 0 && SR.dueCount(T0) === 0; } catch (e) { return false; }
})());

/* ---------------- ⑥ 时间文案（唯一实现） ---------------- */
check("whenText：现在到期", SR.whenText(T0, T0) === "现在到期");
check("whenText：逾期天数", SR.whenText(T0 - 3 * DAY, T0) === "已逾期 3 天", SR.whenText(T0 - 3 * DAY, T0));
check("whenText：几小时后", SR.whenText(T0 + 2 * H, T0) === "2 小时后", SR.whenText(T0 + 2 * H, T0));
check("whenText：几天后", SR.whenText(T0 + 3 * DAY, T0) === "3 天后", SR.whenText(T0 + 3 * DAY, T0));
check("dateText 形如 M-D", /^\d{1,2}-\d{2}$/.test(SR.dateText(T0)), SR.dateText(T0));

/* ---------------- ⑦ 阶段内断点 ---------------- */
S.window.SegReview._reset();
check("断点：没存过返回 null", SR.posOf("1-1", T0) === null);
SR.savePos("1-1", 2, 7, T0);
let p = SR.posOf("1-1", T0 + 1 * DAY);
check("断点：3 天内可恢复（阶段 + 句 index）", !!p && p.s === 2 && p.i === 7, JSON.stringify(p));
check("断点：>3 天不恢复（避免接在半年前那句）", SR.posOf("1-1", T0 + 4 * DAY) === null);
check("断点：非法阶段/非法键不写", SR.savePos("1-1", 9, 0, T0) === false && SR.savePos("bad", 2, 0, T0) === false);
SR.savePos("1-1", 3, 2, T0);
SR.clearPos("1-1");
check("断点：clearPos 后为空", SR.posOf("1-1", T0) === null);

/* ---------------- ⑧ 脏数据：不抛错、不污染 ---------------- */
S._store["fte-seg-review-v1"] = "{not json";
check("脏 JSON：load 回落到空且不抛", (function () {
  try { return SR.load().v === 1 && SR.dueList(T0).length === 0; } catch (e) { return false; }
})());
S._store["fte-seg-review-v1"] = JSON.stringify({ v: 1, segs: { "1-1": { r: 99, due: "x" }, bad: 1 }, pos: { "1-1": { s: 0, i: -3, t: 1 } } });
check("越界轮次被夹到 7（不产生负间隔）", (function () {
  const st = SR.load();
  return st.segs["1-1"] && st.segs["1-1"].r === 7 && !st.segs.bad;
})());
check("非法断点被丢弃", SR.posOf("1-1", 2) === null);

/* ---------------- ⑨ 接线唯一性 + 不新增第 6 步 ---------------- */
const appSrc = read("js/app.js");
const todaySrc = read("js/today.js");
const segSrc = read("js/seg-review.js");
check("阶梯只在 seg-review.js 定义（app/today 不得再写 6/18/24/48 那串）",
  /6,\s*18,\s*24,\s*48,\s*72,\s*168,\s*336/.test(segSrc) &&
  !/6,\s*18,\s*24,\s*48,\s*72,\s*168,\s*336/.test(appSrc) && !/6,\s*18,\s*24,\s*48,\s*72,\s*168,\s*336/.test(todaySrc));
check("app.js 只在「完成本关（phase=done）」时调用 markDone，且只有一处",
  (appSrc.match(/\.markDone\(/g) || []).length === 1 && /phase === "done"[\s\S]{0,200}markDone/.test(appSrc));
check("app.js 离开阶段/逐句步进/返回设置时保存断点",
  /function saveSpeakPos/.test(appSrc) && /saveSpeakPos\(s\);/.test(appSrc) &&
  (appSrc.match(/saveSpeakPos\(/g) || []).length >= 4);
check("app.js 完成页展示段级状态（不自己算轮次）", /segmentReviewHtml\(s, s\.reviewMsg\)/.test(appSrc));
check("完成页写明「勾完成不推进轮次」（两本账）", /勾完成不推进轮次|勾「完成」不算|只记打卡/.test(appSrc));
check("今日第 3 步：无到期段时仍指向 #/speak（原行为不变）", /firstDue \? \("#\/speak\/" \+ firstDue\.key\) : "#\/speak"/.test(todaySrc));
check("今日页读取到期段但**不新增第 6 步**（仍是 5 步、不新增导航）",
  /SegReview/.test(todaySrc) && !/nav/i.test(todaySrc.slice(todaySrc.indexOf("SegReview"), todaySrc.indexOf("SegReview") + 200)));

/* ---------------- ⑩ 存储键 + 资产接线 + 版本纪律 ---------------- */
const SK = vm.createContext({ window: {} });
vm.runInContext(read("js/storage-keys.js"), SK, { filename: "js/storage-keys.js" });
const reg = SK.window.FTE_STORAGE;
const row = (reg.keys || []).filter(function (k) { return k.key === "fte-seg-review-v1"; })[0];
check("存储键已在 js/storage-keys.js 登记（否则备份会静默丢）", !!row);
check("该键可备份（换设备复习排期不丢）", !!row && row.backup === true);
check("owner 指向 seg-review.js（权限/维护口径清晰）", !!row && /seg-review\.js/.test(row.owner || ""));

const html = read("index.html");
const sw = read("sw.js");
check("index.html 已加载 js/seg-review.js（defer，且在 app.js 之前）",
  /<script src="js\/seg-review\.js" defer><\/script>/.test(html) &&
  html.indexOf("js/seg-review.js") < html.indexOf("js/app.js"));
check("sw.js PRECACHE 已含 ./js/seg-review.js", /"\.\/js\/seg-review\.js"/.test(sw));
const preBlock = (sw.match(/const PRECACHE = \[([\s\S]*?)\];/) || [])[1] || "";
check("PRECACHE 条数 = 66（任务3 +lookup.js；任务1 +cheatsheet.js；P11 基线 64）", (preBlock.match(/"[^"]+"/g) || []).length === 66,
  "n=" + (preBlock.match(/"[^"]+"/g) || []).length);
const cache = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
check("CACHE 版本已升到 ≥ fte-v130（清单变了必须换缓存桶）",
  /^fte-v\d+$/.test(cache) && parseInt(cache.replace(/\D/g, ""), 10) >= 130, cache);
const pkg = JSON.parse(read("package.json"));
const pwa = read("js/pwa-init.js");
/* 不写死版本号：每次发版都会变，写死会让「改版本」误伤无关门禁（本批实测踩过）。
   真正要守的是「两处同源」+「版本 ≥ P11 首次发布的 1.15.0」。 */
check("版本同源：package.json 与 pwa-init.js FTE_VERSION 逐字一致",
  pwa.indexOf('window.FTE_VERSION = "' + pkg.version + '"') !== -1, pkg.version);
check("版本不低于 P11 首次发布的 1.15.0（防回退）",
  (function () {
    const p = String(pkg.version).split(".").map(function (n) { return parseInt(n, 10); });
    return p[0] > 1 || (p[0] === 1 && p[1] > 15) || (p[0] === 1 && p[1] === 15 && p[2] >= 0);
  })());

console.log("\n" + (pass ? "=== ALL PASS ===" : "=== SOME FAILED ==="));
process.exit(pass ? 0 : 1);
