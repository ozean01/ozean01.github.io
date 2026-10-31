#!/usr/bin/env node
/* ============ 任务2 · 磨耳朵音频包生成（腾讯云 TTS · 零依赖）============
   读 tools/audio-source.json（100 句核心句，全部来自站内既有语料），逐句调腾讯云
   TextToVoice 生成 mp3，写 audio/<id>.mp3 与 audio/manifest.json。

   用法（在仓库根目录）：
     node tools/build-audio-pack.js --dry-run          # 只算量，不联网、不需要 Key
     node tools/build-audio-pack.js                    # 正式生成（已存在的 mp3 跳过）
     node tools/build-audio-pack.js --force            # 全部重新生成
     node tools/build-audio-pack.js --limit 5          # 只跑前 5 条（试跑）
     node tools/build-audio-pack.js --only u01-trade,sop-chase-0
     node tools/build-audio-pack.js --out some/dir     # 换输出目录（默认 audio/）

   环境变量（**只在机器上设置；本脚本绝不写死、绝不打印**）：
     TENCENT_SECRET_ID     腾讯云 SecretId
     TENCENT_SECRET_KEY    腾讯云 SecretKey
     TENCENT_TTS_VOICE     音色（1051 女 / 1050 男，默认 1051）
     TENCENT_REGION        地域（默认 ap-guangzhou；TTS 不敏感，仅随请求头带）
     TENCENT_TTS_ENDPOINT  可选，仅自测用（默认 https://tts.tencentcloudapi.com；mock 服务可改成本地地址）

   纪律：
     · 断点续跑：目标 mp3 已存在且 >200B 就跳过；写盘先写 .part 再改名（不留半截文件）。
     · 失败重试：HTTP 429/5xx、以及 RequestLimitExceeded / InternalError 等错误码指数退避（最多 5 次）。
     · 音频**不进 SW 的 PRECACHE**：本脚本只生成文件，不碰 sw.js；播放器整包走 CacheStorage。
     · 计量：结束时打印 成功 / 跳过 / 失败 与总字节数；manifest 只收录真实存在的文件。
   ============================================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(__dirname, "audio-source.json");
const SERVICE = "tts";
const HOST_DEFAULT = "tts.tencentcloudapi.com";
const ACTION = "TextToVoice";
const VERSION = "2019-08-23";
const MAX_ATTEMPTS = 5;
const MIN_BYTES = 200;

/* ---------------- 参数 ---------------- */
const argv = process.argv.slice(2);
function flag(name) { return argv.indexOf("--" + name) !== -1; }
function opt(name, dflt) {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && argv[i + 1].charAt(0) !== "-" ? argv[i + 1] : dflt;
}
const DRY = flag("dry-run");
const FORCE = flag("force");
const LIMIT = Number(opt("limit", "0")) || 0;
const ONLY = String(opt("only", "")).split(",").map(function (s) { return s.trim(); }).filter(Boolean);
const OUT = path.resolve(ROOT, opt("out", "audio"));

