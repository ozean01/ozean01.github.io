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

   ============================================================================
   P3-4 难度标定修订（Phase 3 · 依据 _fte-review/S1-英语教学SLA专家.md「发现 3」）
   ============================================================================
   实测证据（S1 重算全站，本脚本亦复现）：688 个去重词里只有 141（20.5%）有 CEFR 档，
   且**分布极不均**：U11 13/201=6%、U12 1/46=2%、U13 1/50=2%、U14 2/40=5%、U17 1/30=3%。
   于是这些单元的 avgCefr 由 1–2 个词决定（U14 的 4.5 来自 2 个词），却在 score 里占 0.5 权重。
   同时公式没有条目数量项 → 201 词的 U11 排第 14/19，被系统告诉「比 32 词的 U3 更容易」。
   四处修复（缺一不可）：

   [修订 1 · CEFR 项加命中数门限]
     单元 CEFR 命中数 < CEFR_MIN_HITS(10) → avgCefr = null、cefrUsed = false，
     该单元不再有 CEFR 分量，原 0.5 权重**按比例重分配**给音节与词长：
        cefrUsed = true  : score = 0.5×p(cefr) + 0.3×p(syl) + 0.2×p(len)
        cefrUsed = false : score = 0.6×p(syl) + 0.4×p(len)      // (0.3,0.2) 通过 /0.5 归一
     产物 units[] 显式记录 cefrHits（命中数）与 cefrUsed（是否参与合成），供界面与审计读取。

   [修订 2 · 加入条目数量项（S1 点名的最小改动最大收益项）]
     单元负载 load = (1 + baseScore) × log2(nVocab)。
     主尺度是**条目量**（log2 台阶，S1 建议的曲线），单位复杂度作为 **0–100% 的加成**（1 + baseScore），
     即「每个条目量台阶的成本随单位复杂度最多翻一倍」。这样数量项不会被近零的复杂度因子吃掉。
     为什么不直接用 S1 建议的纯乘法 baseScore × log2(nVocab)：baseScore 是**站内分位**合成分，存在接近 0 的
     单元——U13（50 条海运缩写）的词全是 3 字母缩写，音节与词长百分位都是全站最低，baseScore=0.022；
     纯乘法下 0.022×5.64=0.125 仍低于 22 词单元的 0.149，数量项被抹掉，U13 反而升到第 1 名（修订前第 3 名）。
     改用 (1+baseScore) 后：U13 → 第 4 名（比修订前更靠后），U11 → 第 19/19 名（最难）。
     实测 U13 只从第 3 名移到第 4 名——因为 log2 曲线本身很平（50 词 vs 22 词只差 1.26 倍）；
     若要让大数量单元更靠后，需要更陡的曲线（如 (1+baseScore)×√n → U13 第 8 名），本脚本按 S1 建议保留 log2。
     order / norm / band 全部改由 load 决定；baseScore（不含数量项）与 load 都写进 units[]。

   [修订 3 · 同形异义假命中排除表 CEFR_EXCLUDE]
     词的 CEFR 档来自通用义项、而本站用的是另一个义项时，该档位是**假命中**，
     必须置 cefr=null 回落到兜底轴，否则 20.5% 的命中率本身还被假命中抬高。

   [修订 4 · 收窄 dom：通用商务词不贴「专」角标]
     DOM_GENERIC 里的 film / container / inspection / certificate / quotation / shipment / customs
     是通用商务英语，不是行业专有术语。只对独立词条生效——customs declaration、bopp film
     这类复合词条仍是行业术语。

   另：version 3 → 4（口径与字段有变更，留可追溯边界）。
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

/* ---------- P3-4 修订 4：通用商务词不贴「专」角标 ----------
   film / container / inspection / certificate / quotation / shipment / customs 在通用商务英语里
   本来就存在（且多数已有 CEFR 档），把它们标成「行业专有术语」是把「专」贴宽了。
   只对**独立词条**生效：customs declaration / certificate of origin / bopp film 这类复合词条
   仍按行业术语标注（它们确实不是通用词汇）。 */
