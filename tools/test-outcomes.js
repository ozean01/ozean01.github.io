#!/usr/bin/env node
/* 验收测试：出口能力断言（P1-B）——「学完你能做什么」必须条条有产出锚点。
   由来：方案 §5.2-P1-B 的六条硬门禁、T3 §B-R1「没有产出的断言会退化成语义噪声」。
   断言一旦只写在卡片上、背后没有站内可留痕的产出物，用户按它选单元后**拿不到任何凭证**——
   所以本脚本的重点不是"文案好不好听"，而是**每条断言都能在 js/ 里回查到真实产出物**。

   校验清单（逐条对应门禁）：
     ① 覆盖：19 个单元全部有交代（18 条断言 + 1 个显式例外），无静默漏写
     ② 锚点存在（门禁 2）：kind ∈ {write, sop, eval4}，ref 在 js/ 里真实存在
     ③ 锚点唯一（加严）：同一 (kind, ref) 不得被两个单元共用——两个单元签收同一份凭证 = 锚点失效
     ④ 锚点精确：write 必须落在具体场景 id / 来信 id，不得笼统指向页面
     ⑤ 标签对账：anchor.label 必须与源数据的标题同源（前缀一致），防文案漂移
     ⑥ 门禁 4：断言以「能」开头，「掌握/了解/熟悉」计数 = 0
     ⑦ 门禁 5：断言文案里 CEFR 档位与数字计数 = 0
     ⑧ 验收④：新手不认识的行业黑话不得出现在断言**首句**
     ⑨ 门禁 3：难度标签保留、只并列不替换；断言块不以「是否已完成」为显示门槛
     ⑩ 口径隔离：outcomes.js 与断言渲染块不出现进度/难度口径符号，且不新增页面/导航/路由
     ⑪ 接线：index.html 前置加载 outcomes.js、sw.js 预缓存且 CACHE 已升版、三段缓存策略不变 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const appjs = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
const outcomesSrc = fs.readFileSync(path.join(ROOT, "js", "outcomes.js"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) pass = false;
}

/* ---------------- 取出映射（在最小沙箱里执行 outcomes.js，不引浏览器） ---------------- */
const win = {};
new Function("window", outcomesSrc)(win);
const OUT = win.FTE_OUTCOMES;
check("js/outcomes.js 挂载 window.FTE_OUTCOMES", !!OUT && !!OUT.items);
if (!OUT) { console.log("\n=== SOME FAILED ==="); process.exit(1); }

const items = OUT.items || {};
const exempt = OUT.exempt || {};

/* 单元清单取自站点数据源（不写死 19，避免将来加单元时测试与文档一起过期）。
   注意：单元分布在多个 data 文件里（data.js 建 1–11，其余 data-*.js 各自 push 追加），
   所以必须扫全部 js/data*.js——只读 data.js 会漏掉 12–19，测试就会「通过却少算」。 */
const dataFiles = fs.readdirSync(path.join(ROOT, "js")).filter(function (f) { return /^data.*\.js$/.test(f); });
const unitIdSet = [];
dataFiles.forEach(function (f) {
  const src = fs.readFileSync(path.join(ROOT, "js", f), "utf8");
  [...src.matchAll(/id:\s*(\d+),\s*\n\s*title:/g)].forEach(function (m) {
    const id = Number(m[1]);
    if (unitIdSet.indexOf(id) === -1) unitIdSet.push(id);
  });
});
const unitIds = unitIdSet.sort(function (a, b) { return a - b; });
check("从 js/data*.js 提取到全部单元 id", unitIds.length === 19, "n=" + unitIds.length + " → " + unitIds.join(","));

/* ---------------- ⓪ 源数据：三类产出锚点的事实（逐条回查 js/，不信任映射自述） ---------------- */
const writeSrc = fs.readFileSync(path.join(ROOT, "js", "write.js"), "utf8");
const mailSrc = fs.readFileSync(path.join(ROOT, "js", "data-mail.js"), "utf8");
const sopSrc = fs.readFileSync(path.join(ROOT, "js", "sop.js"), "utf8");
const eval4Src = fs.readFileSync(path.join(ROOT, "js", "eval4.js"), "utf8");

