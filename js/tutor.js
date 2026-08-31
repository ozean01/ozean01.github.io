/* ============ AI 口语陪练（Native Speaker 导师对话） ============
   依赖：window.TutorEnv（由 app.js 注入：esc / toast / progress / saveProgress / Player / lookupWord）
   通过 OpenAI 兼容的 chat/completions 接口调用（默认 DeepSeek，可换自定义端点）。
   注意：API Key 仅保存在本浏览器 localStorage，请勿在公共电脑上使用。 */
(function () {
  "use strict";

  const E = function () { return window.TutorEnv; };

  const CFG_KEY = "fte-tutor-cfg";
  const MAX_HISTORY = 24;   // 携带的历史消息条数（控制 token 消耗）
  const MAX_WORDBOOK = 200;

  /* ---------------- 配置 ---------------- */
  const PROVIDERS = {
    deepseek: { label: "DeepSeek（推荐，支持跨域）", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
    openai: { label: "OpenAI（浏览器可能被跨域拦截）", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    custom: { label: "自定义（任意 OpenAI 兼容端点）", baseUrl: "", model: "" }
  };

  const DEFAULT_SYSTEM_PROMPT = [
    "You are a native English speaker and a friendly, patient language tutor. Your goal is to help the student improve spoken English and listening so their expression becomes natural, fluent and idiomatic.",
    "Follow these rules strictly:",
    "1. ALWAYS converse in English. If the student writes in Chinese, translate it into natural English first, then continue the conversation in English. If the student writes in English, do NOT translate it into Chinese. Keep everything in an English environment.",
    "2. Be a real native speaker: talk naturally and casually, using everyday contractions and idioms — never stiff, bookish or robotic.",
    "3. Correction: whenever the student makes a grammar, word-choice or pronunciation mistake, correct it immediately, briefly and kindly. Ask them to repeat the corrected sentence (e.g. \"Say it again: ...\") and keep going until they say it correctly.",
    "4. Vocabulary: whenever a new word or phrase comes up, briefly teach its meaning and usage, and encourage the student to make a sentence with it. Mark every new vocabulary item exactly in this format: 【新词: word | meaning | example】",
    "5. Tone: always warm, patient and encouraging, like a teacher who genuinely cares. Praise real progress.",
    "Extra: keep replies short (2-4 sentences), ask ONE question at a time, and end most replies with a question so the conversation keeps flowing. Use simple words the student can follow."
  ].join("\n");

  /* 教练式预设：把「交流」与「纠错」分开——先容我把话说完整，每 3 轮集中复盘，
     卡住时只给关键词提示，结束时给 10 分制和下次重点。（来自 GPT Live 口练心得） */
  const COACH_PROMPT = [
    "You are a professional oral English coach for a Chinese foreign-trade professional. Speak as a friendly, natural native speaker who uses everyday contractions and idioms — never stiff, bookish or robotic.",
    "Always converse in English. If the student writes in Chinese, translate it into natural English first, then keep the conversation in English.",
    "Put communication FIRST: don't let this feel like a grammar exam. Support the conversation naturally and keep it flowing, the way two people really talk.",
    "If the student hesitates or asks \"how do you say…\", give only a keyword or a short prompt — do NOT supply the full sentence for them. Let the student say it.",
    "Add any new vocabulary exactly in this format: 【新词: word | meaning | example】 and invite the student to make their own sentence with it.",
    "Keep a warm, patient, encouraging tone and praise real progress."
  ].join("\n");

  /* 学习者画像：把「我是谁、练什么、想说多难、何时纠错」提前告诉 AI（文章第 03 步：先让它了解你） */
  function profileLines(profile) {
    if (!profile) return "";
    const L = ["STUDENT PROFILE (use this to set the difficulty and focus of the whole session):"];
    const level = (profile.level || "").trim();
    const goal = (profile.goal || "").trim();
    const scene = (profile.scene || "").trim();
    if (level) L.push("- English level: " + level + ". Adjust vocabulary, sentence length and speed to this level.");
    if (goal) L.push("- Main goal: " + goal + ". Keep the conversation focused on this goal.");
    if (scene) L.push("- Most needed scenario: " + scene + ". Bring in this type of situation often, as real role-play.");
    if (profile.useCn) L.push("- If the student is truly stuck, you may give the meaning in Chinese; otherwise keep everything in simple English.");
    else L.push("- If the student does not understand, re-explain in simpler English first; avoid Chinese unless it really helps.");
    return L.join("\n");
  }

  /* 根据教练规则开关生成追加到系统提示里的指令（把规则提前规定好，而非每次现讲） */
  function coachLines(coach) {
    const L = [];
    const m = coach && coach.correctMode;
    if (m === "each") {
      L.push("Correction: when the student makes a mistake, correct it immediately, briefly and kindly, ask them to repeat the corrected sentence, and keep going until it's right.");
    } else if (m === "end") {
      L.push("Correction: do NOT correct during the conversation. Take notes quietly and give all feedback in one summary at the end of the session.");
    } else { // round3 (default)
      L.push("Correction rhythm: do NOT interrupt to correct sentence by sentence. Let the student finish their thought. Every 3 exchanges, pause briefly and review the 2 most important errors, offer 1 more natural expression and 1 sentence worth repeating, then ask the student to say the corrected lines once or twice before the conversation continues.");
    }
    const p = coach && coach.pace;
    if (p === "lower") L.push("Speed: speak a little more slowly than a native and keep the vocabulary simple, so the student can follow.");
    else if (p === "higher") L.push("Speed: speak at a natural native pace to challenge the student.");
    else L.push("Speed: speak slightly above the student's level, not too fast, and don't dump too much at once. Keep each reply to 2-4 sentences and ask ONE question at a time.");
    /* 80% 可懂 + 20% 新：把「略高于当前水平」量化成可执行的输入难度（文章第 04 节） */
    if (coach && coach.iPlus) L.push("Input difficulty: aim for the student to understand about 80% of what you say and to meet about 20% new words or structures. Slightly above their level, never overwhelming. If they look lost, drop one level back.");
    if (coach && coach.waitDone) L.push("Turn-taking: when the student is several sentences in, wait until they say \"I'm done\" before you reply. Do not assume they're done from a short pause, and never finish their sentences for them.");
    if (coach && coach.correctFormat) L.push("When you review an error, present it in these 4 labeled lines so the student can compare:\n  ① My sentence (the original)\n  ② Correct grammar\n  ③ More natural\n  ④ Why it was wrong");
    if (coach && coach.score) L.push("At the end of the session, give the student a score out of 10 and name what to focus on next time, then suggest one small challenge for the next session.");
    if (coach && coach.termCheck) L.push("Content-verification mode: foreign-trade industry terminology (e.g. laminating, corona treatment, MOQ, peel strength) is exact and high-stakes. When the student produces or you supply such a term, briefly add a short note like [请人工核对术语：xxx] if you are not fully certain of its standard technical English, so the student double-checks it in their glossary before using it in real business.");
    if (coach && coach.concise) L.push("Feedback must be minimal and surgical (\"enough, and no simpler\"): explain at most ONE most-relevant point each time, review at most 2 errors per round, offer at most 1 more natural expression and 1 sentence worth repeating, then STOP. Do not over-explain, do not pile on extra grammar rules or alternative wordings, and stop once the student can confidently proceed. Precise and economical answers only — never a wall of text.");
    return L.join("\n");
  }

  function effectiveSystem(cfg) {
    const base = (cfg.systemPrompt || "").trim() || COACH_PROMPT;
    const prof = profileLines(cfg.profile);
    const extra = coachLines(cfg.coach);
    return [prof, base, extra].filter(function (s) { return s; }).join("\n");
  }

  function defaultCfg() {
    return {
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      apiKey: "",
      autoSpeak: true,
      systemPrompt: COACH_PROMPT,
      saved: [],   // 已保存的 Provider 列表 [{label, baseUrl, model, apiKey}]，切换模型不必重填 Key
      profile: { level: "", goal: "", scene: "", useCn: false },
      coach: { correctMode: "round3", pace: "normal", waitDone: false, score: true, iPlus: true, correctFormat: true, termCheck: false, concise: true }
    };
  }
  function loadCfg() {
    try {
      const c = JSON.parse(localStorage.getItem(CFG_KEY));
      if (c && typeof c === "object") return Object.assign(defaultCfg(), c);
    } catch (e) { /* ignore */ }
    return defaultCfg();
  }
  function saveCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) { /* ignore */ } }

  let cfg = loadCfg();
  let chatHistory = [];   // [{role:"user"|"assistant", content}]
  let sending = false;
  let rec = null;

  /* ---------------- 工具 ---------------- */
  const esc = function (s) { return E().esc(s); };

  function toast(m) { E().toast(m); }

  /* ---------------- 渲染 ---------------- */
  function render() {
    try {
      const hasKey = !!cfg.apiKey.trim();
      const root = document.getElementById("app");
      root.innerHTML = `
      <div class="page-head">
        <h2>🗣️ AI 口语陪练</h2>
        <div class="en">与 native speaker 全英文对话：说错立刻纠正 · 生词自动收录 · 回复一键朗读</div>
        <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn btn-outline btn-sm" href="#/coach">📘 使用手册 · 每日 20 分钟训练 →</a>
          ${(function () { try { var cl = E().getProgress().coachLast; return (cl && !cl.done && cl.seg > 0) ? '<a class="btn btn-soft btn-sm" href="#/coach">▶ 继续上次训练</a>' : ""; } catch (e) { return ""; } })()}
        </div>
      </div>
      ${configHtml(hasKey)}
      ${hasKey ? chatHtml() : noKeyHtml()}
      ${wordbookHtml()}
      ${hasKey ? reviewHtml() : ""}
      `;
      const cm = document.getElementById("chatMsgs");
      if (cm) cm.scrollTop = cm.scrollHeight;
      /* 从「7 天计划」跳转过来时，自动预填对应主题（提醒发送后开始） */
      (function () {
        try {
          const fill = localStorage.getItem("fte-tutor-fill");
          if (fill) {
            localStorage.removeItem("fte-tutor-fill");
            const inp = document.getElementById("chatInput");
            if (inp) { inp.value = fill; inp.focus(); toast("已填入 7 天计划主题，按 Enter 开始对话"); }
          }
        } catch (e) { /* ignore */ }
      })();
    } catch (err) {
      console.error(err);
      document.getElementById("app").innerHTML = '<div class="empty"><div class="e-icon">😵</div>陪练模块出错：' + esc(err.message) + '</div>';
    }
  }

  function configHtml(hasKey) {
    return `
    <div class="card tutor-config">
      <details ${hasKey ? "" : "open"}>
        <summary>⚙️ 模型设置 ${hasKey ? "（已配置 · 点击展开修改）" : "（未配置，请先填写 API Key）"}</summary>
        <div class="form-row">
          <div class="field"><label>服务商</label>
            <select id="tProvider">
              ${Object.keys(PROVIDERS).map(function (k) {
                return '<option value="' + k + '"' + (cfg.provider === k ? " selected" : "") + ">" + PROVIDERS[k].label + "</option>";
              }).join("")}
            </select>
          </div>
          <div class="field"><label>Base URL</label><input type="text" id="tBase" value="${esc(cfg.baseUrl)}" placeholder="https://api.deepseek.com"></div>
          <div class="field"><label>模型</label><input type="text" id="tModel" value="${esc(cfg.model)}" placeholder="deepseek-chat"></div>
        </div>
        <div class="form-row">
          <div class="field">
            <label>API Key（仅保存在本浏览器，不会上传到任何服务器）</label>
            <input type="password" id="tKey" value="${esc(cfg.apiKey)}" placeholder="sk-..." autocomplete="off">
          </div>
          <div class="field" style="display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" data-action="tutor-save">保存设置</button>
            <button class="btn btn-outline btn-sm" data-action="tutor-test" title="用当前填写的 Key 测试接口是否连通">🔍 测试连接</button>
            <label class="step-toggle" title="收到 AI 回复后自动朗读"><input type="checkbox" id="tAutoSpeak" ${cfg.autoSpeak ? "checked" : ""}> 自动朗读回复</label>
          </div>
        </div>
        <div class="tutor-saved">
          <div class="chat-head" style="margin-top:8px"><span>💾 已保存的服务商（切换不用重填 Key）</span>
            <button class="btn btn-outline btn-sm" data-action="tutor-save-to-list">➕ 把当前设置为一份</button></div>
          ${(cfg.saved || []).length ? '<div class="tutor-saved-list">' + cfg.saved.map(function (sp, i) {
            return '<div class="tutor-saved-item"><span>' + esc(sp.label || sp.baseUrl) +
              ' <em>' + esc(sp.model) + '</em></span>' +
              '<span class="tutor-saved-ops">' +
              '<button class="btn btn-soft btn-sm" data-action="tutor-apply-saved" data-i="' + i + '">应用</button>' +
              '<button class="btn btn-outline btn-sm" data-action="tutor-del-saved" data-i="' + i + '">删除</button>' +
              '</span></div>';
          }).join("") + '</div>' : '<p class="field-note" style="margin-top:6px">还没有保存过服务商。填好上面三项后点「➕ 把当前设置为一份」，以后 DeepSeek / 通义 / Moonshot 之间一键切换。</p>'}
        </div>
        <p class="field-note">
          💡 支持任意 OpenAI 兼容接口（DeepSeek / 通义 / Moonshot 等）。OpenAI 官方接口可能被浏览器跨域策略拦截，如遇报错可改用 DeepSeek 或本地代理。
          若想自定义导师人设与教学规则，可以编辑下方系统提示词。
        </p>
        <details class="coach-wrap">
          <summary class="sysprompt-toggle">🎯 教练规则（先规定好「何时聊天、何时纠错、纠错到什么程度」，保存后自动生效）</summary>
          <div class="coach-profile">
            <div class="coach-profile-title">👤 我的档案（先让教练了解你：水平 / 目标 / 场景，保存后自动注入）</div>
            <div class="form-row">
              <div class="field"><label>英语水平（例：初中到高中 / CET-4 / 外贸工作多年）</label><input type="text" id="pfLevel" value="${esc(cfg.profile && cfg.profile.level || "")}" placeholder="初中到高中水平"></div>
              <div class="field"><label>主要目标（例：日常交流 + 职场/外贸沟通）</label><input type="text" id="pfGoal" value="${esc(cfg.profile && cfg.profile.goal || "")}" placeholder="日常交流 + 外贸沟通"></div>
            </div>
            <div class="form-row">
              <div class="field"><label>最需要的场景（例：展会接待 / 询盘报价 / 客诉索赔）</label><input type="text" id="pfScene" value="${esc(cfg.profile && cfg.profile.scene || "")}" placeholder="展会接待、询盘报价"></div>
              <div class="field" style="display:flex;align-items:flex-end;gap:16px">
                <label class="step-toggle" title="听不懂时先用简单英语解释，实在不懂再用中文"><input type="checkbox" id="pfUseCn" ${cfg.profile && cfg.profile.useCn ? "checked" : ""}> 实在不懂可用中文</label>
              </div>
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label>纠错节奏</label>
              <select id="coachCorrect">
                <option value="round3"${cfg.coach && cfg.coach.correctMode === "round3" ? " selected" : ""}>每 3 轮集中复盘（推荐 · 不打断交流）</option>
                <option value="each"${cfg.coach && cfg.coach.correctMode === "each" ? " selected" : ""}>每句说完立刻纠正</option>
                <option value="end"${cfg.coach && cfg.coach.correctMode === "end" ? " selected" : ""}>全程不纠正，结束统一总结</option>
              </select>
            </div>
            <div class="field">
              <label>语速</label>
              <select id="coachPace">
                <option value="normal"${cfg.coach && cfg.coach.pace === "normal" ? " selected" : ""}>略高于我的水平（推荐）</option>
                <option value="lower"${cfg.coach && cfg.coach.pace === "lower" ? " selected" : ""}>放慢、用简单词</option>
                <option value="higher"${cfg.coach && cfg.coach.pace === "higher" ? " selected" : ""}>自然母语语速挑战</option>
              </select>
            </div>
          </div>
          <div class="form-row" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
            <label class="step-toggle" title="我说完前不要插话回应"><input type="checkbox" id="coachWait"${cfg.coach && cfg.coach.waitDone ? " checked" : ""}> 等我说完再回应（<b>I'm done</b> 后再答）</label>
            <label class="step-toggle" title="会话结束给出 10 分制评分与下次重点"><input type="checkbox" id="coachScore"${(cfg.coach && cfg.coach.score) || !cfg.coach ? " checked" : ""}> 结束给出 10 分制评分</label>
            <label class="step-toggle" title="让对话难度保持在「约 80% 可懂 + 20% 新表达」"><input type="checkbox" id="coachIPlus"${cfg.coach && cfg.coach.iPlus ? " checked" : ""}> 80% 可懂 + 20% 新</label>
            <label class="step-toggle" title="集中复盘时按「我的原句 / 正确版 / 更自然版 / 原因」四段式输出，解决中式英语"><input type="checkbox" id="coachFormat"${cfg.coach && cfg.coach.correctFormat ? " checked" : ""}> 四段式纠错</label>
            <label class="step-toggle" title="AI 对拿不准的行业术语会标注「请人工核对」，降低术语出错风险"><input type="checkbox" id="coachTermCheck"${cfg.coach && cfg.coach.termCheck ? " checked" : ""}> 行业术语人工核对提示</label>
            <label class="step-toggle" title="反馈要「点到为止」：每轮只讲透 1 个点、最多复盘 2 个错误、给 1 个更自然表达 + 1 句值得复述就停，避免 AI 讲太多让你学晕"><input type="checkbox" id="coachConcise"${(cfg.coach && cfg.coach.concise) || !cfg.coach ? " checked" : ""}> 点到为止（反馈给得刚好）</label>
            <button class="btn btn-soft btn-sm" data-action="tutor-preset" title="把系统提示词与规则一键重置为推荐的教练式预设">⤵ 一键教练预设</button>
          </div>
        </details>
        <details class="sysprompt-wrap">
          <summary class="sysprompt-toggle">📝 系统提示词（导师人设，可自定义）</summary>
          <textarea id="tSystem" rows="8" spellcheck="false">${esc(cfg.systemPrompt)}</textarea>
        </details>
      </details>
    </div>`;
  }

  function noKeyHtml() {
    return `
    <div class="card" style="text-align:center;padding:30px 20px;margin-top:14px">
      <div style="font-size:38px">🔑</div>
      <p style="margin:10px 0 4px"><b>先配置模型 API Key 即可开始对话</b></p>
      <p style="font-size:13px;color:var(--muted);max-width:520px;margin:0 auto 14px">
        在上方「模型设置」中填入你的 API Key（如 DeepSeek 开放平台的 sk- 密钥）并保存。
        练习过程中对话、纠错、生词教学都由该模型完成。
      </p>
      <button class="btn btn-primary" data-action="tutor-save">我已填写，保存设置</button>
    </div>`;
  }

  function chatHtml() {
    const msgs = chatHistory;
    return `
    <div class="card tutor-chat" style="margin-top:14px">
      <details class="sysprompt-wrap">
        <summary class="sysprompt-toggle">⏱ 每日 20 分钟训练模板（把开口变成刷牙一样容易的习惯）</summary>
        <div class="daily-loop">
          <div><b>3 分钟</b> 热身 · 答 2-3 个简单问题，让嘴巴进入状态</div>
          <div><b>8 分钟</b> 围绕一个真实外贸主题自由对话 · 保持连续表达</div>
          <div><b>5 分钟</b> 复盘 2-3 个问题（用下方「今日错题」先复述）</div>
          <div><b>4 分钟</b> 用修改后的句子重新表达 · 形成记忆与肌肉反应</div>
        </div>
        <p class="field-note" style="margin-top:6px">只有 5 分钟时，只做一个场景的问答也行。关键不是一次投入多少，而是<b>让开口随时启动</b>。把 80% 的高频复述交给 AI，把最需要发音诊断与真实社交压力的 20% 留给真人外教。</p>
      </details>
      <div class="chat-head">
        <span>💬 对话${msgs.length ? "（" + msgs.length + " 条）" : " —— 打个招呼开始吧！"}</span>
        <span style="display:inline-flex;gap:6px;flex-shrink:0">
          ${msgs.length ? '<button class="btn btn-soft btn-sm" data-action="tutor-eval4" title="把本场你的英文应答带到「四维口语实战」评分">🎯 四维评分本场对话</button>' : ""}
          <button class="btn btn-outline btn-sm" data-action="tutor-clear">🗑 清空对话</button>
        </span>
      </div>
      ${msgs.length ? "" : starterChipsHtml()}
      <div class="chat-msgs" id="chatMsgs">
        ${msgs.map(msgHtml).join("")}
        ${sending ? '<div class="chat-msg ai"><div class="typing"><i></i><i></i><i></i></div></div>' : ""}
      </div>
      <div class="chat-input-row">
        <button class="mic-btn ${micListening ? "listening" : ""}" data-action="tutor-mic" title="语音输入：用浏览器在线识别（Chrome/Edge + 可访问 Google 时最好用）">🎤</button>
        <input type="text" id="chatInput" placeholder="用英文或中文说点什么…（Enter 发送；语音点 🎤）" autocomplete="off">
        <button class="btn btn-primary" data-action="tutor-send">发送</button>
      </div>
      <div class="tutor-voice-hint">
        <span><b>🎙 语音输入</b>：点 🎤 用浏览器在线识别（需 Chrome/Edge + 连通 Google）；不生效时可用系统听写（聚焦输入框后按 <kbd>Win</kbd>+<kbd>H</kbd>）。</span>
        <span style="display:inline-flex;gap:6px;flex-shrink:0">
          <button class="btn btn-outline btn-sm" data-action="tutor-diag">🔍 诊断语音</button>
          <button class="btn btn-outline btn-sm" data-action="tutor-mic" title="浏览器在线识别">🎤 试说话</button>
        </span>
      </div>
    </div>`;
  }

  /* 一次选一个具体场景再练（比一句“练英语”更能持续开口） */
  function starterChipsHtml() {
    const starters = [
      { label: "展会接待", en: "Let's role-play: I am a buyer visiting your booth at a trade fair. Greet me, introduce your product, and ask ONE question at a time. Start in English." },
      { label: "询盘与报价", en: "Role-play: I am a new buyer asking about your price, MOQ and delivery time. Answer naturally, one question at a time. Start with a short greeting." },
      { label: "商务谈判", en: "Role-play: we are negotiating delivery time and price. Push back politely but stay friendly, and try to reach a deal. Start in English." },
      { label: "电话沟通", en: "Role-play: I call you about an order. Answer the phone, ask who is calling, and take a note. One question at a time. Start." },
      { label: "售后客诉", en: "Role-play: I am upset about a damaged shipment. You are customer service: apologize, confirm the issue, then propose a solution — all in English. Start." },
      { label: "合同与合规", en: "Role-play: I am your buyer and have received the goods but found a compliance or warranty issue. I want to talk about force majeure, a claim and the remedy, and I also ask whether the replacement film is EU food-contact compliant. You are the sales rep: respond professionally, discuss a solution, and confirm the compliance documents (declaration of conformity, certificate of analysis, migration test report). One point at a time. Start in English." },
      { label: "视频会议", en: "Role-play: this is a short online meeting. Greet me, recap one item, ask ONE question, and keep it brief. Start." },
      { label: "物流与货运", en: "Role-play: I ask about shipping, container and bill of lading. Explain in simple English, one question at a time. Start." },
      { label: "机场 / 酒店", en: "Role-play: I just landed and I am checking into a hotel. You are the receptionist; do the check-in in plain English. Start." },
      { label: "观点讨论", en: "Let's discuss one viewpoint: \"Will AI replace a lot of jobs?\" You state YOUR view first, then I respond. Discuss ONE point at a time. If my answer is too short, push me with follow-ups asking for a reason, an example and a counter-argument. When we finish, summarize 5 reusable opinion sentence patterns (like \"From my perspective…\", \"The main reason is…\", \"A good example would be…\", \"I agree to some extent, but…\")." },
      { label: "听力复述", en: "Listen-and-retell: tell me a short English story at A2-B1 level, under 80 words. Say it once at normal speed, then once more slowly. Then I will retell it in my own words. Do NOT require word-for-word; check only whether my main ideas, logic and naturalness are clear, then gently point out anything to improve." }
    ];
    return `<div class="starter-chips"><div class="starter-title">🎬 选一个场景开始对练（点击填入，再按发送）：</div>${starters.map(function (s) {
      return '<button class="starter-chip" data-action="tutor-fill" data-text="' + esc(s.en) + '">' + esc(s.label) + "</button>";
    }).join("")}</div>`;
  }

  function msgHtml(m, i) {
    if (m.role === "user") {
      return '<div class="chat-msg user"><div class="bubble">' + esc(m.content).replace(/\n/g, "<br>") + "</div></div>";
    }
    return `
    <div class="chat-msg ai">
      <div class="bubble">
        ${aiBodyHtml(m.content)}
        ${m.translated ? '<div class="cn" style="margin-top:8px;border-top:1px dashed var(--line);padding-top:6px">🌐 ' + esc(m.translated) + "</div>" : ""}
        <div class="chat-actions">
          <button class="btn btn-soft btn-sm" data-action="tutor-speak" data-i="${i}">🔊 朗读</button>
          <button class="btn btn-outline btn-sm" data-action="tutor-translate" data-i="${i}">🌐 翻译</button>
          <button class="btn btn-outline btn-sm" data-action="tutor-addreview" data-i="${i}" title="把这句加入「今日错题」清单，明天复述">➕ 今日错题</button>
        </div>
      </div>
    </div>`;
  }

  /* AI 回复正文：新词标注转高亮卡片 + 单词可点击加入生词本 */
  function aiBodyHtml(text) {
    const chips = [];
    const t1 = String(text).replace(/【[^】]*】/g, function (m) {
      const idx = chips.length;
      chips.push(markerChipHtml(m));
      return "\u0002" + idx + "\u0002";
    });
    const t2 = esc(t1);
    const t3 = t2.replace(/\n/g, "\u0000");
    const t4 = t3.replace(/(?<!&)[A-Za-z][A-Za-z0-9'’-]*/g, function (m) {
      return '<span class="wb-word" data-action="wb-add" data-word="' + m + '">' + m + "</span>";
    });
    const t5 = t4.replace(/\u0000/g, "<br>");
    return t5.replace(/\u0002(\d+)\u0002/g, function (_, idx) { return chips[+idx]; });
  }

  function markerChipHtml(m) {
    const inner = String(m).replace(/[【】]/g, "").trim();
    const parts = inner.split("|").map(function (s) { return s.trim(); });
    let word = (parts[0] || "").replace(/^新词[:：]\s*/i, "");
    let meaning = parts[1] || "";
    let example = parts[2] || "";
    return '<span class="wb-chip" title="已自动收录到下方学习词汇表">📖 ' + esc(word) +
      (meaning ? " — " + esc(meaning) : "") +
      (example ? " · " + esc(example) : "") + "</span>";
  }

  /* ---------------- 生词本 ---------------- */
  function getWordbook() {
    const p = E().getProgress();
    if (!Array.isArray(p.wordbook)) p.wordbook = [];
    return p.wordbook;
  }
  function pushWordbook(entry) {
    const wb = getWordbook();
    const key = entry.word.toLowerCase();
    const exist = wb.find(function (w) { return w.word.toLowerCase() === key; });
    if (exist) { exist.meaning = entry.meaning || exist.meaning; exist.example = entry.example || exist.example; return false; }
    wb.unshift(entry);
    while (wb.length > MAX_WORDBOOK) wb.pop();
    E().saveProgress();
    return true;
  }
  /* 解析 AI 回复中的【新词】并自动收录 */
  function collectVocab(reply) {
    const re = /【[^】]*】/g;
    const found = [];
    let m;
    while ((m = re.exec(reply)) !== null) found.push(m[0]);
    if (!found.length) return;
    let added = 0;
    found.forEach(function (raw) {
      const inner = raw.replace(/[【】]/g, "").trim();
      const parts = inner.split("|").map(function (s) { return s.trim(); });
      const word = (parts[0] || "").replace(/^新词[:：]\s*/i, "");
      if (!word) return;
      const known = E().lookupWord(word);
      if (pushWordbook({ word: word, meaning: parts[1] || (known ? known.cn : ""), example: parts[2] || (known ? known.ex : ""), source: "tutor", time: Date.now() })) added++;
    });
    if (added) toast("📖 已自动收录 " + added + " 个新词到学习词汇表");
  }

  function wordbookHtml() {
    const wb = getWordbook();
    return `
    <div class="card" style="margin-top:14px">
      <div class="chat-head">
        <span>📖 学习词汇表（${wb.length}）<span style="font-size:12px;color:var(--muted);font-weight:400"> · 点击 AI 回复中的任意英文单词也可手动添加</span></span>
        ${wb.length ? '<button class="btn btn-outline btn-sm" data-action="wb-clear">清空</button>' : ""}
      </div>
      ${wb.length
        ? wb.map(function (w, i) {
            return `<div class="wb-item">
              <span class="wb-w">${esc(w.word)}</span>
              ${w.meaning ? '<span class="wb-m">' + esc(w.meaning) + "</span>" : ""}
              ${w.example ? '<span class="wb-e">' + esc(w.example) + "</span>" : ""}
              <button class="play-btn" data-action="wb-play" data-i="${i}" title="朗读">🔊</button>
              <button class="learn-toggle" data-action="wb-del" data-i="${i}" title="删除">✕</button>
            </div>`;
          }).join("")
        : '<div class="empty" style="padding:16px"><div class="e-icon">📖</div>还没有生词。AI 回复中的【新词】会自动收录到这里。</div>'}
    </div>`;
  }

  /* ---------------- 今日错题 / 下次复习清单 ----------------
     把“说错/值得重说”的句子留下来，第二天不复述就白练了。 */
  function getReview() {
    const p = E().getProgress();
    if (!Array.isArray(p.tutorReview)) p.tutorReview = [];
    return p.tutorReview;
  }
  function sanitizeReviewText(s) {
    return String(s)
      .replace(/【[^】]*】/g, " ")
      .replace(/[#*_`>]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function addReviewText(text, source) {
    const t = sanitizeReviewText(text);
    if (!t) return false;
    const list = getReview();
    if (list.some(function (r) { return r.en.toLowerCase() === t.toLowerCase(); })) return false;
    list.unshift({ en: t, source: source || "manual", time: Date.now() });
    E().saveProgress();
    return true;
  }
  /* 让 AI 依据本次对话提炼“3 句最该重说的表达” */
  function genReview() {
    if (sending) { toast("正在对话中，稍候再生成"); return; }
    if (!cfg.apiKey.trim()) { toast("请先配置 API Key"); return; }
    if (!chatHistory.length) { toast("先聊几句再提炼今日错题吧"); return; }
    toast("🪄 正在根据本次对话提炼错句…");
    const transcript = chatHistory.map(function (m) {
      return (m.role === "user" ? "Student: " : "Coach: ") + sanitizeReviewText(m.content);
    }).join("\n");
    const msgs = [
      { role: "system", content: "You are a speaking coach. From the conversation transcript, pick exactly 3 sentences the student should repeat to improve: the 2 most important mistakes and 1 more natural or valuable expression. Output ONLY a list, one sentence per line, no numbering, no extra words." },
      { role: "user", content: transcript }
    ];
    callChat(msgs).then(function (reply) {
      const lines = String(reply).split(/\r?\n/).map(sanitizeReviewText).filter(function (l) {
        return l && !/^(student|coach|here|these|note|summary)/i.test(l);
      });
      let added = 0;
      lines.forEach(function (l) { if (addReviewText(l, "ai")) added++; });
      E().saveProgress();
      toast(added ? "🪄 已加入 " + added + " 句到今日错题清单" : "没有新句子可加入");
      render();
    }).catch(function (err) {
      toast("提炼失败：" + (err && err.message ? err.message : "未知错误"));
    });
  }

  /* 「四维评分本场对话」：把本次对话里学生的英文应答带到「四维口语实战」对应场景评分 */
  const E4_TAG_KEYWORDS = [
    { tag: "inquiry", kw: ["inquiry", "price", "moq", "quote", "询盘", "报价", "起订"] },
    { tag: "qc-claim", kw: ["quality", "defect", "peel", "complaint", "客诉", "投诉", "质量", "索赔", "剥离"] },
    { tag: "lead-time", kw: ["delivery", "shipping", "lead time", "交期", "物流", "货运", "到货"] },
    { tag: "negotiation", kw: ["negotiat", "discount", "协商", "谈判", "议价", "折扣", "降价"] }
  ];
  function eval4Scene() {
    if (!window.Eval4) { toast("四维口语实战模块未加载"); return; }
    const userMsgs = chatHistory.filter(function (m) { return m.role === "user"; });
    if (!userMsgs.length) { toast("先聊几句，我再把你这场的应答带去评分"); return; }
    /* 拼接本场学生的所有英文应答 */
    const answer = userMsgs.map(function (m) { return sanitizeReviewText(m.content); }).filter(Boolean).join(". ");
    /* 依据对话内容关键词匹配最贴近的外贸场景 */
    const all = answer.toLowerCase();
    let tag = null, best = 0;
    E4_TAG_KEYWORDS.forEach(function (e) {
      let score = 0;
      e.kw.forEach(function (w) { if (all.indexOf(w) !== -1) score++; });
      if (score > best) { best = score; tag = e.tag; }
    });
    if (tag) window.Eval4.entryPoint(tag, answer);
    else window.Eval4.entryPoint("inquiry", answer);
    toast(tag ? "🎯 已带去「四维口语实战」对应场景，可补一步跟读后出四维分" : "🎯 已带去「四维口语实战」，请选择最贴合的场景");
  }

  function reviewHtml() {
    const list = getReview();
    return `
    <div class="card" style="margin-top:14px">
      <div class="chat-head">
        <span>📌 今日错题 · 下次复习（${list.length}）<span style="font-size:12px;color:var(--muted);font-weight:400"> · 把说不顺的句子复述顺，第二天先复述它们</span></span>
        <span style="display:inline-flex;gap:6px;flex-shrink:0">
          <button class="btn btn-soft btn-sm" data-action="review-gen">🪄 让 AI 提炼本场错句</button>
          ${list.length ? '<button class="btn btn-outline btn-sm" data-action="review-clear">清空</button>' : ""}
        </span>
      </div>
      ${list.length
        ? list.map(function (r, i) {
            return `<div class="wb-item">
              <span class="wb-e" style="flex:1">${esc(r.en)}</span>
              <button class="play-btn" data-action="review-play" data-i="${i}" title="朗读复述">🔊</button>
              <button class="learn-toggle" data-action="review-del" data-i="${i}" title="已掌握，移除">✓</button>
            </div>`;
          }).join("")
        : '<div class="empty" style="padding:16px"><div class="e-icon">📌</div>还没有错句。可点 AI 回复上的「➕ 今日错题」，或聊完后让 AI 提炼本场错句。</div>'}
    </div>`;
  }

  /* ---------------- API 调用 ---------------- */
  async function callChat(messages) {
    const url = cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + cfg.apiKey
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 600
      })
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 200); } catch (e) { /* ignore */ }
      throw new Error("API 错误 " + res.status + (detail ? "：" + detail : ""));
    }
    const data = await res.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error("接口返回格式异常");
    return content;
  }

  function send() {
    if (sending) return;
    const input = document.getElementById("chatInput");
    const text = input ? input.value.trim() : "";
    if (!text) { toast("先输入或说出点什么吧"); return; }
    if (!cfg.apiKey.trim()) { toast("请先在上方模型设置中填写 API Key"); return; }
    input.value = "";
    chatHistory.push({ role: "user", content: text });
    appendWeekly("user", text);
    sending = true;
    render();

    const msgs = [{ role: "system", content: effectiveSystem(cfg) }]
      .concat(chatHistory.slice(-MAX_HISTORY));

    callChat(msgs).then(function (reply) {
      chatHistory.push({ role: "assistant", content: reply });
      collectVocab(reply);
      appendWeekly("assistant", reply);
      sending = false;
      render();
      if (cfg.autoSpeak) speakReply(reply);
    }).catch(function (err) {
      chatHistory.push({
        role: "assistant",
        content: "⚠️ " + (err && err.message ? err.message : "请求失败") +
          "\n\n（若提示跨域/网络错误：可尝试切换到 DeepSeek 服务商，或确认 Key 与网络正常后重试）"
      });
      sending = false;
      render();
    });
  }

  function speakReply(reply) {
    const clean = String(reply)
      .replace(/【[^】]*】/g, " ")
      .replace(/[#*_`>]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (clean) E().Player.speak(clean, { rate: cfgRate() });
  }
  function cfgRate() {
    const p = E().getProgress();
    return (p && p.rate) || 1;
  }

  /* ---------------- 语音输入（浏览器在线识别，VPN/代理可用时工作） ---------------- */
  let micListening = false;
  let micRec = null;

  function micToggle() {
    const input = document.getElementById("chatInput");
    if (micListening) {
      stopMic();
      if (input) input.focus();
      return;
    }
    if (!E().Player.recognitionSupported()) {
      if (input) input.focus();
      toast("此浏览器不支持在线语音识别，请用系统听写（Win+H）或直接打字");
      return;
    }
    /* 先请求麦克风权限 */
    E().Player.micRequest().then(function () {
      micListening = true;
      const btn = document.querySelector('[data-action="tutor-mic"]');
      if (btn) btn.classList.add("listening");
      const input = document.getElementById("chatInput");
      if (input) { input.placeholder = "🎙 正在听…请英文说话（说完自动填入）"; input.focus(); }
      micRec = E().Player.recognize({
        lang: "en-US",
        onResult: function (text, isFinal) {
          if (isFinal) {
            const inp = document.getElementById("chatInput");
            if (inp) inp.value = text;
            let b = document.querySelector('[data-action="tutor-mic"]');
            if (b) b.classList.remove("listening");
            micListening = false;
            toast("🎙 已识别，可修改后 Enter 发送");
          }
        },
        onError: function (err) {
          stopMic();
          toast(E().Player.recErrorText(err) || "识别已停止");
          const inp = document.getElementById("chatInput");
          if (inp) { inp.placeholder = "用英文或中文说点什么…（Enter 发送）"; inp.focus(); }
        },
        onEnd: function () {
          const b = document.querySelector('[data-action="tutor-mic"]');
          if (b) b.classList.remove("listening");
          micListening = false;
          const letinp = document.getElementById("chatInput");
          if (letinp && letinp.placeholder.indexOf("正在听") === 0) letinp.placeholder = "用英文或中文说点什么…（Enter 发送）";
        }
      });
      if (!micRec) { stopMic(); toast("识别启动失败，可用系统听写（Win+H）"); }
    }).catch(function (err) {
      if (input) input.focus();
      toast(E().Player.recErrorText(err));
    });
  }

  function stopMic() {
    micListening = false;
    if (micRec) { try { micRec.stop(); } catch (e) { /* ignore */ } micRec = null; }
    const b = document.querySelector('[data-action="tutor-mic"]');
    if (b) b.classList.remove("listening");
  }

  /* ---------------- 翻译一条 AI 回复 ---------------- */
  function translateMsg(i) {
    const m = chatHistory[i];
    if (!m || m.role !== "assistant") return;
    if (m.translated) { render(); return; }
    toast("🌐 正在翻译…");
    const msgs = [
      { role: "system", content: "You are a translator. Translate the user's English message into natural, concise Chinese. Reply with the Chinese translation ONLY." },
      { role: "user", content: m.content.replace(/【[^】]*】/g, " ") }
    ];
    callChat(msgs).then(function (t) {
      m.translated = t.trim();
      render();
    }).catch(function (err) {
      toast("翻译失败：" + (err && err.message ? err.message : "未知错误"));
    });
  }

  /* ---------------- 事件 ---------------- */
  function saveSettings() {
    const base = document.getElementById("tBase");
    const model = document.getElementById("tModel");
    const key = document.getElementById("tKey");
    const auto = document.getElementById("tAutoSpeak");
    const sys = document.getElementById("tSystem");
    const cc = cfg.coach || (cfg.coach = {});
    const cx = document.getElementById("coachCorrect");
    const px = document.getElementById("coachPace");
    const wx = document.getElementById("coachWait");
    const sx = document.getElementById("coachScore");
    const iPlus = document.getElementById("coachIPlus");
    const cfmt = document.getElementById("coachFormat");
    if (cx) cc.correctMode = cx.value;
    if (px) cc.pace = px.value;
    if (wx) cc.waitDone = wx.checked;
    if (sx) cc.score = sx.checked;
    if (iPlus) cc.iPlus = iPlus.checked;
    if (cfmt) cc.correctFormat = cfmt.checked;
    const cterm = document.getElementById("coachTermCheck");
    if (cterm) cc.termCheck = cterm.checked;
    const cconc = document.getElementById("coachConcise");
    if (cconc) cc.concise = cconc.checked;
    /* 我的档案 */
    const pf = cfg.profile || (cfg.profile = {});
    const pfLevel = document.getElementById("pfLevel");
    const pfGoal = document.getElementById("pfGoal");
    const pfScene = document.getElementById("pfScene");
    const pfUseCn = document.getElementById("pfUseCn");
    if (pfLevel) pf.level = pfLevel.value.trim();
    if (pfGoal) pf.goal = pfGoal.value.trim();
    if (pfScene) pf.scene = pfScene.value.trim();
    if (pfUseCn) pf.useCn = pfUseCn.checked;
    cfg.baseUrl = base.value.trim().replace(/\/+$/, "");
    cfg.model = model.value.trim();
    cfg.apiKey = key.value.trim();
    cfg.autoSpeak = auto.checked;
    if (sys) cfg.systemPrompt = sys.value.trim() || COACH_PROMPT;
    if (!cfg.baseUrl) { toast("请填写 Base URL"); return; }
    if (!cfg.model) { toast("请填写模型名称"); return; }
    saveCfg(cfg);
    toast(cfg.apiKey ? "✅ 设置已保存，开始对话吧！" : "✅ 设置已保存（尚未填写 API Key）");
    render();
  }

  /* ---- 已保存服务商列表：把当前设置存一份，切换不用重填 Key ---- */
  function currentAsSaved() {
    return { label: PROVIDERS[cfg.provider] ? PROVIDERS[cfg.provider].label : cfg.baseUrl, baseUrl: cfg.baseUrl, model: cfg.model, apiKey: cfg.apiKey };
  }
  function ensureSaved() { if (!Array.isArray(cfg.saved)) cfg.saved = []; }
  function saveToList() {
    ensureSaved();
    const item = currentAsSaved();
    /* 若同一 baseUrl+model 已存在则替换，避免重复堆积 */
    const idx = cfg.saved.findIndex(function (s) { return s.baseUrl === item.baseUrl && s.model === item.model; });
    if (idx >= 0) cfg.saved[idx] = item;
    else cfg.saved.push(item);
    saveCfg(cfg);
    toast("💾 已保存「" + item.label + " " + item.model + "」到列表");
    render();
  }
  function applySaved(i) {
    ensureSaved();
    const sp = cfg.saved[i];
    if (!sp) return;
    const base = document.getElementById("tBase");
    const model = document.getElementById("tModel");
    const key = document.getElementById("tKey");
    if (base) base.value = sp.baseUrl || "";
    if (model) model.value = sp.model || "";
    if (key) key.value = sp.apiKey || "";
    saveSettings();
  }
  function delSaved(i) {
    ensureSaved();
    if (cfg.saved[i]) { cfg.saved.splice(i, 1); saveCfg(cfg); toast("已删除该服务商"); render(); }
  }

  /* 一键：把系统提示词与教练开关重置为推荐文章里的预设 */
  function applyPreset() {    const c = defaultCfg();
    cfg.systemPrompt = c.systemPrompt;
    cfg.coach = c.coach;
    saveCfg(cfg);
    toast("⤵ 已应用教练式预设：先交流、每 3 轮复盘、卡住给关键词、结束 10 分制评分");
    render();
  }

  /* 用当前输入的 Key 快速验证接口连通性（不改动保存值，便于排查 Key 是否有效） */
  function testConn() {
    const base = document.getElementById("tBase");
    const model = document.getElementById("tModel");
    const key = document.getElementById("tKey");
    const b = base ? base.value.trim().replace(/\/+$/, "") : cfg.baseUrl;
    const m = model ? model.value.trim() : cfg.model;
    const k = key ? key.value.trim() : cfg.apiKey;
    if (!b || !m) { toast("请先填写 Base URL 和模型名"); return; }
    if (!k) { toast("请先填写 API Key"); return; }
    toast("🔍 正在测试连接…");
    const url = b + "/chat/completions";
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + k },
      body: JSON.stringify({ model: m, messages: [{ role: "user", content: "hi" }], max_tokens: 5 })
    }).then(function (res) {
      if (res.ok) { toast("✅ 连接成功！Key 有效，可开始对话"); return; }
      return res.text().then(function (body) {
        let extra = "";
        try { const j = JSON.parse(body); const msg = j && j.error && (j.error.message || j.error.code); if (msg) extra = "：" + String(msg).slice(0, 160); } catch (e) { /* ignore */ }
        if (res.status === 401) toast("⚠️ API 401——Key 无效或无权限。请到 DeepSeek 开放平台确认 Key 未过期、未停用，并完整复制后重试" + extra);
        else if (res.status === 402 || res.status === 400 && /balance|credit|quota|insufficient/i.test(body)) toast("⚠️ API 提示余额/配额不足——请到 DeepSeek 开放平台充值" + extra);
        else toast("⚠️ 接口返回 " + res.status + extra);
      });
    }).catch(function (err) {
      toast("⚠️ 连接失败（网络/跨域）：" + (err && err.message ? err.message : "请求异常") + "。可改用 DeepSeek 服务商，或检查 VPN/网络后重试");
    });
  }

  document.addEventListener("click", function (e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const act = el.getAttribute("data-action");
    if (act.indexOf("tutor-") !== 0 && act.indexOf("wb-") !== 0) return;

    switch (act) {
      case "tutor-save": saveSettings(); break;
      case "tutor-save-to-list": saveToList(); break;
      case "tutor-apply-saved": applySaved(parseInt(el.getAttribute("data-i"), 10)); break;
      case "tutor-del-saved": delSaved(parseInt(el.getAttribute("data-i"), 10)); break;
      case "tutor-test": testConn(); break;
      case "tutor-preset": applyPreset(); break;
      case "tutor-send": send(); break;
      case "tutor-mic": micToggle(); break;
      case "tutor-diag": {
        toast("🔍 正在检测语音服务…");
        E().Player.testSpeechReach().then(function (r) {
          let lines = [];
          lines.push("浏览器在线识别： " + (r.srSupported ? "✅ 支持 (Chrome/Edge)" : "❌ 不支持 (需 Chrome/Edge)"));
          if (r.timeout) lines.push("Google 可达性： ⏱ 检测超时");
          else lines.push("Google 可达性： " + (r.googleReachable ? "✅ 可达（在线识别应可用）" : "❌ 不可达（在线识别会失败，请检查 VPN/代理）"));
          toast(lines.join("\n"));
        });
        break;
      }
      case "tutor-fill": {
        const input = document.getElementById("chatInput");
        if (input) input.value = el.getAttribute("data-text");
        input && input.focus();
        break;
      }
      case "tutor-speak": {
        const m = chatHistory[parseInt(el.getAttribute("data-i"), 10)];
        if (m) speakReply(m.content);
        break;
      }
      case "tutor-translate": translateMsg(parseInt(el.getAttribute("data-i"), 10)); break;
      case "tutor-addreview": {
        const m = chatHistory[parseInt(el.getAttribute("data-i"), 10)];
        if (!m) break;
        const ok = addReviewText(m.content, "manual");
        E().saveProgress();
        toast(ok ? "📌 已加入今日错题，明天先复述这句" : "📌 这句话已在清单中");
        render();
        break;
      }
      case "review-gen": genReview(); break;
      case "tutor-eval4": eval4Scene(); break;
      case "review-play": {
        const r = getReview()[parseInt(el.getAttribute("data-i"), 10)];
        if (r) E().Player.speak(r.en, { rate: 0.85 });
        break;
      }
      case "review-del": {
        const list = getReview();
        list.splice(parseInt(el.getAttribute("data-i"), 10), 1);
        E().saveProgress();
        render();
        break;
      }
      case "review-clear": {
        if (confirm("确定清空「今日错题」清单吗？")) {
          const p = E().getProgress();
          p.tutorReview = [];
          E().saveProgress();
          render();
        }
        break;
      }
      case "tutor-clear":
        chatHistory = [];
        render();
        toast("对话已清空，重新开始吧！");
        break;
      case "wb-add": {
        const word = el.getAttribute("data-word");
        if (!word) break;
        const known = E().lookupWord(word);
        const added = pushWordbook({
          word: word,
          meaning: known ? known.cn : "",
          example: known ? known.ex : "",
          source: "click",
          time: Date.now()
        });
        if (added) { E().saveProgress(); render(); toast(known ? "📖 已加入词表：" + word + " — " + known.cn : "📖 已加入词表：" + word); }
        else { toast("已在词表中：" + word); }
        break;
      }
      case "wb-play": {
        const wb = getWordbook();
        const w = wb[parseInt(el.getAttribute("data-i"), 10)];
        if (w) E().Player.speak(w.word, { rate: 0.9 });
        break;
      }
      case "wb-del": {
        const wb = getWordbook();
        wb.splice(parseInt(el.getAttribute("data-i"), 10), 1);
        E().saveProgress();
        render();
        break;
      }
      case "wb-clear": {
        if (confirm("确定清空学习词汇表吗？")) {
          const p = E().getProgress();
          p.wordbook = [];
          E().saveProgress();
          render();
        }
        break;
      }
    }
  });

  document.addEventListener("change", function (e) {
    const t = e.target;
    if (!t) return;
    if (t.id === "tProvider") {
      const p = PROVIDERS[t.value];
      if (p) {
        cfg.provider = t.value;
        if (p.baseUrl) document.getElementById("tBase").value = p.baseUrl;
        if (p.model) document.getElementById("tModel").value = p.model;
      }
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target && e.target.id === "chatInput") {
      e.preventDefault();
      send();
    }
  });

  /* ---------------- 周学习记录（供「周学习报告」使用） ----------------
     把本周对话沉淀到本地，周末/第 7 天让 AI 生成本周学习报告（文章第 06 节）。 */
  function weekKey(t) {
    const d = t || new Date();
    const start = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
    return d.getFullYear() + "-W" + week;
  }
  function appendWeekly(role, content) {
    try {
      const p = E().getProgress();
      if (!p.coachWeekly || p.coachWeekly.wk !== weekKey()) p.coachWeekly = { wk: weekKey(), lines: [] };
      const clean = sanitizeReviewText(content);
      if (!clean) return;
      p.coachWeekly.lines.push((role === "user" ? "学生: " : "教练: ") + clean);
      if (p.coachWeekly.lines.length > 140) p.coachWeekly.lines = p.coachWeekly.lines.slice(-140);
      E().saveProgress();
    } catch (e) { /* ignore */ }
  }
  /* 让 AI 依据本周对话 + 错题 + 生词本生成结构化的「本周学习报告」 */
  async function weeklyReport() {
    if (!cfg.apiKey.trim()) throw new Error("请先在上方「模型设置」填写 API Key");
    const pi = E().getProgress();
    const wk = pi.coachWeekly || { wk: weekKey(), lines: [] };
    const review = getReview();
    const wb = getWordbook();
    const parts = [];
    parts.push("本周（" + wk.wk + "）口语陪练记录：");
    parts.push(wk.lines && wk.lines.length ? wk.lines.join("\n") : "（本周暂无对话记录）");
    if (review.length) parts.push("\n【今日错题 / 值得重说的句子】\n" + review.map(function (r) { return "- " + r.en; }).join("\n"));
    if (wb.length) parts.push("\n【本周生词】\n" + wb.map(function (w) { return "- " + w.word + (w.meaning ? "： " + w.meaning : ""); }).join("\n"));
    /* 本周的四维口语实战成绩：按场景汇总 + 各维度均值，供报告复盘 */
    (function () {
      try {
        const wk = weekKey();
        const list = (pi.eval4 || []).filter(function (r) { return r.time && weekKey(new Date(r.time)) === wk; });
        if (list.length) {
          const byScene = {};
          list.forEach(function (r) {
            if (!byScene[r.title]) byScene[r.title] = { n: 0, term: 0, flu: 0, acc: 0, log: 0, total: 0, ts: 0 };
            const g = byScene[r.title]; g.n++;
            ["term", "flu", "acc", "log", "total"].forEach(function (k) { if (r[k] != null) g[k] += r[k]; });
            if (r.time > g.ts) g.ts = r.time;
          });
          const lines = ["\n【本周四维口语实战成绩】"];
          Object.keys(byScene).forEach(function (t) {
            const g = byScene[t];
            lines.push("- " + t + "：完成 " + g.n + " 次，平均 " +
              "术语发音 " + (g.term / g.n).toFixed(0) + "% / 流利度 " + (g.flu / g.n).toFixed(0) + "% / 应答准确性 " + (g.acc / g.n).toFixed(0) + "% / 表达逻辑 " + (g.log / g.n).toFixed(0) + "% / 综合 " + (g.total / g.n).toFixed(0) + " 分");
          });
          lines.push("请依据上述四维成绩，在报告中指出各项的短板与下周应专项加强的维度（术语发音 / 流利度 / 应答准确性 / 表达逻辑）。");
          parts.push(lines.join("\n"));
        }
      } catch (e) { /* ignore */ }
    })();
    const msgs = [
      { role: "system", content: "You are a speaking coach. Based on the student's weekly practice record below, write a concise learning report in Chinese. Cover: 1) 已经掌握的表达, 2) 高频语法错误, 3) 经常想不起来的词汇, 4) 表达不自然的句子, 5) 数据里体现的口语短板与四维评测分析, 6) 下周最应该训练的 3 个主题, 7) 下周每天 20 分钟的练习计划. Keep it practical and encouraging, bullet style." },
      { role: "user", content: parts.join("\n\n") }
    ];
    return await callChat(msgs);
  }

  window.Tutor = { render: render, weeklyReport: weeklyReport, hasConfig: function () { return !!cfg.apiKey.trim(); } };
})();
