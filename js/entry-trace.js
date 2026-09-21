/* ============ 🧭 入口离开 / 主线进入 行为记录（entry-trace）============
   用途（P1-D 前置，方案 §5.2-P1-D 依赖项①）：
     为「主线下一步点击率不下降」这一验收标准提供【测量前提】。
     站内原有的进度/清单口径（js/app.js 的 UNIT_DONE_PCT、js/today.js 的当日清单）
     都是「状态」而不是「时序行为」，无法回答「从某个入口离开后，用户有没有接着进主线」，
     所以必须另建这条极小的时序记录。

   本文件【只记录、不展示、不参与任何判定】：
     - 不新增一级导航、不新增页面、不新增路由、不新增进度口径；
     - 不读也不写学习进度（progress / learned / done / stage 一概不碰）；
     - 不修改任何学习内容。

   ── 两个事件 ──────────────────────────────────────────────
     ① point（入口离开）：用户在某个【非主线】入口上按下了「去某个主线单元」的链接。
        触发点＝既有入口里既有的链接：场景急救的「接着说」(.urg-next)、搜索结果、
        SOP 的「去 U16 练整段对话」(.sop-unit-link)、看板任务卡(.board-card)、
        写作区的单元 chip、首次上手横幅(.ob-bar)，以及任何带 data-seat 标记的元素。
        ⚠️ 阶段二（真正的 P1-D 入口卡）落地时，给新入口元素加 data-seat="entry-card"
        （或直接在回调里调 window.FTE_TRACE.markPoint("entry-card")）即可复用本记录，
        **本文件不需要重写**。
     ② main（主线进入）：路由进入主线单元页（#/unit/<id>）。
        触发点＝app.js 的 renderRoute()，覆盖点击、深链、前进/后退、程序化赋值等所有进入方式。

   ── 核心指标 ──────────────────────────────────────────────
     point24h = 某个 point 事件之后 24 小时内，是否发生了任一 main 事件。
     未满 24 小时的样本计为「待判定」(pending)，不进分母 —— 否则会系统性低估。

   ── 样本保留策略（P1-D 基线的成败就在这里）──────────────────
     上限是【事件总条数】（point + main 合计），不是「每种事件 40 条」——早期注释与实现不符，
     那处口径差异已被修正为「事件总条数上限」（见 CAP_EVENTS）。
     超限时只裁剪**已经不再需要**的事件，优先级：① 最旧的已判定 point（now−t ≥ 24h）；
     ② 不再充当任何保留 point 证据的 main。**未判定的 point 一律不裁**（详见 CAP_EVENTS 旁）。

   ── 字段（最小化，刻意不记学习内容）─────────────────────────
     事件：{ t: 时间戳(毫秒), k: 事件类型, s: 来源粗类, u: 单元号 }
       · 只有 计数 + 时间戳 + 粗类；【不记录】看了哪个词条/句子/场景文本，也不记答对答错。
       · s 取自本文件预先枚举的常量（SEAT_KINDS），不是自由文本，避免把内容带进埋点。
       · 诊断导出时时间戳按 15 分钟粒度吸附（T_GRAIN）——只用于「有没有在 24h 内回来」，
         吸附后仍能精确判定 24 小时窗口。
       · 写入按 (类型 + 毫秒) 去重，同一次点击命中两处 listener 不会记两遍。
     每日聚合：{ "YYYY-MM-DD": { p: point 次数, m: main 次数 } } —— 长期基线用，体量恒定。

   ── 静默失败 ──────────────────────────────────────────────
     本文件对 localStorage 的每一次访问都在 try/catch 内；localStorage 不可用（隐私模式、
     配额满、被策略禁用）时自动回落到【内存存储】：当次会话仍可记录、可计算，
     页面渲染与其它功能完全不受影响，且不抛任何错。

   ── 关闭方式（三条任选其一，随时可停用）─────────────────────
     ① 控制台：FTE_TRACE.disable()                         → 立即停止记录并持久化关闭状态；
     ② 控制台：localStorage.setItem("fte-trace-off","1")   → 下次加载即关闭；
     ③ 地址栏：index.html?traceOff=1                        → 本次加载即关闭；
     ④ 删除 index.html 里的 <script src="js/entry-trace.js"></script> → 彻底移除。
     重新开启：FTE_TRACE.enable()，或移除 "fte-trace-off" 键。
     关闭后所有写入点直接 return，页面照常运行。

   依赖：无。加载位置：js/app.js 之前（app.js 需要读 window.FTE_TRACE）。
   挂点（仅两处，都在 app.js）：① renderRoute() 里调用 FTE_TRACE.noteRoute()；
   ② 已有的事件委托 click listener 顶部调用 FTE_TRACE.traceClick(e) —— 必须挂在
   「e.target.closest("[data-action]") 为空就 return」那一行之前，否则普通链接点击会被漏掉。 */
