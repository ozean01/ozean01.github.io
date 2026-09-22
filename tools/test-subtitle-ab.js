// 门禁：字幕练习 P8（🔂 A-B 复读 / 🌊 原声波形 / 📝 逐句笔记）
//
// 为什么单独一个门禁文件：
//   ① 这三项都是「行为 + 单一数据源」型改动，纯函数都有可测边界；
//   ② A-B 的回绕判定必须**只有一处**（与 tools/test-score.js 的「全站唯一实现」同一口径）；
//   ③ 三项都旁挂在 subtitle.js 上，必须防止它们破坏被别的门禁锚定的既有写法
//      （test-security 锚 esc/toastMsg，test-ui-quality 锚 role/tabindex/aria-label 与 keydown 委托）。
//
// 装载方式照抄 tools/test-subtitle.js：vm 式最小环境 + eval，不引入任何依赖。
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const JS = path.join(ROOT, "js");
const src = fs.readFileSync(path.join(JS, "subtitle.js"), "utf8");
/* player.js 只在 IIFE 内活动，顶层只有 window 依赖（speechSynthesis 缺席时自跳过语音初始化，
   localStorage 读写自带 try/catch）→ 可以在 Node 里直接装载，用于测"唯一绘制实现"。 */
const playerSrc = fs.readFileSync(path.join(JS, "player.js"), "utf8");

/* 最小环境：与 tools/test-subtitle.js 同构。注意这里**故意不提供 localStorage**
   —— subtitle.js 的所有存储读写都必须自己 try/catch，否则本文件在加载期就会炸。 */
global.window = { FTE_DIFF: null, Subtitle: {}, Player: {} };
global.document = {
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; }
};
eval(src);

const t = window.Subtitle._t;
let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + (info ? "  → " + info : "")); }
}
function count(re) { const m = src.match(re); return m ? m.length : 0; }
function countP(re) { const m = playerSrc.match(re); return m ? m.length : 0; }

console.log("---- 🔂 T1 A-B 段循环复读 ----");

/* ① 纯函数必须在测试钩子上暴露（沿用 subtitle.js 既有 _t 约定） */
ok("_t 暴露 abWindowOf", typeof t.abWindowOf === "function");
ok("_t 暴露 abTick", typeof t.abTick === "function");
ok("_t 暴露 AB_MIN 且为正数", typeof t.AB_MIN === "number" && t.AB_MIN > 0, String(t.AB_MIN));

/* ② abWindowOf：无标记时 = 整句 */
const w1 = t.abWindowOf({ start: 1, end: 2.5 });
ok("abWindowOf 整句窗口", w1 && w1.a === 1 && w1.b === 2.5, JSON.stringify(w1));

/* 手动标记覆盖（为将来的"手动打点"预留，但窗口算法只此一份） */
const w2 = t.abWindowOf({ start: 1, end: 2.5 }, 1.2, 1.8);
ok("abWindowOf 手动标记覆盖", w2 && w2.a === 1.2 && w2.b === 1.8, JSON.stringify(w2));

/* 窗口下限：零长句不得退化成"哒"一声，也不得 b <= a */
const w3 = t.abWindowOf({ start: 5, end: 5 });
ok("abWindowOf 零长句补足下限", w3 && Math.abs(w3.b - (5 + t.AB_MIN)) < 1e-9, JSON.stringify(w3));
const w4 = t.abWindowOf({ start: 5, end: 5.01 });
ok("abWindowOf 过短窗口补足下限", w4 && w4.b >= w4.a + t.AB_MIN - 1e-9, JSON.stringify(w4));
const w5 = t.abWindowOf({ start: 3, end: 4 }, 3.9, 3.95);
ok("abWindowOf 手动标记过短也补足", w5 && w5.b >= w5.a + t.AB_MIN - 1e-9, JSON.stringify(w5));

/* 负起点夹到 0（TTS 时长起点异常时不得把 currentTime 设成负数） */
const w6 = t.abWindowOf({ start: -3, end: 1 });
ok("abWindowOf 负起点夹到 0", w6 && w6.a === 0 && w6.b === 1, JSON.stringify(w6));

