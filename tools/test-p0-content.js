#!/usr/bin/env node
/* 门禁：P0 批次（第二期评审委员会）不变量

   为什么需要它：第二期 12 席评审发现的问题里，有一类是「改了但会被改回去」——
   术语误译、法规编号、GA 卷舌音标、伪隐藏的渲染出口、腐化的冒烟页断言。
   这些问题靠人记住不可靠，故把**机器可验证（A 级）**的部分固化成断言：
   任何人把它们改回错误写法，`npm test` 直接变红。

   口径来源（每条断言都能追到证据）：
     · 禁用串与法规口径 —— `_fte-review-2/S02-食品接触材料法规.md`、`S03-软包装工艺与术语.md`
     · GA 卷舌 /r/      —— `_fte-review-2/S05-母语审校与应用语音学.md`（CMUdict 交叉验证）
     · #wsAi 渲染出口   —— `_fte-review-2/S11-独立渗透复测.md`（行为级复现）
     · ESM 加载方式     —— `_fte-review-2/S07-Web性能与跨端真机.md`（真机实测 SyntaxError）
     · 冒烟页假绿       —— `_fte-review-2/S07-Web性能与跨端真机.md`
     · 零埋点措辞       —— `_fte-review-2/S12-增长与分发.md`
     · fte-trace 入备份 —— `_fte-review-2/S12-增长与分发.md`

   注意：本文件只断言「不变量」，不重复其它门禁已覆盖的内容
   （转义、CSP、存储键登记、预缓存完整性等分别由 test-security.js / test-assets.js 守）。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let pass = true;
function check(name, cond, info) {
  console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));
  if (!cond) pass = false;
}
function read(p) { return fs.readFileSync(path.join(ROOT, p), "utf8"); }
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }

/* 站点全部运行时 JS（不含 vendor：第三方包不适用本站口径） */
function runtimeJsFiles() {
  const dir = path.join(ROOT, "js");
  return fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); })
    .map(function (f) { return "js/" + f; });
}
const JS_FILES = runtimeJsFiles();

/* ---------- 1. 术语/法规禁用串（A 级：站内自相矛盾 + 官方条文） ---------- */
const BANNED = [
  ["erucylamide", "芥酸酰胺的正确拼写是 erucamide（S03 勘误表 A 组）"],
  ["doctor camber", "应为 chambered doctor blade（S03）"],
  ["wind pressure", "卷绕压力应为 winding pressure（S03）"],
  ["spray code", "喷码应为 inkjet coding / date coding（S03）"],
  ["charging pressure test", "应为 air-inflation test（S03）"],
  ["total migration", "EU 10/2011 第 12 条官方术语为 overall migration (OML)（S02）"],
  ["food-grade certified", "不存在「食品级认证」这一概念，应为 food-contact compliant（S02）"]
];
BANNED.forEach(function (pair) {
  const hits = [];
  JS_FILES.forEach(function (f) {
    read(f).split("\n").forEach(function (line, i) {
      if (line.toLowerCase().indexOf(pair[0]) !== -1) hits.push(f + ":" + (i + 1));
    });
  });
  check("禁用串「" + pair[0] + "」在运行时 JS 中零命中（" + pair[1] + "）", hits.length === 0, hits.slice(0, 5).join(", "));
});

/* 胶粘剂不得再引 175.300（涂层条）；175.105 = Adhesives，见 S02。
   只禁「adhesive … 175.300」这一就近搭配：辨析文案里单独出现 175.300 是允许的。 */
JS_FILES.forEach(function (f) {
  const bad = [];
  read(f).split("\n").forEach(function (line, i) {
    if (/adhesive[^.\n]{0,60}175\.300/i.test(line)) bad.push(f + ":" + (i + 1));
  });
  if (bad.length) check("「adhesive … 175.300」不得同现（" + f + "）", false, bad.join(", "));
});
check("胶粘剂不得再就近引用 175.300（全站扫描；正确依据是 175.105）", true);

