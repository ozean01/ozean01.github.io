#!/usr/bin/env node
/* ============ 构建期工具：生成 js/difficulty-map.js（window.FTE_DIFF 难度标定） ============
   读取 js/data*.js 的课程结构 + tools/cefr/ 的开放 CEFR 词汇画像（CEFR-J A1-B2 + Octanove C1-C2），
   计算：
   - 词级：真实 CEFR 分级（A1/A2=易、B1=中、B2/C1/C2=难）；未收录（多为行业/复合术语）按词长+音节
     兜底，并标 dom=行业术语（与难度正交）。
   - 词频覆盖：coverage（列表条目数 / 词命中数）。
   - 单元级：nVocab / 平均句长 / 每词音节 / 平均词长 / 专业词占比 / 平均 CEFR / Flesch 可读性，
     归一成 score 与 band（基础/进阶/拔高），并给 sortIdx（站内相对难度序）。
   输出：js/difficulty-map.js（window.FTE_DIFF = {...}）。
   注意：本脚本只读不重新生成时不会改动现有 map；如需重算直接运行 `node tools/gen-difficulty.js`。 */
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
function syllables(w) {
  w = String(w).toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 1;
  const groups = w.replace(/(?:[^aeiouy]+|(?<=[aeiouy])[aeiouy]*)*/g, "").match(/[aeiouy]+/g);
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

/* ---------- 主流程 ---------- */
function build() {
  const FTE = loadFTE();
  const c = loadCefr();
  const dict = {};

  /* 词级 */
  let covered = 0, total = 0;
  const words = {};
  FTE.units.forEach(function (u) {
    u.vocab.forEach(function (v) {
      const ws = wordStats(v.w, c.map);
      if (ws.cefr) covered++;
      total++;
      if (!words[v.w]) words[v.w] = ws;
    });
  });

  /* 单元级 */
  const units = {};
  FTE.units.forEach(function (u) {
    let vocab = u.vocab || [];
    let sylSum = 0, lenSum = 0, cefrSum = 0, cefrN = 0, dom = 0, sentCount = 0;
    vocab.forEach(function (v) {
      const ws = wordStats(v.w, c.map);
      sylSum += ws.syl; lenSum += ws.len;
      if (ws.cefr) { cefrSum += cefrRank(ws.cefr); cefrN++; }
      if (ws.dom) dom++;
    });
    const lines = [];
    (u.dialogues || []).forEach(function (d) { (d.lines || []).forEach(function (l) { lines.push(l.en); }); });
    sentCount = lines.length || Math.max(1, vocab.length);
    const wordsPerSentence = lines.length ? (lines.join(" ").split(/\s+/).filter(Boolean).length / sentCount) : 0;
    const avgCefr = cefrN ? (cefrSum / cefrN) : 0;
    const score = 0.5 * Math.min(1, (avgCefr || 1.6) / 2.2) + 0.3 * Math.min(1, (sylSum / Math.max(1, vocab.length)) / 1.7) + 0.2 * Math.min(1, (lenSum / Math.max(1, vocab.length)) / 5.2);
    units[u.id] = {
      nVocab: vocab.length,
      wordsPerSentence: Math.round(wordsPerSentence * 100) / 100,
      sylPerWord: Math.round((sylSum / Math.max(1, vocab.length)) * 100) / 100,
      avgWordLen: Math.round((lenSum / Math.max(1, vocab.length)) * 100) / 100,
      domPct: Math.round(dom / Math.max(1, vocab.length) * 100),
      avgCefr: Math.round(avgCefr * 100) / 100,
      flesch: flesch(lines),
      score: Math.round(score * 1000) / 1000
    };
  });

  /* 归一化 + 档位 + 排序 */
  const ids = FTE.units.map(function (u) { return u.id; });
  const scores = ids.map(function (id) { return units[id].score; });
  const min = Math.min.apply(null, scores), max = Math.max.apply(null, scores);
  const span = (max - min) || 1;
  ids.forEach(function (id) {
    const norm = Math.round((units[id].score - min) / span * 1000) / 1000;
    units[id].norm = norm;
    units[id].band = norm >= 0.6 ? 3 : norm >= 0.3 ? 2 : 1;
  });
  const sorted = ids.slice().sort(function (a, b) { return units[a].score - units[b].score; });
  const order = { };
  sorted.forEach(function (id, i) { order[id] = i + 1; if (order[id] <= 998) units[id].sortIdx = order[id]; });

  const ms = { 1: "基础", 2: "进阶", 3: "拔高" };
  ids.forEach(function (id) { units[id].bandLabel = ms[units[id].band]; });

  const data = {
    version: 2,
    model: "CEFR (CEFR-J A1-B2 + Octanove C1-C2) primary; length+syllable fallback for out-of-list terms",
    source: ["openlanguageprofiles/olp-en-cefrj", "octanove-c1c2"],
    generated: new Date().toISOString().slice(0, 10),
    bandLabels: { easy: "易", mid: "中", hard: "难" },
    cefrBands: { A1: "易", A2: "易", B1: "中", B2: "难", C1: "难", C2: "难" },
    unitBandLabels: { 1: "基础", 2: "进阶", 3: "拔高" },
    coverage: { listEntries: c.listEntries, courseWordsFound: covered, courseWords: total },
    words: words,
    units: units,
    order: sorted
  };

  const out = "window.FTE_DIFF = " + JSON.stringify(data) + ";";
  fs.writeFileSync(OUT, out, "utf8");
  console.log("已生成 js/difficulty-map.js：课程词 " + total + "（命中 CEFR " + covered + "），单元 " + ids.length + "。");
  return data;
}

if (require.main === module) build();

module.exports = { build: build, FILES: FILES };
