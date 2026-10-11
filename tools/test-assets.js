#!/usr/bin/env node
/* 验收测试：静态资源接线完整性。
   零构建站点没有打包器兜底，下面两类事故只能靠人肉记性——本脚本把它们变成门禁：
     ① index.html 引用了磁盘上不存在的文件（改名/删文件后忘了改引用）；
     ② 文件被 index.html 加载，却漏在 sw.js 的 PRECACHE 手写清单里
        （后果：全新安装 PWA 后立刻离线，会缺这几个脚本）。
   另外反向检查 PRECACHE 里的路径是否都真实存在（防清单里留下已删文件）。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

let pass = true;
function check(name, cond, info) { console.log((cond ? "✅ " : "❌ ") + name + (info ? "  " + info : "")); if (!cond) pass = false; }
const exists = function (rel) { return fs.existsSync(path.join(ROOT, rel)); };

/* ---------------- ① index.html 引用的脚本 ---------------- */
const scripts = [];
const reScript = /<script\s+src="([^"]+)"/g;
let m;
while ((m = reScript.exec(html)) !== null) scripts.push(m[1]);
check("index.html 引用了脚本", scripts.length > 0, "n=" + scripts.length);

const missingFiles = scripts.filter(function (s) { return !exists(s); });
check("所有引用的脚本都真实存在", missingFiles.length === 0, missingFiles.join(", "));

/* ---------------- ② 预缓存清单 ----------------
   只取 PRECACHE 数组本体：sw.js 别处还有 "./index.html"（离线回退），
   扫全文会把它误判成重复条目。 */
