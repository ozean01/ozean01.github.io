/* ============ 软包装外贸英语 · 🔍 专业术语速查（术语库）============
   用途：把《专业术语中英文词典》里与软包装业务沟通真正相关的术语，做成一个
        「可搜索、可筛选、可朗读」的速查页——而不是继续往 U11 的 vocab 里塞。
   为什么单独成页（口径见评估报告）：
     1. U11 已有 201 词，继续追加会改变 difficulty-map 的单元难度标定与学习曲线；
     2. 速查是「随用随查」，与「按单元背」是两种使用方式，混在一起两边都不好用；
     3. 站内文案（js/eval4.js / js/speech.js / js/tutor.js）早就让用户「到术语库核对」，
        但全站此前并没有这个页面——本页把它补上。

   数据：window.FTE_GLOSSARY = { note, provenance, cats[], terms[], aliases[] }（js/data-glossary.js）
     terms[]   { w 英文, pos 词性, cn 中文, cat 类别, ipa? 音标, ex?/exCn? 例句, alt[] 同义中文 }
     aliases[] { cn 中文, en 词典英文, site 站内标准写法, unit 站内单元 }
     音标口径：**只有首批已人工校订的条目带 ipa**（美式 GA，与全站词库同一口径）；
     其余条目显示「音标待校订」并保留 🔊 听读音——不拿机器音标冒充校对过的音标。
     这是本页的诚实边界，也是下一批要补的活。

   渲染：window.Glossary.render()（自包含，事件委托，不污染 app.js 的大 switch） */
