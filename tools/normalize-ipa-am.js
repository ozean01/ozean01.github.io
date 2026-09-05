#!/usr/bin/env node
/* ============ 构建期工具：把音标统一为美式（/ɒ/ → /ɑː/），可重复（幂等） ============
   只扫描 js/data*.js 里 FTE_DATA.units 结构中 vocab[].ipa 含英式半开圆唇元音 /ɒ/ 的音标，
   就地替换为美式 /ɑː/（与推荐发音人 en-US-* / Azure 一致）。
   幂等：已统一后再次运行无改动；只有发生真实替换才写盘，不改其它字段。 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WEB_JS = path.join(__dirname, "..", "js");
const FILES = ["data.js", "data-ops.js", "data-ocean.js", "data-incoterms.js", "data-settle.js", "data-risk.js", "data-deep.js", "data-meeting.js"];

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

function audit() {
  const FTE = loadFTE();
  let checked = 0, found = 0;
  for (const u of FTE.units || []) {
    for (const v of u.vocab || []) {
      if (typeof v.ipa !== "string" || !v.ipa) continue;
      checked++;
      if (v.ipa.indexOf("/ɒ/") !== -1) found++;
    }
  }
  console.log("IPA 审计：检查 " + checked + " 条，含英式 /ɒ/ 的 " + found + " 条（运行本脚本即可统一为 /ɑː/）。");
  return { checked: checked, found: found };
}

function replace() {
  let total = 0;
  for (const f of FILES) {
    const p = path.join(WEB_JS, f);
    let src = fs.readFileSync(p, "utf8");
    const out = src.replace(/\/ɒ\//g, "/ɑː/");
    if (out !== src) { fs.writeFileSync(p, out, "utf8"); total += (src.match(/\/ɒ\//g) || []).length; }
  }
  console.log("已把 " + total + " 处 /ɒ/ 替换为 /ɑː/（幂等：重复运行不再改动）。");
  return total;
}

if (require.main === module) audit();

module.exports = { audit: audit, replace: replace, FILES: FILES };
