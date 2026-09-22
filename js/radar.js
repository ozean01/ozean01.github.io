/* ============ 📡 口语水平概览（软包装外贸 · SpeakingRadar，模块 H） ============
   把「四维口语实战」（progress.eval4：term 术语发音 / flu 语调流利 / acc 应答准确性 / log 表达逻辑）
   与「自由表达分析」（fte-speech-v1：words / rate / fluency / ai.grammar / ai.expression）
   聚合成一张【五维口语雷达】+ 一个【段位徽章】+ 最弱维度建议 + 导出图片（PNG）。

   诚实：这是【站内相对水平】（基于你在本站练过的成绩），不声称与官方 CEFR 口语量表对齐；
   数据少时明确提示"样本不足，多练几次更准"。纯静态 + canvas，零后端。 */
(function () {
  "use strict";

  const app = document.getElementById("app");
  const SPEECH_KEY = "fte-speech-v1";
  const U = function () { return window.ASRUtil || {}; };
  const esc = function (s) { const f = U().esc; return f ? f(s) : String(s == null ? "" : s); };

  /* ---------------- 数据聚合 ---------------- */
  function eval4Records() {
    try {
      const p = U().getProgress ? U().getProgress() : {};
      if (!Array.isArray(p.eval4)) return [];
      return p.eval4.filter(function (r) { return r && typeof r.term === "number"; });
    } catch (e) { return []; }
  }
  function speechRecords() {
    try { const a = JSON.parse(localStorage.getItem(SPEECH_KEY) || "[]"); return Array.isArray(a) ? a.filter(Boolean) : []; }
    catch (e) { return []; }
  }
  function avg(nums) { const v = nums.filter(function (n) { return typeof n === "number" && isFinite(n); }); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; }

  /* 生成 5 维（每个 0-100，可为 null=未测）。recent：取最近 N 条。 */
  function compute(recentN) {
    const e = eval4Records().slice(0, recentN || 10);
    const s = speechRecords().slice(0, recentN || 10);
    const eTerm = avg(e.map(function (r) { return r.term; }));
    const eFlu = avg(e.map(function (r) { return r.flu; }));
    const eAcc = avg(e.map(function (r) { return r.acc; }));
    const eLog = avg(e.map(function (r) { return r.log; }));
    const sFlu = avg(s.map(function (r) { return r.fluency; }));
    const gGram = avg(s.filter(function (r) { return r.ai; }).map(function (r) { return r.ai.grammar; }));
    const gExpr = avg(s.filter(function (r) { return r.ai; }).map(function (r) { return r.ai.expression; }));

    /* 词汇维度：自由表达不能直接测词汇量，用「去重词数」做一个诚实的启发式，标"估算"。
       P1-6：**不再把语速 rate/4 加进来**——语速快不等于词汇量大，把它混进词汇分会
       让「说得快」被读成「词多」。 */
    const uniq = avg(s.map(function (r) { return r.uniq; }));
    let vocab = null;
    if (uniq != null && uniq > 0) vocab = Math.round(Math.min(100, Math.max(20, uniq * 2.2)));

    const dims = [
      { key: "pron", label: "术语发音", val: eTerm, from: "四维", href: "#/eval4", tip: "跟读标准句 + Azure 音素级最准" },
      { key: "flu", label: "语调·流利", val: avg([eFlu, sFlu]), from: "四维/自由表达", href: "#/eval4", tip: "重读实义词、轻读虚词、控制填充词" },
      { key: "gram", label: "语法", val: gGram, from: "自由表达(AI)", href: "#/speech", tip: "用 AI 判语法/表达，回读更自然版本" },
      { key: "vocab", label: "词汇量(估算)", val: vocab, from: "自由表达", href: "#/speech", tip: "多说、多用去重词，扩大表达面" },
      { key: "expr", label: "表达·逻辑", val: avg([eAcc, eLog, gExpr]), from: "四维/自由表达", href: "#/eval4", tip: "先认可 → 给理由 → 给方案 → 承诺" }
    ];
    const have = dims.filter(function (d) { return d.val != null; });
    /* P1-6：**综合分与段位需要最小样本量**。
       综合分是「可用维度的等权平均」，此前 1 条记录就能评出「母语级」——弱证据被包装成强结论。
       要求至少 MIN_SAMPLES 次有效测评（四维 / 自由表达合计），否则不给综合分、不评段位。 */
    const n = e.length + s.length;
    const MIN_SAMPLES = 3;
    const enough = n >= MIN_SAMPLES;
    const overall = (have.length && enough) ? Math.round(have.reduce(function (a, d) { return a + d.val; }, 0) / have.length) : null;
    return { dims: dims, overall: overall, nEval: e.length, nSpeech: s.length, n: n, minSamples: MIN_SAMPLES, enough: enough };
  }

  /* 段位（站内相对，诚实标注） */
  function rank(v) {
    if (v == null) return null;
    if (v >= 85) return { name: "母语级", ic: "🏆", cls: "r5", desc: "表达已接近自然母语，可挑战更高强度的真实商务场景" };
    if (v >= 72) return { name: "流利", ic: "🚀", cls: "r4", desc: "能流畅表达，进一步打磨语调、词域与临场逻辑" };
    if (v >= 60) return { name: "熟练", ic: "💪", cls: "r3", desc: "基本能开口，重点补齐最弱维度与行业术语" };
    if (v >= 45) return { name: "进阶", ic: "🌱", cls: "r2", desc: "有基础，建议按「今日任务 + 场景对练」每日开口" };
    if (v >= 25) return { name: "基础", ic: "📘", cls: "r1", desc: "先从高频句型和场景对话打底，再开口" };
    return { name: "起步", ic: "🐣", cls: "r0", desc: "建议从最基础的单元与跟读开始，建立信心" };
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    const data = compute(10);
    const hasData = data.dims.some(function (d) { return d.val != null; });
    app.innerHTML = pageHeadHtml(data) + (hasData ? bodyHtml(data) : emptyHtml());
    if (hasData) drawRadar("radarCanvas", data);
  }

  function pageHeadHtml(data) {
    const n = data.nEval + data.nSpeech;
    return `
    <div class="page-head">
      <h2>📡 口语水平概览</h2>
      <div class="en">把你练过的「四维口语实战」+「自由表达分析」聚合成一张五维雷达 + 段位</div>
      <div class="en" style="margin-top:4px;font-size:12.5px;color:var(--muted)">
        基于最近 ${n} 次成绩（四维 ${data.nEval} · 自由表达 ${data.nSpeech}）。<b>站内相对水平，非官方量表</b>；练得越多越准。
      </div>
      <div class="en" style="margin-top:4px;font-size:12.5px;color:var(--primary)">
        这一页是<b>能力证据</b>（说得怎么样），与「计划·打卡·手册」记的<b>坚持</b>（练了多少）是两回事——打卡天数不能代替它。
      </div>
    </div>`;
  }

  function emptyHtml() {
    return `
    <div class="card sp-empty">
      <div class="e-icon" style="font-size:40px">📡</div>
      <h3>还没有口语成绩</h3>
      <p>先从下面任意一项开始，练几轮后这里就能画出你的口语雷达：</p>
      <div class="rd-cta">
        <a class="btn btn-primary" href="#/eval4">🎯 四维口语实战（跟读+应答）</a>
        <a class="btn btn-outline" href="#/speech">🎙️ 自由表达分析（说一段）</a>
        <a class="btn btn-ghost" href="#/tutor">🤖 AI 陪练（场景对练）</a>
      </div>
    </div>`;
  }

  function bodyHtml(data) {
    const rk = rank(data.overall);
    const worst = data.dims.slice().sort(function (a, b) { return (a.val == null ? 101 : a.val) - (b.val == null ? 101 : b.val); })[0];
    return `
    <div class="rd-wrap">
      <div class="rd-left">
        <div class="card">
          <div class="rd-score">${data.overall == null ? "—" : data.overall}<span>/100</span></div>
          <div class="rd-rank ${rk ? rk.cls : ""}">${rk ? rk.ic + " " + rk.name : "未评定"}</div>
          <div class="rd-rank-desc">${rk ? esc(rk.desc) : (data.enough ? "先多练几次，就能评定你的口语段位。" : "样本不足（已 " + data.n + " / " + data.minSamples + " 次有效测评）——先多练几次再评段位，避免拿一次成绩当水平。")}</div>
          <div class="rd-disclaimer">⚠️ 本段位为<b>站内相对水平</b>（基于你在本站练过的成绩归一），不与官方 CEFR 口语量表对齐；样本少时会偏差，练得越多越真实。${data.enough ? "" : "<b>当前样本 " + data.n + " / " + data.minSamples + "，综合分与段位暂不给出。</b>"}</div>
          <canvas id="radarCanvas" width="560" height="420"></canvas>
          <div class="rd-actions">
            <button class="btn btn-primary btn-sm" data-radar="export">⬇️ 导出口语雷达图</button>
            <span class="rd-note" data-radar-note></span>
          </div>
        </div>
      </div>
      <div class="rd-right">
        <div class="card">
          <h3>五维明细</h3>
          <div class="rd-dims">
            ${data.dims.map(function (d) {
              return `
              <div class="rd-dim">
                <div class="rd-dim-head"><b>${esc(d.label)}</b><span>${d.val == null ? "未测" : Math.round(d.val) + "/100"}</span></div>
                <div class="progressbar" style="height:7px"><i class="${(d.val||0) >= 70 ? "full" : ""}" style="width:${Math.min(100, d.val || 0)}%"></i></div>
                <div class="rd-dim-meta">来源：${esc(d.from)} · ${esc(d.tip)}</div>
              </div>`;
            }).join("")}
          </div>
        </div>
        <div class="card">
          <h3>最该先补的：${esc(worst ? worst.label : "")}</h3>
          <p class="rd-advice">${esc(worst ? worst.tip : "先去四维/自由表达练一轮，这里才能给出更准的建议。")}</p>
          <a class="btn btn-outline btn-sm" href="${worst ? worst.href : "#/eval4"}">去练「${esc(worst ? worst.label : "四维")}」→</a>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- canvas 五维雷达 ---------------- */
  function drawRadar(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2 + 8;
    const R = Math.min(W, H) / 2 - 52;
    const dims = data.dims;
    const n = dims.length;
    ctx.clearRect(0, 0, W, H);
    const col = "#2563eb", colSoft = "rgba(37,99,235,.6)", line = "#e2e8f0", ink = "#1e293b", muted = "#64748b";

    function pt(i, r) {
      const ang = -Math.PI / 2 + i * (2 * Math.PI / n);
      return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
    }

    /* 网格环 ×5 */
    for (let lvl = 1; lvl <= 5; lvl++) {
      const r = R * lvl / 5;
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const p = pt(i, r); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.closePath();
      ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = muted; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(String(lvl * 20), cx + 4, cy - r - 4);
    }
    /* 轴线 */
    for (let i = 0; i < n; i++) { const p = pt(i, R); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p[0], p[1]); ctx.strokeStyle = line; ctx.stroke(); }
    /* 数据多边形 */
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, Math.min(100, dims[i].val == null ? 0 : dims[i].val));
      const p = pt(i, R * v / 100); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(37,99,235,.18)"; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.stroke();
    /* 数据点 + 标签 */
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, Math.min(100, dims[i].val == null ? 0 : dims[i].val));
      const p = pt(i, R * v / 100);
      ctx.beginPath(); ctx.arc(p[0], p[1], 3.4, 0, 2 * Math.PI); ctx.fillStyle = col; ctx.fill();
      const lp = pt(i, R + 24);
      ctx.fillStyle = ink; ctx.font = "700 12px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(dims[i].label, lp[0], lp[1]);
      ctx.fillStyle = muted; ctx.font = "11px sans-serif";
      ctx.fillText(dims[i].val == null ? "未测" : Math.round(dims[i].val), lp[0], lp[1] + 14);
    }
  }

  /* ---------------- 导出 PNG ---------------- */
  function exportPng(data) {
    const canvas = document.getElementById("radarCanvas");
    if (!canvas) return;
    const src = document.createElement("canvas");
    src.width = 700; src.height = 620;
    const c = src.getContext("2d");
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, src.width, src.height);
    c.strokeStyle = "#e2e8f0"; c.lineWidth = 2; c.strokeRect(0, 0, src.width, src.height);
    c.fillStyle = "#1e293b"; c.font = "800 24px 'Segoe UI','Microsoft YaHei',sans-serif"; c.textAlign = "center";
    c.fillText("📡 软包装外贸英语 · 口语水平雷达", src.width / 2, 44);
    const rk = rank(data.overall);
    c.font = "600 15px 'Segoe UI','Microsoft YaHei',sans-serif"; c.fillStyle = "#2563eb";
    c.fillText("段位：" + (rk ? rk.name : "未评定") + " · 综合评分：" + (data.overall == null ? "—" : data.overall + "/100"), src.width / 2, 74);
    /* 复用雷达绘制逻辑：临时把数据画到缩放后的中心区域 */
    c.save();
    c.translate((src.width - 560) / 2, 88);
    const tmp = document.createElement("canvas"); tmp.width = 560; tmp.height = 420;
    tmp.getContext("2d") && drawRadarToCtx(tmp.getContext("2d"), 560, 420, data);
    c.drawImage(tmp, 0, 0);
    c.restore();
    c.fillStyle = "#64748b"; c.font = "12px 'Segoe UI','Microsoft YaHei',sans-serif"; c.textAlign = "left";
    c.fillText("站内相对水平，非官方 CEFR 量表。四维 " + data.nEval + " 次 · 自由表达 " + data.nSpeech + " 次。", 28, 600);
    const url = src.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = "软包装外贸英语-口语雷达.png";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    const note = document.querySelector("[data-radar-note]"); if (note) note.textContent = "✅ 已导出 PNG";
    setTimeout(function () { if (note) note.textContent = ""; }, 2500);
  }
  function drawRadarToCtx(ctx, W, H, data) {
    const cx = W / 2, cy = H / 2 + 8, R = Math.min(W, H) / 2 - 52, dims = data.dims, n = dims.length;
    const col = "#2563eb", line = "#e2e8f0", ink = "#1e293b", muted = "#64748b";
    function pt(i, r) { const a = -Math.PI / 2 + i * (2 * Math.PI / n); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
    for (let l = 1; l <= 5; l++) { const r = R * l / 5; ctx.beginPath(); for (let i = 0; i < n; i++) { const p = pt(i, r); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.closePath(); ctx.strokeStyle = line; ctx.stroke(); }
    for (let i = 0; i < n; i++) { const p = pt(i, R); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p[0], p[1]); ctx.strokeStyle = line; ctx.stroke(); }
    ctx.beginPath(); for (let i = 0; i < n; i++) { const v = Math.max(0, Math.min(100, dims[i].val == null ? 0 : dims[i].val)); const p = pt(i, R * v / 100); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.closePath();
    ctx.fillStyle = "rgba(37,99,235,.18)"; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.stroke();
    for (let i = 0; i < n; i++) { const v = Math.max(0, Math.min(100, dims[i].val == null ? 0 : dims[i].val)); const p = pt(i, R * v / 100); ctx.beginPath(); ctx.arc(p[0], p[1], 3.4, 0, 2 * Math.PI); ctx.fillStyle = col; ctx.fill(); const lp = pt(i, R + 24); ctx.fillStyle = ink; ctx.font = "700 12px sans-serif"; ctx.textAlign = "center"; ctx.fillText(dims[i].label, lp[0], lp[1]); ctx.fillStyle = muted; ctx.font = "11px sans-serif"; ctx.fillText(dims[i].val == null ? "未测" : Math.round(dims[i].val), lp[0], lp[1] + 14); }
  }

  /* ---------------- 交互 ---------------- */
  function attach() {
    app.querySelectorAll("[data-radar]").forEach(function (b) {
      b.addEventListener("click", function () {
        const act = b.getAttribute("data-radar");
        if (act === "export") exportPng(compute(10));
      });
    });
  }
  // 在 render 后调用 attach
  const _origRender = render;
  render = function () { const r = _origRender(); attach(); return r; };

  window.SpeakingRadar = { render: render };
})();
