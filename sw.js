/* ============ Service Worker · 离线可用（Cache First for shell）============
   策略（借鉴 workbox 的语义，但不引入依赖，避免离线站点反过来依赖 CDN）：
     - 站点外壳与数据文件：precache + cache-first（离线可用、秒开）
     - 同源其它 GET：stale-while-revalidate（先给缓存，后台更新）
     - 跨域（TTS / LLM / 汇率等外部 API）：一律不拦截，交给浏览器直连
   P1-D 新增「缓存写入闸」（S10 评审：缓存桶无上限增长）：三段策略不变，但**写入**收窄为
     ① 恰好命中 PRECACHE 的同源资源；② 无 query 的同源 GET 且 Content-Length ≤ MAX_EXTRA_BYTES；
     其余（大资产 js/vendor/** · models/**、带 query 的地址、非 http(s) scheme、体积未知）一律不写进外壳桶。
     依据实测：原实现把任何同源 200 basic 都 put，带 query 的一次请求即可让桶 59 → 60 条，
     且 js/vendor 下的大资产（phonemizer 1.26 MB）会与离线外壳抢同一桶；
     iOS 配额吃紧时外壳可能被连带淘汰。
   更新流程：改动文件后把 CACHE 版本号 +1；新 SW 安装完成会通知页面弹「有新版本」。 */