/* 产出物 id -> 标题，从源文件里现取（供「标签对账」用） */
function titleAfter(src, anchorRe) {
  const out = {};
  const re = new RegExp(anchorRe.source, "g");
  let m;
  while ((m = re.exec(src)) !== null) {
    const tail = src.slice(m.index, m.index + 500);
    const t = tail.match(/title:\s*"([^"]*)"/);
    if (t) out[m[1]] = t[1];
  }
  return out;
}
const WRITE_SCENES = titleAfter(writeSrc, /id:\s*"([a-z-]+)"/);
const MAIL_THREADS = titleAfter(mailSrc, /id:\s*"([a-z-]+)"/);
const EVAL4_SCENES = titleAfter(eval4Src, /id:\s*"([a-z-]+)"/);
const SOP_STEPS = {};
[...sopSrc.matchAll(/k:\s*"(s\d[a-z])",\s*cn:\s*"([^"]+)"/g)].forEach(function (m) { SOP_STEPS[m[1]] = m[2]; });

check("js/write.js 有 6 个写作场景", Object.keys(WRITE_SCENES).length === 6, Object.keys(WRITE_SCENES).join(","));
check("js/data-mail.js 有 8 封真实来信", Object.keys(MAIL_THREADS).length === 8, Object.keys(MAIL_THREADS).join(","));
check("js/sop.js 有 27 步实操清单", Object.keys(SOP_STEPS).length === 27, "n=" + Object.keys(SOP_STEPS).length);
check("js/eval4.js 有 6 个实战场景", Object.keys(EVAL4_SCENES).length === 6, Object.keys(EVAL4_SCENES).join(","));

const REFS = {
  write: Object.keys(WRITE_SCENES).concat(Object.keys(MAIL_THREADS)).reduce(function (o, k) { o[k] = [WRITE_SCENES[k] || MAIL_THREADS[k]]; return o; }, {}),
  sop: Object.keys(SOP_STEPS).reduce(function (o, k) { o[k] = [SOP_STEPS[k]]; return o; }, {}),
  eval4: Object.keys(EVAL4_SCENES).reduce(function (o, k) { o[k] = [EVAL4_SCENES[k]]; return o; }, {})
};

/* ---------------- ① 覆盖：19/19 都有交代 ---------------- */
const registered = Object.keys(items).concat(Object.keys(exempt)).map(Number).sort(function (a, b) { return a - b; });
const missingUnits = unitIds.filter(function (id) { return registered.indexOf(id) === -1; });
check("19 个单元全部有交代（断言或显式无锚点例外，无静默漏写）",
  missingUnits.length === 0, missingUnits.length ? "漏：" + missingUnits.join(",") : "断言 " + Object.keys(items).length + " 条 + 例外 " + Object.keys(exempt).length + " 个");
check("有断言 + 有例外 = 单元总数（不多不少）",
  Object.keys(items).length + Object.keys(exempt).length === unitIds.length,
  Object.keys(items).length + " + " + Object.keys(exempt).length + " vs " + unitIds.length);
check("无锚点单元不写占位断言（exempt 里的单元不得同时出现在 items 里）",
  Object.keys(exempt).every(function (k) { return !items[k]; }), Object.keys(exempt).join(","));
check("无锚点例外必须写明理由（不是空占位）",
  Object.keys(exempt).every(function (k) { return String(exempt[k] || "").length >= 30; }));

/* ---------------- ② 锚点存在（门禁 2） ---------------- */
const KINDS = ["write", "sop", "eval4"];
const badKind = [], badRef = [], badLabel = [];
const seen = {}, dupRefs = [];
Object.keys(items).forEach(function (uid) {
  const it = items[uid] || {};
  const a = it.anchor || {};
  if (KINDS.indexOf(a.kind) === -1) { badKind.push(uid + ":" + a.kind); return; }
  if (!REFS[a.kind][a.ref]) { badRef.push(uid + " → " + a.kind + "/" + a.ref); return; }
  const key = a.kind + "/" + a.ref;
  if (seen[key]) dupRefs.push(key + "（单元 " + seen[key] + " 与 " + uid + "）");
  seen[key] = uid;
  const srcTitle = REFS[a.kind][a.ref][0];
  if (!a.label || srcTitle.indexOf(a.label) !== 0) badLabel.push(uid + " label=「" + a.label + "」源标题=「" + srcTitle + "」");
});
check("每条断言的 anchor.kind ∈ {write, sop, eval4}（门禁 2 的三选一）", badKind.length === 0, badKind.join(", "));
check("每条断言的 anchor.ref 在站内确实存在（write.js 独立稿 / sop.js 27 步 / eval4.js 四维评分）",
  badRef.length === 0, badRef.join("；"));
check("anchor 精确到具体产出物，不是笼统指向页面（无 '#/'、无空 ref）",
  Object.keys(items).every(function (uid) { return /^[a-z][a-z0-9-]*$/.test(items[uid].anchor.ref); }));
check("③ 锚点唯一：同一 (kind, ref) 不被两个单元共用（加严项）",
  dupRefs.length === 0, dupRefs.join("；"));
