#!/usr/bin/env node
/* 任务2 门禁：磨耳朵播放器 + 离线音频包
   守的事：
     ① 音频包本体：100 条、逐条文件存在且字节数与 manifest 一致、mp3 帧头合法、整包 ≤12MB；
     ② 来源纪律：每条的 source key 在站内数据里真实存在，且 text 与来源逐字一致（不造句）；
     ③ 接线：index.html 加载 js/earplay.js（defer、app.js 之前）、app.js 路由白名单/渲染分支/_need、
        入口在「真实商务听音源」页内、导航仍是 18 个入口（不新增一级导航）；
     ④ 离线与预缓存纪律：**音频不进 SW 的 PRECACHE**、sw.js 的 NO_CACHE_RE 覆盖 audio/、
        播放器用独立缓存桶 fte-earpack-v1（可清除）；
     ⑤ 播放器能力：单 audio 元素、Media Session ≥4 个 action、单句/整包循环、0.8–1.2 倍速、
        15/30/60 睡眠定时、页内展示「本包 N 句 · X.XXMB · 离线可用」；
     ⑥ 纯函数行为：fmtBytes / summaryLine / nextIndex / prevIndex（门禁直测，不依赖浏览器）。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = function (p) { return fs.readFileSync(path.join(ROOT, p), "utf8"); };
let failed = 0;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) failed++;
}

const html = read("index.html");
const appjs = read("js/app.js");
const sw = read("sw.js");
const sources = read("js/sources.js");
const player = read("js/earplay.js");
const storage = read("js/storage-keys.js");
const srcDoc = JSON.parse(read("tools/audio-source.json"));
const manifest = JSON.parse(read("audio/manifest.json"));

/* ---------- ① 音频包本体 ---------- */
check("manifest 存在且 count=100", manifest.count === 100, "count=" + manifest.count);
check("manifest.items 是 100 条", Array.isArray(manifest.items) && manifest.items.length === 100);
check("manifest.voice 是已批准音色（1050 男 / 1051 女）", [1050, 1051].indexOf(Number(manifest.voice)) !== -1, String(manifest.voice));
check("manifest.sampleRate/codec 与生成参数一致（16000 / mp3）", Number(manifest.sampleRate) === 16000 && manifest.codec === "mp3");
const ids = {}, texts = {};
let sumBytes = 0, badFile = [], badMagic = [], tooBig = [];
manifest.items.forEach(function (it) {
  if (ids[it.id]) badFile.push("重复 id " + it.id); ids[it.id] = 1;
  if (texts[it.text]) badFile.push("重复文本 " + it.id); texts[it.text] = 1;
  if (!/^[a-z0-9-]+$/.test(it.id)) badFile.push("id 非法 " + it.id);
  if (!/^audio\/[a-z0-9-]+\.mp3$/.test(it.file || "")) badFile.push("file 路径非法 " + it.file);
  if (!(Number(it.bytes) > 1024)) tooBig.push(it.id + "(" + it.bytes + ")");
  if ([...String(it.text)].length > 500) badFile.push("超 500 字符 " + it.id);
  const abs = path.join(ROOT, it.file || "");
  if (!fs.existsSync(abs)) { badFile.push("缺文件 " + it.file); return; }
  const size = fs.statSync(abs).size;
  if (size !== Number(it.bytes)) badFile.push("字节数不符 " + it.id + " " + size + "≠" + it.bytes);
  sumBytes += size;
  const head = fs.readFileSync(abs).slice(0, 2);
  if (!(head[0] === 0xFF && (head[1] & 0xE0) === 0xE0)) badMagic.push(it.id);
});
check("每条都有 id/text/unit/source/file/bytes/voice", manifest.items.every(function (it) {
  return it.id && it.text && it.unit && it.source && it.file && it.bytes && it.voice;
}));
check("id / file 路径 / 长度 / 字节数逐条自洽", badFile.length === 0, badFile.slice(0, 5).join("；"));
check("mp3 文件帧头合法（0xFF 0xEx）", badMagic.length === 0, badMagic.slice(0, 5).join(", "));
check("单条都 >1KB（不是空壳）", tooBig.length === 0, tooBig.slice(0, 5).join(", "));
check("manifest.totalBytes = 各文件字节和", Number(manifest.totalBytes) === sumBytes, manifest.totalBytes + " vs " + sumBytes);
check("整包 ≤12MB（任务书上限）", sumBytes <= 12 * 1024 * 1024, (sumBytes / 1024 / 1024).toFixed(2) + "MB");
const mp3s = fs.readdirSync(path.join(ROOT, "audio")).filter(function (f) { return /\.mp3$/.test(f); });
check("audio/ 里 mp3 数量与 manifest 一致（无游离文件）", mp3s.length === manifest.items.length, mp3s.length + " 个");
check("manifest 里没有绝对路径或外链（全部站内 audio/*.mp3）", manifest.items.every(function (it) { return /^audio\//.test(it.file); }));

/* ---------- ② 来源纪律：source key 真实存在、text 逐字一致 ---------- */
const c = {
  console: console, document: { addEventListener: function () { }, getElementById: function () { return null; }, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, createElement: function () { return { style: {}, setAttribute: function () { }, appendChild: function () { } }; }, body: {}, execCommand: function () { return false; } },
  navigator: { clipboard: null, userAgent: "node" },
  localStorage: { getItem: function () { return null; }, setItem: function () { }, removeItem: function () { } },
  location: { origin: "https://example.com", pathname: "/index.html", hash: "", href: "https://example.com/" },
  setTimeout: setTimeout, clearTimeout: clearTimeout, clearInterval: clearInterval, setInterval: setInterval,
  performance: { now: function () { return Date.now(); } }, requestAnimationFrame: function (fn) { return setTimeout(fn, 0); }
};
c.window = c; c.self = c; c.globalThis = c;
const ctx = vm.createContext(c);
const loadErrs = [];
["js/data.js", "js/data-ops.js", "js/data-ocean.js", "js/data-incoterms.js", "js/data-settle.js", "js/data-risk.js",
  "js/data-deep.js", "js/data-meeting.js", "js/data-glossary.js", "js/data-mail.js", "js/sop.js"].forEach(function (f) {
  try { vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f, timeout: 20000 }); }
  catch (e) { loadErrs.push(f + ": " + e.message); }
});
check("站内数据与 sop.js 可在最小桩环境加载（用于来源解析）", loadErrs.length === 0, loadErrs.join("；"));
const DATA = vm.runInContext("(typeof FTE_DATA !== 'undefined' ? FTE_DATA : null)", ctx);
const SOP = vm.runInContext("(window.SOP && window.SOP._t) || null", ctx);

function resolve(src) {
  const i = String(src || "").indexOf(":");
  if (i < 0) return null;
  const kind = src.slice(0, i), rest = src.slice(i + 1);
  if (kind === "vocab") {
    const m = rest.match(/^U(\d+)\.(.+)$/);
    if (!m) return null;
    const u = DATA.units.filter(function (x) { return Number(x.id) === Number(m[1]); })[0];
    if (!u) return null;
    const v = (u.vocab || []).filter(function (x) { return x.w === m[2]; })[0];
    return v ? { en: v.ex, unit: "U" + u.id } : null;
  }
  if (kind === "sop") {
    if (!SOP) return null;
    if (rest.indexOf("chase.") === 0) {
      const line = (SOP.CHASE_LINES || [])[Number(rest.slice(6))];
      return line ? { en: line.en, unit: "SOP" } : null;
    }
    const m = rest.match(/^s(\d+)\.(\d+)$/);
    if (!m) return null;
    const st = (SOP.STAGES || [])[Number(m[1]) - 1];
    if (!st) return null;
    const step = (st.steps || [])[Number(m[2]) - 1];
    return step ? { en: step.en, unit: "SOP" } : null;
  }
  return null;
}
const badSrc = [];
manifest.items.forEach(function (it) {
  const r = resolve(it.source);
  if (!r) badSrc.push(it.id + "(" + it.source + ")");
  else if (String(r.en).trim() !== String(it.text).trim()) badSrc.push(it.id + " 文本与来源不一致");
  else if (r.unit !== it.unit) badSrc.push(it.id + " unit 与来源不一致");
});
check("100 条 source key 全部真实存在、text 与来源逐字一致（不造句）", badSrc.length === 0, badSrc.slice(0, 5).join("；"));
check("tools/audio-source.json 与 manifest 的 id 集合一致",
  srcDoc.items.length === manifest.items.length &&
  srcDoc.items.every(function (it) { return ids[it.id] && it.text === (manifest.items.filter(function (x) { return x.id === it.id; })[0] || {}).text; }));
const unitCount = {};
manifest.items.forEach(function (it) { unitCount[it.unit] = (unitCount[it.unit] || 0) + 1; });
check("覆盖 U1–U14 每单元 6 句 + SOP 16 句",
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].every(function (u) { return unitCount["U" + u] === 6; }) && unitCount.SOP === 16,
  JSON.stringify(unitCount));

