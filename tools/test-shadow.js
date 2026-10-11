// 门禁：词级跟读 P10（🔁 复读次数与间隔 / 🎤 听自己并对比标准音）
//
// 为什么单独一个门禁文件：
//   ① 「复读」是**行为 + 单一数据源**型改动：次数/间隔的夹取口径必须只有一处
//      （Player.clampRepeat / Player.clampGap），下拉框的选项也必须由它派生；
//   ② 最大的风险不是功能不工作，而是**改坏既有链式播放**——连听本单元 / 字幕自动连播 /
//      A-B 复读 / 五阶段闯关 / AI 陪练 VAD 都靠 `Player.speak` 的 `onend` 逐句推进。
//      本文件因此专门守两条：`Player.repeat` 走独立入口、**只在最后一轮调一次 onDone**；
//   ③ 存储键 fte-rep 必须登记（否则备份静默丢数据，见 tools/test-security.js 的同款口径）。
//
// 装载方式照抄 tools/test-subtitle-ab.js：最小环境直接装载，不引入任何依赖。
// 定时器用**手动队列**而不是同步 setTimeout —— 否则 stop() 的"不再往下读"根本测不出来。
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const JS = path.join(ROOT, "js");
const playerSrc = fs.readFileSync(path.join(JS, "player.js"), "utf8");
const phonemesSrc = fs.readFileSync(path.join(JS, "phonemes.js"), "utf8");
const swSrc = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const cssSrc = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + (info ? "  → " + info : "")); }
}

/* ---------------- 假 localStorage（复读偏好要能被断言） ---------------- */
const store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};

/* ---------------- 可手动驱动的定时器队列 ----------------
   guard（而不是直接跑）才能测出：stop() 之后队列里那一次不得再发声。 */
let timerQ = [];
const realSetTimeout = global.setTimeout;
global.setTimeout = function (fn) { timerQ.push(fn); return timerQ.length; };
global.clearTimeout = function (id) { if (id) timerQ[id - 1] = null; };
function flush(limit) {
  let n = 0;
  while (timerQ.length && n < (limit || 50)) {
    const fn = timerQ.shift();
    n++;
    if (typeof fn === "function") fn();
  }
  return n;
}

/* ---------------- 装载 player.js（speechSynthesis 缺席即自跳过语音初始化） ---------------- */
function loadPlayer() {
  delete global.window.Player;
  global.window.Player = {};
  global.eval(playerSrc);
  return global.window.Player;
}
global.window = { Player: {} };
global.document = { addEventListener: function () { } };
let Player = loadPlayer();

console.log("---- 🔁 T1 夹取口径（唯一一处） ----");

ok("暴露 clampRepeat", typeof Player.clampRepeat === "function");
ok("暴露 clampGap", typeof Player.clampGap === "function");
ok("暴露 repeat / setRepPref / repPref",
  typeof Player.repeat === "function" && typeof Player.setRepPref === "function" && !!Player.repPref);

/* 次数：合法区间 1–5，非法值一律夹取而不是抛错 */
ok("clampRepeat(3) = 3", Player.clampRepeat(3) === 3);
ok("clampRepeat(0) → 1（下限）", Player.clampRepeat(0) === 1);
ok("clampRepeat(-4) → 1", Player.clampRepeat(-4) === 1);
ok("clampRepeat(99) → 5（上限）", Player.clampRepeat(99) === 5);
ok("clampRepeat('3') 字符串也认", Player.clampRepeat("3") === 3);
ok("clampRepeat(null) → 1（不抛错）", Player.clampRepeat(null) === 1);
ok("clampRepeat(NaN) → 1", Player.clampRepeat(NaN) === 1);
ok("clampRepeat(2.7) 取整为 2", Player.clampRepeat(2.7) === 2);

