#!/usr/bin/env node
/* 验收测试：产出性调度（js/flashcards.js 的 storeKey 参数化）。
   由来（SLA 专家评审）：「FSRS 只调度**接受性**词汇，无**产出性**调度」——
   于是出现「认得 film 但说不出 film」的典型状态。两层知识必须分开排期。

   核心断言：**两条线互不影响**——同一张卡可以在接受线上已牢固、在产出线上仍是新词，
   分别评分、分别到期。以及默认行为（不传 storeKey）必须与改动前完全一致。
 */
"use strict";
const path = require("path");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }

/* 可控时钟：FSRS 的间隔只有在「时间真的流逝」时才会拉长，
   固定 Date.now 才能断言出稳定的天数。 */
let NOW = 1700000000000;
const REAL_NOW = Date.now;
Date.now = function () { return NOW; };

global.window = {};
require(path.join(__dirname, "..", "js", "flashcards.js"));
const FC = global.window.Flashcards;

const DAY = 86400000;
const cards = [{ id: "1-0", w: "film" }, { id: "1-1", w: "resin" }, { id: "1-2", w: "micron" }];
function freshProg() { return { flash: {}, flashProd: {}, wrong: {} }; }
function st(reps, ef, interval, dueOffsetDays) {
  return { stability: interval, difficulty: 5, reps: reps, ef: ef, interval: interval,
           due: NOW + dueOffsetDays * DAY, last: NOW - DAY, rating: 3, retv: 0.9 };
}

/* ---------------- ① 默认行为不变（向后兼容） ---------------- */
NOW = 1700000000000;
let p = freshProg();
FC.grade(p, "1-0", 3);                       /* 不传 storeKey */
check("不传 storeKey 时写入 flash（向后兼容）", !!p.flash["1-0"] && !p.flashProd["1-0"]);
check("grade 返回状态对象", !!p.flash["1-0"] && p.flash["1-0"].stability > 0);
check("stateOf 默认读 flash", FC.stateOf(p, "1-0").cls !== "new");
check("未评过的词仍是新词", FC.stateOf(p, "1-1").label === "新词");
check("布尔评分仍兼容（true→Good）", FC.grade(freshProg(), "1-0", true).rating === 3);

/* ---------------- ② storeOf 自动建字段 ---------------- */
const empty = {};
const store = FC.storeOf(empty, "flashProd");
check("storeOf 会自动创建字段", !!empty.flashProd && store === empty.flashProd);
check("storeOf 默认返回 flash", (function () { const e2 = {}; return FC.storeOf(e2) === e2.flash; })());

/* ---------------- ③ 两条线互不影响（核心） ---------------- */
NOW = 1700000000000;
p = freshProg();
FC.grade(p, "1-0", 3);                       /* 接受档：认识 */
FC.grade(p, "1-0", 1, "flashProd");          /* 产出档：忘了 */
check("同一张卡在两条线上各有状态", !!p.flash["1-0"] && !!p.flashProd["1-0"]);
check("两条线的评分各自记录",
  p.flash["1-0"].rating === 3 && p.flashProd["1-0"].rating === 1,
  "接受 " + p.flash["1-0"].rating + " / 产出 " + p.flashProd["1-0"].rating);
check("两条线的下次到期不同（忘了的间隔短得多）",
  p.flash["1-0"].due > p.flashProd["1-0"].due,
  Math.round((p.flash["1-0"].due - p.flashProd["1-0"].due) / DAY) + " 天差");
check("两条线的稳定度不同", p.flash["1-0"].stability > p.flashProd["1-0"].stability,
  p.flash["1-0"].stability + " vs " + p.flashProd["1-0"].stability);

/* 把接受线推到很牢（时间必须真的流逝），产出线应毫无变化——最典型的状态 */
NOW = 1700000000000;
p = freshProg();
FC.grade(p, "1-0", 4);                       /* 秒答 → 间隔 8 天 */
NOW += p.flash["1-0"].interval * DAY;        /* 到期那天再秒答 */
FC.grade(p, "1-0", 4);
check("接受线间隔随复习显著拉长", p.flash["1-0"].interval >= 30, p.flash["1-0"].interval + " 天");
check("接受线累计复习次数正确", p.flash["1-0"].reps === 2);
check("产出线完全没被影响（仍是新词）",
  !p.flashProd["1-0"] && FC.stateOf(p, "1-0", "flashProd").label === "新词");
check("同一个词两条线状态不同（认得 ≠ 说得出）",
  FC.stateOf(p, "1-0").cls !== "new" && FC.stateOf(p, "1-0", "flashProd").cls === "new",
  FC.stateOf(p, "1-0").label + " / " + FC.stateOf(p, "1-0", "flashProd").label);

/* 反向：只评产出档，接受档不受影响 */
p = freshProg();
FC.grade(p, "1-1", 4, "flashProd");
check("只评产出档时接受档不受影响",
  !!p.flashProd["1-1"] && !p.flash["1-1"] && FC.stateOf(p, "1-1").label === "新词");