const CACHE = "fte-v106";   /* ★ 术语/格式一致性小批（2026-10-20）：只改数据文件内容（不改 PRECACHE 清单），
                             · 术语速查两条例句句首小写 → 大写，且用词更书面（corrosion / transfer 例）；
                             · 胶水涂布克重单位 gsm → g/m²（纸板仍保留 gsm），与全站 g/m² 口径一致；
                             · 剥离/封口强度单位统一为 N/15mm（原 data-risk 一处 N/15 mm）；
                             · 音标 proforma invoice 统一为 GA /proʊˈfɔːrmə ˈɪnvɔɪs/（原 data-ops 漏 r）；
                             · 摄氏度统一写法：℃ → °C（含空格），与站内 23 °C / 50 % RH 一致。
                             清单内文件内容变了，按纪律 +1。

                             —— 更早批次（历史记录，仍有效）——
                             fte-v105 · 全站 UI 规范与提升批次（2026-10-12 后一轮）：PRECACHE 清单集合与指纹不变（57 条），
                             但清单内文件**内容**改了（js/app.js · js/sop.js · js/tutor.js · js/mysay.js ·
                             js/material.js · js/listen.js · js/patterns.js · js/phonemes.js · js/radar.js ·
                             js/today.js · js/urgent.js · js/weekly.js · js/write.js · js/pwa-init.js ·
                             css/style.css · index.html 等），
                             按本站纪律「清单内文件内容变了也必须 +1」，否则老用户会一直吃到旧外壳。
                             本批修的是用户直接投诉的两类问题：
                               · 单词卡/语块卡背面被裁：`.flash-inner` 由固定 height 改为 grid 单元，
                                 两面都参与高度计算（背面曾静默裁掉 196px 的内容与 3 个牌面按钮）；
                               · 按钮文字与含义不符：TTS 朗读统一 🔊（原 ▶ 混用 12 处）、诊断 🧪、
                                 🎯 只留给评测、牌型/产出档按钮改写「动作」而非「状态」、
                                 mistake-reveal 由「全局翻转却说单卡」改为逐条揭晓、
                                 评分按钮防重复提交（键盘 keydown+keyup 曾双触发，一次按键跳两张卡）。
                               · 另含：空态不再把「没有内容」说成「已全部掌握」、44px 触控目标补齐、
                                 `.ob-bar` 白字对比 3.68→5.17、`.btn-ghost` 误用导致的 1:1 不可见文字修复。
                             更早几轮的版本说明见下（严格 CSP / 图标修复等，均仍有效）：

                             ★ 移除本地离线识别（2026-10-12）——那一轮**PRECACHE 清单真的变了**（58 → 57 条）：
                              · js/asr-local.js —— 删除（整个本地识别客户端）。
                              · js/vendor/vosk-worker.js / vosk-worker.meta.json —— 删除（4.13 MB 引擎）。
                              · tools/build-vosk-worker.js / tools/fetch-vosk-model.ps1 —— 删除。
                              · index.html —— 去掉 <script src="js/asr-local.js">、去掉「优先本地识别」开关
                                与其说明，CSP 注释改为记录这段历史；数据去向里移除"本地识别不出网"一条。
                              · js/player.js —— 删除 recognizeLocal / localASROn / localASRBroken /
                                resampleTo16k / lastRecordingPcm / capturePcm（电平表保留）。
                              · js/app.js —— 删除 checkLocalASR / 启动期探测 / 评分里的本地优先分支 /
                                shadow-online 改道按钮 / progress.localASR 与 localASROff。
                              · js/eval4.js —— 参考句评测与「近似诊断」都不再走本地识别。
                              · js/storage-keys.js —— 注销 fte-local-asr-v1。
                              · 用户机器上的 models/ 也已删除（106.9 MB；该目录本就不随仓库分发）。
                              原因：实测小模型在行业术语上错得太多（isocyanate → "isis i and eight"），
                              给出的分会误导人；详情与实测数据见 README §6-8。
                              跟读闭环修复（第三轮真实使用反馈「跟读按钮放出的仍是系统声音，不是让我录音，
                              也没有我的语音与标准语音之间的评测」）仍全部有效：
                              · js/player.js —— Player.repeat 的跟读窗口改为从**读完**（onend）算起（老实现从"开始朗读"算起，
                                导致录音在系统朗读尚未结束时开录、把扬声器里的标准音录了进去）；录音带实时电平表。
                              · js/app.js —— shadowRun 是可见的五步闭环（听→录→回放你的→标准音→对比评分），
                                开录前硬停 TTS，有 shadow-stop / shadow-retry；课程单元【对话】每一句补 🎙/🎯 入口。
                              更早几轮的版本说明见下（严格 CSP / 图标修复等，均仍有效）：
                              图标修复：icons/icon-192.png 与 apple-touch-icon.png 原为退化的纯渐变图（无地球图案），已由 icon-512.png 重建为正确设计；
                              icons/icon-maskable-512.png 原与 icon-512.png 字节完全相同（内容贴边，会被安卓自适应遮罩裁掉），已按 maskable 规范
                              把内容缩入中心 80% 安全圆（内容最远像素距中心 163.4 px < 安全半径 204.8 px）并保持满幅不透明背景。
                              PRECACHE 清单集合与指纹不变，升版本只为让老用户不吃到缓存里的旧图标。
                              第一阶段（P0'/P1/P2/P3）+ 第二阶段（P4 口径 / P5 段位措辞 / P6 明日起点 / P7 单单一致字段）
                              + P8 字幕精听三件套 + P9 全英模式·本周新料·进度搬运 + P10 词级跟读（复读次数与间隔）
                              + 术语库（🔍 专业术语速查：新增 js/data-glossary.js · js/glossary.js，并改 index.html · js/app.js）
                              + 术语库音标全量校订（324 条补音标，改 js/data-glossary.js · js/glossary.js）
                              + 术语库双语例句全量补齐（324 条配例句与中译，同上改两个文件）
                              + 听音源新增 A 档「教材/点读」来源（新概念英语点读，仅外链引用、不搬运内容；改 js/sources.js · README.md）
                              + P0 批次（第二期评审落地）：术语/法规勘误 · GA 卷舌音标 · AI 批改结果渲染 · 音素诊断 ESM 加载
                                · 移动端溢出 · 零埋点措辞与 fte-trace 退出备份（改 js/data*.js · js/write.js · js/eval4.js · css/style.css · index.html · js/storage-keys.js）
                              + P0 第三批：AI 事实边界与固定披露 · AI 质量门禁 · 门禁加固 · 暗色语义 token（改 js/tutor.js 等 AI 链路 · css/style.css · tools/*）
                              + P0 第四批 γ 组（P0-14 首访体量）：把**页面永不渲染**的分享图 og-image.png（403,271 B raw / 384,303 B gzip）
                                 从 PRECACHE 摘出去。依据：它只被 index.html 的 og:image 元标记引用，社交抓取由爬虫直连网络取图，
                                 真机页面会话实测对该文件 0 次请求（CDP Network 日志，Script/Document/Stylesheet 之外无 PNG 请求）。
                                 文件本体保留在仓库（删文件会让分享预览彻底坏掉），只是不进离线预缓存。
                                 同字节重复的两份 512 图标（icon-512.png / icon-maskable-512.png，SHA256 同为 6A4E066AB045336D…）
                                 **保守保留**：无法真机证明移除 maskable 那份不影响离线安装与自适应图标，按批次纪律不动。
                              + P1-D（发布链与工程化）：新增「缓存写入闸」——只改 fetch 的**写入条件**与版本号，
                                PRECACHE 清单本身不动（清单指纹不变）；仍按本站纪律升版 fte-v97 → fte-v98，
                                并同批刷新 tools/precache-baseline.json（见文件末尾的 cacheGate）。
                              都改了 PRECACHE 内的文件（含 js/app.js · js/player.js · js/phonemes.js · js/storage-keys.js · css/style.css），
                              按本站纪律必须 +1，否则老用户会一直吃到旧缓存 */

/* 需要离线可用的全部静态资源（本站文件数量固定，手写清单比引运行时更划算）
   ▲ P0-14：og-image.png 已移出本清单 —— 它只服务社交抓取（爬虫直连网络），页面渲染路径从不加载；
     文件仍在仓库里，分享预览在线时照常可用，只是不再占用每个首访用户的离线预缓存带宽与配额。
     icons/icon-512.png 与 icons/icon-maskable-512.png 逐字节相同（同一张图被下载两遍），
     但移除任一份都可能影响 PWA 安装图标选择，未取得真机证据前不动。 */
