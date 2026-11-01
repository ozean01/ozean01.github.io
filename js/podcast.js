/* ============ 🎙 播客导入（P-播客 第 1 批）============
   目标：把「听的东西」从「本地拖文件」升级成「粘贴链接」，复用现有字幕点读页
   （js/subtitle.js），**不新造播放器、不新增一级导航、不承诺离线**。

   支持（按优先级）：
     ① RSS / Atom 订阅源 → 列出单集（标题 / 日期 / 音频直链 / 简介 / transcript）
     ② 单集页面 URL → 尽力提取音频直链（直接 fetch，CORS 失败再走 r.jina.ai）
     ③ 音频直链（.mp3/.m4a/.aac/.ogg/.wav/.opus/.flac）→ 直接载入，标题可手填
     ④ 可选字幕：粘贴文本或 .srt/.vtt/.ass/.ssa/.smi 链接（纯文本无时间轴 → 只做整段听 + 提示）
   不做：自动转写 ASR、抓付费/需登录平台、离线缓存、第二套播放器。

   技术红线（与规格一致）：
     · 远程音频用 <audio>/<video src> 直接播（跨域媒体元素可播）；
     · **波形/解码需要 CORS**：跨域时禁用波形并由 subtitle.js 写明原因，不静默失败；
     · 抓取顺序 = 直接 fetch → 失败再 r.jina.ai；设置页「数据去向」已补一行；
     · 渲染全部走 addEventListener，无内联事件、无内联脚本（CSP 严格）；
     · 音频 URL 不进 PRECACHE（远程资源本就不在清单里，门禁会断言）。

   导出：window.Podcast = { mount, _t: {...纯函数...} } */