/* ---------- 2. GA 卷舌 /r/（A 级：CMUdict 交叉验证过的夹具） ---------- */
const RHOTIC = JSON.parse(read("tools/data-p0-rhotic.json"));
check("GA 卷舌夹具非空（否则门禁形同虚设）", Array.isArray(RHOTIC) && RHOTIC.length >= 25, "n=" + (RHOTIC || []).length);
const RHOTIC_RE = /[rɹɚɝ]/;
/* 词条可能分布在任一 data*.js 里，故在全部数据文件里查（不写死文件，避免行/文件漂移） */
const DATA_FILES = JS_FILES.filter(function (f) { return /^js\/data[\w-]*\.js$/.test(f); });
let rhoticBad = [];
let rhoticOk = 0;
(RHOTIC || []).forEach(function (item) {
  const w = String(item.w == null ? item : item.w);
  const re = new RegExp('w:\\s*"' + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"', "i");
  let ipa = null, where = null;
  for (let i = 0; i < DATA_FILES.length && ipa === null; i++) {
    const lines = read(DATA_FILES[i]).split("\n");
    for (let j = 0; j < lines.length; j++) {
      if (re.test(lines[j])) {
        const m = lines[j].match(/ipa:\s*"([^"]*)"/);
        if (m) { ipa = m[1]; where = DATA_FILES[i] + ":" + (j + 1); break; }
      }
    }
  }
  if (ipa === null) { rhoticBad.push(w + "（未找到词条或 ipa）"); return; }
  if (!RHOTIC_RE.test(ipa)) { rhoticBad.push(w + " → " + ipa + " @" + where); return; }
  rhoticOk++;
});
check("GA 卷舌：夹具 " + (RHOTIC || []).length + " 个词条（CMUdict 逐词验证）音标必须含 r/ɹ/ɚ/ɝ", rhoticBad.length === 0,
  rhoticOk + " 通过 / " + rhoticBad.length + " 失败" + (rhoticBad.length ? "：" + rhoticBad.slice(0, 5).join(" | ") : ""));

/* ---------- 3. AI 批改结果必须真的渲染（S11 行为级复现的缺陷不许复发） ---------- */
const writeSrc = read("js/write.js");
check("js/write.js 的 #wsAi 不得是恒 hidden 的字面量（S11：结果写入后被 render() 抹掉）",
  !/id="wsAi"[^>]*\shidden(\s|>)/.test(writeSrc));
