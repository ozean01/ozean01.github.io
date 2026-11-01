#!/usr/bin/env node
/* 播客导入（第 1 批）门禁：
   A. 纯函数（在 vm 里加载 js/podcast.js，不碰 DOM / 网络）
      · RSS 2.0 解析：title / item / enclosure / pubDate / 去 HTML / transcript
      · Atom 解析：entry / link rel=alternate / link rel=enclosure
      · 非 feed 返回 null（调用方据此提示）
      · URL 分类：rss / episode / audio / subtitle / unknown
      · 单集页面提取音频直链与标题
      · 跨域判定
   B. 源码纪律
      · 无字幕明确提示文案、跨域波形禁用文案（含原因）
      · subtitle.js：远程媒资 → remoteNotice + 波形禁用守卫 + loadRemote 出口
      · 无内联事件、无内联 <script>；index.html 以 defer 外链加载
      · PRECACHE 含 ./js/podcast.js 且不含任何音频（mp3/m4a/…）
      · 抓取顺序：直接 fetch 优先，r.jina.ai 兜底
      · podcast.js 不写 localStorage（本批不新增存储键） */
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

/* ---------- 加载 podcast.js（window 桩） ---------- */
const src = fs.readFileSync(path.join(ROOT, "js", "podcast.js"), "utf8");
const ctx = { window: {}, console: console, URL: URL };
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: "js/podcast.js" });
const P = ctx.window.Podcast;
check("podcast.js 导出 window.Podcast.mount 与纯函数 _t", !!(P && typeof P.mount === "function" && P._t));
const T = (P && P._t) || {};

/* ---------- A1. RSS 2.0 解析 ---------- */
const RSS = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">' +
  '<channel><title><![CDATA[Trade Talk Weekly]]></title>' +
  '<item><title>Episode 12: Retort pouches</title>' +
  '<link>https://example.com/ep12</link>' +
  '<pubDate>Mon, 02 Jun 2025 09:00:00 GMT</pubDate>' +
  '<description><![CDATA[<p>Retort &amp; shelf life &mdash; with <b>BOPA</b>.</p>]]></description>' +
  '<enclosure url="https://cdn.example.com/audio/ep12.mp3" type="audio/mpeg" length="12345"/>' +
  '<itunes:duration>23:45</itunes:duration>' +
  '<podcast:transcript url="https://example.com/ep12.vtt" type="text/vtt"/>' +
  '</item>' +
  '<item><title>Episode 13: Adhesive mixing</title>' +
  '<pubDate>Tue, 03 Jun 2025 09:00:00 GMT</pubDate>' +
  '<description>No audio here.</description>' +
  '</item>' +
  '</channel></rss>';
const feed = T.parseFeed(RSS);
check("RSS：解析出 channel 标题", !!feed && feed.title === "Trade Talk Weekly", feed && feed.title);
check("RSS：解析出 2 个 item", !!feed && feed.items.length === 2, feed && String(feed.items.length));
check("RSS：enclosure 取到音频直链", !!feed && /ep12\.mp3$/.test(feed.items[0].audioUrl), feed && feed.items[0].audioUrl);
check("RSS：日期归一为 YYYY-MM-DD", !!feed && feed.items[0].date === "2025-06-02", feed && feed.items[0].date);
check("RSS：description 去 HTML 且解实体", !!feed && feed.items[0].desc.indexOf("<") === -1 && feed.items[0].desc.indexOf("Retort & shelf life") === 0, feed && feed.items[0].desc);
check("RSS：podcast:transcript 被抓到", !!feed && /ep12\.vtt$/.test(feed.items[0].transcriptUrl), feed && feed.items[0].transcriptUrl);
check("RSS：无 enclosure 的集 audioUrl 为空（不瞎猜）", !!feed && feed.items[1].audioUrl === "");
check("非 feed 文本 → parseFeed 返回 null", T.parseFeed("<html><body>not a feed</body></html>") === null);

/* ---------- A2. Atom 解析 ---------- */
const ATOM = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Cast</title>' +
  '<entry><title>Ep 1</title><link rel="alternate" href="https://example.org/1"/>' +
  '<link rel="enclosure" type="audio/mpeg" href="https://example.org/a/1.mp3"/>' +
  '<updated>2025-07-01T10:00:00Z</updated><summary>Hello</summary></entry></feed>';
const atom = T.parseFeed(ATOM);
check("Atom：解析出 entry 与 enclosure 直链", !!atom && atom.items.length === 1 && /1\.mp3$/.test(atom.items[0].audioUrl), atom && atom.items[0].audioUrl);
check("Atom：日期归一", !!atom && atom.items[0].date === "2025-07-01", atom && atom.items[0].date);

/* ---------- A3. URL 分类 ---------- */
const cases = [
  ["https://example.com/feed.xml", "rss"],
  ["https://example.com/rss", "rss"],
  ["https://example.com/podcast/feed/", "rss"],
  ["https://example.com/show?feed=rss", "rss"],
  ["https://podcasts.apple.com/us/podcast/trade-talk/id1234567890", "rss"],
  ["https://cdn.example.com/a/ep12.mp3", "audio"],
  ["https://cdn.example.com/a/ep12.m4a?token=abc", "audio"],
  ["https://example.com/subs/ep12.vtt", "subtitle"],
  ["https://example.com/subs/ep12.srt", "subtitle"],
  ["https://example.com/episode/12", "episode"],
  ["ftp://example.com/a.mp3", "unknown"],
  ["not a url", "unknown"]
];
cases.forEach(function (c) {
  const got = T.classifyUrl(c[0]);
  check("URL 分类：" + c[0] + " → " + c[1], got === c[1], got === c[1] ? "" : "实际 " + got);
});