console.log("  锚点分布：" + KINDS.map(function (k) {
  return k + "=" + Object.keys(items).filter(function (u) { return items[u].anchor.kind === k; }).length;
}).join(" · ") + "；唯一锚点 " + Object.keys(seen).length + " 个");
check("⑤ 锚点标签与源数据同源（label 是源标题的前缀，防文案漂移）", badLabel.length === 0, badLabel.join("；"));

/* ---------------- ⑥⑦⑧ 文案门禁 ---------------- */
const SAYS = Object.keys(items).map(function (uid) { return { id: uid, say: String(items[uid].say || "") }; });
check("每条断言都有非空文案", SAYS.every(function (x) { return x.say.length >= 20; }));

const notResultVerb = SAYS.filter(function (x) { return x.say.charAt(0) !== "能"; });
check("⑥ 门禁 4：断言以结果动词「能…」开头（计数 = 0 例外）", notResultVerb.length === 0,
  notResultVerb.map(function (x) { return x.id; }).join(","));

const PROCESS_WORDS = ["掌握", "了解", "熟悉"];
const processHits = [];
SAYS.forEach(function (x) {
  PROCESS_WORDS.forEach(function (w) { if (x.say.indexOf(w) !== -1) processHits.push("U" + x.id + ":" + w); });
});
check("门禁 4：流程/状态动词（掌握/了解/熟悉）在断言原文里的条数 = 0", processHits.length === 0, processHits.join(","));

const CEFR_RE = /\b(A1|A2|B1|B2|C1|C2)\b/;
const cefrHits = SAYS.filter(function (x) { return CEFR_RE.test(x.say); });
check("⑦ 门禁 5：断言文案含 CEFR 档位的条数 = 0", cefrHits.length === 0, cefrHits.map(function (x) { return x.id; }).join(","));
const digitHits = SAYS.filter(function (x) { return /[0-9]/.test(x.say); });
check("门禁 5：断言文案含数字的条数 = 0（不借用任何水平/难度数字）", digitHits.length === 0,
  digitHits.map(function (x) { return x.id + ":" + (x.say.match(/[0-9]+/g) || []).join("|"); }).join(","));

/* 验收④：行业黑话不得出现在断言**首句**（首句 = 第一个句号/分号之前的那一句） */
const JARGON = ["8D", "MOQ", "COA", "TDS", "MSDS", "PI", "B/L", "FOB", "CIF", "DDP", "HS编码", "SCM", "OEM", "ODM"];
const jargonHits = [];
SAYS.forEach(function (x) {
  const first = x.say.split(/[。；]/)[0];
  JARGON.forEach(function (w) {
    /* 全大写缩略词按词边界匹配，避免撞上中文或普通英文单词内部 */
    const re = /^[A-Za-z/]+$/.test(w) ? new RegExp("(?<![A-Za-z])" + w.replace("/", "\\/") + "(?![A-Za-z])") : new RegExp(w);
    if (re.test(first)) jargonHits.push("U" + x.id + ":" + w);
  });
});
check("⑧ 验收④：新手不认识的行业黑话不在断言首句（8D / MOQ / COA…）", jargonHits.length === 0, jargonHits.join(","));
check("行业黑话也不出现在断言全文（首句之外同样不该出现）",
  SAYS.every(function (x) { return x.say.split(/[。；]/).every(function (s) { return JARGON.every(function (w) { return s.indexOf(w) === -1; }); }); }),
  SAYS.filter(function (x) { return JARGON.some(function (w) { return x.say.indexOf(w) !== -1; }); }).map(function (x) { return x.id; }).join(","));

/* ---------------- ⑨⑩ 渲染接线与口径隔离 ---------------- */
check("⑨ 单元卡上与 uc-sum 并列渲染断言块（门禁 3：并列不替换）",
  /<div class="uc-sum">[\s\S]{0,800}?class="uc-outcome"/.test(appjs));
