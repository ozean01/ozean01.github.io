/* ============ 四维口语实战（软包装外贸 · 双评测链路） ============
   设计要点：把「四维评分」里的每一个维度交给【能可靠测量它的那一步】去判，
   并且每个维度都展示判定依据，避免用一个黑盒总分糊弄用户。
   - 维度1 专业术语发音（40%）：用户先跟读一句标准参考句，用浏览器 ASR 转写后
     与参考句逐词对齐，专抽其中的行业术语词算发音命中率 —— 发音由 ASR 判，可靠。
   - 维度2 语调流利度（30%）：来自同一句跟读的 漏读/多读/近似 占比 + 是否一次说顺 —— ASR 判。
   - 维度3 商务应答准确性（20%）：AI（LLM）扮演海外客户抛出一个追问，用户自由开口作答；
     LLM 只依据【用户实际说的文本】判断应答是否命中痛点、是否专业、是否答非所问 —— 内容由 LLM 判。
   - 维度4 表达逻辑性（10%）：同一段自由作答，LLM 判断条理是否清晰、有没有起承转合 —— LLM 判。
   复用现有配置：ASR 用浏览器（同 app.js 跟读评测）；LLM 复用「AI 陪练」已保存的
   fte-tutor-cfg（Base URL / 模型 / API Key，仅存本地）。未配 Key 时前两维仍可出分。 */

