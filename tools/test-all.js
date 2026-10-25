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
const fs = require("fs");

const ROOT = path.join(__dirname, "..");

/* ★ CI 修复（2026-10-11）：单一数据源门禁的环境自适配。
   小程序端是**兄弟目录** `../外贸英语小程序/`，不在本仓库里 ——
   所以 CI / 异地 clone 里永远没有 `utils/data.js`，而该门禁默认 strict（测不了 = 失败），
   直接导致 `node tools/test-all.js` 在 CI 里 100% 常红（本次推送就是这么红的）。
   这里按"数据在不在"决定参数：本机严格；CI 显式 `--allow-missing`，
   并把这件事**写进 job 标签**（不是静默跳过，输出可见）。 */
const HAS_MINIPROGRAM = fs.existsSync(path.join(ROOT, "..", "外贸英语小程序", "utils", "data.js"));

/* gate: true → 必须 exit 0；false → 仅重算报告，失败不阻塞（打印即可） */
const JOBS = [
  { cmd: "node", args: ["tools/audit-fsrs.js"],   gate: true,  label: "FSRS 参数/公式对齐官方 ts-fsrs" },
  { cmd: "node", args: ["tools/test-boot.js"],    gate: true,  label: "启动完整性：全部脚本按序执行 / 模块全局就绪" },
  { cmd: "node", args: ["tools/test-score.js"],   gate: true,  label: "跟读评分全站唯一实现（算法等价 / 无重复实现）" },
  { cmd: "node", args: ["tools/test-acoustic.js"],gate: true,  label: "声学反馈 P0-1：F0 检出/八度防护/停顿边界/诚实边界/接线" },
  { cmd: "node", args: ["tools/test-budget.js"],  gate: true,  label: "性能预算：子资源数/JS gzip 总量/最大单文件（棘轮上限）+ CLS 骨架载体" },
  { cmd: "node", args: ["tools/test-p034.js"],    gate: true,  label: "P0-3/P0-4：AI 对练会话持久化 + 自由表达录音留档回听" },
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
  { cmd: "node", args: ["tools/test-immerse-weekly.js"], gate: true, label: "全英模式 + 本周新料：清单↔CSS 对账 / 越界守卫 / 接线 / ISO 周轮换" },
  { cmd: "node", args: ["tools/test-phonemes.js"],gate: true,  label: "音素课：分词器覆盖全语料/索引/接线" },
  { cmd: "node", args: ["tools/test-shadow.js"],  gate: true,  label: "词级跟读 P10：复读次数/间隔夹取 + onDone 只一次 + 接线" },
  { cmd: "node", args: ["tools/test-today.js"],   gate: true,  label: "今日：日循环五步 / 深链交叉校验 / 接线" },
  /* P1（门禁时钟解耦）+ P3（活跃日台账）+ P0′（注入复现）——第一阶段补的三道门禁 */
  { cmd: "node", args: ["tools/test-activedays.js"], gate: true, label: "活跃日台账 P3：旗舰路径记账 / 撤销删键 / 历史迁移 / 受控时钟" },
  { cmd: "node", args: ["tools/x-repro-injection.js"], gate: true, label: "注入复现 P0′：5 个历史未转义出口现在必须全部挡住" },
  { cmd: "node", args: ["tools/test-placement.js"],gate: true, label: "水平自测 v2：基线落日期并锁定 / 分项定级 / 复测排期" },
  { cmd: "node", args: ["tools/test-home.js"],    gate: true,  label: "首页 P1：导航↔路由双向对账 / 旧机制未复活" },
  { cmd: "node", args: ["tools/test-urgent.js"],  gate: true,  label: "场景急救：每个场景都能给出话 / 架构冻结守卫" },
  { cmd: "node", args: ["tools/test-sop.js"],     gate: true,  label: "SOP 英文接入练习引擎：每句都有练习路径" },
  { cmd: "node", args: ["tools/test-assets.js"],  gate: true,  label: "静态资源接线：引用存在 + 预缓存完整" },
  { cmd: "node", args: ["tools/test-glossary.js"],gate: true,  label: "术语速查 P11：数据完整 / 音标口径 / 不与课程词库重复 / 接线与渲染" },
  { cmd: "node", args: ["tools/test-security.js"], gate: true, label: "安全与数据可信：转义 / CSP / 备份全覆盖无凭据" },
  { cmd: "node", args: ["tools/test-term-score.js"], gate: true, label: "术语发音分口径：大小写 / 多词术语 / near / 不适用" },
  { cmd: "node", args: ["tools/test-honesty.js"], gate: true, label: "诚实性不变量：能力栏 / 快照 / 复测可比 / 样本门" },
  { cmd: "node", args: ["tools/test-ui-quality.js"], gate: true, label: "UI 质量：播放回退 / 离线识别诚实 / 移动导航 / 键盘 ARIA / 对比度现场计算" },
  { cmd: "node", args: ["tools/test-outcomes.js"],gate: true,  label: "出口能力断言：锚点存在 / 口径守卫 / 加载顺序" },
  { cmd: "node", args: ["tools/test-difficulty.js"], gate: true, label: "难度标定 P3-4：CEFR 命中数门限 / 条目量项 / 同形异义排除 / dom 收窄" },
  { cmd: "node", args: ["tools/check-single-source.js"].concat(HAS_MINIPROGRAM ? [] : ["--allow-missing"]), gate: true, label: "单一数据源：小程序数据可由网页版重生成" + (HAS_MINIPROGRAM ? "（严格模式：本机检测到小程序数据）" : "（⚠️ 本环境没有 ../外贸英语小程序/utils/data.js → 传 --allow-missing：漂移检查只在有该目录的机器上生效）") },
  { cmd: "node", args: ["tools/test-doc-numbers.js"], gate: true, label: "文档数字对账：README 的数量宣称必须与实测数据一致" },
  { cmd: "node", args: ["tools/test-p0-content.js"], gate: true, label: "P0 内容不变量：术语/法规禁用串 · GA 卷舌 · #wsAi 渲染 · ESM 加载 · 冒烟页口径 · 零埋点措辞" },
  { cmd: "node", args: ["tools/test-ai-prompt-inventory.js"], gate: true, label: "AI 调用点清单：FACT_GUARD 覆盖 / AIDisclosure 披露 / termCheck 默认 / 调用点与渲染点漂移" },
  { cmd: "node", args: ["tools/test-ai-eval-cases.js"], gate: true, label: "AI 红队用例：83 条 anchor 引用 / 11 条链路提示词漂移 / 16 个判分器正反例（零依赖无网络）" },
  { cmd: "node", args: ["tools/audit-input.js"],  gate: true,  env: { FTE_NO_WRITE: "1" }, label: "可理解输入量：总量下限 / 每词复现次数分布 / 每单元输入密度（只读：不写 report-input.json）" },
  { cmd: "node", args: ["tools/export-roundtrip.js"], gate: true, label: "导出/导入往返 P0′：7 类数组记录保型 / 合法数据不误伤 / 注入被净化 / 迁移落盘" },
  { cmd: "node", args: ["tools/check-tracked.js"], gate: true, label: "版本库一致性：index.html 的脚本必须已被 git 跟踪（P0-08：已从 gate:false 升为硬门禁）" },
  { cmd: "node", args: ["tools/audit-count.js"],  gate: false, env: { FTE_NO_WRITE: "1" }, label: "全站数字统计（P1-D：只读模式，不写 report-count.json）" },
  { cmd: "node", args: ["tools/audit-ipa.js"],    gate: false, env: { FTE_NO_WRITE: "1" }, label: "IPA / 难度审计（P1-D：只读模式，不写 report-ipa.csv）" },
  { cmd: "node", args: ["tools/test-p1-invariants.js"], gate: true, label: "P1 不变量：口音真话 · 分数构念分桶 · 记账口径 · 投料口校验 · .ics RRULE · 发布链 · 只读审计" },
];

let failed = 0;
console.log("======== 测试/审计 ========\n");

for (const job of JOBS) {
  const r = spawnSync(job.cmd, job.args, {
    cwd: ROOT,
    encoding: "utf8",
    env: Object.assign({}, process.env, { FORCE_COLOR: "0" }, job.env || {}),
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
