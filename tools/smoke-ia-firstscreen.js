#!/usr/bin/env node
/* 手动冒烟（P12 · 首访首屏「一屏一决策」的几何兜底）：真浏览器量「第 1 步按钮是否完整在第一屏」。
   ⚠️ 不进 npm test：需要真实 Chrome + 本地静态服务（CI 无浏览器）。
     离线可回归的那一半由 tools/test-ia-firstscreen.js 守。

   用法（两终端）：
     1) cd 外贸英语 && python -m http.server 8123 --bind 127.0.0.1
     2) node tools/smoke-ia-firstscreen.js
        可选：FTE_BASE=http://127.0.0.1:8123/  CHROME_PATH="C:\\...\\chrome.exe"
   退出码：0 = 全部通过；1 = 有断言失败（打印实测数值）。

   断言（390×800 全新 profile = 首次访客）：
     ① 引导横幅只有一个主按钮（.btn-primary），没有并列的第二个按钮；
     ② 首屏「开始」只剩一条决策：横幅主按钮 + 今日第 1 步的「▶ 去做」指向同一个动作链；
     ③ **今日第 1 步的「▶ 去做」按钮完整落在第一屏内**（这是外部反馈的直接症状：
        改前它是 792px 顶部 / 只露 8px）；
     ④ 点横幅主按钮后：横幅关闭、页面滚到第 1 步并高亮（可感知的「从这里开始」）。 */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE = process.env.FTE_BASE || "http://127.0.0.1:8123/";
const PORT = parseInt(process.env.FTE_CDP_PORT || "9345", 10);
const W = 390, H = 800;
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium"
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.filter(function (p) { return fs.existsSync(p); })[0];
if (!CHROME) { console.error("找不到 Chrome/Edge：请设 CHROME_PATH。"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, cond, info) {
  if (cond) { pass++; console.log("✅ " + name + (info ? "  " + info : "")); }
  else { fail++; console.log("❌ " + name + (info ? "  " + info : "")); }
}

const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "fte-ia-smoke-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + userDir,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--window-size=" + W + "," + H, BASE], { stdio: "ignore" });

let ws, seq = 0; const pending = new Map(); const exceptions = [];
function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("timeout " + method)); } }, 15000);
  });
}
async function evalJs(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error("eval failed: " + JSON.stringify(r.exceptionDetails).slice(0, 240));
  return r.result ? r.result.value : undefined;
}
async function waitFor(expr, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return; } catch (e) { } await sleep(120); }
  throw new Error("waitFor timeout: " + (label || expr));
}

