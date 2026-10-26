#!/usr/bin/env node
/* 手动冒烟（P11）：在真实 Chrome 里验证「段级间隔复听 + 阶段内断点续学」全链路。
   ⚠️ 本脚本**不进 npm test**：它需要真实 Chrome + 一个本地静态服务器（浏览器冒烟不属于离线门禁）。
   —— 离线可跑的口径由 tools/test-seg-review.js 守，两者互补：门禁守逻辑与接线，本脚本守「真能点」。

   用法（两终端）：
     1) 起静态服务：  cd 外贸英语 && python -m http.server 8123 --bind 127.0.0.1
     2) 跑冒烟：      node tools/smoke-seg-review.js
        可选：FTE_BASE=http://127.0.0.1:8123/  CHROME_PATH="C:\...\chrome.exe"
   退出码：0 = 全部通过；1 = 有断言失败（会打印 ❌ 与当时的页面片段）。

   覆盖：今日第 3 步到期优先且仍是 5 步 → 深链预选并默认五阶段 → 走完五阶段记第 1/7 轮（+18h）
        → 立刻重练只算「提前练」不推进 → 断点续学落在②第 6 句并提示 → 无未捕获异常 / 无启动缺模块。 */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE = process.env.FTE_BASE || "http://127.0.0.1:8123/";
const PORT = parseInt(process.env.FTE_CDP_PORT || "9333", 10);
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium"
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.filter(function (p) { return fs.existsSync(p); })[0];
if (!CHROME) {
  console.error("找不到 Chrome/Edge：请设 CHROME_PATH 或安装 Chrome。");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, cond, info) {
  if (cond) { pass++; console.log("✅ " + name + (info ? "  " + info : "")); }
  else { fail++; console.log("❌ " + name + (info ? "  " + info : "")); }
}

const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "fte-smoke-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + userDir,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--window-size=430,900", BASE + "#/today"
], { stdio: "ignore" });

let ws, seq = 0;
const pending = new Map();
const exceptions = [];
const consoleErrors = [];
const bootWarns = [];

function send(method, params) {
  return new Promise(function (resolve, reject) {
    const id = ++seq;
    pending.set(id, { resolve: resolve, reject: reject });
    ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    setTimeout(function () { if (pending.has(id)) { pending.delete(id); reject(new Error("timeout " + method)); } }, 15000);
  });
}
async function evalJs(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error("eval failed: " + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result ? r.result.value : undefined;
}
async function waitFor(expr, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await evalJs(expr)) return true; } catch (e) { /* 页面可能在导航 */ }
    await sleep(120);
  }
  throw new Error("waitFor timeout: " + (label || expr));
}
async function goto(hash) {
  await send("Page.navigate", { url: BASE + hash });
  await waitFor("!!window.FTE_BOOTED", 15000, "boot " + hash);
  await sleep(250);
}
/* 种完 localStorage 必须真的重载：同一 URL（含同一 hash）再 navigate 不会重新渲染 */
async function reload() {
  await send("Page.reload", { ignoreCache: true });
  await sleep(600);
  await waitFor("!!window.FTE_BOOTED", 20000, "reload");
  await sleep(300);
}

