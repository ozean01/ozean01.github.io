/* ============ 测验引擎：四种题型生成器 ============ */
(function () {
  "use strict";

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* 编辑距离（Levenshtein），用于排除「长得太像」的干扰项，避免一眼排除 */
  function editDist(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  /* 同词性 + 同频段优先，其次同频段，再随机；避开与答案编辑距离过近的词。
     items 为 { label, pos, lvl }；答案本身不参与。 */
  function pickDistractors(items, answer, n) {
    const ans = items.find(function (it) { return it.label === answer; }) || { pos: "", lvl: "" };
    const seen = {};
    seen[answer] = true;
    const out = [];
    function rank(it) {
      const samePos = it.pos && ans.pos && it.pos.replace(/[^a-zA-Z]/g, "") === ans.pos.replace(/[^a-zA-Z]/g, "") ? 2 : 0;
      const sameLvl = it.lvl === ans.lvl ? 1 : 0;
      return samePos * 10 + sameLvl;
    }
    const cands = items.filter(function (it) {
      if (it.label === answer) return false;
      if (editDist(it.label, answer) <= 1) return false;
      return true;
    });
    /* 先按相似度分层，层内再随机，取前 n */
    const byRank = {};
    cands.forEach(function (it) {
      const r = rank(it);
      (byRank[r] || (byRank[r] = [])).push(it);
    });
    const sortedKeys = Object.keys(byRank).map(Number).sort(function (a, b) { return b - a; });
    for (let k = 0; k < sortedKeys.length && out.length < n; k++) {
      const layer = shuffle(byRank[sortedKeys[k]]);
      for (let i = 0; i < layer.length && out.length < n; i++) {
        const it = layer[i];
        if (!seen[it.label]) { seen[it.label] = true; out.push(it.label); }
      }
    }
    return out;
  }

  const Quiz = {
    TYPES: [
      { id: "en2cn", label: "英译中" },
      { id: "cn2en", label: "中译英" },
      { id: "listening", label: "听句选义" },
      { id: "fill", label: "选词填空" },
      { id: "reorder", label: "句块重排" },
      { id: "write", label: "✍️ 写作产出（词级批改，可 AI 润色）" }
    ],

    /* units: 数组；opts: { count, types: [..] }
       pos 与 lvl 来自数据条目（lvl 由 js/lvl-map.js 提供词频难度） */
    build: function (units, opts) {
      const pool = [];
      const LVL = window.FTE_LVL || {};
      units.forEach(function (u) {
        u.vocab.forEach(function (v, i) {
          pool.push({
            w: v.w, cn: v.cn, ipa: v.ipa, ex: v.ex, exCn: v.exCn,
            uid: u.id, wid: u.id + "-" + i,
            pos: v.pos || "n.",
            lvl: LVL[String(v.w).toLowerCase()] || ""
          });
        });
      });
      if (pool.length === 0) return [];

      const types = (opts.types && opts.types.length) ? opts.types : ["en2cn", "cn2en"];
      const count = Math.min(opts.count || 10, pool.length * 3);
      const questions = [];
      let ti = 0;
      let guard = 0;
      while (questions.length < count && guard < count * 60) {
        guard++;
        const type = types[ti % types.length];
        ti++;
        const v = pool[Math.floor(Math.random() * pool.length)];
        let q = null;

        if (type === "en2cn") {
          const dist = pickDistractors(pool.map(function (p) { return { label: p.cn, pos: p.pos, lvl: p.lvl }; }), v.cn, 3);
          q = {
            type: "en2cn",
            typeLabel: "英译中 · 选出正确的中文意思",
            prompt: v.w,
            sub: v.ipa,
            options: shuffle([v.cn].concat(dist)),
            answer: v.cn,
            explain: v.w + " " + v.ipa + " — " + v.cn + "\n例：" + v.ex + "\n" + v.exCn
          };
        } else if (type === "cn2en") {
          const dist = pickDistractors(pool.map(function (p) { return { label: p.w, pos: p.pos, lvl: p.lvl }; }), v.w, 3);
          q = {
            type: "cn2en",
            typeLabel: "中译英 · 选出正确的英文",
            prompt: v.cn,
            sub: "词性对照：见解释",
            options: shuffle([v.w].concat(dist)),
            answer: v.w,
            explain: v.w + " " + v.ipa + " — " + v.cn
          };
        } else if (type === "listening") {
          const dist = pickDistractors(pool.map(function (p) { return { label: p.exCn, pos: p.pos, lvl: p.lvl }; }), v.exCn, 3);
          q = {
            type: "listening",
            typeLabel: "听句选义 · 点击播放后选择意思",
            prompt: v.ex,
            sub: "🔊 点上方喇叭可重听",
            listenText: v.ex,
            options: shuffle([v.exCn].concat(dist)),
            answer: v.exCn,
            explain: v.ex + "\n" + v.exCn
          };
        } else if (type === "fill") {
          const lowerEx = v.ex.toLowerCase();
          const lowerW = v.w.toLowerCase();
          if (lowerEx.indexOf(lowerW) !== -1) {
            const blanked = v.ex.replace(new RegExp("\\b" + v.w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"), "______");
            const dist = pickDistractors(pool.map(function (p) { return { label: p.w, pos: p.pos, lvl: p.lvl }; }), v.w, 3);
            q = {
              type: "fill",
              typeLabel: "选词填空 · 选出最合适的单词",
              prompt: blanked,
              sub: v.exCn,
              options: shuffle([v.w].concat(dist)),
              answer: v.w,
              explain: v.w + " " + v.ipa + " — " + v.cn + "\n" + v.ex + "\n" + v.exCn
            };
          } else {
            // 例句不含该词则跳过 fill（不退回复用同类型，避免短句/短语根本不匹配时卡死在 fill）
            continue;
          }
        } else if (type === "reorder") {
          /* 句块重排：把一句切成语块并打乱，学习者按正确语序拼回（练语序+句型 chunk） */
          const sp = window.SentenceParser && window.SentenceParser.chunks(v.ex);
          if (!sp || sp.blocks.length < 2) continue;
          q = {
            type: "reorder",
            typeLabel: "句块重排 · 按正确语序点选拼回整句（先看中文义）",
            prompt: v.exCn,
            sub: v.w + " " + v.ipa,
            chunks: sp.blocks,      // 已打乱，每块带原始位 o
            answer: v.ex,
            explain: v.ex + "\n" + v.exCn
          };
        } else if (type === "write") {
          /* 写作产出：看中文义 → 学习者自己写英文（自由文本），提交后按词级比对给反馈。
             复用已有例句（ex/exCn），完全离线、零构建；可选后再用 LLM 润色批改。 */
          q = {
            type: "write",
            typeLabel: "✍️ 写作产出 · 看中文写英文（自由输入）",
            prompt: v.exCn,          // 中文义 → 用户写英文
            sub: "本句用到「" + v.cn + "」。请用英语写出来（一句即可），点提交看词级批改。",
            answer: v.ex,            // 目标英文（参考）
            explain: v.ex + "\n" + v.exCn,
            wid: v.wid, kw: v.w, kcn: v.cn
          };
        }
        if (q && (q.type === "reorder" || q.type === "write" ? true : q.options.length === 4)) { if (!q.wid) q.wid = v.wid; questions.push(q); }
      }
      return questions;
    }
  };

  window.Quiz = Quiz;
})();