/* ---------------- 工具 ---------------- */
function log() { console.log(Array.prototype.join.call(arguments, " ")); }
function die(msg) { console.error("❌ " + msg); process.exit(2); }
function sha256hex(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function hmac(key, s) { return crypto.createHmac("sha256", key).update(s, "utf8").digest(); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function humanBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(2) + " MB";
}

/* ---------------- 读清单 ---------------- */
let doc;
try { doc = JSON.parse(fs.readFileSync(SRC, "utf8")); } catch (e) { die("读不到 " + SRC + "：" + e.message); }
const all = (doc && doc.items) || [];
if (!all.length) die("清单为空：" + SRC);
let items = all;
if (ONLY.length) items = items.filter(function (it) { return ONLY.indexOf(it.id) !== -1; });
if (LIMIT > 0) items = items.slice(0, LIMIT);
if (!items.length) die("筛选后没有可生成的句子（检查 --only / --limit）");
items.forEach(function (it) {
  if (!it.id || !it.text) die("清单条目缺 id/text：" + JSON.stringify(it).slice(0, 120));
  if ([...it.text].length > 500) die("超腾讯云单请求 500 字符上限：" + it.id + "（" + [...it.text].length + "）");
});

const words = all.reduce(function (n, it) { return n + it.text.split(/\s+/).length; }, 0);
const chars = all.reduce(function (n, it) { return n + it.text.length; }, 0);
const estSeconds = words / 150 * 60;   /* 150 wpm 的保守估计 */

/* ---------------- dry-run ---------------- */
if (DRY) {
  log("==== 音频包清单预检（--dry-run，不联网、不需要 Key）====");
  log("清单：" + path.relative(ROOT, SRC) + " · " + all.length + " 句 · " + words + " 词 · " + chars + " 字符");
  log("本次待处理 " + items.length + " 句（--limit " + (LIMIT || "无") + (ONLY.length ? " · --only " + ONLY.length + " 个 id" : "") + "）");
  log("预计语音时长约 " + (estSeconds / 60).toFixed(1) + " 分钟；16kHz mp3 按 24–48kbps 估算总字节约 " +
    humanBytes(estSeconds * 3000) + " – " + humanBytes(estSeconds * 6000) + "（以实际生成为准）");
  log("输出目录：" + OUT + "（已存在 " + (fs.existsSync(OUT) ? fs.readdirSync(OUT).filter(function (f) { return /\.mp3$/.test(f); }).length : 0) + " 个 mp3）");
  all.slice(0, 5).forEach(function (it) { log("  · " + it.id + " [" + it.source + "] " + it.text); });
  log("预检通过；正式生成请设置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY 后去掉 --dry-run。");
  process.exit(0);
}

/* ---------------- 凭据 ---------------- */
const SECRET_ID = process.env.TENCENT_SECRET_ID || "";
const SECRET_KEY = process.env.TENCENT_SECRET_KEY || "";
if (!SECRET_ID || !SECRET_KEY) {
  die("缺少环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY（脚本不会读取或打印其它来源；设置后再跑）");
}
const VOICE = Number(process.env.TENCENT_TTS_VOICE || "1051");
if (!Number.isFinite(VOICE) || VOICE <= 0) die("TENCENT_TTS_VOICE 不是合法音色编号");
const REGION = process.env.TENCENT_REGION || "ap-guangzhou";
const endpoint = new URL(process.env.TENCENT_TTS_ENDPOINT || "https://" + HOST_DEFAULT + "/");
const HOST = endpoint.host;
const TRANSPORT = endpoint.protocol === "http:" ? http : https;
const PORT = endpoint.port ? Number(endpoint.port) : (endpoint.protocol === "http:" ? 80 : 443);

fs.mkdirSync(OUT, { recursive: true });
/* manifest 里的 file 用「相对仓库根」的路径（正常就是 audio/<id>.mp3）；--out 指到仓库外时退回绝对路径 */
function relFile(f) {
  const abs = path.join(OUT, f);
  const r = path.relative(ROOT, abs).replace(/\\/g, "/");
  return r.indexOf("..") === 0 ? abs.replace(/\\/g, "/") : r;
}
const outLabel = path.relative(ROOT, OUT).replace(/\\/g, "/") || ".";

/* ---------------- TC3-HMAC-SHA256 签名 ---------------- */
function signRequest(payloadStr, now) {
  const timestamp = now;
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);   /* UTC 日期 */
  const contentType = "application/json; charset=utf-8";
  const canonicalHeaders = "content-type:" + contentType + "\nhost:" + HOST + "\n";
  const signedHeaders = "content-type;host";
  const canonicalRequest = ["POST", (endpoint.pathname || "/"), endpoint.search.replace(/^\?/, ""),
    canonicalHeaders, signedHeaders, sha256hex(payloadStr)].join("\n");
  const scope = date + "/" + SERVICE + "/tc3_request";
  const stringToSign = ["TC3-HMAC-SHA256", String(timestamp), scope, sha256hex(canonicalRequest)].join("\n");
  const kDate = hmac("TC3" + SECRET_KEY, date);
  const kService = hmac(kDate, SERVICE);
  const kSigning = hmac(kService, "tc3_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
  return {
    contentType: contentType,
    authorization: "TC3-HMAC-SHA256 Credential=" + SECRET_ID + "/" + scope +
      ", SignedHeaders=" + signedHeaders + ", Signature=" + signature
  };
}

/* ---------------- 单句请求 ---------------- */
function requestOnce(item) {
  return new Promise(function (resolve) {
    const payload = {
      Text: item.text,
      SessionId: String(item.id + "-" + Date.now()).slice(0, 64),
      VoiceType: VOICE,
      Volume: 0,
      Speed: 0,
      ProjectId: 0,
      ModelType: 1,
      PrimaryLanguage: 2,
      SampleRate: 16000,
      Codec: "mp3"
    };
    const payloadStr = JSON.stringify(payload);
    const now = Math.floor(Date.now() / 1000);
    const sig = signRequest(payloadStr, now);
    const req = TRANSPORT.request({
      protocol: endpoint.protocol, hostname: endpoint.hostname, port: PORT,
      path: (endpoint.pathname || "/") + (endpoint.search || ""), method: "POST",
      headers: {
        "Content-Type": sig.contentType,
        "Host": HOST,
        "X-TC-Action": ACTION,
        "X-TC-Version": VERSION,
        "X-TC-Timestamp": String(now),
        "X-TC-Region": REGION,
        "Authorization": sig.authorization
      },
      timeout: 30000
    }, function (res) {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", function (d) { body += d; });
      res.on("end", function () {
        let json = null;
        try { json = JSON.parse(body); } catch (e) { /* 下面按解析失败处理 */ }
        const R = (json && json.Response) || {};
        if (res.statusCode >= 200 && res.statusCode < 300 && R.Audio) {
          const buf = Buffer.from(R.Audio, "base64");
          if (buf.length < MIN_BYTES) return resolve({ ok: false, code: "EmptyAudio", message: "返回音频过小（" + buf.length + "B）", status: res.statusCode });
          return resolve({ ok: true, buf: buf });
        }
        const code = (R.Error && R.Error.Code) || ("HTTP" + res.statusCode);
        const message = (R.Error && R.Error.Message) || body.slice(0, 200);
        resolve({ ok: false, code: code, message: message, status: res.statusCode });
      });
    });
    req.on("timeout", function () { req.destroy(new Error("timeout")); });
    req.on("error", function (e) { resolve({ ok: false, code: "NETWORK", message: e.message, status: 0 }); });
    req.write(payloadStr);
    req.end();
  });
}

function retryable(r) {
  if (r.code === "NETWORK" || r.code === "EmptyAudio") return true;
  if (r.status === 429 || (r.status >= 500 && r.status < 600)) return true;
  return /RequestLimitExceeded|InternalError|ServiceUnavailable|ResourceUnavailable|TooManyRequests/i.test(r.code || "");
}

async function generate(item) {
  let last = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await requestOnce(item);
    if (last.ok) return last;
    if (!retryable(last) || attempt === MAX_ATTEMPTS) break;
    const backoff = Math.round(800 * Math.pow(2, attempt - 1) + Math.random() * 300);
    log("   ↻ 重试 " + attempt + "/" + (MAX_ATTEMPTS - 1) + "：" + item.id + " · " + last.code + " · " + backoff + "ms 后重试");
    await sleep(backoff);
  }
  return last;
}

