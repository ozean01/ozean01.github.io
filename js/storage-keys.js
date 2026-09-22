/* ============ 存储键注册表（P0-3）============
   为什么需要它：全站的 localStorage 键原先散落在 20 多个文件里，靠各自手写的常量。
   导出备份只覆盖了其中 4 个（progress / pref / listen / sop），于是「导出备份 → 换电脑 → 导入」
   会静默丢掉：SOP 勾选、90 天学习走势、口语雷达原始分、自述语料库、写作作品、单证草稿、
   看板、水平自测基线……而页面明确承诺「导入即可续学」，承诺与实现不一致。

   本文件是**唯一权威清单**，只做一件事：给每个键声明归属、用途、是否可备份、是否含敏感信息。
   `js/export.js` 从它生成备份清单；`tools/test-security.js` 用它做对账门禁
   （注册表必须覆盖代码里出现的每个存储键字面量，新增键忘了登记就直接失败）。

   约定：
     · backup: false 的键不写进备份文件；secretKeys 里的键**绝不导出**。
     · secretFields 用于「键本身可备份、但里面某个字段是凭据」的情况（如 progress.azureKey）。
     · kind 只是给人和门禁看的分类，不参与运行时逻辑。 */
(function () {
  "use strict";
  window.FTE_STORAGE = {
    version: 1,

    /* 绝不写入备份文件的键（凭据 / 隐私） */
    secretKeys: ["fte-tutor-cfg"],

    /* 键可备份，但导出前必须删掉这些字段 */
    secretFields: {
      "fte-progress-v1": ["azureKey"]
    },

    keys: [
      { key: "fte-progress-v1", kind: "progress", owner: "app.js", backup: true, note: "掌握词、单词卡状态、错题、打卡、能力证据（含 azureKey 字段，导出时剔除）" },
      { key: "fte-pref-v2", kind: "pref", owner: "app.js", backup: true, note: "发音引擎/发音人/语速/口音等偏好" },
      { key: "fte-mig-google-default", kind: "pref", owner: "app.js", backup: true, note: "一次性迁移标记（默认音源已从 Google 切换）" },
      { key: "fte-history-v1", kind: "progress", owner: "app.js", backup: true, note: "每日学习效果快照（学习走势曲线）" },
      { key: "fte-home-favs", kind: "pref", owner: "app.js", backup: true, note: "首页收藏到常用" },
      { key: "fte-home-goal", kind: "pref", owner: "app.js", backup: true, note: "工作目标（个人化「今日」的依据）" },
      { key: "fte-onboarded", kind: "pref", owner: "app.js", backup: true, note: "首次上手横幅已处理" },
      { key: "fte-placement", kind: "progress", owner: "app.js", backup: true, note: "水平自测起点单元" },
      { key: "fte-placement-bank", kind: "progress", owner: "app.js", backup: true, note: "水平自测的固定题库（同一用户复测用同一套题，分数才可比）" },
      { key: "fte-placement-v2", kind: "progress", owner: "placement.js", backup: true, note: "水平自测 v2 基线（分项定级 + 复测排期）" },
      { key: "fte-board-v1", kind: "progress", owner: "board.js", backup: true, note: "本周学习看板三列任务" },
      { key: "fte-eval4-v1", kind: "progress", owner: "eval4.js", backup: true, note: "四维口语实战成绩" },
      { key: "fte-speech-v1", kind: "progress", owner: "speech.js / radar.js", backup: true, note: "自由表达分析历史（雷达图数据源）" },
      { key: "fte-listen-v1", kind: "progress", owner: "listen.js", backup: true, note: "辨音训练最好成绩" },
      { key: "fte-mysay-v1", kind: "progress", owner: "mysay.js", backup: true, note: "我的自述语料库（中文自述 → 地道英文）" },
      { key: "fte-writes-v1", kind: "progress", owner: "write.js", backup: true, note: "写作作品集（一稿/二稿/独立稿 + AI 留痕）" },
      { key: "fte-write-state", kind: "draft", owner: "write.js", backup: true, note: "写作专区未完成的草稿状态" },
      { key: "fte-sop-v1", kind: "progress", owner: "sop.js", backup: true, note: "外贸实操 SOP 勾选进度" },
      { key: "fte-docgen-v1", kind: "draft", owner: "sop.js", backup: true, note: "单证生成器表单与明细行草稿" },
      { key: "fte-ports", kind: "pref", owner: "sop.js / data-ports.js", backup: true, note: "常用港口选择" },
      { key: "fte-rates-v1", kind: "cache", owner: "sop.js", backup: true, note: "汇率缓存（带日期，离线时用最近一次）" },
      { key: "fte-today-v1", kind: "progress", owner: "today.js", backup: true, note: "今日五步清单完成状态（跨天重置）" },
      { key: "fte-urgent-v1", kind: "progress", owner: "urgent.js", backup: true, note: "场景急救最近使用记录" },
      { key: "fte-accent", kind: "pref", owner: "player.js", backup: true, note: "听力口音（us/uk，仅影响人声）" },
      { key: "fte-local-asr-v1", kind: "pref", owner: "asr-local.js", backup: true, note: "是否优先使用本地离线识别" },
      { key: "fte-subtitle-mode", kind: "pref", owner: "subtitle.js", backup: true, note: "字幕四档位选择" },
      { key: "fte-sub-notes-v1", kind: "progress", owner: "subtitle.js", backup: true, note: "字幕逐句笔记（按 文件名+起始秒 定位，换字幕不串位）" },
      { key: "fte-tutor-fill", kind: "pref", owner: "tutor.js", backup: true, note: "AI 陪练场景预填/临时输入" },
      { key: "fte-trace-v1", kind: "progress", owner: "entry-trace.js", backup: true, note: "入口离开/主线进入的只读行为记录" },
      { key: "fte-trace-off", kind: "pref", owner: "entry-trace.js", backup: true, note: "行为记录开关（关闭标记）" },
      { key: "fte-tutor-cfg", kind: "secret", owner: "tutor.js / eval4.js / speech.js", backup: false, note: "AI 陪练服务商配置，含 API Key —— 绝不导出" }
    ]
  };
})();
