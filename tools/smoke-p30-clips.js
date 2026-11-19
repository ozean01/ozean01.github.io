/* 真机烟测（P30）：「音块打点 + 片段库」的完整链路，跑在**真实 Chrome/Edge** 里。
   为什么需要它（而不是再加一条纯逻辑门禁）：
     纯逻辑门禁测不到「fetch(blob:) 被 CSP 挡掉」这一类失败——它会安静地走进降级分支，
     看起来像"这个文件没音轨"。本脚本 2026-11-19 首次运行就抓到过一次（见 README §8-2 的 CSP 注）。
   运行：node tools/smoke-p30-clips.js        （无头 Chrome，自动起本地静态服务与临时 profile）
        CHROME_PATH=/path/to/chrome node tools/smoke-p30-clips.js   （自定义浏览器）
   纪律：**不接入 npm test**（零依赖原则下不引 jsdom/puppeteer），与 tools/smoke-subtitle.html 同档；
        找不到浏览器时打印「跳过」并 exit 0，不把环境缺失当成失败。 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.SMOKE_PORT || 8791);
const PROFILE = path.join(os.tmpdir(), "dsh-p30-profile-" + Date.now());
const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
].filter(Boolean);
const CHROME = CANDIDATES.find(function (p) { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!CHROME) {
  console.log("↩︎ 跳过：本机没有找到 Chrome/Edge。可用 CHROME_PATH=<可执行文件> 指定后重跑。");
  process.exit(0);
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".mp3": "audio/mpeg" };

const server = http.createServer(function (req, res) {
  const u = decodeURIComponent(req.url.split("?")[0]);
  const p = path.join(ROOT, u === "/" ? "index.html" : u);
  fs.readFile(p, function (e, buf) {
    if (e) { res.writeHead(404); res.end("404"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" });
    res.end(buf);
  });
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function httpJson(port, p) {
  return new Promise(function (res, rej) {
    const req = http.get("http://127.0.0.1:" + port + p, function (r) {
      let d = ""; r.on("data", c => d += c); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    });
    req.on("error", rej);
    req.setTimeout(3000, () => { req.destroy(new Error("timeout")); });
  });
}
function readPort() {
  const f = path.join(PROFILE, "DevToolsActivePort");
  if (!fs.existsSync(f)) return 0;
  try { return parseInt(String(fs.readFileSync(f, "utf8")).split("\n")[0], 10) || 0; } catch (e) { return 0; }
}

(async function () {
  await new Promise(r => server.listen(PORT, r));
  const chrome = cp.spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-background-networking",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=0", "--user-data-dir=" + PROFILE,
    "about:blank"
  ], { stdio: "ignore" });

  let devPort = 0;
  for (let i = 0; i < 80; i++) { devPort = readPort(); if (devPort) break; await sleep(250); }
  if (!devPort) { console.log("FAIL Chrome 未起来（DevToolsActivePort 没有）"); try { chrome.kill(); } catch (e) {} server.close(); process.exit(1); }

  let tabs = null;
  for (let i = 0; i < 40; i++) {
    try { tabs = await httpJson(devPort, "/json/list"); if (tabs && tabs.length) break; } catch (e) { /* wait */ }
    await sleep(250);
  }
  if (!tabs) { console.log("FAIL 无法连接 Chrome 调试端口 " + devPort); try { chrome.kill(); } catch (e) {} server.close(); process.exit(1); }
  const target = tabs.find(t => t.type === "page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = function (ev) {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") logs.push("console.error: " + JSON.stringify(m.params.args.map(a => a.value || a.description)));
    if (m.method === "Runtime.exceptionThrown") logs.push("exception: " + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
  };
  function send(method, params) {
    return new Promise(function (res) {
      const id = ++seq;
      pending.set(id, res);
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  }
  async function ev(expr) {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { err: JSON.stringify(r.result.exceptionDetails) };
    return { val: r.result && r.result.result ? r.result.result.value : undefined };
  }

  await new Promise(function (res, rej) {
    if (ws.readyState === 1) return res();
    ws.addEventListener("open", res, { once: true });
    setTimeout(function () { if (ws.readyState !== 1) rej(new Error("WebSocket 握手超时")); }, 8000);
  });
  setTimeout(function () { console.log("FAIL 全局超时（90s）——脚本挂住"); process.exit(2); }, 90000);
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:" + PORT + "/#/subtitle" });
  await sleep(3500);

  const out = [];
  function ok(name, cond, info) { out.push((cond ? "PASS " : "FAIL ") + name + (info ? "  → " + info : "")); return cond; }

  /* ① 页面与模块就绪 */
  let r = await ev("({has: !!window.Subtitle, cues: document.querySelectorAll('#app .sub-row').length, clip: !!document.getElementById('diClipCard'), wave: !!document.getElementById('diWave')})");
  ok("字幕页渲染（模块 + 音块卡片 + 波形画布）", r.val && r.val.has && r.val.clip && r.val.wave, JSON.stringify(r.val));

  /* ② 造 6 秒 440Hz 正弦 WAV 作为真实媒资 + 两句字幕，走模块自己的 render() */
  await ev(`(async function(){
    const sr = 8000, sec = 6, n = sr * sec;
    const buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); ws(8, "WAVE"); ws(12, "fmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    ws(36, "data"); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.sin(i / sr * 2 * Math.PI * 440) * 9000, true);
    const url = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
    const S = window.Subtitle.state;
    S.cues = [
      { start: 0, end: 3.4, en: "Could you send me the thickness spec?", zh: "", text: "Could you send me the thickness spec?" },
      { start: 3.6, end: 6, en: "We need the coating weight too.", zh: "", text: "We need the coating weight too." }
    ];
    S.fileName = "demo.srt";
    S.mediaUrl = url; S.mediaRemote = false; S.current = 0; S.marks = null;
    try { localStorage.removeItem("fte-seg-clips-v1"); } catch (e) {}
    S.clips = {};
    window.Subtitle.render();
    const v = document.getElementById("diMedia");
    await new Promise(function(res){ if (v.readyState >= 1) return res(); v.addEventListener("loadedmetadata", res, { once: true }); v.load(); });
    return { dur: v.duration, rows: document.querySelectorAll("#app .sub-row").length };
  })()`).then(x => ok("真实媒资载入（WAV 6 秒）+ 两句字幕", x.val && Math.abs(x.val.dur - 6) < 0.2 && x.val.rows === 2, JSON.stringify(x)));

  /* ③ 波形解码（唯一绘制实现）返回 true，且高亮带 = 整句 */
  await sleep(1200);
  r = await ev("document.getElementById('diWaveNote').textContent");
  ok("原声波形画出（不是「解不出音轨」）", r.val && r.val.indexOf("解不出音轨") === -1 && r.val.indexOf("灰色") === 0, String(r.val));

  /* ④ 打点：设 A=1.0s、设 B=2.5s（走真实按钮 click 委托） */
  await ev(`(function(){ const v = document.getElementById("diMedia"); v.currentTime = 1.0; return v.currentTime; })()`);
  await sleep(300);
  await ev(`document.querySelector('[data-clip="markA"]').click()`);
  await ev(`(function(){ const v = document.getElementById("diMedia"); v.currentTime = 2.5; return v.currentTime; })()`);
  await sleep(300);
  await ev(`document.querySelector('[data-clip="markB"]').click()`);
  await sleep(400);
  r = await ev("JSON.stringify(window.Subtitle.state.marks)");
  const marks = JSON.parse(r.val || "null");
  ok("设 A / 设 B 落到 state.marks（秒）", marks && Math.abs(marks.a - 1.0) < 0.15 && Math.abs(marks.b - 2.5) < 0.15, r.val);

  /* ⑤ 波形文案变成「橙色 A/B + 窗口秒数」，A-B 按钮改名 */
  r = await ev("document.getElementById('diWaveNote').textContent");
  ok("波形文案切到「橙色 = 你打的 A/B」", r.val && r.val.indexOf("橙色") === 0, String(r.val));
  r = await ev("document.querySelector('#app [data-pl=\"ab\"]').textContent");
  ok("A-B 按钮改名为「复读这一小段（A→B）」", r.val && r.val.indexOf("这一小段") >= 0, String(r.val));

  /* ⑥ 循环窗口 = A→B（不是整句） */
  await ev(`document.querySelector('#app [data-pl="ab"]').click()`);
  await sleep(600);
  r = await ev("JSON.stringify(window.Subtitle.state.ab)");
  const ab = JSON.parse(r.val || "null");
  ok("A-B 窗口 = A→B（1.0–2.5，不是 0–3.4）", ab && Math.abs(ab.a - 1.0) < 0.15 && Math.abs(ab.b - 2.5) < 0.15, r.val);
  r = await ev("document.getElementById('diMedia').currentTime");
  ok("播放头被拉到 A 点", r.val >= 0.9 && r.val <= 2.6, String(r.val));

  /* ⑦ 存片段 → 落库 → 列表出现 1 行 */
  await ev(`document.querySelector('[data-clip="save"]').click()`);
  await sleep(400);
  r = await ev(`JSON.stringify({ store: JSON.parse(localStorage.getItem("fte-seg-clips-v1") || "null"), rows: document.querySelectorAll("#app .sub-clip").length, sum: document.getElementById("diClipSum").textContent })`);
  const saved = JSON.parse(r.val || "null");
  const rec = saved && saved.store && saved.store["demo.srt@0.00"];
  ok("片段写入 localStorage（键 = 文件名@起始秒）", !!(rec && Math.abs(rec.a - 1.0) < 0.15 && Math.abs(rec.b - 2.5) < 0.15), JSON.stringify(saved && saved.store));
  ok("片段列表出现 1 行 + 计数文案", saved && saved.rows === 1 && /本集 1 条/.test(saved.sum), JSON.stringify(saved && { rows: saved.rows, sum: saved.sum }));

  /* ⑧ 复位 → 回到整句；再点片段 ▶ → 回到 A→B 并循环 */
  await ev(`document.querySelector('[data-clip="reset"]').click()`);
  await sleep(200);
  r = await ev("JSON.stringify(window.Subtitle.state.marks)");
  ok("「↺ 复位整句」清掉打点", r.val === "null", String(r.val));
  await ev(`document.querySelector('#app .sub-clip [data-clip="play"]').click()`);
  await sleep(600);
  r = await ev(`JSON.stringify({ marks: window.Subtitle.state.marks, ab: window.Subtitle.state.ab, plays: (JSON.parse(localStorage.getItem("fte-seg-clips-v1"))["demo.srt@0.00"]||{}).plays })`);
  const again = JSON.parse(r.val || "null");
  ok("点片段 ▶ 恢复 A→B 并开启循环 + 命中次数 +1", again && again.ab && Math.abs(again.ab.a - 1.0) < 0.15 && again.plays === 1, r.val);

  /* ⑨ 跨句容错：切到第 2 句应清掉第 1 句的打点 */
  await ev(`document.querySelectorAll("#app .sub-row")[1].click()`);
  await sleep(300);
  r = await ev("JSON.stringify({ marks: window.Subtitle.state.marks, cur: window.Subtitle.state.current })");
  const jump = JSON.parse(r.val || "null");
  ok("换句清掉上一句打点（不会两句拼一段）", jump && jump.cur === 1 && jump.marks === null, r.val);

  /* ⑩ 无媒资时诚实：清掉 mediaUrl 后打点应被拒绝并说明 */
  await ev(`(function(){ window.Subtitle.state.mediaUrl = null; window.Subtitle.state.mediaRemote = false; window.Subtitle.state.current = 0; window.Subtitle.state.marks = null; window.Subtitle.render(); })()`);
  await sleep(500);
  await ev(`document.querySelector('[data-clip="markA"]').click()`);
  await sleep(200);
  r = await ev("JSON.stringify({ marks: window.Subtitle.state.marks, toast: (document.getElementById('toast')||{}).textContent || '' })");
  const nm = JSON.parse(r.val || "null");
  ok("无媒资时不假装能打点（明确说明 + 不打点）", nm && nm.marks === null && /TTS 朗读没有时间轴可抠/.test(nm.toast), r.val);

  ok("全程无 console.error / 未捕获异常", logs.length === 0, logs.slice(0, 3).join(" | "));

  /* 可选：留一张截图给人看（SMOKE_SHOT=<路径>），默认不写文件。
     刻意重造一份干净状态（真实 WAV + 两句 + 打点 + 已存片段），避免把测试过程里的 toast 带进图里。 */
  if (process.env.SMOKE_SHOT) {
    await ev(`(async function(){
      const sr = 8000, sec = 6, n = sr * sec;
      const buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
      const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
      ws(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); ws(8, "WAVE"); ws(12, "fmt ");
      dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
      dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
      ws(36, "data"); dv.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.sin(i / sr * 2 * Math.PI * 330) * 9000, true);
      const S = window.Subtitle.state;
      S.cues = [
        { start: 0, end: 3.4, en: "Could you send me the thickness spec?", zh: "", text: "Could you send me the thickness spec?" },
        { start: 3.6, end: 6, en: "We need the coating weight too.", zh: "", text: "We need the coating weight too." }
      ];
      S.fileName = "demo.srt";
      S.mediaUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
      S.mediaRemote = false; S.current = 0; S.marks = { idx: 0, a: 1.0, b: 2.5 };
      window.Subtitle.render();
      const v = document.getElementById("diMedia");
      await new Promise(function(res){ if (v.readyState >= 1) return res(); v.addEventListener("loadedmetadata", res, { once: true }); v.load(); });
      document.querySelector('#app [data-pl="ab"]').click();
      const t = document.getElementById("toast"); if (t) t.hidden = true;
      return true;
    })()`);
    await sleep(1800);
    await ev(`(function(){ const el = document.getElementById("diClipCard"); if (el) el.scrollIntoView({ block: "center" }); const t = document.getElementById("toast"); if (t) t.hidden = true; return true; })()`);
    await sleep(400);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    if (shot.result && shot.result.data) {
      fs.writeFileSync(process.env.SMOKE_SHOT, Buffer.from(shot.result.data, "base64"));
      console.log("SHOT " + process.env.SMOKE_SHOT);
    }
  }

  console.log(out.join("\n"));
  const fails = out.filter(l => l.startsWith("FAIL")).length;
  console.log("\nRESULT: pass=" + (out.length - fails) + " fail=" + fails);

  try { ws.close(); } catch (e) {}
  try { chrome.kill(); } catch (e) {}
  try { server.close(); } catch (e) {}
  process.exit(fails ? 1 : 0);
})().catch(function (e) {
  console.log("FAIL 脚本异常：" + (e && e.stack || e));
  try { server.close(); } catch (_) {}
  process.exit(1);
});
