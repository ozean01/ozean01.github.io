#!/usr/bin/env node
/* 验收：诚实性不变量（P1-4 / P1-5 / P1-6）
   这个门禁守的是「站点不许把弱证据说成强结论」。每条都对应一次真实的评审发现：
     · P1-4 首页「能力」栏曾被一键自评（点 ✓ 标记的已掌握词）填满；
     · P1-5 走势快照只对手动标记过单词的人记录；复测每次换题却照样对比；
     · P1-6 综合分/段位在 1 条记录时就给出「母语级」；3 个词就能触发「趋势上升」。
   做法：源码级不变量（先剔注释，避免命中解释性文字）+ 关键渲染串。零依赖、不启动 DOM。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) pass = false;
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const app = read("js/app.js");
const appCode = stripComments(app);
const radar = read("js/radar.js");
const radarCode = stripComments(radar);
const placement = read("js/placement.js");

/* ---------- P1-4：能力栏只放有留痕的结果 ---------- */
check("P1-4：首页能力栏使用「有产出证据的单元」而不是自评计数",
  /有产出证据的单元/.test(app) && /evidencedUnits\(\)\.length/.test(appCode));
check("P1-4：能力栏不再出现自评的「已掌握单词」统计卡",
  !/class="lbl">已掌握单词/.test(appCode));
check("P1-4：自评进度被明确标注为「进度」而非能力",
  /这两项都是<b>进度<\/b>，不作为能力证据/.test(app));