(function () {
  "use strict";

  var G = window.FTE_GLOSSARY || { terms: [], aliases: [], cats: [], note: "", provenance: "" };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  var state = { q: "", cat: "all" };

  /* 分批渲染（P1-4）：术语库 324 条条在一次 innerHTML 里塞进去，低端手机要 1s+。
     先画首屏一批（GL_CHUNK 条），其余用 rAF 分片追加；**没有 rAF 的环境（Node 门禁 /
     老浏览器）同步补齐**，保证最终 DOM 与「一次性渲染」完全等价（test-glossary 仍按 324 条断言）。
     另外把它从「每条渲染各绑一次 click」改成文档级事件委托——324 条 = 324 次绑定，
     这笔开销在分批渲染后还会重复付，委托一次即可。 */
  var GL_CHUNK = 60;
  var renderGen = 0;
  function scheduleChunk(fn) {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(fn);
    else fn();
  }
  function appendHtml(el, html) {
    if (!html) return;
    if (el.insertAdjacentHTML) el.insertAdjacentHTML("beforeend", html);
    else el.innerHTML += html;
  }

  function norm(s) { return String(s == null ? "" : s).toLowerCase(); }

  /* 搜索命中：英文主词、中文、同义中文、音标都算 */
  function hits(t, q) {
    if (!q) return true;
    if (norm(t.w).indexOf(q) !== -1) return true;
    if (norm(t.cn).indexOf(q) !== -1) return true;
    if ((t.alt || []).some(function (a) { return norm(a).indexOf(q) !== -1; })) return true;
    if (t.ipa && norm(t.ipa).indexOf(q) !== -1) return true;
    return false;
  }

  function aliasHits(q) {
    if (!q || q.length < 2) return [];
    return (G.aliases || []).filter(function (a) {
      return norm(a.cn).indexOf(q) !== -1 || norm(a.en).indexOf(q) !== -1 ||
             norm(a.site).indexOf(q) !== -1;
    }).slice(0, 12);
  }

  function chip(label, val, active) {
    return '<button class="chip' + (active ? " active" : "") + '" data-s="g-cat" data-v="' + esc(val) + '">' +
      esc(label) + "</button>";
  }

  function termCard(t) {
    var ipa = t.ipa
      ? '<span class="gl-ipa">' + esc(t.ipa) + "</span>"
      : '<span class="gl-ipa gl-ipa-todo" title="本条目音标尚未人工校订；可先点 🔊 听读音">音标待校订</span>';
    var alt = (t.alt && t.alt.length)
      ? '<span class="gl-alt">亦作：' + esc(t.alt.join(" / ")) + "</span>" : "";
    var ex = t.ex
      ? '<div class="gl-ex"><p class="gl-ex-en">' + esc(t.ex) + '</p><p class="gl-ex-cn">' + esc(t.exCn || "") + "</p></div>"
      : "";
    return '<div class="card gl-card">' +
        '<div class="gl-head">' +
          '<div class="gl-main">' +
            '<div class="gl-w">' + esc(t.w) +
              '<span class="badge badge-muted">' + esc(t.pos || "n.") + "</span>" +
              '<span class="badge badge-muted">' + esc(t.cat || "") + "</span>" +
            "</div>" +
            '<div class="gl-sub">' + esc(t.cn) + " " + ipa + " " + alt + "</div>" +
          "</div>" +
          '<button class="btn btn-soft btn-sm" data-s="g-say" data-t="' + esc(t.w) + '" title="朗读该术语">🔊 读</button>' +
        "</div>" + ex +
      "</div>";
  }

  function aliasBlock(list) {
    if (!list.length) return "";
    var rows = list.map(function (a) {
      return "<li><b>" + esc(a.cn) + "</b>（词典作 <i>" + esc(a.en) + "</i>）→ 站内已有标准写法：<b>" +
        esc(a.site) + "</b>" +
        (a.unit ? ' <a href="#/unit/' + esc(a.unit) + '">去 U' + esc(a.unit) + " 看这条 →</a>" : "") +
        "</li>";
    }).join("");
    return '<div class="card gl-alias"><b>🧭 站内已有，无需重复收录</b>' +
      '<p class="field-note" style="margin:6px 0 8px">下面的中文在词典里是独立条目，但英文/概念站内已经收过——按本站「一个概念一条」的口径，它们只作写法对齐，不新增条目。</p>' +
      "<ul>" + rows + "</ul></div>";
  }

  function render() {
    var app = document.getElementById("app");
    if (!app) return;
    var myGen = ++renderGen;   /* 作废上一次搜索留下的待追加分片 */

    var q = norm(state.q).trim();
    var list = (G.terms || []).filter(function (t) {
      if (state.cat !== "all" && t.cat !== state.cat) return false;
      return hits(t, q);
    });

    var counts = {};
    (G.terms || []).forEach(function (t) { counts[t.cat] = (counts[t.cat] || 0) + 1; });
    var withIpa = (G.terms || []).filter(function (t) { return !!t.ipa; }).length;
    var withEx = (G.terms || []).filter(function (t) { return !!t.ex; }).length;

    var catTabs = [chip("全部 " + (G.terms || []).length, "all", state.cat === "all")]
      .concat((G.cats || []).map(function (c) {
        return chip(c + " " + (counts[c] || 0), c, state.cat === c);
      })).join("");

    /* 有没有 rAF 决定「分批」还是「一次性」：
       浏览器有 rAF → 先画前 GL_CHUNK 条，其余分片追加；
       没有 rAF（Node 门禁 / 老浏览器）→ 一次性渲染全部，DOM 与旧行为逐字节等价。 */
    var canChunk = typeof requestAnimationFrame === "function";
    var body = list.length
      ? '<div id="glList">' + (canChunk ? list.slice(0, GL_CHUNK) : list).map(termCard).join("") + '</div>'
      : "";
    var al = aliasHits(q);
    var total = (G.terms || []).length;
    var ipaTxt = withIpa >= total
      ? "音标已 <b>全部</b> 人工校订"
      : "其中 <b>" + withIpa + "</b> 条已人工校订音标";
    var exTxt = withEx >= total
      ? "每条都配有<b>英文例句与中译</b>"
      : "<b>" + withEx + "</b> 条配有双语例句";

    app.innerHTML = `
    <div class="page-head">
      <div class="crumbs"><a href="#/home">首页</a> / 专业术语速查</div>
      <h2>🔍 专业术语速查</h2>
      <div class="en">软包装 / 复膜胶 / 印刷复合术语 · 中英对照 · 可搜索 · 可朗读</div>
      <p style="margin-top:8px;max-width:780px;color:var(--muted)">${esc(G.note || "")}</p>
    </div>

    <div class="card" style="margin-top:4px;padding:14px 18px">
      <div class="field-note" style="margin:0 0 8px">
        收录 <b>${total}</b> 条术语（${ipaTxt}）；${exTxt}。另有
        <b>${(G.aliases || []).length}</b> 条中文与站内已有条目同义，只作写法对齐、不重复收录。
        🔊 朗读用站内 TTS；术语本身请以客户/官方资料为准。
      </div>
      <input id="glossaryQ" class="gsearch" type="search" placeholder="输入中文或英文查术语，如：剥离力 / peel force / 爽滑" value="${esc(state.q)}" autocomplete="off">
      <div class="chip-row" style="margin-top:10px">${catTabs}</div>
    </div>

    ${aliasBlock(al)}

    <div class="field-note" style="margin:12px 4px 6px">命中 <b>${list.length}</b> 条${q ? "（关键词：" + esc(q) + "）" : ""}</div>
    ${body || '<div class="empty"><div class="e-icon">📭</div>没有匹配的术语。换个中文或英文关键词试试，或点上面的「全部」。</div>'}

    <div class="card" style="margin-top:18px;padding:14px 18px;font-size:13px;color:var(--muted)">
      <b>这个页面从哪来：</b>${esc(G.provenance || "")}
      <span style="display:block;margin-top:8px">
        📌 使用建议：查到一个词别只记中文——回到对应单元看它<b>在句子里的用法</b>
        （<a href="#/units">📚 单元课程</a>），或把例句丢进
        <a href="#/flash">🃏 单词卡</a> / <a href="#/tutor">🤖 AI 对练</a> 里练一遍。
        术语发音不确定时，用 <a href="#/speak">🎤 听说训练</a> 的跟读与
        <a href="#/eval4">🎯 四维实战</a> 的术语发音维度对一遍。
        术语库查不到的词（如客户公司名 / 缩写），试试页头的
        <a href="#/search">🔍 全站搜索</a>——它覆盖课程词条、短语、对话台词。
      </span>
    </div>`;

    var input = document.getElementById("glossaryQ");
    if (input && input.addEventListener) {
      /* 输入即筛选（三百多条量级无需防抖）；用 addEventListener 而不是内联处理器，与全站 CSP 口径一致 */
      input.addEventListener("input", function (e) {
        state.q = e.target.value || "";
        var pos = state.q.length;
        render();
        var el = document.getElementById("glossaryQ");
        if (el && el.focus) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (err) { /* 老浏览器忽略 */ } }
      });
    }
    /* 其余分片：rAF 逐批追加（首屏先出前 GL_CHUNK 条） */
    var i = GL_CHUNK;
    function more() {
      if (myGen !== renderGen) return;
      var box = document.getElementById("glList");
      if (!box || i >= list.length) return;
      var end = Math.min(i + GL_CHUNK, list.length);
      appendHtml(box, list.slice(i, end).map(termCard).join(""));
      i = end;
      if (i < list.length) scheduleChunk(more);
    }
    if (canChunk && i < list.length) scheduleChunk(more);
  }

  function onAction(e) {
    var el = e.target.closest("[data-s]");
    if (!el) return;
    var act = el.getAttribute("data-s");
    if (act === "g-cat") { state.cat = el.getAttribute("data-v") || "all"; render(); }
    else if (act === "g-say") {
      var t = el.getAttribute("data-t");
      if (window.Player && t) window.Player.speak(t, { rate: 0.9 });
    }
  }

  /* 事件委托（只绑一次）：卡片分批追加，逐条绑定会漏掉后追加的那批；绑在 document 上最省。 */
  try { document.addEventListener("click", onAction); } catch (e) { /* 老环境忽略 */ }

  window.Glossary = { render: render, DATA: G, state: state, _hits: hits };
})();
