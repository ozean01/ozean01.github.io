/* ============ 进度数据结构版本化（schema）============
   用途：给 localStorage 里的学习进度打上 `schema` 版本号，并提供一个「逐级迁移」框架，
         将来给 progress 新增字段/改结构时，不需要担心老用户的旧数据不兼容——
         只要在 MIG 里加一个 fromVersion→fn，并同步把 SCHEMA +1 即可。

   约定：
     - SCHEMA = 当前进度数据结构版本（整数，从 1 开始）。
     - MIG[v] = 把 v → v+1 的迁移函数，返回迁移后的对象。
     - 旧数据（无 schema 字段）按版本 0 处理；从 0 逐级升级到 SCHEMA。
     - 数据来自「未来版本」（schema > SCHEMA）时，不强行迁移，保留原字段（防降级损坏）。
   依赖：无。测试见 tools/test-schema.js。 */
(function () {
  "use strict";
  var SCHEMA = 1;   // ← 当前版本。将来加字段/改结构时 +1，并在 MIG 里补 [旧版本] 迁移函数

  /* fromVersion → fn(progressObj)：只负责从该版本的旧结构迁移到下一版。
     未写则视为「无字段变化」（defaultProgress 已补齐缺省），直接跳到下一级。 */
  var MIG = {
    /* 示例（将来加字段时解注释改）：
    0: function (p) {            // 0 → 1
      // 旧数据无 schema；如新增字段需从旧字段推导，在此处理
      return p;
    } */
  };

  function migrate(p) {
    if (!p || typeof p !== "object") return p;
    var v = (p.schema != null && typeof p.schema === "number") ? p.schema : 0;
    if (v === SCHEMA) return p;
    if (v > SCHEMA) return p;               // 未来版本：不降级，保留原数据
    var out = p, cur = v;
    while (cur < SCHEMA) {
      var f = MIG[cur];
      if (f) out = f(out) || out;
      cur++;
    }
    out.schema = SCHEMA;
    return out;
  }

  window.FTE_SCHEMA = { SCHEMA: SCHEMA, migrate: migrate };
})();