/* 间隔：合法区间 0.5–5，步长 0.5 */
ok("clampGap(1.5) = 1.5", Player.clampGap(1.5) === 1.5);
ok("clampGap(0) → 0.5（下限，低于此不算跟读窗口）", Player.clampGap(0) === 0.5);
ok("clampGap(99) → 5（上限）", Player.clampGap(99) === 5);
ok("clampGap(1.3) 对齐到 1.5", Player.clampGap(1.3) === 1.5, String(Player.clampGap(1.3)));
ok("clampGap(1.2) 对齐到 1", Player.clampGap(1.2) === 1, String(Player.clampGap(1.2)));
ok("clampGap(null) → 0.5", Player.clampGap(null) === 0.5);

console.log("---- 🔁 T2 偏好读写（fte-rep） ----");

ok("默认偏好为 {n:2, gap:1.5}", Player.repPref.n === 2 && Player.repPref.gap === 1.5, JSON.stringify(Player.repPref));

const set1 = Player.setRepPref(4, 3);
ok("setRepPref 返回夹取后的值", set1.n === 4 && set1.gap === 3, JSON.stringify(set1));
ok("setRepPref 已落 localStorage", /"n":4/.test(store["fte-rep"] || ""), store["fte-rep"]);

const set2 = Player.setRepPref(99, 99);
ok("setRepPref 越界被夹取（99 → 5/5）", set2.n === 5 && set2.gap === 5, JSON.stringify(set2));

/* 脏数据不得让模块在加载期炸 */
store["fte-rep"] = "{not json";
let reloadErr = null, P2 = null;
try { P2 = loadPlayer(); } catch (e) { reloadErr = e; }
ok("坏 JSON 不会让加载期抛错", !reloadErr, reloadErr && reloadErr.message);
ok("坏 JSON 回落到默认 {n:2, gap:1.5}", !!P2 && P2.repPref.n === 2 && P2.repPref.gap === 1.5,
  P2 && JSON.stringify(P2.repPref));

/* 越界但合法的 JSON 也要夹取 */
store["fte-rep"] = JSON.stringify({ n: 42, gap: 0.1 });
const P3 = loadPlayer();
ok("越界 JSON 被夹取为 {5, 0.5}", P3.repPref.n === 5 && P3.repPref.gap === 0.5, JSON.stringify(P3.repPref));

/* ---------------- T3 repeat() 行为 ----------------
   把 speak/stop 换成计数器：player.js 内部调用的就是 Player.speak，所以替换有效。 */
console.log("---- 🔁 T3 repeat()：读 N 次、onDone 只调一次 ----");

store["fte-rep"] = JSON.stringify({ n: 3, gap: 1 });
const P4 = loadPlayer();
let speaks = 0, dones = 0, stops = 0;
P4.speak = function () { speaks++; };
P4.stop = function () { stops++; };

/* 一次 repeat 会压入 N 个定时器（每轮读完一个）；逐个放行 */
P4.repeat("thickness", { onDone: function () { dones++; } });
ok("第 1 轮立刻发声", speaks === 1, "speaks=" + speaks);
ok("第 1 轮尚未 onDone", dones === 0, "dones=" + dones);
flush();
ok("repeat 读了 N 次（n=3）", speaks === 3, "speaks=" + speaks);
ok("onDone 恰好调一次（不是每轮一次）", dones === 1, "dones=" + dones);
ok("全部读完后定时器队列已排空", timerQ.length === 0, "left=" + timerQ.length);

/* 显式 n / gap 覆盖偏好 */
timerQ = []; speaks = 0; dones = 0;
const h = P4.repeat("film", { n: 2, gap: 2, onDone: function () { dones++; } });
flush();
ok("显式 n=2 覆盖偏好", speaks === 2, "speaks=" + speaks);
ok("句柄回报生效口径", h.total === 2 && h.gap === 2, JSON.stringify({ total: h.total, gap: h.gap }));
ok("显式 n 时 onDone 仍只一次", dones === 1, "dones=" + dones);