/* ---------------- 主流程 ---------------- */
(async function main() {
  log("==== 磨耳朵音频包生成 ====");
  log("清单 " + all.length + " 句 · 音色 " + VOICE + " · 输出 " + outLabel + " · 本次 " + items.length + " 句" +
    (FORCE ? " · --force 全量重生成" : " · 已存在的跳过"));
  let done = 0, skipped = 0, failed = 0;
  const failures = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const file = path.join(OUT, item.id + ".mp3");
    if (!FORCE && fs.existsSync(file) && fs.statSync(file).size >= MIN_BYTES) { skipped++; continue; }
    const tag = "[" + (i + 1) + "/" + items.length + "] " + item.id;
    const r = await generate(item);
    if (r.ok) {
      const tmp = file + ".part";
      fs.writeFileSync(tmp, r.buf);
      fs.renameSync(tmp, file);
      done++;
      log("✅ " + tag + " · " + humanBytes(r.buf.length));
    } else {
      failed++;
      failures.push({ id: item.id, code: r.code, message: r.message });
      log("❌ " + tag + " · " + r.code + " · " + r.message);
    }
    await sleep(120);   /* 温柔一点，别压满 QPS */
  }

  /* manifest 只收录真实存在的文件（断点续跑后也能重建） */
  const missing = [];
  const entries = [];
  items.forEach(function (item) {
    const f = path.join(OUT, item.id + ".mp3");
    if (!fs.existsSync(f)) { missing.push(item.id); return; }
    entries.push({
      id: item.id, text: item.text, unit: item.unit, source: item.source,
      file: relFile(item.id + ".mp3"), bytes: fs.statSync(f).size, voice: VOICE
    });
  });
  const totalBytes = entries.reduce(function (n, e) { return n + e.bytes; }, 0);
  const manifest = {
    note: "任务2 磨耳朵音频包：句子来自 tools/audio-source.json（站内既有语料，未造句）；16kHz mp3；音频不进 SW 的 PRECACHE，整包由播放器用 CacheStorage 离线。",
    voice: VOICE, sampleRate: 16000, codec: "mp3",
    generatedAt: new Date().toISOString(),
    count: entries.length, totalBytes: totalBytes,
    items: entries
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  log("");
  log("==== 结果 ====");
  log("清单 " + all.length + " 句 · 本次 生成 " + done + " / 跳过 " + skipped + " / 失败 " + failed);
  log(outLabel + "/ 现有 " + entries.length + " 条 · 总字节 " + totalBytes + "（" + humanBytes(totalBytes) + "）");
  if (missing.length) log("缺文件 " + missing.length + " 条：" + missing.slice(0, 8).join(", ") + (missing.length > 8 ? " …" : ""));
  if (failures.length) {
    log("失败明细：");
    failures.slice(0, 10).forEach(function (f) { log("  · " + f.id + " · " + f.code + " · " + String(f.message).slice(0, 120)); });
    log("重跑同一命令即可断点续传（已成功的不会重复计费）。");
  }
  log("manifest → " + relFile("manifest.json"));
  process.exit(failed ? 1 : 0);
})().catch(function (e) { console.error("❌ " + e.message); process.exit(2); });
