/* ============ 软包装外贸英语 · 📺 字幕逐句点读（P2） ============
   借鉴 SubTap 的"点读式"交互（逐句主动点击才播放、句间留思考时间），
   但在本站约束内重做：
     1. 支持载入字幕（SRT / VTT / ASS / SSA / SMI）+ 音/视频媒资；
     2. 点任意一句 → 跳到对应片段播放到句末自动暂停（逐句主动点读，避免连听走神）；
     3. 内置分级生词着色（复用本站 FTE_DIFF 的 CEFR 难度 + 行业术语"专"角标）；
     4. 无媒资时降级为「浏览器 TTS 逐句朗读」；点词查意（课程词库+难度兜底）；
     5. 【P7 借鉴 ENGSENCE】四档字幕：全部 / 英语 / 隐藏 / 中文，并按
        全部 → 英语 → 隐藏 → 中文 的推荐顺序引导（中文放最后做【回译检查】：
        看着中文把英文说出来，再点 👁 对照 —— 一上来就看中文最容易骗自己"听懂了"）。
        中英双语字幕（国内最常见的 SRT 形态：英文行 + 中文行）自动分行识别；
        TTS / 发音只读英文轨，不会再中英混读。

   纯前端、无网络依赖；媒资用 FileReader/URL.createObjectURL 本地载入，不上传。
   渲染：window.Subtitle.render()（自包含）。 */