/* ---------------- ④ buildQueue 按 storeKey 取队列 ---------------- */
NOW = 1700000000000;
p = freshProg();
p.flash["1-0"] = st(5, 2.6, 40, +40);        /* 接受线：牢固，远期到期 */
p.flash["1-1"] = st(3, 2.6, 30, +30);        /* 接受线：牢固，远期到期 */
p.flashProd["1-1"] = st(1, 1.5, 1, -1);      /* 产出线：忘了，已经到期 */
const qAcc = FC.buildQueue(cards, p, 30, 15);            /* 默认接受线 */
const qProd = FC.buildQueue(cards, p, 30, 15, "flashProd");
const ids = function (q) { return q.queue.map(function (c) { return c.id; }).join(","); };
check("接受线队列只有新词（已熟的都在远期）", ids(qAcc) === "1-2", "[" + ids(qAcc) + "]");
check("产出线队列含已到期的 1-1", ids(qProd).indexOf("1-1") !== -1, "[" + ids(qProd) + "]");
check("接受线队列不含已到期的 1-1（证明确实各排各的）", ids(qAcc).indexOf("1-1") === -1);
check("两条线给出不同的队列", ids(qAcc) !== ids(qProd));
check("新词计数各自独立",
  qAcc.freshLeft === 0 && qProd.freshLeft === 0 && qAcc.dueLeft === 0 && qProd.dueLeft === 0,
  "接受 fresh " + qAcc.freshLeft + " / 产出 fresh " + qProd.freshLeft);

/* ---------------- ⑤ isLearned 同样分线 ---------------- */
NOW = 1700000000000;
p = freshProg();
FC.grade(p, "1-2", 3);
check("isLearned 默认看接受线",
  FC.isLearned(p, "1-2") === true && FC.isLearned(p, "1-2", "flashProd") === false);
check("isLearned 可指定产出线", (function () {
  const q = freshProg(); FC.grade(q, "1-2", 3, "flashProd");
  return FC.isLearned(q, "1-2", "flashProd") === true && FC.isLearned(q, "1-2") === false;
})());

/* ---------------- ⑥ 接线门禁：app.js 侧 ---------------- */
const fs = require("fs");
const ROOT = path.join(__dirname, "..");
const appjs = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
check("默认进度含 flashProd 字段", /flash: \{\}, flashProd: \{\}/.test(appjs));
check("有产出档开关（flashProdMode）", /let flashProdMode = false;/.test(appjs));
check("有档位→存储线的映射",
  /function flashStoreKey\(s\) \{ return \(s && s\.prod\) \? "flashProd" : "flash"; \}/.test(appjs));
check("建队时按档位取存储线", /buildQueue\(cards, progress, 30,[^)]*flashStoreKey\(/.test(appjs));
check("评分时按档位写入", /Flashcards\.grade\(progress, card\.id, rating, flashStoreKey\(s\)\)/.test(appjs));
check("卡片状态按档位读取", /stateOf\(progress, card\.id, flashStoreKey\(s\)\)/.test(appjs));
check("产出档正面显示中文",
  /prod && card\.kind !== "mistake" \? \(card\.cn \|\| card\.w\) : card\.w/.test(appjs));
check("产出档背面显示英文与音标",
  /font-size:30px">' \+ esc\(card\.w\)/.test(appjs));
check("有切换按钮与事件分支",
  /data-action="flash-prod"/.test(appjs) && /case "flash-prod":/.test(appjs));
/* 重置时必须两条线一起清——只清一条会留下孤儿状态（用户重置后仍显示「已牢固」） */
check("重置单元进度时同时清空两条线",
  /delete progress\.flash\[w\.id\];[\s\S]{0,200}?delete progress\.flashProd\[w\.id\];/.test(appjs));

console.log("\n-- 两条调度线的差异（同一个词） --");
NOW = 1700000000000;
const demo = freshProg();
demo.flash["1-0"] = st(5, 2.6, 40, +40);
demo.flashProd["1-0"] = st(1, 1.5, 1, -1);
console.log("  film   接受档: " + FC.stateOf(demo, "1-0").label + " / 到期 " +
  new Date(demo.flash["1-0"].due).toISOString().slice(0, 10) + "  ← 认得");
console.log("  film   产出档: " + FC.stateOf(demo, "1-0", "flashProd").label + " / 到期 " +
  new Date(demo.flashProd["1-0"].due).toISOString().slice(0, 10) + "  ← 说不出，单独排");
const dq = FC.buildQueue([{ id: "1-0", w: "film" }], demo, 30, 15, "flashProd");
console.log("  产出档今日队列: [" + dq.queue.map(function (c) { return c.w; }).join(", ") + "]");

Date.now = REAL_NOW;
console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
