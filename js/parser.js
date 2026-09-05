/* ============ 句块切分器（P1-4 · 句块重排 / chunking）============
   window.SentenceParser.chunks(sentence)：
   把一句英文按词序切成 2–4 个语义连贯块（保持块内原词序），
   再打乱块的呈现顺序（保证与原文不同），返回 [{ t: 块文本, o: 原始位 }]。
   用途：让学习者按正确语序把打乱的语块拼回整句——练「语序 + 句型 chunk」，
   而非孤立单词。例句来自课程词汇的上下文，天然复现真实业务表达。
   ============================================ */
(function () {
  "use strict";

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function isSorted(idx) { return idx.every(function (v, i) { return v === i; }); }

  /* 返回打乱的块列表；无法切（太短）返回 null */
  function chunks(sentence) {
    const words = String(sentence || "").trim().split(/\s+/).filter(Boolean);
    if (words.length < 3) return null;
    /* 块数随句长：短句 2–3 块，长句 4 块 */
    const n = words.length >= 9 ? 4 : (words.length >= 6 ? 3 : 2);
    const blocks = [];
    const per = Math.ceil(words.length / n);
    for (let i = 0; i < words.length; i += per) {
      blocks.push(words.slice(i, i + per).join(" "));
    }
    if (blocks.length < 2) return null;

    /* 打乱块序：至少洗一次且不落入原序（避免直接按序点全对） */
    let idx = blocks.map(function (_, i) { return i; });
    let guard = 0;
    do { shuffle(idx); guard++; } while (isSorted(idx) && guard < 20);
    if (isSorted(idx)) return null;   // 极少数洗不回原序，放弃该句（重新抽词）

    const shuffled = idx.map(function (oi) { return { t: blocks[oi], o: oi }; });
    return { blocks: shuffled };
  }

  window.SentenceParser = { chunks: chunks };
})();
