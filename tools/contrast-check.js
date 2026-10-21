#!/usr/bin/env node
/* P0-11 对比度核算核心（零依赖）。
   把 css/style.css 里**所有** `color:` 声明（硬编码 hex 或 `var(--token)`）
   与它解析出的背景色，在「浅色 / 暗色」两套主题下现场算 WCAG 2.1 1.4.3 比值。
   由 tools/test-ui-quality.js require；也可单独运行看违规清单：
     node tools/contrast-check.js
   设计要点（为什么不能只查 token）：
   实测暗色下 62 处硬编码色绕过 token，前景不换而底色变深，比值掉到 2.06–2.91:1。
   只断言 token 的门禁结构上看不见这些「使用层」漏洞，所以这里扫的是**声明**而不是**变量名**。 */
"use strict";

/* ---------- 颜色数学 ---------- */
function lum(hex) {
  let h = String(hex).replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length === 8) h = h.slice(0, 6);
  const c = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
/* 8 位 hex 是带 alpha 的底，需与其下的底色合成 */
function blend(fg, bg) {
  if (!fg || !/^#[0-9a-fA-F]{8}$/.test(fg)) return fg;
  const a = parseInt(fg.slice(7, 9), 16) / 255;
  const f = fg.slice(1, 7), b = String(bg).replace("#", "");
  const o = [0, 2, 4].map((i) => Math.round(parseInt(f.substr(i, 2), 16) * a + parseInt(b.substr(i, 2), 16) * (1 - a)));
  return "#" + o.map((v) => v.toString(16).padStart(2, "0")).join("");
}
function lineOf(text, i) { let n = 1; for (let j = 0; j < i && j < text.length; j++) if (text[j] === "\n") n++; return n; }

/* ---------- CSS 解析（真·花括号配对，@keyframes 也不会错位） ---------- */
function parseRules(text) {
  const out = []; let i = 0;
  while (i < text.length) {
    /* 跳过空白与注释（历史盲区：注释里写的示例 CSS 花括号会被当成真规则，
       解析出一条选择器是注释文字的假条目，报出的行号也不是真实位置）。 */
    for (;;) {
      const m = /^(?:\s+|\/\*[\s\S]*?\*\/)/.exec(text.slice(i));
      if (!m) break;
      i += m[0].length;
    }
    if (i >= text.length) break;
    const open = text.indexOf("{", i);
    if (open < 0) break;
    const sel = text.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    let d = 1, j = open + 1;
    for (; j < text.length; j++) { if (text[j] === "{") d++; else if (text[j] === "}") { d--; if (!d) break; } }
    out.push({ sel, at: sel.startsWith("@"), open, close: j, body: text.slice(open + 1, j), line: lineOf(text, open) });
    i = j + 1;
  }
  return out;
}
function tokensAt(text, from) {
  const i = text.indexOf(":root", from); if (i < 0) return {};
  const b = text.indexOf("{", i); if (b < 0) return {};
  let d = 0, e = b;
  for (; e < text.length; e++) { if (text[e] === "{") d++; else if (text[e] === "}") { d--; if (!d) break; } }
  const o = {}, re = /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g; let m;
  while ((m = re.exec(text.slice(b, e))) !== null) o[m[1]] = m[2];
  return o;
}
function decl(body, prop) { const m = body.match(new RegExp("(?:^|[;{])\\s*" + prop + "\\s*:\\s*([^;}]*)", "i")); return m ? m[1].trim() : null; }
function firstHex(v) { const m = v && v.match(/#[0-9a-fA-F]{3,8}/); return m ? m[0] : null; }
function resolve(v, th) {
  if (!v) return null;
  if (/transparent/i.test(v)) return null;          /* 透明 → 看祖先 */
  if (/gradient\(|url\(/i.test(v)) return null;     /* 渐变/图片：静态无法断定，退回页面底 */
  const m = v.match(/var\(\s*--([a-z0-9-]+)\s*\)/i);
  if (m) return th[m[1]] || null;
  return firstHex(v);
}
function strip(sel) { return sel.replace(/::?[a-z-]+(\([^)]*\))?/gi, "").replace(/\s+/g, " ").trim(); }

/* 颜色声明 → 可参与核算的 8 位 hex（token / hex / rgb() / rgba() 都认）。
   历史盲区：文本常用 rgba(255,255,255,.92) 写「92% 白」，旧实现只认 hex，
   于是这类声明整条被跳过，门禁看不到它 —— hero 那句 1.05:1 就是这么漏掉的。 */
function colorHex(v, th) {
  if (!v) return null;
  if (/transparent/i.test(v)) return null;
  const m = v.match(/var\(\s*--([a-z0-9-]+)\s*\)/i);
  if (m) return th[m[1]] ? colorHex(th[m[1]], th) : null;
  const h = firstHex(v);
  if (h) return h;
  const g = v.match(/rgba?\(([^)]+)\)/i);
  if (!g) return null;
  const p = g[1].split(",").map(function (s) { return Number(String(s).replace(/[^\d.]/g, "")); });
  if (p.length < 3 || p.some(function (n) { return !Number.isFinite(n); })) return null;
  const a = p.length > 3 && Number.isFinite(p[3]) ? p[3] : 1;
  const to = function (n) { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"); };
  return "#" + to(p[0]) + to(p[1]) + to(p[2]) + to(a * 255);
}

/* 渐变底的可解析色标（hex 与 var(--token) 都解析；rgba(255,255,255,.06) 之类是装饰层，不当作底色）。
   为什么必须解析 var()：`.home-goal-path` 的渐变端色随主题走，只认 hex 会把暗色主题误判成「浅底」。 */
function gradientStops(v, th) {
  if (!v || !/gradient\(/i.test(v)) return null;
  const out = [];
  const re = /#[0-9a-fA-F]{3,8}|var\(\s*--([a-z0-9-]+)\s*\)/gi;
  let m;
  while ((m = re.exec(v)) !== null) {
    let hex = null;
    if (m[1]) hex = th && th[m[1]] ? th[m[1]] : null;
    else hex = m[0];
    if (hex && out.indexOf(hex) < 0) out.push(hex);
  }
  return out.length ? out : null;
}

function analyze(css) {
  const rules = parseRules(css);
  const light = tokensAt(css, 0);
  const darkAt = css.indexOf("@media (prefers-color-scheme: dark)");
  const dark = Object.assign({}, light, darkAt < 0 ? {} : tokensAt(css, darkAt));

  /* 背景解析：规则自身 → 逐级祖先选择器 → 任意「前缀选择器」→ 页面底 --bg。
     返回 { hex } 或 { stops }；stops 表示静态可解析的渐变底（逐色标取最差对比度），
     这修的是历史盲区：.hero-sub 坐在 .hero 的深色渐变上，旧实现见到 gradient() 就退回页面底。 */
  function ownBgInfo(rule, th) {
    const v = decl(rule.body, "background(?:-color)?");
    const h = resolve(v, th);
    if (h) return { hex: h };
    const gs = gradientStops(v, th);
    if (gs) return { stops: gs };
    return null;
  }
  function bgFor(rule, th) {
    const own = ownBgInfo(rule, th);
    if (own) return own;
    let plain = strip(rule.sel);
    for (let hop = 0; hop < 5 && plain; hop++) {
      const parts = plain.split(" "); parts.pop();
      const anc = parts.join(" ");
      if (!anc) break;
      for (const r of rules) {
        if (r.at || strip(r.sel) !== anc) continue;
        const info = ownBgInfo(r, th);
        if (info) return info;
      }
      plain = anc;
    }
    const p0 = strip(rule.sel);
    let best = null, bl = -1;
    for (const r of rules) {
      if (r.at) continue;
      const info = ownBgInfo(r, th);
      if (!info) continue;
      for (const part of strip(r.sel).split(",")) {
        const t = part.trim();
        if (!t || t === p0) continue;
        if (p0.startsWith(t + " ") || p0.startsWith(t + ".") || p0.startsWith(t + ":") || p0.startsWith(t + "[")) {
          if (t.length > bl) { bl = t.length; best = info; }
        }
      }
    }
    if (best) return best;
    return { hex: th.bg };
  }
  /* 对比度：纯色底直接算；渐变底逐色标算，取最差的那个（对深/浅底同理）。 */
  function ratio(fg, bg) {
    if (!bg) return null;
    if (bg.stops) {
      return Math.min.apply(null, bg.stops.map(function (s) { return contrast(blend(fg, s), s); }));
    }
    return contrast(blend(fg, bg.hex), bg.hex);
  }

  const rows = [];
  for (const r of rules) {
    if (r.at) continue;
    const c = decl(r.body, "color");
    if (!c) continue;
    const lf = colorHex(c, light), df = colorHex(c, dark);
    if (!lf || !df) continue;                        /* 前景是渐变文字之类，跳过 */
    const lb = bgFor(r, light), db = bgFor(r, dark);
    rows.push({
      line: r.line, sel: r.sel, decl: c, hard: !!firstHex(c),
      lightFg: lf, lightBg: lb.hex || (lb.stops ? lb.stops[0] : null),
      darkFg: df, darkBg: db.hex || (db.stops ? db.stops[0] : null),
      light: ratio(lf, lb), dark: ratio(df, db),
      /* 渐变底（通常是祖父级深色面）：门禁现在能看见它，报告中单列 */
      gradient: !!((lb && lb.stops) || (db && db.stops)),
      /* 自身声明了背景 = 前景/背景是同元素内的配对，最可信 */
      pairedBg: !!(resolve(decl(r.body, "background(?:-color)?"), light) ||
                   resolve(decl(r.body, "background(?:-color)?"), dark)),
      fixedGradientBg: /gradient\(/i.test(decl(r.body, "background(?:-color)?") || ""),
      transparentBg: /transparent/i.test(decl(r.body, "background(?:-color)?") || ""),
    });
  }
  return { rows, light, dark, rules };
}

/* ---------------------------------------------------------------------------
   白名单：静态核算给出的背景是「页面底」，但真实背景是**固定的深色渐变/深色底**，
   白字实际上坐在深色上。只允许「非文本用途」或「背景静态不可解析」两类，
   且每一条都必须写明真实背景与理由。真实背景已逐条人工核算（数值见注释）。
   （不写白名单的替代做法是给这些元素加一条假的浅色底 —— 那会破坏视觉语言。）
   --------------------------------------------------------------------------- */
const WHITELIST = [
  /* 固定深蓝渐变底（两套主题下都是同一个深蓝，白字对比 9.1–10.4:1）。
     静态解析器见到 gradient() 会退回页面底，故此处放行并记录实测值。 */
  [".hero", "color:#fff", "底是固定深蓝渐变 linear-gradient(#1e3a8a…)；白字实测 10.36:1"],
  /* 单词卡背面：底色是**两套主题下都固定**的深蓝渐变，现在两端同值 #2563eb → #2563eb
     （原来是 #1e3a8a→#2563eb，最浅端 5.17:1 也达标；同值只是更简洁）。
     下面每条都按**最浅端 #2563eb**记录实测值（对更深的端只会更高）。 */
  [".flash-back", "color:var(--on-primary)", "底=固定深蓝 #2563eb（渐变同值）；白字实测 5.17:1"],
  [".flash-back .ipa", "color:rgba(255,255,255,.96)", "白字 96% 合成后 #f5f8fe，对 #2563eb 实测 4.90:1（原 --on-primary-soft=#dbeafe 只有 4.24:1，已改为白系并在此记录）"],
  [".flash-back .cn-ok", "color:#fff", "同 .flash-back：白字对 #2563eb 实测 5.17:1"],
  [".flash-back .play-btn", "color:#fff", "底色刻意与牌面同色 #2563eb（只描 2px 白边），白字实测 5.17:1；hover 反白为 95% 白底 + 深蓝字，实测 4.73:1"],
  [".flash-back .play-btn:hover", "color:#2563eb", "hover 态：底=95% 白（#f2f5fb）与固定深蓝混合，深蓝字对 #f2f5fb 实测 4.73:1"],
  /* 引导横幅：**渐变两端同值 --primary**（白字 5.17:1）。
     历史：右端曾是 #3b82f6，白字只有 3.68:1，同条上的 .ob-bar-sub（opacity .92）3.36:1、
     .ob-bar-x（原 .85）3.09:1 全都不达标——现改为同值实色，并把两处 opacity 都提到 .92（4.65:1）。 */
  [".ob-bar", "color:#fff", "底=实色 --primary #2563eb（渐变同值）；白字实测 5.17:1、92% 合成 4.65:1"],
  [".ob-bar .btn-outline", "color:#fff", "无自身底色，坐在 .ob-bar 的 #2563eb 上；实测 5.17:1"],
  [".ob-bar-x", "color:#fff", "无自身底色，坐在 .ob-bar 的 #2563eb 上；opacity .92 合成后实测 4.65:1"],
  /* 深色浮层底（浅色主题下也是深色，白字对比 12.6–14.6:1） */
  [".sw-update", "color:#e2e8f0", "底是固定深色 #1e293b 的浮层（不是页面底）；实测 11.87:1"],
  [".toast", "color:#e2e8f0", "底是固定深色 #0f172a 的浮层；实测 14.48:1"],
  [".dlg-line .sp", "color:#fff", "圆形图标（非正文文本）且真实底随主题走：浅色 .dlg-line 底=--card 白 (#fff 14.63:1)、暗色底=暗卡 (#fff 14.63:1) 均达标"],
  /* .btn-ghost 是**深色面专用**的白字按钮（无自身底色）。它被误用到浅色卡片上时白字不可见——
     placement 页就发生过（实测 1:1）。这条豁免保留是因为解析器看不到真实底，但必须配合
     "使用层"守卫：tools/test-ui-quality.js 的 P2-9 会扫描所有 btn-ghost 用法并要求其
     所在模板位于深色面（.hero/.ob-bar/.flash-back）或已改用 btn-outline。 */
  [".btn-ghost", "color:#fff", "幽灵按钮（非正文装饰性按钮文字）无自身底色，**只允许出现在深色面上**：.hero 固定深蓝渐变实测 10.36:1 / .ob-bar #2563eb 实测 5.17:1 / .flash-back 固定深蓝 实测 5.17:1。误用到浅色卡片上会是 1:1（placement 页已修）；P2-9 扫源码使用层守住这条"],
];
const WL = new Set(WHITELIST.map((w) => w[0] + "|" + w[1]));
const wlKey = (row) => row.sel + "|color:" + row.decl;

module.exports = { analyze, contrast, lum, blend, lineOf, parseRules, strip, WHITELIST, WL, wlKey };

if (require.main === module) {
  const fs = require("fs"), path = require("path");
  const FILE = path.join(__dirname, "..", "css/style.css");
  const css = fs.readFileSync(FILE, "utf8");
  const A = analyze(css);
  const bad = A.rows.filter((r) => (r.light < 4.5 || r.dark < 4.5) && !WL.has(wlKey(r)));
  const wl = A.rows.filter((r) => (r.light < 4.5 || r.dark < 4.5) && WL.has(wlKey(r)));

  /* `--baseline` 与 git HEAD 的版本对照，产出「改前 → 改后」比值表 */
  if (process.argv.includes("--baseline")) {
    try {
      const { execFileSync } = require("child_process");
      const base = execFileSync("git", ["show", "HEAD:css/style.css"], { cwd: path.join(__dirname, ".."), encoding: "utf8", maxBuffer: 1 << 28 });
      const B = analyze(base);
      const bBad = B.rows.filter((r) => r.light < 4.5 || r.dark < 4.5);
      const hc = bBad.filter((r) => r.hard).length;
      const tok = bBad.length - hc;
      console.log("基线（git HEAD）  ：color 声明 " + B.rows.length + " 条，不达标 " + bBad.length +
        "（硬编码 hex " + hc + " / token 引用 " + tok + "；浅色不达标 " + B.rows.filter((r) => r.light < 4.5).length + "）");
      console.log("当前工作区        ：color 声明 " + A.rows.length + " 条，不达标 " + bad.length +
        "（白名单豁免 " + wl.length + "；浅色不达标 " + A.rows.filter((r) => r.light < 4.5 && !WL.has(wlKey(r))).length + "）");
      /* 按 (选择器, 声明值) 配对，给出逐条改前/改后 */
      const now = new Map(); A.rows.forEach((r) => now.set(r.sel + "||" + r.decl, r));
      const changed = [];
      for (const b of B.rows) {
        const n = now.get(b.sel + "||" + b.decl);
        if (n) continue;                       /* 未变化 */
        changed.push({ line: b.line, sel: b.sel, before: b.decl, db: b.dark, lb: b.light });
      }
      console.log("\n改前不达标、声明值已变（前 " + changed.length + " 条，此处列暗色改前比值）：");
      for (const c of changed.sort((a, b) => a.line - b.line)) {
        console.log("  HEAD:" + String(c.line).padStart(4) + " | " + c.sel.slice(0, 40).padEnd(40) + " | " + c.before.padEnd(20) + " | 暗改前 " + c.db.toFixed(2));
      }
    } catch (e) { console.log("（--baseline 需要 git 与 HEAD 版本，跳过：" + e.message + "）"); }
  }

  console.log("\n当前不达标 " + bad.length + " 条（白名单豁免 " + wl.length + "）");
  for (const r of bad.sort((a, b) => a.line - b.line)) {
    console.log(String(r.line).padStart(5) + " | " + r.decl.padEnd(20) + " | 浅 " + r.light.toFixed(2) +
      " | 暗 " + r.dark.toFixed(2) + " | " + r.sel.slice(0, 42));
  }
  if (wl.length) {
    console.log("\n白名单（静态背景不可解析，已人工核算真实底）：");
    for (const r of wl) console.log("  " + r.sel + " :: color:" + r.decl);
  }
}
