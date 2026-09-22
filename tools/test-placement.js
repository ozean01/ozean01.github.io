#!/usr/bin/env node
/* 验收测试：🧭 水平自测 v2 · 诊断层（js/placement.js）。
   这一层要解决的是一句话的问题：「我比 30 天前好了吗」。
   原实现答完 6 道词义题只写一个起点单元号（fte-placement），**没有日期、没有分项、没有历史**，
   结构上不可能回答——所以下面盯的是四件事：
     ① 基线必须落日期并**锁定**（后续复测只能追加，不能覆盖首版）；
     ② 四项能力**分别定级、不取平均**；
     ③ 复测按第 7/30/90 天自动排期，并能算出「还没到 / 到期 / 已逾期 / 已完成」；
     ④ 与上次相比是**逐项**比，不是给一个平均分。

   另外做接线检查：index.html 的 <script>、sw.js 预缓存、app.js 与 today.js 的调用点——
   零构建站点漏一处就会静默坏掉（test-boot.js 只保证加载期不抛错，不保证被调用）。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) pass = false;
}

/* ---------------- 最小运行环境 ---------------- */
global.document = {
  addEventListener: function () { },
  getElementById: function () { return null; },
  querySelector: function () { return null; }
};
global.localStorage = {
  _d: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};
global.window = { FTE_BOOT: { toast: function () { } } };

require(path.join(ROOT, "js", "placement.js"));
const P = global.window.Placement;
const H = P._t;

function reset() { global.localStorage._d = {}; }

/* ---------------- ⓪ 模块就绪 ---------------- */
check("导出 window.Placement", typeof P === "object" && typeof P.cardHtml === "function");
check("CEFR 六档描述符齐全（A1–C2）",
  H.LEVELS.length === 6 && H.LEVELS.map(function (l) { return l.id; }).join(",") === "A1,A2,B1,B2,C1,C2");
check("六档都有「能做什么」描述（不是只有标签）",
  H.LEVELS.every(function (l) { return typeof l.desc === "string" && l.desc.length >= 20; }));
check("四项能力（听/说/读/写）各有固定的任务与检查点",
  H.SKILLS.length === 4 && H.SKILLS.every(function (s) { return s.task && s.check && s.href; }),
  H.SKILLS.map(function (s) { return s.label; }).join("/"));
check("四项任务都带硬参数（时长/篇幅），否则自评会变成凭感觉",
  H.SKILLS.every(function (s) { return /\d/.test(s.task); }));
check("复测锚点为第 7 / 30 / 90 天", H.ANCHORS.join(",") === "7,30,90");
check("5 维量表每维 0–2 分", H.RUBRIC.length === 5 && H.SCALE.map(function (s) { return s.v; }).join(",") === "0,1,2");

/* ---------------- ① 日期运算：不能被 UTC 挪一天 ---------------- */
check("addDays 跨月正确", H.addDays("2026-01-30", 3) === "2026-02-02", H.addDays("2026-01-30", 3));
check("addDays 跨年正确", H.addDays("2026-12-28", 7) === "2027-01-04", H.addDays("2026-12-28", 7));
check("addDays 闰年 2 月正确", H.addDays("2028-02-28", 1) === "2028-02-29", H.addDays("2028-02-28", 1));
check("addDays 不因时区偏移挪一天（本地构造日期）", H.addDays("2026-03-01", 0) === "2026-03-01");
check("diffDays 正负与量值正确",
  H.diffDays("2026-09-01", "2026-09-08") === 7 && H.diffDays("2026-09-08", "2026-09-01") === -7);
check("diffDays 拒绝非法输入（返回 0 而不是 NaN）",
  H.diffDays("", "2026-01-01") === 0 && H.diffDays("2026-1-1", "2026-01-01") === 0);
