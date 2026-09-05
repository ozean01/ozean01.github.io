/* ============ Service Worker · 离线可用（Cache First for shell）============
   策略（借鉴 workbox 的语义，但不引入依赖，避免离线站点反过来依赖 CDN）：
     - 站点外壳与数据文件：precache + cache-first（离线可用、秒开）
     - 同源其它 GET：stale-while-revalidate（先给缓存，后台更新）
     - 跨域（TTS / LLM / 汇率等外部 API）：一律不拦截，交给浏览器直连
   更新流程：改动文件后把 CACHE 版本号 +1；新 SW 安装完成会通知页面弹「有新版本」。 */

const CACHE = "fte-v45";

/* 需要离线可用的全部静态资源（本站文件数量固定，手写清单比引运行时更划算） */
const PRECACHE = [
  "./",
  "./index.html",
  "./css/style.css",
  "./icon.svg",
  "./manifest.webmanifest",
  "./js/data.js",
  "./js/data-ops.js",
  "./js/data-ocean.js",
  "./js/data-incoterms.js",
  "./js/data-settle.js",
  "./js/data-mistakes.js",
  "./js/data-risk.js",
  "./js/data-deep.js",
  "./js/data-meeting.js",
  "./js/lvl-map.js",
  "./js/difficulty-map.js",
  "./js/schema.js",
  "./js/player.js",
  "./js/flashcards.js",
  "./js/quiz.js",
  "./js/tutor.js",
  "./js/eval4.js",
  "./js/listen.js",
  "./js/sop.js",
  "./js/export.js",
  "./js/asr-local.js",
  "./js/sources.js",
  "./js/subtitle.js",
  "./js/write.js",
  "./js/patterns.js",
  "./js/speech.js",
  "./js/board.js",
  "./js/radar.js",
  "./js/app.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* 逐个 add，单个 404 不至于让整个 install 失败 */
      return Promise.all(PRECACHE.map(function (url) {
        return c.add(new Request(url, { cache: "reload" })).catch(function () { /* ignore */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("message", function (e) {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  /* 跨域请求（Azure/Google TTS、LLM API、汇率接口）不介入，避免把在线服务缓存坏 */
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(req).then(function (hit) {
      const fetching = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        /* 离线且未命中缓存：导航请求回退到首页外壳（hash 路由靠前端解析） */
        return hit || (req.mode === "navigate" ? caches.match("./index.html") : Promise.reject(new Error("offline")));
      });
      return hit || fetching;
    })
  );
});
