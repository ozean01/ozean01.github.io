#!/usr/bin/env node
/* 统一测试 runner：把分散的审计/验收脚本串起来，作为「改动即校验」的入口。
   - 门禁类（断言 + exit 0/1）：audit-fsrs / test-fsrs / test-parser / test-subtitle
   - 报告生成类（只重算报告与打印，不设门禁）：audit-count / audit-ipa

   运行：node tools/test-all.js   （在 外贸英语/ 目录下）
   返回：全部通过 exit 0；任一断言脚本失败 exit 1。
*/
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/* gate: true → 必须 exit 0；false → 仅重算报告，失败不阻塞（打印即可） */
const JOBS = [
  { cmd: "node", args: ["tools/audit-fsrs.js"],   gate: true,  label: "FSRS 参数/公式对齐官方 ts-fsrs" },
  { cmd: "node", args: ["tools/test-fsrs.js"],    gate: true,  label: "FSRS 四档评分行为" },
  { cmd: "node", args: ["tools/test-parser.js"],  gate: true,  label: "句块切分器" },
  { cmd: "node", args: ["tools/test-subtitle.js"],gate: true,  label: "字幕解析 + 分级着色" },
  { cmd: "node", args: ["tools/test-schema.js"],  gate: true,  label: "进度 schema 迁移框架" },
  { cmd: "node", args: ["tools/test-quiz-write.js"],gate: true,  label: "测验写作产出（write）题型" },
  { cmd: "node", args: ["tools/test-patterns.js"], gate: true,  label: "句型克隆库 frame 生成" },
  { cmd: "node", args: ["tools/test-mysay.js"],   gate: true,  label: "说我想说：拆句/实词/接线" },
  { cmd: "node", args: ["tools/test-phonemes.js"],gate: true,  label: "音素课：分词器覆盖全语料/索引/接线" },
  { cmd: "node", args: ["tools/test-assets.js"],  gate: true,  label: "静态资源接线：引用存在 + 预缓存完整" },
  { cmd: "node", args: ["tools/audit-count.js"],  gate: false, label: "全站数字统计（重算 report-count.json）" },
  { cmd: "node", args: ["tools/audit-ipa.js"],    gate: false, label: "IPA / 难度审计（重算 report-ipa.csv）" },
];

let failed = 0;
console.log("======== 测试/审计 ========\n");

for (const job of JOBS) {
  const r = spawnSync(job.cmd, job.args, {
    cwd: ROOT,
    encoding: "utf8",
    env: Object.assign({}, process.env, { FORCE_COLOR: "0" }),
  });
  const ok = r.status === 0;
  const banner = (ok ? "✅ " : "❌ ") + job.label + (job.gate ? "（门禁）" : "（报告）");
  console.log("\n───── " + banner + " ─────");
  if (r.stdout) console.log(r.stdout.trimEnd());
  if (r.stderr) console.log(String(r.stderr).trimEnd());
  if (job.gate && !ok) {
    failed++;
    console.log("  ↑ 门禁失败，exit " + r.status);
  }
}

console.log("\n========================================");
if (failed > 0) {
  console.log("❌ 失败门禁数：" + failed);
  process.exit(1);
} else {
  console.log("✅ 全部门禁通过。");
  process.exit(0);
}
