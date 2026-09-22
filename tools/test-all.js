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
  { cmd: "node", args: ["tools/test-boot.js"],    gate: true,  label: "启动完整性：全部脚本按序执行 / 模块全局就绪" },
  { cmd: "node", args: ["tools/test-score.js"],   gate: true,  label: "跟读评分全站唯一实现（算法等价 / 无重复实现）" },
  { cmd: "node", args: ["tools/test-fsrs.js"],    gate: true,  label: "FSRS 四档评分行为" },
  { cmd: "node", args: ["tools/test-flashprod.js"],gate: true, label: "产出性调度：接受/产出两条线互不影响" },
  { cmd: "node", args: ["tools/test-parser.js"],  gate: true,  label: "句块切分器" },
  { cmd: "node", args: ["tools/test-subtitle.js"],gate: true,  label: "字幕解析 + 分级着色" },
  { cmd: "node", args: ["tools/test-subtitle-ab.js"],gate: true, label: "字幕练习 P8：A-B 复读 / 原声波形映射 / 逐句笔记定位与登记" },
  { cmd: "node", args: ["tools/test-schema.js"],  gate: true,  label: "进度 schema 迁移框架" },
  { cmd: "node", args: ["tools/test-quiz-write.js"],gate: true,  label: "测验写作产出（write）题型" },
  { cmd: "node", args: ["tools/test-patterns.js"], gate: true,  label: "句型克隆库 frame 生成" },
  { cmd: "node", args: ["tools/test-write.js"],   gate: true,  label: "写作二稿闭环：对比算法 / 教学守卫 / 渲染时机" },
  { cmd: "node", args: ["tools/test-mail.js"],    gate: true,  label: "真实业务语料：结构 / 真实性守卫 / 转义与接线" },
  { cmd: "node", args: ["tools/test-mysay.js"],   gate: true,  label: "说我想说：拆句/实词/接线" },
  { cmd: "node", args: ["tools/test-phonemes.js"],gate: true,  label: "音素课：分词器覆盖全语料/索引/接线" },
  { cmd: "node", args: ["tools/test-today.js"],   gate: true,  label: "今日：日循环五步 / 深链交叉校验 / 接线" },
  { cmd: "node", args: ["tools/test-placement.js"],gate: true, label: "水平自测 v2：基线落日期并锁定 / 分项定级 / 复测排期" },
  { cmd: "node", args: ["tools/test-home.js"],    gate: true,  label: "首页 P1：导航↔路由双向对账 / 旧机制未复活" },
  { cmd: "node", args: ["tools/test-urgent.js"],  gate: true,  label: "场景急救：每个场景都能给出话 / 架构冻结守卫" },
  { cmd: "node", args: ["tools/test-sop.js"],     gate: true,  label: "SOP 英文接入练习引擎：每句都有练习路径" },
  { cmd: "node", args: ["tools/test-assets.js"],  gate: true,  label: "静态资源接线：引用存在 + 预缓存完整" },
  { cmd: "node", args: ["tools/test-security.js"], gate: true, label: "安全与数据可信：转义 / CSP / 备份全覆盖无凭据" },
  { cmd: "node", args: ["tools/test-term-score.js"], gate: true, label: "术语发音分口径：大小写 / 多词术语 / near / 不适用" },
  { cmd: "node", args: ["tools/test-honesty.js"], gate: true, label: "诚实性不变量：能力栏 / 快照 / 复测可比 / 样本门" },
  { cmd: "node", args: ["tools/test-ui-quality.js"], gate: true, label: "UI 质量：播放回退 / 离线识别诚实 / 移动导航 / 键盘 ARIA / 对比度现场计算" },
  { cmd: "node", args: ["tools/test-outcomes.js"],gate: true,  label: "出口能力断言：锚点存在 / 口径守卫 / 加载顺序" },
  { cmd: "node", args: ["tools/test-difficulty.js"], gate: true, label: "难度标定 P3-4：CEFR 命中数门限 / 条目量项 / 同形异义排除 / dom 收窄" },
  { cmd: "node", args: ["tools/check-single-source.js"], gate: true, label: "单一数据源：小程序数据可由网页版重生成" },
  { cmd: "node", args: ["tools/test-doc-numbers.js"], gate: true, label: "文档数字对账：README 的数量宣称必须与实测数据一致" },
  { cmd: "node", args: ["tools/audit-input.js"],  gate: true,  label: "可理解输入量：总量下限 / 每词复现次数分布 / 每单元输入密度（重算 report-input.json）" },
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