/* 越界的 n/gap 走夹取，而不是照着调用方的数字循环 */
timerQ = []; speaks = 0;
P4.repeat("film", { n: 99, gap: 0 });
flush();
ok("repeat 对 n 夹取（99 → 5 次）", speaks === 5, "speaks=" + speaks);

/* ★ 关键守卫：stop() 之后队列里那次不得再发声 */
timerQ = []; speaks = 0; dones = 0;
const h2 = P4.repeat("film", { n: 3, onDone: function () { dones++; } });
ok("stop 前已读 1 次", speaks === 1, "speaks=" + speaks);
h2.stop();
const before = speaks;
flush();
ok("stop() 后不再继续读", speaks === before, "before=" + before + " after=" + speaks);
ok("stop() 后不再调 onDone", dones === 0, "dones=" + dones);
ok("stop() 调了底层 Player.stop 停声", stops >= 1, "stops=" + stops);

/* 新一次 repeat 让旧的失效（seq 令牌）——旧链的 onDone 不得再触发 */
timerQ = []; speaks = 0; dones = 0;
P4.repeat("old", { n: 5, onDone: function () { dones++; } });
P4.repeat("new", { n: 1, onDone: function () { dones++; } });
flush();
ok("新 repeat 使旧链失效（onDone 只来自新链）", dones === 1, "dones=" + dones);
ok("失效的旧链不再发声（new 只读 1 次）", speaks <= 2, "speaks=" + speaks);

/* ---------------- T3b repeat()：跟读窗口必须从「读完」算起 ----------------
   第三轮使用反馈原文：「跟读按钮放出的仍是系统声音，不是让我录音」。
   老实现 `speak(); setTimeout(round, gap)` —— 定时器从**开始朗读**那一刻算起，
   于是句子比 gap 长时：① 第 2 轮在上一条没读完时抢麦；② onDone 在固定 n×gap 秒后触发，
   录音在系统朗读尚未结束时就开始 → 麦克风把扬声器里的标准音录了进去。
   本组断言把"跟读窗口挂在 onend 上"钉死：speak 必须拿到 onend，且
   **onend 之前不得进入下一轮 / 触发 onDone；最后一轮也要停满 gap 才 onDone**。 */
console.log("---- 🔁 T3b repeat()：下一轮与 onDone 必须等「读完 + gap」 ----");

/* runNext：只放行一个真正的定时器回调（队列里可能夹着 clearTimeout 留下的 null） */
function runNext() {
  while (timerQ.length) {
    const fn = timerQ.shift();
    if (typeof fn === "function") { fn(); return true; }
  }
  return false;
}

timerQ = []; speaks = 0; dones = 0;
store["fte-rep"] = JSON.stringify({ n: 2, gap: 1.5 });
const P5 = loadPlayer();
let pendings = [];
P5.speak = function (t, o) { speaks++; if (o && typeof o.onend === "function") pendings.push(o.onend); };
P5.stop = function () { };
P5.repeat("quotation", { onDone: function () { dones++; } });
ok("T3b 第 1 轮已开始朗读", speaks === 1, "speaks=" + speaks);
ok("T3b speak 必须收到 onend（跟读窗口就挂在它上面）", pendings.length === 1, "pendings=" + pendings.length);

const on1 = pendings.shift();
on1();                                   /* 模拟"这一轮读完了" */
ok("T3b 读完时先留 gap，不得立刻读第 2 轮", speaks === 1, "speaks=" + speaks);
runNext();
ok("T3b gap 到点才读第 2 轮", speaks === 2, "speaks=" + speaks);
ok("T3b 第 2 轮也拿到了 onend", pendings.length === 1, "pendings=" + pendings.length);

const on2 = pendings.shift();
on2();
ok("T3b 最后一轮读完仍要停满 gap 才 onDone", dones === 0, "dones=" + dones);
runNext();
ok("T3b gap 走完 onDone 恰好一次", dones === 1, "dones=" + dones);

