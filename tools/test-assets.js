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

/* ---------------- ③ 其它本地静态资源 ---------------- */
const links = [];
const reLink = /<link\s+[^>]*href="([^"]+)"/g;
while ((m = reLink.exec(html)) !== null) {
  const h = m[1];
  if (/^https?:|^\/\//.test(h)) continue;
  links.push(h.replace(/^\.\//, ""));
}
const e2 = links.filter(function (h) { return !exists(h) && !h.endsWith(".webmanifest"); });
check("index.html 的本地 css/icon 引用存在", e2.length === 0, e2.join(", "));
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
PNG_EXPECT.forEach(function (e) {
  const s = pngSize(e[0]);
  check(e[0] + " 是 " + e[1] + "x" + e[2] + " 的 PNG",
    !!s && s.w === e[1] && s.h === e[2], s ? s.w + "x" + s.h : "缺失或非 PNG");
});

const notPre = PNG_EXPECT.map(function (e) { return "./" + e[0]; })
  .filter(function (p) { return precache.indexOf(p) === -1; });
check("位图资源全部在预缓存清单里", notPre.length === 0, notPre.join(", "));

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
