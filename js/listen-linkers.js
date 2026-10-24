/* ============ 🔗 连读弱读 · 句级听辨（ListenLinkers，P1-7）============
   由来（评估报告：听力输入薄且单一）：词级辨音（最小音对）只到单词，
   真实语流里最磨耳朵的是「连读 / 弱读 / 缩读 / 同化」——词都认识、连起来就听不出。
   本模块把高频 linker（want to→wanna、did you→didja…）做成句级听辨卡：
   慢速完整形 / 慢速缩读形 / 常速整句 三路 A/B + 🎤 跟读录音回放。

   ⚠️ 诚实边界（与音素页同一纪律）：
     ① 本页**不打分**——识别不等于发音，句级跟读评分不可靠；A/B 对照是诚实的上限。
     ② TTS 念不出真正的连读（它会按拼写规规矩矩读），所以卡片给的是**缩读形拼写**
        （wanna / gonna / didja——这些是母语者真实说的话的拼写），TTS 能自然读出它们；
        你练的是「完整形怎么弱化成这个形」+「自己能不能说成这样」。
     ③ 例句全部取自外贸场景、人工核对；现象讲解是教学近似，以真实母语者音频为准
        （真实音频去「🎧 真实听音源」链出去听）。 */
(function () {
  "use strict";

  /* kind: 缩读（功能词合并）/ 同化（辅音被相邻音同化）/ 连读（词界辅元相连）/ 弱化（h 脱落/闪音） */
  const KINDS = { 弱读: "功能词弱读·缩读", 同化: "辅音同化", 连读: "词界连读", 弱化: "h 弱化 / 闪音" };

  const LINKERS = [
    { careful: "want to", reduced: "wanna", kind: "弱读", sent: "I want to send you our latest catalog.", cn: "我想把我们最新的目录发给你。", note: "want to 连读合并成 wanna——「我想要给你发」几乎从来不说全。客户语速下听到 wanna = want to。" },
    { careful: "going to", reduced: "gonna", kind: "弱读", sent: "We're gonna check the coating weight first.", cn: "我们会先检查上胶量。", note: "going to → gonna，将来时最常用的口语形。邮件里写 going to，嘴上说 gonna。" },
    { careful: "got to", reduced: "gotta", kind: "弱读", sent: "I gotta confirm the cut-off time with the forwarder.", cn: "我得跟货代确认截关时间。", note: "got to → gotta，「必须」。紧张语速下甚至只听到 gotta 一个词。" },
    { careful: "have to", reduced: "hafta", kind: "弱读", sent: "You hafta send the sample by courier.", cn: "样品得走快递寄。", note: "have to 的 h 弱化 + have 与 to 合并，听感是 hafta。" },
    { careful: "supposed to", reduced: "supposta", kind: "弱读", sent: "The goods are supposta arrive on Friday.", cn: "货应该周五到。", note: "supposed to 的 -ed 弱读几乎消失，听感 supposta。被动「应该」义别丢。" },
    { careful: "used to", reduced: "useta", kind: "弱读", sent: "We useta buy film from that supplier.", cn: "我们以前从那家供应商买膜。", note: "used to → useta，-d 只剩痕迹。「过去常常」的固定听感。" },
    { careful: "kind of", reduced: "kinda", kind: "弱读", sent: "The defect is kinda like a tunnel at the edge.", cn: "缺陷有点像边缘处的隧道（皱褶）。", note: "kind of → kinda，「有点」。模糊表达客户常用：It's kinda expensive。" },
    { careful: "a lot of", reduced: "a lotta", kind: "弱读", sent: "There's a lotta demand for solvent-free bags.", cn: "无溶剂袋的需求很大。", note: "lot of 的 t 闪音化（近似 d）+ of 弱读 → lotta。听到 lotta = a lot of。" },
    { careful: "lots of", reduced: "lotsa", kind: "弱读", sent: "Lotsa customers ask about migration limits.", cn: "很多客户问迁移限量。", note: "of 再弱只剩 /ə/，贴在前词上 → lotsa。" },
    { careful: "sort of", reduced: "sorta", kind: "弱读", sent: "It's sorta a trial order this time.", cn: "这次算是个试单。", note: "sort of → sorta，犹豫/留余地时高频。" },
    { careful: "because", reduced: "'cause", kind: "弱读", sent: "'Cause the film is thin, we need lower tension.", cn: "因为膜薄，我们需要更低的张力。", note: "口语里 because 常弱成 'cause（/kəz/）。听到 koz = because。" },
    { careful: "let me", reduced: "lemme", kind: "弱读", sent: "Lemme check the schedule and get back to you.", cn: "我查一下排期再答复你。", note: "let me → lemme。电话/会议里几乎只听到 lemme。" },
    { careful: "give me", reduced: "gimme", kind: "弱读", sent: "Gimme a minute to pull up your order.", cn: "给我一分钟调出你的订单。", note: "give me → gimme。客服高频。" },
    { careful: "did you", reduced: "didja", kind: "同化", sent: "Didja get our quotation by email?", cn: "你收到我们邮件报价了吗？", note: "did you 的 /d/ + /j/ 同化成 /dʒ/ → didja。问句开头最常见的「糊」音。" },
    { careful: "would you", reduced: "wouldja", kind: "同化", sent: "Wouldja mind sending the PI again?", cn: "方便把形式发票再发一次吗？", note: "would you → wouldja（/dʒ/）。礼貌请求在真实语速里从来不是 would-you 两个字。" },
    { careful: "meet you", reduced: "meechu", kind: "同化", sent: "Good to meechu at last, Mr. Smith.", cn: "史密斯先生，终于见到您了。", note: "meet you 的 /t/+/j/ 同化成 /tʃ/ → meechu。Nice to meet you 实际听感是 nie-ta-meechu。" },
    { careful: "don't you", reduced: "doncha", kind: "同化", sent: "Doncha think the price is a bit high?", cn: "你不觉得价格有点高吗？", note: "don't you → doncha。客户砍价时这句话糊成一团，要靠语境抓。" },
    { careful: "what do you", reduced: "whaddya", kind: "同化", sent: "Whaddya need for the trial order?", cn: "试单你需要什么？", note: "what do you 三词缩成 whaddya。听不懂开场问句多半是没认出它。" },
    { careful: "check it out", reduced: "check-i-tout", kind: "连读", sent: "Check-i-tout — the new pouch sample is here.", cn: "快看——新的自立袋样品到了。", note: "check it out 的 it 尾 t 与 out 头元音连读，词界完全重铸。" },
    { careful: "pick it up", reduced: "pick-i-tup", kind: "连读", sent: "The courier will pick-i-tup tomorrow morning.", cn: "快递明早来取件。", note: "连续两处词界连读。练法：把 it up 读成一个词 itup。" },
    { careful: "not at all", reduced: "no-ta-tall", kind: "连读", sent: "No-ta-tall — the MOQ is flexible for new customers.", cn: "完全不是问题——新客户起订量可以商量。", note: "三词两个连读点。not at all 实际是「一个词」的听感。" },
    { careful: "an apple", reduced: "a-napple", kind: "连读", sent: "Put a-napple in every lunch box — that's the application.", cn: "每份餐盒放一个苹果——这就是应用场景。", note: "an 的 n 送给后面的元音（连读劫持）：an apple → a napple。所有 an+元音 都这样。" },
    { careful: "tell him", reduced: "tell-im", kind: "弱化", sent: "Tell-im we need the DO by Friday.", cn: "告诉他我们周五前要提单。", note: "him 的 h 脱落 → tell-im。her 同理（ask-er）。宾格代词的 h 几乎总掉。" },
    { careful: "ask her", reduced: "ask-er", kind: "弱化", sent: "Ask-er whether the deposit is wired.", cn: "问她定金汇了没有。", note: "her → er。语速快时 ask her 只剩两个音节。" },
    { careful: "next call", reduced: "nex-call", kind: "弱化", sent: "I'll give you a nex-call after the meeting.", cn: "会后我再给你打个电话。", note: "next call 的 /t/ 与 /k/ 同点发音，只发一次（同类合并）→ nex call。" }
  ];

  const KEY_OPEN = "ftelk-open";
  const S = window.ListenLinkers && window.ListenLinkers._s ? window.ListenLinkers._s : { open: null, rec: null };
  window.ListenLinkers = { render: render, _s: S };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function speak(text, rate) {
    if (window.Player && window.Player.speak) window.Player.speak(text, { rate: rate || 1 });
  }

  function render() {
    const app = document.getElementById("app");
    if (!app) return;
    const open = S.open;
    const list = S.kind ? LINKERS.filter(function (L) { return L.kind === S.kind; }) : LINKERS;
    const cards = list.map(function (L) {
      const i = LINKERS.indexOf(L);
      const isOpen = open === i;
      const rec = S.rec && S.rec.i === i ? S.rec : null;
      let body = "";
      if (isOpen) {
        body =
          '<div class="lk-body" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line,#e2e8f0)">' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn btn-outline btn-sm" data-action="lk-say" data-i="' + i + '" data-r="0.7" data-t="careful">🔊 慢速 · 完整形</button>' +
          '<button class="btn btn-outline btn-sm" data-action="lk-say" data-i="' + i + '" data-r="0.7" data-t="reduced">🔊 慢速 · 缩读形</button>' +
          '<button class="btn btn-primary btn-sm" data-action="lk-say" data-i="' + i + '" data-r="1.05" data-t="sent">🔊 常速 · 整句</button>' +
          "</div>" +
          '<div style="margin-top:8px"><b>' + esc(L.sent) + "</b>" +
          '<div style="font-size:12.5px;color:var(--muted);margin-top:2px">' + esc(L.cn) + "</div></div>" +
          '<div style="margin-top:8px;font-size:13px;color:var(--muted)">💡 ' + esc(L.note) + "</div>" +
          '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          (rec && rec.busy
            ? '<button class="btn btn-primary btn-sm" data-action="lk-rec-stop" data-i="' + i + '">⏹ 说完了，停止录音</button><span class="field-note" style="margin:0">🔴 录音中…先听常速整句，留半秒跟着说</span>'
            : '<button class="btn btn-outline btn-sm" data-action="lk-rec-start" data-i="' + i + '">🎤 跟读录音（不打分）</button>') +
          (rec && rec.url ? '<button class="btn btn-soft btn-sm" data-action="lk-rec-play" data-i="' + i + '">▶ 回放我的</button>' : "") +
          "</div>" +
          '<div style="margin-top:6px;font-size:12px;color:var(--muted)">练法：常速整句 → 停 → 你说 → 回放对比 → 再听常速。说不出缩读形没关系，先让耳朵认出它。</div>' +
          "</div>";
      }
      return '<div class="card lk-card" style="margin-top:10px">' +
        '<button style="all:unset;cursor:pointer;display:flex;gap:10px;align-items:center;width:100%" data-action="lk-open" data-i="' + i + '" aria-expanded="' + (isOpen ? "true" : "false") + '">' +
        '<span class="badge badge-muted">' + esc(L.kind) + "</span>" +
        "<b>" + esc(L.careful) + ' → <span style="color:var(--accent)">' + esc(L.reduced) + "</span></b>" +
        '<span style="margin-left:auto;color:var(--muted);font-size:12px">' + (isOpen ? "收起 ▲" : "展开 ▼") + "</span>" +
        "</button>" + body + "</div>";
    }).join("");

    app.innerHTML =
      '<div class="page-head">' +
      '<div class="crumbs"><a href="#/home">首页</a> / 连读弱读</div>' +
      "<h2>🔗 连读弱读 <span class=\"en\">词都认识、连起来听不出——专治这个</span></h2>" +
      '<p style="margin-top:8px;max-width:820px;color:var(--muted)">真实语流里，功能词几乎从不「按拼写」说：want to 说成 <b>wanna</b>、did you 说成 <b>didja</b>。听不懂客户的话，十有八九不是词难，是这些「糊成一团」的形没认过。每组先<b>慢速对照</b>完整形与缩读形，再听<b>常速整句</b>，最后跟读录音回放。</p>' +
      '<p style="margin-top:6px;max-width:820px;color:var(--muted)"><b>诚实边界：</b>本页<b>不打分</b>（识别不等于发音，A/B 对照是诚实的上限）；TTS 按拼写读，真正的母语连读请去「🧰 工具箱 → 真实听音源」链出去听。例句都是外贸场景，缩读形就是母语者实际说的话的拼写。</p>' +
      '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">' +
      Object.keys(KINDS).map(function (k) {
        const n = LINKERS.filter(function (L) { return L.kind === k; }).length;
        return '<button class="scen-chip' + (S.kind === k ? " on" : "") + '" data-action="lk-kind" data-k="' + esc(k) + '" aria-pressed="' + (S.kind === k ? "true" : "false") + '">' + esc(k) + " · " + esc(KINDS[k]) + "（" + n + "）</button>";
      }).join("") +
      '<button class="scen-chip' + (!S.kind ? " on" : "") + '" data-action="lk-kind" data-k="" aria-pressed="' + (!S.kind ? "true" : "false") + '">全部（' + LINKERS.length + "）</button>" +
      "</div></div>" +
      '<div class="card" style="margin-top:12px;padding:12px 16px;font-size:13px;color:var(--muted)">' +
      "🎧 建议路线：先「弱读」组（最高频）→ 再「同化」组 → 每天挑 3–5 组，一周过完。</div>" +
      cards;
    window.scrollTo(0, 0);
  }

  if (typeof document !== "undefined") {
    document.addEventListener("click", function (e) {
      const el = e.target.closest("[data-action]");
      if (!el) return;
      const act = el.getAttribute("data-action");
      if (act.indexOf("lk-") !== 0) return;
      const i = parseInt(el.getAttribute("data-i"), 10);
      const L = LINKERS[i];
      if (act === "lk-open") { S.open = S.open === i ? null : i; render(); }
      else if (act === "lk-kind") { S.kind = el.getAttribute("data-k") || null; S.open = null; render(); }
      else if (act === "lk-say") {
        const which = el.getAttribute("data-t");
        const rate = parseFloat(el.getAttribute("data-r")) || 1;
        speak(which === "careful" ? L.careful : which === "reduced" ? L.reduced : L.sent, rate);
      }
      else if (act === "lk-rec-start") {
        const P = window.Player;
        if (!P || !P.canRecord || !P.canRecord()) { if (window.FTE_BOOT && window.FTE_BOOT.toast) window.FTE_BOOT.toast("当前环境不支持录音（需 localhost/HTTPS）"); return; }
        S.rec = { i: i, busy: true, url: null };
        render();
        P.micRequest().then(function () { return P.startRecording(); }).then(function () {
          if (S.rec && S.rec.i === i) render();
        }).catch(function () { S.rec = null; render(); });
      }
      else if (act === "lk-rec-stop") {
        const P = window.Player;
        if (!P || !P.stopRecording) return;
        P.stopRecording().then(function (url) {
          if (S.rec && S.rec.i === i) { S.rec.busy = false; S.rec.url = url || null; render(); }
        });
      }
      else if (act === "lk-rec-play") {
        if (S.rec && S.rec.url) new Audio(S.rec.url).play().catch(function () { /* 忽略 */ });
      }
    });
  }
})();
