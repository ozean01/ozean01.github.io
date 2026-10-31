#!/usr/bin/env node
/* 验收：AI 调用点清单 / 事实守卫 / 披露出口 / 术语开关 门禁（P0-07 · γ 组）
   =========================================================================
   为什么需要它：`npm test` 曾有 40 个 job 全绿，但**没有一条在管 AI 输出**。
   站点在 7 个文件里发起 OpenAI 兼容的 chat/completions 调用，把模型当业务顾问用；
   提示词里原本只有「教学」规则，等于默认「AI 说的就是对的」（S06 报告 F2/F3/F6/F9）。
   本门禁把三件事钉死成可静态断言的不变量，且**只依赖三个契约名字**、不依赖任何文案：
     · window.Tutor.FACT_GUARD   —— 唯一的事实边界常量（定义在 js/tutor.js）
     · window.AIDisclosure       —— 唯一的 AI 输出披露出口（带 data-ai-disclosure 标记）
     · termCheck                 —— 行业术语人工核对开关，默认必须为 true
   口径来源：_fte-review-2/S06-LLM应用质量与红队.md；调用点清单口径见 _probe/s06-prompt-inventory.js。

   怎么跑（在 外贸英语/ 目录下）：
     node tools/test-ai-prompt-inventory.js                # 全跑，全绿 exit 0
     node tools/test-ai-prompt-inventory.js --dump-baseline  # 打印新的调用点基线（供人工贴回本文件）
     node tools/test-ai-prompt-inventory.js --json           # 机器可读结果
     node tools/test-ai-prompt-inventory.js --help

   ⚠️ 当前红/绿取决于 β 组（P0-06）进度。本门禁刻意写成「守卫落地前就是红的」：
      β 组把 FACT_GUARD 追到每条 system 提示词、把 AIDisclosure 接到每个 AI 输出渲染点、
      并把 termCheck 默认值改成 true 之前，本门禁必须失败——这不是误报。

   ── 测得了（静态、零依赖、无网络、无 Key）──
     1. 全站 AI 调用点枚举（callChat / callLLM / 裸 /chat/completions）；
     2. 每条「组装 system 提示词」的调用点是否最终解析到 FACT_GUARD
        （允许一层间接：常量 → 局部变量 → 同文件函数，深度 3）；
     3. 每个 AI 输出渲染点是否最终解析到披露出口（AIDisclosure / aiDisclosure / data-ai-disclosure）；
     4. window.Tutor.FACT_GUARD 与 window.AIDisclosure 是否真的导出、html 出口是否带 data-ai-disclosure；
     5. termCheck 默认值是否为 true；
     6. 调用点/渲染点清单漂移（新增或删除 → 失败并要求更新基线）。

   ── 测不了 ──
     7. 模型是否**真的**遵守了守卫文本（必须真实 Key + 人工判读，见 tools/test-ai-eval-cases.js）；
     8. 提示词文本本身写得好不好、覆盖不覆盖某条红队用例（那是 S06 的人工审计结论）。
   ========================================================================= */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const JS_DIR = path.join(ROOT, "js");

/* =======================================================================
   契约名（只允许依赖这三个；改文案不影响本门禁）
   ======================================================================= */
const RE_FACT_GUARD = /\bFACT_GUARD\b/;                       /* 不含 FALLBACK_FACT_GUARD */
const RE_DISCLOSURE = /(AIDisclosure|aiDisclosure|data-ai-disclosure)/;
const TERM_CHECK_KEY = "termCheck";

/* =======================================================================
   AI 输出渲染点清单（人工维护基线；每个渲染点必须最终接上披露出口）
   改函数名 / 移动实现 → 门禁失败，要求同步更新本表（防用例与代码漂移）。
   ======================================================================= */
