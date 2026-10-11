#!/usr/bin/env node
/* ============ 从 vosk-browser 的发行包里抽出「同源 worker 文件」 ============
   为什么需要这一步（2026-10-11 晚，真机定位）：
   `vosk-browser@0.0.8` 的 `dist/vosk.js` 有 **99.5% 是一个 base64 字符串** ——
   它把 Kaldi 引擎（含内嵌 wasm）打包成一个 **blob: Worker**。而 blob Worker 会
   **继承创建它的文档的 CSP**，本站的严格 CSP（无 'unsafe-eval'）会让 worker 里的
   Emscripten 胶水抛 `EvalError`，worker 当场死掉且**不上报**，表现为
   `createModel()` 既不 resolve 也不 reject（实测 >120 秒）→ 离线识别永远建不出来。

   改法：把这段 worker 源码抽成一个**同源真实文件** `js/vendor/vosk-worker.js`。
   真机实测：同源文件 worker **不继承文档 CSP**（它用自己响应头的 CSP，而静态托管
   不发送 CSP 头）→ worker 内的 eval 正常，离线识别 3–8 秒建好模型；
   而 blob worker 在同一页面下 `EVAL-BLOCKED`。这样就能把 `'unsafe-eval'` 从 index.html 的
   CSP 里拿掉，恢复严格策略。

   本脚本保证这一步**可复现**：
     输入（按优先级）：
       ① js/vendor/vosk.js（若仍在，例如刚下载的原始发行包）
       ② 否则从钉死版本的 CDN 取：https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js
     输出：
       js/vendor/vosk-worker.js（同源 worker 文件）
   用法：
     node tools/build-vosk-worker.js            # 生成/刷新 worker 文件
     node tools/build-vosk-worker.js --check    # 只校验现有 worker 文件是否与源一致（CI 用）
   升级 vosk-browser 时：把新的 dist/vosk.js 放回 js/vendor/vosk.js，重跑本脚本，再删掉它
   （worker 文件才是随站发布的那一份；dist/vosk.js 只是抽取用的中间物，不必留在仓库里）。 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const VENDOR = path.join(ROOT, "js", "vendor");
const DIST_LOCAL = path.join(VENDOR, "vosk.js");
const OUT_FILE = path.join(VENDOR, "vosk-worker.js");
const PINNED = "https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js";

const CHECK = process.argv.indexOf("--check") >= 0;

function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

/* 从 dist/vosk.js 里把 createBase64WorkerFactory('…') 的那个 base64 抠出来。
   返回 { b64, start, end } —— 位置用于校验"恰好只有一处"。 */
function extractWorkerBase64(src) {
  const marker = "createBase64WorkerFactory('";
  const at = src.indexOf(marker);
  if (at < 0) throw new Error("在 vosk.js 里找不到 createBase64WorkerFactory 调用（版本不符？）");
  if (src.indexOf(marker, at + 1) >= 0) throw new Error("createBase64WorkerFactory 出现多次，无法确定用哪一个");
  const start = at + marker.length;
  const end = src.indexOf("'", start);
  if (end < 0) throw new Error("base64 字符串未闭合");
  const b64 = src.slice(start, end);
  if (!/^[A-Za-z0-9+/=]+$/.test(b64)) throw new Error("抽出来的不是合法 base64");
  return { b64, start, end };
}

async function loadSource() {
  if (fs.existsSync(DIST_LOCAL)) {
    return { text: fs.readFileSync(DIST_LOCAL, "utf8"), from: "本地 js/vendor/vosk.js" };
  }
  console.log("本地没有 js/vendor/vosk.js，改从 CDN 取：" + PINNED);
  const res = await fetch(PINNED);
  if (!res.ok) throw new Error("CDN 取包失败：HTTP " + res.status);
  return { text: await res.text(), from: "CDN " + PINNED };
}

(async () => {
  try {
    const src = await loadSource();
    const { b64 } = extractWorkerBase64(src.text);
    const workerBuf = Buffer.from(b64, "base64");
    const workerText = workerBuf.toString("utf8");
    const digest = sha256(workerBuf);

    console.log("源：" + src.from + "（" + src.text.length + " 字符）");
    console.log("其中 base64：" + b64.length + " 字符（占 " + (b64.length / src.text.length * 100).toFixed(1) + "%）");
    console.log("抽出 worker：" + workerBuf.length + " 字节（" + (workerBuf.length / 1048576).toFixed(2) + " MB）sha256=" + digest.slice(0, 16) + "…");

    /* 基本形状自检：worker 必须自包含（不能 importScripts 外部文件）、必须监听 message */
    if (workerText.indexOf("importScripts") >= 0) {
      throw new Error("抽出的 worker 里有 importScripts —— 不是自包含文件，不能直接当同源文件用");
    }
    if (workerText.indexOf('addEventListener("message"') < 0 && workerText.indexOf("onmessage") < 0) {
      throw new Error("抽出的 worker 里没有 message 监听 —— 形状不对");
    }

    if (CHECK) {
      if (!fs.existsSync(OUT_FILE)) { console.log("✗ --check：worker 文件不存在"); process.exit(1); }
      const cur = fs.readFileSync(OUT_FILE);
      if (sha256(cur) !== digest) {
        console.log("✗ --check：现有 vosk-worker.js 与源不一致（需要重跑 node tools/build-vosk-worker.js）");
        process.exit(1);
      }
      console.log("✓ --check：vosk-worker.js 与源一致，无需重建");
      return;
    }

    fs.writeFileSync(OUT_FILE, workerBuf);
    console.log("✓ 已写出 " + path.relative(ROOT, OUT_FILE));

    /* 顺带把版本信息写进一个可被门禁读取的小清单 */
    const meta = {
      note: "由 tools/build-vosk-worker.js 从 vosk-browser 发行包抽取的同源 worker（勿手工编辑）",
      source: src.from,
      pinnedVersion: "vosk-browser@0.0.8",
      bytes: workerBuf.length,
      sha256: digest
    };
    const metaFile = path.join(VENDOR, "vosk-worker.meta.json");
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + "\n");
    console.log("✓ 已写出 " + path.relative(ROOT, metaFile));
  } catch (e) {
    console.error("✗ " + (e && e.message ? e.message : e));
    process.exit(1);
  }
})();
