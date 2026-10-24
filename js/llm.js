/* ============ 🧩 LLM 传输层 · 全站唯一实现（P2-12）============
   由来（评估报告：LLM 调用三处重复实现）：tutor.callChat / eval4.callLLM / speech.callLLM
   各自手写了一份「拼 URL + 拼 header + fetch + 解析 choices[0].message.content」，
   temperature/max_tokens 各不相同、错误文案逐字重复——漂移风险实打实存在
   （git 历史上 speech.js 的 no-key 语义就与 tutor 不一致过）。
   本模块把**传输层**收敛到一处；各调用方保留自己的 callChat/callLLM 薄委托
   （沿用各自的教学语义：温度 / max_tokens / 错误提示语），提示词与 FACT_GUARD
   仍归各模块与 tutor.js 所有（tools/test-ai-prompt-inventory.js 的门禁世界观不变）。

   导出（window.LLM）：
     cfg()                     解析 localStorage fte-tutor-cfg → 对象或 null
     isLocal(baseUrl)          是否本地端点（localhost/127.0.0.1/[::1]）
     ready(c)                  可用判定：本地端点免 Key，或填了 API Key（与 tutor.readyToChat 同口径）
     chat(messages, opts)      → Promise<回复文本>。opts: { temperature, maxTokens, cfg }
     probe(base, model, key)   连通性探针 → Promise<{ ok, status, body }>（调用方决定提示语）

   ⚠️ 口径：本模块**不做任何提示词组装、不加 FACT_GUARD**——那是调用方的职责
   （门禁会逐调用点核查）。这里只负责「把消息安全地送到模型、把回复完整地带回来」。 */
(function () {
  "use strict";

  const CFG_KEY = "fte-tutor-cfg";

  function cfg() {
    try {
      const c = JSON.parse(localStorage.getItem(CFG_KEY));
      return (c && typeof c === "object") ? c : null;
    } catch (e) { return null; }
  }

  function isLocal(baseUrl) {
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//i.test(String(baseUrl || "").replace(/\/+$/, "") + "/");
  }

  function ready(c) {
    if (!c || !c.baseUrl || !c.model) return false;
    return isLocal(c.baseUrl) || !!(c.apiKey || "").trim();
  }

  /* 唯一的 fetch 传输实现。opts.temperature 默认 0.3（判分类）、maxTokens 默认 700；
     教学对话类由 tutor 传 0.7/600。cfg 可显式传入（tutor 需要用「当前编辑中」的配置）。 */
  async function chat(messages, opts) {
    const o = opts || {};
    const c = o.cfg || cfg();
    if (!ready(c)) throw new Error("no-key");
    const url = String(c.baseUrl).replace(/\/+$/, "") + "/chat/completions";
    const hdr = { "Content-Type": "application/json" };
    if (c.apiKey && c.apiKey.trim()) hdr["Authorization"] = "Bearer " + c.apiKey.trim();
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({
          model: c.model, messages: messages,
          temperature: typeof o.temperature === "number" ? o.temperature : 0.3,
          max_tokens: o.maxTokens || 700
        })
      });
    } catch (e) {
      throw new Error("请求异常：" + (e && e.message ? e.message : "网络错误"));
    }
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

  /* 连通性探针：只报告事实（ok/status/body），提示语由调用方决定（tutor 的分诊 toast 不搬动） */
  async function probe(base, model, key) {
    const url = String(base).replace(/\/+$/, "") + "/chat/completions";
    const hdr = { "Content-Type": "application/json" };
    if (key && key.trim()) hdr["Authorization"] = "Bearer " + key.trim();
    const res = await fetch(url, {
      method: "POST",
      headers: hdr,
      body: JSON.stringify({ model: model, messages: [{ role: "user", content: "hi" }], max_tokens: 5 })
    });
    let body = "";
    try { body = await res.text(); } catch (e) { /* ignore */ }
    return { ok: res.ok, status: res.status, body: body };
  }

  window.LLM = { cfg: cfg, isLocal: isLocal, ready: ready, chat: chat, probe: probe, CFG_KEY: CFG_KEY };
})();
