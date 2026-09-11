#!/usr/bin/env node
/* ============ 构建期工具：把音标统一为美式通用口音（General American） ============
   规范化两条映射（与推荐发音人 en-US-* / Azure 一致）：
     · /ɒ/  → /ɑː/   英式半开圆唇元音 → 美式（hot、product、follow）
     · /əʊ/ → /oʊ/   英式 GOAT 元音   → 美式（code、note、loading）

   只改 vocab[].ipa 字段内的音标正文，不碰其它任何字段与格式。
   幂等：已统一后再次运行无改动；只有发生真实替换才写盘。

   用法：
     node tools/normalize-ipa-am.js          # 只审计并打印差异（不写盘，默认）
     node tools/normalize-ipa-am.js --fix    # 就地归一化

   ⚠️ 历史 bug（已修）：旧版用 /\/ɒ\// 匹配，要求 ɒ 两侧都紧邻斜杠，
   即「整个 ipa 字段恰好等于 /ɒ/」才会命中——对 /ˈprɒdʌkt/ 这类真实音标永远不生效，
   因此该工具此前实际从未归一化过任何词条。现改为直接对 ipa 正文字符做替换。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WEB_JS = path.join(__dirname, "..", "js");
const FILES = ["data.js", "data-ops.js", "data-ocean.js", "data-incoterms.js", "data-settle.js", "data-risk.js", "data-deep.js", "data-meeting.js"];

/* 单条音标正文的规范化（纯函数，便于测试） */
function normalizeIpa(ipa) {
  if (typeof ipa !== "string" || !ipa) return ipa;
  return ipa.replace(/ɒ/g, "ɑː").replace(/əʊ/g, "oʊ");
}

/* 统计一条音标里需要修正的处数（用于报告「改了几处」而不是「改了几条」） */
function countIssues(ipa) {
  if (typeof ipa !== "string") return 0;
  return (ipa.match(/ɒ/g) || []).length + (ipa.match(/əʊ/g) || []).length;
}

/* 源文件级替换：只动 ipa: "..." / ipa: '...' 的引号内正文 */
function normalizeSource(src) {
  let entries = 0, fixes = 0;
  const out = src.replace(/(\bipa\s*:\s*)(["'])([^"']*)\2/g, function (m, pre, q, body) {
    const fixed = normalizeIpa(body);
    if (fixed === body) return m;
    entries++;
    fixes += countIssues(body);
    return pre + q + fixed + q;
  });
  return { out: out, entries: entries, fixes: fixes };
}

function loadFTE() {
  const ctx = { console: console };
  vm.createContext(ctx);
  for (const f of FILES) {
    let src = fs.readFileSync(path.join(WEB_JS, f), "utf8");
    if (f === "data.js") src += "\nglobalThis.FTE_DATA = FTE_DATA;";
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx.FTE_DATA;
}

/* 审计：实际读回 FTE_DATA，按音素统计残留（比正则扫源码更可信） */
function audit() {
  const FTE = loadFTE();
  let checked = 0, bad = [];
  for (const u of FTE.units || []) {
    for (const v of u.vocab || []) {
      if (typeof v.ipa !== "string" || !v.ipa) continue;
      checked++;
      if (countIssues(v.ipa) > 0) bad.push({ unit: u.id, w: v.w, ipa: v.ipa });
    }
  }
  if (bad.length) {
    console.log("IPA 审计：检查 " + checked + " 条，有 " + bad.length + " 条含非美式音标：");
    bad.forEach(function (b) { console.log("    U" + b.unit + "  " + b.w + "  " + b.ipa); });
    console.log("  → 运行 node tools/normalize-ipa-am.js --fix 统一为美式。");
  } else {
    console.log("IPA 审计：检查 " + checked + " 条，全部符合美式通用口音口径（/ɒ/、/əʊ/ 均已归一）。");
  }
  return { checked: checked, bad: bad };
}

function replace() {
  let totalEntries = 0, totalFixes = 0;
  for (const f of FILES) {
    const p = path.join(WEB_JS, f);
    const src = fs.readFileSync(p, "utf8");
    const r = normalizeSource(src);
    if (r.entries > 0) {
      fs.writeFileSync(p, r.out, "utf8");
      console.log("  " + f + "：修正 " + r.entries + " 条 / " + r.fixes + " 处");
      totalEntries += r.entries; totalFixes += r.fixes;
    }
  }
  console.log("已归一化 " + totalEntries + " 条 / " + totalFixes + " 处（幂等：重复运行不再改动）。");
  return totalFixes;
}

if (require.main === module) {
  if (process.argv.indexOf("--fix") !== -1) replace();
  else audit();
}

module.exports = { audit: audit, replace: replace, normalizeIpa: normalizeIpa, normalizeSource: normalizeSource, countIssues: countIssues, FILES: FILES };