(function () {
  "use strict";

  var WS_URL = "https://r.jina.ai/";
  var AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|wav|opus|flac)(\?|#|$)/i;
  var SUB_EXT = /\.(srt|vtt|ass|ssa|smi|sub|txt)(\?|#|$)/i;

  /* 无字幕集的明确提示（不假装有字幕）——测试会断言这段文案存在 */
  var NO_SUB_NOTICE = "本集没有公开字幕：只能整集在线听（不占本机空间，但没法逐句点读）。" +
    "想逐句练，可在上面「字幕（可选）」里粘贴字幕文本或填入 .srt/.vtt 链接；" +
    "纯文本没有时间轴时，只会整段朗读，不会假装逐句同步。";
  /* 跨域波形禁用文案——必须写明原因，不许静默 */
  var XO_WAVE_NOTICE = "🌊 原声波形已禁用：远程音频跨域，浏览器不允许读取它的音频数据（解码需要 CORS）。" +
    "逐句点读、四档字幕、A-B 复读和逐句笔记都不受影响。想要波形，把音频下载后从本地载入即可。";

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function toast(m) {
    if (window.Subtitle && typeof window.Subtitle.toast === "function") { window.Subtitle.toast(m); return; }
    var t = window.FTE_BOOT && window.FTE_BOOT.toast;
    if (typeof t === "function") { t(m); return; }
    console.log(m);
  }

  /* ---------------- 纯函数：URL 分类 ---------------- */
  /* 'audio' | 'subtitle' | 'rss' | 'episode' | 'unknown' */
  function classifyUrl(u) {
    var raw = String(u == null ? "" : u).trim();
    if (!raw) return "unknown";
    if (!/^https?:\/\//i.test(raw)) return "unknown";
    var clean = raw.split("#")[0];
    var lower = clean.toLowerCase();
    if (AUDIO_EXT.test(lower)) return "audio";
    if (SUB_EXT.test(lower)) return "subtitle";
    if (/\.(xml|rss)(\?|$)/i.test(lower)) return "rss";
    if (/\/(rss|feed|feeds|atom)(\/|\?|$)/i.test(lower)) return "rss";
    if (/[?&](feed|format)=rss/i.test(lower)) return "rss";
    if (/podcasts\.apple\.com\/[^/]+\/podcast\//i.test(lower)) return "rss";
    if (/\/podcast(\/|\?|$)/i.test(lower) && /(feed|rss|xml)/i.test(lower)) return "rss";
    return "episode";
  }

  /* ---------------- 纯函数：HTML / 实体清理 ---------------- */
  function decodeEntities(s) {
    var map = {
      amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
      mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
      copy: "©", reg: "®", trade: "™", middot: "·", bull: "•", eacute: "é"
    };
    return String(s == null ? "" : s)
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return safeChar(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return safeChar(parseInt(d, 10)); })
      .replace(/&([a-z]+);/gi, function (m, name) {
        var k = String(name).toLowerCase();
        return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : m;
      });
  }
  function safeChar(code) {
    if (!isFinite(code) || code <= 0 || code > 0x10ffff) return "";
    try { return String.fromCodePoint(code); } catch (e) { return ""; }
  }
  function stripHtml(s) {
    var t = String(s == null ? "" : s);
    t = t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
    t = t.replace(/<br\s*\/?>/gi, " ");
    t = t.replace(/<\/(p|div|li|h[1-6])>/gi, " ");
    t = t.replace(/<[^>]+>/g, "");
    t = decodeEntities(t);
    return t.replace(/\s+/g, " ").trim();
  }

  /* ---------------- 纯函数：日期 ---------------- */
  function parseDateLabel(s) {
    var raw = stripHtml(s);
    if (!raw) return "";
    var d = new Date(raw);
    if (isNaN(d.getTime())) {
      /* RFC822 里偶尔有全大写月份/多余空格，退化为原样截断，不编造日期 */
      return raw.slice(0, 16);
    }
    var mm = String(d.getMonth() + 1);
    var dd = String(d.getDate());
    return d.getFullYear() + "-" + (mm.length < 2 ? "0" + mm : mm) + "-" + (dd.length < 2 ? "0" + dd : dd);
  }

  /* ---------------- 纯函数：feed 解析（RSS 2.0 / Atom，字符串解析，浏览器与 Node 同源） ---------------- */
  function tagInner(xml, name) {
    var re = new RegExp("<" + name + "\\b[^>]*>([\\s\\S]*?)<\\/" + name + ">", "i");
    var m = String(xml).match(re);
    return m ? m[1] : "";
  }
  function linkOf(block) {
    /* RSS: <link>https://…</link>；Atom: <link rel="alternate" href="…"/>（优先 alternate，避免抓到 enclosure） */
    var alt = block.match(/<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i) ||
      block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']alternate["'][^>]*>/i);
    if (alt) return decodeEntities(alt[1]).trim();
    var withHref = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
    if (withHref) return decodeEntities(withHref[1]).trim();
    var inner = tagInner(block, "link");
    return inner ? stripHtml(inner) : "";
  }
  /* Atom 的附件用 <link rel="enclosure" type="audio/…" href="…"/> 表示，不是 <enclosure> 标签 */
  function atomEnclosureOf(block) {
    var m = block.match(/<link\b[^>]*\brel=["']enclosure["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i) ||
      block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']enclosure["'][^>]*>/i);
    return m ? decodeEntities(m[1]).trim() : "";
  }
  function enclosureOf(block, attr) {
    var a = String(attr);
    var m = block.match(new RegExp("<enclosure\\b[^>]*\\b" + a + "=[\"']([^\"']+)[\"'][^>]*>", "i"));
    return m ? decodeEntities(m[1]).trim() : "";
  }
  function mediaContentOf(block) {
    var m = block.match(/<media:content\b[^>]*\burl=["']([^"']+)["'][^>]*>/i);
    return m ? decodeEntities(m[1]).trim() : "";
  }
  function transcriptOf(block) {
    var m = block.match(/<podcast:transcript\b[^>]*\burl=["']([^"']+)["'][^>]*>/i);
    return m ? decodeEntities(m[1]).trim() : "";
  }
  function audioOf(block, link) {
    var enc = enclosureOf(block, "url");
    var encType = enclosureOf(block, "type");
    if (enc && (AUDIO_EXT.test(enc) || /^audio\//i.test(encType))) return enc;
    var atomEnc = atomEnclosureOf(block);
    if (atomEnc) return atomEnc;
    var media = mediaContentOf(block);
    if (media) return media;
    if (link && AUDIO_EXT.test(link)) return link;
    return "";
  }

  /* 解析 RSS 2.0 或 Atom。返回 { title, items:[{title,url,audioUrl,date,desc,transcriptUrl,duration}] }；
     不是 feed 时返回 null（调用方据此提示「这不是订阅源」）。 */
  function parseFeed(xml) {
    var text = String(xml == null ? "" : xml);
    var isRss = /<rss\b/i.test(text);
    var isAtom = /<feed\b/i.test(text);
    if (!isRss && !isAtom) return null;
    var head = text.split(/<item\b|<entry\b/i)[0];
    var title = stripHtml(tagInner(head, "title")) || (isAtom ? "Atom Feed" : "RSS Feed");
    var blocks = [];
    var reItem = /<item\b[\s\S]*?<\/item>/gi;
    var m;
    while ((m = reItem.exec(text)) !== null) blocks.push(m[0]);
    if (!blocks.length) {
      var reEntry = /<entry\b[\s\S]*?<\/entry>/gi;
      while ((m = reEntry.exec(text)) !== null) blocks.push(m[0]);
    }
    var items = blocks.map(function (b) {
      var link = linkOf(b);
      return {
        title: stripHtml(tagInner(b, "title")) || "(无标题单集)",
        url: link,
        audioUrl: audioOf(b, link),
        date: parseDateLabel(tagInner(b, "pubDate") || tagInner(b, "updated") || tagInner(b, "published")),
        desc: stripHtml(tagInner(b, "description") || tagInner(b, "summary") || tagInner(b, "content")),
        transcriptUrl: transcriptOf(b),
        duration: stripHtml(tagInner(b, "itunes:duration"))
      };
    });
    return { title: title, items: items };
  }

  /* ---------------- 纯函数：单集页面里尽力找音频直链 / 标题 ---------------- */
  function pickAudioUrlFromHtml(text) {
    var urls = String(text == null ? "" : text).match(/https?:\/\/[^\s"'<>)\]]+/g) || [];
    for (var i = 0; i < urls.length; i++) {
      var u = urls[i].replace(/[.,;:]+$/, "");
      if (AUDIO_EXT.test(u.split("#")[0])) return u;
    }
    return "";
  }
  function pickTitleFromHtml(text) {
    var t = String(text == null ? "" : text);
    var h = t.match(/^\s{0,3}#\s+(.+)$/m);
    if (h) return h[1].trim().slice(0, 120);
    var title = t.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (title) return stripHtml(title[1]).slice(0, 120);
    var line = t.split("\n").map(function (x) { return x.trim(); }).filter(Boolean)[0] || "";
    return line.replace(/^Title:\s*/i, "").slice(0, 120);
  }

  /* ---------------- 纯函数：http → https 升级（混合内容防护） ---------------- */
  /* GitHub Pages 是 https：如果 feed 里的音频直链还是 http://，浏览器会按混合内容拦掉。
     页面本身是 https 时把音频 URL 升到 https（绝大多数 CDN 都支持）；本地 http 调试不升级。 */
  function normalizeAudioUrl(u) {
    var raw = String(u == null ? "" : u).trim();
    if (!raw) return "";
    var pageProto = (typeof location !== "undefined" && location.protocol) ? location.protocol : "https:";
    if (pageProto !== "https:") return raw;
    try {
      var url = new URL(raw, typeof location !== "undefined" ? location.href : "https://example.com/");
      if (url.protocol === "http:") { url.protocol = "https:"; return url.href; }
      return url.href;
    } catch (e) { return raw.replace(/^http:\/\//i, "https://"); }
  }

  /* ---------------- 纯函数：跨域判定 ---------------- */
  function isCrossOrigin(u, base) {
    var b = base || (typeof location !== "undefined" ? location.href : "");
    if (!b) return true;
    try {
      return new URL(String(u), b).origin !== new URL(b).origin;
    } catch (e) { return true; }
  }

  /* ---------------- 抓取：直接 fetch 优先，CORS 失败再走 r.jina.ai ---------------- */
  function fetchSmart(url) {
    var directFail = null;
    return fetch(url, { credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (t) { return { text: t, via: "direct" }; })
      .catch(function (err) {
        directFail = err;
        return fetch(WS_URL + encodeURIComponent(url), { credentials: "omit" })
          .then(function (r) { if (!r.ok) throw new Error("代理 HTTP " + r.status); return r.text(); })
          .then(function (t) { return { text: t, via: "jina" }; });
      })
      .catch(function (err2) {
        var why = (directFail && directFail.message) ? ("直连失败：" + directFail.message + "；") : "";
        throw new Error(why + "代理也失败：" + (err2 && err2.message ? err2.message : "网络错误"));
      });
  }

  /* ---------------- UI：挂进字幕页顶部（不新增导航/路由） ----------------
     注意：loadRemote 会触发字幕页整页 render()，本卡片会被重建。
     因此把「上次解析的输入与列表」存在模块级 saved 里，mount 时恢复——
     否则选一集之后列表消失，想再换一集或补字幕就得重新解析。 */
  var saved = { url: "", title: "", subUrl: "", subText: "", feedTitle: "", items: [], status: "" };

  function mount(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="card" id="podCastCard" style="padding:16px 18px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">' +
      '<div><b>🎙 从链接导入播客</b>' +
      '<div class="field-note" style="margin-top:4px;max-width:720px">RSS 订阅源 → 列出单集 → 选集载入；单集页面 / 音频直链 / 可选字幕。' +
      '<b>在线听，不占本机空间</b>；本地文件不会被上传（从链接导入时，只有你粘贴的网址会发给 <code>r.jina.ai</code>，见设置页「数据去向」）。' +
      '不支持付费/需登录平台，也不做自动转写。</div></div>' +
      '<span class="badge badge-muted">第 1 批 · 导入</span>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      '<input type="text" id="podUrl" spellcheck="false" placeholder="RSS 订阅源 / 单集页面 / 音频直链（https://…）" ' +
      'style="flex:1;min-width:240px;padding:9px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text)">' +
      '<input type="text" id="podTitle" placeholder="标题（可选，直链时用）" ' +
      'style="width:190px;padding:9px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text)">' +
      '<button class="btn btn-primary btn-sm" id="podParse">解析链接</button>' +
      '</div>' +
      '<details style="margin-top:10px"><summary class="field-note" style="cursor:pointer">字幕（可选）：粘贴文本或填 .srt / .vtt / .ass / .smi 链接</summary>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
      '<input type="text" id="podSubUrl" spellcheck="false" placeholder="字幕文件直链（可选）" ' +
      'style="flex:1;min-width:240px;padding:8px 11px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text)">' +
      '</div>' +
      '<textarea id="podSubText" rows="4" spellcheck="false" placeholder="或直接粘贴字幕文本（SRT / VTT / ASS / 纯文本都行；纯文本没有时间轴 → 只整段朗读加提示）" ' +
      'style="width:100%;margin-top:8px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);font-family:inherit"></textarea>' +
      '</details>' +
      '<div class="field-note" id="podStatus" style="margin-top:10px" role="status" aria-live="polite"></div>' +
      '<div id="podList" style="margin-top:8px"></div>' +
      '</div>';

    var $ = function (id) { return document.getElementById(id); };
    var status = $("podStatus"), list = $("podList");
    var cur = { feedTitle: "", items: [] };

    function setStatus(t, bad) {
      status.textContent = t || "";
      status.style.color = bad ? "var(--warn, #b45309)" : "";
      saved.status = t || "";
    }
    function rowHtml(it, i) {
      var bits = [it.date, it.duration, it.audioUrl ? "" : "无音频直链"].filter(Boolean).join(" · ");
      return '<div class="card" style="padding:10px 12px;margin-top:8px">' +
        '<div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:220px"><b>' + esc(it.title) + '</b>' +
        '<div class="field-note" style="margin-top:2px">' + esc(bits || "无日期信息") + '</div>' +
        (it.desc ? '<div class="field-note" style="margin-top:4px">' + esc(it.desc.slice(0, 180)) + (it.desc.length > 180 ? "…" : "") + '</div>' : "") +
        '</div>' +
        '<button class="btn btn-soft btn-sm" data-pod-load="' + i + '"' + (it.audioUrl ? "" : " disabled") + '>载入这一集</button>' +
        '</div></div>';
    }
    function renderList() {
      list.innerHTML = cur.items.length ? cur.items.map(rowHtml).join("") : "";
    }
    function subtitleInputs() {
      return {
        text: ($("podSubText") && $("podSubText").value || "").trim(),
        url: ($("podSubUrl") && $("podSubUrl").value || "").trim()
      };
    }
    /* 还原上次解析结果（页面被 loadRemote 重渲染后仍然可换集/补字幕） */
    if ($("podUrl")) $("podUrl").value = saved.url;
    if ($("podTitle")) $("podTitle").value = saved.title;
    if ($("podSubUrl")) $("podSubUrl").value = saved.subUrl;
    if ($("podSubText")) $("podSubText").value = saved.subText;
    cur.feedTitle = saved.feedTitle;
    cur.items = saved.items || [];
    renderList();
    if (saved.status) setStatus(saved.status);
    function load(opts, then) {
      var o = Object.assign({}, opts || {});
      if (o.audioUrl) o.audioUrl = normalizeAudioUrl(o.audioUrl);
      if (window.Subtitle && typeof window.Subtitle.loadRemote === "function") {
        window.Subtitle.loadRemote(o);
        if (then) then();
        return;
      }
      setStatus("字幕模块还没加载完，请稍等一秒再点。", true);
    }
    function loadItem(i) {
      var it = cur.items[i];
      if (!it) return;
      var si = subtitleInputs();
      saved.subText = si.text;
      saved.subUrl = si.url;
      setStatus("正在准备《" + it.title + "》…");
      var subUrl = si.url || it.transcriptUrl || "";
      var ready = function (text) {
        load({
          audioUrl: it.audioUrl,
          title: it.title,
          subtitleText: text || si.text || "",
          subtitleName: subUrl || (si.text ? "pasted.txt" : "")
        }, function () {
          setStatus("已载入《" + it.title + "》" + (it.audioUrl ? "（在线音频）" : "（无音频，仅字幕/TTS）") +
            (text || si.text ? "，字幕已就位。" : "。本集没有字幕——见字幕页顶部提示。"));
        });
      };
      if (!si.text && subUrl) {
        fetchSmart(subUrl).then(function (r) { ready(r.text); }).catch(function (e) {
          setStatus("字幕抓取失败：" + e.message + "。可以改用粘贴文本。", true);
          ready("");
        });
      } else ready("");
    }

    function parse() {
      var url = ($("podUrl").value || "").trim();
      var kind = classifyUrl(url);
      saved.url = url;
      saved.title = ($("podTitle") && $("podTitle").value || "").trim();
      var siNow = subtitleInputs();
      saved.subText = siNow.text;
      saved.subUrl = siNow.url;
      if (kind === "unknown") { setStatus("请输入 http(s) 开头的链接。", true); return; }
      setStatus("解析中…（直连失败会自动改走 r.jina.ai）");
      list.innerHTML = "";
      cur.items = [];
      saved.items = [];
      saved.feedTitle = "";
      if (kind === "audio") {
        var name = ($("podTitle").value || "").trim() || audioNameOf(url);
        load({ audioUrl: url, title: name, subtitleText: subtitleInputs().text, subtitleName: "" }, function () {
          setStatus("已载入音频直链：" + name + "。可以点句子练，或先补字幕。");
        });
        return;
      }
      if (kind === "subtitle") {
        if ($("podSubUrl")) $("podSubUrl").value = url;
        setStatus("这是字幕链接：已填到「字幕文件直链」。要逐句点读，再给一个音频直链或 RSS 单集。");
        return;
      }
      fetchSmart(url).then(function (r) {
        if (kind === "rss") {
          var feed = parseFeed(r.text);
          if (!feed) {
            setStatus("抓回来的内容不是可解析的 RSS/Atom（可能被代理转成了普通网页）。" +
              "请换一个支持跨域（CORS）的订阅源，或改用单集页面 / 音频直链。", true);
            return;
          }
          cur.feedTitle = feed.title;
          cur.items = feed.items;
          saved.feedTitle = feed.title;
          saved.items = feed.items;
          renderList();
          var noAudio = feed.items.filter(function (x) { return !x.audioUrl; }).length;
          setStatus("《" + feed.title + "》共 " + feed.items.length + " 集" + (r.via === "jina" ? "（经 r.jina.ai 抓取）" : "") +
            (noAudio ? "；其中 " + noAudio + " 集没有公开音频直链，无法载入" : "") + "。选一集点「载入这一集」。");
          return;
        }
        /* episode */
        var audio = pickAudioUrlFromHtml(r.text);
        if (!audio) {
          setStatus("这个页面没有公开音频直链，请改用 RSS 或直接粘贴音频链接。", true);
          return;
        }
        var t = ($("podTitle").value || "").trim() || pickTitleFromHtml(r.text) || "单集音频";
        load({ audioUrl: audio, title: t, subtitleText: subtitleInputs().text, subtitleName: "" }, function () {
          setStatus("已从页面提取到音频直链并载入：" + t + (r.via === "jina" ? "（经 r.jina.ai）" : "") + "。");
        });
      }).catch(function (e) {
        /* 抓取彻底失败时给可执行的下一步，不留空列表让用户猜 */
        var why = (e && e.message) ? ("（技术原因：" + e.message + "）") : "";
        if (kind === "episode") {
          setStatus("页面抓取失败（直连与 r.jina.ai 都没成功）：请改用 RSS，或直接粘贴音频链接。" + why, true);
        } else {
          setStatus("订阅源抓取失败（直连与 r.jina.ai 都没成功）：请换一个支持跨域（CORS）的订阅源，或改用单集页面 / 音频直链。" + why, true);
        }
      });
    }

    $("podParse").addEventListener("click", parse);
    $("podUrl").addEventListener("keydown", function (e) { if (e.key === "Enter") parse(); });
    list.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-pod-load]") : null;
      if (!b) return;
      loadItem(parseInt(b.getAttribute("data-pod-load"), 10));
    });
  }

  function audioNameOf(url) {
    try {
      var u = new URL(url);
      var seg = u.pathname.split("/").filter(Boolean).pop() || "在线音频";
      return decodeURIComponent(seg);
    } catch (e) { return "在线音频"; }
  }

  window.Podcast = {
    mount: mount,
    NO_SUB_NOTICE: NO_SUB_NOTICE,
    XO_WAVE_NOTICE: XO_WAVE_NOTICE,
    _t: {
      classifyUrl: classifyUrl,
      stripHtml: stripHtml,
      decodeEntities: decodeEntities,
      parseDateLabel: parseDateLabel,
      parseFeed: parseFeed,
      pickAudioUrlFromHtml: pickAudioUrlFromHtml,
      pickTitleFromHtml: pickTitleFromHtml,
      isCrossOrigin: isCrossOrigin,
      normalizeAudioUrl: normalizeAudioUrl,
      audioNameOf: audioNameOf,
      JINA: WS_URL,
      AUDIO_EXT: AUDIO_EXT
    }
  };
})();
