/* ============ 任务2 · 磨耳朵播放器（#/earplay）============
   为什么单独成文件：
     · 通勤/走路要能听：站内其它「听」都用 TTS 实时合成，锁屏/切后台会被浏览器挂起；
       这里是**预生成 mp3**，配 Media Session，锁屏能控、切后台能放。
     · 整包离线：100 个 mp3 约 2MB，下载后存进**独立缓存桶** fte-earpack-v1；
       ⚠️ 音频绝不进 SW 的 PRECACHE（会把首访拖垮），sw.js 的 cacheGate 也已把 audio/ 排除在
       外壳桶之外——两处各管一段，互不抢配额。
   数据：audio/manifest.json（tools/build-audio-pack.js 生成；句子全部来自站内既有语料）。
   纪律：不新增一级导航（入口在「🎧 真实商务听音源」页内），不新造内容，不写学习数据。
   ============================================================================ */
(function () {
  "use strict";

  var MANIFEST_URL = "audio/manifest.json";
  var CACHE_NAME = "fte-earpack-v1";      /* 独立桶：和 SW 外壳桶（fte-vN）分开，可单独清除 */
  var SPEEDS = [0.8, 0.9, 1.0, 1.1, 1.2];
  var SLEEPS = [15, 30, 60];
  var LOOP_MODES = [
    { k: "list", label: "🔁 整包循环" },
    { k: "one", label: "🔂 单句循环" },
    { k: "off", label: "➡️ 顺序播放" }
  ];

  var state = {
    manifest: null, items: [], idx: -1, playing: false, loop: "list", speed: 1,
    cached: 0, downloading: false, dlDone: 0, dlErrors: 0,
    sleepMin: 0, sleepAt: 0, sleepTimer: null, loading: false, error: "",
    blobUrl: null, bound: false
  };
  var audio = null;

  /* ---------------- 纯函数（门禁直测） ---------------- */
  function fmtBytes(n) {
    var b = Number(n) || 0;
    if (b >= 1048576) return (b / 1048576).toFixed(2) + "MB";
    if (b >= 1024) return Math.round(b / 1024) + "KB";
    return b + "B";
  }
  function fmtClock(sec) {
    var s = Math.max(0, Math.floor(Number(sec) || 0));
    var m = Math.floor(s / 60);
    return m + ":" + String(s % 60).padStart(2, "0");
  }
  function summaryLine(manifest, cached) {
    if (!manifest || !manifest.count) return "音频包未加载";
    var n = Number(manifest.count) || 0;
    var has = Number(cached) >= n;
    return "本包 " + n + " 句 · " + fmtBytes(manifest.totalBytes) + " · " + (has ? "离线可用" : "未下载（在线可听）");
  }
  function nextIndex(idx, len, loop) {
    if (!len) return -1;
    if (idx < 0) return 0;
    if (loop === "one") return Math.min(idx, len - 1);
    var n = idx + 1;
    if (n < len) return n;
    return loop === "list" ? 0 : -1;
  }
  function prevIndex(idx, len, loop) {
    if (!len) return -1;
    if (idx < 0) return 0;
    if (loop === "one") return Math.min(idx, len - 1);
    var p = idx - 1;
    if (p >= 0) return p;
    return loop === "list" ? len - 1 : 0;
  }

  /* ---------------- 小工具 ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function toast(msg) {
    if (window.FTE_BOOT && window.FTE_BOOT.toast) window.FTE_BOOT.toast(msg);
    else console.log(msg);
  }
  function fileUrl(item) {
    try { return new URL(item.file, document.baseURI).href; } catch (e) { return item.file; }
  }
  function $(id) { return document.getElementById(id); }

  /* ---------------- 音频元素（全站唯一） ---------------- */
  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = "metadata";
    try { audio.preservesPitch = true; } catch (e) { /* 老浏览器忽略 */ }
    audio.addEventListener("play", function () {
      state.playing = true;
      syncPlayState();
      if ("mediaSession" in navigator) { try { navigator.mediaSession.playbackState = "playing"; } catch (e) { } }
    });
    audio.addEventListener("pause", function () {
      state.playing = false;
      syncPlayState();
      if ("mediaSession" in navigator) { try { navigator.mediaSession.playbackState = "paused"; } catch (e) { } }
    });
    audio.addEventListener("timeupdate", function () {
      var seek = $("epSeek"), cur = $("epCur");
      if (seek && audio.duration) seek.value = String(Math.round(audio.currentTime / audio.duration * 1000));
      if (cur) cur.textContent = fmtClock(audio.currentTime);
      updatePositionState();
    });
    audio.addEventListener("durationchange", function () {
      var dur = $("epDur");
      if (dur) dur.textContent = fmtClock(audio.duration);
    });
    audio.addEventListener("ended", onEnded);
    if (!state.bound) { bindMediaSession(); state.bound = true; }
    return audio;
  }
  function updatePositionState() {
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    if (!audio || !isFinite(audio.duration) || !audio.duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(audio.currentTime, audio.duration)
      });
    } catch (e) { /* 不支持就跳过 */ }
  }

  /* ---------------- Media Session（锁屏/耳机四件套以上） ---------------- */
  function bindMediaSession() {
    if (!("mediaSession" in navigator)) return;
    var ms = navigator.mediaSession;
    var handlers = {
      play: function () { var a = ensureAudio(); a.play().catch(function () { }); },
      pause: function () { if (audio) audio.pause(); },
      previoustrack: function () { jump(-1); },
      nexttrack: function () { jump(1); },
      stop: function () { if (audio) audio.pause(); state.playing = false; syncPlayState(); },
      seekbackward: function () { seekBy(-10); },
      seekforward: function () { seekBy(10); }
    };
    Object.keys(handlers).forEach(function (k) {
      try { ms.setActionHandler(k, handlers[k]); } catch (e) { /* 该 action 不支持就跳过 */ }
    });
  }
  function updateMediaSession(item) {
    if (!("mediaSession" in navigator) || !window.MediaMetadata) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.text,
        artist: "软包装外贸英语 · 磨耳朵",
        album: "音频包 · " + item.unit,
        artwork: [
          { src: new URL("icons/icon-192.png", document.baseURI).href, sizes: "192x192", type: "image/png" },
          { src: new URL("icons/icon-512.png", document.baseURI).href, sizes: "512x512", type: "image/png" }
        ]
      });
    } catch (e) { /* 元数据不支持不影响播放 */ }
  }

  /* ---------------- 播放控制 ---------------- */
  function jump(delta) {
    if (!state.items.length) return;
    var n = delta > 0
      ? nextIndex(state.idx, state.items.length, state.loop)
      : prevIndex(state.idx, state.items.length, state.loop);
    if (n < 0) { if (audio) audio.pause(); return; }
    playIndex(n);
  }
  function seekBy(sec) {
    if (!audio || !isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + sec));
  }
  function onEnded() {
    if (!state.items.length) return;
    if (state.loop === "one") {
      var a = ensureAudio();
      a.currentTime = 0;
      a.play().catch(function () { });
      return;
    }
    var n = nextIndex(state.idx, state.items.length, state.loop);
    if (n < 0) { state.playing = false; syncPlayState(); return; }
    playIndex(n);
  }
  function setSpeed(v) {
    state.speed = Math.max(0.5, Math.min(2, Number(v) || 1));
    if (audio) audio.playbackRate = state.speed;
    renderPlayer();
  }
  function setLoop(k) {
    state.loop = (k === "one" || k === "off") ? k : "list";
    renderPlayer();
  }
  function sleepLeftMs() { return state.sleepAt ? Math.max(0, state.sleepAt - Date.now()) : 0; }
  function setSleep(min) {
    if (state.sleepTimer) { clearInterval(state.sleepTimer); state.sleepTimer = null; }
    state.sleepMin = Number(min) || 0;
    state.sleepAt = state.sleepMin ? Date.now() + state.sleepMin * 60000 : 0;
    if (state.sleepMin) {
      state.sleepTimer = setInterval(function () {
        if (sleepLeftMs() <= 0) {
          clearInterval(state.sleepTimer);
          state.sleepTimer = null;
          state.sleepMin = 0;
          state.sleepAt = 0;
          if (audio) audio.pause();
          toast("😴 睡眠定时到，已暂停");
        }
        renderPlayer();
      }, 1000);
    }
    renderPlayer();
  }

  /* ---------------- 播放某一句 ---------------- */
  async function playIndex(i, opts) {
    if (!state.items.length) return;
    i = Math.max(0, Math.min(Number(i) || 0, state.items.length - 1));
    var item = state.items[i];
    state.idx = i;
    var a = ensureAudio();
    var url = fileUrl(item);
    var src = url;
    /* 已下载就从缓存桶取 blob（断网也能放，且不走 SW） */
    if (window.caches) {
      try {
        var c = await caches.open(CACHE_NAME);
        var hit = await c.match(url);
        if (hit) {
          var blob = await hit.blob();
          if (state.blobUrl) { try { URL.revokeObjectURL(state.blobUrl); } catch (e) { } }
          state.blobUrl = URL.createObjectURL(blob);
          src = state.blobUrl;
        }
      } catch (e) { /* 缓存读失败就退回直连 */ }
    }
    if (a.src !== src) a.src = src;
    a.playbackRate = state.speed;
    updateMediaSession(item);
    renderPlayer();
    renderQueue();
    if (!opts || opts.autoplay !== false) {
      try { await a.play(); } catch (e) { toast("点「▶ 播放」开始（浏览器拦截了自动播放）"); }
    }
  }
  function togglePlay() {
    if (state.idx < 0) { playIndex(0); return; }
    var a = ensureAudio();
    if (a.paused) a.play().catch(function () { }); else a.pause();
  }

  /* ---------------- 缓存桶（整包离线） ---------------- */
  async function refreshCacheStatus() {
    if (!window.caches || !state.items.length) return;
    try {
      var c = await caches.open(CACHE_NAME);
      var keys = await c.keys();
      var set = Object.create(null);
      keys.forEach(function (r) { set[r.url] = 1; });
      var n = 0;
      state.items.forEach(function (it) { if (set[fileUrl(it)]) n++; });
      state.cached = n;
    } catch (e) { state.cached = 0; }
    renderCacheCard();
  }
  async function downloadAll() {
    if (!window.caches) { toast("此浏览器不支持离线缓存（需要 https 或 localhost）"); return; }
    if (state.downloading) return;
    state.downloading = true; state.dlDone = 0; state.dlErrors = 0;
    renderCacheCard();
    var c = await caches.open(CACHE_NAME);
    for (var i = 0; i < state.items.length; i++) {
      var url = fileUrl(state.items[i]);
      try {
        var hit = await c.match(url);
        if (!hit) {
          var res = await fetch(url, { cache: "no-cache" });
          if (!res.ok) throw new Error("HTTP " + res.status);
          await c.put(url, res.clone());
        }
      } catch (e) { state.dlErrors++; }
      state.dlDone = i + 1;
      if (i % 5 === 0 || i === state.items.length - 1) renderCacheCard();
      await new Promise(function (r) { setTimeout(r, 0); });
    }
    state.downloading = false;
    await refreshCacheStatus();
    toast(state.dlErrors ? ("⚠️ 离线包下载完成，" + state.dlErrors + " 条失败，可再点一次补下") : "✅ 离线包已下载，断网也能听");
  }
  async function clearCache() {
    if (!window.caches) return;
    try { await caches.delete(CACHE_NAME); } catch (e) { /* 忽略 */ }
    state.cached = 0;
    renderCacheCard();
    toast("🧹 已清除离线音频包");
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    var app = document.getElementById("app");
    if (!app) return;
    app.innerHTML =
      '<div class="page-head">' +
        '<div class="crumbs"><a href="#/home">全站地图</a> / 磨耳朵播放器</div>' +
        '<h2>🎧 磨耳朵播放器</h2>' +
        '<div class="en">Offline audio pack · listen on the commute, lock-screen controls included</div>' +
        '<p class="field-note" style="margin-top:8px;max-width:820px">100 句核心句（U1–U14 词条例句 + SOP 客户动作句/催款话术）配好音，' +
        '通勤、走路、做家务都能听：锁屏/耳机可控，可整包下载后**断网也能听**。音频是预生成 mp3，不进 Service Worker 的预缓存，' +
        '单独存在浏览器缓存桶里，随时可一键清除。</p>' +
      '</div>' +
      '<div id="epRoot">' +
        '<div class="card ep-cache" id="epCacheCard"><div class="field-note" id="epCacheLine">正在读取音频包…</div>' +
          '<div class="ep-ops"><button class="btn btn-primary btn-sm" data-ep="download" id="epDlBtn">⬇️ 下载整包</button>' +
          '<button class="btn btn-outline btn-sm" data-ep="clear">🧹 清除离线包</button>' +
          '<span class="field-note" id="epDlNote"></span></div></div>' +
        '<div class="card ep-player" id="epPlayer"></div>' +
        '<div class="card ep-queue"><div class="chat-head" style="margin-bottom:8px">' +
          '<span>📋 播放队列</span><span class="field-note" id="epQueueNote">点任意一句从那里开始</span></div>' +
          '<ol class="ep-list" id="epList"></ol></div>' +
      '</div>';
    var root = $("epRoot");
    if (root) {
      root.addEventListener("click", onClick);
      root.addEventListener("input", onInput);
    }
    state.loading = true;
    loadManifest().then(function () {
      state.loading = false;
      renderCacheCard();
      renderPlayer();
      renderQueue();
      refreshCacheStatus();
    });
  }
  async function loadManifest() {
    try {
      var res = await fetch(MANIFEST_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var doc = await res.json();
      var items = (doc && doc.items) || [];
      items = items.filter(function (x) { return x && x.id && x.file && x.text; });
      if (!items.length) throw new Error("manifest 里没有可用句子");
      state.manifest = doc;
      state.items = items;
      state.error = "";
    } catch (e) {
      state.error = e && e.message ? e.message : String(e);
      state.manifest = null;
      state.items = [];
    }
  }
  function renderCacheCard() {
    var line = $("epCacheLine"), btn = $("epDlBtn"), note = $("epDlNote");
    if (!line) return;
    if (state.error) {
      line.textContent = "⚠️ 音频包读取失败：" + state.error;
      if (btn) btn.disabled = true;
      return;
    }
    if (!state.manifest) return;
    line.innerHTML = "<b>" + esc(summaryLine(state.manifest, state.cached)) + "</b>" +
      '<span class="field-note" style="margin-left:8px">共 ' + state.manifest.count + ' 句 / ' +
      fmtBytes(state.manifest.totalBytes) + "；下载后占用浏览器存储（可随时清除）</span>";
    if (btn) {
      btn.disabled = state.downloading;
      btn.textContent = state.downloading
        ? "下载中 " + state.dlDone + "/" + state.items.length
        : (state.cached >= state.manifest.count ? "✅ 已下载（点此校验/补下）" : "⬇️ 下载整包（" + fmtBytes(state.manifest.totalBytes) + "）");
    }
    if (note) {
      note.textContent = state.downloading
        ? "已下载 " + state.dlDone + "/" + state.items.length + (state.dlErrors ? "（" + state.dlErrors + " 条失败）" : "")
        : (state.cached ? "本机已缓存 " + state.cached + "/" + state.items.length + " 句" : "");
    }
  }
  function renderPlayer() {
    var box = $("epPlayer");
    if (!box) return;
    if (state.error) { box.innerHTML = '<div class="field-note">⚠️ ' + esc(state.error) + "</div>"; return; }
    if (!state.items.length) { box.innerHTML = '<div class="field-note">音频包加载中…</div>'; return; }
    var it = state.items[state.idx >= 0 ? state.idx : 0];
    var total = state.items.length;
    var cur = state.idx >= 0 ? state.idx : 0;
    box.innerHTML =
      '<div class="ep-badge" id="epBadge">' + String(cur + 1).padStart(2, "0") + " / " + total + " · " + esc(it.unit) + "</div>" +
      '<div class="ep-text" id="epText">' + esc(it.text) + "</div>" +
      '<div class="ep-meta" id="epMeta">' + esc(it.source) + (it.bytes ? " · " + fmtBytes(it.bytes) : "") + "</div>" +
      '<div class="ep-progress"><input id="epSeek" type="range" min="0" max="1000" value="0" aria-label="播放进度">' +
        '<div class="ep-times"><span id="epCur">0:00</span><span id="epDur">0:00</span></div></div>' +
      '<div class="ep-controls">' +
        '<button class="btn btn-outline" data-ep="prev" title="上一句" aria-label="上一句">⏮</button>' +
        '<button class="btn btn-primary btn-lg" data-ep="toggle" id="epPlay" title="播放/暂停">' + (state.playing ? "⏸ 暂停" : "▶ 播放") + "</button>" +
        '<button class="btn btn-outline" data-ep="next" title="下一句" aria-label="下一句">⏭</button>' +
      "</div>" +
      '<div class="ep-row"><span class="ep-k">倍速</span>' + SPEEDS.map(function (v) {
        return '<button class="chip ' + (Math.abs(state.speed - v) < 0.001 ? "active" : "") + '" data-ep="speed" data-v="' + v + '" aria-pressed="' + (Math.abs(state.speed - v) < 0.001) + '">' + v.toFixed(1) + "x</button>";
      }).join("") + "</div>" +
      '<div class="ep-row"><span class="ep-k">循环</span>' + LOOP_MODES.map(function (m) {
        return '<button class="chip ' + (state.loop === m.k ? "active" : "") + '" data-ep="loop" data-v="' + m.k + '" aria-pressed="' + (state.loop === m.k) + '">' + m.label + "</button>";
      }).join("") + "</div>" +
      '<div class="ep-row"><span class="ep-k">睡眠定时</span>' + SLEEPS.map(function (m) {
        return '<button class="chip ' + (state.sleepMin === m ? "active" : "") + '" data-ep="sleep" data-v="' + m + '" aria-pressed="' + (state.sleepMin === m) + '">' + m + " 分钟</button>";
      }).join("") + '<button class="chip ' + (state.sleepMin ? "" : "active") + '" data-ep="sleep" data-v="0" aria-pressed="' + (!state.sleepMin) + '">关</button>' +
        '<span class="field-note" id="epSleep">' + (state.sleepMin ? "剩 " + fmtClock(sleepLeftMs() / 1000) : "") + "</span></div>";
    syncPlayState();
  }
  function renderQueue() {
    var list = $("epList");
    if (!list) return;
    if (!state.items.length) { list.innerHTML = '<li class="field-note">加载中…</li>'; return; }
    list.innerHTML = state.items.map(function (it, i) {
      return '<li class="ep-item ' + (i === state.idx ? "on" : "") + '" data-ep="play" data-v="' + i + '" tabindex="0">' +
        '<span class="ep-idx">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<span class="ep-txt">' + esc(it.text) + '<span class="ep-src">' + esc(it.unit) + " · " + esc(it.source) + "</span></span>" +
        "</li>";
    }).join("");
    var note = $("epQueueNote");
    if (note) note.textContent = state.items.length + " 句 · 点任意一句从那里开始";
    var on = list.querySelector(".ep-item.on");
    if (on && on.scrollIntoView) { try { on.scrollIntoView({ block: "nearest" }); } catch (e) { } }
  }
  function syncPlayState() {
    var btn = $("epPlay");
    if (btn) btn.textContent = state.playing ? "⏸ 暂停" : "▶ 播放";
  }
  function rerenderAll() {
    renderCacheCard();
    renderPlayer();
    renderQueue();
  }

  /* ---------------- 事件 ---------------- */
  function onClick(e) {
    var el = e.target && e.target.closest ? e.target.closest("[data-ep]") : null;
    if (!el) return;
    var act = el.getAttribute("data-ep"), v = el.getAttribute("data-v");
    if (act === "toggle") { e.preventDefault(); togglePlay(); }
    else if (act === "prev") { e.preventDefault(); jump(-1); }
    else if (act === "next") { e.preventDefault(); jump(1); }
    else if (act === "play") { e.preventDefault(); playIndex(Number(v)); }
    else if (act === "speed") { e.preventDefault(); setSpeed(Number(v)); }
    else if (act === "loop") { e.preventDefault(); setLoop(v); }
    else if (act === "sleep") { e.preventDefault(); setSleep(Number(v)); }
    else if (act === "download") { e.preventDefault(); downloadAll(); }
    else if (act === "clear") { e.preventDefault(); clearCache(); }
  }
  function onInput(e) {
    var el = e.target;
    if (!el || el.id !== "epSeek" || !audio || !isFinite(audio.duration) || !audio.duration) return;
    var ratio = Number(el.value) / 1000;
    audio.currentTime = Math.max(0, Math.min(audio.duration - 0.05, audio.duration * ratio));
  }

  window.EarPlay = {
    render: render,
    _t: {
      fmtBytes: fmtBytes, fmtClock: fmtClock, summaryLine: summaryLine,
      nextIndex: nextIndex, prevIndex: prevIndex,
      SPEEDS: SPEEDS, SLEEPS: SLEEPS, LOOP_MODES: LOOP_MODES,
      CACHE_NAME: CACHE_NAME, MANIFEST_URL: MANIFEST_URL
    }
  };
})();
