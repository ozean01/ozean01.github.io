/* ============ 🌐 全英模式（English-only · 沉浸显示）============
   由来：外部分享里被长期使用的全英站点（Engoo 一类）明确「没有中文翻译」，
   而使用者依然用得下去——说明对已经上手的人，**中文是最先该被拿掉的拐杖**。
   这条判断站内其实早就有了：字幕四档（全部 → 英语 → 隐藏 → 中文）把中文刻意留到最后，
   并写明「一上来就看中文最容易骗自己听懂了」。但那只是字幕页里的一个档位；
   词条、对话、SOP、来信注释这些地方**一律中英并排**，想全英练的人无处可切。
   本模块把「全英」从**字幕页的档位**提升为**全站显示偏好**。

   ⚠️ 四条边界（越界就不是沉浸，而是让人做不了题）：
     ① **只隐藏「与英文并排的译文」**。判分依据与答案面一律不动：单词卡背面（看英文想中文的
        答案面）、测验题干与选项、易错点的正确说法、AI 对话里用户主动点的「翻译」、
        四维实战参考句的中文——这些隐藏掉不是沉浸，是让人对不了答案、说不出口。
     ② **一键可回**：右下角浮标点一下立刻显示中文（**临时查看**，不改偏好），
        换页自动收回全英。偏好只存 localStorage，不写任何学习数据、不计打卡。
     ③ **不新增导航、不新增路由、不新增第 6 步**：它只是 <html> 上的一个 class。
     ④ **覆盖清单只有一处权威定义** = 下面的 ZH_SELECTORS，CSS 里有一份同名单，
        两处必须一起改；tools/test-immerse-weekly.js 会对账，并对「不该隐藏的地方」设守卫。 */
(function () {
  "use strict";
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const KEY = "fte-immerse";              // 存储键，已登记于 js/storage-keys.js（backup: true）
  /* ⚠️ CSS 类名刻意**不带 fte- 前缀**：`fte-*` 在本地是**存储键**的命名空间，
     tools/test-security.js 会把代码里出现的每个 `fte-*` 字符串当成存储键来对账。
     一个既是 class 又叫 fte-immerse 的名字会同时踩两个语义，故 class 用 immerse-* 命名。 */
  const ON_CLASS = "immerse-on";          // 挂在 <html> 上
  const PEEK_CLASS = "immerse-peek";      // 「临时看中文」：与 ON_CLASS 同时存在时抑制隐藏

  /* ---------------- 覆盖清单（唯一权威定义） ----------------
     每一项都必须真的存在于站内渲染代码里，且语义是「英文旁边的译文」。
     增删这里时，css/style.css 的同名清单必须同步（测试会对账）。 */
  const ZH_SELECTORS = [
    ".word-row .cn",      // 词条：中文释义（app.js wordRowHtml）
    ".word-row .ex b",    // 词条：例句的中文翻译（<b> 包着）
    ".dlg-line .cn",      // 对话：中文台词（app.js dialogueCardHtml）
    ".sub-zh",            // 字幕：中文轨（subtitle.js）
    ".sop-en-cn",         // SOP：每步英文的中文（sop.js）
    ".sop-ref-cn",        // SOP：参考来源的中文说明（sop.js）
    ".urg-cn",            // 场景急救：场景中文（urgent.js）
    ".mail-gloss-cn",     // 真实来信：逐句注释的中文（write.js）
    ".md-cn",             // 真实来信/场景演练：中文（write.js）
    ".mk-excn",           // 高频易错点：例句译文（app.js）
    ".drill-cn",          // AI 对练：话题中文（tutor.js）
    ".td-listen-cn"       // 今日「连听本单元」：英中交替时的中文轨（today.js）
  ];

  /* 刻意【不隐藏】的地方——判分依据与答案面。
     写成代码而不是只写在注释里：tools/test-immerse-weekly.js 会断言这些选择器
     ① 一个都没混进 ZH_SELECTORS（越界守卫）；② 都真实存在于站内渲染代码里（不留想象出来的类名）。 */
  const NEVER_HIDE = [
    ".flash-face",     // 单词卡背面 —— 「看英文想中文」的答案面，藏了就没法对答案
    ".quiz-q",         // 测验题干
    ".quiz-options",   // 测验选项（判分依据）
    ".quiz-opts",      // 单元页内的快速自测选项
    ".mk-right",       // 高频易错点的「正确表达」——没有它这条练习就废了
    ".chat-msg",       // AI 对话里用户主动点出来的「翻译」
    ".e4-bar"          // 四维口语实战 / 口语概览的维度分与参考句区
  ];

  /* ---------------- 偏好读写（localStorage 不可用时静默降级为「关」） ---------------- */
  function on() {
    try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }
  function set(v) {
    const want = !!v;
    try { localStorage.setItem(KEY, want ? "1" : "0"); } catch (e) { /* 隐私模式：本次生效，不持久化 */ }
    apply();
    return want;
  }
  function toggle() { return set(!on()); }

  /* ---------------- 「临时看中文」：只活在本次会话，换页即失效 ---------------- */
  function isPeek() {
    try { return document.documentElement.classList.contains(PEEK_CLASS); } catch (e) { return false; }
  }
  function peek(v) {
    const want = (v === undefined) ? !isPeek() : !!v;
    try { document.documentElement.classList.toggle(PEEK_CLASS, want); } catch (e) { /* ignore */ }
    paintPill();
    return want;
  }
  function clearPeek() { if (isPeek()) peek(false); }

  /* ---------------- 应用 ---------------- */
  function apply() {
    const want = on();
    try { document.documentElement.classList.toggle(ON_CLASS, want); } catch (e) { /* ignore */ }
    if (!want) clearPeek();
    ensurePill();
    paintPill();
    return want;
  }

  /* ---------------- 浮标：只在全英模式打开时存在 ----------------
     它是「后悔药」：任何一次「这句话中文怎么说」都不需要进设置页翻开关。 */
  function ensurePill() {
    if (document.getElementById("immersePill")) return;
    if (!document.body || !document.body.appendChild) return;
    const b = document.createElement("button");
    b.id = "immersePill";
    b.type = "button";
    b.className = "immerse-pill";
    b.setAttribute("aria-label", "显示或隐藏中文");
    b.addEventListener("click", function () { peek(); });
    document.body.appendChild(b);
  }
  function paintPill() {
    const b = document.getElementById("immersePill");
    if (!b) return;
    const shown = on();
    b.hidden = !shown;
    const p = isPeek();
    b.textContent = p ? "EN 收起中文" : "🀄 看中文";
    b.title = p ? "回到全英" : "临时显示中文（换页自动收回，不改偏好）";
    b.setAttribute("aria-pressed", p ? "true" : "false");
  }

  /* 换页收回临时中文：全英模式要的是「默认不给中文」，不是「永不显示」 */
  if (typeof window.addEventListener === "function") {
    window.addEventListener("hashchange", clearPeek);
  }

  /* 启动即应用。放在文件末尾之前，保证函数声明都已就绪（TDZ 教训见 test-boot.js 头注）。 */
  apply();

  window.Immerse = {
    on: on, set: set, toggle: toggle, apply: apply,
    peek: peek, isPeek: isPeek, clearPeek: clearPeek,
    ZH_SELECTORS: ZH_SELECTORS, NEVER_HIDE: NEVER_HIDE, KEY: KEY
  };
})();
