#!/usr/bin/env node
/* 门禁：P1 批次不变量

   为什么需要它：P1 改的东西大多是"口径与真话"——口音到底切没切、分数到底由哪台仪器给的、
   完成算不算数、错误提示能不能照着做、发布链会不会把不该传的传上去。
   这类改动**最容易在后续迭代里被无声改回去**（尤其是"看起来更简单"的旧写法），
   故把可机器验证的部分固化下来。

   口径来源：
     · 口音真话 / 发音教学   —— `_fte-review-2/P1/B-口音与发音教学-改动记录.md`（S05/S07）
     · 分数构念与分桶        —— `_fte-review-2/P1/A-测评效度-改动记录.md`（S04）
     · 记账口径 / 错误恢复 / 投料口 / RRULE —— `_fte-review-2/P1/C-四个UX项-改动记录.md`（S01/S09/S12）
     · 发布链 / 缓存桶 / 只读审计 —— `_fte-review-2/P1/D-工程链-改动记录.md`（S10）

   注意：本文件只断言**不变量**（存在性、方向、禁止回退），不复算业务结果——
   那些由各自的专门门禁（test-score / test-term-score / test-honesty / test-outcomes …）负责。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) pass = false;
}
function read(p) { return fs.readFileSync(path.join(ROOT, p), "utf8"); }
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }

/* ---------- 1. 口音：开关必须"真的切"，且 UI 必须说真话（P1-B） ---------- */
const playerSrc = read("js/player.js");
check("player.js 导出口音能力查询 accentCapability（Azure/Google 下能否真切到英音的唯一真相来源）",
  /accentCapability\s*[:=]/.test(playerSrc) || /function accentCapability/.test(playerSrc));
check("player.js 导出人话提示 accentHint（供设置面板/字幕页直接展示）",
  /accentHint\s*[:=]/.test(playerSrc) || /function accentHint/.test(playerSrc));
check("Azure 口音由 voice 的 locale 推导，且英音真的落到 en-GB（不得再写死 en-US）",
  /en-GB/.test(playerSrc) && /xml:lang/.test(playerSrc) && !/xml:lang="en-US"\s*\+\s*Player\.azure\.voice/.test(playerSrc));
check("取不到对应口音人声时不得静默回退（必须留痕或回调）",
  /lastAccentIssue|onAccentUnsupported/.test(playerSrc));
const appSrc = read("js/app.js");
check("设置面板必须展示 accentHint（旧写法在 Azure/Google 下仍显示「当前：英音」= 骗用户）",
  /accentHint/.test(appSrc));
const subtitleSrc = read("js/subtitle.js");
check("字幕页口音按钮必须走 accentCapability（不得只用 hasAccent 假报「已切到英音」）",
  /accentCapability/.test(subtitleSrc));

/* ---------- 2. 分数：构念不得再碰撞，聚合必须按仪器分桶（P1-A） ---------- */
const eval4Src = read("js/eval4.js");
check("saveAzure 必须写独立的 Azure 字段（azPron/azAcc/azFlu/azComp）而不是复用 acc/flu",
  /azPron/.test(eval4Src) && /azAcc/.test(eval4Src) && /azFlu/.test(eval4Src));
check("Azure 记录必须带来源标记（src:\"azure\" / dimSrc），否则无法按仪器分桶",
  /src:\s*"azure"/.test(eval4Src) && /dimSrc/.test(eval4Src));
const radarSrc = read("js/radar.js");
check("radar 聚合必须识别 dimSrc 并按仪器分桶（无来源标记的历史记录不得计入能力轴）",
  /dimSrc/.test(radarSrc) && /(未知来源|不计入)/.test(radarSrc));
const placementSrc = read("js/placement.js");
check("水平自测必须自称「自评定位（自陈，非测评）」（它是用户点选的，不是测评结果）",
  /自评定位/.test(placementSrc) && /自陈/.test(placementSrc));
check("SCORE-INTERPRETATION.md 存在（分数解释手册：能声称什么 / 不能声称什么）",
  exists("SCORE-INTERPRETATION.md"));

/* ---------- 3. 记账口径、错误恢复、投料口、.ics（P1-C） ---------- */
const todaySrc = read("js/today.js");
const rruleCount = (todaySrc.match(/RRULE:FREQ=/g) || []).length;
check("今日页导出的 .ics 必须含 RRULE（否则提醒只响一次）", rruleCount >= 1, "RRULE 出现 " + rruleCount + " 处");
check(".ics 的 DESCRIPTION 必须带站内练习入口（提醒点得回来）",
  /站内练习入口|ozean01\.github\.io/.test(todaySrc));
