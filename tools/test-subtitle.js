// 临时验证脚本：载入 subtitle.js，测试 SRT/VTT/ASS 解析 + 分级着色
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "js");
const code = fs.readFileSync(path.join(dir, "subtitle.js"), "utf8");
global.window = { FTE_DIFF: null, Subtitle: {}, Player: {} };
global.document = { getElementById: function(){ return { addEventListener:function(){}, hidden:true, classList:{add:function(){},remove:function(){},toggle:function(){}}, textContent:"", innerHTML:"" } } };
eval(code);
const t = window.Subtitle._t;
let pass = 0, fail = 0;
function ok(name, cond){ if(cond){pass++;console.log("PASS "+name);} else {fail++;console.log("FAIL "+name);} }

// toSec
ok("srt toSec (comma)", Math.abs(t.toSec("00:00:01,500") - 1.5) < 0.001);
ok("vtt toSec (dot)", Math.abs(t.toSec("00:00:01.500") - 1.5) < 0.001);
ok("ass toSec", Math.abs(t.toSec("0:00:03.40") - 3.4) < 0.001);
ok("toSec minutes", Math.abs(t.toSec("00:01:02.0") - 62) < 0.001);

// SRT
const srt = "1\n00:00:01,000 --> 00:00:03,500\nHello there, welcome.\n\n2\n00:00:04,000 --> 00:00:06,000\nLet us check the price.\n\n";
let cues = t.parseSubtitle(srt, "srt");
ok("srt count 2", cues.length === 2);
ok("srt start", Math.abs(cues[0].start - 1) < 0.001);
ok("srt end", Math.abs(cues[0].end - 3.5) < 0.001);
ok("srt text join", cues[0].text === "Hello there, welcome.");
ok("srt text2", cues[1].text === "Let us check the price.");

// VTT
const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000 align:start\nLet us confirm.\n\n00:00:02.500 --> 00:00:04.000\nShip tomorrow.\n";
cues = t.parseSubtitle(vtt, "vtt");
ok("vtt count 2", cues.length === 2);
ok("vtt strip settings", Math.abs(cues[0].end - 2) < 0.001);
ok("vtt text", cues[0].text === "Let us confirm.");

// VTT with id line
const vtt2 = "WEBVTT\n\nintro\n00:00:00.100 --> 00:00:01.000\nA\n\n2\n00:00:01.100 --> 00:00:02.000\nB\n";
cues = t.parseSubtitle(vtt2, "vtt");
ok("vtt id line handled", cues.length === 2 && cues[0].text === "A" && cues[1].text === "B");

// ASS
const ass = "[Script Info]\nTitle: x\n\n[Events]\nFormat: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,Hello, welcome to the meeting\nDialogue: 0,0:00:03.00,0:00:05.00,Default,,0,0,0,,{\\an8}Second line done\n";
cues = t.parseSubtitle(ass, "ass");
ok("ass count 2", cues.length === 2);
ok("ass start", Math.abs(cues[0].start - 1) < 0.001);
ok("ass text keeps comma", cues[0].text === "Hello, welcome to the meeting");
ok("ass strip override tag", cues[1].text === "Second line done");

// coloredText / diff with FTE_DIFF stub
window.FTE_DIFF = { words: {
  "film": { dif: "easy", cefr: "A1", dom: false },
  "laminating": { dif: "hard", cefr: null, dom: true },
  "price": { dif: "mid", cefr: "B1", dom: false },
  "the": { dif: "easy", cefr: "A1", dom: false }
}};
ok("diff easy", t.diff("film").cls === "easy");
ok("diff tech", t.diff("laminating").cls === "tech");
ok("diff mid", t.diff("price").cls === "mid");
ok("diff fallback hard", t.diff("international").cls === "hard");
ok("diff fallback easy", t.diff("cat").cls === "easy");
const html = t.coloredText("We use laminating adhesive and film.");
ok("colored has spans", html.indexOf("sub-word") !== -1);
ok("colored tech class", html.indexOf("tech") !== -1);
ok("colored keeps raw", html.indexOf("adhesive") !== -1);

/* ---------------- P7 四档字幕：中英双语分轨 ---------------- */
ok("CJK 判定：中文行", t.hasCJK("你好，欢迎。"));
ok("CJK 判定：含中文的英文行", t.hasCJK("Please confirm 数量"));
ok("CJK 判定：纯英文行", !t.hasCJK("Please confirm the quantity."));

const bil = t.splitBilingual(["Hello there, welcome.", "你好，欢迎。"]);
ok("splitBilingual en", bil.en === "Hello there, welcome.");
ok("splitBilingual zh", bil.zh === "你好，欢迎。");
const mono = t.splitBilingual(["Let us check the price.", "Ship tomorrow."]);
ok("splitBilingual 单语全进 en", mono.en === "Let us check the price. Ship tomorrow." && mono.zh === "");

/* 双语 SRT：这是国内最常见的字幕形态（英文行 + 中文行） */
const srtBi = "1\n00:00:01,000 --> 00:00:03,500\nHello there, welcome.\n你好，欢迎。\n\n2\n00:00:04,000 --> 00:00:06,000\nLet us check the price.\n我们来核对价格。\n\n";
cues = t.parseSubtitle(srtBi, "srt");
ok("双语 srt 句数", cues.length === 2);
ok("双语 srt en 轨", cues[0].en === "Hello there, welcome.");
ok("双语 srt zh 轨", cues[0].zh === "你好，欢迎。");
ok("双语 srt text 只取英文（TTS 不混读）", cues[0].text === "Hello there, welcome.");
ok("双语 srt 第二句", cues[1].en === "Let us check the price." && cues[1].zh === "我们来核对价格。");

/* 双语 ASS：\N 断行 */
const assBi = "[Events]\nFormat: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,Laminating adhesive\\N复合胶水\n";
cues = t.parseSubtitle(assBi, "ass");
ok("双语 ass en（去掉 \\N）", cues[0].en === "Laminating adhesive");
ok("双语 ass zh", cues[0].zh === "复合胶水");

/* 单语字幕不得凭空长出中文轨（否则四档会露出空的中文档） */
cues = t.parseSubtitle(srt, "srt");
ok("单语 srt 无 zh 轨", !cues[0].zh && cues[0].en === "Hello there, welcome.");

/* 生效档位：单语字幕不得停在「全部/中文」，必须落到英语档 */
const zhCues = [{ en: "a", zh: "甲" }], monoCues = [{ en: "a", zh: "" }];
ok("推荐阶梯顺序固定为 全部→英语→隐藏→中文", t.modeOrder.join(">") === "all>en>hidden>zh");
ok("有中文轨默认落到全部", t.effModeOf("", zhCues) === "all");
ok("有中文轨可切中文档", t.effModeOf("zh", zhCues) === "zh");
ok("单语+全部 → 英语档", t.effModeOf("all", monoCues) === "en");
ok("单语+中文 → 英语档", t.effModeOf("zh", monoCues) === "en");
ok("单语+隐藏 → 保持隐藏（纯听仍可用）", t.effModeOf("hidden", monoCues) === "hidden");
ok("档位提示有文案", typeof t.modeHint("zh") === "string" && t.modeHint("zh").length > 4);

console.log("\nRESULT: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