const PRECACHE = [
  "./",
  "./index.html",
  "./css/style.css",
  "./icon.svg",
  "./apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./manifest.webmanifest",
  "./js/pwa-init.js",
  "./js/storage-keys.js",
  "./js/data.js",
  "./js/data-ops.js",
  "./js/data-ocean.js",
  "./js/data-incoterms.js",
  "./js/data-settle.js",
  "./js/data-mistakes.js",
  "./js/data-risk.js",
  "./js/data-deep.js",
  "./js/data-meeting.js",
  "./js/data-mnemonic.js",
  "./js/data-glossary.js",
  "./js/data-ports.js",
  "./js/lvl-map.js",
  "./js/difficulty-map.js",
  "./js/unit-guide.js",
  "./js/schema.js",
  "./js/player.js",
  "./js/parser.js",
  "./js/score.js",
  "./js/flashcards.js",
  "./js/quiz.js",
  "./js/tutor.js",
  "./js/eval4.js",
  "./js/listen.js",
  "./js/sop.js",
  "./js/export.js",
  "./js/sources.js",
  "./js/glossary.js",
  "./js/subtitle.js",
  "./js/material.js",
  "./js/immerse.js",
  "./js/weekly.js",
  "./js/mysay.js",
  "./js/today.js",
  "./js/urgent.js",
  "./js/phonemes.js",
  "./js/data-mail.js",
  "./js/write.js",
  "./js/patterns.js",
  "./js/speech.js",
  "./js/board.js",
  "./js/radar.js",
  "./js/placement.js",
  "./js/outcomes.js",
  "./js/entry-trace.js",
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

/* ============ P1-D · 缓存写入闸（cacheGate）============
   守的是什么：**缓存桶无上限增长**（S10 评审实测：带 query 的一次请求让桶 59 → 60 条）。
   原实现只要 `status === 200 && type === "basic"` 就 `put` 进外壳桶 CACHE，于是
   `js/vendor/phonemizer.js`（1.26 MB）、
   `models/**`（本地 ASR 模型，可选放置，最大约 66 MB）、
   以及任何带 query 的地址都会和外离线外壳抢同一个桶。iOS 对单个 origin 的存储配额很紧，
   一旦超限，浏览器淘汰的是**整个桶里的条目**（含离线外壳）——离线能力可能连带失效。

   写入白名单（只放行这两类，其余响应照常返回浏览器，只是不进桶）：
     ① path+href 恰好等于 PRECACHE 里的某一条 —— 离线外壳本体，永远可缓存；
     ② 其它同源 GET，但必须同时满足：无 query（`?…` 会让同一文件产生无穷多缓存键）、
        非大资产（NO_CACHE_RE：js/vendor/** 与 models/**）、
        Content-Length 存在且 ≤ MAX_EXTRA_BYTES（体积未知 = 不缓存，宁可少缓存也不放开上限）。
   另：只处理 http(s)（blob:/data: 给 Cache.put 会抛 TypeError，且把 blob 持久化本身没有意义）。
   ⚠️ 大资产如将来确实要离线，请**单独开桶**（例如 fte-assets-vN）并写明淘汰策略，
      不要重新塞回这个桶 —— 那正是本次要修的问题。 */
const MAX_EXTRA_BYTES = 256 * 1024;                       /* 单条非预缓存资源的体积上限 */
const NO_CACHE_RE = /^\/(?:js\/vendor\/|models\/)/;       /* 大资产：不进任何外壳桶 */

/* 把 PRECACHE 解析成"绝对 URL 全集"（含 scope 前缀），供 fetch 期做 O(1) 精确判定。
   SW 与站点同源，self.location.href 即 SW 自身地址，相对路径按它解析。 */
const PRECACHE_URL = (function () {
  const map = {};
  PRECACHE.forEach(function (u) {
    try { map[new URL(u, self.location.href).href] = true; } catch (err) { /* 忽略解析不了的条目 */ }
  });
  return map;
})();

function cacheGate(req, res) {
  if (!res || res.status !== 200 || res.type !== "basic") return false;
  const url = new URL(req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (PRECACHE_URL[url.href]) return true;               /* ① 离线外壳本体 */
  if (url.search) return false;                          /* ② 带 query 一律不写（防桶被键空间撑爆） */
  if (NO_CACHE_RE.test(url.pathname)) return false;      /* ② 大资产不进桶 */
  const len = Number(res.headers.get("content-length"));
  return Number.isFinite(len) && len > 0 && len <= MAX_EXTRA_BYTES;
}

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  /* 跨域请求（Azure/Google TTS、LLM API、汇率接口）不介入，避免把在线服务缓存坏 —— 一律不拦截 */
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(req).then(function (hit) {
      /* 三段策略不变：命中即 cache-first 返回（precache + cache-first），
         未命中则联网并把新鲜响应按 cacheGate 写入（stale-while-revalidate 的"后台更新"部分）。 */
      const fetching = fetch(req).then(function (res) {
        if (cacheGate(req, res)) {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { return c.put(req, copy); })
            .catch(function () { /* 配额满/不可缓存 scheme：静默降级为"这次不写"，不影响页面 */ });
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
