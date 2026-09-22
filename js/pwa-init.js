/* ============ 启动兜底 + PWA 注册（P0-5 / P0-2）============
   为什么单独成文件：
     · 全站 40+ 个脚本按顺序加载、全部 defer。**任一文件加载或执行失败，app.js 就不会渲染**，
       #app 会永久停在 index.html 里的静态骨架上——用户只看到一片空白，没有任何提示。
       本文件排在**第一个脚本位**，先把错误捕获与「没起来就明说」的兜底面板装上。
     · CSP（script-src 'self'，见 index.html）不允许内联脚本，原先写在 index.html 末尾的
       SW 注册内联块必须搬到这里。
   契约：不依赖任何其它模块，不改变任何业务行为，不写任何学习数据。
   判据：app.js 首次渲染成功后设置 window.FTE_BOOTED = true；本文件在 load 之后仍看不到它，
        即判定「启动失败」并显示可读的错误面板，而不是让用户对着白屏。 */
(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;

  /* 版本号唯一来源（P2-6）：页脚原先硬编码 v2.0、package.json 是 1.7.0、SW 缓存号又是另一串，
     三处口径不一致，无法对账。此后**只在这里写一次**，页脚由它渲染；`tools/test-security.js`
     会断言它与 package.json 的 version 逐字一致。SW 的 CACHE 是缓存失效用的代号，不是版本号。 */
  window.FTE_VERSION = "1.10.0";

  var lastError = "";

  /* 错误留痕：只记录、不弹窗（非致命错误不该打断学习） */
  function note(msg) {
    if (!msg) return;
    lastError = msg;
    try { if (window.console && console.warn) console.warn("[FTE boot]", msg); } catch (e) { /* ignore */ }
  }
  try {
    window.addEventListener("error", function (e) {
      /* 资源加载失败（script/link/img）不冒泡，需捕获阶段；此时 e.message 为空，用 target 补 */
      if (e && e.target && e.target !== window && e.target.tagName) {
        note("资源加载失败：" + e.target.tagName.toLowerCase() + " " + (e.target.src || e.target.href || ""));
      } else if (e && e.message) {
        note(e.message);
      }
    }, true);
    window.addEventListener("unhandledrejection", function (e) {
      var r = e && e.reason;
      note("未处理的 Promise 拒绝：" + (r && r.message ? r.message : String(r)));
    });
  } catch (e) { /* ignore */ }

  /* 启动失败面板：只在「加载完成且应用仍未渲染」时出现一次 */
  var shown = false;
  function showFailure() {
    if (shown || window.FTE_BOOTED) return;
    var app = document.getElementById("app");
    if (!app) return;
    shown = true;
    app.innerHTML =
      '<div class="page-head"><h2>⚠️ 本站没能正常启动</h2></div>' +
      '<div style="max-width:640px;line-height:1.9">' +
      '<p>页面骨架已加载，但负责渲染的脚本没有跑完。最常见的原因有两个：</p>' +
      '<p>① <b>网络中断或加载不完整</b>——本站的全部功能都来自 40 多个本地脚本文件，缺一个就起不来；' +
      '② <b>浏览器缓存里留着旧版本</b>——升级过程中外壳与脚本可能对不上。</p>' +
      '<p>请先按 <b>Ctrl+F5</b>（Mac 为 <b>Cmd+Shift+R</b>）强制刷新一次；仍然失败时，检查网络后重试。' +
      '若你已把本站「添加到主屏 / 安装为应用」，可以先删掉再重新打开一次。</p>' +
      (lastError ? '<p style="color:var(--muted,#666);font-size:13px">技术信息：' + lastError.replace(/</g, "&lt;") + "</p>" : "") +
      '<p><button class="btn btn-primary btn-sm" id="bootRetry">🔄 重新加载</button></p>' +
      '<p style="color:var(--muted,#666);font-size:13px">你的学习数据保存在本浏览器（localStorage），' +
      '上面的问题不会删除它。</p>' +
      "</div>";
    /* CSP 不允许内联事件处理器，按钮只能在这里绑定 */
    var btn = document.getElementById("bootRetry");
    if (btn && btn.addEventListener) btn.addEventListener("click", function () { location.reload(); });
  }

  /* PWA：注册 Service Worker（http/https 下生效；file:// 直接打开时自动跳过）。
     新版本就绪后提示刷新，避免用户一直用着旧缓存。 */
  function registerSW() {
    if (typeof navigator === "undefined" || typeof location === "undefined") return;
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker) return;
    if (location.protocol === "file:") return;
    try {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        if (reg.waiting && navigator.serviceWorker.controller) notifyUpdate(reg);
        reg.addEventListener("updatefound", function () {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", function () {
            if (sw.state === "installed" && navigator.serviceWorker.controller) notifyUpdate(reg);
          });
        });
      }).catch(function () { /* 注册失败不影响正常使用 */ });
    } catch (e) { /* ignore */ }
  }

  function notifyUpdate(reg) {
    try {
      var bar = document.createElement("div");
      bar.className = "sw-update";
      bar.innerHTML = '<span>🔄 已下载新版本</span><button class="btn btn-primary btn-sm">立即刷新</button>';
      bar.querySelector("button").addEventListener("click", function () {
        if (reg.waiting) reg.waiting.postMessage("skip-waiting");
        location.reload();
      });
      document.body.appendChild(bar);
    } catch (e) { /* ignore */ }
  }

  window.addEventListener("load", function () {
    registerSW();
    /* 给 app.js 一点时间：defer 顺序执行的最后一个脚本就是它 */
    setTimeout(showFailure, 2500);
  });

  /* 页脚版本号：延迟脚本执行时 DOM 已解析完，可直接写。失败也不影响任何功能。 */
  try {
    var verEl = document.getElementById("appVersion");
    if (verEl) verEl.textContent = "v" + window.FTE_VERSION + " · 纯静态站点 · 无需服务器";
  } catch (e) { /* ignore */ }
})();