check("单元卡上断言块**不读**完成状态（练没练完都看得到，显示门槛只有「有登记」）",
  /\$\{oc \? '<div class="uc-outcome"/.test(appjs) && !/\$\{oc && [a-zA-Z]*(done|Done|pct)/.test(appjs));
check("难度角标保留（uc-diff / uc-diffline / ps-d 均未被替换）",
  /class="badge uc-diff"/.test(appjs) && /class="uc-diffline"/.test(appjs) && /class="ps-d"/.test(appjs));
check("单元页新起一块断言（紧挨难度块，两者并存）",
  /\$\{unitDiffBlockHtml\(u\)\}\s*\n\s*\$\{outcomeBlockHtml\(u\)\}/.test(appjs));
check("断言块走「存在即渲染、缺失即静默不渲染」（无 placeholders）",
  /if \(!oc\) return "";/.test(appjs) && !/uc-out-v[^']*占位/.test(appjs));
check("单元卡 / 单元页 / 列表页各自 class 与难度、进度不同行（uc-out-* vs uc-diff / uc-meta）",
  /class="uc-outcome"/.test(appjs) && /class="[^"]*uc-out-card/.test(appjs) && /class="[^"]*uc-out-note/.test(appjs) &&
  /class="uc-out-v"/.test(appjs) && !/class="uc-meta uc-out/.test(appjs));
check("门禁 5：断言所在处渲染口径句「本站自述，不构成任何等级认定」",
  /basis: "课程层出口能力（本站自述，不构成任何等级认定）"/.test(outcomesSrc) &&
  /esc\(OUTCOMES_BASIS\)/.test(appjs));
check("不新增页面 / 不新增一级导航（导航块未被改动）",
  (html.match(/<nav class="main-nav" id="mainNav">([\s\S]*?)<\/nav>/) || [])[1].indexOf("outcome") === -1);
check("不新增路由：锚点只指向既有页面（#/write、#/sop、#/eval4）",
  ["#/write", "#/sop", "#/eval4"].every(function (r) { return appjs.indexOf('route: "' + r + '"') !== -1; }));

const FORBIDDEN = ["progress", "unitDone", "UNIT_DONE_PCT", "doneCount", "cefr", "band"];
const hitIn = function (src) { return FORBIDDEN.filter(function (w) { return new RegExp(w, "i").test(src); }); };
check("⑩ 口径隔离：outcomes.js 内不出现进度/难度口径符号（共 0 个数字、0 个字段）",
  hitIn(outcomesSrc).length === 0, hitIn(outcomesSrc).join(","));
const outHelpers = (appjs.match(/出口能力断言（P1-B）[\s\S]*?function unitCardHtml/) || [])[0] || "";
check("提取到断言渲染辅助块", outHelpers.length > 500, "len=" + outHelpers.length);
check("口径隔离：断言渲染辅助块不读进度/难度字段", hitIn(outHelpers).length === 0, hitIn(outHelpers).join(","));
check("口径隔离：单元页断言块不看进度（无 UNIT_DONE_PCT / unitDone / pct）",
  hitIn((appjs.match(/function outcomeBlockHtml\(u\)[\s\S]*?\n  \}/) || [])[0] || "").length === 0);

/* ---------------- ⑪ 接线：加载顺序 / 预缓存 / CACHE 升版 ---------------- */
const scriptList = [...html.matchAll(/<script\s+src="(js\/[^"]+)"/g)].map(function (m) { return m[1]; });
const iOut = scriptList.indexOf("js/outcomes.js");
check("index.html 加载 js/outcomes.js", iOut !== -1);
check("outcomes.js 排在 app.js 之前（否则 app.js 读不到映射，断言块静默消失）",
  iOut !== -1 && iOut < scriptList.indexOf("js/app.js"), scriptList.slice(Math.max(0, iOut - 1), iOut + 2).join(" → "));
/* ---------------- ⑪ 接线：加载顺序 / 预缓存 / CACHE 版本 ----------------
   这一节原先把 CACHE 版本钉写成字面量 `fte-v72`；P1-C2（t6）依契约把版本升到 fte-v73 后它立刻变红。
   问题不在那一次改动，而在于**每一次合法的缓存升档都会让它变红**——「测试红了但功能没问题」会
   诱导人改测试去迁就它，这正是测试腐烂的典型路径。所以这里改为**断言属性**，不assert字面量。

   · 为什么它能捕获真缺陷：Service Worker 用 CACHE 名当缓存桶名。往 PRECACHE 里加了资源却没升
     CACHE，已安装的 PWA 会继续命中旧桶——新资源永远拿不到，而浏览器不报任何错，是最难自查的
     一类问题（本项就是这条链路的实例：outcomes.js 进预缓存时版本必须跟着动）。

   ▲ P0 第三批 · α 组（P0-08）改法 —— S10-F1：原判据**已退化为恒真**。
   原实现把「写死在本文件里的一个人工基线常量」当唯一依据，而基线一过期就变成恒真分支：
   基线 minVersion=74，现实 CACHE=fte-v96 ⇒ 往 PRECACHE 里插任何一条都满足 "96 > 74"，
   于是 M11（加资源不升版）实测 exit 0 —— 判据只能挡住"刷新基线之后的第一处遗漏"。

   现在改为**两份依据、任一不过即失败、两份都取不到也失败**，不再留恒真分支：
     依据 A（主，随仓库走）：tools/precache-baseline.json —— 最近一次被接受的
        **PRECACHE 清单集合指纹** + 该指纹对应的 CACHE 版本。
        指纹一致 ⇒ 版本 ≥ 基线；指纹不同 ⇒ 版本必须**严格大于**基线版本
        （把"清单改了却忘了升档"变成红；M11 就是这样被拦下的）。
     依据 B（辅，自动前进）：`git show HEAD:sw.js` 的清单指纹与 CACHE 版本。
        git 不可用（无 .git / 无 HEAD / 无 git 命令）时自动跳过 B。
     两份依据**同时**判定；若一侧的清单已变而另一侧没变，则按更严的一侧执行。
     两者都取不到 ⇒ 显式失败（旧实现在这种情况下恰恰会走恒真分支）。

   · 失效边界（诚实说明，与改前一致的部分不再重复）：
     1) 指纹覆盖的是**清单集合**，不是每个被预缓存文件的**内容**。改了 app.js 这类文件的内容却不升
        版本（用户会拿到旧文件），这条检查发现不了——test-assets.js 负责的是另一半（引用存在 + 清单完整）。
     2) 基线文件是「最近一次被接受的清单」的**快照**：清单发生**合法**变更（同时升档）后必须
        同步刷新它，否则它对"其后第二次改动"不再敏感。合法变更时本脚本会把新值打印出来供直接粘贴。
        这是快照式判据的固有边界，**不会**退回恒真：本次 M11 之所以能被拦下，正是因为基线 = 现实。 */
const preBlock = (sw.match(/const PRECACHE = \[([\s\S]*?)\];/) || [])[1] || "";
/* 「最近一次被接受的预缓存状态」现在存放在**仓库内的基线文件**里（tools/precache-baseline.json），
   而不是写死在本文件中的常量——这样合法的清单变更会留下可 review 的 diff，也能被 CI 检出。 */
function sha256Of(s) { return require("crypto").createHash("sha256").update(s).digest("hex"); }
/* 从任意一份 sw.js 源码解析出 {fingerprint, count, version}；解析不出返回 null（取不到依据要显式失败）。 */
function swFacts(src) {
  const text = String(src || "");
  const block = (text.match(/const PRECACHE = \[([\s\S]*?)\];/) || [])[1];
  const raw = ((text.match(/const CACHE = "([^"]+)";/) || [])[1] || "").trim();
  const ver = Number((raw.match(/^fte-v(\d+)$/) || [])[1] || NaN);
  if (block === undefined || !Number.isFinite(ver)) return null;
  const ents = [...block.matchAll(/"([^"]*)"/g)].map(function (m) { return m[1].trim(); })
    .filter(function (s) { return !!s; });
  if (!ents.length) return null;
  return { fingerprint: sha256Of(ents.slice().sort().join("\n")), count: ents.length, version: ver, cache: raw };
}
const preEntries = [...preBlock.matchAll(/"([^"]*)"/g)]
  .map(function (m) { return m[1].trim(); })
  .filter(function (s) { return !!s; });
const preFingerprint = sha256Of(preEntries.slice().sort().join("\n"));
const cacheRaw = ((sw.match(/const CACHE = "([^"]+)";/) || [])[1] || "").trim();
const cacheVer = Number((cacheRaw.match(/^fte-v(\d+)$/) || [])[1] || NaN);

/* ---- 依据 A：仓库内基线文件 ---- */
const BASELINE_FILE = path.join(__dirname, "precache-baseline.json");
let baselineWhy = "";
const refBaseline = (function () {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")); }
  catch (e) {
    baselineWhy = (e && e.code === "ENOENT") ? "文件不存在" : ("读取/解析失败：" + (e && e.message));
    return null;
  }
  if (!raw || !/^[0-9a-f]{64}$/.test(String(raw.sha256 || "")) || !Number.isFinite(Number(raw.minVersion))) {
    baselineWhy = "字段不完整（需要 sha256=64 位十六进制 + minVersion 数字）";
    return null;
  }
  return {
    name: "仓库基线 tools/precache-baseline.json",
    fingerprint: String(raw.sha256),
    count: Number(raw.count) || 0,
    version: Number(raw.minVersion),
    cache: String(raw.cache || ("fte-v" + raw.minVersion))
  };
})();

/* ---- 依据 B：git HEAD:sw.js（无需人工刷新，随提交自动前进） ---- */
const { spawnSync } = require("child_process");
let headWhy = "未取到";
let refHead = null;
const gitProbe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: ROOT, encoding: "utf8" });
if (gitProbe.error || gitProbe.status !== 0 || String(gitProbe.stdout || "").trim() !== "true") {
  headWhy = gitProbe.error ? ("git 不可用：" + gitProbe.error.message) : "当前目录不在 git 工作树内";
} else {
  const show = spawnSync("git", ["show", "HEAD:sw.js"], { cwd: ROOT, encoding: "utf8" });
  const facts = (show.status === 0 && !show.error) ? swFacts(show.stdout) : null;
  if (show.error) headWhy = "git show 失败：" + show.error.message;
  else if (show.status !== 0) headWhy = "HEAD 里没有 sw.js（尚无提交？）";
  else if (!facts) headWhy = "HEAD:sw.js 里解析不出 PRECACHE / CACHE";
  else { refHead = Object.assign({ name: "git HEAD:sw.js" }, facts); headWhy = ""; }
}

check("CACHE 版本存在且形如 fte-v<N>", Number.isFinite(cacheVer) && cacheVer > 0, cacheRaw || "（读不到）");
check("仓库内基线文件可用（tools/precache-baseline.json）", !!refBaseline,
  refBaseline
    ? ("指纹 " + refBaseline.fingerprint.slice(0, 12) + " · " + refBaseline.count + " 条 · fte-v" + refBaseline.version)
    : baselineWhy);
check("取到至少一份预缓存比对依据（基线文件 / git HEAD；取不到即失败，不留恒真分支）",
  !!(refBaseline || refHead),
  "基线 " + (refBaseline ? "有" : "无") + " · git HEAD " +
  (refHead ? ("fte-v" + refHead.version + " / " + refHead.count + " 条") : headWhy));

[refBaseline, refHead].filter(Boolean).forEach(function (ref) {
  const listUnchanged = preFingerprint === ref.fingerprint;
  const ok = listUnchanged ? cacheVer >= ref.version : cacheVer > ref.version;
  check((listUnchanged ? "预缓存清单与" : "预缓存清单较") + ref.name +
    (listUnchanged ? "一致 ⇒ CACHE 版本 ≥ fte-v" + ref.version
                   : "有变更 ⇒ CACHE 版本必须 > fte-v" + ref.version + "（否则已安装的 PWA 继续命中旧缓存桶）"),
    ok,
    (listUnchanged
      ? ("指纹一致 " + preFingerprint.slice(0, 12))
      : ("指纹 " + preFingerprint.slice(0, 12) + " ≠ 依据 " + ref.fingerprint.slice(0, 12))) +
    " · 当前 " + cacheRaw + " · 清单 " + preEntries.length + " 条（依据 " + ref.count + " 条）");
  if (!listUnchanged) {
    console.log("  ↪ 清单相对「" + ref.name + "」已变更。合法变更请在**升完 CACHE 版本之后**同步刷新基线文件：");
    console.log("     sha256: \"" + preFingerprint + "\", count: " + preEntries.length +
      ", minVersion: " + (Number.isFinite(cacheVer) ? cacheVer : ref.version));
  }
});

const VERSION_FLOOR = refBaseline ? refBaseline.version : (refHead ? refHead.version : NaN);
check("CACHE 版本不低于基线版本（防回退 / 防被改小）",
  Number.isFinite(cacheVer) && Number.isFinite(VERSION_FLOOR) && cacheVer >= VERSION_FLOOR,
  Number.isFinite(VERSION_FLOOR) ? ("当前 " + cacheRaw + " ≥ 基线 fte-v" + VERSION_FLOOR) : "取不到基线下限");
check("sw.js 预缓存清单含 ./js/outcomes.js（本项真实要验的属性，不得削弱）",
  preBlock.indexOf('"./js/outcomes.js"') !== -1);
check("index.html 的脚本都在预缓存清单里（新脚本忘了加进清单，离线就会缺文件）",
  scriptList.every(function (s) { return preEntries.indexOf("./" + s) !== -1; }));
check("缓存策略三段不变（precache+cache-first / stale-while-revalidate / 跨域不拦截）",
  /precache \+ cache-first/.test(sw) && /stale-while-revalidate/.test(sw) && /一律不拦截/.test(sw));

/* ---------------- ⑬ 渲染验收：断言真的落到了页面上 ----------------
   前面全是「源文件里有没有」的静态检查；这一节把 app.js 在沙箱里跑一遍，渲染
   「全部课程」页与单元页，对**渲染产物**做断言。理由是这两件事只有渲染才知道：
     ① 18 条文案是否真的都渲染出来（映射对了但渲染漏了一条，静态检查看不出来）；
     ② 单元 10（无锚点例外）是否**静默不渲染**——门禁 2 要求不写，写成占位文案同样是错。
   沙箱是最小 DOM：只求模块加载完、页面渲染不抛错，不模拟浏览器。 */
const vm = require("vm");
function fakeEl() {
  return {
    innerHTML: "", textContent: "", value: "", hidden: false, checked: false, disabled: false,
    style: {}, dataset: {}, children: [], childNodes: [], parentNode: null,
    offsetWidth: 0, offsetHeight: 0, width: 0, height: 0, tagName: "DIV",
    classList: { add: function () { }, remove: function () { }, toggle: function () { }, contains: function () { return false; } },
    setAttribute: function () { }, getAttribute: function () { return null; },
    removeAttribute: function () { }, hasAttribute: function () { return false; },
    addEventListener: function () { }, removeEventListener: function () { },
    appendChild: function (c) { return c; }, removeChild: function (c) { return c; },
    insertBefore: function (c) { return c; }, insertAdjacentHTML: function () { },
    insertAdjacentElement: function (p, c) { return c; },
    append: function () { }, prepend: function () { }, after: function () { }, before: function () { },
    replaceChildren: function () { }, replaceWith: function () { },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    closest: function () { return null; }, matches: function () { return false; },
    focus: function () { }, blur: function () { }, click: function () { }, scrollIntoView: function () { },
    getBoundingClientRect: function () { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; },
    getContext: function () { return null; }, toDataURL: function () { return ""; },
    play: function () { return Promise.resolve(); }, pause: function () { }, load: function () { },
    remove: function () { }, cloneNode: function () { return fakeEl(); }
  };
}
const elCache = {};
function getEl(id) { if (!elCache[id]) elCache[id] = fakeEl(); return elCache[id]; }
const winListeners = {};
const storageStub = {
  _d: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; },
  clear: function () { this._d = {}; },
  key: function () { return null; },
  get length() { return Object.keys(this._d).length; }
};
const sandbox = {
  console: console,
  addEventListener: function (t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
  removeEventListener: function () { },
  dispatchEvent: function (type) {
    (winListeners[type] = winListeners[type] || []).forEach(function (fn) { fn({ type: type }); });
    return true;
  },
  scrollTo: function () { }, scrollBy: function () { }, scroll: function () { },
  getComputedStyle: function () { return {}; },
  matchMedia: function () { return { matches: false, addEventListener: function () { } }; },
  document: {
    getElementById: getEl,
    createElement: function () { return fakeEl(); },
    createElementNS: function () { return fakeEl(); },
    createDocumentFragment: function () { return fakeEl(); },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () { }, removeEventListener: function () { },
    body: fakeEl(), head: fakeEl(), documentElement: fakeEl(),
    cookie: "", readyState: "complete", title: ""
  },
  localStorage: storageStub,
  sessionStorage: Object.assign({}, storageStub, { _d: {} }),
  location: { hash: "", href: "http://localhost/", protocol: "http:", origin: "http://localhost", reload: function () { }, replace: function () { } },
  history: { replaceState: function () { }, pushState: function () { } },
  navigator: { userAgent: "node", clipboard: null, mediaDevices: null, serviceWorker: null, language: "zh-CN" },
  screen: { width: 1280, height: 800 },
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: setInterval, clearInterval: clearInterval,
  requestAnimationFrame: function (fn) { return setTimeout(fn, 0); },
  cancelAnimationFrame: clearTimeout,
  fetch: function () { return Promise.reject(new Error("no network in test")); },
  Image: function () { return fakeEl(); },
  Audio: function () { return fakeEl(); },
  AudioContext: function () { return { createAnalyser: function () { return {}; }, close: function () { } }; },
  SpeechSynthesisUtterance: function () { return {}; },
  speechSynthesis: { speak: function () { }, cancel: function () { }, getVoices: function () { return []; }, addEventListener: function () { } },
  alert: function () { }, confirm: function () { return false; }, prompt: function () { return null; },
  URL: URL, Blob: function () { }, FileReader: function () { return { readAsText: function () { } }; },
  XMLHttpRequest: function () { return { open: function () { }, send: function () { }, setRequestHeader: function () { } }; }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
const ctx = vm.createContext(sandbox);

const loadFails = [];
scriptList.forEach(function (rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { loadFails.push(rel + "（文件不存在）"); return; }
  try { vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: rel }); }
  catch (e) { loadFails.push(rel + " → " + (e && e.message ? e.message : String(e))); }
});
check("渲染沙箱：全部脚本按 index.html 的真实顺序加载通过", loadFails.length === 0, loadFails.join("；"));

function renderPage(hash) {
  ctx.location.hash = hash;
  ctx.dispatchEvent("hashchange");
  return getEl("app").innerHTML || "";
}

let unitsHtml = "", u10Html = "", u16Html = "";
try {
  unitsHtml = renderPage("#/units");
  u10Html = renderPage("#/unit/10");
  u16Html = renderPage("#/unit/16");
} catch (e) { loadFails.push("渲染 → " + (e && e.message ? e.message : String(e))); }
check("「全部课程」页与单元页都能真实渲染且不抛错", loadFails.length === 0 && unitsHtml.length > 1000,
  "units=" + unitsHtml.length + " u10=" + u10Html.length + " u16=" + u16Html.length);

const cards = (unitsHtml.match(/class="uc-outcome"/g) || []).length;
const sumLines = (unitsHtml.match(/class="uc-sum"/g) || []).length;
const diffBadges = (unitsHtml.match(/class="badge uc-diff"/g) || []).length;
check("「全部课程」页渲染出 18 块断言（有登记才渲染）", cards === Object.keys(items).length, cards + " 块 / 映射 " + Object.keys(items).length + " 条");
check("「全部课程」页顶部渲染口径句（门禁 5：断言只落「课程层」，且不混用水平口径）",
  unitsHtml.indexOf("本站自述，不构成任何等级认定") !== -1 && unitsHtml.indexOf("uc-out-note") !== -1);
check("门禁 3：19 张单元卡上难度角标与断言并存（uc-sum 19 · uc-diff 19 · uc-outcome 18）",
  sumLines === unitIds.length && diffBadges === unitIds.length && cards === 18,
  "uc-sum=" + sumLines + " · uc-diff=" + diffBadges + " · uc-outcome=" + cards);

const notRendered = Object.keys(items).filter(function (uid) { return unitsHtml.indexOf(items[uid].say) === -1; });
check("18 条断言文案逐条出现在渲染产物里（不是只躺在映射文件里）", notRendered.length === 0,
  notRendered.length ? "漏渲染：" + notRendered.join(",") : "18/18");

/* 单元 10 的卡片确实存在（页面没塌），但它内部没有断言块——「缺」表现为不渲染，而不是占位。
   卡片内部没有嵌套 <a>（凭证在卡上渲染成 <span>），所以可以安全地取到第一个 </a> 为止。 */
const card10 = (unitsHtml.match(/<a class="unit-card" href="#\/unit\/10"[\s\S]*?<\/a>/) || [])[0] || "";
check("无锚点单元 10 的卡片存在但**不含断言块**（静默不渲染，无占位文案）",
  card10.length > 100 && card10.indexOf("uc-outcome") === -1, "卡长=" + card10.length);
check("单元 10 的单元页也没有断言块（渲染为空串，不落占位）", u10Html.indexOf("uc-out-card") === -1);
check("单元 10 的例外理由不外泄到页面（exempt 只是登记，不是给用户看的文案）",
  u10Html.indexOf("不写断言") === -1 && unitsHtml.indexOf("没有合适锚点") === -1);
check("单元 16 的单元页渲染出断言块，且与难度块并存",
  u16Html.indexOf("uc-out-card") !== -1 && u16Html.indexOf("uc-diff-card") !== -1);
check("单元 16 断言块含口径句与产出凭证链接",
  u16Html.indexOf(items["16"].say) !== -1 && u16Html.indexOf("本站自述，不构成任何等级认定") !== -1 &&
  /href="#\/sop"[^>]*>凭证：/.test(u16Html));

/* ---------------- ⑫ 内容资产哈希（记录，不是门禁） ----------------
   ▲ P0 第三批 · α 组（P0-08）改法 —— S10-F7：原末行是
     `check("内容资产（js/data*.js）本次未修改（仅记录哈希，供人工比对基线）", true, …)`，
   条件字面量 `true` 是一条**永远不会失败**的断言（M9 改 js/data.js 实测仍 exit 0），
   但它的名字读起来像门禁，会误导后来者以为数据资产受保护。这里按 S10 建议改为
   **只记录、不断言**：删掉那条恒真 check，保留哈希打印供人工比对。
   为什么不改成"哈希基线常量、内容变了就红"：js/data*.js 正是多个在途批次（P0 内容勘误、
   P11 术语库）正在**合法**修改的文件，把内容钉死会把正常内容变更变成误报；真要保护内容，
   应另设"数据变更需随附勘误说明"的流程，而不是塞进这条口径门禁。 */
const FROZEN = ["js/data.js", "js/data-mail.js", "js/data-incoterms.js", "js/data-meeting.js", "js/data-ops.js"];
const crypto = require("crypto");
const frozenNote = FROZEN.map(function (f) {
  const h = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex").slice(0, 8);
  return f + "=" + h;
});
console.log("ℹ️  内容资产哈希（仅供参考，**不是门禁**）：" + frozenNote.join(" "));

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