const RENDER_POINTS = [
  { id: "tutor-chat-bubble",  file: "js/tutor.js",  fn: "msgHtml",            what: "AI 陪练回复气泡（含翻译、新词、朗读/翻译/错题按钮）" },
  { id: "tutor-review-list",  file: "js/tutor.js",  fn: "reviewHtml",         what: "「今日错题」清单（AI 提炼的句子会写进学习记录）" },
  { id: "tutor-wordbook",     file: "js/tutor.js",  fn: "wordbookHtml",       what: "AI 回复里自动收录的新词（会回灌进后续提示词）" },
  { id: "tutor-drill",        file: "js/tutor.js",  fn: "drillBodyHtml",      what: "深度口语操练：三层复盘 / PREP 范文 / 三语对照" },
  { id: "tutor-weekly",       file: "js/tutor.js",  fn: "weeklyReport",       what: "周学习报告（文本出口，披露走 window.AIDisclosure.text）" },
  { id: "write-ai-block",     file: "js/write.js",  fn: "aiBlockHtml",        what: "写作二稿/自查的 AI 结果块" },
  { id: "write-feedback",     file: "js/write.js",  fn: "feedbackHtml",       what: "写作批改反馈（只指问题·不代写）" },
  { id: "mysay-output",       file: "js/mysay.js",  fn: "render",             what: "「说我想说」地道英文输出" },
  { id: "urgent-result",      file: "js/urgent.js", fn: "resultHtml",         what: "场景急救：3 句可直接说出口的英文" },
  { id: "eval4-content",      file: "js/eval4.js",  fn: "contentHtml",        what: "四维口语实战：AI 内容评分卡片" },
  { id: "eval4-fourdim",      file: "js/eval4.js",  fn: "resultFourDimHtml",  what: "四维口语实战：四维总分卡" },
  { id: "speech-result",      file: "js/speech.js", fn: "resultCardHtml",     what: "自由表达分析：语法/表达反馈卡" },
  { id: "quiz-write-ai",      file: "js/app.js",    fn: "writeAi",            what: "测验写作的「AI 润色/批改」出口" },
  { id: "quiz-ai-result",     file: "js/quiz.js",   fn: "aiqResultHtml",      what: "AI 周测 / 投料口理解题的逐题讲错结果（P20：只作练习，不计成绩/不作为能力证据）" },
  { id: "lookup-ai-card",     file: "js/lookup.js", fn: "aiCardHtml",         what: "查词页未命中词的 AI 解释（任务3：只作练习，不写盘；走 callChat + FACT_GUARD + 披露）" }
];

/* =======================================================================
   调用点基线（漂移检测用）。生成方式：node tools/test-ai-prompt-inventory.js --dump-baseline
   硬失败条件：调用点被**新增或删除**（(file, kind) 多重集变化）→ 必须更新基线。
   仅行号位移不算失败，只打印 diff（β 组正在同文件里改代码）。
   ======================================================================= */
const BASELINE = {
  calls: [
    /* P2-12（2026-10-24）：传输层收敛进 js/llm.js（chat + probe 两处 fetch），
       eval4/speech/tutor 的原 transport 实现改为 LLM.chat/probe 薄委托——
       本基线随之刷新（--dump-baseline 输出）。提示词组装点（call:system）数量与归属未变。
       P20（2026-10-30）：新增 js/quiz.js 一处 call:system（AI 周测 / 投料口理解题共用），
       提示词经 aiqSystem() → aiqFactGuard() → window.Tutor.FACT_GUARD 解析到事实守卫。
       任务3（2026-10-31）：新增 js/lookup.js 一处 call:system（查词页未命中词的 AI 解释；
       系统提示词后无条件拼 window.Tutor.FACT_GUARD，未加载时用逐字等价的降级副本；
       渲染出口 aiCardHtml 接 window.AIDisclosure.html）。app.js 行号因删注释而位移，不算漂移。 */
    "js/app.js:3433:call:system",
    "js/eval4.js:162:call:def",
    "js/eval4.js:181:call:system",
    "js/llm.js:46:fetch:probe",
    "js/llm.js:76:fetch:probe",
    "js/lookup.js:437:call:system",
    "js/mysay.js:188:call:system",
    "js/quiz.js:346:call:system",
    "js/speech.js:140:call:def",
    "js/speech.js:158:call:system",
    "js/tutor.js:796:call:system",
    "js/tutor.js:867:call:def",
    "js/tutor.js:1046:call:system",
    "js/tutor.js:1250:call:system",
    "js/tutor.js:1430:call:system",
    "js/tutor.js:1475:call:system",
    "js/tutor.js:1972:call:system",
    "js/urgent.js:306:call:system",
    "js/write.js:767:call:system"
  ],
  renders: RENDER_POINTS.map(function (r) { return r.file + "::" + r.fn; })
};