(function () {
  "use strict";

  /* ---------------- 四档字幕（P7）常量（须在 _t 暴露之前定义，避免 TDZ） ---------------- */
  const MODE_KEY = "fte-subtitle-mode";
  const MODE_ORDER = ["all", "en", "hidden", "zh"];
  const MODES = {
    all:    { label: "全部", icon: "🈶", hint: "英中都有 —— 第一次接触一集时用，先把意思弄明白" },
    en:     { label: "英语", icon: "🅰️", hint: "只留英文 —— 意思懂了之后练视读，顺带确认拼写" },
    hidden: { label: "隐藏", icon: "🙈", hint: "没有字幕 —— 纯听，练听力的主战场" },
    zh:     { label: "中文", icon: "🀄", hint: "只留中文 —— 看着中文把英文说出来，再点 👁 对照检查" }
  };

  window.Subtitle = { render: render, DATA: null };
  /* 供自动化测试/诊断使用的解析钩子（不影响运行时） */
  window.Subtitle._t = {
    toSec: toSec, parseSubtitle: parseSubtitle, diff: diff, coloredText: coloredText, guessFormat: guessFormat,
    hasCJK: hasCJK, splitBilingual: splitBilingual, buildCue: buildCue,
    modeOrder: MODE_ORDER, modeHint: modeHint, effModeOf: effModeOf
  };
  const state = window.Subtitle.state = {
    cues: [], mediaUrl: null, mediaEl: null, current: -1, fileName: "",
    mode: loadMode(),        // "" = 自动（有中文轨→全部，否则→英语）
    revealed: {}             // 中文档下「已对照英文」的句子下标（本次载入内有效）
  };

  /* ---------------- 四档字幕（P7） ---------------- */
  function modeHint(m) { return (MODES[m] || MODES.en).hint; }
  function loadMode() {
    try { const m = localStorage.getItem(MODE_KEY); if (MODE_ORDER.indexOf(m) >= 0) return m; } catch (e) { /* ignore */ }
    return "";
  }
  function saveMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* ignore */ } }

  const LANGS = { srt: "SRT", vtt: "VTT", ass: "ASS", ssa: "SSA", sub: "SUB", smi: "SMI" };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------------- 双语字幕分行（P7） ----------------
     国内最常见的 SRT 是「英文一行 + 中文一行」的双语文件。此前解析把它 join(" ") 成一句，
     导致：① 没法只显示英文/只显示中文；② TTS 会把中文也念出来。
     这里按行判定：含中日韩汉字的行 → 中文轨；其余 → 英文轨。单语字幕原样进英文轨。 */
  const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3000-\u303F]/;
  function hasCJK(s) { return CJK_RE.test(String(s == null ? "" : s)); }
  function splitBilingual(lines) {
    const en = [], zh = [];
    (Array.isArray(lines) ? lines : [lines]).forEach(function (l) {
      const s = String(l == null ? "" : l).trim();
      if (!s) return;
      if (hasCJK(s)) zh.push(s); else en.push(s);
    });
    return { en: en.join(" ").trim(), zh: zh.join(" ").trim() };
  }
  /* ASS/SSA 用 \N 断行、SMI/网页字幕可能用 <br>：统一成真实换行后再分行 */
  function normBreaks(s) {
    return String(s == null ? "" : s).replace(/\\[Nn]/g, "\n").replace(/<br\s*\/?>/gi, "\n");
  }
  function buildCue(start, end, lines) {
    /* 数组（SRT 的多行）用换行拼接，避免 String([a,b]) 退化成 "a,b" */
    const raw = Array.isArray(lines) ? lines.join("\n") : lines;
    const b = splitBilingual(normBreaks(raw).split("\n"));
    /* text 保留"英文优先"口径：TTS 与外部读取文本都只拿英文，绝不中英混读 */
    return { start: start, end: end, en: b.en, zh: b.zh, text: b.en || b.zh };
  }

  /* ---------------- 时间解析：统一为秒 ---------------- */
  function toSec(str) {
    if (str == null) return 0;
    const s = String(str).replace(/,/g, ".").trim();
    const parts = s.split(":");
    let t = 0;
    if (parts.length >= 3) t = (+parts[parts.length - 3]) * 3600 + (+parts[parts.length - 2]) * 60 + parseFloat(parts[parts.length - 1]);
    else if (parts.length === 2) t = (+parts[0]) * 60 + parseFloat(parts[1]);
    else t = parseFloat(s);
    return isFinite(t) ? t : 0;
  }
  function fmtSec(s) {
    s = Math.max(0, s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + sec.toFixed(2).padStart(5, "0");
  }

  /* ---------------- 字幕解析 ---------------- */
  function parseSRTVTT(text) {
    const lines = text.replace(/\r/g, "").split("\n");
    const cues = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l) { i++; continue; }
      if (l.indexOf("-->") === -1) {
        /* 可能是序号/标识行，向后最多 2 行找时间行 */
        let k = i + 1;
        while (k < lines.length && k <= i + 2 && lines[k].trim() && lines[k].indexOf("-->") === -1) k++;
        if (k < lines.length && lines[k].indexOf("-->") !== -1) { i = k; }
        else { i++; continue; }
      }
      const parts = lines[i].split("-->");
      const start = toSec(parts[0].trim());
      const end = toSec(parts[1].trim().split(/\s+/)[0]);
      let body = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "") { body.push(stripTags(lines[i].trim())); i++; }
      cues.push(buildCue(start, end, body));
    }
    return cues;
  }
  function stripTags(s) {
    return String(s).replace(/<\/?[^>]+>/g, "").replace(/\{[^}]*\}/g, "").trim();
  }
  function parseASS(text) {
    const cues = [];
    let inEvents = false, names = [];
    text.replace(/\r/g, "").split("\n").forEach(function (line) {
      const s = line.trim();
      if (s.indexOf("[Events]") === 0) { inEvents = true; return; }
      if (/^\[/.test(s)) { inEvents = false; return; }
      if (!inEvents) return;
      if (s.indexOf("Format:") === 0) { names = s.slice(7).split(",").map(function (x) { return x.trim(); }); return; }
      if (s.indexOf("Dialogue:") === 0) {
        const arr = s.slice(9).split(",");
        const n = names.length || 10;
        const f = [];
        for (let k = 0; k < n; k++) f[k] = (k === n - 1) ? arr.slice(n - 1).join(",") : arr[k];
        const start = toSec(f[names.indexOf("Start") >= 0 ? names.indexOf("Start") : 1]);
        const end = toSec(f[names.indexOf("End") >= 0 ? names.indexOf("End") : 2]);
        const ti = names.indexOf("Text");
        const text = stripTags(ti >= 0 ? f[ti] : f[f.length - 1]);
        if (text) cues.push(buildCue(start, end, text));
      }
    });
    return cues;
  }
  function parseSMI(text) {
    // <SYNC Start=1000><P Class=ENCC>text...
    const cues = [];
    const re = /<SYNC\s+Start\s*=\s*(\d+)[^>]*>([\s\S]*?)(?=<\s*\/?SYNC|<\s*\/?P|$)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const t = +m[1] / 1000;
      const body = stripTags(normBreaks(m[2])).trim();
      if (body) cues.push(buildCue(t, t, body));
    }
    // 补 end（下一句 start）
    for (let i = 0; i < cues.length; i++) cues[i].end = (i + 1 < cues.length) ? cues[i + 1].start : cues[i].start + 3;
    return cues;
  }

  function guessFormat(filename) {
    const n = String(filename || "").toLowerCase().split(".").pop();
    return LANGS[n] ? n : "";
  }
  function parseSubtitle(text, format) {
    if (format === "ass" || format === "ssa") return parseASS(text);
    if (format === "smi") return parseSMI(text);
    return parseSRTVTT(text);
  }

  /* ---------------- 分级生词着色 ---------------- */
  function syll(w) {
    const s = String(w).toLowerCase().replace(/[^a-z]/g, "");
    if (!s) return 1;
    const m = s.match(/[aeiouy]+/g);
    return (m ? m.length : 1) || 1;
  }
  function diff(word) {
    const clean = String(word).toLowerCase().replace(/[^a-z'-]/g, "");
    const D = window.FTE_DIFF;
    const rec = D && D.words && D.words[clean];
    if (rec) {
      if (rec.dom) return { cls: "tech", label: "行业术语" };
      if (rec.dif === "easy") return { cls: "easy", label: "易" };
      if (rec.dif === "mid") return { cls: "mid", label: "中" };
      return { cls: "hard", label: "难" };
    }
    if (clean.length <= 5 && syll(clean) <= 2) return { cls: "easy", label: "易" };
    if (clean.length <= 8) return { cls: "mid", label: "中" };
    return { cls: "hard", label: "难" };
  }
  function lookupWord(word) {
    const q = String(word).toLowerCase();
    const D = (typeof FTE_DATA !== "undefined") ? FTE_DATA : null;
    if (D && D.units) {
      for (let ui = 0; ui < D.units.length; ui++) {
        const u = D.units[ui];
        for (let vi = 0; vi < u.vocab.length; vi++) {
          const v = u.vocab[vi];
          if (String(v.w).toLowerCase() === q) return { cn: v.cn, ipa: v.ipa, pos: v.pos, ex: v.ex, exCn: v.exCn, unit: u.title };
        }
      }
    }
    return null;
  }

  /* 把一句字幕按分词着色为 HTML（保留原句可点击词） */
  function coloredText(text) {
    const tokens = String(text).split(/\s+/).filter(Boolean);
    return tokens.map(function (tok) {
      const word = tok.replace(/[^a-zA-Z'-]/g, "");
      if (!word) return esc(tok);
      const d = diff(word);
      return '<span class="sub-word ' + d.cls + '" data-w="' + esc(word) + '" title="' + d.label + '">' + esc(tok) + '</span>';
    }).join(" ");
  }

  /* ---------------- 四档字幕：当前生效档位 ---------------- */
  function hasZhTrack(cues) { return (cues || state.cues).some(function (c) { return !!(c && c.zh); }); }
  /* 纯函数版（供测试）：给定 cues 与用户选的档位，算出真正生效的档位。
     单语字幕（无中文轨）时：中文/全部 自动落到「英语」，隐藏 保持「隐藏」。 */
  function effModeOf(m, cues) {
    if (!hasZhTrack(cues)) return (m === "hidden") ? "hidden" : "en";
    return MODE_ORDER.indexOf(m) >= 0 ? m : "all";
  }
  function effMode() { return effModeOf(state.mode, state.cues); }
  function modeHintText() {
    if (state.cues.length && !hasZhTrack()) {
      return "本字幕无中文轨（单语）——「全部 / 中文」档会自动落到英语档。" + modeHint(effMode());
    }
    return modeHint(effMode());
  }

  /* 单行渲染：按当前档位决定露什么、藏什么 */
  function rowHtml(c, i) {
    const m = effMode();
    const isCur = i === state.current;
    const enText = c.en || c.text || "";
    const zhText = c.zh || "";
    let body;
    if (m === "hidden") {
      body = '<span class="sub-mask">🙈 字幕已隐藏（纯听）· 点这一行重播这句</span>';
    } else if (m === "zh") {
      body = '<span class="sub-zh">' + esc(zhText || "（本句无中文）") + "</span>" +
        (state.revealed[i]
          ? '<div class="sub-reveal-en">' + coloredText(enText) + "</div>"
          : ' <button class="btn btn-outline btn-sm sub-reveal" data-reveal="' + i + '">👁 显示英文对照</button>');
    } else if (m === "all") {
      body = '<span class="sub-en">' + coloredText(enText) + "</span>" +
        (zhText ? '<div class="sub-zh">' + esc(zhText) + "</div>" : "");
    } else {
      body = '<span class="sub-en">' + coloredText(enText) + "</span>";
    }
    return '<div class="sub-row ' + (isCur ? "cur" : "") + '" data-idx="' + i + '">' +
      '<span class="sub-time">' + fmtSec(c.start) + "</span>" +
      '<span class="sub-text">' + body + "</span></div>";
  }

  /* 只换行内容与档位高亮，不整页 render()——避免重建 <video> 丢掉播放进度 */
  function setMode(m) {
    if (MODE_ORDER.indexOf(m) < 0) return;
    state.mode = m;
    saveMode(m);
    state.revealed = {};
    applyModeDom();
  }
  function applyModeDom() {
    const m = effMode();
    document.querySelectorAll("#app [data-mode]").forEach(function (b) {
      b.classList.toggle("cur", b.getAttribute("data-mode") === m);
    });
    document.querySelectorAll("#app .sub-step").forEach(function (el) {
      el.classList.toggle("cur", el.getAttribute("data-step") === m);
    });
    const a = (window.Player && window.Player.accent) || "us";
    document.querySelectorAll("#app [data-accent]").forEach(function (b) {
      b.classList.toggle("cur", b.getAttribute("data-accent") === a);
    });
    const hint = document.getElementById("subModeHint");
    if (hint) hint.textContent = modeHintText();
    const list = document.querySelector("#app .sub-list");
    if (list) list.innerHTML = state.cues.map(rowHtml).join("");
  }
  function revealCue(i) {
    const cue = state.cues[i];
    if (!cue) return;
    state.revealed[i] = true;
    const box = document.querySelector('#app .sub-row[data-idx="' + i + '"] .sub-text');
    if (box) {
      box.innerHTML = '<span class="sub-zh">' + esc(cue.zh || "（本句无中文）") + '</span>' +
        '<div class="sub-reveal-en">' + coloredText(cue.en || cue.text) + "</div>";
    }
  }
  function modeBarHtml() {
    const m = effMode();
    return `
    <div class="sub-modes">
      <div class="sub-modes-row">
        <span class="sub-modes-label">字幕档</span>
        ${MODE_ORDER.map(function (k) {
          return '<button class="sub-mode' + (k === m ? " cur" : "") + '" data-mode="' + k + '" title="' +
            esc(MODES[k].hint) + '">' + MODES[k].icon + " " + MODES[k].label + "</button>";
        }).join("")}
        <span class="field-note" id="subModeHint">${esc(modeHintText())}</span>
      </div>
      <div class="sub-order">
        <b>推荐顺序</b>
        ${MODE_ORDER.map(function (k, i) {
          return '<span class="sub-step' + (k === m ? " cur" : "") + '" data-step="' + k + '">' + (i + 1) + ". " + MODES[k].label + "</span>";
        }).join('<span class="sub-arrow">→</span>')}
        <span class="sub-order-note">中文放<b>最后</b>：读懂了中文最容易骗自己"听懂了"。拿它做<b>回译检查</b> —— 看着中文把英文说出来，再点 👁 对照。</span>
      </div>
      ${accentRowHtml()}
    </div>`;
  }
  /* 听力口音（P7）：只换朗读人声，音标与词库仍是全站统一的美式 GA */
  function accentRowHtml() {
    const a = (window.Player && window.Player.accent) || "us";
    return `
      <div class="sub-modes-row" style="margin-top:8px">
        <span class="sub-modes-label">听力口音</span>
        <button class="sub-mode${a === "us" ? " cur" : ""}" data-accent="us" title="站内标准口音（General American）">🇺🇸 美音</button>
        <button class="sub-mode${a === "uk" ? " cur" : ""}" data-accent="uk" title="英音：同一段材料两种口音各过一遍，适应不同买家发音">🇬🇧 英音</button>
        <span class="field-note">只换「听」的人声；<b>音标与词库不变</b>（全站统一美式 GA）。建议同一句用两种口音各听一遍。</span>
      </div>`;
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    const app = document.getElementById("app");
    const s = state;
    const showMedia = s.mediaUrl ? "" : "hidden";
    const noMedia = s.mediaUrl ? "hidden" : "";
    const cueList = s.cues.length
      ? s.cues.map(rowHtml).join("")
      : '<div class="empty"><div class="e-icon">📺</div>载入一套字幕和一份音/视频，它就是你的"点读机"。上面先选文件。</div>';

    app.innerHTML = `
    <div class="page-head">
      <div class="crumbs"><a href="#/home">首页</a> / 字幕点读</div>
      <h2>📺 字幕逐句点读</h2>
      <div class="en">点一句 → 播这一句 → 自动停 · 生词按难度自动着色（CEFR + 行业术语）· 四档字幕（全部/英语/隐藏/中文）</div>
      <p style="margin-top:8px;max-width:760px;color:var(--muted)">把美剧、演讲、YouTube 视频的<b>字幕</b>和<b>音/视频</b>载入进来，一句一句主动点读：点击任意句子即播放对应片段，读完自动暂停，句与句之间留出思考时间，避免连听走神。生词按 <b>易/中/难/专</b> 自动着色，点击词看解释。<b>中英双语字幕自动分轨</b>，可按 <b>全部 → 英语 → 隐藏 → 中文</b> 逐步加难度；中文档留到最后做<b>回译检查</b>。全程本地，不上传任何文件。</p>
    </div>

    <div class="card" style="margin-top:6px;padding:16px 18px">
      <div class="sub-load">
        <div class="sub-load-item">
          <label class="btn btn-outline btn-sm">📄 载入字幕（SRT/VTT/ASS/SSA/SMI）<input type="file" id="subFile" accept=".srt,.vtt,.ass,.ssa,.sub,.smi,text/plain" hidden></label>
          <span class="sub-fn" id="subName">${s.fileName ? esc(s.fileName) : "未选择字幕"}</span>
        </div>
        <div class="sub-load-item">
          <label class="btn btn-outline btn-sm">🎞 载入音频 / 视频<input type="file" id="mediaFile" accept="audio/*,video/*" hidden></label>
          <span class="sub-fn" id="mediaName">${s.mediaUrl ? "已载入媒资" : "未选择（可选，并用 TTS 点读）"}</span>
        </div>
        <div class="sub-load-item">
          <span class="badge badge-muted">◀ ▶ 上一句/下一句</span>
          <span class="badge badge-muted">⇦ 重读当前句</span>
          <span class="badge badge-muted">⏯ 自动连播</span>
        </div>
      </div>
      <div class="sub-legend">
        <span class="sub-word easy">易 A1-A2</span>
        <span class="sub-word mid">中 B1</span>
        <span class="sub-word hard">难 B2-C2</span>
        <span class="sub-word tech">专 行业术语</span>
      </div>
    </div>

    <div style="margin-top:12px" ${showMedia}>
      <div class="card" style="padding:12px"><video id="diMedia" controls playsinline style="width:100%;max-height:320px;background:#000"></video></div>
    </div>

    <div class="card" style="margin-top:12px;padding:12px">
      <button class="btn btn-soft btn-sm" id="diPlay" data-pl="play">▶ 播放当前句</button>
      <button class="btn btn-soft btn-sm" id="diPrev" data-pl="prev">⏮ 上一句</button>
      <button class="btn btn-soft btn-sm" id="diNext" data-pl="next">⏭ 下一句</button>
      <button class="btn btn-soft btn-sm" id="diAuto" data-pl="auto">🔁 自动连播</button>
      <span class="badge badge-muted" id="diCounter">${s.cues.length ? (s.current >= 0 ? (s.current + 1) + " / " + s.cues.length : "0 / " + s.cues.length) : "0 / 0"}</span>
      <span class="field-note" style="margin-left:8px" id="diNote">点任意一句开始点读；无媒资时用 TTS 朗读当前句。</span>
    </div>

    <div class="card sub-modes-card" style="margin-top:12px;padding:12px 14px">${modeBarHtml()}</div>
    <div class="sub-list">${cueList}</div>
    <div class="card" style="margin-top:14px;padding:14px 18px;font-size:13px;color:var(--muted)">
      <b>它适合什么场景：</b>① 载入一份<b>外贸/商务</b>字幕（展会、谈判、会议录像）逐句啃；② 载入<b>美剧/演讲</b>字幕磨地道表达；③ 颜色帮你快速分清"这个生词难不难、是不是行业术语"。<b>生词点一下</b>看课程词库解释，没有的会标难度并提示你查词。相关工具：<a href="#/sources">🎧 真实听音源</a> · <a href="#/speak">🎤 听说训练</a> · <a href="#/flash">🃏 单词卡</a>。
    </div>`;

    bind();
  }

  function bind() {
    const s = state;
    const subInput = document.getElementById("subFile");
    const mediaInput = document.getElementById("mediaFile");
    const video = document.getElementById("diMedia");
    if (subInput) subInput.addEventListener("change", onSub);
    if (mediaInput) mediaInput.addEventListener("change", onMedia);
    if (video) {
      s.mediaEl = video;
      if (s.mediaUrl) video.src = s.mediaUrl;   /* 每次渲染重建 <video> 后恢复媒资 src */
    }

    /* 点读：事件委托到列表容器 —— 切档位会重排行 HTML，逐行绑定会失效 */
    const listBox = document.querySelector("#app .sub-list");
    if (listBox) listBox.addEventListener("click", function (e) {
      const rv = e.target.closest("[data-reveal]");
      if (rv) { revealCue(parseInt(rv.getAttribute("data-reveal"), 10)); return; }
      const w = e.target.closest(".sub-word");
      if (w) { onWordClick(w.getAttribute("data-w")); return; }
      const row = e.target.closest(".sub-row");
      if (row) playCue(parseInt(row.getAttribute("data-idx"), 10));
    });
    /* 四档字幕切换 */
    document.querySelectorAll("#app [data-mode]").forEach(function (b) {
      b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); });
    });
    /* 听力口音：只换朗读人声（音标/词库不动） */
    document.querySelectorAll("#app [data-accent]").forEach(function (b) {
      b.addEventListener("click", function () {
        const a = b.getAttribute("data-accent");
        if (window.Player && window.Player.setAccent) window.Player.setAccent(a);
        applyModeDom();
        const has = !window.Player || !window.Player.hasAccent || window.Player.hasAccent(a);
        if (!has) toastMsg(a === "uk" ? "⚠️ 本机未找到英音人声，已回退默认发音人（可在设置里装英音语音包）" : "⚠️ 本机未找到美音人声，已回退默认发音人");
        else toastMsg(a === "uk" ? "🇬🇧 已切到英音 —— 建议同一句再切回美音对照一遍" : "🇺🇸 已切到美音（站内标准口音）");
      });
    });
    document.querySelectorAll("#app [data-pl]").forEach(function (b) {
      b.addEventListener("click", function () {
        const k = b.getAttribute("data-pl");
        if (k === "play") { s.auto = false; playCue(s.current >= 0 ? s.current : nextCueIdx(0)); }
        else if (k === "prev") { s.auto = false; playCue(prevCueIdx(s.current)); }
        else if (k === "next") { s.auto = false; playCue(nextCueIdx(s.current)); }
        else if (k === "auto") autoPlay();
      });
    });

    if (s.mediaEl) {
      s.mediaEl.addEventListener("timeupdate", onTime);
      s.mediaEl.addEventListener("ended", function () { if (s.auto) autoPlay(); });
    }
  }

  /* 单个 timeupdate 处理器：既高亮当前句，又到句末自动暂停（点读/自动连播共用） */
  function onTime() {
    const s = state;
    const t = s.mediaEl ? s.mediaEl.currentTime : 0;
    /* 句末暂停：非自动模式下停在句尾；自动模式下由此推进下一句 */
    if (s._stopAt != null && t >= s._stopAt) {
      try { s.mediaEl.pause(); } catch (_) { /* ignore */ }
      s._stopAt = null;
      if (s.auto) {
        s.current = nextCueIdx(s.current);
        if (s.current !== 0 || s.cues.length === 1) { setTimeout(function () { if (s.auto) playCue(s.current); }, 350); }
        else { s.auto = false; }
      }
      return;
    }
    /* 高亮当前句（仅当未处于暂停对齐状态时，避免拖动时误跳动） */
    if (!s.auto && s._stopAt == null) {
      let best = -1;
      for (let i = 0; i < s.cues.length; i++) if (t >= s.cues[i].start && t < s.cues[i].end) { best = i; break; }
      if (best !== s.current && best >= 0) { s.current = best; highlightCue(best); updateCounter(); }
    }
  }

  /* ---------------- 文件载入 ---------------- */
  function onSub(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const format = guessFormat(file.name);
      const cues = parseSubtitle(String(reader.result || ""), format);
      if (!cues.length) { toastMsg("⚠️ 未解析到字幕，请确认是 SRT/VTT/ASS/SSA/SMI 格式。" + (format ? "（识别为 " + format + "）" : "")); return; }
      /* 去掉空句、按开始时间排序 */
      cues.sort(function (a, b) { return a.start - b.start; });
      state.cues = cues;
      state.current = 0;
      state.fileName = file.name;
      state.revealed = {};   /* 换字幕即清空「已对照」标记 */
      toastMsg("✓ 已载入 " + cues.length + " 句字幕：" + file.name +
        (cues.some(function (c) { return c.zh; }) ? "（识别到中英双语轨）" : ""));
      render();
    };
    reader.readAsText(file, "utf-8");
  }
  function onMedia(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (state.mediaUrl) { try { URL.revokeObjectURL(state.mediaUrl); } catch (_) { /* ignore */ } }
    state.mediaUrl = URL.createObjectURL(file);
    if (state.mediaEl) { state.mediaEl.src = state.mediaUrl; }
    toastMsg("✓ 已载入媒资（本地，不上传）");
    render();
  }

  /* ---------------- 播放控制 ---------------- */
  function nextCueIdx(i) {
    if (!state.cues.length) return -1;
    return (i + 1) % state.cues.length;
  }
  function prevCueIdx(i) {
    if (!state.cues.length) return -1;
    return (i - 1 + state.cues.length) % state.cues.length;
  }

  function playCue(idx) {
    const s = state;
    if (idx < 0 || !s.cues.length) return;
    const cue = s.cues[idx];
    s.current = idx;
    highlightCue(idx);
    updateCounter();
    if (s.mediaEl && s.mediaUrl && typeof s.mediaEl.currentTime === "number") {
      try {
        s.mediaEl.currentTime = cue.start;
        s.mediaEl.play();
        s._stopAt = cue.end;
        return;
      } catch (_) { /* fall through to TTS */ }
    }
    /* 无媒资或播放失败：TTS 点读这一句 */
    if (window.Player) window.Player.speak(cue.text, { rate: 1 });
  }

  function autoPlay() {
    const s = state;
    if (!s.cues.length) return;
    s.auto = true;
    if (s.mediaEl && s.mediaUrl) {
      /* 有媒资：借助 timeupdate 已把当前句高亮 + 到句末暂停；逐句推进 */
      playCue(s.current >= 0 && s.current < s.cues.length ? s.current : 0);
      return;
    }
    /* 无媒资：用 TTS 逐句连播（onend 链式推进） */
    const seq = function (i) {
      if (!s.auto || i >= s.cues.length) { s.auto = false; return; }
      s.current = i; highlightCue(i); updateCounter();
      window.Player.speak(s.cues[i].text, { rate: 1, onend: function () { setTimeout(function () { seq(i + 1); }, 400); } });
    };
    seq(s.current >= 0 && s.current < s.cues.length ? s.current : 0);
  }

  function highlightCue(idx) {
    document.querySelectorAll("#app .sub-row").forEach(function (r) {
      r.classList.toggle("cur", parseInt(r.getAttribute("data-idx"), 10) === idx);
    });
  }
  function updateCounter() {    const el = document.getElementById("diCounter");
    if (el) el.textContent = state.cues.length ? (state.current >= 0 ? (state.current + 1) + " / " + state.cues.length : "0 / " + state.cues.length) : "0 / 0";
  }

  /* ---------------- 点词查意 ---------------- */
  function onWordClick(word) {
    const info = lookupWord(word);
    const d = diff(word);
    let msg;
    if (info) msg = "「" + word + "」" + (info.ipa ? " " + info.ipa : "") + " · " + (info.pos || "") + " \n" + info.cn + "\n" + (info.ex || "") + (info.exCn ? "\n" + info.exCn : "") + (info.unit ? "\n（来自 " + info.unit + "）" : "");
    else msg = "「" + word + "」不在本站课程词库，难度：[" + d.label + "]。\n可到 <a href='#/units'>单元词汇</a> 找同源词，或到外部词典查释义后加入单词卡。";
    toastMsg(msg, info);
  }

  let toastTimer = null;
  function toastMsg(msg, isHtml) {
    const t = document.getElementById("toast");
    if (t) {
      t.innerHTML = msg;
      t.hidden = false; t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
      clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 6500);
    }
  }
})();
