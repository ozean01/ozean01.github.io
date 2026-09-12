/* ============ 🎯 跟读评分 · 全站唯一实现（SpeechScore）============
   为什么单独抽成一个模块（SLA 专家评审）：
     句子级跟读评分原先**存在重复实现**——app.js 有一份，patterns.js 又抄了一份。
     根因是加载顺序：patterns.js（#33）**先于** app.js（#37）加载，所以它当时拿不到
     window.ASRUtil，只能自己复制一套。两份实现还悄悄产生了行为差异：
       · app.js 版 wordSimilar 不做大小写处理（依赖调用方先 norm）
       · patterns.js 版内部 toLowerCase()
     同一个用户在「跟读评测」与「句型克隆库」里写同一个词，可能得到不同的判定。

   本模块把评分口径收敛到一处，并**前置加载**（index.html 里放在 parser.js 之后、
   所有使用方之前），任何模块都能直接用，不必再抄。

   导出（window.SpeechScore）：
     norm(s)                     文本归一化（小写、去标点、折叠空白）——全站搜索/比对同口径
     wordSimilar(a, b)           词相似度 0..1（Levenshtein 归一）
     evaluateSpeech(target, asr) 逐词对齐评分，返回 { acc, precise, matched, transcript, missed, extra }
     EXACT_THRESHOLD / NEAR_THRESHOLD  判定阈值（命名后便于测试与解释）

   评分口径（全站统一，写在文档里以免后人再发明一套）：
     · 精确命中（相似度 ≥ 0.99）计 1 分
     · 近似 / 错拼（相似度 ≥ 0.45）计 0.5 分，并在结果里标出「你读的其实是 x」
     · 漏读 / 多读不计分，但单独计数，用于练习建议
     · acc = 加权总分 ÷ 目标词数；precise = 精确命中 ÷ 目标词数
   ⚠️ 本分为**语音识别转写后的比对参考分**，不是发音的声学评分（识别会把口音与术语读错）。
      要更权威的发音分需用 Azure 音素级评测。 */
(function () {
  "use strict";

  /* ---------------- 归一化 ---------------- */
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  /* 词相似度：1 - 编辑距离/较长者长度。完全相同直接返回 1（也避开空串边界）。*/
  const EXACT_THRESHOLD = 0.99;
  const NEAR_THRESHOLD = 0.45;

  function wordSimilar(a, b) {
    const A = norm(a), B = norm(b);
    /* 与原实现严格一致：完全相等即返回 1（含两个空串的情形）。
       注意这里刻意**不**改成「空串返回 0」——统一实现不应顺手改变行为；
       若要改语义，应作为一次有独立理由的变更，并单独评估调用方。 */
    if (A === B) return 1;
    const m = A.length, n = B.length;
    if (m === 0 || n === 0) return 0;
    /* 滚动数组：原实现用 m×n 二维表，长句逐词比对时代价偏大，这里降到 O(n) 空间 */
    let prev = new Array(n + 1);
    let cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1)
        );
      }
      const t = prev; prev = cur; cur = t;
    }
    return 1 - prev[n] / Math.max(m, n);
  }

  /* ---------------- 逐词对齐评分 ----------------
     贪心最优匹配：对每个目标词，在尚未占用的转写词里找相似度最高的一个。
     返回结构供 UI 逐词着色（ok / near / miss）与练习建议使用。 */
  function evaluateSpeech(target, transcript) {
    const tWords = norm(target).split(" ").filter(Boolean);
    const sWords = norm(transcript || "").split(" ").filter(Boolean);
    const matched = [];
    const used = new Array(sWords.length).fill(false);
    let missCount = 0;

    tWords.forEach(function (tw) {
      let best = -1, bestSim = 0;
      for (let k = 0; k < sWords.length; k++) {
        if (used[k]) continue;
        const sim = wordSimilar(tw, sWords[k]);
        if (sim > bestSim) { bestSim = sim; best = k; }
      }
      if (best >= 0 && bestSim >= EXACT_THRESHOLD) {
        used[best] = true; matched.push({ w: tw, ok: true, near: false, errType: "ok" });
      } else if (best >= 0 && bestSim >= NEAR_THRESHOLD) {
        used[best] = true; matched.push({ w: tw, ok: true, near: true, errType: "near", said: sWords[best] });
      } else {
        matched.push({ w: tw, ok: false, near: false, errType: "miss" }); missCount++;
      }
    });
    const extraCount = sWords.filter(function (_, i) { return !used[i]; }).length;

    const precise = tWords.length
      ? Math.round(matched.filter(function (m) { return m.errType === "ok"; }).length / tWords.length * 100)
      : 0;
    /* 加权分：精确 = 1，近似 = 0.5 */
    const weighted = tWords.length
      ? Math.round(matched.reduce(function (a, m) {
        return a + (m.errType === "ok" ? 1 : m.errType === "near" ? 0.5 : 0);
      }, 0) / tWords.length * 100)
      : 0;

    return {
      acc: weighted,
      precise: precise,
      matched: matched,
      transcript: transcript || "",
      missed: missCount,
      extra: extraCount
    };
  }

  window.SpeechScore = {
    norm: norm,
    wordSimilar: wordSimilar,
    evaluateSpeech: evaluateSpeech,
    EXACT_THRESHOLD: EXACT_THRESHOLD,
    NEAR_THRESHOLD: NEAR_THRESHOLD
  };

  /* 供自动化测试使用。放在文件末尾：本文件内 const 在前，避免 TDZ。 */
  window.SpeechScore._t = {
    norm: norm, wordSimilar: wordSimilar, evaluateSpeech: evaluateSpeech,
    EXACT_THRESHOLD: EXACT_THRESHOLD, NEAR_THRESHOLD: NEAR_THRESHOLD
  };
})();