/* =======================================================================
   基础工具
   ======================================================================= */
let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) pass = false;
}
function note(msg) { console.log("   " + msg); }
function readSite(rel) {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}
function lineOf(src, idx) { return src.slice(0, idx).split("\n").length; }

/* 去注释（保留字符串里的 http://），避免把注释里提到的契约名当成落地 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, " "); })
    .replace(/(^|[^:"'\\])\/\/[^\n]*/g, function (m, p1) { return p1 + " ".repeat(m.length - p1.length); });
}

/* 从 fromLine（0 基）开始做括号匹配，返回结束行（0 基） */
function braceEnd(lines, fromLine) {
  let depth = 0, started = false, end = fromLine;
  for (let j = fromLine; j < lines.length; j++) {
    const s = lines[j];
    for (let k = 0; k < s.length; k++) {
      const ch = s[k];
      if (ch === "{") { depth++; started = true; }
      else if (ch === "}") { depth--; }
    }
    if (started && depth <= 0) { end = j; break; }
    if (j - fromLine > 6000) { end = j; break; }
  }
  return end;
}

/* 找到 name 的定义行：取离 hint 最近的定义（优先前置，其次后置） */
function findDefLine(lines, name, hint) {
  const reFn = new RegExp("^\\s*(?:async\\s+)?function\\s+" + name + "\\s*\\(");
  const reVar = new RegExp("^\\s*(?:const|let|var)\\s+" + name + "\\s*=");
  const all = [];
  for (let i = 0; i < lines.length; i++) {
    if (reFn.test(lines[i]) || reVar.test(lines[i])) all.push(i);
  }
  if (!all.length) return -1;
  if (hint == null) return all[0];
  const before = all.filter(function (i) { return i <= hint; });
  if (before.length) return before[before.length - 1];
  return all[0];
}

/* 定义行 → 代码块行区间（0 基，闭区间）
   函数：大括号匹配；变量赋值：扫到「括号已闭合且该行以 ; 结束」为止（最多 24 行）。
   ⚠️ 不能用「括号回到 0 就停」——提示词字符串正文里常带 (0-100) 这类括号，会提前截断，
   把同一行的 + factGuard() 挡在块外，造成假红。 */
function blockFromDef(lines, defLine) {
  const isFn = /^\s*(?:async\s+)?function\s+/.test(lines[defLine]);
  if (isFn) return { start: defLine, end: braceEnd(lines, defLine) };
  let depth = 0, end = defLine;
  for (let j = defLine; j < lines.length && j - defLine < 24; j++) {
    const s = lines[j];
    for (let k = 0; k < s.length; k++) {
      const ch = s[k];
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") depth--;
    }
    end = j;
    if (depth <= 0 && /;\s*$/.test(s)) break;
  }
  return { start: defLine, end: end };
}