/* ---------- ③ 接线 ---------- */
check("index.html 加载 js/earplay.js（defer、且排在 app.js 之前）",
  /<script src="js\/earplay\.js" defer><\/script>/.test(html) && html.indexOf("js/earplay.js") < html.indexOf("js/app.js"));
check("app.js 路由白名单含 earplay", /"lookup",\s*"earplay"\]/.test(appjs) || /"earplay"\]/.test(appjs));
check("app.js 有 earplay 渲染分支", /route\.view === "earplay"\) window\.EarPlay\.render\(\)/.test(appjs));
check("app.js 启动完整性校验包含 earplay.js", /_need\("磨耳朵播放器 earplay\.js"/.test(appjs));
check("入口在「真实商务听音源」页内（真链接，不是导航）", /href="#\/earplay"/.test(sources));
check("导航里没有 earplay（不新增一级导航）", !/href="#\/earplay"/.test((html.match(/<nav class="main-nav"[\s\S]*?<\/nav>/) || [])[0] || ""));
check("导航入口仍是 18 个", ((html.match(/<nav class="main-nav" id="mainNav">([\s\S]*?)<\/nav>/) || [])[1] || "").match(/<a [^>]*href="#\//g) !== null &&
  (((html.match(/<nav class="main-nav" id="mainNav">([\s\S]*?)<\/nav>/) || [])[1] || "").match(/<a [^>]*href="#\//g) || []).length === 18);

/* ---------- ④ 离线与预缓存纪律 ---------- */
const preBlock = (sw.match(/const PRECACHE = \[([\s\S]*?)\];/) || [])[1] || "";
check("音频绝不进 SW 的 PRECACHE（清单里没有 audio/ 或 .mp3）", !/audio\/|\.mp3/.test(preBlock));
check("sw.js 的 NO_CACHE_RE 已把 audio/ 排除在外壳桶外", /NO_CACHE_RE\s*=\s*\/\^\\\/\(\?:js\\\/vendor\\\/\|models\\\/\|audio\\\/\)\//.test(sw));
check("PRECACHE 已含 js/earplay.js", /"\.\/js\/earplay\.js"/.test(preBlock));
check("sw.js CACHE 已升到 ≥ fte-v137", /const CACHE = "fte-v(\d+)"/.test(sw) && parseInt((sw.match(/const CACHE = "fte-v(\d+)"/) || [])[1], 10) >= 137);
check("index.html 没有预加载/内联音频（不占首访）", !/<audio[\s\S]{0,200}audio\//.test(html) && !/<link[^>]+as="audio"/.test(html));

/* ---------- ⑤ 播放器能力 ---------- */
check("单 audio 元素（全站唯一实现，不随重渲染重复创建）", (player.match(/new Audio\(/g) || []).length === 1);
check("独立缓存桶 fte-earpack-v1（与 SW 外壳桶分开，可单独清除）",
  /CACHE_NAME = "fte-earpack-v1"/.test(player) && /caches\.open\(CACHE_NAME\)/.test(player) && /caches\.delete\(CACHE_NAME\)/.test(player));
check("下载整包走 fetch + cache.put（断点续跑：已缓存条目跳过）",
  /await fetch\(url/.test(player) && /c\.put\(url/.test(player) && /c\.match\(url\)/.test(player));
check("离线播放优先取缓存 blob（断网也能放）", /hit\.blob\(\)/.test(player) && /createObjectURL/.test(player));
const msActions = ["play", "pause", "previoustrack", "nexttrack", "stop"].filter(function (k) {
  return new RegExp(k + ":\\s*function").test(player);
});
check("Media Session action ≥4 个（播放/暂停/上一句/下一句/停止）", msActions.length >= 4, msActions.join(", "));
check("Media Session 元数据（标题/艺术家/封面）", /mediaSession\.metadata\s*=\s*new MediaMetadata/.test(player) && /artwork/.test(player));
check("单句循环 / 整包循环 / 顺序播放三种模式",
  /"one"/.test(player) && /"list"/.test(player) && /"off"/.test(player) && /🔁 整包循环/.test(player) && /🔂 单句循环/.test(player));
check("倍速 0.8–1.2（5 档，含 1.0）", /SPEEDS = \[0\.8, 0\.9, 1\.0, 1\.1, 1\.2\]/.test(player));
check("睡眠定时 15/30/60 分钟 + 到点自动暂停", /SLEEPS = \[15, 30, 60\]/.test(player) && /clearInterval/.test(player) && /audio\.pause\(\)/.test(player));
check("页内展示「本包 N 句 · X.XXMB · 离线可用」", /"本包 " \+ n \+ " 句 · "/.test(player) && /"离线可用"/.test(player));
check("音频包缓存桶已在 storage-keys.js 登记为 media / backup:false（与录音库同口径：体积大不进备份）",
  /"fte-earpack-v1"[\s\S]*?kind:\s*"media"[\s\S]*?backup:\s*false/.test(storage));
check("播放器不写 localStorage（离线包全走 CacheStorage，可整包清除）", !/localStorage/.test(player));

/* ---------- ⑥ 纯函数行为（vm 直测） ---------- */
const pc = { console: console, window: null, URL: URL, Date: Date, Math: Math, setInterval: setInterval, clearInterval: clearInterval, setTimeout: setTimeout, Promise: Promise, navigator: {}, document: { baseURI: "https://example.com/index.html" }, Audio: function () { return { addEventListener: function () { } }; } };
pc.window = pc; pc.self = pc;
const pctx = vm.createContext(pc);
let pureErr = "";
try { vm.runInContext(player, pctx, { filename: "js/earplay.js" }); } catch (e) { pureErr = e.message; }
check("earplay.js 可在最小桩环境加载（纯函数可直测）", !pureErr, pureErr);
const T = (pc.window.EarPlay && pc.window.EarPlay._t) || {};
check("EarPlay 暴露 render 与 _t 纯函数", !!(pc.window.EarPlay && pc.window.EarPlay.render && T.fmtBytes));
if (T.fmtBytes) {
  check("fmtBytes(2019312) = 1.93MB（与页内展示口径一致）", T.fmtBytes(2019312) === "1.93MB", T.fmtBytes(2019312));
  check("fmtClock(75) = 1:15", T.fmtClock(75) === "1:15", T.fmtClock(75));
  check("已全部缓存时页面显示「本包 100 句 · 1.93MB · 离线可用」",
    T.summaryLine(manifest, 100) === "本包 100 句 · 1.93MB · 离线可用", T.summaryLine(manifest, 100));
  check("未缓存时明说「未下载（在线可听）」", /未下载/.test(T.summaryLine(manifest, 0)), T.summaryLine(manifest, 0));
  const NI = T.nextIndex, PI = T.prevIndex;
  check("整包循环：最后一句 → 第 1 句", NI(99, 100, "list") === 0);
  check("顺序播放：最后一句 → -1（停下）", NI(99, 100, "off") === -1);
  check("单句循环：ended 后仍是同一句", NI(5, 100, "one") === 5 && PI(5, 100, "one") === 5);
  check("整包循环：第 1 句往前 → 最后一句", PI(0, 100, "list") === 99);
  check("顺序播放：第 1 句往前 → 第 1 句（不越界）", PI(0, 100, "off") === 0);
  check("倍速常量与 UI 一致（5 档 0.8–1.2）", Array.isArray(T.SPEEDS) && T.SPEEDS.length === 5 && T.SPEEDS[0] === 0.8 && T.SPEEDS[4] === 1.2);
  check("睡眠定时常量 15/30/60", JSON.stringify(T.SLEEPS) === JSON.stringify([15, 30, 60]));
}

console.log("\n=== " + (failed ? "有断言失败（" + failed + "）" : "全部通过") + " ===");
process.exit(failed ? 1 : 0);
