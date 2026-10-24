/* ============ 🎙 声学反馈 · 音高曲线与停顿统计（Acoustic）============
   为什么要有这个模块（P0-1，2026-10-24 评估结论）：
     全站跟读反馈此前只有「逐词命中（ASR 比对）+ 出声时长启发式」，语调/停顿这些
     「说得像不像」的核心信号一个都没测。而跟读录音本身（blob → decodeAudioData）
     就是最现成的原材料——不需要任何 API、任何模型，纯前端 DSP 就能测。

   数据来源与口径（诚实边界，不可越界）：
     ① 只分析**用户自己的录音**。TTS 原声（speechSynthesis）不给页面音频流，
        无法采集对照曲线——所以本模块**不做**「你的音高 vs 原声音高」的自动对比，
        用户以 🔁 A/B 回听 + 本曲线自查。不要发明假的对照曲线。
     ② 音高检测是**基频（F0）估计**，不是音素判分；识别≠发音，曲线≠教学结论，
        输出一律用「约 / 偏 / 试试」措辞（describe）。
     ③ 超长录音只分析前 MAX_SEC 秒并在结果里如实标注（capped）。

   导出（window.Acoustic，纯函数，Node 可测）：
     analyzePcm(pcm, sr)          一站式：{ ok, f0, rms, hopSec, durationSec, capped,
                                              voicedRatio, pitch:{...}, silence:{...} }
     f0Contour(pcm, sr)           自相关基频：{ f0, rms, hopSec }（0 = 未成嗓/静音帧）
     silenceProfile(rms, hopSec)  停顿统计：{ pauses, count, totalSec, longestSec, speechSec }
     pitchStats(f0)               { medianHz, rangeSemitones, tail, tailDeltaSemitones }
     describe(an)                 给用户的一句话解读（UI 直接可用的中文文案）
     drawPitchCurve(canvas, an)   画音高曲线（仅浏览器调用）

   实现口径：
     · 8kHz 重采样后做帧分析：窗 40ms、跳 10ms——人声基频范围 60–400Hz 足够。
     · 帧成嗓判定：RMS 超过自适应阈值 且 自相关峰值清晰度 ≥ CLARITY_MIN。
     · 八度错误防护：优先更短的滞后（更高的 F0），当清晰度接近时（≥0.9×）。
     · 停顿 = 无声段 ≥ PAUSE_MIN_SEC；成嗓占比、最长停顿都来自同一阈值口径。 */
