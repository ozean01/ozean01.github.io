/* ============ 段级复习调度（P11 · 参考 Echo Loop 的「段级间隔复习」模型）============
   为什么需要它（缺口源自 2026-10-26 的 Echo Loop 外部评估）：
     站内 FSRS-6 只调度「词 / 短语 / 句型骨架 / 台词」，五阶段闯关只记「走到第几阶段」，
     于是「这一段对话到底练到会说没有」没有到期日、也没有完成态 —— 当天走完就再也不回来了。
     Echo Loop（AGPL-3.0，源码已读）的做法是：每段音频 = 一个学习对象，首学完成后按
     6h → 1d → 2d → 4d → 7d → 14d → 28d 七轮间隔复习，到点把它推到今日任务里。
     本站只借**调度模型**（思路可借，代码不可借：对方 AGPL-3.0、本站 MIT，且形态是 Flutter App）。

   三条硬口径（与站内既有纪律对齐，改这里之前先读一遍）：
     1. **只认真实完成**：轮次只由「真正走完五阶段闯关」推进；今日页那一步的「✓ 完成」
        仍然只记打卡（README「完成≠证据」、诚实清单）。勾一下不会推进轮次。
     2. **提前练不推进、也不改到期日**：没到复习日就走了一遍，只算练，不记轮次、不推迟到期
        （否则反复「提前练」可以永久逃掉复习）。到期日只由「到点后真正走完」推进。
     3. **不新增第 6 步、不新增导航、不进打卡账本**：它只回答「今天该复听哪一段」，
        以及给闯关完成页一个到期日。

   存储：独立键 `fte-seg-review-v1`（已在 js/storage-keys.js 登记 → 自动进导出备份）
     { v:1,
       segs: { "12-0": { r:0, due:ts, last:ts, n:1 } },   // r=已完成复习轮数(0..7，7=毕业)
       pos:  { "12-0": { s:2, i:7, t:ts } } }              // s=阶段序号(1..5)，i=句子下标
   纯本地、零依赖、不联网；localStorage 读写全部 try/catch，失败不阻断学习。 */

