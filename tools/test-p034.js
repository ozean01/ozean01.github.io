#!/usr/bin/env node
/* 验收测试：P0-3 AI 对练会话持久化 + P0-4 自由表达录音留档（2026-10-24）。
   由来（评估报告 3.4 清单）：
     · P0-3 —— tutor.js 的 chatHistory 是内存变量，刷新即丢，练完的对话（复盘的原料）等于白练；
     · P0-4 —— speech.js「说完就完」：只存转写文本，录完的语音直接丢弃，无法回听自己的原声。
   本测试守住四件事：
     ① 会话持久化接线：chatHistory 的每一条变更路径（用户消息 / 正常回复 / 错误占位 / 清空）都落盘；
     ② 录音留档接线：识别与录音并行开麦、分析后落 IndexedDB、结果区与历史都有回听入口、清空历史联动删音频；
     ③ 存储键对账：两个新键都在 storage-keys.js 登记（备份语义正确：chat 可备份、audio blob 不备份）；
     ④ 诚实口径：录音只存本机的说明保留在 UI；语速/流利度改用真实音频时长后仍标「估算」。 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

const tutorSrc = read("js/tutor.js");
const speechSrc = read("js/speech.js");
const keysSrc = read("js/storage-keys.js");

/* ---------- ① P0-3：会话持久化 ---------- */
check("tutor.js 定义 CHAT_KEY=fte-tutor-chat-v1 与 loadChat/saveChat",
  tutorSrc.indexOf('"fte-tutor-chat-v1"') !== -1 &&
  /function loadChat\(\)/.test(tutorSrc) &&
  /function saveChat\(\)/.test(tutorSrc));
check("chatHistory 初始化即从持久层恢复（不再是内存数组）",
  /let chatHistory = loadChat\(\);/.test(tutorSrc));
check("四条变更路径都落盘：用户消息/正常回复/错误占位/清空 —— saveChat() 出现 ≥4 次",
  (tutorSrc.match(/saveChat\(\);/g) || []).length >= 4,
  "实得 " + (tutorSrc.match(/saveChat\(\);/g) || []).length + " 次");
check("loadChat 校验形状（role 合法 + content 为非空字符串）",
  /m\.role === "user" \|\| m\.role === "assistant"/.test(tutorSrc) &&
  /typeof m\.content === "string" && m\.content/.test(tutorSrc));
check("有界存储：CHAT_KEEP 截断 + CHAT_MSG_MAX 截断都存在",
  /slice\(-CHAT_KEEP\)/.test(tutorSrc) && /slice\(0, CHAT_MSG_MAX\)/.test(tutorSrc));
check("恢复后有「↩️ 已恢复上次对话」提示，清空时复位 chatRestored",
  tutorSrc.indexOf("已恢复上次对话") !== -1 && /chatRestored = 0;/.test(tutorSrc));

/* ---------- ② P0-4：录音留档 ---------- */
check("speech.js 定义 IndexedDB 库 fte-speech-audio 与 audioPut/audioGet/audioClear/audioPrune",
  speechSrc.indexOf('"fte-speech-audio"') !== -1 &&
  /function audioPut\(/.test(speechSrc) && /function audioGet\(/.test(speechSrc) &&
  /function audioClear\(/.test(speechSrc) && /function audioPrune\(/.test(speechSrc));
check("识别与录音并行开麦：startListen 里调用 Player.startRecording",
  /P\.startRecording\(\)/.test(speechSrc));
check("分析结束收录音：afterSpeak 里调用 Player.stopRecording 并存 st.audioUrl",
  /P2\.stopRecording\(\)/.test(speechSrc) && /st\.audioUrl = url/.test(speechSrc));
check("saveHistNow 落 audioId 并把 blob 写入 IndexedDB（fetch→blob→audioPut）",
  /rec\.audioId = "t"/.test(speechSrc) && /audioPut\(rec\.audioId, blob\)/.test(speechSrc));
check("历史条目带「▶ 回听」（data-sp=\"hist-audio\"），本次结果区带 data-sp=\"replay\"",
  speechSrc.indexOf('data-sp="hist-audio"') !== -1 && speechSrc.indexOf('data-sp="replay"') !== -1);
check("清空历史联动删音频（audioClear）", /localStorage\.removeItem\(KEY\); audioClear\(\);/.test(speechSrc));
check("有界存储：AUDIO_KEEP 截断（audioPrune 超 30 条删最旧）",
  /AUDIO_KEEP = 30/.test(speechSrc) && /keys\.length - AUDIO_KEEP/.test(speechSrc));
check("录音失败不阻断主流程（recAudioOn 守卫 + catch 静默降级）",
  speechSrc.indexOf("recAudioOn") !== -1 && /回听是增强项/.test(speechSrc));
check("语速/流利度改用真实音频时长（decodeMonoPcm → duration → estWordsPerMin 重算）",
  /decodeMonoPcm\(url\)/.test(speechSrc) && /st\.seconds = Math\.round\(d\.duration/.test(speechSrc));

/* ---------- ③ 存储键对账 ---------- */
check("fte-tutor-chat-v1 已登记且 backup:true（随备份迁移）",
  /key: "fte-tutor-chat-v1"[^\n]*backup: true/.test(keysSrc));
check("fte-speech-audio 已登记且 backup:false（blob 体积大不进备份）",
  /key: "fte-speech-audio"[^\n]*backup: false/.test(keysSrc));

/* ---------- ④ 诚实口径 ---------- */
check("「录音只存在本机浏览器」的说明保留在结果区 UI",
  speechSrc.indexOf("录音只存在") !== -1 && speechSrc.indexOf("本机浏览器") !== -1);
check("清空对话的承诺与实现一致（tutor-clear 同时 saveChat 清持久层）",
  /case "tutor-clear":[\s\S]{0,80}saveChat\(\);/.test(tutorSrc));

console.log(pass ? "\n=== P0-3/P0-4 门禁全部通过 ===" : "\n=== 有断言失败 ===");
process.exit(pass ? 0 : 1);