/* ---------- A4. 单集页面提取 ---------- */
const PAGE = "# My Show — Ep 5\n\nListen here: https://cdn.example.com/x/ep5.m4a?x=1\n";
check("单集页面：提取音频直链", T.pickAudioUrlFromHtml(PAGE).indexOf("ep5.m4a") !== -1, T.pickAudioUrlFromHtml(PAGE));
check("单集页面：提取标题（markdown 一级标题）", T.pickTitleFromHtml(PAGE) === "My Show — Ep 5", T.pickTitleFromHtml(PAGE));
check("单集页面：无音频时返回空串", T.pickAudioUrlFromHtml("just text, no media") === "");

/* ---------- A5. 跨域判定 ---------- */
const BASE = "https://ozean01.github.io/index.html";
check("跨域判定：同源为 false", T.isCrossOrigin("https://ozean01.github.io/audio/a.mp3", BASE) === false);
check("跨域判定：其它域为 true", T.isCrossOrigin("https://cdn.example.com/a.mp3", BASE) === true);
check("跨域判定：无 base 时保守为 true", T.isCrossOrigin("https://cdn.example.com/a.mp3", "") === true);

/* ---------- A6. 混合内容防护：https 页面把 http 音频升到 https ---------- */
check("http 音频在 https 页面升级为 https（混合内容防护）",
  T.normalizeAudioUrl("http://open.live.bbc.co.uk/a.mp3") === "https://open.live.bbc.co.uk/a.mp3",
  T.normalizeAudioUrl("http://open.live.bbc.co.uk/a.mp3"));
check("https 音频保持不变", T.normalizeAudioUrl("https://cdn.example.com/a.mp3") === "https://cdn.example.com/a.mp3");
check("空值返回空串", T.normalizeAudioUrl("") === "");

/* ---------- B. 源码纪律 ---------- */
check("无字幕集有明确提示文案（不假装有字幕）",
  !!P && /没有公开字幕/.test(P.NO_SUB_NOTICE) && /不会假装逐句同步/.test(P.NO_SUB_NOTICE));
check("跨域波形禁用文案写明原因（CORS）",
  !!P && /波形已禁用/.test(P.XO_WAVE_NOTICE) && /跨域/.test(P.XO_WAVE_NOTICE) && /CORS/.test(P.XO_WAVE_NOTICE));
check("podcast.js 无内联事件处理器", !/\son(click|change|input|submit|keydown|load|error)\s*=\s*["']/i.test(src));
check("podcast.js 无内联 <script>", !/<script\b/i.test(src));
check("podcast.js 不写 localStorage（本批不新增存储键）", src.indexOf("localStorage.") === -1);
check("抓取顺序：直接 fetch 在前，r.jina.ai 在后",
  src.indexOf("fetch(url") !== -1 && src.indexOf("fetch(url") < src.indexOf("WS_URL + encodeURIComponent"));
check("抓取彻底失败时给可执行下一步（RSS / 音频直链），不留空列表",
  /页面抓取失败（直连与 r\.jina\.ai 都没成功）/.test(src) && /订阅源抓取失败/.test(src));

const sub = fs.readFileSync(path.join(ROOT, "js", "subtitle.js"), "utf8");
check("subtitle.js 暴露 loadRemote 供播客载入", /window\.Subtitle = \{ render: render, loadRemote: loadRemote/.test(sub));
check("subtitle.js 远程媒资置 remoteNotice（无字幕提示落点）", /state\.remoteNotice = cues\.length \? "" :/.test(sub));
check("subtitle.js 波形守卫：远程媒资不解码、写明原因", /if \(s\.mediaRemote\) \{[\s\S]{0,200}XO_WAVE_NOTICE/.test(sub));
check("subtitle.js 挂载播客入口（同一页，不新增路由）", /window\.Podcast\.mount\(document\.getElementById\("podcastEntry"\)\)/.test(sub));
check("subtitle.js 音频加载失败不静默（给出可能原因）", /音频加载失败/.test(sub));

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
check("index.html 以 defer 外链加载 js/podcast.js", /<script src="js\/podcast\.js" defer><\/script>/.test(html));
check("index.html 未在播客相关处引入内联脚本", !/<script(?![^>]*\bsrc=)[^>]*>[\s\S]{0,80}Podcast/i.test(html));
check("设置页「数据去向」补了播客 → r.jina.ai 一行", /播客导入（RSS 订阅源 \/ 单集页面）/.test(html) && html.indexOf("r.jina.ai") !== -1);
check("CSP 的 media-src 允许远程 https 音频（否则远程播客被静默拦成 ERR 4）",
  /media-src[^;]*https:/.test(html));

const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const pre = (sw.match(/const PRECACHE = \[([\s\S]*?)\];/) || [])[1] || "";
check("PRECACHE 含 ./js/podcast.js", /"\.\/js\/podcast\.js"/.test(pre));
check("PRECACHE 不含任何音频文件（mp3/m4a/aac/ogg/wav）", !/\.(mp3|m4a|aac|ogg|wav|opus|flac)["']/i.test(pre));

check("app.js 的 _need 声明了 podcast.js（缺脚本会点名）", /_need\("播客导入 podcast\.js"/.test(fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8")));

console.log("\n" + (fail ? "=== 有断言失败 ===" : "=== 全部通过 ===") + "  pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