(function () {
  "use strict";

  const SR_TARGET = 8000;        /* 分析采样率（Hz） */
  const WIN_SEC = 0.04;          /* 帧窗 40ms */
  const HOP_SEC = 0.01;          /* 帧跳 10ms */
  const F0_MIN = 60, F0_MAX = 400;
  const CLARITY_MIN = 0.35;      /* 自相关峰清晰度下限（低于此判未成嗓） */
  const MAX_SEC = 30;            /* 分析时长上限 */
  const PAUSE_MIN_SEC = 0.4;     /* 短于它的无声只算节奏，不算停顿 */
  const RANGE_LEVELS = [4, 9];   /* 半音：<4 平直 · 4-9 适中 · >9 起伏大 */

  /* ---- 重采样（简单抽取 + 3 点平均低通；对 F0 检测足够，别名失真可忽略） ---- */
  function decimate(pcm, sr) {
    const factor = Math.max(1, Math.floor(sr / SR_TARGET));
    if (factor <= 1) return { pcm: pcm, sr: sr };
    const n = Math.floor(pcm.length / factor);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const base = i * factor;
      for (let k = 0; k < factor; k++) s += pcm[base + k] || 0;
      out[i] = s / factor;
    }
    return { pcm: out, sr: sr / factor };
  }

  /* ---- 一帧的归一化自相关，返回 { lag, clarity }；未成嗓返回 clarity=0 ---- */
  function framePitch(frame, sr) {
    const minLag = Math.floor(sr / F0_MAX);
    const maxLag = Math.min(Math.floor(sr / F0_MIN), frame.length - 1);
    let r0 = 0;
    for (let i = 0; i < frame.length; i++) r0 += frame[i] * frame[i];
    if (r0 < 1e-7) return { lag: 0, clarity: 0 };
    let bestLag = 0, bestClarity = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i + lag < frame.length; i++) r += frame[i] * frame[i + lag];
      const clarity = r / r0;
      if (clarity > bestClarity) { bestClarity = clarity; bestLag = lag; }
    }
    if (bestClarity < CLARITY_MIN || !bestLag) return { lag: 0, clarity: 0 };
    /* 八度错误防护：真周期常被误认成 2 倍——更短滞后清晰度接近时优先取更短（更高 F0） */
    for (let d = 2; d <= 3; d++) {
      const L = Math.round(bestLag / d);
      if (L < minLag) continue;
      let r = 0;
      for (let i = 0; i + L < frame.length; i++) r += frame[i] * frame[i + L];
      if (r / r0 >= bestClarity * 0.9) { bestLag = L; break; }
    }
    return { lag: bestLag, clarity: bestClarity };
  }

  /* ---- 基频轮廓 ---- */
  function f0Contour(pcm, sr) {
    const d = decimate(pcm, sr);
    const x = d.pcm, srr = d.sr;
    const win = Math.round(WIN_SEC * srr);
    const hop = Math.round(HOP_SEC * srr);
    const nFrames = x.length >= win ? Math.floor((x.length - win) / hop) + 1 : 0;
    const f0 = new Float32Array(nFrames);
    const rms = new Float32Array(nFrames);
    /* 自适应成嗓阈值：max(固定下限, 全局 p95 的 8%)——安静的房间不至于把呼吸当嗓音。
       在降采样后的样本上取 p95（全采样率排序太贵），帧内 RMS 与它同口径。 */
    const abs = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) abs[i] = Math.abs(x[i]);
    const sorted = Array.prototype.slice.call(abs).sort(function (a, b) { return a - b; });
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    const voiceThr = Math.max(0.012, p95 * 0.08);
    for (let f = 0; f < nFrames; f++) {
      const off = f * hop;
      let sum = 0;
      for (let i = 0; i < win; i++) sum += x[off + i] * x[off + i];
      const frameRms = Math.sqrt(sum / win);
      rms[f] = frameRms;
      if (frameRms < voiceThr) continue;
      const frame = x.subarray(off, off + win);
      const p = framePitch(frame, srr);
      if (p.clarity >= CLARITY_MIN && p.lag > 0) f0[f] = srr / p.lag;
    }
    return { f0: f0, rms: rms, hopSec: HOP_SEC, voiceThr: voiceThr };
  }

  /* ---- 停顿统计（同一成嗓阈值口径；"停顿" = 无声 ≥ PAUSE_MIN_SEC） ---- */
  function silenceProfile(rms, hopSec, voiceThr) {
    const thr = voiceThr != null ? voiceThr : Math.max(0.012, p95Of(rms) * 0.08);
    const pauses = [];
    let runStart = -1;
    let totalSilentSec = 0;
    for (let i = 0; i < rms.length; i++) {
      const silent = rms[i] < thr;
      if (silent) {
        totalSilentSec += hopSec;
        if (runStart < 0) runStart = i;
      } else if (runStart >= 0) {
        const sec = (i - runStart) * hopSec;
        if (sec >= PAUSE_MIN_SEC) pauses.push({ start: runStart * hopSec, end: i * hopSec, sec: sec });
        runStart = -1;
      }
    }
    if (runStart >= 0) {
      const sec = (rms.length - runStart) * hopSec;
      if (sec >= PAUSE_MIN_SEC) pauses.push({ start: runStart * hopSec, end: rms.length * hopSec, sec: sec });
    }
    let longest = 0;
    for (let i = 0; i < pauses.length; i++) longest = Math.max(longest, pauses[i].sec);
    const durationSec = rms.length * hopSec;
    return {
      pauses: pauses, count: pauses.length,
      totalSec: Math.round(totalSilentSec * 10) / 10,
      longestSec: Math.round(longest * 10) / 10,
      speechSec: Math.round((durationSec - totalSilentSec) * 10) / 10,
      durationSec: Math.round(durationSec * 10) / 10
    };
  }
  function p95Of(rms) {
    const s = Array.prototype.slice.call(rms).sort(function (a, b) { return a - b; });
    return s.length ? s[Math.floor(s.length * 0.95)] : 0;
  }

  /* ---- 音高统计：中位、p10-p90 半音跨度、句尾走势 ---- */
  function pitchStats(f0) {
    const v = [];
    for (let i = 0; i < f0.length; i++) if (f0[i] > 0) v.push(f0[i]);
    if (v.length < 5) return null;
    v.sort(function (a, b) { return a - b; });
    const q = function (p) { return v[Math.min(v.length - 1, Math.floor(v.length * p))]; };
    const medianHz = q(0.5), p10 = q(0.1), p90 = q(0.9);
    const rangeSemitones = p10 > 0 ? 12 * Math.log2(p90 / p10) : 0;
    /* 句尾走势：末 25% 成嗓帧的中位 vs 中段 50% 的中位（差 <1.5 半音算平稳） */
    const mid = v.slice(Math.floor(v.length * 0.3), Math.ceil(v.length * 0.7));
    const midMed = mid.length ? mid[Math.floor(mid.length / 2)] : medianHz;
    const tailV = [];
    for (let i = Math.floor(f0.length * 0.75); i < f0.length; i++) if (f0[i] > 0) tailV.push(f0[i]);
    let tail = "level", tailDelta = 0;
    if (tailV.length >= 3) {
      tailV.sort(function (a, b) { return a - b; });
      const tailMed = tailV[Math.floor(tailV.length / 2)];
      tailDelta = midMed > 0 ? 12 * Math.log2(tailMed / midMed) : 0;
      if (tailDelta <= -1.5) tail = "fall";
      else if (tailDelta >= 1.5) tail = "rise";
    }
    return { medianHz: Math.round(medianHz), rangeSemitones: Math.round(rangeSemitones * 10) / 10, tail: tail, tailDeltaSemitones: Math.round(tailDelta * 10) / 10 };
  }

  /* ---- 一站式分析 ---- */
  function analyzePcm(pcm, sr) {
    if (!pcm || !(sr > 0) || pcm.length < sr * 0.3) {
      return { ok: false, reason: "too-short" };
    }
    let x = pcm, srr = sr, capped = false;
    const maxLen = MAX_SEC * sr;
    if (pcm.length > maxLen) { x = pcm.subarray(0, maxLen); capped = true; }
    const c = f0Contour(x, srr);
    const silence = silenceProfile(c.rms, c.hopSec, c.voiceThr);
    const pitch = pitchStats(c.f0);
    let voiced = 0;
    let onsetSec = null;   /* 开口延迟：录音开始 → 首次成嗓帧（P2-11 影子跟读节奏反馈） */
    for (let i = 0; i < c.f0.length; i++) {
      if (c.f0[i] > 0) { voiced++; if (onsetSec == null) onsetSec = Math.round(i * c.hopSec * 100) / 100; }
    }
    return {
      ok: true, capped: capped,
      f0: c.f0, rms: c.rms, hopSec: c.hopSec,
      durationSec: silence.durationSec,
      voicedRatio: c.f0.length ? Math.round(voiced / c.f0.length * 100) / 100 : 0,
      onsetSec: onsetSec,
      pitch: pitch, silence: silence
    };
  }

  /* ---- 用户可读的一句话解读（全部是「约/偏/试试」措辞，不做权威判定） ---- */
  function describe(an) {
    if (!an || !an.ok || !an.pitch) return "";
    const p = an.pitch, s = an.silence;
    const rangeTxt = p.rangeSemitones < RANGE_LEVELS[0]
      ? "语调偏平——试试把关键词（报价、交期、数量）读出高低差"
      : p.rangeSemitones > RANGE_LEVELS[1] ? "起伏偏大——商务场合可稍微收一点，别让重音盖过内容"
      : "起伏适中";
    const tailTxt = p.tail === "fall" ? "下降 ↘（陈述/收尾的常态）"
      : p.tail === "rise" ? "上升 ↗（像在提问或留余地——若不是一般疑问句，可以收平一点）"
      : "平稳";
    const pauseTxt = s.count === 0 ? "没有 ≥" + PAUSE_MIN_SEC + "s 的停顿——很连贯"
      : s.count <= 2 ? "停顿 " + s.count + " 处共 " + s.totalSec + "s（最长 " + s.longestSec + "s）"
      : "停顿偏多：" + s.count + " 处共 " + s.totalSec + "s（最长 " + s.longestSec + "s）——先按意群连顺再整句读";
    return "音高范围约 " + p.rangeSemitones + " 个半音（" + rangeTxt + "）· 句尾走势 " + tailTxt + " · " + pauseTxt;
  }

  /* ---- 画音高曲线：纵轴对数刻度（60-400Hz），灰带 = 停顿，蓝线 = 成嗓帧 ---- */
  function drawPitchCurve(canvas, an, opts) {
    const g = canvas.getContext && canvas.getContext("2d");
    if (!g || !an || !an.ok) return false;
    const W = canvas.width, H = canvas.height;
    const o = opts || {};
    const lineColor = o.lineColor || "#2563eb";
    const pauseColor = o.pauseColor || "rgba(148,163,184,0.35)";
    g.clearRect(0, 0, W, H);
    const dur = an.durationSec || 1;
    const yOf = function (hz) {
      const t = (Math.log2(hz) - Math.log2(F0_MIN)) / (Math.log2(F0_MAX) - Math.log2(F0_MIN));
      return H - 6 - t * (H - 12);
    };
    /* 参考线 100/200 Hz */
    g.strokeStyle = "rgba(100,116,139,0.25)";
    g.lineWidth = 1;
    [100, 200].forEach(function (hz) {
      const y = Math.round(yOf(hz)) + 0.5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    });
    /* 停顿灰带 */
    g.fillStyle = pauseColor;
    for (let i = 0; i < an.silence.pauses.length; i++) {
      const p = an.silence.pauses[i];
      const x0 = p.start / dur * W, x1 = p.end / dur * W;
      g.fillRect(x0, 0, Math.max(1, x1 - x0), H);
    }
    /* 音高曲线（成嗓帧连线；跨过未成嗓帧则断开） */
    g.strokeStyle = lineColor;
    g.lineWidth = 2;
    g.beginPath();
    let pen = false;
    for (let i = 0; i < an.f0.length; i++) {
      const hz = an.f0[i];
      const x = (i * an.hopSec) / dur * W;
      if (hz > 0) {
        const y = yOf(hz);
        if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
      } else { pen = false; }
    }
    g.stroke();
    return true;
  }

  window.Acoustic = {
    analyzePcm: analyzePcm,
    f0Contour: f0Contour,
    silenceProfile: silenceProfile,
    pitchStats: pitchStats,
    describe: describe,
    drawPitchCurve: drawPitchCurve
  };

  /* 供自动化测试使用。放在文件末尾：本文件内 const 在前，避免 TDZ。 */
  window.Acoustic._t = {
    decimate: decimate, framePitch: framePitch,
    SR_TARGET: SR_TARGET, PAUSE_MIN_SEC: PAUSE_MIN_SEC,
    F0_MIN: F0_MIN, F0_MAX: F0_MAX, MAX_SEC: MAX_SEC, CLARITY_MIN: CLARITY_MIN
  };
})();