(function () {
  "use strict";

  const KEY = "fte-eval4-v1";
  const CFG_KEY = "fte-tutor-cfg";
  const MAX_SCORES = 40;

  const U = function () { return window.ASRUtil; };
  const esc = function (s) { return U().esc(s); };
  function toast(m) { U().toast(m); }
  function getProgress() { return U().getProgress(); }
  function saveProgress() { U().saveProgress(); }

  /* ---------------- 实战场景（软包装外贸 · 参考句 + AI 追问） ----------------
     参考句用于「跟读 → 发音/流利」；追问用于「自由开口 → 准确性/逻辑」。
     参考句必须是标准、得体的商务表达；追问要能逼出真实的行业应答。 */
  const SCENES = [
    {
      id: "inquiry",
      icon: "💬",
      title: "客户询盘回复",
      ref: "Thank you for your inquiry. Since the order quantity is below our MOQ of 10,000 pieces, we can still produce a trial batch for you at a slightly higher unit price.",
      refCn: "感谢您的询盘。由于订单数量低于我们 10,000 个的起订量，我们仍可为您生产一个小批量试单，单价会略高一些。",
      follow: "A buyer asks: \"Your price is 8% higher than your competitor. Can you give me a discount if I double the quantity?\"",
      followCn: "买家追问：你的价格比竞争对手高 8%。如果我数量翻倍，你能给我折扣吗？",
      terms: ["inquiry", "MOQ", "trial batch", "unit price"]
    },
    {
      id: "qc-claim",
      icon: "🛡️",
      title: "质量异议处理",
      ref: "I sincerely apologize for the quality issue. We will arrange a free replacement for the defective rolls and issue a credit note once we confirm the batch number.",
      refCn: "对质量问题我们深表歉意。确认批次号后，我们将为您免费更换有缺陷的卷膜，并开具退款单。",
      follow: "A buyer complains: \"The peel strength on your laminated film is much lower than the spec. I already shipped it to my customer. What are you going to do?\"",
      followCn: "买家投诉：你们复合膜的剥离强度远低于规格。我已经发货给客户了。你们打算怎么办？",
      terms: ["apologize", "replacement", "credit note", "batch number", "peel strength"]
    },
    {
      id: "lead-time",
      icon: "🚢",
      title: "交期与物流",
      ref: "The lead time for this order is 25 days after deposit. For urgent orders we can offer air freight at your cost to make the delivery date.",
      refCn: "此订单交期为收到定金后 25 天。若急需，我们可安排空运（费用由您承担）以确保到货日期。",
      follow: "A buyer asks: \"If I confirm today, can you guarantee delivery by the 20th? My customer will cancel if it's late.\"",
      followCn: "买家问：如果我今天确认，你能保证 20 号前到货吗？如果晚了我的客户会取消订单。",
      terms: ["lead time", "deposit", "air freight", "delivery date"]
    },
    {
      id: "negotiation",
      icon: "🤝",
      title: "价格谈判",
      ref: "We understand your budget. If you can increase the quantity, we would be happy to offer a volume discount, but we cannot go below our raw material cost.",
      refCn: "我们理解您的预算。如果您能增加数量，我们很乐意提供批量折扣，但不能再低于我们的原料成本。",
      follow: "A buyer pushes: \"Your competitor quoted 15% lower. If you don't match it, I'll have to switch suppliers.\"",
      followCn: "买家施压：你的竞争对手报价低 15%。如果你不跟进，我只能更换供应商。",
      terms: ["budget", "quantity", "volume discount", "raw material cost"]
    }
  ];

  const WEIGHTS = { term: 0.4, fluency: 0.3, accuracy: 0.2, logic: 0.1 };

  /* ---------------- 配置存取 ---------------- */
  function loadState() {
    try {
      const p = getProgress();
      if (!Array.isArray(p.eval4)) p.eval4 = [];
      return p.eval4;
    } catch (e) { return []; }
  }
  function saveScore(rec) {
    const list = loadState();
    list.unshift(rec);
    while (list.length > MAX_SCORES) list.pop();
    saveProgress();
  }

  function loadLLMCfg() {
    try {
      const c = JSON.parse(localStorage.getItem(CFG_KEY));
      if (c && c.baseUrl && c.model && c.apiKey) return c;
    } catch (e) { /* ignore */ }
    return null;
  }

  /* ---------------- LLM 调用（复用 fte-tutor-cfg 的端点与 Key） ---------------- */
  async function callLLM(messages) {
    const cfg = loadLLMCfg();
    if (!cfg) throw new Error("请先到「AI 陪练」配置模型 API Key（可复用同一份）");
    const url = cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.apiKey },
      body: JSON.stringify({ model: cfg.model, messages: messages, temperature: 0.3, max_tokens: 700 })
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 160); } catch (e) { /* ignore */ }
      throw new Error("API 错误 " + res.status + (detail ? "：" + detail : ""));
    }
    const data = await res.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error("接口返回格式异常");
    return content;
  }

  /* 让 LLM 给「开放应答」打 准确性/逻辑 两维分（0-100 每维）+ 一句依据 + 一句改进建议。
     输出严格 JSON：{"accuracy":0-100,"logic":0-100,"reason":"...","improve":"..."} */
  async function llmContentScore(scene, answer) {
    const sys = "You are a senior foreign-trade coach who grades a Chinese trade professional's spoken English answer. The topic is soft-packaging/lamination export. Judge ONLY the content quality of the answer, NOT grammar or pronunciation.\n" +
      "Criteria:\n" +
      "- accuracy (0-100): does the answer directly address the buyer's pressure/pain point? Does it sound professional and business-like in export trade? Deduct if it is off-topic, vague, evasive, or unrealistic.\n" +
      "- logic (0-100): is the answer well-structured (e.g. acknowledge -> explain -> solution -> reassurance)? Deduct if it jumps around or lacks a clear lead-in/close.\n" +
      "Reply with STRICT JSON only, no other text, in this exact shape: {\"accuracy\":0,\"logic\":0,\"reason\":\"one short sentence in Chinese explaining the score\",\"improve\":\"one short sentence in Chinese with a concrete way to improve\",\"doubt\":\"short list of any industry terms or expressions you are NOT confident about, comma-separated; if none, empty string\"}.\n" +
      "If the answer is empty or the student only apologized without addressing the issue, give low accuracy and note it.";
    const user = "Scene (the buyer's concern): " + scene.follow + "\nThe student's spoken answer: " + (answer || "(empty)");
    const raw = await callLLM([{ role: "system", content: sys }, { role: "user", content: user }]);
    let j;
    try {
      const m = String(raw).match(/\{[\s\S]*\}/);
      j = JSON.parse(m ? m[0] : raw);
    } catch (e) {
      j = null;
    }
    if (!j || typeof j.accuracy !== "number") {
      return { accuracy: null, logic: null, reason: "（无法解析 LLM 评分，请重试）", improve: "", doubt: "" };
    }
    return {
      accuracy: Math.max(0, Math.min(100, Math.round(j.accuracy))),
      logic: Math.max(0, Math.min(100, Math.round(j.logic))),
      reason: j.reason || "",
      improve: j.improve || "",
      doubt: String(j.doubt || "").trim()
    };
  }

  /* ---------------- 跟读评分（发音 + 流利，ASR 判） ---------------- */
  /* 参考句里抽「术语词」：由场景 terms 提供；计算术语词在转写中的命中率 */
  function termScore(refText, matched, terms) {
    const refWords = U().norm(refText).split(" ").filter(Boolean);
    if (!refWords.length) return 50;
    let ok = 0, total = 0;
    matched.forEach(function (m, i) {
      const w = refWords[i];
      total++;
      if (terms.indexOf(w) !== -1) { if (m.ok) ok++; }
    });
    /* 无术语词命中时降级：用整句单词命中近似 */
    if (terms.length && total) {
      const hitTerms = matched.filter(function (m) { return terms.indexOf(m.w) !== -1; });
      const termTotal = hitTerms.length;
      if (termTotal) return Math.round(hitTerms.filter(function (m) { return m.ok || m.near; }).length / termTotal * 100);
    }
    return Math.round(ok / Math.max(1, total) * 100);
  }

  function fluencyScore(ev) {
    /* 根据 近似/漏读/多读 推流利度：越接近标准句越好；读不全/多词则降 */
    const near = ev.matched.filter(function (m) { return m.errType === "near"; }).length;
    const miss = ev.missed || 0;
    const extra = ev.extra || 0;
    let s = 100 - near * 12 - miss * 15 - extra * 12;
    if (!ev.transcript) s = 0;
    return Math.max(0, Math.min(100, Math.round(s)));
  }

  /* ---------------- 界面 ---------------- */
  let state = null; // { sceneIdx, step: 'ref'|'answer', refEval, answer, content, scoring }

  /* 标签→场景索引映射，供「AI 陪练」按关键词跳转到对应场景 */
  const TAG_INDEX = {};
  SCENES.forEach(function (s, i) { TAG_INDEX[s.id] = i; });

  /* 允许从 AI 陪练一键带入：hash 写 #/eval4/<tag>，应答文本存 sessionStorage 的 fte-eval4-probe，
     同 tag 且 probe 携带 answer 时预填到输入框 */
  function prepareFromRoute() {
    try {
      const h = location.hash || "";
      const m = h.match(/eval4\/([a-z0-9-]+)/i);
      if (m && TAG_INDEX[m[1]] != null) state.sceneIdx = TAG_INDEX[m[1]];
      const probe = JSON.parse(sessionStorage.getItem("fte-eval4-probe") || "null");
      if (probe && probe.tag === SCENES[state.sceneIdx].id && probe.answer) {
        state.answer = probe.answer;
        sessionStorage.removeItem("fte-eval4-probe");
      }
    } catch (e) { /* ignore */ }
  }

  function render() {
    if (!state) { state = { sceneIdx: 0, step: "ref", refEval: null, answer: "", content: null, scoring: false }; prepareFromRoute(); }
    const s = state;
    const scene = SCENES[s.sceneIdx];
    const hasLLM = !!loadLLMCfg();
    const his = loadState();
    app.innerHTML =
      pageHeadHtml(scene, s, hasLLM) +
      scenePickerHtml() +
      refCardHtml(scene, s, hasLLM) +
      answerStepHtml(scene, s, hasLLM) +
      resultFourDimHtml(scene, s) +
      totalCardHtml(scene, s) +
      historyHtml(his);
    (function () {
      const el = document.querySelector('[data-listen="eval4-ref"]');
      if (el) el.focus();
    })();
    fillSentenceIpa(scene);   // 异步填充全句音标（失败自动回退术语词音标）
  }

  const app = document.getElementById("app");

  function pageHeadHtml(scene, s, hasLLM) {
    return `
    <div class="page-head">
      <h2>🎯 四维口语实战</h2>
      <div class="en">行业术语发音 40% · 语调流利度 30% · 商务应答准确性 20% · 表达逻辑性 10%</div>
      <div class="en" style="margin-top:4px;font-size:12.5px;color:var(--muted)">
        发音与流利度由「跟读参考句」的语音识别判定；应答准确性与表达逻辑由 AI 判定。
        ${hasLLM ? "" : "未配置模型 Key 时，仅前两维可出分（请到「AI 陪练」配置）。"}
      </div>
    </div>`;
  }

  function scenePickerHtml() {
    return `
    <div class="card" style="margin-top:12px">
      <div class="chat-head"><span>🗺 选择实战场景</span></div>
      <div class="starter-chips">
        ${SCENES.map(function (sc, i) {
          return '<button class="starter-chip' + (state.sceneIdx === i ? " cur" : "") + '" data-action="e4-scene" data-i="' + i + '">' + sc.icon + " " + esc(sc.title) + "</button>";
        }).join("")}
      </div>
    </div>`;
  }

  function refCardHtml(scene, s, hasLLM) {
    const ev = s.refEval;
    const ph = phoneticHint(scene, scene.ref);
    return `
    <div class="card" style="margin-top:12px">
      <div class="chat-head"><span>① 跟读标准参考句 <span class="stat-pill" style="font-size:12px">术语发音 · 流利度</span></span></div>
      <div class="dlg-line roleB" style="margin-top:10px">
        <span class="sp">标准</span>
        <div style="flex:1;min-width:0">
          <div class="en">${esc(scene.ref)}</div>
          <div class="cn">${esc(scene.refCn)}</div>
          ${ph ? '<div class="eval-phonetic">' + ph + '</div>' : '<div class="field-note" style="margin-top:4px">（按提示先留意句中的术语词读音）</div>'}
        </div>
        <button class="play-btn" data-action="e4-speak-ref" title="播放标准句">🔊</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
        <button class="btn btn-soft btn-sm" data-action="e4-eval-ref" ${U().Player.recognitionSupported() ? "" : "disabled"}>🎯 跟读评测（发音/流利）</button>
        ${hasAzurePA() ? '<button class="btn btn-ok btn-sm" data-action="e4-azure-pa" title="用发音设置里的 Azure Key，逐词逐音素打分，跨浏览器可用">🔎 Azure 音素级评测</button>' : ""}
        ${ev ? '<button class="btn btn-outline btn-sm" data-action="e4-clear-ref">重置</button>' : ""}
      </div>
      <div class="sentence-ipa" id="sentenceIpa" hidden></div>
      <div id="azurePAOut" class="sop-out az-pa" hidden></div>
      ${ev ? refEvalHtml(ev, scene) : '<p class="field-note" style="margin-top:8px">点击上方按钮，对着麦克风朗读整句（说完自动停止）。逐词命中越高，发音越准。</p>'}
    </div>`;
  }

  /* ---------- 全句音标：phonemizer.js（eSpeak NG wasm，英文句 → 连续 IPA） ----------
     本地 js/vendor/phonemizer.js 优先，其次 CDN；都失败则回退到"仅术语词音标"，不报错。 */
  var VENDOR_PHON = new URL("js/vendor/phonemizer.js", location.href).href;
  var CDN_PHON = "https://cdn.jsdelivr.net/npm/@xenova/phonemizer@latest/index.js";
  var phonemizerMod = null;
  var phonLoading = null;

  function ensurePhonemizer() {
    if (phonemizerMod) return Promise.resolve(phonemizerMod);
    if (phonLoading) return phonLoading;
    phonLoading = Promise.allSettled([
      import(VENDOR_PHON).catch(function () { return null; }),
      import(CDN_PHON).catch(function () { return null; })
    ]).then(function (rs) {
      var mod = null;
      for (var i = 0; i < rs.length; i++) { if (rs[i].status === "fulfilled" && rs[i].value) { mod = rs[i].value; break; } }
      if (!mod) throw new Error("phonemizer 未加载");
      phonemizerMod = mod;
      return mod;
    }).catch(function (e) { phonLoading = null; throw e; });
    return phonLoading;
  }

  function callPhonemize(mod, text) {
    var f = mod.phonemize || (mod.default && mod.default.phonemize);
    if (!f) throw new Error("phonemize 不可用");
    return f(text);
  }

  function fillSentenceIpa(scene) {
    var el = document.getElementById("sentenceIpa");
    if (!el) return;
    el.hidden = true;
    /* 等待渲染完成后异步尝试；失败则保持隐藏（也就是"仅术语词音标"那版） */
    ensurePhonemizer().then(function (mod) {
      return callPhonemize(mod, scene.ref);
    }).then(function (ipa) {
      if (!ipa) return;
      el.hidden = false;
      var safe = String(ipa).replace(/[<>]/g, "");
      el.innerHTML = '<div class="sentence-ipa-label">🔊 全句音标</div>' +
        '<div class="sentence-ipa-text">' + esc(safe) + "</div>";
    }).catch(function () { /* 静默回退：保持术语词音标 */ });
  }

  /* 参考句「待打分术语词」的目标音标。四维评分给「术语发音」打分，所以把
     这些词的高亮 + 音标（词汇表里有则显示）放在参考句下，让用户跟读前先看清重点。
     找不到音标的词也会高亮提示（说明这句要重点读它）。 */
  function phoneticHint(scene, ref) {
    const terms = scene.terms || [];
    const words = String(ref).replace(/[.,;:!?]/g, "").split(/\s+/).filter(Boolean);
    const seen = {};
    const chips = [];
    terms.forEach(function (t) {
      const key = t.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      const hit = U().lookupWord ? U().lookupWord(t) : null;
      const ipa = (hit && hit.ipa) ? " " + hit.ipa : "";
      chips.push('<span class="ph-word' + (ipa ? "" : " ph-nomatch") + '"><b>' + esc(t) + "</b>" + (ipa ? "<i>" + esc(ipa) + "</i>" : '<i class="ph-note">重点词</i>') + "</span>");
    });
    if (!chips.length) return "";
    return chips.join("") +
      '<span class="ph-note">待打分术语（术语发音计 40%）· 音标来自课程词汇表，点 ▶ 对照朗读</span>';
  }

  function refEvalHtml(ev, scene) {
    const cls = ev.term >= 80 ? "sc" : ev.term >= 50 ? "sm" : "sb";
    const cls2 = ev.fluency >= 80 ? "sc" : ev.fluency >= 50 ? "sm" : "sb";
    const targetHtml = ev.matched.map(function (m) {
      const isTerm = scene.terms.indexOf(m.w) !== -1;
      if (m.errType === "ok") return '<span class="wm ' + (isTerm ? "term" : "ok") + '">' + esc(m.w) + "</span>";
      if (m.errType === "near") {
        return '<span class="eval-pair"><span class="wm no' + (isTerm ? " term" : "") + '">' + esc(m.w) + "</span>" +
          '<span class="eval-said">≈' + esc(m.said) + "</span></span>";
      }
      return '<span class="wm no' + (isTerm ? " term" : "") + '">' + esc(m.w) + "</span>";
    }).join(" ");
    return `
    <div style="margin-top:12px;display:flex;gap:18px;flex-wrap:wrap">
      <div class="e4-dim"><span class="e4-label">术语发音</span><span class="${cls} e4-num">${ev.term}%</span><span class="e4-weight">×40%</span></div>
      <div class="e4-dim"><span class="e4-label">语调流利度</span><span class="${cls2} e4-num">${ev.fluency}%</span><span class="e4-weight">×30%</span></div>
    </div>
    <div class="eval-target" style="margin-top:10px">${targetHtml}</div>
    <div class="eval-transcript" style="margin-top:6px">识别到：${esc(ev.transcript) || "（未识别到语音）"}</div>
    <div class="eval-hint">💡 ${ev.hint}</div>`;
  }

  function answerStepHtml(scene, s, hasLLM) {
    return `
    <div class="card" style="margin-top:12px">
      <div class="chat-head"><span>② 自由开口应答 <span class="stat-pill" style="font-size:12px">应答准确性 · 表达逻辑</span></span></div>
      <div class="dlg-line roleA" style="margin-top:10px">
        <span class="sp">❓</span>
        <div style="flex:1;min-width:0">
          <div class="en">${esc(scene.follow)}</div>
          <div class="cn">${esc(scene.followCn)}</div>
        </div>
        <button class="play-btn" data-action="e4-speak-follow" title="播放买家提问">🔊</button>
      </div>
      <div class="chat-input-row" style="margin-top:10px">
        ${hasLLM ? '<button class="mic-btn ' + (s.scoring ? "" : "") + '" data-action="e4-answer-mic" title="语音输入：用浏览器在线识别，把你说的话填进输入框">🎤</button>' : ""}
        <input type="text" id="e4Answer" placeholder="开口回答买家的问题…（回车直接评分或先点 🎤 说）" value="${esc(s.answer)}" autocomplete="off">
        <button class="btn btn-primary" data-action="e4-grade" ${hasLLM && s.answer.trim() ? "" : "disabled"}>${s.scoring ? "AI 评分中…" : "✨ AI 评分"}</button>
      </div>
      ${!hasLLM ? '<p class="field-note" style="margin-top:6px">未配置模型 API Key：如想到「AI 陪练」配置后，这部分即可用 AI 评判应答准确性与逻辑性。</p>' : ""}
      <p class="field-note" style="margin-top:6px">💡 先点 🎤 用浏览器在线识别把你说的话转成英文（Chrome/Edge + 可访问 Google 时最好用），再点「AI 评分」；也可直接用键盘输入。</p>
      ${s.content ? contentHtml(s.content) : ""}
    </div>`;
  }

  function contentHtml(c) {
    const cls = (v) => v >= 80 ? "sc" : v >= 50 ? "sm" : "sb";
    return `
    <div class="e4-llm" style="margin-top:12px">
      <div class="e4-llm-grid">
        <div class="e4-dim"><span class="e4-label">应答准确性</span><span class="${cls(c.accuracy)} e4-num">${c.accuracy}%</span><span class="e4-weight">×20%</span></div>
        <div class="e4-dim"><span class="e4-label">表达逻辑性</span><span class="${cls(c.logic)} e4-num">${c.logic}%</span><span class="e4-weight">×10%</span></div>
      </div>
      ${c.reason ? '<div class="eval-hint" style="margin-top:8px">🎓 评分依据：' + esc(c.reason) + "</div>" : ""}
      ${c.improve ? '<div class="eval-hint" style="margin-top:6px">💡 改进建议：' + esc(c.improve) + "</div>" : ""}
      ${c.doubt ? '<div class="eval-check" style="margin-top:8px">⚠️ AI 对以下行业表述不太确定，建议到「术语库/正式资料」人工核对后再用于商务沟通：<b>' + esc(c.doubt) + "</b></div>" : ""}
    </div>`;
  }

  function resultFourDimHtml(scene, s) {
    if (!s.refEval && !s.content) return "";
    const term = s.refEval ? s.refEval.term : null;
    const flu = s.refEval ? s.refEval.fluency : null;
    const acc = s.content ? s.content.accuracy : null;
    const log = s.content ? s.content.logic : null;
    const dims = [
      { k: "term", label: "术语发音", val: term, w: WEIGHTS.term, soFar: "跟读·ASR" },
      { k: "flu", label: "语调流利度", val: flu, w: WEIGHTS.fluency, soFar: "跟读·ASR" },
      { k: "acc", label: "应答准确性", val: acc, w: WEIGHTS.accuracy, soFar: "应答·AI" },
      { k: "log", label: "表达逻辑性", val: log, w: WEIGHTS.logic, soFar: "应答·AI" }
    ];
    const bars = dims.map(function (d) {
      const v = d.val == null ? "" : d.val;
      const col = v === "" ? "var(--muted)" : (v >= 80 ? "var(--ok)" : v >= 50 ? "var(--accent)" : "var(--bad)");
      return `
      <div class="e4-bar">
        <span class="e4-bar-label">${d.label}${d.val == null ? " <em>待测</em>" : ""}</span>
        <span class="e4-bar-track"><i style="width:${d.val == null ? 0 : d.val}%;background:${col}"></i></span>
        <span class="e4-bar-val">${d.val == null ? "—" : d.val + "%"}</span>
        <span class="e4-bar-src">${d.soFar}</span>
      </div>`;
    }).join("");
    return `<div class="card" style="margin-top:12px">
      <div class="chat-head"><span>📊 四维评分总览</span></div>
      <div class="e4-bars">${bars}</div>
      <p class="field-note" style="margin-top:8px">完成「跟读」与「AI 应答」两步后，下方给出综合分并保存。</p>
    </div>`;
  }

  function totalCardHtml(scene, s) {
    const term = s.refEval ? s.refEval.term : null;
    const flu = s.refEval ? s.refEval.fluency : null;
    const acc = s.content ? s.content.accuracy : null;
    const log = s.content ? s.content.logic : null;
    if (term == null && acc == null) return "";
    let sum = 0, weightSum = 0;
    [[term, WEIGHTS.term], [flu, WEIGHTS.fluency], [acc, WEIGHTS.accuracy], [log, WEIGHTS.logic]].forEach(function (x) {
      if (x[0] != null) { sum += x[0] * x[1]; weightSum += x[1]; }
    });
    const total = weightSum ? Math.round(sum / weightSum) : null;
    const cls = total >= 80 ? "sc" : total >= 50 ? "sm" : "sb";
    return `
    <div class="card" style="margin-top:12px;text-align:center">
      <div style="font-size:13px;color:var(--muted)">综合分（按已完成维度加权）</div>
      <div class="e4-total ${cls}">${total == null ? "—" : total + " 分"}</div>
      <button class="btn btn-primary btn-sm" style="margin-top:8px" data-action="e4-save" ${total == null ? "disabled" : ""}>💾 保存本次成绩（本地）</button>
    </div>`;
  }

  function historyHtml(list) {
    if (!list.length) return "";
    const rows = list.slice(0, 8).map(function (r, i) {
      return `<div class="wb-item">
        <span class="wb-w">${r.icon} ${esc(r.title)}</span>
        <span class="wb-m">${r.total == null ? "—" : r.total + " 分"}</span>
        <span class="wb-e">发${r.term != null ? r.term : "—"} · 流${r.flu != null ? r.flu : "—"} · 准${r.acc != null ? r.acc : "—"} · 逻${r.log != null ? r.log : "—"}</span>
        <button class="learn-toggle" data-action="e4-his-del" data-i="${i}" title="删除">✕</button>
      </div>`;
    }).join("");
    return `<div class="card" style="margin-top:12px">
      <div class="chat-head"><span>📁 历史成绩（${list.length}）</span><span style="display:inline-flex;gap:6px">${list.length ? '<button class="btn btn-outline btn-sm" data-action="e4-his-clear">清空</button>' : ""}</span></div>
      ${rows || '<div class="empty" style="padding:16px"><div class="e-icon">📈</div>还没有四维实战成绩。</div>'}
    </div>`;
  }

  /* ---------------- 交互 ---------------- */
  function goScene(i) {
    state = { sceneIdx: i, step: "ref", refEval: null, answer: "", content: null, scoring: false };
    render();
  }

  function speakRef() {
    const scene = SCENES[state.sceneIdx];
    U().Player.speak(scene.ref, { rate: 0.95 });
  }
  function speakFollow() {
    const scene = SCENES[state.sceneIdx];
    U().Player.speak(scene.follow.replace(/^(A buyer asks:|A buyer complains:|A buyer pushes:)\s*/i, "").replace(/"/g, " "), { rate: 0.95 });
  }

  let evalRec = null;
  function evalRef() {
    if (evalRec) { try { evalRec.stop(); } catch (e) { /* ignore */ } evalRec = null; }
    const scene = SCENES[state.sceneIdx];
    const btn = document.querySelector('[data-action="e4-eval-ref"]');
    if (btn) { btn.disabled = true; btn.textContent = "🎙 正在听…"; }
    toast("🎙 请大声朗读整句（说完自动停止）");
    function done(transcript) {
      const ev = U().evaluateSpeech(scene.ref, transcript);
      const term = termScore(scene.ref, ev.matched, scene.terms);
      const flu = fluencyScore(ev);
      let hint;
      if (!transcript) hint = "未识别到语音：请靠近麦克风、放慢语速、在安静环境重试。";
      else if (ev.acc >= 85) hint = "整句说得很准，术语词也到位！可以进入第②步自由应答。";
      else if (ev.acc >= 70) hint = "不错！重点是把标红的行业术语（lamination / MOQ / peel strength 等）读准。";
      else hint = "建议先 0.7× 慢速听原声，逐词跟读；把开头的客套句与术语词分开练。";
      state.refEval = { term: term, fluency: flu, matched: ev.matched, transcript: transcript || "", hint: hint };
      toast("🎯 跟读评测完成：术语发音 " + term + "% · 流利度 " + flu + "%");
      if (btn) { btn.disabled = false; btn.textContent = "🎯 跟读评测（发音/流利）"; }
      render();
    }

    /* 若开启「本地离线识别」且可用，走 vosk；否则浏览器在线识别（webkit） */
    const useLocal = !!(U().getProgress() && U().getProgress().localASR && window.LocalASR);
    if (useLocal) {
      U().Player.micRequest().then(function () {
        toast("🎙 本地离线识别：朗读后点「停止」");
        let rec = window.LocalASR.record(function (mono) {
          toast("正在识别…");
          window.LocalASR.transcribe(mono).then(function (text) {
            done(text);
          }).catch(function (e) {
            toast("本地识别失败，回退浏览器在线识别：" + e.message);
            evalRefWebkit(scene, done, btn);
          });
        });
        /* 录音 2.5 秒后自动停止（说完一小段即可） */
        setTimeout(function () { try { rec && rec.stop(); } catch (e) { /* ignore */ } }, 2500);
      }).catch(function () { evalRefWebkit(scene, done, btn); });
      return;
    }
    evalRefWebkit(scene, done, btn);
  }

  function evalRefWebkit(scene, done, btn) {
    U().Player.micRequest().then(function () {
      evalRec = U().Player.recognize({
        lang: "en-US",
        onError: function (err) { done(""); if (U().Player.recErrorText) toast(U().Player.recErrorText(err)); },
        onEnd: done
      });
      if (!evalRec) {
        done("");
        toast("语音识别未启动，建议 Chrome / Edge 并允许麦克风权限");
      }
    }).catch(function (err) { done(""); toast(U().Player.recErrorText ? U().Player.recErrorText(err) : "麦克风不可用"); });
  }

  /* ---------- Azure 音素级发音评测（复用发音设置里的 Azure Key/Region） ---------- */
  const VENDOR_SDK = "js/vendor/microsoft.cognitiveservices.speech.sdk.bundle-min.js";
  const CDN_SDK = "https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk@latest/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js";
  let azureSDK = null;   // 已加载的全局 SpeechSDK 引用
  let azureSDKLoading = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("加载失败：" + src)); };
      document.head.appendChild(s);
    });
  }
  function ensureAzureSDK() {
    if (azureSDK) return Promise.resolve(azureSDK);
    if (azureSDKLoading) return azureSDKLoading;
    azureSDKLoading = loadScript(VENDOR_SDK)
      .then(function () { azureSDK = window.SpeechSDK || window.Microsoft && window.Microsoft.CognitiveServices && window.Microsoft.CognitiveServices.Speech; })
      .catch(function () {
        /* 本地无 vendor 文件则回退 CDN（Azure 评测本身需联网，故可接受） */
        return loadScript(CDN_SDK).then(function () { azureSDK = window.SpeechSDK || window.Microsoft && window.Microsoft.CognitiveServices && window.Microsoft.CognitiveServices.Speech; });
      })
      .then(function () { if (!azureSDK) throw new Error("Azure Speech SDK 未加载"); return azureSDK; })
      .catch(function (e) { azureSDKLoading = null; throw e; });
    return azureSDKLoading;
  }

  function hasAzurePA() {
    const p = U().getProgress();
    return !!(p && p.azureKey && p.azureRegion && p.azurePA !== false);
  }

  /* 把 Azure 返回的 JSON 解析成可读的分项 */
  function parseAzurePA(text, json) {
    const nbest = (json.NBest && json.NBest[0]) || {};
    const pa = nbest.PronunciationAssessment || {};
    const words = (nbest.Words || []).map(function (w) {
      return {
        word: w.Word,
        acc: w.PronunciationAssessment && w.PronunciationAssessment.AccuracyScore,
        err: w.PronunciationAssessment && w.PronunciationAssessment.ErrorType
      };
    });
    return { text: text, score: pa.PronScore, acc: pa.AccuracyScore, flu: pa.FluencyScore, comp: pa.CompletenessScore, words: words };
  }

  function azurePronounce() {
    if (!hasAzurePA()) { toast("还没配置 Azure Key/Region（见发音设置）；或未勾选「音素级发音评测」"); return; }
    const p = U().getProgress();
    const scene = SCENES[state.sceneIdx];
    const out = document.getElementById("azurePAOut");
    if (out) { out.hidden = false; out.innerHTML = '<p class="field-note">🔊 准备连接 Azure…</p>'; }
    toast("🔊 正在准备 Azure 音素级评测（需联网）…");
    ensureAzureSDK().then(function (SDK) {
      const config = SDK.SpeechConfig.fromSubscription(p.azureKey.trim(), p.azureRegion.trim());
      config.speechRecognitionLanguage = "en-US";
      const audio = SDK.AudioConfig.fromMicrophoneInput();
      const pron = new SDK.PronunciationAssessmentConfig(scene.ref, "en-US", SDK.PronunciationAssessmentGradingSystem.HundredMark, SDK.PronunciationAssessmentGranularity.PhonemeLevel, true);
      const rec = new SDK.SpeechRecognizer(config, audio);
      pron.applyTo(rec);
      if (out) out.innerHTML = '<p class="field-note">🎙 请大声朗读整句（说完自动停止）…</p>';
      rec.recognizeOnceAsync(function (res) {
        rec.close();
        try {
          const jsonStr = res.properties.getProperty(SDK.PropertyId.SpeechServiceResponse_JsonResult);
          const json = JSON.parse(jsonStr);
          const r = parseAzurePA(res.text, json);
          renderAzurePA(out, r, scene);
        } catch (e) {
          if (out) out.innerHTML = '<p class="sop-warn">解析 Azure 结果失败：' + esc(e.message) + "</p>";
          if (res.errorDetails) toast("Azure 错误：" + res.errorDetails);
          if (out) out.hidden = false;
        }
      }, function (err) {
        rec.close();
        toast("Azure 评测失败：" + (err && err.message || "未知"));
        if (out) { out.hidden = false; out.innerHTML = '<p class="sop-warn">评测失败，请确认 Key/Region 正确、已联网、已允许麦克风权限。</p>'; }
      });
    }).catch(function (e) {
      toast("加载 Azure SDK 失败：" + e.message);
      if (out) { out.hidden = false; out.innerHTML = '<p class="sop-warn">未找到本地 <code>js/vendor/microsoft...speech.sdk.bundle-min.js</code>，联网加载也失败。若有网请点「重新加载」，或把该文件放到上述 vendor 目录。</p>'; }
    });
  }

  function renderAzurePA(out, r, scene) {
    if (!out) return;
    state.azurePA = { r: r, scene: scene };
    const errCls = function (t) { return t === "None" ? "ok" : t === "Omission" ? "miss" : "bad"; };
    const wordsHtml = r.words.map(function (w) {
      return '<span class="az-word ' + errCls(w.err) + '"><b>' + esc(w.word) + "</b><i>" + (w.acc == null ? "—" : Math.round(w.acc)) + (w.err && w.err !== "None" ? " · " + esc(w.err) : "") + "</i></span>";
    }).join("");
    out.innerHTML =
      '<div class="az-scores">' +
      '<span><em>发音总分</em><b>' + Math.round(r.score || 0) + "</b></span>" +
      '<span><em>准确率</em><b>' + Math.round(r.acc || 0) + "</b></span>" +
      '<span><em>流利度</em><b>' + Math.round(r.flu || 0) + "</b></span>" +
      '<span><em>完整度</em><b>' + Math.round(r.comp || 0) + "</b></span>" +
      "</div>" +
      '<div class="az-words">' + (wordsHtml || "<p class='field-note'>（未返回逐词明细）</p>") + "</div>" +
      '<div class="sop-overall-a" style="margin-top:10px">' +
      '<button class="btn btn-primary btn-sm" data-action="e4-save-azure">💾 保存到四维成绩</button>' +
      '<span class="sop-hint">用作「术语发音 + 流利度 + 准确率」三格的官方分数，计入历史与首页概览。</span></div>' +
      '<p class="field-note">字深=分，绿=标准/较好，黄=漏读，红=错读。这是 Azure 官方逐音素模型给出的分数，跨浏览器且无需本地模型。</p>';
  }

  /* 把 Azure 得分并入「四维测评」历史：term=发音总分、flu=流利度、acc=准确率、log 空 */
  function saveAzure() {
    const az = state.azurePA;
    if (!az) { toast("还没有 Azure 评测结果，先点「🔎 Azure 音素级评测」"); return; }
    const term = Math.round(az.r.score || 0), flu = Math.round(az.r.flu || 0), acc = Math.round(az.r.acc || 0);
    let sum = 0, weightSum = 0;
    [[term, WEIGHTS.term], [flu, WEIGHTS.fluency], [acc, WEIGHTS.accuracy]].forEach(function (x) {
      if (x[0] != null) { sum += x[0] * x[1]; weightSum += x[1]; }
    });
    const total = weightSum ? Math.round(sum / weightSum) : null;
    saveScore({
      icon: az.scene.icon, title: az.scene.title + "（Azure）",
      term: term, flu: flu, acc: acc, log: null, total: total, time: Date.now()
    });
    toast("💾 已并入四维成绩（" + total + " 分），见首页概览");
    render();
  }

  /* 麦克风把用户的话转成英文填入输入框 */
  let micRec2 = null;
  function answerMic() {
    const inp = document.getElementById("e4Answer");
    if (micRec2) {
      try { micRec2.stop(); } catch (e) { /* ignore */ } micRec2 = null;
      if (inp) inp.focus();
      return;
    }
    if (!U().Player.recognitionSupported()) { toast("此浏览器不支持在线语音识别，请直接打字或用系统听写"); return; }
    U().Player.micRequest().then(function () {
      toast("🎙 正在听你说…说完自动填入");
      micRec2 = U().Player.recognize({
        lang: "en-US",
        onResult: function (text, isFinal) { if (isFinal && inp) { inp.value = text; toast("🎙 已识别，可修改后点「AI 评分」"); } },
        onError: function (err) { toast(U().Player.recErrorText ? U().Player.recErrorText(err) : "识别已停止"); },
        onEnd: function () { micRec2 = null; }
      });
      if (!micRec2) { toast("识别启动失败，可直接打字"); }
    }).catch(function (err) { toast(U().Player.recErrorText ? U().Player.recErrorText(err) : "麦克风不可用"); });
  }

  async function grade() {
    if (state.scoring) return;
    const scene = SCENES[state.sceneIdx];
    const inp = document.getElementById("e4Answer");
    const answer = (inp ? inp.value : state.answer).trim();
    if (!answer) { toast("请先说说你的应答再评分（或点 🎤 说）"); return; }
    state.answer = answer;
    state.scoring = true;
    toast("✨ AI 正在评判你的应答…");
    render();
    try {
      const content = await llmContentScore(scene, answer);
      state.content = content;
      state.scoring = false;
      render();
    } catch (err) {
      state.scoring = false;
      toast("评分失败：" + (err && err.message ? err.message : "未知错误"));
      render();
    }
  }

  function saveTotal() {
    const scene = SCENES[state.sceneIdx];
    const term = state.refEval ? state.refEval.term : null;
    const flu = state.refEval ? state.refEval.fluency : null;
    const acc = state.content ? state.content.accuracy : null;
    const log = state.content ? state.content.logic : null;
    let sum = 0, ws = 0;
    [[term, WEIGHTS.term], [flu, WEIGHTS.fluency], [acc, WEIGHTS.accuracy], [log, WEIGHTS.logic]].forEach(function (x) {
      if (x[0] != null) { sum += x[0] * x[1]; ws += x[1]; }
    });
    const total = ws ? Math.round(sum / ws) : null;
    const rec = {
      id: "e4-" + Date.now(),
      scene: scene.id, icon: scene.icon, title: scene.title,
      term: term, flu: flu, acc: acc, log: log, total: total, time: Date.now()
    };
    saveScore(rec);
    toast("💾 已保存成绩" + (total != null ? "：" + total + " 分" : ""));
    render();
  }

  document.addEventListener("click", function (e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const act = el.getAttribute("data-action");
    if (act.indexOf("e4-") !== 0) return;
    switch (act) {
      case "e4-scene": goScene(parseInt(el.getAttribute("data-i"), 10)); break;
      case "e4-speak-ref": speakRef(); break;
      case "e4-speak-follow": speakFollow(); break;
      case "e4-eval-ref": evalRef(); break;
      case "e4-azure-pa": azurePronounce(); break;
      case "e4-save-azure": saveAzure(); break;
      case "e4-clear-ref": state.refEval = null; render(); break;
      case "e4-answer-mic": answerMic(); break;
      case "e4-grade": grade(); break;
      case "e4-save": saveTotal(); break;
      case "e4-his-del": {
        const list = loadState();
        list.splice(parseInt(el.getAttribute("data-i"), 10), 1);
        saveProgress();
        render();
        break;
      }
      case "e4-his-clear": {
        if (confirm("确定清空四维实战历史成绩吗？")) {
          const p = getProgress();
          p.eval4 = [];
          saveProgress();
          render();
        }
        break;
      }
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target && e.target.id === "e4Answer") { e.preventDefault(); grade(); }
  });

  /* 带 tag 的 hash（#/eval4/<tag>）在路由切换后让场景预选生效 */
  window.addEventListener("hashchange", function () {
    if (!state) return;
    try {
      const m = (location.hash || "").match(/eval4\/([a-z0-9-]+)/i);
      if (m && TAG_INDEX[m[1]] != null && state.sceneIdx !== TAG_INDEX[m[1]]) {
        state.sceneIdx = TAG_INDEX[m[1]];
        state.refEval = null;
        render();
      }
    } catch (e) { /* ignore */ }
  });

  window.Eval4 = {
    render: render,
    /* 供「AI 陪练」四维评分按钮调用：带上场景 tag 与用户本场应答，跳到对应场景并预填 */
    entryPoint: function (tag, answer) {
      try {
        if (TAG_INDEX[tag] != null) state = { sceneIdx: TAG_INDEX[tag], step: "ref", refEval: null, answer: answer || "", content: null, scoring: false };
        else state = { sceneIdx: 0, step: "ref", refEval: null, answer: answer || "", content: null, scoring: false };
        location.hash = "#/eval4" + (TAG_INDEX[tag] != null ? "/" + tag : "");
      } catch (e) { location.hash = "#/eval4"; }
    },
    hasConfig: function () { return !!loadLLMCfg(); }
  };
})();
