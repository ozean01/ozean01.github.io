/* ============ 软包装外贸英语 · 中国外贸人高频易错点 ============
   灵感来源：《英语常见问题解答大词典》(赵振才) —— 一本收集"中国人学英语
   真正会踩的坑"的错题精选。核心价值：很多错，学习者自己并不知道自己会错
   （"我要是知道就不会错了"，AI 也无从提前告知）。本库提前替你把"你并不
   知道自己会犯的错"挖出来，再一类一类讲清、给出行业例句练习。
   数据结构：
     flowOrder: 业务流程维度（用于"按流程"多入口筛选，见 flows）
     flows:   { id, label }  —— 十二大类业务环节
     grammars: { id, label } —— 语法知识点维度（用于"按语法点"二级索引，见 renderMistakes）
     groups:  [ { id, title, icon, flow, intro, items[] } ]
       items: { wrong 常见错误/中式表达, right 正确表达,
                why 为什么会错/怎么区分, ex 行业例句(正确), exCn 例句中文,
                grammar 语法知识点id（按语法筛选用） }
    依赖：无（纯数据）。渲染见 app.js 的 renderMistakes()。 */
(function () {
  "use strict";
  if (window.FTE_MISTAKES) return;

  const FLOWS = [
    { id: "terms", label: "贸易术语与交货条件" },
    { id: "payment", label: "付款与国际结算" },
    { id: "client", label: "客户开发与商务沟通" },
    { id: "quote", label: "报价、订单与合同" },
    { id: "prod", label: "生产与采购" },
    { id: "ship", label: "国际运输与物流" },
    { id: "customs", label: "报关、清关与海关" },
    { id: "docs", label: "外贸单证" },
    { id: "comply", label: "产品认证与合规" },
    { id: "tax", label: "税费与贸易政策" },
    { id: "risk", label: "合同风险与贸易纠纷" },
    { id: "email", label: "外贸邮件与商务表达" }
  ];

  const GRAMMARS = [
    { id: "article", label: "冠词与限定词" },
    { id: "preposition", label: "介词与介宾搭配" },
    { id: "tense", label: "时态与语态" },
    { id: "pos", label: "词性误用" },
    { id: "collocation", label: "固定搭配与用词" },
    { id: "plural", label: "单复数与不可数" },
    { id: "adverb", label: "副词与程度修饰" },
    { id: "synonym", label: "同义近义词辨析" },
    { id: "industry", label: "行业术语与理化表达" }
  ];

  const GROUPS = [
    {
      id: "cn-interference",
      title: "中式定式干扰",
      icon: "🧠",
      flow: "email",
      intro: "很多错源于母语中文的定式——中文里这么说，照搬成英文就错。以下都是中国外贸人真正的高频坑。",
      items: [
        { wrong: "Please send me your price.", right: "Please send us your quotation / price list.",
          why: "委婉客套 + 明确对象。商务英文习惯用“us / our side”而不用生硬的“me”，指“发货价/报价单”时用 quotation / price list 更准确，price 单独用常指“价格本身”。",
          ex: "Please send us your latest quotation for the stand-up pouches.", exCn: "请把站立袋的最新报价单发给我们。", grammar: "collocation" },
        { wrong: "We very thank you for your support.", right: "We are very grateful for your support / Thank you very much for your support.",
          why: "very 不能直接修饰动词 thank；要修饰形容词 grateful 或拆成副词短语 thank you very much。这是中文“非常感谢”直译的典型错。",
          ex: "We are very grateful for your support during this trial order.", exCn: "我们对贵方在这一试单过程中的支持深表感谢。", grammar: "adverb" },
        { wrong: "I hope you can give me your best price.", right: "Could you offer us your best price? / We would appreciate your best price.",
          why: "商务邮件避免过分客气堆砌，用礼貌问句或委婉表达更自然；give me 偏口语化，offer / quote 更专业。",
          ex: "We would appreciate your best price for a 20,000-piece order.", exCn: "我们希望能得到 2 万件订单的最优报价。", grammar: "collocation" },
        { wrong: "Our factory is very strong.", right: "Our factory has a strong production capacity / We are an experienced manufacturer.",
          why: "“很强大”直译 very strong 很空，且容易歧义（强壮？）。英语更具体：谈产能说 production capacity，谈经验说 experienced。",
          ex: "Our factory is an experienced flexible-packaging manufacturer with a strong monthly capacity.", exCn: "我们工厂是有经验、月产能很强的软包装制造商。", grammar: "collocation" },
        { wrong: "We can delivery in 30 days.", right: "We can deliver within 30 days. / The lead time is 30 days.",
          why: "delivery 是名词，做动词要用 deliver；“30 天内”用 within 而非 in（in 30 days 偏“第 30 天/30 天后”）。",
          ex: "We can deliver within 30 days after receipt of your deposit.", exCn: "收到定金后我们可在 30 天内交货。", grammar: "pos" },
        { wrong: "I will contact you if you have problem.", right: "I will contact you if there is any problem. / if you have any questions.",
          why: "problem 是可数名词，“有问题”要 any problem(s)；there be 句型更地道；问句常用 questions。",
          ex: "Please let us know if you have any questions before we arrange the shipment.", exCn: "在我们安排装运前，如有任何问题请告知我们。", grammar: "plural" }
      ]
    },
    {
      id: "near-synonyms",
      title: "同义近义词区分",
      icon: "🔀",
      flow: "quote",
      intro: "意思相近、容易用一个顶另一个的词。外贸沟通里用错会直接影响价格、交期与责任划分的准确性。",
      items: [
        { wrong: "We will send the quotation / We are going to send the quotation.",
          right: "We will send it now. / We are going to raise the price next month.",
          why: "will 表临时决定、承诺（现在正要做）；be going to 表已计划、近期安排（提前打算）。例句：报价当下发用 will，计划涨价用 be going to。",
          ex: "We are going to increase the price next month, so we will send you today's quote now.", exCn: "我们下个月要涨价，所以现在就把今天的报价发给您。", grammar: "tense" },
        { wrong: "Could you quote me the price / Could you quote the price to me.",
          right: "We quote you a price for the goods. / Could you submit a quotation for us?",
          why: "quote 的搭配：quote sb a price for sth；指“提交报价单”更常用 submit/send a quotation。",
          ex: "Could you send us a quotation for 10 tons of laminating adhesive?", exCn: "能否为 10 吨复合胶给我们发一份报价？", grammar: "preposition" },
        { wrong: "The price is high / low.", right: "The price is competitive / the cost is high.",
          why: "谈价格竞争力用 competitive；“高/低”放在 price 上不自然，常指 cost 高，或价格“让步”用 flexible。",
          ex: "Our price is competitive for this specification and quantity.", exCn: "在这一规格与数量下，我们的价格是有竞争力的。", grammar: "synonym" },
        { wrong: "This is a sample for free.", right: "This sample is free of charge. / We can provide a free sample.",
          why: "“免费”不要说 for free（口语），正式写成 free of charge；也可用 provide a free sample。",
          ex: "We provide a free sample; you only pay the courier cost.", exCn: "我们免费提供样品，您只需付快递费。", grammar: "collocation" }
      ]
    },
    {
      id: "grammar-tense",
      title: "限定词与单复数",
      icon: "📐",
      flow: "email",
      intro: "一套、一次、一条——英语里要用冠词、单复数、限定词，中文常省略，于是漏掉。这些错很“小”，但很显眼，容易被客户看出不专业。",
      items: [
        { wrong: "We will arrange shipment in this week.", right: "We will arrange shipment this week / within this week.",
          why: "this week 前不加 in（in this week 是典型中式）。“一周内”用 within。",
          ex: "We will arrange shipment this week and update you on the vessel.", exCn: "我们本周安排装运，并告知您船期。", grammar: "preposition" },
        { wrong: "Please check the packing list and B/L.", right: "Please check the packing list and the B/L.",
          why: "特定单证前用 the，形成“这些单据”的指代；并列名词前补冠词更规范。",
          ex: "Please check the packing list and the bill of lading before we confirm.", exCn: "请在确认前核对装箱单与提单。", grammar: "article" },
        { wrong: "We have in stock two kinds of film.", right: "We have two kinds of film in stock.",
          why: "“有现货”固定搭配 have ... in stock，位置在宾语后；two kinds of film（film 通常不可数/总称不用复数）。",
          ex: "We currently have two kinds of barrier film in stock.", exCn: "我们目前有两种阻隔膜现货。", grammar: "plural" },
        { wrong: "The machine has been running for 3 years.", right: "The machine has been in operation for 3 years.",
          why: "指“投产/运行几年”用 be in operation；running 偏运行中的动作状态。谈设备年限习惯用 in operation / since。",
          ex: "Our laminating line has been in operation for 8 years with stable quality.", exCn: "我们的复合生产线已稳定运行 8 年。", grammar: "tense" }
      ]
    },
    {
      id: "industry-terms",
      title: "行业高频误译",
      icon: "🏭",
      flow: "prod",
      intro: "软包行业里最容易用错/被直译带偏的专业表达。直接关系技术与责任的准确性，务必用对。",
      items: [
        { wrong: "laminate / lamination 混用，直接把 film 说成 laminated.", right: "laminate (v. 复合) / lamination (n. 复合工艺) / laminated film (复合膜).",
          why: "动词复合用 laminate，工艺用 lamination，成品用 laminated film；不要把“复合”全用 lamination 当名词，也不要把 film 单称 laminated。",
          ex: "We laminate two layers of film with a solvent-free adhesive to produce the laminated film.", exCn: "我们用无溶剂胶复合两层薄膜，制成复合膜。", grammar: "pos" },
        { wrong: "The coating thickness is 3 gs / 3 ga.", right: "The coating weight is 3 g/m². / The film is 25 microns thick.",
          why: "gs/ga 是业内口语但国际交流不统一，专业的“上胶量”写作 g/m²（grams per square meter），膜厚用 micron / μm。",
          ex: "The adhesive coating weight is maintained at 3 g/m² for this lamination.", exCn: "此次复合将上胶量控制在 3 g/m²。", grammar: "industry" },
        { wrong: "We use recycle material.", right: "We use recycled / post-consumer recycled (PCR) material.",
          why: "recycle 是动词/名词，“回收料”用 recycled 或 PCR（post-consumer recycled），并用“含回收比例”说明（e.g. 30% PCR）。",
          ex: "This pouch uses 30% post-consumer recycled (PCR) material.", exCn: "这款袋采用 30% 的消费后回收材料。", grammar: "industry" },
        { wrong: "The bag is waterproof / water-proof.", right: "The bag is moisture-resistant / has a high barrier to moisture.",
          why: "软包通常不是“防水”，而是防潮/阻隔水汽；“防水”用 waterproof 易误导。阻隔性说 barrier property，防潮说 moisture barrier。",
          ex: "This laminated film provides a high moisture and oxygen barrier for food packaging.", exCn: "这种复合膜为食品包装提供优异的防潮与隔氧阻隔性。", grammar: "industry" },
        { wrong: "We will arrange the delivery date.", right: "We will confirm the delivery date / the shipment schedule.",
          why: "arrange 用于安排（车/船/清关等）；确认交期用 confirm；交期说 lead time，发货排期说 shipment schedule。",
          ex: "We will confirm the delivery date once the production schedule is fixed.", exCn: "生产计划确定后，我们会与您确认交期。", grammar: "collocation" }
      ]
    }
  ];

  window.FTE_MISTAKES = {
    note: "中国外贸人高频易错点 · 源自《英语常见问题解答大词典》的同款思路：把「你自己并不知道自己会错」的坑提前挖出来。",
    flows: FLOWS,
    grammars: GRAMMARS,
    groups: GROUPS
  };
})();