(function () {
  "use strict";

  /* ---------------- 常量：全部口径集中在这里 ---------------- */
  var K_POINT = "point";              // 入口离开
  var K_MAIN = "main";                // 主线进入
  var WINDOW = 24 * 60 * 60 * 1000;   // 24 小时判定窗口
  var T_GRAIN = 15 * 60 * 1000;       // 导出快照的时间吸附粒度（15 分钟）
  /* 事件【总条数】上限（point + main 合计；不是「每种事件 N 条」——旧注释与实现不符，已改口径）。
     超限时只裁剪「已经不再需要」的事件，见 trim()：
       · 未判定的 point（now−t < WINDOW）**一条都不裁**；
       · 先裁最旧的已判定 point（它的 24h 窗口早已走完，判定结果已可计），再裁不再充当证据的 main。
     因此样本不会因为「上限」而残缺：trim() 找不到可裁对象时就停手，数组宁可临时超过上限
     ——只有一个尚未判定的 point 存在，落在它 24h 窗口内的 main 就都是它的判定证据，一条都不能丢。
     这在现实使用下不会失控：会出现超限的前提是「24 小时内产生 > 400 条事件」（约每 3.6 分钟点一次
     去主线的链接，且不间断 24 小时）；即便极端到 1000 条，也只有约 40 KB，远低于 localStorage 配额。

     取值依据（P1-D 验收需要 ≥30 个**已判定**样本，每个 point 要等满 24h 才判定）：
     可覆盖天数 ≈ CAP_EVENTS ÷ 每天事件数，据此估算三种活跃度——
       · 15 事件/天（轻活跃：5 point + 10 main）  ⇒ 约 26 天；
       · 60 事件/天（重活跃：20 point + 40 main） ⇒ 约 6.5 天，此时保留下来的已判定 point ≈ 110 个；
       · 100 事件/天（极端密集：40 point + 60 main）⇒ 约 4 天，已判定 point 仍 ≈ 120 个。
     三种情形下保留的已判定 point 都远超 30，因此**一个活跃用户大约 6 天以上不会丢任何样本**，
     长期不清理也始终保得住 P1-D 需要的判定样本量。
     旧的 40 条（point+main 合计）在 60 事件/天下只覆盖约 16 小时，会把还没走完 24h 窗口的
     point 直接删掉 ⇒ 基线残缺、且要重头再攒；本次改为 400 条并把未判定样本列为不可裁。 */
  var CAP_EVENTS = 400;

  var SEAT_KINDS = {                  // 入口来源粗类（非主线）
    urgent: 1, search: 1, sop: 1, board: 1, write: 1,
    onboard: 1, today: 1, home: 1, other: 1
  };

  var STORE_KEY = "fte-trace-v1";
  var OFF_KEY = "fte-trace-off";
  var OFF_Q = "traceOff";             // 地址栏一击停用：?traceOff=1
  var OFF = false;

  /* ---------------- 存储：localStorage 优先，失败静默回落内存 ---------------- */
  var mem = null;

  function lsGet(key) {
    try {
      if (typeof localStorage === "undefined" || !localStorage) return null;
      return localStorage.getItem(key);
    } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try {
      if (typeof localStorage === "undefined" || !localStorage) return false;
      localStorage.setItem(key, val);
      return true;
    } catch (e) { return false; }
  }
  function lsRemove(key) {
    try {
      if (typeof localStorage === "undefined" || !localStorage) return;
      localStorage.removeItem(key);
    } catch (e) { /* ignore */ }
  }

  function blank() { return { v: 1, e: [], d: {} }; }

  function read() {
    var raw = lsGet(STORE_KEY);
    if (raw == null) return mem || blank();          // localStorage 不可用 → 内存镜像
    try {
      var o = JSON.parse(raw);
      if (!o || typeof o !== "object") return blank();
      if (!o.e || !(o.e instanceof Array)) o.e = [];
      if (!o.d || typeof o.d !== "object") o.d = {};
      return o;
    } catch (e) { return mem || blank(); }           // 脏数据 → 不抛，退内存
  }
  function write(o) {
    mem = o;                                         // 无论写盘成不成，都留一份内存镜像
    lsSet(STORE_KEY, JSON.stringify(o));
  }

  /* ---------------- 开关 ---------------- */
  function isOff() {
    if (OFF) return true;
    if (lsGet(OFF_KEY)) return true;
    try {
      if (typeof location !== "undefined" && location && location.search &&
          location.search.indexOf(OFF_Q + "=1") !== -1) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  /* ---------------- 入口分类（单一职责：DOM → 来源粗类）---------------- */
  /* 返回 null   = 「这个座位就是主线」，不记 point（否则与 main 同源，指标失真）。
     返回字符串   = 入口来源粗类（SEAT_KINDS 的键）。
     分类刻意保持「粗」：它只服务于「点 vs 主线」二分与粗粒度归因，
     需要更准的归因时，给元素加 data-seat（不用改本文件）。 */
  function seatKindOf(el) {
    if (!el) return null;
    /* ① 显式标记优先：P1-D 阶段二的入口卡用 data-seat="entry-card" 接入 */
    var seat = el.getAttribute ? String(el.getAttribute("data-seat") || "") : "";
    if (seat) return seat === "main" ? null : (SEAT_KINDS[seat] ? seat : "other");
    /* ② 既有入口的稳定 class 指纹 */
    if (el.classList && typeof el.classList.contains === "function") {
      if (el.classList.contains("urg-next")) return "urgent";
      if (el.classList.contains("sop-unit-link")) return "sop";
      if (el.classList.contains("board-card-title") || el.classList.contains("board-go")) return "board";
      /* ps-chip 有三种来源：路径区（主线）、写作区（入口）、SOP（入口）。
         按祖先容器消歧，取不到血缘时按主线处理（宁少记、不误记）。 */
      if (el.classList.contains("ps-chip")) {
        var anc = el.parentNode, hop = 0;
        while (anc && hop < 8) {
          var ac = (anc.classList && typeof anc.classList.contains === "function") ? anc : null;
          if (ac && ac.contains("sop-units")) return "sop";
          if (ac && ac.contains("mail-card")) return "write";
          if (ac && (ac.contains("path-stage") || ac.contains("path-stages"))) return null;
          anc = anc.parentNode; hop++;
        }
        return "other";
      }
    }
    /* ③ 向上找最近的容器指纹 */
    var node = el, hops = 0;
    while (node && hops < 8) {
      var cl = (node.classList && typeof node.classList.contains === "function") ? node : null;
      var id = node.id || "";
      if (cl) {
        if (cl.contains("unit-card") || cl.contains("unit-grid")) return null;      // 主线座位：单元卡
        if (cl.contains("path-stage") || cl.contains("path-stages")) return null;   // 主线座位：路径区
        if (cl.contains("prog-col") || cl.contains("stat-card")) return null;       // 首页进度区 → 主线
        if (cl.contains("urg-body") || cl.contains("urg-res") || cl.contains("urg")) return "urgent";
        if (cl.contains("sr-item")) return "search";
        if (cl.contains("sop-units") || cl.contains("sop-unit-link")) return "sop";
        if (cl.contains("board-card") || cl.contains("board-col")) return "board";
        if (cl.contains("mail-card") || cl.contains("ws-")) return "write";
        if (cl.contains("ob-bar")) return "onboard";
        if (cl.contains("home-map-box")) return "home";
        if (cl.contains("td-step") || cl.contains("td-list") || cl.contains("td-")) return "today";
      }
      if (id === "app") break;
      if (typeof document !== "undefined" && node === document.body) break;
      node = node.parentNode; hops++;
    }
    return "other";
  }

  /* 从 href 取主线单元号；非 #/unit/N 返回 null */
  function unitFromHref(href) {
    if (!href) return null;
    var m = String(href).match(/#\/unit\/(\d+)/);
    if (!m) return null;
    var n = parseInt(m[1], 10);
    return (n >= 1 && n <= 999) ? n : null;
  }

  /* ---------------- 写入 ---------------- */
  function evId(k, t) { return k + ":" + t; }

  function dayKey(t) {
    var d = new Date(t);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  /* 这条 main 是否还被某个保留下来的 point 当作 24h 证据（hitsFor 要求 main 在 point 之后、
     且相隔不超过 WINDOW，所以「更早的 point」是不可能用得上这条 main 的）。 */
  function isEvidenceFor(list, tMain) {
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.k !== K_POINT) continue;
      var dt = tMain - p.t;
      if (dt > 0 && dt <= WINDOW) return true;
    }
    return false;
  }

  /* 裁剪：只在超过 CAP_EVENTS 时动作，且只裁「已不再需要」的事件（从最旧的开始找）。
     找不到可裁对象就立刻停手并返回——**未判定的 point 永远不会被裁**，哪怕数组临时超出上限。
     返回当前条数，便于测试直接断言。 */
  function trim(o, now) {
    while (o.e.length > CAP_EVENTS) {
      var victim = -1;
      for (var i = 0; i < o.e.length; i++) {
        var x = o.e[i];
        if (x.k === K_POINT) {
          /* 只有「已判定」的 point 才可裁（now−t ≥ WINDOW，其 24h 窗口已走完，判定早已可计） */
          if (now - x.t >= WINDOW) { victim = i; break; }
        } else if (!isEvidenceFor(o.e, x.t)) {
          victim = i; break;                         // 这条 main 不再为任何保留 point 提供证据
        }
      }
      if (victim < 0) break;
      o.e.splice(victim, 1);
    }
    return o.e.length;
  }

  function push(kind, source, unit) {
    if (isOff()) return null;
    try {
      var now = Date.now();
      var o = read();
      var id = evId(kind, now);
      /* 同毫秒同类型只记一次：同一次点击可能被多处 listener 捕到（本文件的两个挂点、以及
         其它模块自己的 click 委托），去重不能只看最后一条——中间可能已插入别的类型。 */
      for (var i = o.e.length - 1; i >= 0; i--) {
        if (o.e[i].t !== now) {
          /* 事件按时间递增写入；遇到更早的时间戳即可停止（trim() 只 splice 整个元素，
             数组始终保持按时间递增，故该前提仍成立） */
          if (o.e[i].t < now) break;
          continue;
        }
        if (evId(o.e[i].k, o.e[i].t) === id) return null;
      }
      var ev = { t: now, k: kind, s: SEAT_KINDS[source] ? source : "other", u: unit || 0 };
      o.e.push(ev);
      trim(o, now);          // 只裁已不再需要的事件；未判定的 point 一条不裁
      var dk = dayKey(now);
      if (!o.d[dk]) o.d[dk] = { p: 0, m: 0 };
      if (kind === K_POINT) o.d[dk].p++; else o.d[dk].m++;
      write(o);
      return ev;
    } catch (e) { return null; }        // 任何异常都不许冒泡到页面
  }

  /* ---------------- 24 小时判定 ---------------- */
  function hitsFor(tPoint, mains) {
    for (var i = 0; i < mains.length; i++) {
      var dt = mains[i] - tPoint;
      if (dt > 0 && dt <= WINDOW) return true;
    }
    return false;
  }

  /* ---------------- 对外 API ---------------- */
  var API = {};

  /* 埋点主入口①：挂到 app.js 已有 click 委托的顶部 */
  API.traceClick = function (e) {
    try {
      if (!e || isOff()) return;
      var t = e.target;
      if (!t || !t.closest) return;
      var a = t.closest("a[href]");
      if (!a) {
        /* 非链接但显式标了 data-seat="entry-card" 的元素：视为入口动作 */
        var marked = t.closest("[data-seat]");
        if (marked && seatKindOf(marked) !== null) push(K_POINT, seatKindOf(marked), 0);
        return;
      }
      var unit = unitFromHref(a.getAttribute("href"));
      if (!unit) return;                       // 不是去主线单元的链接 → 不记
      var kind = seatKindOf(a);
      if (kind === null) return;               // 主线座位 → 不记（否则与 main 同源）
      push(K_POINT, kind, unit);
    } catch (e2) { /* 静默 */ }
  };

  /* 埋点主入口②：挂到 app.js 的 renderRoute() */
  API.noteRoute = function (hash) {
    try {
      if (isOff()) return null;
      var h = (hash == null) ? (typeof location !== "undefined" ? location.hash : "") : hash;
      var m = String(h || "").match(/^#?\/?unit\/(\d+)/);
      if (!m) return null;
      var n = parseInt(m[1], 10);
      if (!(n >= 1)) return null;
      return push(K_MAIN, "unit", n);
    } catch (e) { return null; }
  };

  /* 供 P1-D 阶段二的入口卡直接调用（不依赖 DOM 分类） */
  API.markPoint = function (source, unit) {
    return push(K_POINT, source, unit || 0);
  };

  /* 读侧：算「离开后 24h 内是否进入任一主线单元」。只读，不写盘。 */
  API.stats = function () {
    try {
      var o = read();
      var mains = [], points = [];
      o.e.forEach(function (x) {
        if (x.k === K_MAIN) mains.push(x.t);
        else if (x.k === K_POINT) points.push(x);
      });
      mains.sort(function (a, b) { return a - b; });
      var hit = 0, miss = 0, pending = 0, byKind = {}, now = Date.now();
      points.forEach(function (p) {
        var kk = p.s || "other";
        if (!byKind[kk]) byKind[kk] = { points: 0, hit: 0, miss: 0, pending: 0 };
        byKind[kk].points++;
        if (hitsFor(p.t, mains)) { hit++; byKind[kk].hit++; }
        else if (now - p.t < WINDOW) { pending++; byKind[kk].pending++; }
        else { miss++; byKind[kk].miss++; }
      });
      var decided = hit + miss;
      return {
        events: o.e.length,
        points: points.length,
        mains: mains.length,
        hit24h: hit,
        miss24h: miss,
        pending24h: pending,                                              // 未满 24h，不进分母
        point24h: decided ? Math.round(hit / decided * 1000) / 10 : null, // 百分比；无样本 → null
        byKind: byKind,
        days: Object.keys(o.d).sort()
      };
    } catch (e) {
      return { events: 0, points: 0, mains: 0, hit24h: 0, miss24h: 0, pending24h: 0, point24h: null, byKind: {}, days: [], error: "计算失败（已静默）" };
    }
  };

  API.enabled = function () { return !isOff(); };
  API.disable = function () {
    OFF = true;
    lsSet(OFF_KEY, "1");
    try { if (typeof console !== "undefined" && console.info) console.info("[FTE_TRACE] 行为记录已关闭，不再写入任何数据。"); } catch (e) { /* ignore */ }
    return true;
  };
  API.enable = function () { OFF = false; lsRemove(OFF_KEY); return true; };
  API.clear = function () { mem = blank(); lsRemove(STORE_KEY); return true; };

  /* 只读诊断导出：**不在任何被动写入路径上**，仅显式调用时执行；
     时间戳按 T_GRAIN 吸附，不导出精确到分钟的时序。 */
  API.exportSnapshot = function () {
    try {
      var o = read();
      return {
        v: o.v,
        grain_ms: T_GRAIN,
        events: o.e.map(function (x) { return { t: Math.floor(x.t / T_GRAIN) * T_GRAIN, k: x.k, s: x.s, u: x.u }; }),
        days: o.d
      };
    } catch (e) { return { error: "导出失败（已静默）" }; }
  };

  API._t = {
    K_POINT: K_POINT, K_MAIN: K_MAIN, WINDOW: WINDOW, CAP_EVENTS: CAP_EVENTS,
    SEAT_KINDS: SEAT_KINDS, seatKindOf: seatKindOf, unitFromHref: unitFromHref,
    hitsFor: hitsFor, key: STORE_KEY, off_key: OFF_KEY,
    /* 保留策略的测试入口（只读调用，不改行为）：trim() 可被单独驱动以验证「未判定样本不被裁」 */
    trim: trim, isEvidenceFor: isEvidenceFor
  };

  if (typeof window !== "undefined") window.FTE_TRACE = API;
})();
