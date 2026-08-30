/* ============ 辨音训练 · 最小音对（Minimal Pairs）============
   专攻中国学习者最容易混淆的相似音素：播放一个词，用户从两个“近形音”词里选出听到的是哪个，
   反复强化音素区分（如 ship/sheep、bad/bed、very/worry、sink/think…）。
   发音依赖浏览器 TTS（Player）。分数与历史最好成绩保存在 localStorage。 */
(function () {
  "use strict";

  /* 每组 {a, b} 为一对最小音对；note 说明两个音素的差异（中文），用于答错后讲解 */
  var PAIRS = [
    { a: "ship", b: "sheep", note: "短音 /ɪ/ vs 长音 /iː/：ship 读得短促，sheep 拖长。" },
    { a: "chip", b: "cheap", note: "短音 /ɪ/ vs 长音 /iː/：chip 短促，cheap 拖长。" },
    { a: "live", b: "leave", note: "短音 /ɪ/ vs 长音 /iː/：live 短，leave 长（动词“离开”）。" },
    { a: "fill", b: "feel", note: "短音 /ɪ/ vs 长音 /iː/：fill 短，feel 长。" },
    { a: "slip", b: "sleep", note: "短音 /ɪ/ vs 长音 /iː/：slip 短（滑倒），sleep 长（睡觉）。" },
    { a: "this", b: "these", note: "短音 /ɪ/ vs 长音 /iː/：this 短，these 长。" },
    { a: "bad", b: "bed", note: "开口音 /æ/ vs /e/：bad 嘴张更大（坏的），bed 更收（床）。" },
    { a: "man", b: "men", note: "开口音 /æ/ vs /e/：man 单数（男人），men 复数。" },
    { a: "pen", b: "pan", note: "/e/ vs /æ/：pen 笔，pan 平底锅；先听清元音再选。" },
    { a: "cat", b: "cut", note: "/æ/ vs /ʌ/：cat 猫，cut 切；cat 张大口，cut 短促。" },
    { a: "cap", b: "cup", note: "/æ/ vs /ʌ/：cap 帽子，cup 杯子。" },
    { a: "very", b: "worry", note: "/v/ vs /w/：非常 vs 担忧；v 是齿唇音，w 是双唇音。" },
    { a: "vest", b: "west", note: "/v/ vs /w/：背心 vs 西方；v 上齿碰下唇。" },
    { a: "light", b: "right", note: "/l/ vs /r/：光 vs 右；l 舌尖抵上齿龈，r 舌尖卷起。" },
    { a: "collect", b: "correct", note: "/l/ vs /r/：收集 vs 正确；注意两个词中间的音素。" },
    { a: "sink", b: "think", note: "/s/ vs /θ/：下沉 vs 思考；th 是把舌尖放齿间。" },
    { a: "sick", b: "thick", note: "/s/ vs /θ/：生病 vs 厚；th 舌尖放齿间。" },
    { a: "sing", b: "thing", note: "/s/ vs /θ/：唱歌 vs 事物。" },
    { a: "leaf", b: "leave", note: "/f/ vs /v/：叶子 vs 离开；v 是浊音（声带振动）。" },
    { a: "fine", b: "vine", note: "/f/ vs /v/：好 vs 藤；f 清音，v 浊音。" },
    { a: "sin", b: "sing", note: "/n/ vs /ŋ/：罪恶 vs 唱歌；-ng 是后鼻音。" },
    { a: "thin", b: "thing", note: "/n/ vs /ŋ/：瘦 vs 事物；-ng 后鼻音。" },
    { a: "cheap", b: "jeep", note: "/tʃ/ vs /dʒ/：便宜 vs 吉普；ch 清，j 浊。" },
    { a: "watch", b: "wage", note: "/tʃ/ vs /dʒ/：观看 vs 工资。" },
    { a: "late", b: "let", note: "双元音 /eɪ/ vs /e/：late 读“累-特”，let 短促。" }
  ];

  var KEY = "fte-listen-v1";
  var State = { idx: 0, right: 0, total: 0, lastOK: null, pair: null, pick: null, answer: null, shuffled: null };
  var best = null;

  function loadBest() { try { best = JSON.parse(localStorage.getItem(KEY)); } catch (e) { best = null; } }
  function saveBest(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } }

  function shuffle(arr) {
    arr = arr.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function htmlEscape(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function currentWord() {
    return State.pick === "a" ? State.pair.a : State.pair.b;
  }
  function speak(word) { if (window.Player) window.Player.speak(word, { rate: 0.85 }); }
  function speakCurrent() { if (State.pair && State.pick) speak(currentWord()); }

  function render() {
    loadBest();
    var app = document.getElementById("app");
    if (!app) return;
    if (State.pair == null) { renderIntro(app); return; }
    renderRound(app);
  }

  function renderIntro(app) {
    var right = State.total ? Math.round(State.right / State.total * 100) : 0;
    var bestStr = best && best.pct != null ? '<span class="badge badge-ok" style="font-size:12.5px">💾 历史最好 ' + best.pct + '%</span>' : "";
    app.innerHTML =
      '<div class="page-head"><h2>👂 辨音训练 · 最小音对</h2>' +
      '<div class="en">听一个单词，从两个“近形音”里选出听到的是哪个 —— 专攻难辨元音/辅音，补足听力短板</div></div>' +
      '<div class="card mp-wrap" style="margin-top:18px">' +
      '<p style="font-size:14px;line-height:1.8;color:var(--muted)">' +
      '点击「▶ 开始」后，系统会播放 <b>一个</b> 单词（发音人朗读），你从屏幕上 <b>两个单词</b> 中选择听到的那个。' +
      '若选错会立刻高亮正确答案并给出两个音素的差别讲解，方便对比听辨。</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;align-items:center">' +
      '<button class="btn btn-primary" data-action="mp-start">▶ 开始辨音（' + PAIRS.length + ' 组）</button>' +
      '<button class="btn btn-outline" data-action="mp-reset">重置学习进度</button>' +
      bestStr +
      '</div>' +
      (State.total
        ? '<div class="stat-card" style="margin-top:16px"><div class="num">' + right + '%</div>' +
          '<div class="lbl">本次正确率 · 完成 ' + State.total + ' 题，答对 ' + State.right + ' 题</div>' +
          '<button class="btn btn-soft btn-sm" style="margin-top:8px" data-action="mp-start">继续下一轮 →</button></div>'
        : "") +
      '</div>';
  }

  function renderRound(app) {
    var p = State.pair;
    var correctKey = State.pick;
    var opts = [{ k: "a", w: p.a }, { k: "b", w: p.b }];
    var answered = State.lastOK != null;
    app.innerHTML =
      '<div class="page-head">' +
      '<div class="crumbs"><a href="#/listen" data-action="mp-back">辨音训练</a> / 第 ' + (State.idx + 1) + ' / ' + PAIRS.length + ' 组</div>' +
      '<h2>👂 辨音：你听到的是哪一个？</h2>' +
      '<div class="en">已答 <b style="color:var(--ok)">' + State.right + '</b> / ' + State.total + ' 正确</div></div>' +
      '<div class="card mp-wrap" style="margin-top:10px">' +
      '<div style="text-align:center;margin-bottom:6px">' +
      '<button class="btn btn-primary" style="font-size:16px;padding:12px 22px" data-action="mp-replay">🔊 再听一遍</button>' +
      '<div style="font-size:12.5px;color:var(--muted);margin-top:8px">第一次听不清可点“再听一遍”，或先不看屏幕只听</div>' +
      '</div>' +
      '<div class="mp-pair">' +
      opts.map(function (o) {
        var cls = "", dis = "";
        if (answered) {
          dis = "disabled";
          if (o.k === correctKey) cls = "correct";
          else if (o.k === State.answer) cls = "wrong";
        }
        return '<button class="mp-opt ' + cls + '" ' + dis + ' data-action="mp-opt" data-k="' + o.k + '">' + htmlEscape(o.w) + '</button>';
      }).join("") +
      '</div>' +
      (answered
        ? '<div class="mp-feedback ' + (State.lastOK ? "ok" : "no") + '">' +
          '<b>' + (State.lastOK ? "✓ 答对了！" : "✗ 正确答案是 " + currentWord()) + '</b>' +
          '<div style="margin-top:6px">💡 ' + htmlEscape(p.note) + '</div>' +
          '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn btn-primary btn-sm" data-action="mp-next">下一组 →</button>' +
          '<button class="btn btn-outline btn-sm" data-action="mp-replay">🔊 重听这组</button></div>' +
          '</div>'
        : "") +
      '<div style="margin-top:14px"><button class="btn btn-outline btn-sm" data-action="mp-exit">结束本轮</button></div>' +
      '</div>';
  }

  function start() {
    State.idx = 0; State.right = 0; State.total = 0; State.lastOK = null; State.answer = null;
    State.shuffled = shuffle(PAIRS);
    State.pair = State.shuffled[State.idx];
    State.pick = Math.random() < 0.5 ? "a" : "b";
    render();
    speakCurrent();
  }

  function nextRound() {
    State.lastOK = null; State.answer = null;
    State.idx++;
    if (State.idx >= State.shuffled.length) { finish(); return; }
    State.pair = State.shuffled[State.idx];
    State.pick = Math.random() < 0.5 ? "a" : "b";
    render();
    speakCurrent();
  }

  function choose(k) {
    if (State.lastOK != null) return;
    State.answer = k;
    State.total++;
    var ok = k === State.pick;
    if (ok) State.right++;
    State.lastOK = ok;
    render();
  }

  function finish() {
    var pct = State.total ? Math.round(State.right / State.total * 100) : 0;
    var prevBest = best ? (best.pct || 0) : 0;
    var pctState = pct;
    if (pctState > prevBest) { best = { pct: pctState, n: State.total, t: Date.now() }; saveBest(best); }
    var app = document.getElementById("app");
    app.innerHTML =
      '<div class="page-head"><h2>🎉 本轮辨音完成</h2></div>' +
      '<div class="card result-box" style="max-width:520px;margin:18px auto">' +
      '<div style="font-size:42px">' + (pctState >= 85 ? "🏆" : pctState >= 60 ? "💪" : "📖") + '</div>' +
      '<div class="score ' + (pctState >= 85 ? "good" : pctState >= 60 ? "mid" : "bad") + '">' + pctState + '%</div>' +
      '<p>答对 <b>' + State.right + '</b> / ' + State.total + ' 组（共 ' + PAIRS.length + ' 组）' +
      (pctState > prevBest ? " · 刷新纪录！" : "") + '</p>' +
      '<p style="font-size:13px;color:var(--muted)">历史最好 ' + (best ? best.pct : "--") + '%</p>' +
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px">' +
      '<button class="btn btn-primary" data-action="mp-start">再来一轮</button>' +
      '<button class="btn btn-outline" data-action="mp-exit">回到说明</button></div></div>';
  }

  /* --- 事件 --- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");
    if (action === "mp-start") { start(); }
    else if (action === "mp-replay") { speakCurrent(); }
    else if (action === "mp-opt") { choose(el.getAttribute("data-k")); }
    else if (action === "mp-next") { nextRound(); }
    else if (action === "mp-exit" || action === "mp-back") { State.pair = null; State.shuffled = null; State.lastOK = null; if (window.Player && window.Player.stop) window.Player.stop(); render(); }
    else if (action === "mp-reset") {
      best = null;
      try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
      State.idx = 0; State.right = 0; State.total = 0; State.pair = null; State.shuffled = null; State.lastOK = null;
      render();
    }
  });

  window.Listen = { render: render };
})();
