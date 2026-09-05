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
  /* 需要一起备份的其它键（AI 陪练配置含 Key，出于安全默认不导出） */
  var EXTRA_KEYS = ["fte-listen-v1", "fte-sop-v1"];
  var FILE_TAG = "soft-packaging-fte";

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
    pack.data[PROG_KEY] = readJSON(PROG_KEY);
    pack.data[PREF_KEY] = readJSON(PREF_KEY);
    EXTRA_KEYS.forEach(function (k) {
      var v = readJSON(k);
      if (v !== null) pack.data[k] = v;
    });
    if (!pack.data[PROG_KEY]) {
      toast("还没有学习记录可导出，先去学一会儿吧");
      return;
    }
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
      toast("⬇️ 已导出备份（含 " + pack.summary.learned + " 个已掌握词）");
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
      var msg = "导入备份将合并到当前进度：\n\n" +
        "备份时间：" + (pack.exportedAt || "未知") + "\n" +
        "已掌握词：" + n + " 个\n" +
        "单词卡记录：" + (incoming.flash ? Object.keys(incoming.flash).length : 0) + " 条\n\n" +
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
      try {
        localStorage.setItem(PROG_KEY, JSON.stringify(merged));
        if (pack.data[PREF_KEY]) localStorage.setItem(PREF_KEY, JSON.stringify(pack.data[PREF_KEY]));
        EXTRA_KEYS.forEach(function (key) {
          if (pack.data[key]) localStorage.setItem(key, JSON.stringify(pack.data[key]));
        });
      } catch (e) {
        toast("写入失败（浏览器存储可能已满）：" + e.message);
        return;
      }
      toast("✅ 导入完成，正在刷新…");
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