check("今日页必须在 UI 上写明每步的记账口径（自报 / 自动 / 词数门槛）",
  /data-credit-legend/.test(todaySrc) && /记账口径/.test(todaySrc));
/* 首屏顺序：五步清单必须排在场景急救之前（S09：首屏只让人做一个决定） */
const iSteps = todaySrc.indexOf("td-step");
const iUrgent = todaySrc.indexOf("Urgent.html()", todaySrc.indexOf("class=\"td-list\""));
check("今日页首屏顺序：五步清单必须先于场景急救（但不删除场景急救）",
  iSteps !== -1 && iUrgent !== -1 && iSteps < iUrgent, "steps@" + iSteps + " urgent@" + iUrgent);
const exportSrc = read("js/export.js");
check("导入失败必须有就地错误块（不是只有 3 秒 toast）",
  /showImportError/.test(exportSrc) && /role="alert"/.test(exportSrc));
const materialSrc = read("js/material.js");
check("素材投料口必须有真正的 URL 判定函数（原 !A && !B 条件恒假）", /looksLikeUrl/.test(materialSrc));

/* ---------- 4. 发布链与工程化（P1-D） ---------- */
const pagesSrc = read(".github/workflows/pages.yml");
/* 只在**有效配置**上断言：注释里说明"原实现是 path: \".\"" 是允许且有价值的（第一版就踩了这个坑） */
const pagesCode = pagesSrc.replace(/^\s*#.*$/gm, "");
check("pages.yml 的 deploy 必须依赖 test（门禁不绿不得上线）", /needs:\s*test/.test(pagesCode));
check("pages.yml 必须上传显式白名单目录，而不是仓库根（原 path: \".\"）",
  /path:\s*"_site"/.test(pagesCode) && !/path:\s*"\."/.test(pagesCode));
const ciSrc = read(".github/workflows/ci.yml");
check("ci.yml 的单一数据源检查必须显式 --allow-missing（小程序是兄弟目录，CI 里必然缺数据）",
  /check-single-source\.js\s+--allow-missing/.test(ciSrc));
const swSrc = read("sw.js");
check("sw.js 必须有缓存写入闸 cacheGate（原实现让缓存桶随 query 无上限增长）",
  /cacheGate/.test(swSrc));
["audit-count.js", "audit-ipa.js", "audit-input.js"].forEach(function (f) {
  check(f + " 必须支持 FTE_NO_WRITE / --no-write 只读模式（npm test 不得污染工作区）",
    /FTE_NO_WRITE/.test(read("tools/" + f)));
});
check("tools/prepush-check.js 存在（发布前固定动作：工作区干净 + CACHE 已升版 + 基线一致）",
  exists("tools/prepush-check.js"));

/* ---------- 5. 周报不得因维度缺数据而输出全 0（P1-A 修复的跨组耦合） ---------- */
const tutorSrc = read("js/tutor.js");
check("周报的四维汇总必须按维度分别计数（g.cnt），不得用总记录数当分母（否则缺数据维度显示 0 分）",
  /g\.cnt\s*\[/.test(tutorSrc) && /样本不足/.test(tutorSrc));

/* ---------- 6. 真实使用反馈修复：跟读与评分必须真的能用（2026-10-11 用户反馈） ----------
   反馈原文：「单词及句子我只能听系统播放，我还需要跟读及评分以帮助我纠正发音，这个功能缺失」。
   两条根因都要有机器守卫，否则下次"重构"很容易再退回"只能听"：
     ① Player.recognize 必须**离线优先**（Chrome 的在线识别走 Google，国内不可达）；
     ② 看词的界面（课程单元词汇表）必须有 🎤 跟读入口，不能只有 🔊 朗读。 */
check("player.js 必须实现离线优先识别（recognizeLocal）并导出 localASROn",
  /function recognizeLocal/.test(playerSrc) && /Player\.localASROn\s*=/.test(playerSrc));
check("Player.recognize 必须先判断本地离线识别，再回退浏览器识别",
  /Player\.recognize = function[\s\S]{0,700}?localASROn\(\)[\s\S]{0,120}?recognizeLocal/.test(playerSrc));
check("recognitionSupported 必须把「本地识别可用」也算作支持（否则跟读按钮会被隐藏）",
  /Player\.recognitionSupported = function \(\) \{ return !!\(SR \|\|/.test(playerSrc));
check("课程单元词汇表每个词必须有 🎤 跟读按钮（data-action=\"word-shadow\"）",
  /data-action="word-shadow"/.test(appSrc));
check("词级跟读必须复用既有评测引擎与诚实口径（evaluateSpeech + 识别≠发音 提示）",
  /startWordShadow/.test(appSrc) && /识别≠发音/.test(appSrc));
check("模型就绪时必须默认打开离线识别，并尊重用户的明确关闭（localASROff）",
  /localASROff/.test(appSrc));

/* ---------- 7. 跟读必须与「识别」解耦：火狐也能练（2026-10-11 第二次使用反馈） ----------
   反馈：「用火狐发现 语块卡 · 短语 也没有跟读以及评测功能」「一定要 Edge 才可以吗」。
   事实：火狐**完全不支持** SpeechRecognition；Chrome 的识别走 Google、国内不可达。
   所以"跟读"必须有一条**不依赖识别**的路径（听→跟读→录音→A/B 回放），否则火狐用户
   连练发音的入口都没有。这条守卫防止以后又被改回"没有识别就没有跟读"。 */
check("app.js 必须有不依赖识别的跟读实现（shadowRun）——火狐没有 SpeechRecognition",
  /function shadowRun/.test(appSrc) && /Player\.startRecording/.test(appSrc));
check("跟读必须同时提供「评测」（需要识别）且两者分离（shadow-eval 独立存在）",
  /function shadowEval/.test(appSrc) && /case "shadow-eval"/.test(appSrc));
check("三个实际学习面都必须有跟读入口：单元词汇 / 短语 / 语块卡（至少 3 处 data-action=\"shadow\"）",
  (appSrc.match(/data-action="shadow"/g) || []).length >= 3);
check("评测不可用时必须写明两条出路（本地离线识别 / Edge），不能只报失败",
  /本地离线识别/.test(appSrc) && /Edge/.test(appSrc));

/* ---------- 8. 启动脚本：自动优先 Edge + 保持 ASCII-only ---------- */
const bootSrc = read("start-site.ps1");
check("start-site.ps1 必须保持 ASCII-only（Windows PowerShell 5.1 按 ANSI 读取，中文会破引号）",
  (function () {
    const buf = fs.readFileSync(path.join(ROOT, "start-site.ps1"));
    for (let i = 0; i < buf.length; i++) if (buf[i] > 127) return false;
    return true;
  })());
check("start-site.ps1 必须支持 -Browser 且 auto 模式优先 Edge（评测需要能用的识别服务）",
  /\[ValidateSet\('auto', 'edge', 'chrome', 'firefox', 'default'\)\]/.test(bootSrc) &&
  /Resolve-BrowserExe/.test(bootSrc) && /Resolve-BrowserExe 'edge'/.test(bootSrc));

/* ---------- 9. 第三轮使用反馈：「跟读按钮放出的仍是系统声音，不是让我录音，也没有评测」
   真机复核后确认的两个根因，各配一条机器守卫。这些守卫的意义不是"代码长这样"，
   而是**把两个已被证伪的写法钉死**，免得下次重构又退回去。 ---------- */
const asrSrc = read("js/asr-local.js");

/* 9-1 跟读窗口必须从"读完"算起。老写法 `Player.speak(...); timer = setTimeout(round, gap)`
     从**开始朗读**算起：句子比 gap 长时第二轮会抢麦，录音还会把扬声器里的标准音录进去
     ——用户回放"我的录音"听到的还是系统声音。 */
check("Player.repeat 必须把「下一轮/onDone」挂在朗读的 onend 上（不得在 speak 之后立刻 setTimeout）",
  /Player\.speak\(text, \{ rate: o\.rate, onend: advance \}\)/.test(playerSrc) &&
  !/Player\.speak\(text, \{ rate: o\.rate \}\);\s*\n\s*timer = setTimeout\(round/.test(playerSrc));
check("Player.repeat 必须有 onend 失联时的兜底推进（不能把跟读链卡死）",
  /watchdog = setTimeout\(advance, estimateSpeechMs/.test(playerSrc));

/* 9-2 自检与正式识别必须共用同一个模型形态。老写法 selfTest 传解压目录 →
     必然超时 → localASROff=true → 离线评测被永久关掉 → 国内 Chrome 拿不到任何评分。 */
check("自检与正式识别必须共用同一个模型来源（tar.gz 的绝对 URL），不得再传解压目录",
  /postLoad\(w, MODEL_ARCHIVE_URL\)/.test(asrSrc) &&
  /var MODEL_ARCHIVE_URL = absUrl\(MODEL_ARCHIVE\)/.test(asrSrc) &&
  !/createModel\(MODELS_DIR\)/.test(asrSrc));

/* 9-3 开录之前必须硬停 TTS，否则麦克风会把扬声器里的标准音一起录进去。 */
check("跟读开录前必须硬停一切 TTS（Player.stop + speechSynthesis.cancel）",
  /function shadowRunAt/.test(appSrc) &&
  /speechSynthesis\.cancel\(\)/.test(appSrc) &&
  /silence\(\);\s*\/\* ★ 开录前硬停 TTS/.test(appSrc));

/* 9-4 录音必须是用户看得见、控得住的：实时电平 + 手动「我说完了」。 */
check("跟读录音必须有实时电平表（onLevel）与手动收尾动作（shadow-stop）",
  /onLevel: function \(rms\)/.test(appSrc) && /case "shadow-stop"/.test(appSrc) &&
  /data-action="shadow-stop"/.test(appSrc));

/* 9-5 没有识别能力时也要给"我的语音 vs 标准音"的反馈——节奏与音量本来就不需要识别。 */
check("跟读必须有不依赖识别的声学反馈（音量峰值 + 有效时长/节奏对比）",
  /function shadowAccentHtml/.test(appSrc) && /estimateSpeechMs/.test(playerSrc) &&
  /节奏与标准音接近/.test(appSrc));

/* 9-6 一次录音就能评分：录到的 PCM 直接喂本机离线识别，不再让用户为评分重读一遍。 */
check("录音需同时采 PCM 并暴露给离线识别（capturePcm + lastRecordingPcm）",
  /capturePcm: true/.test(appSrc) && /Player\.lastRecordingPcm/.test(playerSrc) &&
  /lastRecordingPcm\(\)/.test(appSrc));
check("评分必须优先走本机离线识别，其次才回退浏览器在线识别",
  /const localReady = !!\(window\.LocalASR/.test(appSrc) &&
  /if \(localReady\)/.test(appSrc));

/* 9-7 "不断纠正取得进步"要有可见凭证：本次分 / 历史最好 / 已练次数。 */
check("跟读结果必须记录并显示「本次 / 历史最好 / 已练次数」",
  /function shadowHist/.test(appSrc) && /历史最好/.test(appSrc) && /已练/.test(appSrc));

/* 9-8 历史重复发：课程单元的【对话】tab 之前只有 ▶，不说不能练，是**没有入口**。 */
check("课程单元对话的每一句都必须能跟读与评测（不能只有 ▶ 朗读）",
  /data-action="shadow" data-text="\$\{esc\(l\.en\)\}"/.test(appSrc));

/* 9-9 file:// 双击打开时录音被浏览器禁用，必须**明说**并给出正确打开方式。 */
check("不能录音时必须区分 file:// 并指明用启动脚本以 http://localhost:8000 打开",
  /location\.protocol === "file:"/.test(appSrc) && /localhost:8000/.test(appSrc));

/* 9-10 离线识别的实现形态（2026-10-11 晚，两轮真机定位后的最终架构）。
   真机踩过的坑，逐个钉死：
     ① 自检传解压目录 → 必然超时 → localASROff 永久关掉离线识别（已改为 tar.gz + 绝对 URL）；
     ② 客户端用 C++/Python 绑定名 → `rec.AcceptWaveform is not a function`（已不再自建客户端）；
     ③ dist/vosk.js 用 blob Worker → 继承文档 CSP → worker 内 EvalError 且不上报 → 模型永不返回；
        最终改为**同源 worker 文件**，严格 CSP 得以恢复（CSP 侧守卫见 test-security.js）。 */
const asrLocalSrc = read("js/asr-local.js");
check("离线识别必须走同源 worker 文件（blob Worker 会继承文档 CSP，严格策略下必被拦死）",
  /WORKER_FILE = "js\/vendor\/vosk-worker\.js"/.test(asrLocalSrc) &&
  /new Worker\(WORKER_URL\)/.test(asrLocalSrc) &&
  !/createObjectURL/.test(asrLocalSrc));
check("worker 地址与模型地址都必须解析成绝对 URL（file worker 的 location.href 在 js/vendor/ 下，相对路径必错）",
  /var MODEL_ARCHIVE_URL = absUrl\(MODEL_ARCHIVE\)/.test(asrLocalSrc) &&
  /var WORKER_URL = absUrl\(WORKER_FILE\)/.test(asrLocalSrc));
check("送音频前必须 ×0x8000（worker 直接写 HEAPF32，不缩放；漏了会识别不出文本）",
  /\* 0x8000/.test(asrLocalSrc));
check("结果解包必须只在 msg.result 是非数组对象时下钻（内层 result 是数组，展开两次 → 空文本）",
  /!Array\.isArray\(inner\)/.test(asrLocalSrc));
check("worker 的 error 必须变成可读错误（上游库在这里静默，正是用户「永远准备中」的来源）",
  /w\.onerror\s*=/.test(asrLocalSrc) && /worker 启动失败/.test(asrLocalSrc));
check("自检与正式识别必须共用同一模型来源（tar.gz + 绝对 URL），不得再传解压目录",
  /postLoad\(w, MODEL_ARCHIVE_URL\)/.test(asrLocalSrc));
check("识别必须按音频的真实采样率喂入（不得一律按 16k 猜）",
  /sampleRate: rate/.test(asrLocalSrc) && /onDone\(out, rate\)/.test(asrLocalSrc));
/* 9-10b worker 文件必须真的在站内、且与 sha256 清单一致（不联网的静态校验） */
const workerMetaPath = path.join(ROOT, "js", "vendor", "vosk-worker.meta.json");
const workerPath = path.join(ROOT, "js", "vendor", "vosk-worker.js");
let workerMetaOk = false, workerMetaWhy = "";
try {
  const meta = JSON.parse(fs.readFileSync(workerMetaPath, "utf8"));
  const buf = fs.readFileSync(workerPath);
  const digest = require("crypto").createHash("sha256").update(buf).digest("hex");
  workerMetaOk = buf.length === meta.bytes && digest === meta.sha256;
  workerMetaWhy = "bytes=" + buf.length + "/" + meta.bytes + " sha=" + digest.slice(0, 12);
} catch (e) { workerMetaWhy = String((e && e.message) || e); }
check("js/vendor/vosk-worker.js 必须在站内且与 meta 清单（字节数 + sha256）一致",
  workerMetaOk, workerMetaWhy);
check("抽取脚本 tools/build-vosk-worker.js 必须在站内（升级/复核用）",
  fs.existsSync(path.join(ROOT, "tools", "build-vosk-worker.js")));

/* 9-11 离线识别可能很慢（真机：模型下载 1 秒，但整站页面里 createModel 超过 120 秒未返回）。
   所以除了硬超时，还必须给用户一个**立刻改道**的按钮，不让他干等。 */
check("离线评分等待期间必须能一键改用在线识别（shadow-online）",
  /data-action="shadow-online"/.test(appSrc) && /case "shadow-online"/.test(appSrc) &&
  /State\.shadowUseOnline/.test(appSrc));
check("离线识别的等待必须有硬超时（不得无限等）",
  /const limitMs = first \? 90000 : 25000;/.test(appSrc));

/* 9-12 并发与启动期：真机上"启动时的自检"与"用户打开弹窗的自检"撞过车。
   两次并发 load 共用同一个 worker 存储目录 → 后者以 `Failed to open '…/downloaded.tar.gz'` 失败，
   且失败状态留在 IndexedDB 里（一次失败可能变成"以后永远失败"）。两条守卫： */
check("模型加载必须单飞（并发调用共用同一次加载，不得各发一次 load）",
  /var loadPromise = null;/.test(asrLocalSrc) &&
  /if \(loadPromise\) return loadPromise;/.test(asrLocalSrc));
check("加载失败必须换一个存储目录重试（否则残留的 downloaded.ok 会让后续每次都失败）",
  /r=" \+ Date\.now\(\)/.test(asrLocalSrc));
check("离线识别的自检不得在页面启动时跑（否则每次打开站点都白下载 41MB，还会与弹窗自检并发）",
  (function () {
    const openIdx = appSrc.indexOf("function open() {");
    const callIdx = appSrc.indexOf("checkLocalASR();");
    return openIdx > 0 && callIdx > openIdx && (callIdx - openIdx) < 300 &&
      /function checkLocalASR\(\)/.test(appSrc);
  })());

/* 9-13 「打开站点就用本地模型」与「localASROff 只表示用户明确关过」
   把自检挪出启动路径后，用户必须先打开「发音设置」才会被启用 —— 那是个隐藏陷阱：
   本机明明有模型，用户却一直走在线识别（国内不可达）而不知道为什么。
   现在启动时只做一次 HEAD 探测（几乎零成本）就先把开关打开；41MB 的装载仍推迟到真正要用时。
   另外，自检失败**不再**写 localASROff —— 否则一次性抽风就把这个浏览器永久降级。 */
check("启动时必须用极轻的探测自动启用本地识别（否则用户不打开设置页就永远用不上）",
  /!progress\.localASROff && !progress\.localASR && setLocalASR && window\.LocalASR && window\.LocalASR\.probe/.test(appSrc));
check("localASROff 只能由「用户明确取消勾选」写入（自检失败不得永久降级该浏览器）",
  /progress\.localASROff = !progress\.localASR/.test(appSrc) &&
  !/progress\.localASROff = true/.test(appSrc));

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