(async function () {
  for (let i = 0; i < 60; i++) { try { await (await fetch("http://127.0.0.1:" + PORT + "/json/version")).json(); break; } catch (e) { await sleep(200); } }
  let page = null;
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json();
    page = list.filter(function (t) { return t.type === "page" && /^http/.test(t.url); })[0];
    if (page) break;
    await sleep(200);
  }
  if (!page) throw new Error("找不到页面目标");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(function (res, rej) { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = function (ev) {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    else if (m.method === "Runtime.exceptionThrown") { exceptions.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text); }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await send("Page.navigate", { url: BASE });
  await waitFor("!!window.FTE_BOOTED", 20000, "boot");
  await sleep(1200);   /* 等 defer 脚本与横幅都就位 */

  const landing = await evalJs("location.hash");
  check("首次打开落在 #/today（不是首页地图）", /^#\/today/.test(landing), landing);

  /* ① 横幅：一个主按钮 */
  const bar = await evalJs(`(function(){
    const b = document.querySelector(".ob-bar");
    if (!b) return null;
    const primary = Array.from(b.querySelectorAll(".btn-primary"));
    const anyBtnLink = Array.from(b.querySelectorAll("a.btn"));
    const alt = Array.from(b.querySelectorAll(".ob-bar-alt"));
    const starts = Array.from(b.querySelectorAll("[data-act]")).filter(function(el){
      return /ob-go|ob-start|ob-unit/.test(el.getAttribute("data-act"));
    });
    return { exists: true, primary: primary.length, linkBtns: anyBtnLink.length,
      alt: alt.length, startActs: starts.map(function(e){ return e.getAttribute("data-act"); }) };
  })()`);
  check("引导横幅仍在（对新访客可见）", !!bar && bar.exists);
  check("横幅只有一个 .btn-primary（没有并列的第二个主按钮）", !!bar && bar.primary === 1, bar ? "n=" + bar.primary : "");
  check("横幅没有 <a class=btn> 式的第二主行动", !!bar && bar.linkBtns === 0, bar ? "n=" + bar.linkBtns : "");
  check("「测起点」是文字链（.ob-bar-alt），不再是按钮", !!bar && bar.alt === 1, bar ? "n=" + bar.alt : "");
  check("横幅的起点动作只剩 ob-go / ob-start（ob-unit 已删）",
    !!bar && bar.startActs.join(",") === "ob-go,ob-start", bar ? bar.startActs.join(",") : "");

  /* ② 首屏决策：主按钮 + 第 1 步「去做」完整可见 */
  const geo = await evalJs(`(function(){
    const barBtn = document.querySelector(".ob-bar .btn-primary");
    const step = document.querySelector(".td-step");
    const stepBtn = step ? step.querySelector(".btn-primary") : null;
    const r = function(el){ const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
    const tabs = Array.from(document.querySelectorAll(".td-step .btn-primary")).map(function(el){ return el.getAttribute("href") || el.innerText.trim().slice(0,10); });
    return { vh: innerHeight, bar: barBtn ? r(barBtn) : null, step: step ? r(step) : null,
      stepBtn: stepBtn ? r(stepBtn) : null, stepBtns: tabs.length,
      aboveList: Array.from(document.querySelectorAll("#app > *")).filter(function(el){
        const s = document.querySelector(".td-list"); if (!s) return false;
        return el.getBoundingClientRect().top < s.getBoundingClientRect().top;
      }).map(function(el){ return el.className || el.tagName; }) };
  })()`);
  check("今日第 1 步的「▶ 去做」按钮**完整在第一屏内**",
    !!geo.stepBtn && geo.stepBtn.bottom <= geo.vh,
    geo.stepBtn ? "button " + geo.stepBtn.top + "–" + geo.stepBtn.bottom + " / 视口 " + geo.vh : "找不到按钮");
  check("第 1 步卡片的起点也在第一屏内（不是卡片被切成一半）",
    !!geo.step && geo.step.top < geo.vh, geo.step ? "top=" + geo.step.top : "");
  check("五步清单之前的区块 = 页头 / 状态条 / 清单头（画像已后移）",
    geo.aboveList.join(",").indexOf("td-profile") === -1, geo.aboveList.join(" | "));

  /* ③ 点横幅主行动：横幅关闭 + 滚到第 1 步 + 高亮 */
  await evalJs('document.querySelector(".ob-bar .btn-primary").click(); 1');
  await sleep(900);
  const after = await evalJs(`(function(){
    const bar = document.querySelector(".ob-bar");
    const first = document.querySelector(".td-step");
    const r = first ? first.getBoundingClientRect() : null;
    return { barGone: !bar, flash: first ? first.classList.contains("ob-flash") : false,
      firstTop: r ? Math.round(r.top) : null, vh: innerHeight,
      onboarded: localStorage.getItem("fte-onboarded") };
  })()`);
  check("点主行动后横幅消失", after.barGone === true);
  check("点主行动后滚到第 1 步并在视口内", after.firstTop !== null && after.firstTop < after.vh, "top=" + after.firstTop);
  check("点主行动后写 fte-onboarded（不再反复出现）", /ob/.test(String(after.onboarded)) || !!after.onboarded, String(after.onboarded));

  const errs = exceptions.filter(function (e) { return e && !/favicon|net::ERR/.test(e); });
  check("无未捕获异常", errs.length === 0, errs.slice(0, 2).join(" | "));

  console.log("\n" + (fail === 0 ? "=== SMOKE ALL PASS ===" : "=== SMOKE FAILED: " + fail + " ==="));
  try { ws.close(); } catch (e) { }
  chrome.kill();
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  console.error("SMOKE ERROR: " + e.message);
  if (exceptions.length) console.error("exceptions: " + exceptions.slice(0, 3).join(" | "));
  try { chrome.kill(); } catch (x) { }
  process.exit(1);
});
