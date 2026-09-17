#!/usr/bin/env node
/* ============ 构建期工具：生成 js/difficulty-map.js（window.FTE_DIFF 难度标定） ============
   读取 js/data*.js 的课程结构 + tools/cefr/ 的开放 CEFR 词汇画像（CEFR-J A1-B2 + Octanove C1-C2），
   计算：
   - 词级：真实 CEFR 分级（A1/A2=易、B1=中、B2/C1/C2=难）；未收录（多为行业/复合术语）按词长+音节
     兜底，并标 dom=行业术语（与难度正交）。
   - 词频覆盖：coverage（列表条目数 / 词命中数 / 命中率）。
   - 单元级：nVocab / 平均句长 / 每词音节 / 平均词长 / 专业词占比 / 平均 CEFR / Flesch 可读性，
     归一成 score 与 band（基础/进阶/拔高），并给 sortIdx（站内相对难度序）。
   输出：js/difficulty-map.js（window.FTE_DIFF = {...}）。
   注意：本脚本只读不重新生成时不会改动现有 map；如需重算直接运行 `node tools/gen-difficulty.js`。

   ============================================================================
   P0-2 难度底座修复（本站唯一难度口径 · 见输出里的 difficultyBasis）
   ============================================================================
   本次修了三处**真实缺陷**，任何一处不修，重跑生成器都会产出比陈旧产物更差的 map：

   [缺陷 1 · syllables() 正则失效]
     旧实现用「一个 * 量词包裹 ( 非元音连续段 | 元音后元音段 ) 交替组」做全局替换，其中元音段那支
     可以匹配空串，于是整个字符串被一次吃掉，结果恒为 ""，match() 返回 null → **每个词都返回 1 音节**。
     后果链：sylPerWord 恒为 1 → Flesch 的“每词音节”恒为 1 → **Flesch 虚高到 101~113（全站“极易读”）**；
     且 score 的“音节”分量退化为常数。修法：改用无 lookbehind 的经典元音组计数 + 静音 e/ed 修正。

   [缺陷 2 · score 三项全部饱和]
     `0.5*min(1, avgCefr/2.2) + 0.3*min(1, sylPerWord/1.7) + 0.2*min(1, avgWordLen/5.2)`
     的除数（2.2 / 1.7 / 5.2）是按旧 CEFR 词表尺度（avgCefr≈1.6~2.2）标定的；CEFR 词表扩充后
     avgCefr 升到 2.5~4.5，**三项同时 >1 被 min 截断成常数** → 19 个单元的 score 恒等 0.8765 →
     norm 全 0 → band 全塌成「基础」→ sortIdx 退化成 id 顺序。
     修法：把三个分量改为**站内分位归一**（percentile within corpus），权重 0.5/0.3/0.2 不变。
     这既消除饱和，也正好落实界面文案一直宣称的语义：「单元指标**相对本站语料归一**，用于站内相对排序」，
     并且对词表继续扩充免疫。

   [缺陷 3 · 产物 schema 与生成器不一致]
     历史产物 units[] 用的是 `bandNo`(数字) + `band`(**中文字符串**)，而生成器写的是
     `band`(数字) + `bandLabel`(字符串)；js/app.js:652 / :1251 / :1526 直接渲染 `du.band`，
     即**界面期望 band 是中文字符串**。若不改，重跑会把单元卡上的「难度：进阶」变成「难度：2」。
     修法：输出同时给 `bandNo`(1/2/3)、`band`(中文字符串)、`bandLabel`(同 band，兼容旧名)，
     并保留历史产物用过的 `nSent` 字段。**band 的字符串值由本脚本负责，界面不需要改。**

   另：version 2 → 3（口径与字段有变更，留可追溯边界）。
   ============================================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WEB_JS = path.join(__dirname, "..", "js");
const CEFR_DIR = path.join(__dirname, "cefr");
const OUT = path.join(WEB_JS, "difficulty-map.js");
const FILES = ["data.js", "data-ops.js", "data-ocean.js", "data-incoterms.js", "data-settle.js", "data-risk.js", "data-deep.js", "data-meeting.js"];

/* 行业术语词根（近似“专”判定，用于与新词汇表口径正交的 dom 标注） */
const TECH = /(adhesive|resin|poly|isocyan|catal|solvent|laminate|lamination|coating|film|pouch|bag|pack|carton|container|freight|vessel|voyage|customs|tariff|inspection|invoice|shipment|remitt|letter.?of.?credit|documentary|negotiat|incoterm|fob|cif|cfr|cpt|cip|exw|fca|fas|dap|dpu|ddp|consignee|shipper|demurrage|detention|telex|endorsement|discrepan|beneficiary|applicant|insur|salvage|bill.?of.?exchange|promissory|fcl|lcl|teu|feu|etd|eta|vgm|nvoocc|isof|certif|quota|bond|neigh|biti|anil|unwind|rewind|heat.?seal|peel|slack|wind|slitt|bag.?mak|sachet|membrane|barrier|retort|boil|freezer|gravure|flexo|die.?cut|reliab|hygien|vitai)/i;

