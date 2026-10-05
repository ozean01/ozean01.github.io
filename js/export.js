/* ============ 学习数据导出 / 导入（备份 · 换机迁移 · Anki 互通）============
   纯前端、零依赖：
     - 导出进度备份 JSON：整包带出 localStorage 里的进度、单词卡记忆状态、测验成绩、打卡与错题
     - 导入备份：校验结构后按「字段级后写胜」合并，导入完成刷新页面
     - 词表 CSV：单词/音标/词性/中文/例句/例句翻译/单元/难度，Anki「导入文件」可直接建卡
     - 错题 CSV：只导出答错过的词，便于打印或单独做一副 Anki 牌组
   CSV 用 UTF-8 BOM + 逗号分隔，Excel 与 Anki 都能正确识别中文。 */
(function () {
  "use strict";

  var PROG_KEY = "fte-progress-v1";
  var PREF_KEY = "fte-pref-v2";
  var FILE_TAG = "soft-packaging-fte";

  /* ---------------- 备份清单（P0-3）----------------
     清单不再手写：唯一权威来源是 js/storage-keys.js（window.FTE_STORAGE）。
     此前只备份 progress/pref/listen/sop 四个键，其余 20 多个键（SOP 勾选、学习走势、
     口语雷达原始分、自述语料库、写作作品、单证草稿、看板、自测基线……）全部静默丢失，
     而页面写的是「导入即可续学」。 */
  function REG() { return window.FTE_STORAGE || null; }
  function backupKeys() {
    var r = REG();
    if (r && r.keys && r.keys.length) {
      return r.keys.filter(function (k) { return k.backup !== false; })
        .map(function (k) { return k.key; });
    }
    /* 注册表缺失（老缓存里少了文件）时保守退化：只备份进度与偏好，不假装覆盖全部 */
    return [PROG_KEY, PREF_KEY];
  }
  function isSecretKey(k) {
    var r = REG();
    return !!(r && r.secretKeys && r.secretKeys.indexOf(k) !== -1);
  }
  /* 键本身可备份、但其中有凭据字段（progress.azureKey）→ 导出前剔除 */
  function stripSecrets(key, val) {
    var r = REG();
    var fields = (r && r.secretFields && r.secretFields[key]) || null;
    if (!fields || !val || typeof val !== "object") return val;
    var out = {};
    for (var k in val) if (Object.prototype.hasOwnProperty.call(val, k)) out[k] = val[k];
    fields.forEach(function (f) { delete out[f]; });
    return out;
  }
  /* 读任意存储值：本站既存 JSON（对象/数组），也存裸字符串（"uk" / "all" / "1"）。
     只走 JSON.parse 会把裸字符串整类丢掉——那正是「备份看起来没事」的原因之一。 */
  function readAny(key) {
    var raw;
    try { raw = localStorage.getItem(key); } catch (e) { return null; }
    if (raw === null || raw === undefined) return null;
    try { return { v: JSON.parse(raw) }; } catch (e) { return { raw: String(raw) }; }
  }
  /* 写回单键：裸字符串走 __raw 包装，其余按 JSON 写 */
  function writeOne(key, val) {
    try {
      if (val && typeof val === "object" && !Array.isArray(val) &&
          typeof val.__raw === "string" && Object.keys(val).length === 1) {
        localStorage.setItem(key, val.__raw);
      } else {
        /* P0′：导入路径统一净化（字段级白名单，见本文件 sanitizeProgress）。
           prefix 用**键名 + "."**：白名单里带键名前缀的条目（如 fte-board-v1.tasks.*.href）
           只有这样才能命中；不带前缀会因路径段数不等而永不生效（实测过的坑）。 */
        localStorage.setItem(key, JSON.stringify(sanitizeProgress(stripSecrets(key, val), key + ".")));
      }
      return true;
    } catch (e) { return false; }
  }

  function toast(m) {
    if (window.ASRUtil && window.ASRUtil.toast) window.ASRUtil.toast(m);
    else console.log(m);
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes());
  }
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function download(filename, text, mime) {
    try {
      var blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (e) {
      toast("导出失败：" + e.message);
      return false;
    }
  }

  /* ---------- 进度备份 ---------- */
  function exportProgress() {
    var pack = {
      _tag: FILE_TAG,
      _version: 1,
      exportedAt: new Date().toISOString(),
      site: (FTE_DATA && FTE_DATA.site && FTE_DATA.site.name) || "软包装外贸英语",
      units: FTE_DATA ? FTE_DATA.units.length : 0,
      data: {}
    };
    var keys = backupKeys();
    var covered = 0;
    keys.forEach(function (k) {
      if (isSecretKey(k)) return;
      var got = readAny(k);
      if (got === null) return;
      pack.data[k] = ("raw" in got) ? { __raw: got.raw } : stripSecrets(k, got.v);
      covered++;
    });
    if (!pack.data[PROG_KEY]) {
      toast("还没有学习记录可导出，先去学一会儿吧");
      return;
    }
    pack.keyCount = covered;
    var p = pack.data[PROG_KEY] || {};
    pack.summary = {
      learned: p.learned ? Object.keys(p.learned).length : 0,
      flashCards: p.flash ? Object.keys(p.flash).length : 0,
      wrongWords: p.wrong ? Object.keys(p.wrong).length : 0,
      quizBest: p.quizBest || null,
      streak: (p.coach && p.coach.streak) || 0,
      hours: p.coach ? Math.floor((p.coach.total || 0) / 3600) : 0
    };
    if (download("外贸英语-学习备份-" + stamp() + ".json", JSON.stringify(pack, null, 2), "application/json")) {
      toast("⬇️ 已导出备份（" + covered + " 类记录 · 含 " + pack.summary.learned + " 个已自评标记的词）");
    }
  }

  function pickImportFile() {
    var input = document.getElementById("dataImportFile");
    if (!input) return;
    input.value = "";
    input.click();
  }

  function mergeObject(oldV, newV) {
    /* 逐字段后写胜：计数类取较大值，其余以导入值为准 */
    var out = {};
    var k;
    for (k in oldV) if (Object.prototype.hasOwnProperty.call(oldV, k)) out[k] = oldV[k];
    for (k in newV) {
      if (!Object.prototype.hasOwnProperty.call(newV, k)) continue;
      if (typeof newV[k] === "number" && typeof out[k] === "number") out[k] = Math.max(out[k], newV[k]);
      else out[k] = newV[k];
    }
    return out;
  }

  /* ---------- 导入前的字段级净化（P0′ · 安全）----------
     由来（安全审计实测）：全站把用户可控内容写进 innerHTML 时，**文本类字段都走了 esc**，
     但**非文本类字段**（数字、URL）是直接拼接的。于是"导入一份被改过的备份 JSON"
     就能把 <img src=x onerror=...> 注入页面。实测确认 5 处：
       · js/write.js:386 的 w.wc（数字位）          · js/write.js:390 的 w.indep.rate（title 属性位）
       · js/board.js:259 的 t.href（href 位）        · js/app.js:447 的 toast 换行分支
       · js/subtitle.js:869 的 isHtml 实参传错（该处已单独修正）
     后果当前被 CSP 挡住（script-src 不含 'unsafe-inline'，线上实测生效），
     但只剩一层防御不合适 —— 所以**在源头按字段类型白名单净化**，并在渲染点补转义（纵深防御）。

     口径（与备份里的真实结构一致，见 write.js:575-584 / app.js:321）：
       num  数字位：非有限数字一律归 0（渲染进 HTML 也不会再成为标签）
       url  地址位：只允许 #/ 开头的站内 hash 路由或 http(s)://，其余归 "#"
       str  文本位：转成字符串并限长（文本位在渲染层另走 esc）
     未登记的字段：数字保持数字、其余转字符串限长 —— 只做类型收窄，不猜语义。 */
  var SANITIZE_TYPES = {
    "learned.*": "num", "flash.*.due": "num", "flash.*.reps": "num", "flash.*.stability": "num",
    "flash.*.difficulty": "num", "flash.*.interval": "num", "flash.*.rating": "num", "flash.*.last": "num",
    "flashProd.*.due": "num", "flashProd.*.reps": "num", "flashProd.*.stability": "num",
    "flashProd.*.difficulty": "num", "flashProd.*.interval": "num", "flashProd.*.rating": "num",
    "flashChunk.*.due": "num", "flashChunk.*.reps": "num", "flashChunk.*.stability": "num",
    "wrong.*": "num", "quizBest.*": "num", "stage.*": "num",
    /* ⚠️ learned / done 的值是**布尔**（app.js:3395 `done[…] = true`、:3404 `learned[id] = true`），
       绝不能声明成 "num"：`parseFloat(true)` 是 NaN → 归 0 → 导入备份后
       掌握度归零、"✓ 已完成"消失、**#/today 的第 2 步从「学第 12 单元」退回「学第 1 单元」**，
       用户会认为"换电脑把进度弄丢了"（且 `totalLearned()` 只数键个数，数字还不变，更隐蔽）。 */
    "learned.*": "bool", "done.*": "bool",
    "coach.streak": "num", "coach.today": "num", "coach.total": "num",
    "coachDays.*": "num", "activeDays.*": "num", "studioDays.*.patterns": "num", "studioDays.*.write": "num",
    "backfill.*": "num", "sop.*": "num", "ports.*": "num",
    "eval4.*.total": "num", "eval4.*.term": "num", "eval4.*.flu": "num", "eval4.*.acc": "num",
    "eval4.*.log": "num", "eval4.*.t": "num",
    "writes.*.wc": "num", "writes.*.wc2": "num", "writes.*.rate1": "num", "writes.*.rate2": "num",
    "writes.*.t": "num", "writes.*.ai.hasAdvice": "num", "writes.*.ai.hasFull": "num",
    "writes.*.indep.rate": "num",
    "writes.*.text": "str", "writes.*.draft2": "str",
    "writes.*.ai.adopt": "str", "writes.*.ai.reason": "str", "writes.*.indep.text": "str",
    "flashcards.*.note": "str", "fte-mysay-v1.*.en": "str", "fte-sub-notes-v1.*": "str",
    "fte-mysay-v1.*.cn": "str", "fte-mysay-v1.*.at": "num",
    /* 注意：下表两段路径的**根不同**（这是 V-02/F-2 修正的核心）——
       本表既用于内置在 fte-progress-v1 里的字段（路径**不含**存储键名），
       也用于独立存储键（路径**以键名开头**，见 writeOne/sanitizeProgress 的 prefix 参数）。
       带键名前缀的条目若写成裸名（如 "board.tasks.*.href"）会因段数不等而**永不命中**。 */
    "fte-board-v1.tasks.*.href": "url", "fte-board-v1.tasks.*.title": "str",
    "fte-board-v1.tasks.*.min": "num", "fte-board-v1.tasks.*.status": "str",
    "fte-writes-v1.*.wc": "num", "fte-writes-v1.*.wc2": "num",
    "fte-writes-v1.*.rate1": "num", "fte-writes-v1.*.rate2": "num", "fte-writes-v1.*.t": "num",
    "fte-writes-v1.*.indep.rate": "num", "fte-writes-v1.*.ai.hasAdvice": "num", "fte-writes-v1.*.ai.hasFull": "num",
    "fte-writes-v1.*.text": "str", "fte-writes-v1.*.draft2": "str",
    "fte-writes-v1.*.ai.adopt": "str", "fte-writes-v1.*.ai.reason": "str", "fte-writes-v1.*.indep.text": "str",
    "fte-eval4-v1.*.total": "num", "fte-eval4-v1.*.term": "num", "fte-eval4-v1.*.flu": "num",
    "fte-eval4-v1.*.acc": "num", "fte-eval4-v1.*.log": "num", "fte-eval4-v1.*.t": "num",
    "fte-speech-v1.*.words": "num", "fte-speech-v1.*.rate": "num", "fte-speech-v1.*.fluency": "num",
    "fte-speech-v1.*.t": "num", "fte-speech-v1.*.uniq": "num",
    "fte-history-v1.*.t": "num", "fte-history-v1.*.learned": "num", "fte-history-v1.*.retention": "num",
    "fte-history-v1.*.done": "num", "fte-history-v1.*.due7": "num", "fte-history-v1.*.day": "str",
    "fte-placement-bank.*.uid": "num", "fte-board-v1.tasks.*.id": "str", "fte-board-v1.tasks.*.due": "str"
  };
  function sanitizeKind(path) {
    if (Object.prototype.hasOwnProperty.call(SANITIZE_TYPES, path)) return SANITIZE_TYPES[path];
    var keys = Object.keys(SANITIZE_TYPES);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.indexOf("*") === -1) continue;
      var kp = k.split("."), pp = path.split(".");
      if (kp.length !== pp.length) continue;
      var ok = true;
      for (var j = 0; j < kp.length; j++) { if (kp[j] !== "*" && kp[j] !== pp[j]) { ok = false; break; } }
      if (ok) return SANITIZE_TYPES[k];
    }
    return null;
  }
  function toNum(v) {
    /* ⚠️ 这一族错误已被独立验证连续抓到三次，必须一次收口：
         ① 字符串 → num：`"<img onerror>"` 曾被 parseFloat 成 0（注入面）；
         ② 布尔 → num：`learned[id]=true` 被吃成 0（导入后进度看起来全丢，见下表白名单）；
         ③ null → num：`wc2/rate1/rate2/log/rate/fluency` 在产品里**就是 null**（未测/不存在），
            被吃成 0 后 `write.js:387` 的 `rate2 != null` 成立 → 每篇没写二稿的作品都凭空多出
            「已改二稿 0%→0%」徽章；`radar.js` 的 avg() 只过滤非数字，于是 null 变成"一次真实测量"，
            五维雷达被拉低（实测 90 → 45 / 90 → 22.5）。
       原则：**净化只做类型收窄，绝不改变语义**。布尔与 null/undefined 都原样交给上层处理
       （sanitizeProgress 已有"值 === null 就丢键"的约定，正是这里需要的效果）。 */
    if (typeof v === "boolean" || v === null || v === undefined) return v;
    var n = (typeof v === "number") ? v : parseFloat(v);
    return (typeof n === "number" && isFinite(n)) ? n : 0;
  }
  /* 布尔位：只接受真正的布尔与 0/1/"true"/"false"，其余一律 false（不做真值转换，避免字符串 "0" 被当 true） */
  function toBool(v) {
    if (typeof v === "boolean") return v;
    if (v === 1 || v === 0) return v === 1;
    if (v === "true") return true;
    if (v === "false" || v === "") return false;
    return false;
  }
  function safeUrl(v) {
    var s = String(v == null ? "" : v);
    return (/^#\//.test(s) || /^https?:\/\//i.test(s)) ? s : "#";
  }
  function safeStr(v) {
    var s = String(v == null ? "" : v);
    return s.length > 20000 ? s.slice(0, 20000) : s;
  }
  /* sanitizeValue(path, walk, v, depth)
       · path = 真实路径（只用于语义与调试，首层是键名）；
       · walk = **白名单匹配路径**：递归下降时数组元素与对象字段一律换成 "*"。
     ⚠️ 两版踩过的坑都必须记住：
        ① 完全不带键名前缀 → 带键名的白名单条目段数不等，永不命中；
        ② 递归时拼**真实字段名**（.tasks / 数组下标 .0）→ 与 * 段名不匹配，同样永不命中。
        正确做法是：**前缀用真实键名，下降用 "*"**。 */
  function sanitizeValue(path, walk, v, depth) {
    if (depth > 6) return null;
    var kind = sanitizeKind(walk);
    if (kind === "num") return toNum(v);
    if (kind === "bool") return toBool(v);
    if (kind === "url") return safeUrl(v);
    if (kind === "str") return safeStr(v);
    /* ⚠️ 数组与对象的判定顺序很关键：**数组不能被当成普通对象**。
       第一版在这里写成 `if (v && typeof v === "object") { … }` 且对数组返回 {}，
       而站点有 7 个 backup 键的顶层值就是数组（作品集 / 学习走势 / 自述语料 / 出题题库 /
       四维成绩 / 自由表达 / 场景急救）→ **导入任何备份都会把这 7 类记录清成 `{}`**，
       随后 savedWorks().filter / loadHistory().slice 等调用直接抛错、4 个主页面显示渲染错误。
       这是"纵深防御"改写必须避免的净负效果：只做类型收窄，绝不改变容器类型。 */
    if (Array.isArray(v)) {
      var arr = [];
      for (var i = 0; i < v.length && i < 2000; i++) arr.push(sanitizeValue(path, walk + ".*", v[i], depth + 1));
      return arr;
    }
    if (v && typeof v === "object") {
      var o = {};
      for (var k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
        var sv = sanitizeValue(path ? path + "." + k : k, walk + "." + k, v[k], depth + 1);
        if (sv !== null) o[k] = sv;
      }
      return o;
    }
    /* 未登记的叶子：只做类型收窄，数字保持数字（避免把计数位变成字符串而破坏下游比较） */
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (typeof v === "boolean" || v === null || v === undefined) return v;
    return safeStr(v);
  }
  /* 净化任意存储值。
     prefix 是**值对象内部**的路径起点：
       · 独立存储键：传键名（如 "fte-board-v1"），于是 fte-board-v1.tasks.*.href 这类带键名的
         白名单条目才能命中（这是 F-2：路径根必须与白名单对齐，否则段数不等、永不命中）；
       · 内置在 fte-progress-v1 里的字段：传 ""（历史调用形态，向后兼容）。
     顶层是数组时**返回数组**；顶层是裸字符串/数字（本站确实会存 "uk"/"1"）时原样返回。 */
  function sanitizeProgress(obj, prefix) {
    /* prefix 规范化：允许调用方写 "fte-board-v1" 或 "fte-board-v1."，内部一律按无尾点处理。
       ⚠️ 踩过的坑：调用方传了 "key." 而这里又拼一个 "."，路径变成 "fte-board-v1..tasks"，
       与白名单（单点分隔）永不匹配 → 净化表整体失效（F-2 的第二次复发）。
       现在把"分隔符"的责任收敛到这一处。 */
    var pre = String(prefix || "").replace(/\.+$/, "");
    if (Array.isArray(obj)) return sanitizeValue(pre, pre, obj, 1);
    if (obj === null || typeof obj !== "object") return obj;
    var out = {};
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var p = pre ? pre + "." + k : k;
      var sv = sanitizeValue(p, p, obj[k], 1);
      if (sv !== null) out[k] = sv;
    }
    return out;
  }

  function importProgress(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var pack;
      try { pack = JSON.parse(String(reader.result)); } catch (e) {
        toast("这不是有效的 JSON 备份文件");
        return;
      }
      if (!pack || pack._tag !== FILE_TAG || !pack.data || !pack.data[PROG_KEY]) {
        toast("备份文件格式不符（缺少本站标识或进度数据）");
        return;
      }
      var incoming = pack.data[PROG_KEY];
      var current = readJSON(PROG_KEY);
      var n = incoming.learned ? Object.keys(incoming.learned).length : 0;
      /* 备份里除进度之外还有多少类记录会被一并恢复（对用户说实话，不写「大概」） */
      var restKeys = backupKeys().filter(function (k) {
        return k !== PROG_KEY && !isSecretKey(k) &&
          Object.prototype.hasOwnProperty.call(pack.data, k);
      });
      var msg = "导入备份将合并到当前进度：\n\n" +
        "备份时间：" + (pack.exportedAt || "未知") + "\n" +
        "已自评标记的词：" + n + " 个\n" +
        "单词卡记录：" + (incoming.flash ? Object.keys(incoming.flash).length : 0) + " 条\n" +
        "其它记录：" + restKeys.length + " 类（SOP 勾选 / 学习走势 / 雷达 / 作品 / 看板 …）\n\n" +
        "同一个词的记录以备份为准，计数类取较大值。确定继续吗？";
      if (!window.confirm(msg)) return;

      var merged = incoming;
      if (current) {
        merged = {};
        var keys = {}, k;
        for (k in current) keys[k] = 1;
        for (k in incoming) keys[k] = 1;
        for (k in keys) {
          var a = current[k], b = incoming[k];
          if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
            merged[k] = mergeObject(a, b);
          } else {
            merged[k] = (b === undefined ? a : b);
          }
        }
      }
      var failed = 0;
      try {
        /* 凭据字段一律不写回（旧备份里可能夹带 azureKey）；P0′：再按字段类型净化一遍 */
        localStorage.setItem(PROG_KEY, JSON.stringify(sanitizeProgress(stripSecrets(PROG_KEY, merged))));
        restKeys.forEach(function (key) { if (!writeOne(key, pack.data[key])) failed++; });
      } catch (e) {
        toast("写入失败（浏览器存储可能已满）：" + e.message);
        return;
      }
      toast(failed
        ? "✅ 导入完成（" + failed + " 类记录写入失败，浏览器存储可能已满），正在刷新…"
        : "✅ 导入完成，正在刷新…");
      setTimeout(function () { location.reload(); }, 900);
    };
    reader.onerror = function () { toast("读取文件失败"); };
    reader.readAsText(file, "utf-8");
  }

  /* ---------- CSV ---------- */
  function csvCell(s) {
    var v = String(s == null ? "" : s);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function csvRows(rows) {
    return "\ufeff" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n";
  }
  function allVocab() {
    var out = [];
    if (!FTE_DATA) return out;
    FTE_DATA.units.forEach(function (u) {
      u.vocab.forEach(function (v, i) {
        out.push({ id: u.id + "-" + i, u: u, v: v });
      });
    });
    return out;
  }
  function levelLabel(v) {
    var w = String(v.w || "").toLowerCase();
    var d = (window.FTE_DIFF && window.FTE_DIFF.words && window.FTE_DIFF.words[w]) || null;
    if (d) return d.dif === "easy" ? "易" : (d.dif === "mid" ? "中" : "难");
    var lvl = (window.FTE_LVL || {})[w];
    if (lvl === "high") return "高频";
    if (lvl === "common") return "常用";
    if (lvl === "tech") return "专业";
    return "";
  }

  function exportVocabCsv() {
    var rows = [["Word", "IPA", "POS", "Chinese", "Example", "ExampleCN", "Unit", "Difficulty"]];
    allVocab().forEach(function (x) {
      rows.push([x.v.w, x.v.ipa, x.v.pos, x.v.cn, x.v.ex, x.v.exCn, x.u.id + " " + x.u.title, levelLabel(x.v)]);
    });
    if (rows.length < 2) { toast("没有可导出的词汇"); return; }
    if (download("外贸英语-词表-" + stamp() + ".csv", csvRows(rows), "text/csv")) {
      toast("📄 已导出 " + (rows.length - 1) + " 个词（Anki 可直接导入）");
    }
  }

  function exportWrongCsv() {
    var p = readJSON(PROG_KEY) || {};
    var wrong = p.wrong || {};
    var flash = p.flash || {};
    var rows = [["Word", "IPA", "Chinese", "Example", "ExampleCN", "Unit", "WrongCount", "NextDue"]];
    allVocab().forEach(function (x) {
      var n = wrong[x.id] || 0;
      if (!n) return;
      var f = flash[x.id];
      var due = f && f.due ? new Date(f.due).toLocaleDateString("zh-CN") : "";
      rows.push([x.v.w, x.v.ipa, x.v.cn, x.v.ex, x.v.exCn, x.u.id + " " + x.u.title, n, due]);
    });
    if (rows.length < 2) { toast("目前没有错题记录，做几轮测验或单词卡再来"); return; }
    if (download("外贸英语-错题-" + stamp() + ".csv", csvRows(rows), "text/csv")) {
      toast("❗ 已导出 " + (rows.length - 1) + " 个错题词");
    }
  }

  /* ---------- 事件 ---------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var act = el.getAttribute("data-action");
    if (act === "data-export") exportProgress();
    else if (act === "data-import") pickImportFile();
    else if (act === "data-csv-vocab") exportVocabCsv();
    else if (act === "data-csv-wrong") exportWrongCsv();
  });

  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "dataImportFile" && e.target.files && e.target.files[0]) {
      importProgress(e.target.files[0]);
    }
  });

  window.FTEExport = {
    exportProgress: exportProgress,
    exportVocabCsv: exportVocabCsv,
    exportWrongCsv: exportWrongCsv
  };
})();
