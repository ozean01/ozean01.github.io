/* ============ 软包装外贸英语 · 📺 字幕逐句点读（P2） ============
   借鉴 SubTap 的"点读式"交互（逐句主动点击才播放、句间留思考时间），
   但在本站约束内重做：
     1. 支持载入字幕（SRT / VTT / ASS / SSA / SMI）+ 音/视频媒资；
     2. 点任意一句 → 跳到对应片段播放到句末自动暂停（逐句主动点读，避免连听走神）；
     3. 内置分级生词着色（复用本站 FTE_DIFF 的 CEFR 难度 + 行业术语"专"角标）；
     4. 无媒资时降级为「浏览器 TTS 逐句朗读」；点词查意（课程词库+难度兜底）。

   纯前端、无网络依赖；媒资用 FileReader/URL.createObjectURL 本地载入，不上传。
   渲染：window.Subtitle.render()（自包含）。 */
(function () {
  "use strict";

  window.Subtitle = { render: render, DATA: null };
  /* 供自动化测试/诊断使用的解析钩子（不影响运行时） */
  window.Subtitle._t = { toSec: toSec, parseSubtitle: parseSubtitle, diff: diff, coloredText: coloredText, guessFormat: guessFormat };
  const state = window.Subtitle.state = {
    cues: [], mediaUrl: null, mediaEl: null, current: -1, fileName: ""
  };

  const LANGS = { srt: "SRT", vtt: "VTT", ass: "ASS", ssa: "SSA", sub: "SUB", smi: "SMI" };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
      cues.push({ start: start, end: end, text: body.join(" ") });
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
        if (text) cues.push({ start: start, end: end, text: stripTags(text) });
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
      const body = stripTags(m[2]).trim();
      if (body) cues.push({ start: t, end: t, text: body });
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

  /* ---------------- 渲染 ---------------- */
  function render() {
    const app = document.getElementById("app");
    const s = state;
    const showMedia = s.mediaUrl ? "" : "hidden";
    const noMedia = s.mediaUrl ? "hidden" : "";
    const cueList = s.cues.length
      ? s.cues.map(function (c, i) {
        const isCur = i === s.current;
        return `<div class="sub-row ${isCur ? "cur" : ""}" data-idx="${i}">
          <span class="sub-time">${fmtSec(c.start)}</span>
          <span class="sub-text">${coloredText(c.text)}</span>
        </div>`;
      }).join("")
      : '<div class="empty"><div class="e-icon">📺</div>载入一套字幕和一份音/视频，它就是你的"点读机"。上面先选文件。</div>';

    app.innerHTML = `
    <div class="page-head">
      <div class="crumbs"><a href="#/home">首页</a> / 字幕点读</div>
      <h2>📺 字幕逐句点读</h2>
      <div class="en">点一句 → 播这一句 → 自动停 · 生词按难度自动着色（CEFR + 行业术语）</div>
      <p style="margin-top:8px;max-width:760px;color:var(--muted)">把美剧、演讲、YouTube 视频的<b>字幕</b>和<b>音/视频</b>载入进来，一句一句主动点读：点击任意句子即播放对应片段，读完自动暂停，句与句之间留出思考时间，避免连听走神。生词按 <b>易/中/难/专</b> 自动着色，点击词看解释。全程本地，不上传任何文件。</p>
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

    /* 点读：点任意句子行 → 播放该句 */
    document.querySelectorAll("#app .sub-row").forEach(function (row) {
      row.addEventListener("click", function (e) {
        const w = e.target.closest(".sub-word");
        if (w) { onWordClick(w.getAttribute("data-w")); return; }
        playCue(parseInt(row.getAttribute("data-idx"), 10));
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
      toastMsg("✓ 已载入 " + cues.length + " 句字幕：" + file.name);
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
