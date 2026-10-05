#!/usr/bin/env node
/* ============ 可注入时钟（门禁与系统日历解耦）· P1 ============
   为什么需要它：这条链上曾出现两次「时间炸弹」型假红，且都在**测试脚手架**里，不在站点源码里：
     1) tools/test-today.js 的 TODAY 常量只给月份补零、日期没补 → 每月 1–9 日 3 条断言必失败；
     2) tools/test-immerse-weekly.js 硬编码 2026-09-30（ISO 2026-W40），却断言无参 Weekly.isDone()
        （用真实当下的周）→ 2026-10-05 起永久红。
   两类失败混在同一次 test-all 输出里，会让**真的数据漂移**被"又是那两个红"掩盖。
   所以：日期敏感的门禁必须能把"现在"钉死，而不是读系统时钟。

   用法（三种，按优先级）：
     · 环境变量：  $env:FTE_FAKE_DATE='2026-01-05'; node tools/test-all.js
     · 显式传参：  const clock = require("./lib/clock.js")({ date: "2026-01-05" });
     · 进程级冻结：clock.install();   // 之后 new Date() / Date.now() 全部返回冻结时间
   不设任何东西时，完全等同系统时钟（对现有门禁零行为变化）。

   边界（刻意不做的）：
     · 不接管 performance.now / process.hrtime —— 它们不是日期源，接管只会增加风险；
     · 不解析任意时刻字符串：只接受 YYYY-MM-DD（可选 T HH:MM:SS），避免引入时区歧义；
     · install() 会替换全局 Date，**必须在任何被测模块加载之前调用**，且同一进程只调用一次。 */
"use strict";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

function parse(spec) {
  if (!spec) return null;
  const raw = String(spec).trim();
  if (!raw) return null;
  const m = DATE_RE.exec(raw);
  if (!m) {
    /* ⚠️ 格式非法必须**显式报错**，不能静默忽略：
       独立验证的 F-12 指出，`FTE_FAKE_DATE=2026-1-5`（未补零）或 `not-a-date` 会被当成"没设"，
       于是门禁悄悄跑在**真实系统时钟**上，而操作者以为已经冻结——这是比报错更危险的假绿。 */
    throw new Error("FTE_FAKE_DATE 格式非法（" + spec + "）：只接受 YYYY-MM-DD 或 YYYY-MM-DDTHH:MM[:SS]。");
  }
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const h = Number(m[4] || 0), mi = Number(m[5] || 0), s = Number(m[6] || 0);
  /* ⚠️ 必须自己校验范围：JS 的 Date 会把越界值**静默归一化**
     （2026-02-30 → 2026-03-02、2026-10-32 → 2026-11-01、T25:99 → 次日），
     于是门禁会"在另一个日期上绿"——那比直接报错更危险。
     越界一律**显式抛错**，让写错的 FTE_FAKE_DATE 立刻失败而不是悄悄换一天。 */
  const bad = [];
  if (mo < 1 || mo > 12) bad.push("月份 " + mo);
  if (d < 1 || d > 31) bad.push("日期 " + d);
  if (h > 23) bad.push("小时 " + h);
  if (mi > 59) bad.push("分钟 " + mi);
  if (s > 59) bad.push("秒 " + s);
  const probe = new Date(y, mo - 1, d, h, mi, s, 0);
  if (probe.getFullYear() !== y || probe.getMonth() !== mo - 1 || probe.getDate() !== d) {
    /* 只有"日期本身越界"才报这条；月/时/分/秒越界已由上面的范围检查覆盖，
       避免出现"小时 25、该月不存在第 5 天"这种误导性组合信息。 */
    if (!bad.length) bad.push("该月不存在第 " + d + " 天");
  }
  if (bad.length) {
    throw new Error("FTE_FAKE_DATE 非法（" + spec + "）：" + bad.join("、") +
      "。本库拒绝让越界日期被 JS 静默归一化——那会让门禁在另一个日期上通过。");
  }
  return probe;
}

/* 把 Date 格式化成本站全站统一的 YYYY-MM-DD（月与日都补零）。
   这是**全站唯一的日期串构造函数**：站点侧对应 js/app.js 的 coachPad/coachToday，
   两者口径必须一致，否则 dayGap 的正则 ^(\d{4})-(\d{2})-(\d{2})$ 会静默拒收。 */
function pad(n) { return n < 10 ? "0" + n : "" + n; }
function dateStr(d) {
  const x = (d instanceof Date) ? d : new Date(d);
  return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate());
}

function makeClock(opts) {
  const o = opts || {};
  const spec = o.date || process.env.FTE_FAKE_DATE || "";
  const frozen = parse(spec);
  let installed = false;
  const RealDate = Date;

  function now() {
    if (frozen) return new Date(frozen.getTime());
    return new RealDate();
  }

  /* 进程级冻结：只替换 Date 构造器与 Date.now，其余原型方法原样继承 */
  function install() {
    if (!frozen || installed) return false;
    installed = true;
    function FakeDate(...args) {
      if (args.length === 0) return new RealDate(frozen.getTime());
      return new RealDate(...args);
    }
    FakeDate.prototype = RealDate.prototype;
    FakeDate.now = function () { return frozen.getTime(); };
    FakeDate.parse = RealDate.parse;
    FakeDate.UTC = RealDate.UTC;
    global.Date = FakeDate;
    return true;
  }

  return {
    frozen: !!frozen,
    spec: spec || null,
    now: now,
    dateStr: function (d) { return dateStr(d || now()); },
    today: function () { return dateStr(now()); },
    daysAgo: function (n) { const d = now(); d.setDate(d.getDate() - (n || 0)); return dateStr(d); },
    install: install
  };
}

module.exports = makeClock;
module.exports.parse = parse;
module.exports.dateStr = dateStr;
module.exports.pad = pad;