const preBlock = (sw.match(/const PRECACHE = \[([\s\S]*?)\];/) || [])[1] || "";
const precache = [];
const rePre = /"([^"]*)"/g;
while ((m = rePre.exec(preBlock)) !== null) if (m[1]) precache.push(m[1].replace(/^\.\//, "./"));
check("sw.js 有 PRECACHE 清单", precache.length > 20, "n=" + precache.length);

const notPrecached = scripts.map(function (s) { return "./" + s; }).filter(function (s) { return precache.indexOf(s) === -1; });
check("index.html 的脚本全部在预缓存清单里", notPrecached.length === 0, notPrecached.join(", "));

const precacheMissing = precache.filter(function (p) { return p !== "./" && !exists(p); });
check("预缓存清单里的文件全部真实存在", precacheMissing.length === 0, precacheMissing.join(", "));

const precacheDup = precache.filter(function (p, i) { return precache.indexOf(p) !== i; });
check("预缓存清单无重复项", precacheDup.length === 0, precacheDup.join(", "));

/* ---------------- ③ index.html 引用的**全部同源静态资源** ↔ 预缓存对账 ----------------
   ▲ P0 第三批 · α 组（P0-08）改法 —— S10-F5：原先"预缓存完整性"只对 `<script src>` 对账；
   `<link>`/`<img>` 只查"文件存在"（存在即通过）。于是 M7
   （index.html 新增 `<link rel="stylesheet" href="css/extra.css">`，该文件不在 PRECACHE）
   实测 exit 0。而 sw.js 的缓存策略是"同源 GET 先查缓存、未命中才联网、断网即 reject"
   （sw.js:107-129）→ **首次离线打开时那份样式/图片直接缺失**。
   现在：index.html 引用的同源 script / link（stylesheet · preload · icon · manifest…）/ img
   必须全部进 PRECACHE；确实**故意**不预缓存的，只能登记进下面的显式白名单并写明理由。 */
const ASSET_WHITELIST = [
  /* 当前没有需要豁免的资源。这里保留"白名单结构"是为了让"故意不预缓存"必须**显式登记 + 写理由**，
     而不是靠"检查看不见它"。下方自检会强制：每条豁免都必须被 index.html 引用、必须不在 PRECACHE、
     且理由不少于 10 个字 —— 防止白名单腐烂成悄悄放行。 */
];

/* 只认同源相对路径：绝对 URL / 协议相对 / data: / blob: / mailto: / 页内锚点都不归本门禁管。 */
function sameOriginRef(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  if (s.startsWith("//")) return null;
  if (s.startsWith("#")) return null;
  return s.replace(/^\.\//, "").split("?")[0].split("#")[0];
}
const refs = [];
function addRefs(re, kind) {
  let x;
  while ((x = re.exec(html)) !== null) {
    const p = sameOriginRef(x[1]);
    if (p) refs.push({ path: p, kind: kind });
  }
}
addRefs(/<script\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi, "script");
addRefs(/<link\b[^>]*\bhref\s*=\s*"([^"]+)"/gi, "link");
addRefs(/<img\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi, "img");

const countKind = function (k) { return refs.filter(function (r) { return r.kind === k; }).length; };
check("index.html 解析到同源静态资源引用", refs.length >= scripts.length && refs.length > 0,
  "n=" + refs.length + "（script " + countKind("script") + " · link " + countKind("link") + " · img " + countKind("img") + "）");

const refMissing = refs.filter(function (r) { return !exists(r.path); });
check("index.html 引用的同源资源（script / link / img）全部真实存在", refMissing.length === 0,
  refMissing.map(function (r) { return "[" + r.kind + "] " + r.path; }).join(", "));

const refPaths = refs.map(function (r) { return r.path; })
  .filter(function (p, i, a) { return a.indexOf(p) === i; });
const wlPaths = ASSET_WHITELIST.map(function (w) { return w.path; });
const wlBad = ASSET_WHITELIST.filter(function (w) {
  return !w.path || String(w.reason || "").length < 10 ||
    refPaths.indexOf(w.path) === -1 || precache.indexOf("./" + w.path) !== -1;
});
check("预缓存豁免白名单条目合法（必须被引用 + 不在清单里 + 写明理由）", wlBad.length === 0,
  wlBad.map(function (w) { return String(w.path); }).join(", "));

const notPrecachedAll = refPaths.filter(function (p) { return wlPaths.indexOf(p) === -1; })
  .filter(function (p) { return precache.indexOf("./" + p) === -1; });
check("index.html 引用的同源资源全部在 PRECACHE 里（含 css/图片；否则首次离线就缺文件）",
  notPrecachedAll.length === 0, notPrecachedAll.map(function (p) { return "./" + p; }).join(", "));

check("manifest 与 icon 均已预缓存",
  precache.indexOf("./manifest.webmanifest") !== -1 && precache.indexOf("./icon.svg") !== -1);
check("index.html 自身已预缓存", precache.indexOf("./index.html") !== -1);
check("首页根路径已预缓存", precache.indexOf("./") !== -1);

/* ---------------- ④ 加载顺序：app.js 必须最后 ---------------- */
check("app.js 是最后一个脚本（各模块先于它注册全局）",
  scripts[scripts.length - 1] === "js/app.js", scripts[scripts.length - 1]);

/* ---------------- ⑤ 缓存版本号与清单变化同步 ----------------
   改了 PRECACHE 却忘了把 CACHE 版本号 +1，老用户会一直吃旧缓存。这里只做能自动判定的部分：
   版本号必须存在且形如 fte-vN。 */
const ver = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
check("sw.js 声明了缓存版本号", !!ver && /^fte-v\d+$/.test(ver), ver);

/* ---------------- ⑥ app.js 的启动完整性校验覆盖了新模块 ---------------- */
const appjs = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
["MaterialImport", "MySay", "Phonemes", "Subtitle", "WriteStudio", "Patterns"].forEach(function (g) {
  check("app.js 启动校验含 window." + g, appjs.indexOf("!!window." + g) !== -1);
});

/* ---------------- ⑦ 每个被校验的模块文件确实定义了对应全局 ---------------- */
[["js/mysay.js", "window.MySay"], ["js/phonemes.js", "window.Phonemes"], ["js/material.js", "window.MaterialImport"]].forEach(function (pair) {
  const src = fs.readFileSync(path.join(ROOT, pair[0]), "utf8");
  check(pair[1].replace("window.", "") + " 在 " + pair[0] + " 中被定义", src.indexOf(pair[1] + " = ") !== -1);
});

/* ---------------- ⑧ 位图资源与分享元数据 ----------------
   背景：微信/朋友圈、Facebook、X、LinkedIn 都不接受 SVG 作 og:image，相对路径也常被忽略；
   iOS 不支持 SVG 的 apple-touch-icon。所以必须有真 PNG，且 og:image 必须是绝对 URL。
   PNG 尺寸直接读文件头（IHDR 在固定偏移），不需要任何图像库。 */
function pngSize(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  const b = fs.readFileSync(p);
  if (b.length < 24 || b[0] !== 0x89 || b.toString("ascii", 1, 4) !== "PNG") return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const PNG_EXPECT = [
  ["apple-touch-icon.png", 180, 180],
  ["og-image.png", 1200, 630],
  ["icons/icon-192.png", 192, 192],
  ["icons/icon-512.png", 512, 512],
  ["icons/icon-maskable-512.png", 512, 512]
];

/* ▲ P0 第四批 · γ 组（P0-14）改法 —— 原先"位图资源全部在预缓存清单里"是**一刀切**：
   PNG_EXPECT 里 5 张必须全进 PRECACHE，且没有任何豁免通道。其中 og-image.png（403,271 B raw /
   384,303 B gzip）只服务社交抓取（`<meta property="og:image">`），**页面渲染路径从不加载它**
   （真机 CDP 网络日志：页面会话 56 个请求里 0 个是它），却让每个首访用户多下 403 KB、
   并长期占用离线配额。这里**不放宽规则**，而是给"故意不预缓存的位图"开一条必须
   **显式登记 + 写明理由**的通道，并加自检防止它腐烂成静默放行：
     ① 必须出现在 PNG_EXPECT（不能拿它放行一张没人管的图）；
     ② 文件必须真实存在（删文件就是另一回事，由 index.html 的 og:image 检查兜底）；
     ③ 必须确实**不在** PRECACHE（在清单里还登记豁免 = 自相矛盾的死条目）；
     ④ 理由不少于 10 个字；
     ⑤ （下方 og:image 解析之后）必须确实被首页分享元数据引用。
   同一份纪律、两个作用域：ASSET_WHITELIST 管"index.html 的 script/link/img"，
   PNG_PRECACHE_EXEMPT 管"PNG_EXPECT 位图"。 */
const PNG_PRECACHE_EXEMPT = [
  {
    path: "og-image.png",
    reason: "只被 <meta property=\"og:image\"> / twitter:image 引用，社交平台由爬虫直连网络取图；页面渲染路径从不加载，离线时也没有任何页面会去请求它，故不进预缓存"
  }
];

PNG_EXPECT.forEach(function (e) {
  const s = pngSize(e[0]);
  check(e[0] + " 是 " + e[1] + "x" + e[2] + " 的 PNG",
    !!s && s.w === e[1] && s.h === e[2], s ? s.w + "x" + s.h : "缺失或非 PNG");
});

const pngExemptPaths = PNG_PRECACHE_EXEMPT.map(function (w) { return w.path; });
const pngExemptBad = PNG_PRECACHE_EXEMPT.filter(function (w) {
  return !w.path || String(w.reason || "").length < 10 ||
    !PNG_EXPECT.some(function (e) { return e[0] === w.path; }) ||
    !exists(w.path) ||
    precache.indexOf("./" + w.path) !== -1;
});
check("位图预缓存豁免条目合法（在 PNG_EXPECT 内 + 文件存在 + 不在清单 + 写明理由≥10字）",
  pngExemptBad.length === 0, pngExemptBad.map(function (w) { return String(w.path); }).join(", "));

const notPre = PNG_EXPECT.map(function (e) { return "./" + e[0]; })
  .filter(function (p) { return precache.indexOf(p) === -1; })
  .filter(function (p) { return pngExemptPaths.indexOf(p.replace(/^\.\//, "")) === -1; });
check("位图资源全部在预缓存清单里（PNG_PRECACHE_EXEMPT 显式豁免的除外）", notPre.length === 0, notPre.join(", "));

/* index.html 的分享元数据 */
const head = html.slice(0, html.indexOf("</head>"));
const canonical = (head.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || "";
const ogUrl = (head.match(/<meta property="og:url" content="([^"]+)"/) || [])[1] || "";
const ogImage = (head.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || "";
const twImage = (head.match(/<meta name="twitter:image" content="([^"]+)"/) || [])[1] || "";
const atIcon = (head.match(/<link rel="apple-touch-icon" href="([^"]+)"/) || [])[1] || "";

check("canonical 已填真实地址（非占位符）",
  /^https:\/\/[^<>\s]+$/.test(canonical) && canonical.indexOf("你的域名") === -1, canonical);
check("og:url 存在且与 canonical 一致", !!ogUrl && ogUrl === canonical, ogUrl);
check("og:image 是绝对 URL", /^https:\/\//.test(ogImage), ogImage);
check("og:image 不是 SVG（社交平台不接受 SVG）", !!ogImage && !/\.svg($|\?)/i.test(ogImage), ogImage);
check("twitter:image 与 og:image 一致", twImage === ogImage);

/* 豁免自检⑤：被豁免"不预缓存"的位图，必须确实被首页的分享元数据引用。
   否则 PNG_PRECACHE_EXEMPT 会退化成"随便哪张图都能悄悄不进离线包"的后门。 */
const shareRel = function (u) { return String(u || "").replace(/^https?:\/\/[^/]+\//, "").replace(/^\.\//, ""); };
const pngExemptUnused = pngExemptPaths.filter(function (p) {
  return shareRel(ogImage) !== p && shareRel(twImage) !== p;
});
check("被豁免不预缓存的位图确实被首页分享元数据引用（og:image / twitter:image）",
  pngExemptUnused.length === 0,
  pngExemptUnused.length
    ? (pngExemptUnused.join(", ") + " 未被 og:image / twitter:image 引用，应放回 PRECACHE")
    : ("已核对 og:image = " + shareRel(ogImage)));
check("twitter:card 为 summary_large_image", /<meta name="twitter:card" content="summary_large_image">/.test(head));
check("og:image 声明了 1200x630 尺寸",
  /<meta property="og:image:width" content="1200">/.test(head) && /<meta property="og:image:height" content="630">/.test(head));
check("apple-touch-icon 指向 PNG（iOS 不支持 SVG）",
  /\.png$/.test(atIcon) && exists(atIcon.replace(/^\.\//, "")), atIcon);
check("ld+json 含 url", /"url":\s*"https:\/\//.test(head));

/* manifest 的 icons 契约 */
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.webmanifest"), "utf8"));
const mIcons = manifest.icons || [];
check("manifest 含 192 与 512 的 PNG（Chrome 可安装性要求）",
  mIcons.some(function (i) { return i.sizes === "192x192" && i.type === "image/png"; }) &&
  mIcons.some(function (i) { return i.sizes === "512x512" && i.type === "image/png"; }));
check("manifest 含独立的 maskable 图标",
  mIcons.some(function (i) { return i.purpose === "maskable"; }));
const badIconPath = mIcons.map(function (i) { return i.src.replace(/^\.\//, ""); })
  .filter(function (s) { return !exists(s); });
check("manifest 引用的图标文件都存在", badIconPath.length === 0, badIconPath.join(", "));

console.log("\n-- 脚本加载顺序（" + scripts.length + " 个）--");
console.log("  " + scripts.join(", "));

console.log(pass ? "\n=== ALL PASS ===" : "\n=== SOME FAILED ===");
process.exit(pass ? 0 : 1);