/* 非法输入一律 null，不抛错（渲染/播放路径不能被脏数据打断） */
ok("abWindowOf(null) → null", t.abWindowOf(null) === null);
ok("abWindowOf({}) → null", t.abWindowOf({}) === null);
ok("abWindowOf 非数字 start → null", t.abWindowOf({ start: "1", end: 2 }) === null);

/* ③ abTick：全站唯一的回绕判定 */
const ab = { a: 1, b: 2 };
ok("abTick 未到 B → null", t.abTick(ab, 1.5) === null);
ok("abTick 恰好到 B → 回到 A（含端点）", t.abTick(ab, 2) === 1);
ok("abTick 越过 B → 回到 A", t.abTick(ab, 2.4) === 1);
ok("abTick 关闭态 → null", t.abTick(null, 5) === null);
ok("abTick 缺 B → null", t.abTick({ a: 1 }, 5) === null);
ok("abTick 非数字 t → null", t.abTick(ab, "2") === null);

/* ④ 单一数据源：回绕判定只能出现在一处调用点 */
ok("abTick 只有 1 个调用点（回绕判定唯一）", count(/=\s*abTick\(/g) === 1, "调用点 " + count(/=\s*abTick\(/g) + " 处");
ok("abTick 有且仅有 1 个函数定义", count(/function\s+abTick\s*\(/g) === 1);
/* 断言里不得再出现第二份窗口算法（比如直接写 t >= s.ab.b） */
ok("没有第二份回绕条件（t >= *.ab.b）", count(/currentTime\s*>=\s*\w*\.?ab\.b/g) === 0);

/* ⑤ 接线：A-B 判定必须在句末暂停之前（否则两者互相打断） */
const iTick = src.indexOf("= abTick(");
const iStop = src.indexOf("s._stopAt != null");
ok("onTime 里 A-B 判定排在句末暂停之前", iTick !== -1 && iStop !== -1 && iTick < iStop, "abTick@" + iTick + " stopAt@" + iStop);

/* ⑥ UI 接线存在 */
ok("控制条有 A-B 按钮", /data-pl="ab"/.test(src));
ok("控制条有慢速复读按钮", /data-pl="ab-slow"/.test(src));
ok("按钮走既有 data-pl 委托（未新增第二条播放路径）", /k === "ab"|k === "ab-slow"/.test(src));
ok("与自动连播互斥（开 A-B 关闭 auto）", /s\.ab = \{[^}]*\};[\s\S]{0,120}s\.auto = false/.test(src));
ok("无媒资时退化为重复 TTS（speakAbLoop）", /function speakAbLoop\(/.test(src));
ok("换字幕时静默关闭 A-B", /stopAb\(true\)/.test(src));

/* ⑦ 回归守卫：不得破坏被其它门禁锚定的既有写法 */
ok("守卫：esc 实现未被改名（test-security 锚定）", /function esc\(s\) \{/.test(src));
ok("守卫：toastMsg 签名未变（test-security 锚定）", /function toastMsg\(msg, isHtml\) \{/.test(src));
ok("守卫：字幕行仍是 role=button/tabindex/aria-label（test-ui-quality 锚定）", /role="button" tabindex="0" aria-label=/.test(src));
ok("守卫：keydown 委托表达式未改（test-ui-quality 锚定）", /playCue\(parseInt\(row\.getAttribute\("data-idx"\)/.test(src));

console.log("\n---- 🌊 T2 原声波形对照 ----");

/* 装载真实的 player.js：window.Player 由桩对象换成真实实现 */
eval(playerSrc);
const P = window.Player;

ok("Player 暴露 waveSegRange（唯一像素映射）", !!P && typeof P.waveSegRange === "function");
ok("Player 暴露 WAVE_MAX_SEC 且为正（超长媒资上限）", typeof P.WAVE_MAX_SEC === "number" && P.WAVE_MAX_SEC > 0, String(P.WAVE_MAX_SEC));
ok("Player 暴露 waveClearCache（换媒资清缓冲）", typeof P.waveClearCache === "function");

/* 像素映射边界：全部用纯函数断言，不需要真实 canvas */
const r1 = P && P.waveSegRange(0, 10, 100, 1000);
ok("waveSegRange 起点段映射", r1 && r1.x0 === 0 && r1.x1 === 100, JSON.stringify(r1));
const r2 = P && P.waveSegRange(25, 40, 100, 1000);
ok("waveSegRange 中段映射", r2 && r2.x0 === 250 && r2.x1 === 400, JSON.stringify(r2));
const r3 = P && P.waveSegRange(95, 120, 100, 1000);
ok("waveSegRange 超出时长的端点被夹取", r3 && r3.x0 === 950 && r3.x1 === 1000, JSON.stringify(r3));
const r4 = P && P.waveSegRange(-5, 10, 100, 1000);
ok("waveSegRange 负起点被夹到 0", r4 && r4.x0 === 0 && r4.x1 === 100, JSON.stringify(r4));
const r5 = P && P.waveSegRange(5, 5, 100, 1000);
ok("waveSegRange 零宽区间至少 1px（高亮带不得消失）", r5 && r5.x1 >= r5.x0 + 1, JSON.stringify(r5));
const r6 = P && P.waveSegRange(99.99, 100, 100, 1000);
ok("waveSegRange 末段零宽不小于 1px", r6 && r6.x1 >= r6.x0 + 1 && r6.x1 <= 1000, JSON.stringify(r6));
ok("waveSegRange 非法输入 → null",
  P.waveSegRange("0", 1, 100, 1000) === null &&
  P.waveSegRange(0, 1, 0, 1000) === null &&
  P.waveSegRange(0, 1, 100, 0) === null &&
  P.waveSegRange(0, 1, NaN, 1000) === null);

/* 单一数据源：绘制与映射各只能有一份实现 */
ok("waveSegRange 只有 1 个函数定义", countP(/waveSegRange = function/g) === 1, "n=" + countP(/waveSegRange = function/g));
ok("drawWave 只有 1 个绘制实现", countP(/function drawWave\(/g) === 1, "n=" + countP(/function drawWave\(/g));
ok("drawWave 只有 1 个调用点（定义 1 + 调用 1）", countP(/return drawWave\(/g) === 1, "调用点 " + countP(/return drawWave\(/g) + " 处");
ok("subtitle.js 不自己画 canvas（绘制唯一在 player.js）", !/getContext\(/.test(src));
ok("subtitle.js 只传时间区间，不传像素", /seg:\s*\{\s*start:\s*cue\.start,\s*end:\s*cue\.end\s*\}/.test(src));
ok("waveform 签名向后兼容（录音回放仍可不传 opts）", /Player\.waveform = function \(url, canvas, opts\)/.test(playerSrc));

/* 接线 */
ok("字幕页有原声波形画布", /id="diWave"/.test(src));
ok("画布有无障碍语义（role=img + aria-label）", /id="diWave"[\s\S]{0,200}?role="img"/.test(src));
ok("换句即重画（highlightCue 内调 drawSrcWave）", /function highlightCue\(idx\) \{[\s\S]{0,400}?drawSrcWave\(\)/.test(src));
ok("渲染后补画（bind 内按媒资判断）", /if \(s\.mediaUrl\) drawSrcWave\(\)/.test(src));
ok("换媒资清波形缓存", /waveClearCache\(\)/.test(src));
ok("重画令牌存在（旧结果不得覆盖新句）", /waveSeq/.test(src));
ok("画不出时有诚实说明，不静默", /已跳过绘制/.test(src) && /解不出音轨/.test(src));
ok("无媒资时给的是引导语而非报错", /载入音\/视频后，这里显示原声波形/.test(src));
ok("媒资容器有可测 id，且显隐由 mediaUrl 单一来源决定",
  /id="diMediaBox"[\s\S]{0,80}?\$\{showMedia\}/.test(src) && /const showMedia = s\.mediaUrl \? "" : "hidden"/.test(src));

/* 回归守卫：player.js 的核心能力不得被波形重构波及 */
ok("守卫：player.js 仍导出 window.Player", window.Player === P && typeof P.recognize === "function");
ok("守卫：VAD 免按键（P7）仍在", typeof P.vadNext === "function" && typeof P.recognizeAuto === "function");
ok("守卫：双口音开关（P7）仍在", typeof P.setAccent === "function" && typeof P.hasAccent === "function");

console.log("\n---- 📝 T3 逐句笔记 ----");

ok("_t 暴露 cueKeyOf", typeof t.cueKeyOf === "function");
ok("_t 暴露 noteOf", typeof t.noteOf === "function");
ok("_t 暴露 NOTE_MAX 且为正", typeof t.NOTE_MAX === "number" && t.NOTE_MAX > 0, String(t.NOTE_MAX));

/* 定位键：必须是「文件名 + 起始秒」——用句子下标会在换字幕/重排后串位，
   串位意味着"笔记跑到别的句子下面"，比不记还糟。 */
const c1 = { start: 1, end: 2 }, c2 = { start: 2, end: 3 };
ok("cueKeyOf = 文件名@起始秒（可读、可人工核对）", t.cueKeyOf("a.srt", c1) === "a.srt@1.00", t.cueKeyOf("a.srt", c1));
ok("cueKeyOf 同文件不同起始秒 → 不同键", t.cueKeyOf("a.srt", c1) !== t.cueKeyOf("a.srt", c2));
ok("cueKeyOf 不同文件同一时间 → 不同键", t.cueKeyOf("a.srt", c1) !== t.cueKeyOf("b.srt", c1));
ok("cueKeyOf 同输入稳定（重复调用同值）", t.cueKeyOf("a.srt", c1) === t.cueKeyOf("a.srt", { start: 1, end: 9 }));
ok("cueKeyOf 无文件名 → 退化 @起始秒", t.cueKeyOf("", c1) === "@1.00", t.cueKeyOf("", c1));
ok("cueKeyOf 非法 cue → 空串（不写脏键）", t.cueKeyOf("a.srt", null) === "" && t.cueKeyOf("a.srt", {}) === "");

/* noteOf：不存在一律给空串，渲染层不必再判 undefined / null */
const notes = { "a.srt@1.00": "这里连读没抓住" };
ok("noteOf 命中返回原文", t.noteOf(notes, "a.srt", c1) === "这里连读没抓住");
ok("noteOf 未命中返回空串", t.noteOf(notes, "a.srt", c2) === "");
ok("noteOf 空 notes 返回空串", t.noteOf(null, "a.srt", c1) === "");
ok("noteOf 非字符串值不冒充笔记", t.noteOf({ "a.srt@1.00": { x: 1 } }, "a.srt", c1) === "");

/* 存储键登记：漏登记会被 test-security 拦下（备份会静默丢笔记），这里给更早的失败 */
const skSrc = fs.readFileSync(path.join(JS, "storage-keys.js"), "utf8");
const secSrc = fs.readFileSync(path.join(ROOT, "tools", "test-security.js"), "utf8");
ok("subtitle.js 里笔记键字面量只有 1 处（单一来源）", count(/"fte-sub-notes-v1"/g) === 1, "n=" + count(/"fte-sub-notes-v1"/g));
ok("笔记键已在 storage-keys.js 登记（备份才会带上它）", /key:\s*"fte-sub-notes-v1"/.test(skSrc));
ok("笔记键没有被塞进 NON_STORAGE 白名单绕过门禁", secSrc.indexOf("fte-sub-notes-v1") === -1);

/* 单一数据源：列表重排只能有一个出口（原本 render + applyModeDom 两处，不得出现第三处） */
ok("列表重排仍只有 2 个既有出口（未新增 renderList）", count(/\.cues\.map\(rowHtml\)\.join\(""\)/g) === 2, "n=" + count(/\.cues\.map\(rowHtml\)\.join\(""\)/g));
ok("cueKeyOf 只有 1 个函数定义", count(/function cueKeyOf\(/g) === 1);
ok("noteOf 只有 1 个函数定义", count(/function noteOf\(/g) === 1);
ok("revealCue 复用同一重排出口（不再自己拼 innerHTML）", /function revealCue\(i\) \{[\s\S]{0,300}?refreshRows\(\)/.test(src));

/* 接线顺序：笔记控件必须先于 .sub-row 播放分支 */
const iNote = src.indexOf("const nAct = noteActionOf(e.target);");
const iRowPlay = src.indexOf('const row = e.target.closest(".sub-row");');
ok("click 委托里笔记判定先于行播放（否则点保存会顺带播放）", iNote !== -1 && iRowPlay !== -1 && iNote < iRowPlay, "note@" + iNote + " row@" + iRowPlay);
ok("keydown 排除笔记控件（Enter/Space 留给输入框，否则打不出空格）", /if \(noteActionOf\(target\)\) return;/.test(src));
ok("click 与 keydown 共用同一判定函数", count(/noteActionOf\(/g) >= 2, "n=" + count(/noteActionOf\(/g));

/* 行为与诚实边界 */
ok("每行有笔记按钮", /data-note="' \+ i \+ '"/.test(src));
ok("编辑器带字数上限（笔记是回看卡点，不是写作文）", /maxlength="' \+ NOTE_MAX \+ '"/.test(src));
ok("初始文本经 esc 转义后才进 textarea", /esc\(note\) \+ "<\/textarea>"/.test(src));
ok("保存失败时明确报错，不假承诺", /没能写入本机存储/.test(src) && /saveNotes\(\)/.test(src));
ok("换字幕不清空笔记（按 文件名+起始秒 保留）", !/state\.notes\s*=\s*\{\}/.test(src));
ok("换字幕收起编辑器", /state\.noteOpen = -1;/.test(src));

/* 最高风险分支（R1）的行为验证：点笔记按钮绝不能被当成"点这一句"。
   用最小 closest 桩模拟真实 DOM 层级（按钮在 .sub-row 里面）。 */
function el(attrs, parent) {
  return {
    attrs: attrs || {},
    parent: parent || null,
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? String(this.attrs[k]) : null; },
    closest: function (sel) {
      const names = sel.split(",").map(function (s) { return s.replace(/^\[|\]$/g, ""); });
      let n = this;
      while (n) {
        for (let i = 0; i < names.length; i++) {
          if (Object.prototype.hasOwnProperty.call(n.attrs, names[i])) return n;
        }
        n = n.parent;
      }
      return null;
    }
  };
}
ok("_t 暴露 noteActionOf（可对高风险分支做行为验证）", typeof t.noteActionOf === "function");
const rowEl = el({ "data-idx": 3 });
const aNote = t.noteActionOf(el({ "data-note": 2 }, rowEl));
ok("点 📝 按钮 → 解析为笔记动作（不会走到行播放）", aNote && aNote.act === "data-note" && aNote.idx === 2, JSON.stringify(aNote));
const aSave = t.noteActionOf(el({ "data-note-save": 2 }, rowEl));
ok("点「保存」→ 解析为保存动作", aSave && aSave.act === "data-note-save" && aSave.idx === 2, JSON.stringify(aSave));
const aDel = t.noteActionOf(el({ "data-note-del": 2 }, rowEl));
ok("点「删除」→ 解析为删除动作", aDel && aDel.act === "data-note-del", JSON.stringify(aDel));
const aInput = t.noteActionOf(el({ "data-note-input": 2 }, rowEl));
ok("点输入框 → 解析为输入框动作（不得触发行播放）", aInput && aInput.act === "data-note-input", JSON.stringify(aInput));
ok("点普通行 → null（原有行播放路径完全不受影响）", t.noteActionOf(el({ "data-idx": 3 })) === null);
ok("点生词 → null（原有查词路径不受影响）", t.noteActionOf(el({ "data-w": "price" }, rowEl)) === null);
ok("noteActionOf 容错：null / 无 closest 不抛错", t.noteActionOf(null) === null && t.noteActionOf({}) === null);

console.log("\nRESULT: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