/* 兜底：引擎不回调 onend 时，链子也必须能自己走完（不许卡死） */
timerQ = []; speaks = 0; dones = 0;
const P5b = loadPlayer();
P5b.speak = function () { speaks++; };             /* 永不回调 onend */
P5b.stop = function () { };
store["fte-rep"] = JSON.stringify({ n: 2, gap: 0.5 });
const P5c = loadPlayer();
P5c.speak = function () { speaks++; };
P5c.stop = function () { };
P5c.repeat("fallback", { n: 2, gap: 0.5, onDone: function () { dones++; } });
flush();
ok("T3b onend 失联时靠兜底读满 N 次（不卡死）", speaks === 2, "speaks=" + speaks);
ok("T3b onend 失联时 onDone 仍恰好一次", dones === 1, "dones=" + dones);

/* onRound 供 UI 显示"第几遍"（不给也不影响） */
timerQ = []; speaks = 0;
const P5d = loadPlayer();
const rounds = [];
P5d.speak = function () { speaks++; };
P5d.stop = function () { };
P5d.repeat("rounds", { n: 3, gap: 0.5, onRound: function (k, t) { rounds.push(k + "/" + t); } });
flush();
ok("T3b onRound 按轮次回调（1/3 2/3 3/3）", rounds.join(",") === "1/3,2/3,3/3", rounds.join(","));

global.setTimeout = realSetTimeout;

console.log("---- 🎤 T4 音素页接线（词条 = 朗读 + 跟读两个动作） ----");

/* 与 tools/test-phonemes.js 同构的最小环境装载 phonemes.js */
const pctx = vm.createContext({ console: console, window: {} });
["data.js", "data-ops.js", "data-ocean.js", "data-incoterms.js", "data-settle.js", "data-risk.js", "data-deep.js", "data-meeting.js"]
  .forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(JS, f), "utf8"), pctx, { filename: f });
  });
const pUnits = vm.runInContext("FTE_DATA.units", pctx);
const pApp = { innerHTML: "", scrollIntoView: function () { } };
global.document = {
  addEventListener: function () { },
  getElementById: function (id) { return id === "app" ? pApp : null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; }
};
delete global.window.Player;
global.window = { scrollTo: function () { }, FTE_BOOT: { DATA: { units: pUnits }, State: {}, progress: { rate: 1 } } };
delete require.cache[path.join(JS, "phonemes.js")];
require(path.join(JS, "phonemes.js"));
const PT = global.window.Phonemes._t;

let hrErr = null, hrHtml = "";
try { hrHtml = PT.highRiskHtml(); } catch (e) { hrErr = e; }
ok("highRiskHtml() 不抛错（新增按钮后仍然）", !hrErr, hrErr && hrErr.message);

const sayN = (hrHtml.match(/data-action="ph-say"/g) || []).length;
const shadowN = (hrHtml.match(/data-action="ph-shadow"/g) || []).length;
ok("每个词条一个 🎤 跟读按钮（与朗读按钮同数量）", shadowN > 0 && shadowN === sayN,
  "say=" + sayN + " shadow=" + shadowN);
