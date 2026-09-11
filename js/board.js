/* ============ 🗂 本周学习任务看板（软包装外贸 · TaskBoard） ============
   模块 D：参考 Trello 的「看板 + 卡片 + 标签 + 拖拽」，把"今天/本周该练什么"做成
   一屏看得见、能拖动、能打勾的三列看板：本周待办 → 进行中 → 已完成。

   - 任务自动生成：按你的「工作目标」+「测水平起点」+「今日任务」+「FSRS 到期复习」+ 推荐场景。
   - 每张卡带标签（难度/类型）、可点「开始→完成」，或直接**拖拽**换列。
   - 拖到「已完成」自动把该卡的练习时长计入**打卡/热力图/周报**（progress.coach*）。
   - 纯静态 + localStorage（fte-board-v1），零后端。 */

(function () {
  "use strict";

  const app = document.getElementById("app");
  const KEY = "fte-board-v1";
  const U = function () { return window.ASRUtil || {}; };
  const esc = function (s) { const f = U().esc; return f ? f(s) : String(s == null ? "" : s); };
  function toast(m) { const f = U().toast; if (f) f(m); }
  function getProgress() { const f = U().getProgress; return f ? f() : {}; }
  function saveProgress() { const f = U().saveProgress; if (f) f(); }

  /* ---------------- 标签色 ---------------- */
  const LABEL = function (t) { return (LABEL_MAP[t] || { t: t, c: "var(--primary)" }).c; };
  const LABEL_MAP = {
    "口语": "var(--primary)", "听力": "var(--accent)", "写作": "var(--ok)",
    "词汇": "var(--primary-2)", "句型": "var(--accent)", "实操": "#7c3aed",
    "复习": "var(--bad)", "游": "var(--muted)"
  };
  /* 任务类型 → 默认练习时长（分钟），完成时计入打卡 */
  const DEFAULT_MIN = 5;

  /* ---------------- 看板存取 ---------------- */
  function loadBoard() { try { const b = JSON.parse(localStorage.getItem(KEY) || "null"); return b && b.tasks ? b : null; } catch (e) { return null; } }
  function saveBoard(tasks) { try { localStorage.setItem(KEY, JSON.stringify({ week: currentWeek(), tasks: tasks })); } catch (e) { /* ignore */ } }

  function currentWeek() {
    const d = new Date();
    const start = new Date(d.getFullYear(), 0, 1);
    const w = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
    return d.getFullYear() + "-W" + w;
  }
  function todayKey() { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------------- 目标 → 推荐任务 ---------------- */
  const GOAL_TASKS = {
    all: [],
    prospect: [{ title: "开发信 / 展会接待：AI 场景对练", href: "#/tutor", labels: ["口语"], min: 8 }],
    quote: [{ title: "报价议价：AI 谈判场景对练", href: "#/tutor", labels: ["口语", "句型"], min: 8 }],
    negot: [{ title: "谈判签约：四维·价格谈判场景", href: "#/eval4", labels: ["口语"], min: 6 }],
    doc: [{ title: "跟单单证：实操 SOP 单证规范", href: "#/sop", labels: ["实操"], min: 8 }],
    claim: [{ title: "客诉索赔：四维·质量异议处理", href: "#/eval4", labels: ["口语", "写作"], min: 8 }],
    fair: [{ title: "展会接待：真实商务音源 + 跟读", href: "#/speak", labels: ["听力", "口语"], min: 8 }]
  };

  function goalId() { try { return localStorage.getItem("fte-home-goal") || "all"; } catch (e) { return "all"; } }
  function placementUnit() { try { return parseInt(localStorage.getItem("fte-placement") || "0", 10) || 1; } catch (e) { return 1; } }

  function fsrsDueCount() {
    const p = getProgress();
    try {
      const fl = p && p.flash;
      if (!fl || typeof fl !== "object") return 0;
      const now = Date.now();
      let n = 0;
      Object.keys(fl).forEach(function (k) { const c = fl[k]; if (c && c.due && c.due <= now) n++; });
      return n;
    } catch (e) { return 0; }
  }

  /* 生成本周默认任务（首次进入新周 / 无看板 / 手动重置时） */
  function genTasks() {
    const g = goalId();
    const tasks = [];
    let id = 1;
    const add = function (t) { tasks.push({ id: "t" + (id++), title: t.title, href: t.href, labels: t.labels || [], min: t.min || DEFAULT_MIN, status: "todo", zone: t.zone || "", due: t.due || "" }); };

    /* 1) 今日任务 */
    add({ title: "🧩 句型 10 句（今日任务）", href: "#/patterns", labels: ["句型"], min: 4 });
    add({ title: "✍️ 写作 1 篇（今日任务）", href: "#/write", labels: ["写作"], min: 6 });
    /* 2) 按目标推荐 */
    (GOAL_TASKS[g] || []).forEach(add);
    /* 3) 学单元（按测水平起点或下一未完成单元） */
    add({ title: "📖 学第 " + placementUnit() + " 单元词汇 + 对话", href: "#/unit/" + placementUnit(), labels: ["词汇", "听力"], min: 8 });
    /* 4) 开口说：自由表达分析（一次） */
    add({ title: "🎙️ 自由表达分析：说一段并看分析", href: "#/speech", labels: ["口语"], min: 3 });
    /* 5) FSRS 到期复习 */
    const due = fsrsDueCount();
    add({ title: "🃏 复习单词卡（" + (due > 0 ? due + " 词到期" : "新词 10 个") + "）", href: "#/flash", labels: ["复习"], min: 5, zone: "memory" });

    return tasks;
  }

  /* ---------------- 时长计入打卡（复用 app.js 的 CoachBridge.credit 体系） ---------------- */
  function creditCoach(minutes) {
    /* CoachBridge.credit(n) 累计「秒」到 连续打卡/今日/累计 并维护 streak；之后主动存档一次 */
    if (window.CoachBridge && window.CoachBridge.credit) {
      window.CoachBridge.credit(Math.max(30, (minutes || DEFAULT_MIN) * 60));
      saveProgress();
    }
  }

  /* ---------------- 状态 ---------------- */
  let st = { tasks: [], dragId: null };

  function loadTasks() {
    if (st.tasks.length) return st.tasks;
    const b = loadBoard();
    if (b && b.week === currentWeek()) { st.tasks = b.tasks; return st.tasks; }
    /* 新的一周 / 无看板 → 重新生成 */
    st.tasks = genTasks();
    saveBoard(st.tasks);
    return st.tasks;
  }
  function persist() { saveBoard(st.tasks); }

  /* ---------------- 渲染 ---------------- */
  const COLS = [
    { id: "todo",  title: "📥 本周待办", hint: "还没开始" },
    { id: "doing", title: "🔄 进行中",   hint: "正在练" },
    { id: "done",  title: "✅ 已完成",   hint: "已计入打卡" }
  ];

  function render() {
    loadTasks();
    const doneMin = st.tasks.filter(function (t) { return t.status === "done"; })
      .reduce(function (a, t) { return a + (t.min || DEFAULT_MIN); }, 0);
    const todoCnt = st.tasks.filter(function (t) { return t.status !== "done"; }).length;

    app.innerHTML = `
      <div class="page-head">
        <h2>🗂 本周学习看板</h2>
        <div class="en">把「今天/本周该练什么」做成能拖动的卡：待办 → 进行中 → 已完成</div>
        <div class="en" style="margin-top:4px;font-size:12.5px;color:var(--muted)">
          按你的「目标」+「水平」自动生成；拖到「已完成」会把这些练习时长计入打卡。本周：${esc(currentWeek())}
        </div>
      </div>
      <div class="board-toolbar">
        <button class="btn btn-soft btn-sm" data-b="reset">🔄 重新生成本周任务</button>
        <button class="btn btn-outline btn-sm" data-b="add">➕ 手动加一张卡</button>
        <span class="board-toolstat">待办 ${todoCnt} · 已完成 ${st.tasks.filter(function (t) { return t.status === "done"; }).length}（约 ${doneMin} 分钟）</span>
      </div>
      <div class="board">
        ${COLS.map(function (col) {
          const cards = st.tasks.filter(function (t) { return t.status === col.id; });
          return `
          <div class="board-col" data-col="${col.id}">
            <div class="board-col-head"><b>${col.title}</b><span>${cards.length}</span></div>
            <div class="board-col-hint">${col.hint}</div>
            <div class="board-col-body" data-drop="${col.id}">
              ${cards.length ? cards.map(cardHtml).join("") : '<div class="board-empty">拖到这里</div>'}
            </div>
          </div>`;
        }).join("")}
      </div>
      <p class="field-note">说明：卡片完成时会把「练习时长」计入「连续打卡 / 热力图 / 周报」。拖拽换列；也可用卡片上的「▶ 开始 / ✓ 完成 / ↩ 移回」按钮。</p>
    `;
    attach();
  }

  function cardHtml(t) {
    const labels = (t.labels || []).map(function (l) { return '<span class="board-label" style="background:' + LABEL(l) + '22;color:' + LABEL(l) + ';border-color:' + LABEL(l) + '55">' + esc(l) + '</span>'; }).join("");
    const due = t.due ? '<span class="board-due">⏰ ' + esc(t.due) + '</span>' : "";
    const actions = t.status === "todo"
      ? '<button class="board-act" data-b="start" data-id="' + t.id + '">▶ 开始</button> <a class="board-act board-go" href="' + t.href + '">去练 →</a>'
      : t.status === "doing"
        ? '<button class="board-act board-done" data-b="done" data-id="' + t.id + '">✓ 完成</button> <button class="board-act" data-b="back" data-id="' + t.id + '">↩ 移回待办</button> <a class="board-act board-go" href="' + t.href + '">去练 →</a>'
        : '<button class="board-act" data-b="redo" data-id="' + t.id + '">↺ 再练一次</button>';
    return `
    <div class="board-card" draggable="true" data-id="${t.id}" data-status="${t.status}">
      <div class="board-card-labels">${labels}${due}</div>
      <a class="board-card-title" href="${t.href}">${esc(t.title)}</a>
      <div class="board-card-actions">${actions}</div>
    </div>`;
  }

  /* ---------------- 交互 ---------------- */
  function attach() {
    /* 点击动作 */
    app.querySelectorAll("[data-b]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        onAction(btn.getAttribute("data-b"), btn.getAttribute("data-id"));
      });
    });
    /* 拖拽 */
    const cols = app.querySelectorAll("[data-drop]");
    cols.forEach(function (drop) {
      drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("drop-on"); });
      drop.addEventListener("dragleave", function () { drop.classList.remove("drop-on"); });
      drop.addEventListener("drop", function (e) {
        e.preventDefault(); drop.classList.remove("drop-on");
        const id = (e.dataTransfer && e.dataTransfer.getData("text/plain")) || st.dragId;
        const col = drop.getAttribute("data-drop");
        if (id) moveTo(id, col);
      });
    });
    app.querySelectorAll(".board-card[draggable]").forEach(function (card) {
      card.addEventListener("dragstart", function (e) {
        st.dragId = card.getAttribute("data-id");
        try { e.dataTransfer.setData("text/plain", st.dragId); } catch (e2) { /* ignore */ }
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", function (e) { card.classList.remove("dragging"); });
    });
  }

  function find(id) { return st.tasks.find(function (t) { return t.id === id; }); }

  function onAction(act, id) {
    if (act === "reset") { st.tasks = genTasks(); persist(); render(); toast("🔄 已按目标重新生成本周任务"); return; }
    if (act === "add") { addManual(); return; }
    if (act === "start") { moveTo(id, "doing"); return; }
    if (act === "done") { moveTo(id, "done"); return; }
    if (act === "back") { moveTo(id, "todo"); return; }
    if (act === "redo") { moveTo(id, "todo"); toast("↺ 已移回待办，再来一次"); return; }
  }

  function moveTo(id, status) {
    const t = find(id);
    if (!t) return;
    const wasDone = t.status === "done";
    t.status = status;
    if (status === "done" && !wasDone) {
      creditCoach(t.min || DEFAULT_MIN);
      toast("✅ 完成：「" + t.title + "」——已计入打卡 +" + (t.min || DEFAULT_MIN) + " 分钟");
    }
    persist(); render();
  }

  function addManual() {
    const title = prompt("新任务标题（例如：练一遍句型克隆库）");
    if (!title) return;
    const g = goalId();
    const items = (GOAL_TASKS[g] || []);
    const def = items[Math.floor(Math.random() * Math.max(1, items.length))];
    st.tasks.push({ id: "t" + Date.now(), title: title, href: (def && def.href) || "#/tutor", labels: (def && def.labels) || ["口语"], min: (def && def.min) || DEFAULT_MIN, status: "todo", zone: "", due: "" });
    persist(); render();
  }

  /* ---------------- 只读「本周」摘要（P3：看板并入「今日」） ----------------
     专家评审结论：看板的**拖拽形态**是「赋权」（我决定优先级），而「今日」是「减负」
     （系统替我排好序）。把赋权型设计塞进减负型页面会稀释今日的权威性，用户会开始犹豫
     「到底照清单做还是照看板拖」；且一线反馈「没人拖拽」。故并入今日时只保留**只读视图**，
     以保证全站只有**一个计划源**。
     拖拽版渲染函数仍完整保留在本文件中（未被路由调用），如需恢复只需改路由。 */
  function weekSummaryHtml() {
    loadTasks();
    const tasks = st.tasks || [];
    if (!tasks.length) return '<div class="field-note">本周还没有任务。</div>';
    const done = tasks.filter(function (t) { return t.status === "done"; }).length;
    const doing = tasks.filter(function (t) { return t.status === "doing"; }).length;
    const rows = tasks.map(function (t) {
      const mk = t.status === "done" ? "✅" : (t.status === "doing" ? "🔄" : "⬜");
      return '<a class="wk-row' + (t.status === "done" ? " done" : "") + '" href="' + t.href + '">' +
        '<span class="wk-mk">' + mk + "</span>" +
        '<span class="wk-t">' + esc(t.title) + "</span>" +
        '<span class="wk-min">' + (t.min || DEFAULT_MIN) + " 分</span></a>";
    }).join("");
    return '<div class="wk-head"><b>本周任务（' + done + " / " + tasks.length + " 完成）</b>" +
      '<span>进行中 ' + doing + " · 待办 " + (tasks.length - done - doing) + "</span></div>" +
      '<div class="wk-list">' + rows + "</div>";
  }

  window.TaskBoard = { render: render, weekSummaryHtml: weekSummaryHtml };
})();