const IDENT_RE = /\b[A-Za-z_$][A-Za-z0-9_$]*\b/g;
const STOP_IDENTS = { "function": 1, "return": 1, "const": 1, "let": 1, "var": 1, "if": 1, "else": 1, "new": 1, "typeof": 1, "true": 1, "false": 1, "null": 1, "undefined": 1, "this": 1, "window": 1, "document": 1, "String": 1, "Number": 1, "Object": 1, "Array": 1, "JSON": 1, "Math": 1, "Boolean": 1 };

/* 在 [start,end] 行区间里找 token；找不到就顺着「同文件里被引用的标识符」再找（深度 ≤ depth） */
function resolveToken(lines, start, end, re, depth, seen) {
  seen = seen || {};
  const text = lines.slice(start, end + 1).join("\n");
  if (re.test(text)) return true;
  if (depth <= 0) return false;
  const ids = [];
  let m;
  IDENT_RE.lastIndex = 0;
  while ((m = IDENT_RE.exec(text)) !== null) {
    const id = m[0];
    if (STOP_IDENTS[id] || seen[id]) continue;
    if (ids.indexOf(id) === -1) ids.push(id);
  }
  for (const id of ids) {
    const def = findDefLine(lines, id, start);
    if (def < 0) continue;
    const blk = blockFromDef(lines, def);
    seen[id] = 1;
    const hit = resolveToken(lines, blk.start, blk.end, re, depth - 1, seen);
    delete seen[id];      /* 只防环，不污染兄弟分支（深度耗尽不应让别的分支误判） */
    if (hit) return true;
  }
  return false;
}

/* =======================================================================
   ① 枚举 AI 调用点
   ======================================================================= */
function listJsFiles() {
  return fs.readdirSync(JS_DIR).filter(function (f) { return /\.js$/.test(f); }).sort();
}