ok("跟读按钮带无障碍名（aria-label）",
  (hrHtml.match(/class="hr-shadow"[^>]*aria-label="/g) || []).length === shadowN,
  String((hrHtml.match(/class="hr-shadow"[^>]*aria-label="/g) || []).length));

/* 下拉框：选项必须由 Player 的夹取函数派生（次数 1–5、间隔 0.5–5 步长 0.5）。
   注意：本环境没有 window.Player，所以这条同时验证了"缺 Player 时仍要渲染设置项"的降级路径。 */
function selectHtml(action) {
  const m = hrHtml.match(new RegExp('<select data-action="' + action + '"[^>]*>([\\s\\S]*?)</select>'));
  return m ? m[1] : "";
}
function optionValues(seg) {
  const re = /<option value="([^"]*)"/g;
  const out = [];
  let x;
  while ((x = re.exec(seg)) !== null) out.push(parseFloat(x[1]));
  return out;
}
const nVals = optionValues(selectHtml("ph-rep-n"));
const gVals = optionValues(selectHtml("ph-rep-gap"));
ok("渲染出复读次数下拉", nVals.length > 0);
ok("渲染出跟读窗口下拉", gVals.length > 0);
/* 数值比较而不是正则拼值域：正则拼 [1-4] 之类很容易写错，写错了守卫就形同虚设 */
ok("次数选项恰为 1..5", nVals.join(",") === "1,2,3,4,5", nVals.join(","));
const wantGap = [];
for (let i = 0; i < 10; i++) wantGap.push(Math.round((0.5 + i * 0.5) * 2) / 2);
ok("间隔选项恰为 0.5 步长到 5（10 个）", gVals.join(",") === wantGap.join(","), gVals.join(","));

/* 教学诚实边界必须写在页面上（本页不打分） */
ok("页面明写「本页不打分」（识别≠发音的诚实口径）", /本页不打分/.test(hrHtml));
ok("_t 暴露 shadowWord（供诊断/测试）", typeof PT.shadowWord === "function");

console.log("---- 🧾 T5 接线：CACHE 版本 / 存储键 / CSS / 无内联处理器 ----");

const cacheRaw = (swSrc.match(/const CACHE = "(fte-v\d+)"/) || [])[1] || "";
ok("sw.js 的 CACHE 已升到 v90+（改了 PRECACHE 内文件）", /^fte-v(9\d|\d{3,})$/.test(cacheRaw), cacheRaw);

/* CSS 类必须真实存在：否则「词级跟读」在页面上是隐性坏掉的（按钮没样式、看不出状态） */
[".hr-item", ".hr-shadow", ".hr-rep", ".hr-rep-stage"].forEach(function (sel) {
  const re = new RegExp(sel.replace(/\./g, "\\.") + "\\s*[,{:]");
  ok("css/style.css 含样式 " + sel, re.test(cssSrc));
});
ok("css/style.css 含跟读进行中的高亮态 .hr-shadow.on",
  /\.hr-shadow\.on\s*\{/.test(cssSrc));

/* CSP：新增交互不得写内联事件处理器（与 test-immerse-weekly.js 同一口径） */
const inlineBad = (phonemesSrc.match(/\son[a-z]+\s*=\s*["']/g) || []);
ok("phonemes.js 没有内联事件处理器（CSP script-src 不含 unsafe-inline）", inlineBad.length === 0, inlineBad.join(" "));

/* 存储键登记：fte-rep 必须出现在存储键注册表里（否则不进备份） */
const skSrc = fs.readFileSync(path.join(JS, "storage-keys.js"), "utf8");
ok("fte-rep 已登记进 storage-keys.js", /"fte-rep"/.test(skSrc));

/* 复读链的唯一实现守卫：不得在别的文件里再写一套定时复读 */
const allJs = fs.readdirSync(JS).filter(function (f) { return /\.js$/.test(f); });
const dupRepeat = allJs.filter(function (f) {
  if (f === "player.js") return false;
  const s = fs.readFileSync(path.join(JS, f), "utf8");
  return /function\s+round\s*\(\s*\)\s*\{/.test(s) || /Player\.repeat\s*=/.test(s);
});
ok("复读链只有 player.js 一份实现（无重复实现）", dupRepeat.length === 0, dupRepeat.join(", "));

/* 反向守卫：不得改动 Player.speak 的 onend 语义（复读是旁挂，不是把 onend 乘 N） */
ok("player.js 里 Player.speak 仍是单一入口（只有一处赋值）",
  (playerSrc.match(/Player\.speak\s*=\s*function/g) || []).length === 1);

console.log("");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
