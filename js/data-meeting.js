/* ============ 单元 19：客户会议与产品汇报（追加到 FTE_DATA.units） ============
   面向「向客户开口」的高价值场景：主持会议议程、产品展示与卖点陈述、回答质询、
   会议跟进与行动项。软包装 + 复膜胶语境。 */
(function () {
  "use strict";
  if (typeof FTE_DATA === "undefined" || !FTE_DATA || !FTE_DATA.units) return;
  FTE_DATA.units.push({
    id: 19,
    title: "客户会议与产品汇报",
    titleEn: "Customer Meetings & Product Presentation",
    icon: "📊",
    summary: "把「向客户开口」这一最高价值、也最让人紧张的场景讲透：主持会议议程、做产品汇报与卖点陈述、回答买家质询、会议跟进与行动项闭环——软包装与复膜胶的会议英文。",
    vocab: [
      { w: "sales pitch", ipa: "/ˈseɪlz pɪtʃ/", pos: "n.", cn: "推销话术，卖点陈述", ex: "Keep your sales pitch focused on the biggest benefit, not every feature.", exCn: "推销话术要盯着最大的好处讲，而不是罗列所有特性。" },
      { w: "value proposition", ipa: "/ˈvæljuː ˌprɑːpəˈzɪʃn/", pos: "n.", cn: "价值主张", ex: "Our value proposition is lower total cost, not just a lower unit price.", exCn: "我们的价值主张是更低的总成本，而不只是更低的单价。" },
      { w: "key selling point", ipa: "/kiː ˈselɪŋ pɔɪnt/", pos: "n.", cn: "核心卖点", ex: "The key selling point of this film is its high oxygen barrier at a lower cost.", exCn: "这款膜的核心卖点是低成本下的高阻氧性。" },
      { w: "product demo", ipa: "/ˈprɑːdʌkt ˈdemoʊ/", pos: "n.", cn: "产品演示", ex: "We will run a live product demo and show the peel strength test on site.", exCn: "我们会现场做产品演示，并做剥离强度测试。" },
      { w: "differentiator", ipa: "/ˌdɪfəˈrenʃieɪtə/", pos: "n.", cn: "差异化优势，区分点", ex: "Our main differentiator is the reliable batch-to-batch consistency.", exCn: "我们最主要的差异化优势是批间稳定的重现性。" },
      { w: "benchmark", ipa: "/ˈbentʃmɑːk/", pos: "n.", cn: "基准，对标水平", ex: "We benchmark our residual solvent against the EU food-contact limit.", exCn: "我们以欧盟食品接触限量作为残留溶剂的基准。" },
      { w: "agenda", ipa: "/əˈdʒendə/", pos: "n.", cn: "议程，议题", ex: "Let's go through the agenda: product update, pricing, then delivery.", exCn: "我们按议程走：产品更新、价格、然后是交期。" },
      { w: "action item", ipa: "/ˈækʃn ˈaɪtəm/", pos: "n.", cn: "行动项，待办事项", ex: "Please add the compliance documents to the action items before we close.", exCn: "在结束前请把合规文件列入行动项。" },
      { w: "follow-up", ipa: "/ˈfɑːloʊ ʌp/", pos: "n.", cn: "跟进，后续动作", ex: "We will send the follow-up with all action items and owners by Friday.", exCn: "我们周五前会发出含所有行动项和负责人的跟进纪要。" },
      { w: "minutes", ipa: "/ˈmɪnɪts/", pos: "n.", cn: "会议纪要", ex: "I will circulate the minutes right after the call.", exCn: "会议结束后我会立刻分发会议纪要。" },
      { w: "stakeholder", ipa: "/ˈsteɪkhoʊldə/", pos: "n.", cn: "利益相关方，干系人", ex: "Your procurement and quality teams are both stakeholders in this decision.", exCn: "贵司的采购和质检团队都是这个决策的利益相关方。" },
      { w: "decision maker", ipa: "/dɪˈsɪʒn ˈmeɪkə/", pos: "n.", cn: "决策人", ex: "Is there anyone else on your side who is a decision maker on this order?", exCn: "贵方对这个订单还有没有其他决策人？" },
      { w: "objection", ipa: "/əbˈdʒekʃn/", pos: "n.", cn: "异议，反对意见", ex: "Let me address your objection about the higher price with a cost comparison.", exCn: "我用成本对比来回应您对更高报价的异议。" },
      { w: "concern", ipa: "/kənˈsɜːn/", pos: "n.", cn: "顾虑，担忧", ex: "Your concern about shelf life is fair, so we test migration for every batch.", exCn: "您对货架期的顾虑很合理，所以我们每个批次都做迁移测试。" },
      { w: "assurance", ipa: "/əˈʃʊərəns/", pos: "n.", cn: "保证，承诺", ex: "We can give you a written assurance on the batch consistency.", exCn: "我们可就批间一致性给您书面保证。" },
      { w: "commitment", ipa: "/kəˈmɪtmənt/", pos: "n.", cn: "承诺，投入承诺", ex: "This trial order is our commitment to support your launch.", exCn: "这个试单就是我们对支持您上市投入的承诺。" },
      { w: "capability", ipa: "/ˌkeɪpəˈbɪləti/", pos: "n.", cn: "能力，产能", ex: "Our monthly capability is enough for a repeat order of this size.", exCn: "我们的月产能足以承接这个规模的回单。" },
      { w: "capacity", ipa: "/kəˈpæsəti/", pos: "n.", cn: "产能，容量", ex: "We have spare capacity in June to fit your peak season.", exCn: "我们六月还有富余产能，能贴合您的旺季。" },
      { w: "win-win", ipa: "/ˌwɪn ˈwɪn/", pos: "n.", cn: "双赢", ex: "We are looking for a win-win: better quality for you, stable volume for us.", exCn: "我们追求双赢：质量对您更好，稳定订单量对我们更稳。" },
      { w: "call to action", ipa: "/ˈkɔːl tu ˈækʃn/", pos: "n.", cn: "行动号召（促成交）", ex: "Shall we schedule a small trial run so you can verify the quality?", exCn: "要不要安排一个小批量试单，让你们先验证一下质量？" }
    ],
    phrases: [
      { p: "open the meeting", cn: "开场主持，宣布开会", ex: "Thank you everyone for joining. Let me open the meeting with a quick agenda.", exCn: "谢谢大家参加。我用一个简要议程开场。" },
      { p: "run through the agenda", cn: "过一遍议程", ex: "Let's run through the agenda: product update, then pricing, then delivery.", exCn: "我们过一遍议程：产品更新、价格、然后交期。" },
      { p: "walk you through the product", cn: "带您过一遍产品（讲解）", ex: "Let me walk you through the product and highlight the key selling points.", exCn: "我带您过一遍产品，并指出核心卖点。" },
      { p: "present the value proposition", cn: "陈述价值主张", ex: "Let me present our value proposition in one sentence: lower total cost.", exCn: "我用一句话陈述价值主张：更低的总成本。" },
      { p: "address an objection", cn: "回应异议", ex: "Let me address that objection directly with a side-by-side comparison.", exCn: "我用一个并排对比直接回应这个异议。" },
      { p: "acknowledge your concern", cn: "先认可对方的顾虑", ex: "I understand your concern about lead time; let me share the production schedule.", exCn: "我理解您对交期的顾虑，我来讲一下生产排期。" },
      { p: "agree on the action items", cn: "敲定行动项", ex: "Let's agree on the action items and assign an owner to each.", exCn: "我们敲定行动项，并为每项指定负责人。" },
      { p: "circulate the minutes", cn: "分发会议纪要", ex: "I will circulate the minutes with the agreed action items within 24 hours.", exCn: "我会在 24 小时内分发含已敲定行动项的会议纪要。" }
    ],
    dialogues: [
      {
        title: "客户会议与新品汇报（Product Update in a Customer Meeting）",
        lines: [
          { sp: "A", en: "Thank you all for joining today. Let's open with the agenda: our new solventless adhesive, then pricing, then delivery.", cn: "谢谢大家参加今天的会议。我们按议程开场：新品无溶剂复膜胶、然后价格、最后交期。" },
          { sp: "B", en: "Sounds good. Could you walk us through the product first? What is the biggest benefit for us?", cn: "好的。能先带我们过一下产品吗？对我们最大的好处是什么？" },
          { sp: "A", en: "The biggest benefit is, in one sentence, lower total cost. The solventless adhesive cuts solvent cost and curing time while giving you higher bonding strength.", cn: "最大的好处一句话：更低的总成本。无溶剂胶既省溶剂成本、缩短熟化时间，又带来更高的粘结强度。" },
          { sp: "B", en: "That sounds attractive. But how do you guarantee the food-contact compliance we need for our pouches?", cn: "听起来不错。但你们怎么保证我们袋子需要的食品接触合规？" },
          { sp: "A", en: "Good question. We test total migration for every batch against EU 1935/2004, and we can supply the declaration of conformity and the certificate of analysis per batch.", cn: "问得好。我们每个批次都按欧盟 1935/2004 做总迁移测试，并可提供逐批的符合性声明与分析证书。" },
          { sp: "B", en: "What about the batch-to-batch stability? Our line runs fast, and a change in adhesion would cause downtime.", cn: "那批间稳定性呢？我们产线跑得快，粘合力一变就会停机。" },
          { sp: "A", en: "That is exactly our differentiator. We keep a retention sample of every batch and hold the adhesion tolerance within plus or minus two N per 15 millimetres.", cn: "这正是我们的差异化优势。我们每个批次留样，并把 15 毫米宽的粘合力公差控制在正负两牛以内。" },
          { sp: "B", en: "Good. I have one more concern before we talk price: how quickly can you deliver a trial batch?", cn: "好。谈价前我还有一点顾虑：小批量试单多久能交？" },
          { sp: "A", en: "For a one-tonne trial we need ten days after your artwork and specification are confirmed. We have spare capacity next month to fit your peak season.", cn: "一吨试单在贵方确认稿件和规格后需要十天。我们下个月还有富余产能，能贴合你们的旺季。" },
          { sp: "B", en: "Everything checks out. Let's see the numbers, then we'll decide.", cn: "都没问题。那就看价格吧，看完我们决定。" },
          { sp: "A", en: "Of course. I'll present the volume pricing, and if you agree, we can schedule the trial run today. Shall we set that as our call to action?", cn: "当然。我来讲阶梯量价格，如果合适，今天就安排试单——就把这作为本次的行动号召吧。" }
        ]
      }
    ],
    tips: [
      "开会先讲一句话价值主张，别一上来堆参数。客户记不住十几个特性，只记得住「你到底帮我省了多少、赚了多少」。用一句「lower total cost」开场，再展开一两个证据，比背一遍 product spec 有说服力。",
      "面对质疑先认可再说理，不要立刻反驳。客户说「太贵」或「交期太长」，第一步是「I understand your concern」，第二步用事实或对比回应，第三步给出选择或承诺。一开口就辩解，客户只会觉得你在狡辩。",
      "会议结束必须闭环行动项。哪怕只谈 20 分钟，也要在结束前把 action items 敲定、指定负责人，并承诺 24 小时内发 minutes。没有行动项的会议等于白开——客诉线索、报价跟进、寄样都会漏掉。",
      "会后跟进邮件胜过会上承诺。会上谈得再好，没有一封白纸黑字的跟进，客户三天就忘。把「我方承诺 + 行动项 + 时间点 + 负责人」写进 follow-up，既是专业度，也是保护你自己的工作留痕。"
    ]
  });
})();