/* 单元 band 文案（界面直接渲染 band 字符串，见缺陷 3） */
const BAND_LABEL = { 1: "基础", 2: "进阶", 3: "拔高" };
/* band 切分阈值（作用于 norm）。基础=下段 / 进阶=中段 / 拔高=上段 */
const BAND_UP = 0.6, BAND_MID = 0.3;

/* ---------- 数据加载 ---------- */
function loadFTE() {
  const ctx = { console };
  vm.createContext(ctx);
  for (const f of FILES) {
    let src = fs.readFileSync(path.join(WEB_JS, f), "utf8");
    if (f === "data.js") src += "\nglobalThis.FTE_DATA = FTE_DATA;";
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx.FTE_DATA;
}

/* ---------- CEFR 词汇画像 ---------- */
function loadCefr() {
  const map = {};        /* word(lower) -> 最细 CEFR */
  let listEntries = 0;
  function readCsv(file, cols) {
    const rows = fs.readFileSync(path.join(CEFR_DIR, file), "utf8").split(/\r?\n/);
    if (!rows.length) return;
    const header = rows[0].split(",");
    const iW = header.indexOf("headword");
    const iC = header.indexOf("CEFR");
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const cells = r.split(",");
      const w = (cells[iW] || "").trim().toLowerCase().replace(/^[^a-z]+|[^a-z]$/g, "");
      const cefr = (cells[iC] || "").trim().toUpperCase();
      if (!w || !cefr || !/^[A-Z][0-9]$/.test(cefr)) continue;
      listEntries++;
      if (!map[w] || cefrRank(map[w]) > cefrRank(cefr)) map[w] = cefr;  // 取更细/更常用档
    }
  }
  readCsv("cefrj-vocab.csv");
  readCsv("c1c2-vocab.csv");
  return { map: map, listEntries: listEntries };
}
function cefrRank(c) {
  return ({ A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 })[c] || 9;
}
function cefrDif(c) { return ({ A1: "easy", A2: "easy", B1: "mid", B2: "hard", C1: "hard", C2: "hard" })[c] || null; }

/* ---------- 词级度量 ---------- */
/* 音节数（**加工难度代理，不是语音学音节切分**）。
   旧实现用带 lookbehind 的正则，整个词被吃掉 → 恒返回 1（见文件头缺陷 1）。
   这里改成无 lookbehind 的经典启发式：先去掉静音 e / ed / es 尾巴，再数元音组。
   结果示例：trade=1 · film=1 · adhesive=3 · polyurethane=4 · manufacturer=5。 */
function syllables(w) {
  let s = String(w).toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return 1;
  if (s.length <= 3) return 1;
  s = s.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = s.match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}
function wordStats(word, cefrMap) {
  const lower = String(word).toLowerCase();
  const cefr = cefrMap[lower] || null;
  const dif = cefrDif(cefr) || (lower.length > 10 || syllables(lower) > 3 ? "hard" : (lower.length > 6 || syllables(lower) > 2 ? "mid" : "easy"));
  const dom = TECH.test(lower);
  return { dif: dif, cefr: cefr, syl: syllables(lower), len: String(word).length, dom: dom };
}

/* ---------- Flesch Reading Ease ---------- */
function flesch(sentences) {
  if (!sentences || !sentences.length) return 70;
  let words = 0, syl = 0;
  sentences.forEach(function (s) {
    const ws = String(s).split(/\s+/).filter(Boolean);
    words += ws.length;
    ws.forEach(function (w) { syl += syllables(w); });
  });
  if (!words) return 70;
  const spw = syl / words;
  return Math.round(206.835 - 1.015 * (words / sentences.length) - 84.6 * spw);
}

/* ---------- 站内分位归一（缺陷 2 的修法） ----------
   把某个分量的取值映射成「它在本站语料里的相对位置」0..1。
   用「严格小于它的样本数 / (n-1)」而不是排名，取值相同者共享同一个分位，结果稳定可复现。 */
function percentileRank(values, v) {
  const n = values.length;
  if (n <= 1) return 0;
  let below = 0;
  for (let i = 0; i < n; i++) if (values[i] < v) below++;
  return below / (n - 1);
}