check("P1-4：存在出口能力证据判定，且按 anchor 精确匹配",
  /function outcomeEvidence\(/.test(appCode) &&
  /fte-sop-v1/.test(appCode) && /fte-writes-v1/.test(appCode) && /FTE_OUTCOMES/.test(appCode));
check("P1-4：手动「标记完成」绝不作为能力证据（progress.done 不出现在证据判定里）",
  !/progress\.done/.test((appCode.match(/function outcomeEvidence\([\s\S]*?\n  \}/) || [])[0] || ""));
check("P1-4：单元卡把断言与「是否留痕」一起渲染",
  /outcomeEvidenceHtml\(u\)/.test(appCode) && /尚未留痕/.test(app));

/* ---------- P1-5：快照不再被「手动标记」门控；复测可比 ---------- */
check("P1-5：快照记录基于「任意学习痕迹」而不是仅手动标记的单词",
  /function hasAnyStudy\(/.test(appCode) &&
  /if \(!hasAnyStudy\(\)\) return;/.test(appCode) &&
  /progress\.flash/.test((appCode.match(/function hasAnyStudy\([\s\S]*?\n  \}/) || [])[0] || ""));
check("P1-5：自测题库落盘（同一用户复测用同一套题）",
  /PLACE_BANK_KEY/.test(appCode) && /function loadPlacementBank\(/.test(appCode) && /function savePlacementBank\(/.test(appCode));
check("P1-5：题库变化时明确告知「不可直接比较」",
  /不可直接比较/.test(app) && /placementBankRebuilt/.test(appCode));
check("P1-5：placement.js 依据题库指纹判定可比性",
  /function scoreComparable\(/.test(placement) && /cur\.bankId === prev\.bankId/.test(placement));

/* ---------- P1-6：趋势与段位必须有样本门 ---------- */
check("P1-6：保持率趋势设置了最小复习样本门",
  /MIN_REVIEWED\s*=\s*30/.test(appCode) && /!enough\) conclusion/.test(appCode));
check("P1-6：样本不足时不输出方向性箭头",
  /trendGlyph\s*=\s*\(!r\.enough \|\| r\.trend == null\) \? ""/.test(appCode));
check("P1-6：本页自测在样本不足时标明「暂不判断方向」",
  /暂不判断方向/.test(app));
check("P1-6：雷达综合分与段位设了最小样本门",
  /MIN_SAMPLES\s*=\s*3/.test(radarCode) && /have\.length && enough\) \?/.test(radarCode));
check("P1-6：词汇维度不再把语速混进词汇量估算",
  !/uniq \* 2\.2 \+/.test(radarCode) && !/rate \/ 4/.test(radarCode));
check("P1-6：样本不足时界面明说而不是照给段位",
  /暂不给出/.test(radar) && /样本不足/.test(radar));

/* ---------- P3-1 / P4-1：语块档（短语 + 句型骨架）必须真的进入 FSRS 调度 ---------- */
const write = read("js/write.js");
const writeCode = stripComments(write);
const flash = read("js/flashcards.js");
check("P3-1：进度对象含第三条调度线 flashChunk",
  /flashChunk:\s*\{\}/.test(appCode) && /storeOf[\s\S]{0,200}progress\[k\]/.test(stripComments(flash)));
check("P3-1：语块档映射到 flashChunk 存储线（与接受/产出两条线分开）",
  /return "flashChunk";/.test(appCode) && /s\.deck && s\.deck !== "word"/.test(appCode));
check("P3-1：短语牌型的池取自本单元短语（不是词条）",
  /\(u\.phrases \|\| \[\]\)\.map/.test(appCode) && /id: "ch" \+ u\.id/.test(appCode));
check("P3-1：语块牌型方向固定为产出（正面中文）",
  /prod:\s*flashDeck === "word" \? flashProdMode : true/.test(appCode));
check("P3-1：语块档与「易错点混排」互斥",
  /includeMk = flashDeck === "word"/.test(appCode));
check("P3-1：重置单元时语块线一起清（避免孤儿状态）",
  /progress\.flashChunk\["ch" \+ u\.id/.test(appCode) && /接受档 \+ 产出档 \+ 语块档/.test(app));
check("P3-1：界面有牌型切换（起始页下拉 + 会话内循环切换）",
  /id="flashDeckSel"/.test(app) && /case "flash-deck"/.test(appCode) && /function cycleFlashDeck/.test(appCode));

/* ---------- P4-1：句型骨架入池的具体口径 ---------- */
check("P4-1：句型骨架池复用「句型克隆库」的骨架抽取",
  /window\.Patterns && window\.Patterns\.build/.test(appCode) && /Patterns\.build\(\)/.test(appCode));
check("P4-1：骨架卡有入池门槛（挖空块 ≥2 词、整句 ≤18 词、限本单元）",
  /split\(\/\\s\+\/\)\.filter\(Boolean\)\.length >= 2/.test(appCode) &&
  /split\(\/\\s\+\/\)\.filter\(Boolean\)\.length <= 18/.test(appCode) &&
  /f\.unit\.id === u\.id/.test(appCode));
check("P4-1：骨架卡 id 用**内容哈希**而不是数组下标（否则数据一改就错配记忆状态）",
  /function flashHash\(/.test(appCode) && /"fr" \+ flashHash\(f\.display/.test(appCode) &&
  !/id: "fr" \+ i\b/.test(appCode));
check("P4-1：骨架卡有专门的卡面渲染（正面挖空句+中文义，背面完整句+骨架块）",
  /card\.kind === "frame"/.test(appCode) && /骨架块：/.test(appCode) && /（说出完整句子）/.test(appCode));
check("P4-1：重置时骨架卡也被一起清（按内容哈希反查）",
  /delete progress\.flashChunk\["fr" \+ flashHash/.test(appCode));

/* ---------- P4-6：速查 / 选修型单元只做标注，不动冻结契约 ---------- */
check("P4-6：标注了速查/选修型单元（U10 选修、U13/U14 速查）",
  /REFERENCE_UNITS\s*=\s*\{/.test(appCode) && /10:\s*\{/.test(appCode) && /13:\s*\{/.test(appCode) && /14:\s*\{/.test(appCode));
check("P4-6：单元卡渲染该标注（独立 class，不复用 ps-badge）",
  /class="badge uc-ref"/.test(app) && /unitRefType\(u\)/.test(appCode));
check("P4-6：标注不参与完成判定（unitDone 不读 REFERENCE_UNITS）",
  !/REFERENCE_UNITS/.test((appCode.match(/function unitDone\([\s\S]*?\n  \}/) || [])[0] || ""));
check("P4-6：标注不改学习路径顺序（路径数据不读 REFERENCE_UNITS）",
  !/REFERENCE_UNITS/.test((appCode.match(/function pathStagesData\([\s\S]*?\n  \}/) || [])[0] || ""));

/* ---------- P3-3：产出下限（关掉「保存即算一篇」的刷量通路） ---------- */
check("P3-3：定义了产出下限阈值与统一记账函数",
  /const MIN_PROD_WORDS = 40/.test(writeCode) && /function creditProduce\(/.test(writeCode));
check("P3-3：达到下限才计入打卡，未达下限仍保存但不记账",
  /if \(n >= MIN_PROD_WORDS\)[\s\S]{0,200}CoachBridge\.done\("write"\)/.test(writeCode) &&
  /未计入今日产出/.test(write));
check("P3-3：两处写作记账都走同一函数（不再有裸调用）",
  (writeCode.match(/CoachBridge && window\.CoachBridge\.done\) window\.CoachBridge\.done\("write"\)/g) || []).length <= 1 &&
  (writeCode.match(/creditProduce\(/g) || []).length >= 3);

/* ---------- 反向守卫：不允许把「自评」重新包装成「能力」 ---------- */
const abilityCol = (appCode.match(/prog-h-ability[\s\S]{0,900}/) || [])[0] || "";
check("反向守卫：能力栏区块内不出现 totalLearned()/unitPct()/progress.done",
  !!abilityCol && !/totalLearned\(\)/.test(abilityCol) && !/unitPct\(/.test(abilityCol) && !/progress\.done/.test(abilityCol),
  abilityCol ? "" : "未能定位能力栏区块");

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