const DOM_GENERIC = new Set(["film", "container", "inspection", "certificate", "quotation", "shipment", "customs"]);

/* ---------- P3-4 修订 3：同形异义 CEFR 假命中排除表 ----------
   键 = 小写词条；值 = 排除理由（写进注释与 difficultyBasis.cefrExclude，供人工复核）。
   判定依据统一为：**该 CEFR 档对应的义项 ≠ 本站该词条的义项**。
   S1「发现 3」点名 8 个词（pet / reach / collection / drawer / stand / hold / message / review），
   本节另**自查**了 dom=true 且 cefr≠null 的 20 个词条，逐条判断档位是否真的对应本站义项：
     · 判定为假命中（追加排除）：film —— A2 档是「电影 / 影片」，本站是软包装基材薄膜。
     · 判定为真命中（保留）：quotation(B2 报价) · customs(B1 海关) · resin(C1 树脂) ·
       catalyst(B2 催化剂) · negotiate/negotiation(B1 谈判) · invoice(C1 发票) ·
       container(A2 容器→货柜，通用词义接近) · inspection(B1 查验) · certificate(B2 证书) ·
       boil(A2 煮沸→蒸煮) · freezer(B1 冷冻) · solvent(B2 溶剂) · remittance(C2 汇款) ·
       applicant(B2 申请人) · beneficiary(C2 受益人) · endorsement(C1 背书) —— 义项一致，档位可用。
   注意：CEFR-J / Octanove 是**通用英语**画像，术语的「专业义项」按通用词表定档本身仍有口径偏差；
   排除表只剔除**明显不同义项**的假命中，不是对全部术语做义项白名单。 */
const CEFR_EXCLUDE = {
  pet: "本站义为 PET 聚酯薄膜（软包装基材），A1 档对应的是「宠物」",
  reach: "本站义为欧盟 REACH 化学品法规，A2 档对应的是「到达 / 伸手」",
  collection: "本站义为托收（documentary collection）结算方式，A1 档对应的是「收藏 / 收集」",
  drawer: "本站义为汇票出票人（票据关系人），A2 档对应的是「抽屉」",
  stand: "本站义为展会展位（booth），A1 档对应的是「站立」",
  hold: "本站义为电话里「请稍等 / 保留线路」，A1 档对应的是「握住」",
  message: "本站义为电话留言 / 口信（leave a message），A1 档是更泛的「消息」，档位不可直接迁移",
  review: "本站义为电商买家评论 / 评价，A1 档对应的是「复习」",
  film: "本站义为软包装基材薄膜（PET/PE film），A2 档对应的是「电影 / 影片」；其余 dom 且 cefr 非空的 19 个词条经逐条自查义项一致，不排除"
};