check("js/write.js 有从状态重建 AI 批改结果的渲染点（引用 aiAdvice/aiFull）",
  /aiAdvice/.test(writeSrc) && /aiFull/.test(writeSrc) &&
  writeSrc.split("\n").filter(function (l) { return /aiAdvice/.test(l) && /innerHTML|textContent|escape|esc\(/.test(l); }).length > 0,
  "需存在把 aiAdvice 写进 DOM 的代码行");

/* ---------- 4. 音素诊断必须用 ESM 正确方式加载（S07 真机实测 SyntaxError） ---------- */
const eval4Src = read("js/eval4.js");
check("js/eval4.js 不得用 loadScript 加载 ESM 包（S07：真机恒定 SyntaxError: Unexpected token 'export'）",
  !/loadScript\(\s*CTC_LIB\s*\)/.test(eval4Src));
check("js/eval4.js 改用动态 import() 加载 transformers（同文件已有正确范例）",
  /import\([^)]*transformers/i.test(eval4Src) || /await\s+import\(/.test(eval4Src) && /transformers/i.test(eval4Src));

/* ---------- 5. 冒烟页不得再假绿（S07 实测 375px 溢出 38px 而断言为绿） ---------- */
const smoke = read("tools/smoke-phase2.html");
/* 只在**代码**上断言，注释里解释「为什么不能用 innerWidth / 以前硬写 v1.8.0」是允许且有价值的 */
const smokeCode = smoke
  .replace(/<!--[\s\S]*?-->/g, "")          // HTML 注释
  .replace(/\/\*[\s\S]*?\*\//g, "")         // JS 块注释
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");    // JS 行注释（不误伤 https://）
/* 口径：**判定**必须基于 documentElement.clientWidth；
   把 innerWidth 作为「对照值」打印出来是允许的（S07 发现 innerWidth 会被撑宽，故不能当基准），
   但不允许拿它与阈值比较。 */
const usesClientWidth = /documentElement\.clientWidth/.test(smoke) &&
  /scrollWidth\s*-\s*[^;\n]*clientWidth/.test(smoke);
/* 只有"带操作数的比较"才算违规。
   注意不能写成 /innerWidth\s*[<>]/：页面正文里 `<b>不用 window.innerWidth</b>` 的 `</b>`
   会被误判成 `<` 比较（第一版就踩了这个坑，门禁自己假红）。 */
const comparesInnerWidth = /innerWidth\s*[<>]=?\s*[\w.]/.test(smokeCode) ||
  /[\w.]\s*[<>]=?\s*innerWidth\b/.test(smokeCode);
check("冒烟页溢出判定必须以 documentElement.clientWidth 为基准，且不得用 innerWidth 做比较",
  usesClientWidth && !comparesInnerWidth,
  usesClientWidth ? (comparesInnerWidth ? "仍在用 innerWidth 做比较" : "") : "未找到 scrollWidth-clientWidth 判定");
check("冒烟页版本断言不得硬编码（原为 v1.8.0，实际 1.11.0）",
  !/v1\.8\.0/.test(smokeCode) && /FTE_VERSION/.test(smokeCode));
check("冒烟页必须遍历全部路由而不是只测一页",
  /ROUTES/.test(smokeCode));

/* 冒烟页的 ROUTES 是**手抄** js/app.js 的路由表的（app.js 没有导出路由数组），
   加新路由时最容易忘记同步 —— 那会让"遍历全部路由"悄悄退化成"遍历一批旧路由"。
   这里断言：冒烟页列的每一条路由都必须在 app.js 里真实存在（`route: "#/…"`）。
   反向（app.js 有、冒烟页没列）只作为提示打印，不失败——冒烟页可以只覆盖主路径。 */
const appSrcForRoutes = read("js/app.js");
/* app.js 没有导出路由数组，且路由表写法分散（`route: "#/x"` 只是其中一种），
   故取「app.js ∪ index.html 里出现过的全部 #/… 字面量」作为"已知路由宇宙"。
   这不追求完备（真正的路由表在 app.js 内部），只用于抓"手抄清单腐化/拼错路由"。 */
const knownRoutes = {};
[read("js/app.js"), indexSrcForRoutesNav()].forEach(function (src) {
  (src.match(/"#\/[\w\-/]*"/g) || []).forEach(function (s) { knownRoutes[s.slice(1, -1)] = true; });
});
/* 不以上述字面量形式出现的路由，显式列出（每条都要能说出为什么）：
   · #/units/placement、#/phonemes/listen —— 由课程页 / 音素页的 tab 状态拼出的深链；
   · #/board —— 旧别名，在 app.js 的 REDIRECT_ROUTES 里以 `board: "today"` 形式存在（无 #/ 前缀）。 */
const DEEP_LINK_ROUTES = ["#/units/placement", "#/phonemes/listen", "#/board"];
DEEP_LINK_ROUTES.forEach(function (r) { knownRoutes[r] = true; });
function indexSrcForRoutesNav() { return read("index.html"); }
const smokeRoutes = (smoke.match(/"#\/[\w\-/]*"/g) || []).map(function (s) { return s.replace(/"/g, ""); });
const uniqueSmokeRoutes = smokeRoutes.filter(function (v, i) { return smokeRoutes.indexOf(v) === i; });
const unknownRoutes = uniqueSmokeRoutes.filter(function (r) { return !knownRoutes[r]; });
check("冒烟页 ROUTES 的每条路由都必须在 app.js/index.html 的已知路由里（防手抄清单腐化）",
  unknownRoutes.length === 0, "未知路由：" + unknownRoutes.join(", "));
const notSwept = Object.keys(knownRoutes).filter(function (r) { return uniqueSmokeRoutes.indexOf(r) === -1; });
console.log("  ℹ️ 冒烟页覆盖 " + uniqueSmokeRoutes.length + " 条 / 已知路由 " + Object.keys(knownRoutes).length +
  " 条" + (notSwept.length ? "（未覆盖 " + notSwept.length + " 条，仅提示）：" + notSwept.slice(0, 8).join(" ") : ""));

/* ---------- 6. 「零埋点」措辞与备份边界（S12） ---------- */
const indexSrc = read("index.html");
check("index.html 不得再写「没有埋点」（S12：实有本机行为记录）",
  indexSrc.indexOf("没有埋点") === -1);
const sk = read("js/storage-keys.js");
const traceRow = sk.split("\n").filter(function (l) { return /"fte-trace-v1"/.test(l); })[0] || "";
check("fte-trace-v1 必须被排除出备份（S12：否则行为轨迹随备份发给同事）",
  /backup:\s*false/.test(traceRow), traceRow.trim().slice(0, 80));

/* ---------- 7. 夹具与口径文件必须存在（防止门禁被静默削弱） ---------- */
check("GA 卷舌夹具文件存在且可解析", exists("tools/data-p0-rhotic.json") && Array.isArray(RHOTIC));
check("禁用串清单非空（防止有人用空数组把门禁做空）", BANNED.length >= 7, "n=" + BANNED.length);

/* ---------- 8. 首访体量：页面永不渲染的分享图不得进离线预缓存（S07/S10 → P0-14） ---------- */
const swSrc = read("sw.js");
const preBlock = (swSrc.match(/const PRECACHE = \[([\s\S]*?)\];/) || [])[1] || "";
const preEntries = (preBlock.match(/"[^"]+"/g) || []).map(function (s) { return s.replace(/"/g, ""); });
check("og-image.png 不得出现在 PRECACHE 里（它只服务社交抓取爬虫，页面渲染路径从不加载，占 403 KB）",
  preEntries.indexOf("./og-image.png") === -1 && preEntries.indexOf("og-image.png") === -1);
/* 基线与 sw.js 必须同源：清单条数、指纹、CACHE 版本三者错位时，test-outcomes 的判据会失准 */
const baseline = JSON.parse(read("tools/precache-baseline.json"));
const swCache = ((swSrc.match(/const CACHE = "(fte-v\d+)"/) || [])[1] || "");
check("precache 基线条数必须等于 sw.js 的 PRECACHE 条数（否则版本联动判据失真）",
  baseline.count === preEntries.length, "基线 " + baseline.count + " vs 实际 " + preEntries.length);
check("precache 基线的 cache 版本必须等于 sw.js 的 CACHE（合法改清单后必须同步刷新基线）",
  baseline.cache === swCache, "基线 " + baseline.cache + " vs 实际 " + swCache);
check("precache 基线的 minVersion 必须等于其 cache 版本（防回退下限即快照点）",
  baseline.minVersion === Number(String(baseline.cache).replace("fte-v", "")), String(baseline.minVersion));

/* ---------- 9. 运行环境感知：微信内与离线必须有提示，且手机不能只看到桌面指引（P0-13） ---------- */
const appSrc = read("js/app.js");
check("app.js 必须检测微信内置浏览器（MicroMessenger）并给出提示锚点 data-wechat-hint",
  /MicroMessenger/i.test(appSrc) && appSrc.indexOf("data-wechat-hint") !== -1);
check("app.js 必须监听 offline 事件并给出提示锚点 data-offline-hint",
  /addEventListener\(\s*"offline"/.test(appSrc) && appSrc.indexOf("data-offline-hint") !== -1);
const pwaSrc = read("js/pwa-init.js");
check("pwa-init.js 必须是全站唯一的 UA 判定处（window.FTE_ENV）",
  /window\.FTE_ENV\s*=/.test(pwaSrc));
check("刷新指引必须按环境分支：微信内给「在浏览器中打开」、手机给「下拉刷新」（不得只有桌面 Ctrl+F5）",
  pwaSrc.indexOf("在浏览器中打开") !== -1 && pwaSrc.indexOf("下拉刷新") !== -1 && /FTE_ENV\.(wechat|mobile)/.test(pwaSrc));
/* 反向守卫：桌面分支必须保留（不能为了"手机友好"把桌面指引删掉） */
const playerSrc = read("js/player.js");
check("player.js 的桌面指引必须保留（python -m http.server 不得因移动端改造被删除）",
  playerSrc.indexOf("python -m http.server") !== -1 && playerSrc.indexOf("在浏览器中打开") !== -1);
const cssSrc = read("css/style.css");
check("环境提示条的关闭按钮在窄屏满足 44px 触控目标（.env-hint-x）",
  /\.env-hint-x\b/.test(cssSrc) && /min-height:\s*44px/.test(cssSrc));

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
