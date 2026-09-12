/* ============ 单词卡引擎：FSRS-6 间隔重复调度（自实现，算法逐项对齐官方 ts-fsrs）============
   参考：open-spaced-repetition/ts-fsrs 的 packages/fsrs/src/algorithm.ts 与 constant.ts
   （MIT）。默认参数与公式逐行移植；关闭 fuzz 与短时步骤（本应用按天复习），
   并保持对 app.js 的既有接口兼容（grade / buildQueue / isLearned / stateOf / wrongCount）。

   每张卡记录（FSRS 字段）：
     stability 稳定度（R=90% 时的间隔，天）
     difficulty 难度 [1,10]
     due        下次到期时间戳
     last       上次复习时间戳
     reps       累计复习次数（供 UI）
     rating     最近一次评分（1 again / 3 good）
     retv       最近一次可回忆度 R（0.9x）
   （保留 ef/interval 派生字段，供旧 UI 的「牢固/易遗忘」标签与导出用）
 */
(function () {
  "use strict";

  var EF_START = 2.5;
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function round(v) { return Math.round(v * 1e8) / 1e8; }
  function isNaN(v) { return typeof v === "number" && Number.isNaN(v); }

  /* ---- FSRS-6 默认参数（constant.ts default_w；decay = w[20] = 0.1542）---- */
  var W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001,
    1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
    1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
  var REQUEST_RETENTION = 0.9;
  var MAX_INTERVAL = 36500;
  var S_MIN = 0.001, S_MAX = 36500.0;
  var ENABLE_SHORT_TERM = false;   // 按天复习，关闭短时步骤
  var RATING = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

  var DECAY = -W[20];
  var FACTOR = round(Math.exp(Math.log(0.9) / DECAY) - 1.0);
  var INTERVAL_MODIFIER = round((Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1) / FACTOR);

  function initDifficulty(g) { return round(W[4] - Math.exp((g - 1) * W[5]) + 1); }
  function initStability(g) { return Math.max(W[g - 1], 0.1); }
  function linearDamping(delta, oldD) { return round((delta * (10 - oldD)) / 9); }
  function meanReversion(init, cur) { return round(W[7] * init + (1 - W[7]) * cur); }
  function nextDifficulty(d, g) {
    var deltaD = -W[6] * (g - 3);
    var nextD = d + linearDamping(deltaD, d);
    return clamp(meanReversion(initDifficulty(RATING.EASY), nextD), 1, 10);
  }
  function nextRecallStability(d, s, r, g) {
    var hardPenalty = RATING.HARD === g ? W[15] : 1;
    var easyBound = RATING.EASY === g ? W[16] : 1;
    return round(clamp(
      s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hardPenalty * easyBound),
      S_MIN, S_MAX));
  }
  function nextForgetStability(d, s, r) {
    var nf = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]);
    return round(clamp(nf, S_MIN, ENABLE_SHORT_TERM ? s / Math.exp(W[17] * W[18]) : s));
  }
  /* 遗忘曲线：R(t,S) = (1 + FACTOR·t/S)^DECAY */
  function curve(t, s) { return round(Math.pow(1 + (FACTOR * t) / Math.max(s, S_MIN), DECAY)); }
  function nextInterval(s) {
    return clamp(Math.round(Math.max(1, s * INTERVAL_MODIFIER)), 1, MAX_INTERVAL);
  }

  /* 由兼容字段（reps/ef/interval/due/last）迁移出 FSRS 状态的初值 */
  function migrateState(f) {
    if (f && f.stability != null) return { difficulty: (f.difficulty || 5), stability: f.stability };
    var interval = (f && f.interval) || 0;
    var ef = (f && f.ef) || EF_START;
    var difficulty = clamp(11 - ef, 1, 10);      // 旧 ef 2.5 → 难度 8.5；越大越难
    var stability = interval > 0 ? interval / INTERVAL_MODIFIER : 0.1;
    return { difficulty: round(difficulty), stability: round(Math.max(S_MIN, stability)) };
  }

  var Flashcards = {
    EF_START: EF_START,
    BOX_DAYS: [0, 1, 2, 4, 7, 15],
    PARAMS: W.slice(),

    /* 用 FSRS 计算下一次复习。rating=1..4 → AGAIN/HARD/GOOD/EASY。
       旧调用可用布尔（true→Good/3，false→Again/1）。
       legacy 卡（无 stability 字段）先按 interval/ef 估出状态，再进 FSRS。 */
    /* grade(progress, id, rating)：接收四档评分。
       1=忘了(AGAIN) 2=模糊(HARD) 3=认识(GOOD) 4=秒答(EASY)。
       兼容旧二档布尔调用（true→GOOD, false→AGAIN）。 */
    grade: function (progress, id, rating, storeKey) {
      var store = Flashcards.storeOf(progress, storeKey);
      var now = Date.now();
      var cur = migrate(store[id]);
      /* 评分归一化 */
      var g;
      if (typeof rating === "boolean") g = rating ? RATING.GOOD : RATING.AGAIN;
      else if (rating === 2) g = RATING.HARD;
      else if (rating === 4) g = RATING.EASY;
      else if (rating === 1) g = RATING.AGAIN;
      else g = RATING.GOOD;
      /* 兼容旧派生字段 quality：认识(3/4)→5，遗忘/模糊(1/2)→2 */
      var known = g >= RATING.GOOD;
      var state = migrateState(cur);
      var isNew = !cur || !cur.interval;   // 未复习过：用初始状态
      var t, r;
      if (isNew) {
        state = { difficulty: clamp(initDifficulty(g), 1, 10), stability: initStability(g) };
        t = 0; r = null;
      } else {
        t = Math.max(0, (now - (cur.last || now)) / 86400000);
        r = curve(t, state.stability);
        var ns = g === RATING.AGAIN
          ? nextForgetStability(state.difficulty, state.stability, r)
          : nextRecallStability(state.difficulty, state.stability, r, g);
        state = { difficulty: nextDifficulty(state.difficulty, g), stability: ns };
      }
      var interval = nextInterval(state.stability);
      var reps = (cur.reps || 0) + 1;
      var ef = clamp(2.5 - (state.difficulty - 3) * 0.25, 1.3, 3.0);   // 派生，供旧标签用
      store[id] = {
        stability: round(state.stability),
        difficulty: round(state.difficulty),
        reps: reps,
        ef: round(ef),
        interval: interval,
        due: now + interval * 86400000,
        last: now,
        rating: g,
        retv: r == null ? null : round(r),
        quality: known ? 5 : 2
      };
      return store[id];
    },

    /* 当前某卡的遗忘曲线可回忆度 R（0~1）；未学返回 null */
    retentionOf: function (f, now) {
      f = migrate(f);
      if (!f || !f.interval) return null;
      var t = Math.max(0, (now - (f.last || now)) / 86400000);
      var st = (f.stability || (f.interval / INTERVAL_MODIFIER));
      return curve(t, st);
    },

    /* ---------------- 存储位置参数化：一条调度 vs 两条调度 ----------------
       storeKey 决定记忆状态存在 progress 的哪个字段：
         "flash"     （默认）接受性：看到英文 → 想起中文
         "flashProd"        产出性：看到中文 → 说出英文
       SLA 专家评审指出：「FSRS 只调度**接受性**词汇，无**产出性**调度」——
       于是出现「认得 film 但说不出 film」的典型状态。两层知识必须分开排期：
       一个词可以在接受线上已牢固，在产出线上仍是新词，复习间隔自然不同。
       这里只把「存在哪」参数化，**调度算法本身完全共用**（同一套 FSRS-6）。 */
    storeOf: function (progress, storeKey) {
      var k = storeKey || "flash";
      if (!progress[k]) progress[k] = {};
      return progress[k];
    },

    /* 全部到期卡 + 新词排序（保持原语义）。maxNew 控制一次最多引入的新卡数，默认 15 */
    buildQueue: function (cards, progress, limit, maxNew, storeKey) {
      var store = Flashcards.storeOf(progress, storeKey);
      limit = limit || 30;
      maxNew = maxNew == null ? 15 : maxNew;
      var now = Date.now();
      var wrong = progress.wrong || {};
      var fresh = [], due = [];
      cards.forEach(function (c) {
        var f = migrate(store[c.id]);
        if (!f || f.reps === 0) fresh.push(c);
        else if (f.due <= now) due.push(c);
      });
      due.sort(function (a, b) {
        var fa = migrate(store[a.id]), fb = migrate(store[b.id]);
        var oa = now - (fa.due || 0), ob = now - (fb.due || 0);
        if (oa !== ob) return ob - oa;
        var wa = wrong[a.id] || 0, wb = wrong[b.id] || 0;
        if (wa !== wb) return wb - wa;
        return (fa.ef || EF_START) - (fb.ef || EF_START);
      });
      var queue = fresh.slice(0, maxNew);
      var dueGot = due.slice(0, limit);
      queue = queue.concat(dueGot);
      if (queue.length < limit) {
        var weak = cards
          .map(function (c) {
            var f = migrate(store[c.id]);
            return { c: c, w: wrong[c.id] || 0, reps: f.reps || 0, r: Flashcards.retentionOf(f, now) };
          })
          .filter(function (x) { return x.reps > 0 && x.w > 0; })
          .sort(function (a, b) { return b.w - a.w; })
          .slice(0, limit - queue.length)
          .map(function (x) { return x.c; });
        queue = queue.concat(weak);
      }
      return { queue: queue, freshLeft: Math.max(0, fresh.length - maxNew), dueLeft: Math.max(0, due.length - limit) };
    },

    isLearned: function (progress, id, storeKey) {
      var f = migrate(Flashcards.storeOf(progress, storeKey)[id]);
      return !!(f && f.reps > 0);
    },

    stateOf: function (progress, id, storeKey) {
      var f = migrate(Flashcards.storeOf(progress, storeKey)[id]);
      if (!f || f.reps === 0) return { label: "新词", cls: "new" };
      var now = Date.now();
      if (f.due <= now) return { label: (f.interval || 0) + "天后到期", cls: "due" };
      return { label: f.ef >= 2.5 ? "牢固" : "易遗忘", cls: f.ef >= 2.5 ? "strong" : "weak" };
    },

    wrongCount: function (progress, id) { return (progress.wrong || {})[id] || 0; }
  };

  function migrate(f) {
    if (!f || f.interval != null) return f || { reps: 0, ef: EF_START, interval: 0, due: 0 };
    var box = f.box || 0;
    return { reps: box, ef: EF_START, interval: Flashcards.BOX_DAYS[box] || 0, due: f.due || 0, boxLegacy: box };
  }

  window.Flashcards = Flashcards;
})();