/* 单元 CEFR 项的最小命中数：低于它，avgCefr 由 1–2 个词决定，是噪声而非信号 */
const CEFR_MIN_HITS = 10;

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
  /* P3-4 修订 3：同形异义假命中 → 视同未收录（cefr=null），dif 回落兜底轴 */
  const cefr = Object.prototype.hasOwnProperty.call(CEFR_EXCLUDE, lower) ? null : (cefrMap[lower] || null);
  const dif = cefrDif(cefr) || (lower.length > 10 || syllables(lower) > 3 ? "hard" : (lower.length > 6 || syllables(lower) > 2 ? "mid" : "easy"));
  /* P3-4 修订 4：TECH 命中但属于通用商务词（独立词条）→ 不算行业术语 */
  const dom = TECH.test(lower) && !DOM_GENERIC.has(lower);
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
      /* P3-4 修订 1：命中数低于门限时 avgCefr 不是信号（1–2 个词决定）→ 置 null、cefrUsed=false */
      cefrHits: cefrN,
      cefrUsed: cefrN >= CEFR_MIN_HITS,
      avgCefr: cefrN >= CEFR_MIN_HITS ? Math.round((cefrSum / cefrN) * 100) / 100 : null,
      avgCefrRaw: cefrN ? Math.round((cefrSum / cefrN) * 100) / 100 : null,
      flesch: flesch(lines)
    };
  });

  /* 单元级：第二遍按「站内分位」合成 score（P3-4 修订 1：CEFR 项按命中数门限决定是否参与）
     权重 0.5 / 0.3 / 0.2；CEFR 项不可用时，把 0.5 按比例重分配给另两项 → 0.6 / 0.4。 */
  const ids = FTE.units.map(function (u) { return u.id; });
  const W = { cefr: 0.5, syl: 0.3, len: 0.2 };
  const usedIds = ids.filter(function (id) { return raw[id].cefrUsed; });
  const colCefrUsed = usedIds.map(function (id) { return raw[id].avgCefr; });   /* 只在可用单元内取分位 */
  const colSyl = ids.map(function (id) { return raw[id].sylPerWord; });
  const colLen = ids.map(function (id) { return raw[id].avgWordLen; });

  const units = {};
  ids.forEach(function (id) {
    const r = raw[id];
    let baseScore, cefrPct = null, sylW = W.syl, lenW = W.len;
    if (r.cefrUsed) {
      cefrPct = percentileRank(colCefrUsed, r.avgCefr);
      baseScore = W.cefr * cefrPct
        + W.syl * percentileRank(colSyl, r.sylPerWord)
        + W.len * percentileRank(colLen, r.avgWordLen);
    } else {
      /* CEFR 项不可用：0.5 权重按比例分给音节/词长 → 0.3/0.5=0.6、0.2/0.5=0.4 */
      sylW = W.syl / (W.syl + W.len);
      lenW = W.len / (W.syl + W.len);
      baseScore = sylW * percentileRank(colSyl, r.sylPerWord)
        + lenW * percentileRank(colLen, r.avgWordLen);
    }
    /* P3-4 修订 2：单元负载 = 条目量台阶 × 单位复杂度加成。
       load = (1 + baseScore) × log2(nVocab)：log2 让条目量每翻一倍加一个台阶（S1 建议的曲线），
       (1 + baseScore) 让单位复杂度对每个台阶的成本最多加成 100% —— 避免纯乘法下近零 baseScore
       把数量项整体抹掉（U13 的 baseScore=0.022，纯乘法会被 22 词单元反超）。
       nVocab ≤ 2 时 log2 记 1（本站最小单元 20 词，仅作除零/退化保护）。 */
    const load = (1 + baseScore) * Math.log2(Math.max(2, r.nVocab));
    /* 字段顺序刻意对齐历史产物，减少 diff 噪声；band 为中文字符串（见缺陷 3） */
    units[id] = {
      bandNo: 1, band: BAND_LABEL[1],
      score: Math.round(baseScore * 1000) / 1000,
      baseScore: Math.round(baseScore * 1000) / 1000,
      load: Math.round(load * 1000) / 1000,
      norm: 0,
      nVocab: r.nVocab, nSent: r.nSent,
      wordsPerSentence: r.wordsPerSentence,
      sylPerWord: r.sylPerWord, avgWordLen: r.avgWordLen,
      domPct: r.domPct, avgCefr: r.avgCefr, avgCefrRaw: r.avgCefrRaw,
      cefrHits: r.cefrHits, cefrUsed: r.cefrUsed,
      cefrPct: cefrPct === null ? null : Math.round(cefrPct * 1000) / 1000,
      weightCefr: r.cefrUsed ? W.cefr : 0,
      weightSyl: Math.round(sylW * 1000) / 1000,
      weightLen: Math.round(lenW * 1000) / 1000,
      flesch: r.flesch,
      sortIdx: 0
    };
  });

  /* 归一化 + 档位 + 排序（P3-4 修订 2：全部改由 load 决定，不再用不含数量项的 score） */
  const loads = ids.map(function (id) { return units[id].load; });
  const min = Math.min.apply(null, loads), max = Math.max.apply(null, loads);
  const span = (max - min) || 1;
  ids.forEach(function (id) {
    const norm = Math.round((units[id].load - min) / span * 1000) / 1000;
    units[id].norm = norm;
    const bandNo = norm >= BAND_UP ? 3 : norm >= BAND_MID ? 2 : 1;
    units[id].bandNo = bandNo;
    units[id].band = BAND_LABEL[bandNo];      /* 界面渲染的就是这个中文字符串 */
    units[id].bandLabel = BAND_LABEL[bandNo]; /* 旧字段名，保留兼容 */
  });
  const sorted = ids.slice().sort(function (a, b) { return units[a].load - units[b].load; });
  sorted.forEach(function (id, i) { units[id].sortIdx = i + 1; });

  const cefrHitRate = total ? Math.round(covered / total * 1000) / 1000 : 0;
  const usedUnits = usedIds.length;
  const data = {
    version: 4,
    model: "CEFR (CEFR-J A1-B2 + Octanove C1-C2) primary; length+syllable fallback for out-of-list terms",
    source: ["openlanguageprofiles/olp-en-cefrj", "octanove-c1c2"],
    generated: new Date().toISOString().slice(0, 10),
    /* R6 / P3-4：把「难度到底怎么算」写成**机器可读的唯一口径**，供 UI 文案 / README / 方案文档对齐。
       此前同一事实在 README.md:253（音节+词长）、README.md:265（真实 CEFR）、
       js/app.js:1482-1485 注释（音节+词长代理，非 CEFR）与 js/app.js:1533（真实 CEFR 分级）
       之间有四种说法。以下 difficultyBasis 为权威表述。
       P3-4 起 unitScore 已换公式（CEFR 命中数门限 + 条目量项），旧表述一律以此为准。 */
    difficultyBasis: {
      wordLevel: "词级 dif 与 cefr 来自开放 CEFR 词汇画像（CEFR-J A1-B2 + Octanove C1-C2）：A1/A2=易、B1=中、B2/C1/C2=难。",
      wordFallback: "未收录于 CEFR 画像的词（多为行业/复合术语）按词长+音节启发式兜底，dif 仍为 易/中/难，但 cefr=null。",
      wordCefrHitRate: cefrHitRate,
      wordKeyConvention: "words 的键为词条的**小写归一**形式（与 js/app.js:1495 的 String(w).toLowerCase() 查询一致）；任何按原样大小写取键的写法都会漏掉 FOB / Incoterms 这类词条。",
      cefrExclude: "同形异义 CEFR 假命中排除表见 tools/gen-difficulty.js 的 CEFR_EXCLUDE（词 → 排除理由）；命中即 cefr=null、回落兜底轴。当前排除 " + Object.keys(CEFR_EXCLUDE).length + " 词：" + Object.keys(CEFR_EXCLUDE).join(" / ") + "。排除理由示例：pet = 本站义为 PET 聚酯薄膜，与 A1 的「宠物」无关。",
      cefrHitThreshold: "**CEFR 命中数门限**：单元 CEFR 命中数 < " + CEFR_MIN_HITS + " 时，avgCefr 由 1–2 个词决定、是噪声，故置 null 且 cefrUsed=false；该单元的 CEFR 项不参与合成，原 0.5 权重按比例重分配给音节与词长。units[].cefrHits / cefrUsed 显式记录命中数与是否参与合成。",
      domLevel: "dom 为**行业术语标记**（tools/gen-difficulty.js 顶部 TECH 词根正则命中，且**排除 DOM_GENERIC 里的通用商务词**：" + Array.from(DOM_GENERIC).join(" / ") + "），与难度正交；domPct = 单元内 dom=true 的词占比。收窄只作用于独立词条，含这些词的复合词条（customs declaration / bopp film 等）仍算行业术语。",
      unitScore: "单元单位复杂度 baseScore = 0.5×分位(avgCefr) + 0.3×分位(每词音节数) + 0.2×分位(平均词长)；当 CEFR 命中数 < " + CEFR_MIN_HITS + "（cefrUsed=false）时改用归一后的 0.6×分位(每词音节数) + 0.4×分位(平均词长)。分位为本站语料内分位（percentileRank），且 CEFR 分位只在 cefrUsed=true 的单元之间计算。",
      unitLoad: "**条目量项**：单元负载 load = (1 + baseScore) × log2(nVocab)（nVocab≤2 时 log2 记 1）。主尺度是条目量（log2 台阶，每翻一倍加一个台阶），单位复杂度作为 0–100% 的加成。不用纯乘法 baseScore × log2(nVocab) 的原因：baseScore 是站内分位合成分，U13 等单元接近 0（0.022×5.64=0.125 < 22 词单元的 0.149），数量项会被近零因子抹掉。order / norm / band 全部由 load 决定；units[].baseScore 保留不含数量项的单位复杂度供参考。",
      unitBand: "norm = load 在本站 " + ids.length + " 个单元内的 min-max 归一；norm≥0.6=拔高(3)、≥0.3=进阶(2)、否则基础(1)。band 为中文字符串，bandNo 为对应数字。",
      unitSortIdx: "sortIdx 按 load 升序，1 = 最易，最大值 = 参与排序的单元数（与界面分母一致）。",
      syllablesNote: "音节数为**加工难度代理**（启发式元音组计数），不是语音学音节切分；Flesch 可读性因此也是估算值。",
      notClaimed: "本站难度标注是**站内相对**指标，不声称与任何外部量表（含 CEFR 官方测评）对齐。",
      revisionNote: "P3-4 修订（version 3 → 4）：① CEFR 项加命中数门限 " + CEFR_MIN_HITS + " 并重分配权重；② 加入条目量项 load = baseScore × log2(nVocab) 并改由 load 排序；③ 新增同形异义排除表 CEFR_EXCLUDE；④ dom 收窄剔除通用商务词。本次 cefrUsed=true 的单元 " + usedUnits + "/" + ids.length + " 个。"
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
    + "     未收录者按词长+音节兜底（cefr=null）。同形异义假命中由 CEFR_EXCLUDE 排除表剔除（见 tools/gen-difficulty.js）。\n"
    + "   · 词级 dom：行业术语标记（TECH 词根正则），**已剔除通用商务词**" + Array.from(DOM_GENERIC).join("/") + "；domPct = 单元内 dom 占比。\n"
    + "   · 单元级 baseScore：0.5×分位(avgCefr) + 0.3×分位(每词音节) + 0.2×分位(平均词长)，分位取自本站语料。\n"
    + "   · 单元级 CEFR 命中数门限：命中数 < " + CEFR_MIN_HITS + " 时 cefrUsed=false、avgCefr=null，0.5 权重按比例\n"
    + "     重分配给音节与词长 → 0.6×分位(每词音节) + 0.4×分位(平均词长)。\n"
    + "   · 单元级条目量项：load = (1 + baseScore) × log2(nVocab)；order / norm / band 全部由 load 决定。\n"
    + "   · 单元级 band：norm(load) ≥0.6=拔高 / ≥0.3=进阶 / 否则基础；**band 是中文字符串**（界面直接渲染），bandNo 是数字。\n"
    + "   · sortIdx：load 升序，1=最易，最大值=参与排序单元数（与界面分母一致）。\n"
    + "   · 音节的“加工难度代理”性质、以及“不声称对齐外部量表”，一并见 difficultyBasis。\n"
    + "   生成时间：" + data.generated + "（version " + data.version + "）\n"
    + "   ============================================================================ */\n";
  const out = header + "window.FTE_DIFF = " + JSON.stringify(data) + ";\n";
  fs.writeFileSync(OUT, out, "utf8");
  console.log("已生成 js/difficulty-map.js：课程词 " + total + "（命中 CEFR " + covered + "，命中率 " + Math.round(cefrHitRate * 100)
    + "%），单元 " + ids.length + "（cefrUsed " + usedIds.length + " 个，门限 " + CEFR_MIN_HITS + "）；排除表 " + Object.keys(CEFR_EXCLUDE).length + " 词。");
  return data;
}

if (require.main === module) build();

module.exports = {
  build: build, FILES: FILES, syllables: syllables, percentileRank: percentileRank,
  CEFR_EXCLUDE: CEFR_EXCLUDE, DOM_GENERIC: DOM_GENERIC, CEFR_MIN_HITS: CEFR_MIN_HITS
};
