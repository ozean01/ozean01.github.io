#!/usr/bin/env node
/* 生成 js/lvl-map.js：词(小写) -> lvl 的运行时映射，供 app.js 的词频标注使用。
   数据来源同 audit-ipa.js 的启发式，输出一个紧凑的 JSON（约 10-20 KB），
   加载后由 app.js 读取 window.FTE_LVL。 */
"use strict";
const fs = require("fs");
const path = require("path");

const JSDIR = path.join(__dirname, "..", "js");
const FILES = ["data.js", "data-ops.js", "data-ocean.js", "data-incoterms.js", "data-settle.js"];

const TECH = /(adhesive|resin|poly|isocyan|catal|solvent|laminate|lamination|coating|film|pouch|bag|pack|carton|container|freight|vessel|voyage|customs|tariff|inspection|invoice|shipment|remitt|letter.?of.?credit|documentary|negotiat|incoterm|fob|cif|cfr|cpt|cip|exw|fca|fas|dap|dpu|ddp|consignee|shipper|demurrage|detention|telex|endorsement|bill.?of.?exchange|promissory|fcl|lcl|teu|feu|etd|eta|vgm|certif|quota|membrane|barrier|retort|freezer|gravure|flexo|die.?cut)/;
const HIGH = new Set(("a about accept actual additional address advise after agent all allow also amount and any are around as at available back balance bank base because before below benefit between bill both buyer by can case change charge check claim clear client close come company confirm contact contract correct cost could country customer date day deal deliver delivery deposit detail document door during each early email end english estimate exchange export final find first for full get give goods have here high how if import include invoice just know last lead letter level line list load local long make market meet more most need new no not number of offer office on one only or order our out pack package payment place plan please price product quality quantity quote receive reply report request sample send ship shipping show signature site some specification still subject supply team that the their them there these they this time to total trade transport try use want way weight when where which who with work write year you your").split(/\s+/));

const vm = require("vm");
const ctx = { console };
vm.createContext(ctx);
for (const f of FILES) {
  let src = fs.readFileSync(path.join(JSDIR, f), "utf8");
  if (f === "data.js") src += "\nglobalThis.FTE_DATA = FTE_DATA;";
  vm.runInContext(src, ctx, { filename: f });
}

const map = {};
const dup = {};
ctx.FTE_DATA.units.forEach(function (u) {
  u.vocab.forEach(function (v) {
    const w = String(v.w || "").toLowerCase();
    let lvl;
    if (TECH.test(w) || /\s/.test(w) || /[-\d]/.test(w) || w.length > 12) lvl = "tech";
    else if (HIGH.has(w)) lvl = "high";
    else lvl = "common";
    if (map[w] && map[w] !== lvl) {
      (dup[w] || (dup[w] = {})).prev = map[w];
      map[w] = lvl;
    } else {
      map[w] = lvl;
    }
  });
});

const out = "/* 词频难度映射 */\n" +
  "/* 由 tools/gen-lvl-map.js 生成：词 -> lvl（high 高频 / common 常用 / tech 专业）。\n" +
  "   页面运行时读取 window.FTE_LVL；app.js 的 wordFreqTag 优先使用它，缺失时才回退正则。 */\n" +
  "window.FTE_LVL = " + JSON.stringify(map) + ";\n";
fs.writeFileSync(path.join(JSDIR, "lvl-map.js"), out, "utf8");

const c = { tech: 0, high: 0, common: 0 };
Object.keys(map).forEach(function (k) { c[map[k]]++; });
console.log("生成 js/lvl-map.js：条目 " + Object.keys(map).length +
  "（高 " + c.high + " / 常 " + c.common + " / 专 " + c.tech + "），冲突词 " + Object.keys(dup).length);