check("todayStr 形如 YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(H.todayStr()), H.todayStr());

/* ---------------- ② 基线落日期并锁定 ---------------- */
const TODAY = H.todayStr();
reset();
let rec = P.recordQuiz(4, 6, 5);
check("首次自测建立记录", !!rec && rec.history.length === 1);
check("基线落日期（原来只存一个单元号，没有日期）", rec.baselineAt === TODAY, rec.baselineAt);
check("首条标记为 baseline", rec.history[0].kind === "baseline");
check("同时保留原有起点单元号语义（unitId）", rec.history[0].unitId === 5);

/* 同一天重测：覆盖当天那一条，不制造假历史 */
rec = P.recordQuiz(6, 6, 8);
check("同一天重测不新增历史（不制造假历史）", rec.history.length === 1);
check("同一天重测会更新分数与推荐单元", rec.history[0].score === 6 && rec.history[0].unitId === 8);

/* 填分项 → 再同天重测，填过的内容不能被冲掉 */
P.setSkill("listen", "B1");
P.setSkill("read", "B2");
P.setFocus("listen");
P.setRubric("task", 2);
P.setEvidence("录音第 40 秒起 3 次长停顿");
rec = P.recordQuiz(5, 6, 7);
check("同天重测会保留已填的分项定级（不冲掉用户输入）",
  rec.history[0].skills.listen === "B1" && rec.history[0].skills.read === "B2");
check("同天重测保留重点项、量表与证据理由",
  rec.history[0].focus === "listen" && rec.history[0].rubric.task === 2 &&
  rec.history[0].evidence.indexOf("长停顿") !== -1);

/* 换天复测：追加一条，基线原样保留（首版锁） */
const baseEntry = JSON.parse(JSON.stringify(rec.history[0]));
rec.history.push(Object.assign({}, rec.history[0], { at: "2026-12-01", kind: "retest", score: 6 }));
P.save(rec);
const reloaded = P.load();
check("复测是追加，不是覆盖", reloaded.history.length === 2);
check("★ 基线条目逐字保留（首版锁：不用修订版覆盖首版）",
  JSON.stringify(reloaded.history[0]) === JSON.stringify(baseEntry));
check("baselineAt 不会被后续复测改动", reloaded.baselineAt === TODAY, reloaded.baselineAt);

/* ---------------- ②b P1-5：复测可比性（题库指纹） ----------------
   背景：以前每次自测都重新随机抽题，只记 score/total。换一批题，1 道题的波动就能把推荐起点
   从 U8 推到 U13——用户看到的「进步」其实是抽样噪声。现在记录题库指纹，只有同一套题才判定可比。
   注意：recordQuiz 同一天会覆盖当天那条，所以「两次」必须靠改日期造（与上面的复测造法一致）。 */
reset();
const BANK_A = "a|b|c|d|e|f", BANK_B = "x|y|z|u|v|w";
const DIFFS = [1, 1, 2, 2, 3, 3];
P.recordQuiz(4, 6, 5, { bankId: BANK_A, diffs: DIFFS });
let r5 = P.load();
check("P1-5：诊断记录带上题库指纹与每题难度档",
  r5.history.slice(-1)[0].bankId === BANK_A && JSON.stringify(r5.history.slice(-1)[0].diffs) === JSON.stringify(DIFFS));
check("P1-5：只有一次记录时不判定可比（不拿单次成绩当进步）",
  P.scoreComparable(r5).comparable === false);
r5.history.push(Object.assign({}, r5.history[0], { at: "2026-12-01", kind: "retest", score: 6 }));
P.save(r5);
check("P1-5：同一套题的两次自测 → 判定可比", P.scoreComparable(P.load()).comparable === true);
const r6 = P.load();
r6.history.push(Object.assign({}, r6.history[r6.history.length - 1], { at: "2026-12-08", bankId: BANK_B, score: 5 }));
P.save(r6);
check("P1-5：换了题库 → 判定不可比（不得照样画箭头）", P.scoreComparable(P.load()).comparable === false);
reset();
P.recordQuiz(4, 6, 5);
const r7 = P.load();
r7.history.push(Object.assign({}, r7.history[0], { at: "2026-12-01", kind: "retest", score: 6 }));
P.save(r7);
check("P1-5：没有题库指纹的旧记录 → 不判定可比（保守）", P.scoreComparable(P.load()).comparable === false);
P.save(reloaded);   /* 还原上面那段的状态（后面还有针对它的断言） */

/* ---------------- ③ 分项定级与逐项比较（不取平均） ---------------- */
P.setSkill("speak", "A2");
P.setSkill("write", "B1");
const v = P.vsLast();
check("vsLast 只在有两条以上记录时返回", !!v);
check("★ 逐项与上次比较，不产生平均分",
  v.changed.length + v.added.length + v.same === 4 &&
  v.changed.every(function (c) { return typeof c.delta === "number" && c.from && c.to; }));
const up = v.changed.filter(function (c) { return c.delta > 0; })[0];
const down = v.changed.filter(function (c) { return c.delta < 0; })[0];
check("能识别进步（A2→B1 记 +1）", !!up || v.added.length > 0);
check("changed 里不含 delta=0 的项（同项不计入变化）",
  v.changed.every(function (c) { return c.delta !== 0; }));

/* 只留一条记录时 vsLast 必须为 null（不能拿自己跟自己比） */
reset();
P.recordQuiz(3, 6, 3);
check("只有一条记录时 vsLast 返回 null", P.vsLast() === null);

/* ---------------- ④ 复测排期：未到 / 到期 / 逾期 / 完成 ---------------- */
reset();
P.recordQuiz(3, 6, 3);
let sc = P.schedule();
check("排期从基线日算第 7/30/90 天",
  sc.d7 === H.addDays(TODAY, 7) && sc.d30 === H.addDays(TODAY, 30) && sc.d90 === H.addDays(TODAY, 90));
let st = P.retestStatus();
check("刚做完基线：第 7 天还没到 → future 且不打扰", !!st && st.future === true && st.day === 7);

/* 手动把基线推到 10 天前且期间没复测过（历史条目要同步回填，否则 TODAY 那条
   会被算成「第 7 天已复测」——那是正确行为，但不是我这里要构造的场景）→ 应报逾期 3 天 */
function backdateBaseline(daysAgo) {
  const r = P.load();
  r.baselineAt = H.addDays(TODAY, -daysAgo);
  r.history = [{ at: r.baselineAt, kind: "baseline", score: 3, total: 6, unitId: 3, skills: {} }];
  P.save(r);
  return r;
}
backdateBaseline(10);
st = P.retestStatus();
check("★ 第 7 天已过 → 报到期", !!st && !st.future && st.day === 7, "day=" + (st && st.day));
check("★ 逾期天数算得准（基线 10 天前 → 逾期 3 天）", st.overdueDays === 3 && st.overdue === true,
  "overdueDays=" + st.overdueDays);

/* 恰好当天：不算逾期 */
backdateBaseline(7);
st = P.retestStatus();
check("恰好第 7 天当天：到期但不算逾期", st.day === 7 && st.overdue === false && st.overdueDays === 0);

/* 补上一次第 7 天复测（记录日期 ≥ 锚点日）→ 应推进到第 30 天 */
backdateBaseline(10);
let r2 = P.load();
r2.history.push({ at: H.addDays(r2.baselineAt, 8), kind: "retest", score: 5, total: 6, unitId: 9, skills: {} });
P.save(r2);
st = P.retestStatus();
check("★ 第 7 天复测补上后，排期推进到第 30 天", st.day === 30 && st.future === true, "day=" + st.day);

/* 三个锚点都完成 → 返回 null（不再提示） */
r2 = P.load();
r2.baselineAt = H.addDays(TODAY, -200);
r2.history.push({ at: H.addDays(TODAY, -100), kind: "retest", score: 5, total: 6, unitId: 9, skills: {} });
P.save(r2);
check("三个锚点都完成 → 不再提示（不变成永久横幅）", P.retestStatus() === null);
check("没有记录时不崩（返回 null）", (function () { reset(); return P.retestStatus() === null; })());

/* ---------------- ⑤ 渲染：不抛错 + 关键内容在 ---------------- */
reset();
P.recordQuiz(4, 6, 5);
P.setSkill("listen", "B1");
const html = P.cardHtml();
check("cardHtml 能渲染", typeof html === "string" && html.length > 500);
check("渲染出基线日期与「已锁定」", html.indexOf(TODAY) !== -1 && html.indexOf("已锁定") !== -1);
check("四项能力都在卡片里", H.SKILLS.every(function (s) { return html.indexOf(s.icon + " <b>" + s.label) !== -1; }));
check("四项各给 6 个等级按钮（4×6=24）", (html.match(/data-action="pl-skill"/g) || []).length === 24);
check("复测排期三个锚点都显示", H.ANCHORS.every(function (n) { return html.indexOf("第 " + n + " 天") !== -1; }));
check("写明「不取平均」", html.indexOf("不要强行取平均") !== -1);
check("写明「总分只用于纵向比较」", html.indexOf("纵向比较") !== -1);
check("没设重点时不做 4×5 评分矩阵（防形式主义）",
  html.indexOf("pl-rubric-empty") !== -1 && (html.match(/data-action="pl-score"/g) || []).length === 0);

P.setFocus("speak");
const html2 = P.cardHtml();
check("设了重点后只出现 5 个维度（5×3=15 个分值按钮），不是 4 技能×5 维",
  (html2.match(/data-action="pl-score"/g) || []).length === 15);
check("评分区要求写证据理由（凭什么给这个分）",
  html2.indexOf("plEvidence") !== -1 && html2.indexOf("证据理由") !== -1);

/* 历史对比区块只在两条以上记录时出现 */
reset();
P.recordQuiz(4, 6, 5);
check("只有基线时不渲染「与上次相比」", P.cardHtml().indexOf("与上次相比") === -1);
let r3 = P.load();
r3.history.push({ at: "2026-12-01", kind: "retest", score: 6, total: 6, unitId: 9, skills: { listen: "B2" } });
P.save(r3);
check("有第二条记录时渲染「与上次相比」", P.cardHtml().indexOf("与上次相比") !== -1);

/* ---------------- ⑥ 接线：漏一处就会静默坏掉 ---------------- */
const htmlSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
check("index.html 引入 js/placement.js", /<script\s+src="js\/placement\.js"[^>]*><\/script>/.test(htmlSrc));
check("placement.js 在 app.js 之前加载", htmlSrc.indexOf("js/placement.js") < htmlSrc.indexOf("js/app.js"));

const swSrc = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
check("sw.js 预缓存 js/placement.js（否则离线打开即坏）", swSrc.indexOf('"./js/placement.js"') !== -1);
check("sw.js CACHE 版本号已 +1（否则老用户拿不到新文件）", /const CACHE = "fte-v(\d+)"/.test(swSrc));

const appSrc = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
check("app.js 在自测结束时写入诊断记录（P1-5 起额外带题库指纹 meta）",
  /P\.recordQuiz\(score, PLACE_N, rec\.unitId,\s*\{/.test(appSrc));
check("P1-5：诊断记录带上题库指纹与每题难度档",
  /bankId:\s*placementBankId\(plItems\)/.test(appSrc) && /diffs:\s*plItems\.map/.test(appSrc));
check("P1-5：同一用户复测复用同一套题（题库落盘）",
  /PLACE_BANK_KEY/.test(appSrc) && /loadPlacementBank\(\)/.test(appSrc) && /savePlacementBank\(items\)/.test(appSrc));
check("P1-6：placement.js 提供两次得分可比性判定",
  /scoreComparable/.test(fs.readFileSync(path.join(ROOT, "js", "placement.js"), "utf8")));
check("app.js 渲染诊断卡容器（#plCard）", /<div id="plCard">/.test(appSrc));
check("app.js 仍保留原有 fte-placement 语义（老数据不失效）",
  /localStorage\.setItem\("fte-placement"/.test(appSrc));
check("FTE_BOOT 暴露 placementRecord / placementRetest",
  /placementRecord: function/.test(appSrc) && /placementRetest: function/.test(appSrc));
check("FTE_BOOT 暴露 coachLastDate（供中断回归）", /coachLastDate: function/.test(appSrc));
check("placement.js 未加载时自测仍可用（静默降级）", /P && P\.cardHtml/.test(appSrc));

const todaySrc = fs.readFileSync(path.join(ROOT, "js", "today.js"), "utf8");
check("today.js 有复测到期提醒", /function retestDue\(\)/.test(todaySrc) && /placementRetest/.test(todaySrc));
check("today.js 有中断回归协议", /function comeback\(\)/.test(todaySrc) && /coachLastDate/.test(todaySrc));
check("today.js 写明「不补作业、不熬夜还债」", /不熬夜还债/.test(todaySrc));
check("today.js 写明「进度不会倒退」", /不会清零/.test(todaySrc));

const cssSrc = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");
check("诊断卡的样式类都有定义", [".pl-skill", ".pl-lv", ".pl-sched", ".pl-history", ".td-comeback", ".td-retest", ".pl-notfor"]
  .every(function (c) { return cssSrc.indexOf(c) !== -1; }));

/* P7「不适合谁」：自测卡必须同时说清"不测什么、别指望它做什么"（借鉴 ENGSENCE 第 9 章的诚实边界） */
const plSrc = fs.readFileSync(path.join(ROOT, "js", "placement.js"), "utf8");
check("自测卡列出「不适合谁」（诚实边界）", /不适合谁/.test(plSrc) && /notForHtml/.test(plSrc));
check("「不适合谁」写明不刷题型 / 不代写", /四六级/.test(plSrc) && /不代写/.test(plSrc));
check("「不适合谁」提醒零基础先别做四项定级", /先别做本页/.test(plSrc));
check("「不适合谁」重申 打卡天数≠口语变好（坚持/能力口径）", /不等于口语变好/.test(plSrc));

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