(function () {
  "use strict";

  var KEY = "fte-seg-review-v1";
  /* 距**上一轮**完成后的等待小时数（累计正好是 6h / 1d / 2d / 4d / 7d / 14d / 28d，
     与 Echo Loop 源码 LearningStage.intervalHours 的 6/18/24/48/72/168/336 一致） */
  var DELTAS_H = [6, 18, 24, 48, 72, 168, 336];
  var H = 3600000;
  var DAY = 86400000;
  var OVERDUE_MS = 24 * H;      // 到期后 24h 内不算逾期（与对方 review0 6h / 其余 24h 对齐的口径取保守值）
  var POS_TTL_MS = 3 * DAY;     // 阶段内断点 >3 天不恢复（对方同一口径）
  var TOTAL = DELTAS_H.length;

  function nowOf(at) { return typeof at === "number" && isFinite(at) ? at : Date.now(); }

  /* ---------- 存储 ---------- */
  function blank() { return { v: 1, segs: {}, pos: {} }; }
  function isObj(o) { return !!o && typeof o === "object" && !Array.isArray(o); }
  function num(o, k) {
    var v = o && o[k];
    var n = typeof v === "number" ? v : parseFloat(v);
    return (typeof n === "number" && isFinite(n)) ? n : null;
  }
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return blank(); }
    if (!raw) return blank();
    var o;
    try { o = JSON.parse(raw); } catch (e) { return blank(); }
    if (!isObj(o)) return blank();
    var st = blank();
    if (isObj(o.segs)) {
      for (var k in o.segs) {
        if (!Object.prototype.hasOwnProperty.call(o.segs, k)) continue;
        var s = o.segs[k];
        if (!isObj(s)) continue;
        var r = num(s, "r");
        if (r == null || r < 0) continue;
        r = Math.min(Math.floor(r), TOTAL);
        st.segs[k] = {
          r: r,
          due: r >= TOTAL ? null : num(s, "due"),
          last: num(s, "last"),
          n: Math.max(0, Math.floor(num(s, "n") || 0))
        };
      }
    }
    if (isObj(o.pos)) {
      for (var p in o.pos) {
        if (!Object.prototype.hasOwnProperty.call(o.pos, p)) continue;
        var q = o.pos[p];
        if (!isObj(q)) continue;
        var si = num(q, "s"), ii = num(q, "i"), ti = num(q, "t");
        if (si == null || ti == null) continue;
        if (si < 1 || si > 5) continue;
        st.pos[p] = { s: Math.floor(si), i: Math.max(0, Math.floor(ii || 0)), t: ti };
      }
    }
    return st;
  }
  function save(st) {
    try { localStorage.setItem(KEY, JSON.stringify(st)); return true; } catch (e) { return false; }
  }

  /* ---------- 键与标签 ---------- */
  function keyOf(uid, di) { return String(uid) + "-" + String(di); }
  function parseKey(key) {
    var m = /^(\d+)-(\d+)$/.exec(String(key || ""));
    if (!m) return null;
    return { uid: parseInt(m[1], 10), di: parseInt(m[2], 10) };
  }
  function labelOf(key) {
    var pk = parseKey(key);
    var out = { uid: pk ? pk.uid : 0, di: pk ? pk.di : 0, unitTitle: "", title: "" };
    if (!pk) return out;
    /* ⚠️ data.js 用 `const FTE_DATA = …` 声明：它是**全局词法绑定**，不是 window 属性
       （经典脚本里 top-level const 不挂 window）。所以先读裸名字，再退回 window.FTE_DATA ——
       只读 window 会拿到 undefined，本函数返回空标题，到期卡就整块不渲染（已实测踩过）。 */
    var data = null;
    try { if (typeof FTE_DATA !== "undefined" && FTE_DATA) data = FTE_DATA; } catch (e) { data = null; }
    if (!data) data = window.FTE_DATA || null;
    var units = (data && data.units) || [];
    for (var i = 0; i < units.length; i++) {
      if (units[i] && units[i].id === pk.uid) {
        out.unitTitle = String(units[i].title || "");
        var d = (units[i].dialogues || [])[pk.di];
        out.title = String((d && d.title) || "");
        break;
      }
    }
    return out;
  }

  /* ---------- 时间文案（唯一实现：今日页与闯关完成页共用） ---------- */
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function dateText(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    return (d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function whenText(ts, at) {
    if (!ts) return "";
    var diff = ts - nowOf(at);
    if (diff <= 0) {
      var over = -diff;
      if (over < H) return "现在到期";
      if (over < DAY) return "已逾期 " + Math.floor(over / H) + " 小时";
      return "已逾期 " + Math.floor(over / DAY) + " 天";
    }
    if (diff < H) return Math.max(1, Math.ceil(diff / 60000)) + " 分钟后";
    if (diff < DAY) return Math.ceil(diff / H) + " 小时后";
    return Math.ceil(diff / DAY) + " 天后";
  }

  /* ---------- 查询 ---------- */
  function statusOf(key, at) {
    at = nowOf(at);
    var seg = load().segs[key];
    if (!seg) return { state: "none", round: 0, due: null, remainMs: null, overdueMs: 0 };
    if (seg.r >= TOTAL) return { state: "graduated", round: TOTAL, due: null, remainMs: null, overdueMs: 0 };
    var due = seg.due;
    if (due == null) return { state: "waiting", round: seg.r, due: null, remainMs: null, overdueMs: 0 };
    if (at >= due) {
      return { state: "due", round: seg.r, due: due, remainMs: 0, overdueMs: Math.max(0, at - due) };
    }
    return { state: "waiting", round: seg.r, due: due, remainMs: due - at, overdueMs: 0 };
  }

  /* 到点段清单（按到期时间升序）。只返回 due <= at 的段；不含未到期与已毕业。 */
  function dueList(at) {
    at = nowOf(at);
    var st = load();
    var out = [];
    for (var k in st.segs) {
      if (!Object.prototype.hasOwnProperty.call(st.segs, k)) continue;
      var seg = st.segs[k];
      if (seg.r >= TOTAL || seg.due == null) continue;
      if (seg.due > at) continue;
      var lab = labelOf(k);
      out.push({
        key: k, uid: lab.uid, di: lab.di,
        unitTitle: lab.unitTitle, title: lab.title,
        round: seg.r, due: seg.due,
        overdueMs: Math.max(0, at - seg.due),
        overdue: (at - seg.due) >= OVERDUE_MS,
        whenText: whenText(seg.due, at),
        dueText: dateText(seg.due)
      });
    }
    out.sort(function (a, b) { return a.due - b.due; });
    return out;
  }
  function dueCount(at) { return dueList(at).length; }

  /* ---------- 推进 ---------- */
  /* 只在「真正走完五阶段闯关」时调用。返回给人看的结论（UI 不许自己再算一遍）。 */
  function markDone(key, at) {
    at = nowOf(at);
    if (!parseKey(key)) return { ok: false, action: "badkey" };
    var st = load();
    var seg = st.segs[key] || null;
    if (!seg) {
      st.segs[key] = { r: 0, due: at + DELTAS_H[0] * H, last: at, n: 1 };
      save(st);
      return { ok: true, action: "created", round: 0, total: TOTAL, due: st.segs[key].due,
        dueText: dateText(st.segs[key].due), whenText: whenText(st.segs[key].due, at) };
    }
    if (seg.r >= TOTAL) {
      /* 已毕业：再练只更新一下最后练习时间，不加轮次、不重开复习 */
      seg.last = at;
      save(st);
      return { ok: true, action: "graduated", round: TOTAL, total: TOTAL, due: null, dueText: "", whenText: "" };
    }
    if (seg.due != null && at < seg.due) {
      /* 提前练：记「练过」，但不推进轮次、不推迟到期日（防止反复提前练永久逃掉复习） */
      return { ok: true, action: "early", round: seg.r, total: TOTAL, due: seg.due,
        dueText: dateText(seg.due), whenText: whenText(seg.due, at), remainMs: seg.due - at };
    }
    seg.r = seg.r + 1;
    seg.n = (seg.n || 0) + 1;
    seg.last = at;
    if (seg.r >= TOTAL) {
      seg.due = null;
      save(st);
      return { ok: true, action: "advanced", round: TOTAL, total: TOTAL, due: null, dueText: "", whenText: "" };
    }
    seg.due = at + DELTAS_H[seg.r] * H;
    save(st);
    return { ok: true, action: "advanced", round: seg.r, total: TOTAL, due: seg.due,
      dueText: dateText(seg.due), whenText: whenText(seg.due, at) };
  }

  /* ---------- 阶段内断点（P11-b） ---------- */
  function posOf(key, at) {
    at = nowOf(at);
    var p = load().pos[key];
    if (!p) return null;
    if (at - p.t > POS_TTL_MS) return null;   // 停太久不恢复：给一个干净的开头，避免「接在半年前那句话」
    return p;
  }
  function savePos(key, stageNum, line, at) {
    at = nowOf(at);
    var s = Math.floor(num({ s: stageNum }, "s"));
    if (!parseKey(key) || !s || s < 1 || s > 5) return false;
    var st = load();
    st.pos[key] = { s: s, i: Math.max(0, Math.floor(num({ i: line }, "i") || 0)), t: at };
    return save(st);
  }
  function clearPos(key) {
    var st = load();
    if (!st.pos[key]) return true;
    delete st.pos[key];
    return save(st);
  }

  /* ---------- 给 UI 的一句话（唯一口径，别在页面里另写一份） ---------- */
  function verdictText(res) {
    if (!res || !res.ok) return "";
    if (res.action === "created") {
      return "🗓 已排入段级复习：首轮 " + res.whenText + "（" + res.dueText + "）。到点「今日」会把它排到「开口跟读」那一步。";
    }
    if (res.action === "early") {
      return "⏳ 这次是提前练的：还差 " + res.whenText.replace("后", "") + "才到复习日，所以只算练、不记轮次（到期日不变：" +
        res.dueText + "）。到点再走一遍才算一轮。";
    }
    if (res.action === "advanced" && res.round >= TOTAL) {
      return "✅ 七轮间隔复习全部走完 —— 这一段按站内口径算「练熟了」。想保状态可以随时再走一遍。";
    }
    if (res.action === "advanced") {
      return "🗓 第 " + res.round + "/" + TOTAL + " 轮复习完成，下一次 " + res.whenText + "（" + res.dueText + "）。";
    }
    if (res.action === "graduated") {
      return "✅ 这一段七轮已走完（已毕业），本次只记录又练了一遍。";
    }
    return "";
  }

  window.SegReview = {
    KEY: KEY,
    DELTAS_H: DELTAS_H.slice(),
    TOTAL: TOTAL,
    OVERDUE_MS: OVERDUE_MS,
    POS_TTL_MS: POS_TTL_MS,
    keyOf: keyOf,
    parseKey: parseKey,
    labelOf: labelOf,
    load: load,
    statusOf: statusOf,
    dueList: dueList,
    dueCount: dueCount,
    markDone: markDone,
    posOf: posOf,
    savePos: savePos,
    clearPos: clearPos,
    whenText: whenText,
    dateText: dateText,
    verdictText: verdictText,
    /* 只给测试/诊断用：清空调度（不参与任何 UI） */
    _reset: function () { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } return true; }
  };
})();