/* ---------- 主流程 ---------- */
function build() {
  const FTE = loadFTE();
  const c = loadCefr();
  const dict = {};

  /* 词级。
     ⚠️ 键必须用**小写归一**：js/app.js:1495-1496 的查询是
     `const s = String(w).toLowerCase(); const rec = DIFF_WORDS[s];`，
     而历史产物 difficulty-map.js 的 words 键 0 个大写（全小写）。
     旧脚本写的却是 `words[v.w]`（原样大小写），于是 FOB / Incoterms / MOI… 这类
     **原样大写的词条在运行时查不到记录**，静默退化成启发式正则——这是与 R1/R2 同源的
     「产物与消费者契约不一致」（本文件头缺陷 3 的同族缺陷，记为缺陷 3b）。
     改为小写键后，「缺失难度记录的课程词」在两种口径下都归零。 */
  let covered = 0, total = 0;
  const words = {};
  FTE.units.forEach(function (u) {
    u.vocab.forEach(function (v) {
      const ws = wordStats(v.w, c.map);
      if (ws.cefr) covered++;
      total++;
      words[String(v.w).toLowerCase()] = ws;
    });
  });

  /* 单元级：第一遍只算 raw 分量 */
  const raw = {};
  FTE.units.forEach(function (u) {
    const vocab = u.vocab || [];
    let sylSum = 0, lenSum = 0, cefrSum = 0, cefrN = 0, dom = 0;
    vocab.forEach(function (v) {
      const ws = wordStats(v.w, c.map);
      sylSum += ws.syl; lenSum += ws.len;
      if (ws.cefr) { cefrSum += cefrRank(ws.cefr); cefrN++; }
      if (ws.dom) dom++;
    });
    const lines = [];
    (u.dialogues || []).forEach(function (d) { (d.lines || []).forEach(function (l) { lines.push(l.en); }); });
    const sentCount = lines.length || Math.max(1, vocab.length);
    const wordsPerSentence = lines.length ? (lines.join(" ").split(/\s+/).filter(Boolean).length / sentCount) : 0;
    raw[u.id] = {
      nVocab: vocab.length,
      nSent: sentCount,
      wordsPerSentence: Math.round(wordsPerSentence * 100) / 100,
      sylPerWord: Math.round((sylSum / Math.max(1, vocab.length)) * 100) / 100,
      avgWordLen: Math.round((lenSum / Math.max(1, vocab.length)) * 100) / 100,
      domPct: Math.round(dom / Math.max(1, vocab.length) * 100),
      avgCefr: Math.round((cefrN ? (cefrSum / cefrN) : 0) * 100) / 100,
      flesch: flesch(lines)
    };
  });

  /* 单元级：第二遍按「站内分位」合成 score（权重 0.5 / 0.3 / 0.2 不变） */
  const ids = FTE.units.map(function (u) { return u.id; });
  const colCefr = ids.map(function (id) { return raw[id].avgCefr; });
  const colSyl = ids.map(function (id) { return raw[id].sylPerWord; });
  const colLen = ids.map(function (id) { return raw[id].avgWordLen; });

  const units = {};
  ids.forEach(function (id) {
    const r = raw[id];
    const score = 0.5 * percentileRank(colCefr, r.avgCefr)
      + 0.3 * percentileRank(colSyl, r.sylPerWord)
      + 0.2 * percentileRank(colLen, r.avgWordLen);
    /* 字段顺序刻意对齐历史产物，减少 diff 噪声；band 为中文字符串（见缺陷 3） */
    units[id] = {
      bandNo: 1, band: BAND_LABEL[1],
      score: Math.round(score * 1000) / 1000,
      norm: 0,
      nVocab: r.nVocab, nSent: r.nSent,
      wordsPerSentence: r.wordsPerSentence,
      sylPerWord: r.sylPerWord, avgWordLen: r.avgWordLen,
      domPct: r.domPct, avgCefr: r.avgCefr, flesch: r.flesch,
      sortIdx: 0
    };
  });

  /* 归一化 + 档位 + 排序 */
  const scores = ids.map(function (id) { return units[id].score; });
  const min = Math.min.apply(null, scores), max = Math.max.apply(null, scores);
  const span = (max - min) || 1;
  ids.forEach(function (id) {
    const norm = Math.round((units[id].score - min) / span * 1000) / 1000;
    units[id].norm = norm;
    const bandNo = norm >= BAND_UP ? 3 : norm >= BAND_MID ? 2 : 1;
    units[id].bandNo = bandNo;
    units[id].band = BAND_LABEL[bandNo];      /* 界面渲染的就是这个中文字符串 */
    units[id].bandLabel = BAND_LABEL[bandNo]; /* 旧字段名，保留兼容 */
  });
  const sorted = ids.slice().sort(function (a, b) { return units[a].score - units[b].score; });
  sorted.forEach(function (id, i) { units[id].sortIdx = i + 1; });

  const cefrHitRate = total ? Math.round(covered / total * 1000) / 1000 : 0;
  const data = {
    version: 3,
    model: "CEFR (CEFR-J A1-B2 + Octanove C1-C2) primary; length+syllable fallback for out-of-list terms",
    source: ["openlanguageprofiles/olp-en-cefrj", "octanove-c1c2"],
    generated: new Date().toISOString().slice(0, 10),
    /* R6：把「难度到底怎么算」写成**机器可读的唯一口径**，供 UI 文案 / README / 方案文档对齐。
       此前同一事实在 README.md:253（音节+词长）、README.md:265（真实 CEFR）、
       js/app.js:1482-1485 注释（音节+词长代理，非 CEFR）与 js/app.js:1533（真实 CEFR 分级）
       之间有四种说法。以下 difficultyBasis 为权威表述。 */
    difficultyBasis: {
      wordLevel: "词级 dif 与 cefr 来自开放 CEFR 词汇画像（CEFR-J A1-B2 + Octanove C1-C2）：A1/A2=易、B1=中、B2/C1/C2=难。",
      wordFallback: "未收录于 CEFR 画像的词（多为行业/复合术语）按词长+音节启发式兜底，dif 仍为 易/中/难，但 cefr=null。",
      wordCefrHitRate: cefrHitRate,
      wordKeyConvention: "words 的键为词条的**小写归一**形式（与 js/app.js:1495 的 String(w).toLowerCase() 查询一致）；任何按原样大小写取键的写法都会漏掉 FOB / Incoterms 这类词条。",
      domLevel: "dom 为**行业术语标记**（tools/gen-difficulty.js 顶部 TECH 词根正则命中），与难度正交；domPct = 单元内 dom=true 的词占比。",
      unitScore: "score = 0.5×分位(avgCefr) + 0.3×分位(每词音节数) + 0.2×分位(平均词长)；分位为本站语料内分位（percentileRank），不是绝对量表。",
      unitBand: "norm = score 在本站 19 个单元内的 min-max 归一；norm≥0.6=拔高(3)、≥0.3=进阶(2)、否则基础(1)。band 为中文字符串，bandNo 为对应数字。",
      unitSortIdx: "sortIdx 按 score 升序，1 = 最易，最大值 = 参与排序的单元数（与界面分母一致）。",
      syllablesNote: "音节数为**加工难度代理**（启发式元音组计数），不是语音学音节切分；Flesch 可读性因此也是估算值。",
      notClaimed: "本站难度标注是**站内相对**指标，不声称与任何外部量表（含 CEFR 官方测评）对齐。"
    },
    bandLabels: { easy: "易", mid: "中", hard: "难" },
    cefrBands: { A1: "易", A2: "易", B1: "中", B2: "难", C1: "难", C2: "难" },
    unitBandLabels: BAND_LABEL,
    coverage: { listEntries: c.listEntries, courseWordsFound: covered, courseWords: total, cefrHitRate: cefrHitRate },
    words: words,
    units: units,
    order: sorted
  };

  const header = "/* ============ 自动生成，请勿手改（改 tools/gen-difficulty.js 后重跑） ============\n"
    + "   难度口径（全站唯一，权威表述见本对象的 difficultyBasis 字段）：\n"
    + "   · 词级 dif/cefr：开放 CEFR 画像（CEFR-J A1-B2 + Octanove C1-C2）；A1/A2=易、B1=中、B2/C1/C2=难；\n"
    + "     未收录者按词长+音节兜底（cefr=null），行业/复合术语多走此路径。\n"
    + "   · 词级 dom：行业术语标记（TECH 词根正则），与难度正交；domPct = 单元内 dom 占比。\n"
    + "   · 单元级 score：0.5×分位(avgCefr) + 0.3×分位(每词音节) + 0.2×分位(平均词长)，分位取自本站语料。\n"
    + "   · 单元级 band：norm≥0.6=拔高 / ≥0.3=进阶 / 否则基础；**band 是中文字符串**（界面直接渲染），bandNo 是数字。\n"
    + "   · sortIdx：score 升序，1=最易，最大值=参与排序单元数（与界面分母一致）。\n"
    + "   · 音节的“加工难度代理”性质、以及“不声称对齐外部量表”，一并见 difficultyBasis。\n"
    + "   生成时间：" + data.generated + "（version " + data.version + "）\n"
    + "   ============================================================================ */\n";
  const out = header + "window.FTE_DIFF = " + JSON.stringify(data) + ";\n";
  fs.writeFileSync(OUT, out, "utf8");
  console.log("已生成 js/difficulty-map.js：课程词 " + total + "（命中 CEFR " + covered + "，命中率 " + Math.round(cefrHitRate * 100) + "%），单元 " + ids.length + "。");
  return data;
}

if (require.main === module) build();

module.exports = { build: build, FILES: FILES, syllables: syllables, percentileRank: percentileRank };