function enumerateCallSites() {
  const sites = [];
  listJsFiles().forEach(function (f) {
    const rel = "js/" + f;
    const src = readSite(rel);
    if (src == null) return;
    const clean = stripComments(src);
    const lines = clean.split("\n");
    const rawLines = src.split("\n");
    let m;

    /* 1) callChat / callLLM 的定义与调用 */
    const reCall = /\b(callChat|callLLM)\s*\(/g;
    while ((m = reCall.exec(clean)) !== null) {
      const line = lineOf(clean, m.index);
      const isDef = /function\s+$/.test(clean.slice(Math.max(0, m.index - 30), m.index));
      if (isDef) { sites.push({ file: rel, line: line, kind: "call", role: "def", expr: "", snippet: rawLines[line - 1].trim().slice(0, 120) }); continue; }
      /* 往回 40 行找 system 提示词组装 */
      let sysLine = -1, sysExpr = "";
      for (let j = line - 1; j >= Math.max(0, line - 41); j--) {
        const sm = lines[j].match(/role:\s*["']system["']\s*,\s*content:\s*([\s\S]*)$/);
        if (sm) {
          sysLine = j + 1;
          sysExpr = sm[1] + "\n" + lines.slice(j + 1, j + 6).join("\n");
          break;
        }
      }
      sites.push({
        file: rel, line: line, kind: "call",
        role: sysLine > 0 ? "system" : "raw",
        sysLine: sysLine, expr: sysExpr,
        snippet: rawLines[line - 1].trim().slice(0, 120)
      });
    }

    /* 2) 裸 /chat/completions（传输层实现 或 连通性探针） */
    const reFetch = /\/chat\/completions/g;
    while ((m = reFetch.exec(clean)) !== null) {
      const line = lineOf(clean, m.index);
      /* 判断是否落在某个函数体内 */
      let owner = "";
      for (const n of ["callChat", "callLLM"]) {
        const def = findDefLine(lines, n);
        if (def < 0) continue;
        const blk = blockFromDef(lines, def);
        if (line - 1 >= blk.start && line - 1 <= blk.end) owner = n;
      }
      sites.push({ file: rel, line: line, kind: "fetch", role: owner ? "transport" : "probe", expr: "", snippet: rawLines[line - 1].trim().slice(0, 120) });
    }
  });
  sites.sort(function (a, b) { return a.file === b.file ? a.line - b.line : (a.file < b.file ? -1 : 1); });
  return sites;
}

/* =======================================================================
   ② 渲染点定位
   ======================================================================= */
function locateRenderPoints() {
  return RENDER_POINTS.map(function (rp) {
    const src = readSite(rp.file);
    if (src == null) return Object.assign({}, rp, { ok: false, why: "文件不存在" });
    const clean = stripComments(src);
    const lines = clean.split("\n");
    const re = new RegExp("^\\s*(?:async\\s+)?function\\s+" + rp.fn + "\\s*\\(");
    const hits = [];
    lines.forEach(function (l, i) { if (re.test(l)) hits.push(i); });
    if (hits.length !== 1) return Object.assign({}, rp, { ok: false, why: "定位到 " + hits.length + " 处 function " + rp.fn + "（要求恰好 1 处，需更新基线）" });
    const blk = blockFromDef(lines, hits[0]);
    const has = resolveToken(lines, blk.start, blk.end, RE_DISCLOSURE, 3, {});
    return Object.assign({}, rp, { ok: has, line: hits[0] + 1, why: has ? "" : "该渲染点未接披露出口（window.AIDisclosure / data-ai-disclosure）" });
  });
}

/* =======================================================================
   ③ 契约出口 / 开关
   ======================================================================= */
/* 从 `NAME = {` 起大括号匹配，返回整块文本（用于导出对象/出口对象的存在性断言） */
function braceBlockAfter(src, assignRe) {
  const m = src.match(assignRe);
  if (!m) return null;
  const i = m.index;
  const open = src.indexOf("{", i);
  if (open < 0) return null;
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    const ch = src[k];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

function checkContracts() {
  const tutor = readSite("js/tutor.js") || "";
  const clean = stripComments(tutor);

  check("js/tutor.js 定义了事实守卫常量 FACT_GUARD", /\b(const|let|var)\s+FACT_GUARD\s*=/.test(clean));
  const exportBlock = braceBlockAfter(clean, /\bwindow\.Tutor\s*=\s*\{/);
  check("window.Tutor 导出了 FACT_GUARD", !!exportBlock && /\bFACT_GUARD\b/.test(exportBlock),
    exportBlock ? "" : "未找到 window.Tutor = { … } 导出块");

  check("js/tutor.js 导出了 window.AIDisclosure", /window\.AIDisclosure\s*=/.test(clean));
  const attrOk = /data-ai-disclosure/.test(clean);
  check("披露出口带 data-ai-disclosure 标记", attrOk);
  const adBlock = braceBlockAfter(clean, /\bwindow\.AIDisclosure\s*=\s*\{/);
  check("window.AIDisclosure 提供 html / text 两个出口", !!adBlock && /\bhtml\b/.test(adBlock) && /\btext\b/.test(adBlock),
    adBlock ? "" : "未找到 window.AIDisclosure = { … } 定义块");

  /* termCheck 默认值 */
  const hits = [];
  const lines = clean.split("\n");
  lines.forEach(function (l, i) {
    if (new RegExp("\\b" + TERM_CHECK_KEY + "\\s*:").test(l)) hits.push({ line: i + 1, text: l.trim() });
  });
  check("js/tutor.js 存在 " + TERM_CHECK_KEY + " 配置项", hits.length > 0);
  const defaults = hits.filter(function (h) { return /^\s*[a-zA-Z]*:?\s*\{/.test(h.text) || /\{.*termCheck:/.test(h.text); });
  const trueHits = hits.filter(function (h) { return new RegExp(TERM_CHECK_KEY + "\\s*:\\s*true").test(h.text); });
  const falseHits = hits.filter(function (h) { return new RegExp(TERM_CHECK_KEY + "\\s*:\\s*false").test(h.text); });
  check("termCheck 默认值为 true", trueHits.length > 0 && falseHits.length === 0,
    "true=" + trueHits.length + " false=" + falseHits.length + (falseHits.length ? "（默认对象里仍是 false：P0-06 未落地）" : ""));
  hits.forEach(function (h) { note("termCheck@" + h.line + " → " + h.text.slice(0, 110)); });
  return { defaults: defaults.length, trueHits: trueHits.length, falseHits: falseHits.length };
}

/* =======================================================================
   ④ 漂移检测
   ======================================================================= */
function keyOf(site) { return site.file + ":" + site.line + ":" + site.kind + ":" + site.role; }
/* 漂移比对用「去掉行号」的签名：file:kind:role —— β 组同文件里改代码只挪行号，不算新增/删除调用点 */
function sigOfKey(k) { const p = k.split(":"); return p[0] + ":" + p[2] + ":" + p[3]; }

function checkDrift(sites, renders) {
  const now = sites.map(keyOf);
  const base = BASELINE.calls;
  const nowSig = {}, baseSig = {};
  now.forEach(function (k) { const s = sigOfKey(k); nowSig[s] = (nowSig[s] || 0) + 1; });
  base.forEach(function (k) { const s = sigOfKey(k); baseSig[s] = (baseSig[s] || 0) + 1; });
  const added = Object.keys(nowSig).filter(function (s) { return (nowSig[s] || 0) > (baseSig[s] || 0); });
  const removed = Object.keys(baseSig).filter(function (s) { return (baseSig[s] || 0) > (nowSig[s] || 0); });
  check("AI 调用点数量未漂移（新增/删除即失败）", added.length === 0 && removed.length === 0,
    (added.length ? "新增：" + added.join(", ") : "") + (removed.length ? (added.length ? "；" : "") + "删除：" + removed.join(", ") : ""));
  const lineMoved = now.filter(function (k) { return base.indexOf(k) === -1; }).filter(function (k) {
    return base.some(function (b) { return sigOfKey(b) === sigOfKey(k); });
  });
  if (lineMoved.length) {
    note("行号位移（同文件同类型调用点，不算失败，但建议刷新基线）：");
    lineMoved.forEach(function (k) {
      const s = sigOfKey(k);
      const old = base.find(function (b) { return sigOfKey(b) === s && b !== k; });
      note("   " + (old || "?") + "  →  " + k);
    });
  }
  /* 渲染点清单漂移 */
  const rNow = renders.map(function (r) { return r.file + "::" + r.fn; });
  const missing = BASELINE.renders.filter(function (k) { return rNow.indexOf(k) === -1; });
  const extra = rNow.filter(function (k) { return BASELINE.renders.indexOf(k) === -1; });
  check("AI 输出渲染点清单未漂移", missing.length === 0 && extra.length === 0,
    (missing.length ? "基线里有但现在找不到：" + missing.join(", ") + "（函数被改名/移动 → 更新基线）" : "") +
    (extra.length ? "；基线里没有：" + extra.join(", ") : ""));
}

/* =======================================================================
   主流程
   ======================================================================= */
const argv = process.argv.slice(2);
const mode = argv.find(function (a) { return a.indexOf("--") === 0; }) || "--all";

if (mode === "--help" || mode === "-h") {
  console.log("用法：node tools/test-ai-prompt-inventory.js [--dump-baseline|--json|--help]");
  process.exit(0);
}

const sites = enumerateCallSites();
const renders = locateRenderPoints();

if (mode === "--dump-baseline") {
  console.log("/* 调用点基线（贴回 tools/test-ai-prompt-inventory.js 的 BASELINE.calls） */");
  sites.forEach(function (s) { console.log('    "' + keyOf(s) + '",'); });
  console.log("\n/* 渲染点基线 */");
  RENDER_POINTS.forEach(function (r) { console.log('    "' + r.file + "::" + r.fn + '",'); });
  process.exit(0);
}

const jsonOut = { sites: sites, renders: renders.map(function (r) { return { id: r.id, file: r.file, fn: r.fn, line: r.line, ok: r.ok, why: r.why }; }), checks: null, pass: null };

console.log("AI 调用点 / 事实守卫 / 披露出口门禁（静态 · 零依赖 · 无网络 · 无 Key）");
console.log("仓库=" + ROOT + "   JS 文件=" + listJsFiles().length + "   检出调用点=" + sites.length + "\n");

console.log("==== ① AI 调用点清单与事实守卫（FACT_GUARD）覆盖 ====");
const systemSites = sites.filter(function (s) { return s.role === "system"; });
const guarded = [], unguarded = [];
systemSites.forEach(function (s) {
  const src = readSite(s.file);
  const lines = stripComments(src).split("\n");
  let ok = false;
  if (s.sysLine > 0) {
    ok = resolveToken(lines, s.sysLine - 1, s.sysLine - 1 + 5, RE_FACT_GUARD, 3, {});
  }
  (ok ? guarded : unguarded).push(s);
  console.log((ok ? "✅ " : "❌ ") + " " + s.file + ":" + s.line + "  [system@" + s.sysLine + "]  " +
    (ok ? "已加事实守卫（解析到 FACT_GUARD）" : "未加事实守卫 —— 该 system 提示词组装处没有 FACT_GUARD"));
  note(s.snippet);
});
check("\n每条 system 提示词组装都含事实守卫 FACT_GUARD（" + guarded.length + "/" + systemSites.length + "）", unguarded.length === 0,
  unguarded.length ? "未守卫：" + unguarded.map(function (s) { return s.file + ":" + s.line; }).join(", ") : "");
note("非 system 角色的 AI 调用点（不适用守卫断言，但计入漂移基线）：");
sites.filter(function (s) { return s.role !== "system"; }).forEach(function (s) {
  note("   [" + s.role + "] " + s.file + ":" + s.line + "   " + s.snippet);
});

console.log("\n==== ② AI 输出渲染点与披露出口（window.AIDisclosure / data-ai-disclosure）覆盖 ====");
const rOk = renders.filter(function (r) { return r.ok; });
renders.forEach(function (r) {
  console.log((r.ok ? "✅ " : "❌ ") + " " + r.id + "  " + r.file + (r.line ? ":" + r.line : "") + "  function " + r.fn + "()  —— " + r.what);
  if (!r.ok) note("   " + r.why);
});
check("\n每个 AI 输出渲染点都接上披露出口（" + rOk.length + "/" + renders.length + "）", rOk.length === renders.length,
  renders.filter(function (r) { return !r.ok; }).map(function (r) { return r.id; }).join(", "));

console.log("\n==== ③ 契约出口与开关 ====");
const sw = checkContracts();

console.log("\n==== ④ 调用点 / 渲染点漂移检测 ====");
checkDrift(sites, renders);

jsonOut.checks = { systemSites: systemSites.length, guarded: guarded.length, renders: renders.length, renderOk: rOk.length, termCheck: sw };
jsonOut.pass = pass;

if (mode === "--json") {
  console.log("\n---- JSON ----");
  console.log(JSON.stringify(jsonOut, null, 2));
}

console.log("\n========================================");
console.log("AI 调用点 " + sites.length + " 个（system 提示词组装 " + systemSites.length +
  " 个：已加守卫 " + guarded.length + " / 未加 " + unguarded.length + "）");
console.log("AI 输出渲染点 " + renders.length + " 个：已接披露 " + rOk.length + " / 未接 " + (renders.length - rOk.length));
console.log(pass ? "✅ 全部通过。" : "❌ 存在失败项（守卫/披露未落地前，这里本来就该是红的）。");
console.log("刷新基线：node tools/test-ai-prompt-inventory.js --dump-baseline");
process.exit(pass ? 0 : 1);