(async function main() {
  let version = null;
  for (let i = 0; i < 60; i++) {
    try { version = await (await fetch("http://127.0.0.1:" + PORT + "/json/version")).json(); break; }
    catch (e) { await sleep(200); }
  }
  if (!version) throw new Error("Chrome DevTools 未就绪");
  let page = null;
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json();
    page = list.filter(function (t) { return t.type === "page"; })[0];
    if (page) break;
    await sleep(200);
  }
  if (!page) throw new Error("找不到页面目标");

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(function (res, rej) { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = function (ev) {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    } else if (m.method === "Runtime.exceptionThrown") {
      exceptions.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
    } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      const msg = (m.params.args || []).map(function (a) { return a.value || a.description || ""; }).join(" ");
      consoleErrors.push(msg);
      if (/脚本未加载/.test(msg)) bootWarns.push(msg);
    }
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await waitFor("!!window.FTE_BOOTED", 20000, "first boot");
  /* 等全部 defer 脚本跑完再动 localStorage/reload：boot 阶段就 reload 会打断尚未执行的脚本，
     站内启动校验会（正确地）报「模块未加载」——那是测试时序问题，不是站点缺陷。 */
  await sleep(1500);
  check("站点在真实 Chrome 中启动成功（FTE_BOOTED）", true);

  /* 1) 种一段「已到期」的段级记录（该段已走完五阶段） */
  await evalJs(`
    localStorage.clear();
    localStorage.setItem("fte-progress-v1", JSON.stringify({ schema: 1, stage: { "1-0": 5 }, learned: {}, flash: {}, flashProd: {}, flashChunk: {}, done: {}, quizBest: {}, wrong: {}, rate: 1, voice: "", engine: "native" }));
    localStorage.setItem("fte-seg-review-v1", JSON.stringify({ v: 1, segs: { "1-0": { r: 0, due: Date.now() - 3600 * 1000, last: Date.now() - 7 * 86400000, n: 1 } }, pos: {} }));
    "seeded"
  `);
  await goto("#/today");
  await reload();

  /* 2) 今日：第 3 步变「复听到期段」、深链指到具体一段、仍是 5 步 */
  const today = await evalJs(`(function(){
    const steps = Array.from(document.querySelectorAll(".td-step"));
    const s3 = steps[2] ? steps[2].innerText : "";
    const a3 = steps[2] ? steps[2].querySelector("a[href]") : null;
    return { n: steps.length, t: s3, href: a3 ? a3.getAttribute("href") : "" };
  })()`);
  check("今日仍是 5 步（没有新增第 6 步）", today.n === 5, "n=" + today.n);
  check("第 3 步标题变为「复听到期段」", /复听到期段/.test(today.t));
  check("第 3 步依据说明有几段到点复听", /到点复听/.test(today.t), (today.t.match(/⏰[^\n]*/) || [""])[0].slice(0, 60));
  check("第 3 步深链指到具体一段 #/speak/1-0", today.href === "#/speak/1-0", today.href);
  check("第 3 步记账口径写明轮次不由勾完成推进", /勾完成不推进轮次/.test(today.t));

  /* 3) 深链预选 + 默认五阶段 + 到期说明 */
  await goto("#/speak/1-0");
  const setup = await evalJs(`(function(){
    const sel = document.getElementById("speakDlg");
    const radios = Array.from(document.querySelectorAll('input[name="speakMode"]'));
    const stage = radios.filter(function(r){ return r.value === "stage"; })[0];
    return { val: sel ? sel.value : "", stage: stage ? stage.checked : null, body: document.getElementById("app").innerText };
  })()`);
  check("到期深链预选了正确的一段", setup.val === "1:0", setup.val);
  check("预选后训练模式默认五阶段闯关", setup.stage === true);
  check("页面给出「到期复听」说明与「勾完成不算」口径", /到期复听/.test(setup.body) && /不算|两本账/.test(setup.body));

  /* 4) 走完五阶段 → 记一轮 */
  await evalJs('document.querySelector("[data-action=speak-start]").click(); "ok"');
  await waitFor('/①\\s*盲听/.test(document.getElementById("app").innerText)', 8000, "stage listen");
  check("从①盲听开始（无断点时）", /①\s*盲听/.test(await evalJs('document.getElementById("app").innerText')));

  const clickNext = async function (phase) {
    await evalJs('document.querySelector(\'[data-action=stage-next][data-phase="' + phase + '"]\').click(); "ok"');
    await sleep(350);
  };
  await clickNext("shadow");
  check("进入②精听跟读", /②\s*精听跟读/.test(await evalJs('document.getElementById("app").innerText')));
  await evalJs('document.getElementById("stepMode") && document.getElementById("stepMode").click(); "ok"');
  await sleep(300);
  for (let i = 0; i < 5; i++) { await evalJs('document.querySelector("[data-action=step-next]").click(); "ok"'); await sleep(120); }
  const posSaved = await evalJs('JSON.parse(localStorage.getItem("fte-seg-review-v1")||"{}").pos["1-0"]');
  check("②逐句练习会落句子断点（阶段 2 + 句 index）", !!posSaved && posSaved.s === 2 && posSaved.i === 5, JSON.stringify(posSaved));
  await clickNext("dict");
  await clickNext("retell");
  await clickNext("done");
  await sleep(400);
  const doneTxt = await evalJs('document.getElementById("app").innerText');
  const rec1 = await evalJs('JSON.parse(localStorage.getItem("fte-seg-review-v1")||"{}").segs["1-0"]');
  check("完成页说明第 1/7 轮完成与下次时间", /第\s*1\s*\/\s*7\s*轮复习完成/.test(doneTxt), (doneTxt.match(/🗓[^\n]*/) || [""])[0].slice(0, 80));
  check("真实走完五阶段 → 记录推进到第 1 轮，下次 ≈ +18h",
    rec1 && rec1.r === 1 && Math.abs((rec1.due - Date.now()) - 18 * 3600000) < 6 * 60000,
    rec1 ? "r=" + rec1.r + " due+" + Math.round((rec1.due - Date.now()) / 3600000) + "h" : "null");
  check("走完后断点被清掉", (await evalJs('JSON.parse(localStorage.getItem("fte-seg-review-v1")||"{}").pos["1-0"] || null')) === null);

  /* 5) 立刻重练 → 只算提前练 */
  await evalJs('document.querySelector("[data-action=stage-restart]").click(); "ok"');
  await sleep(300);
  await clickNext("shadow"); await clickNext("dict"); await clickNext("retell"); await clickNext("done");
  await sleep(300);
  const rec2 = await evalJs('JSON.parse(localStorage.getItem("fte-seg-review-v1")||"{}").segs["1-0"]');
  const earlyTxt = await evalJs('document.getElementById("app").innerText');
  check("提前重练不推进轮次（仍是第 1 轮）", rec2 && rec2.r === 1, rec2 ? "r=" + rec2.r : "null");
  check("提前重练的完成页明说「只算练、不记轮次」", /不记轮次/.test(earlyTxt), (earlyTxt.match(/⏳[^\n]*/) || [""])[0].slice(0, 70));

  /* 6) 断点续学：另一段（U2 展会接待，12 句）留在②第 6 句 */
  const RK = "2-0";
  await evalJs(`
    (function(){
      const st = JSON.parse(localStorage.getItem("fte-seg-review-v1")||"{}");
      st.pos = st.pos || {}; st.pos["${RK}"] = { s: 2, i: 5, t: Date.now() - 3600000 };
      localStorage.setItem("fte-seg-review-v1", JSON.stringify(st));
      return "ok";
    })()
  `);
  await goto("#/speak/" + RK);
  await evalJs('document.querySelector(\'input[name="speakMode"][value="stage"]\').click(); "ok"');
  await evalJs('document.querySelector("[data-action=speak-start]").click(); "ok"');
  await sleep(600);
  const resumed = await evalJs('document.getElementById("app").innerText');
  check("断点续学：重进直接落在②精听跟读", /②\s*精听跟读/.test(resumed));
  check("断点续学给出「接着上次 / 第 6 句」提示", /接着上次/.test(resumed) && /第\s*6\s*句/.test(resumed),
    (resumed.match(/⏩[^\n]*/) || [""])[0].slice(0, 80));

  /* 7) 无异常 / 无启动缺模块告警 */
  const bootFailed = await evalJs('window.FTE_BOOT_FAILED || null');
  const realErrors = exceptions.filter(function (e) { return e && !/favicon|net::ERR/.test(e); });
  const realConsole = consoleErrors.filter(function (e) { return e && !/favicon|ServiceWorker|sw\.js/.test(e); });
  check("当前页面没有启动缺模块告警（FTE_BOOT_FAILED）", bootFailed === null, JSON.stringify(bootFailed));
  check("真实浏览器里没有未捕获异常", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));
  check("没有 console.error（网络噪声除外）", realConsole.length === 0, realConsole.slice(0, 2).join(" | "));

  console.log("\n" + (fail === 0 ? "=== SMOKE ALL PASS ===" : "=== SMOKE FAILED: " + fail + " ==="));
  try { ws.close(); } catch (e) { /* ignore */ }
  chrome.kill();
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  console.error("SMOKE ERROR: " + e.message);
  if (exceptions.length) console.error("exceptions: " + exceptions.slice(0, 3).join(" | "));
  try { chrome.kill(); } catch (e2) { /* ignore */ }
  process.exit(1);
});
