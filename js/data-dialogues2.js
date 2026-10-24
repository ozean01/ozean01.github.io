/* ============ 对话语料扩容（P1-5 · 2026-10-24）：追加到既有单元 ============
   由来（评估报告：内容与主题契合 6/10）：28 段对话仅 8 段软包装行业向，U1 一度是
   LED 灯具——对「软包装外贸」站，听说主粮必须行业向过半。本文件向既有单元
   追加 19 段对话（总 28 → 47 段；行业向 8 → 24，占比 51%）。

   语料纪律（与站内一致，不越界）：
   ① 全部例句为**人工撰写核对的**外贸场景英文（B1–B2），术语对齐站内 798 词库与
     SOP（MOQ / peel strength / curing / corona treatment / cut-off / PI / UN1263…）；
   ② 追加方式与 data-deep.js 同款：运行时 push 进 FTE_DATA.units，不改历史单元；
   ③ 每段对话的台词行结构与 data.js 完全一致（{ sp, en, cn }），下游引擎
     （跟读 / 闯关 / 听写 / 连听 / 听后测）零改动自动继承。 */
(function () {
  "use strict";
  if (typeof FTE_DATA === "undefined" || !FTE_DATA || !FTE_DATA.units) return;
  function add(uid, dlg) {
    const u = FTE_DATA.units.filter(function (x) { return x.id === uid; })[0];
    if (u && u.dialogues) u.dialogues.push(dlg);
  }

  /* ---- U2 展会接待 · 无溶剂复合样品（行业） ---- */
  add(2, {
    title: "展会现场：无溶剂复合袋咨询（At the Booth: Solvent-Free Pouches）",
    lines: [
      { sp: "A", en: "Welcome to our booth! These pouches on the shelf are all laminated with our solvent-free adhesive.", cn: "欢迎来到我们展位！货架上的这些袋子都是用我们的无溶剂胶复合的。" },
      { sp: "B", en: "Great. We're looking for a solution for coffee bags. Is this stand-up pouch solvent-free laminated?", cn: "太好了。我们正在找咖啡袋方案。这个自立袋是无溶剂复合的吗？" },
      { sp: "A", en: "Yes. The structure is PET / AL / PE, and there's no solvent residue at all.", cn: "是的。结构是 PET / AL / PE，完全没有溶剂残留。" },
      { sp: "B", en: "What about the peel strength? Coffee bags need a strong bond.", cn: "剥离强度怎么样？咖啡袋需要很强的复合强度。" },
      { sp: "A", en: "It's over 2.5 N/15mm after curing. We can give you a sample to test in your lab.", cn: "熟化后超过 2.5 N/15mm。我们可以给您样品带回实验室测试。" },
      { sp: "B", en: "How long does the curing take?", cn: "熟化需要多长时间？" },
      { sp: "A", en: "About 48 hours at room temperature. It's a two-component adhesive, mixed right before coating.", cn: "室温下大约 48 小时。这是双组分胶，上胶前现场混配。" },
      { sp: "B", en: "Do you also supply the film, or only the adhesive?", cn: "你们也供膜吗，还是只供胶？" },
      { sp: "A", en: "We're an adhesive maker, but we can introduce you to our partner film plants.", cn: "我们是胶水厂，但可以介绍我们的合作膜厂给您。" },
      { sp: "B", en: "Sounds good. Please send me the TDS and a sample kit.", cn: "听起来不错。请把技术数据表和样品包发给我。" }
    ]
  });

  /* ---- U3 报价谈判 · 复合袋阶梯价（行业） ---- */
  add(3, {
    title: "复合膜袋阶梯报价谈判（Pouch Price Negotiation）",
    lines: [
      { sp: "A", en: "Your price for the 100-micron pouches is higher than our current supplier.", cn: "你们 100 微米袋子的报价比我们现在供应商高。" },
      { sp: "B", en: "Our quotation uses food-grade PE and seven-layer co-extruded film. The material grade is different.", cn: "我们的报价用的是食品级 PE 和七层共挤膜，材料等级不一样。" },
      { sp: "A", en: "Can you do better on price if we order 300,000 pieces?", cn: "如果我们订 30 万只，价格能再让一些吗？" },
      { sp: "B", en: "For that quantity, I can reduce the unit price by five percent. Below that, we'd have to drop the food-grade material.", cn: "这个量我可以降 5%。再低就只能换掉食品级材料了。" },
      { sp: "A", en: "What about the printing cylinders? Do we pay for them?", cn: "印刷版辊呢？要我们出钱吗？" },
      { sp: "B", en: "The cylinder fee is one-time. From the second order on, there's no cylinder charge.", cn: "版辊费是一次性的。第二单开始不收。" },
      { sp: "A", en: "Then keep the MOQ at 50,000 and give us the five percent.", cn: "那就保持 5 万只起订量，给我们 5% 的折让。" },
      { sp: "B", en: "Deal. I'll send the revised PI today.", cn: "成交。我今天就把修改后的形式发票发给你。" }
    ]
  });

  /* ---- U4 回复询盘 · 咖啡袋（行业） ---- */
  add(4, {
    title: "咖啡袋询盘回复（Coffee Pouch Inquiry）",
    lines: [
      { sp: "A", en: "Good morning. We're a coffee roaster from Melbourne. Do you make pouches with one-way degassing valves?", cn: "早上好。我们是墨尔本的咖啡烘焙商。你们做带单向排气阀的袋子吗？" },
      { sp: "B", en: "Yes, that's one of our main products. The valve lets CO2 out and keeps oxygen away from the beans.", cn: "是的，那是我们的主打产品之一。阀门把二氧化碳排出去，让氧气远离咖啡豆。" },
      { sp: "A", en: "We need 30,000 bags to start, matte black with our logo in one color.", cn: "我们先要 3 万只，哑光黑，单色印我们的标志。" },
      { sp: "B", en: "One color printing is easy. After you confirm the artwork, samples take about seven days.", cn: "单色印刷简单。确认设计稿后，样品大约 7 天。" },
      { sp: "A", en: "Is the inner layer food-safe for coffee?", cn: "内层对咖啡是食品安全的吗？" },
      { sp: "B", en: "The inner layer is food-grade PE, and we can provide the food contact certificate.", cn: "内层是食品级 PE，我们可以提供食品接触证书。" },
      { sp: "A", en: "What's the MOQ for this custom design?", cn: "这个定制款的最小起订量是多少？" },
      { sp: "B", en: "Twenty thousand pieces per design, because of the printing cylinders.", cn: "每个设计 2 万只，因为要制印刷版辊。" },
      { sp: "A", en: "Fine. Please send us a sample with the valve first.", cn: "好的。请先寄一个带阀样品给我们。" }
    ]
  });

  /* ---- U5 面对面谈判 · 年度协议（通用） ---- */
  add(5, {
    title: "年度供货协议谈判（Annual Supply Agreement）",
    lines: [
      { sp: "A", en: "Thanks for coming to our office. Let's talk about the annual agreement.", cn: "感谢来我们办公室。我们谈谈年度协议吧。" },
      { sp: "B", en: "That's why we're here. We plan to source all our pouches from one supplier this year.", cn: "这正是我们来的目的。今年我们打算把所有袋子集中到一家供应商。" },
      { sp: "A", en: "Then volume matters. If you give us the full forecast, we can hold this year's price for twelve months.", cn: "那量就重要了。如果给我们完整预测，我们可以把今年价格锁 12 个月。" },
      { sp: "B", en: "And if the resin price goes up in between?", cn: "如果期间树脂涨价呢？" },
      { sp: "A", en: "For orders within the forecast, we absorb up to five percent. Beyond that, we renegotiate.", cn: "预测范围内的订单，5% 以内的涨幅我们消化，超出部分再谈。" },
      { sp: "B", en: "Fair enough. We'll share the forecast next week.", cn: "合理。下周我们把预测发过来。" },
      { sp: "A", en: "Perfect. We'll prepare the agreement with a quality clause based on your inspection standard.", cn: "好。我们会按你们的验货标准把质量条款写进协议。" },
      { sp: "B", en: "One more thing — lead time. Four weeks after deposit, fixed in the agreement.", cn: "还有一件事——交期。定金后四周，写进协议固定下来。" }
    ]
  });

  /* ---- U6 付款方式 · 复膜胶订单定金（行业） ---- */
  add(6, {
    title: "复膜胶订单的付款条款（Payment Terms for the Adhesive Order）",
    lines: [
      { sp: "A", en: "About payment: our standard is thirty percent deposit, seventy percent against the B/L copy.", cn: "关于付款：我们的标准是 30% 定金，见提单副本付 70%。" },
      { sp: "B", en: "For the adhesive order we'd like sixty days credit. You know our company well.", cn: "这批胶水订单我们想要 60 天账期。您了解我们公司。" },
      { sp: "A", en: "Sixty days is too long for a first order. Let's start with the standard terms.", cn: "首单 60 天太长了。先按标准条款来。" },
      { sp: "B", en: "What if we pay fifty percent deposit and fifty before shipment?", cn: "那我们付 50% 定金、出货前付清 50% 呢？" },
      { sp: "A", en: "Before shipment is fine for the first order. After three smooth orders, we can discuss credit.", cn: "首单出货前付清可以。顺利合作三单后再谈账期。" },
      { sp: "B", en: "OK, but please ship only after our QC approves the sample from this batch.", cn: "行，但请等我们质检确认这批样品后再发货。" },
      { sp: "A", en: "Agreed. Retention samples from every batch are kept for one year anyway.", cn: "同意。反正每批的留样我们都保存一年。" },
      { sp: "B", en: "Then we'll wire the deposit once we get the PI.", cn: "那我们收到形式发票就汇定金。" }
    ]
  });

  /* ---- U7 危险品运输 · 溶剂型胶水（行业） ---- */
  add(7, {
    title: "溶剂型胶水的危险品海运（Shipping Solvent-Based Adhesive as DG）",
    lines: [
      { sp: "A", en: "This batch is solvent-based adhesive. Is it dangerous goods for shipping?", cn: "这批是溶剂型胶水。海运算危险品吗？" },
      { sp: "B", en: "Yes. It's UN1263, Class 3, and it needs certified UN packaging.", cn: "算。UN1263，3 类，需要认证的 UN 危包。" },
      { sp: "A", en: "Who provides the dangerous goods declaration?", cn: "危险品申报由谁出？" },
      { sp: "B", en: "We do. You'll get the DG declaration, the UN packing certificate, and the MSDS.", cn: "我们出。您会拿到危包申报、UN 包装证书和 MSDS。" },
      { sp: "A", en: "Can it go on a regular container ship?", cn: "能走普通集装箱船吗？" },
      { sp: "B", en: "On container vessels, yes, under the limited quantity rules. But we must declare it to the forwarder three days before the cut-off.", cn: "集装箱船可以，按限量规则走。但必须在截关前三天向货代申报。" },
      { sp: "A", en: "What about warehouse storage at your end?", cn: "你们那边的仓储呢？" },
      { sp: "B", en: "It stays in our certified DG warehouse until loading. Never mixed with general cargo.", cn: "装船前一直放在我们的危化品认证仓，绝不与普货混放。" },
      { sp: "A", en: "The buyer's forwarder should also know the flash point.", cn: "买家的货代也该知道闪点。" },
      { sp: "B", en: "Right. Flash point minus four degrees Celsius. It's on page one of the MSDS, and the freight will carry a DG surcharge.", cn: "对。闪点零下 4 摄氏度，在 MSDS 第一页。运费会有危险品附加费。" }
    ]
  });

  /* ---- U8 电话沟通 · 催色样确认（行业） ---- */
  add(8, {
    title: "电话确认印刷色样（Confirming the Color Proof by Phone）",
    lines: [
      { sp: "A", en: "Hi, this is Mike from Nordic Wrap. I'm calling about the color proof for our pouches.", cn: "您好，我是 Nordic Wrap 的 Mike。打电话问我们袋子的色样。" },
      { sp: "B", en: "Hi Mike. We sent the digital proof on Monday. Did you get it?", cn: "嗨 Mike。我们周一发了电子稿，您收到了吗？" },
      { sp: "A", en: "We got it, but the green looks too dark on screen. Our brand green is lighter.", cn: "收到了，但屏幕上绿色太深。我们品牌绿要浅一些。" },
      { sp: "B", en: "Screen colors can mislead. The best way is a printed proof on the actual film.", cn: "屏幕颜色会有误导。最靠谱的是在实际膜上打印刷样。" },
      { sp: "A", en: "How fast can you print a proof on film?", cn: "在膜上打样要多久？" },
      { sp: "B", en: "Two days. We'll courier it with the Pantone number marked.", cn: "两天。我们会寄快递，并标好潘通色号。" },
      { sp: "A", en: "Please do that. We'll approve against the physical proof, not the screen.", cn: "就这么办。我们以实物色样为准，不看屏幕。" },
      { sp: "B", en: "Noted. Once you sign the proof, we lock it as the color standard for mass production.", cn: "记下了。您签字确认后，我们把它锁定为量产的颜色标准。" }
    ]
  });

  /* ---- U9 质检客诉 · 剥离强度不达标（行业） ---- */
  add(9, {
    title: "剥离强度客诉与联合调查（Peel Strength Complaint）",
    lines: [
      { sp: "A", en: "We have a serious problem. The pouches from batch B2408 delaminate at the seal edge.", cn: "有个严重问题。B2408 批次的袋子封边处脱层了。" },
      { sp: "B", en: "That's the first complaint from that batch. Did you check the peel strength?", cn: "那批货第一次收到客诉。你们测过剥离强度吗？" },
      { sp: "A", en: "Our lab measured 1.8 N/15mm. Our standard is 2.0 minimum.", cn: "实验室测出 1.8 N/15mm。我们的标准是最低 2.0。" },
      { sp: "B", en: "Understood. Please send us samples from the same carton, and keep the roll numbers.", cn: "明白了。请把同一箱的样品寄来，卷号保留好。" },
      { sp: "A", en: "Roll numbers are on the boxes. But we stopped the line because of this.", cn: "卷号在箱子上。但因为这个我们已停线。" },
      { sp: "B", en: "The roll numbers will tell us which coating run it came from. A wrong mixing ratio can cause this.", cn: "卷号能查到是哪个涂布批次。混配比错了会造成这个。" },
      { sp: "A", en: "How long will your investigation take?", cn: "你们的调查要多久？" },
      { sp: "B", en: "Three working days. If it's our adhesive, we replace the batch and cover your rework cost.", cn: "三个工作日。如果是我们的胶水问题，我们换货并承担返工费用。" },
      { sp: "A", en: "And if it's our laminating process?", cn: "如果是我们的复合工艺问题呢？" },
      { sp: "B", en: "Then our engineer will visit and help you tune the coating weight and temperature. Free of charge.", cn: "那我们的工程师上门帮您调上胶量和温度，免费。" },
      { sp: "A", en: "Fair. Send us the investigation plan in writing today.", cn: "公道。今天就请把调查方案书面发来。" }
    ]
  });

  /* ---- U10 处理差评 · 交期延误（通用） ---- */
  add(10, {
    title: "促销季交期延误的沟通（Late Delivery for a Promotion）",
    lines: [
      { sp: "A", en: "We ordered these pouches for a promotion starting June 1st. They arrived on June 5th. The promotion is ruined.", cn: "这批袋子是为 6 月 1 日开始的促销订的，6 月 5 日才到。促销全被打乱了。" },
      { sp: "B", en: "I apologize. The film material was held at customs for three days — that was beyond our control.", cn: "非常抱歉。膜料在海关压了三天，这是我们控制不了的。" },
      { sp: "A", en: "But you confirmed the ship date twice by email.", cn: "但你们邮件里两次确认过发货日期。" },
      { sp: "B", en: "You're right, and we should have flagged the customs risk earlier. Here's what we can do: free freight on your next order.", cn: "您说得对，我们本该更早提示海关风险。我们能做的：下一单免运费。" },
      { sp: "A", en: "Air freight is expensive. Put the promise in writing.", cn: "空运很贵的。承诺要落到书面上。" },
      { sp: "B", en: "I'll add it to the agreement: if a delay looks likely, the urgent part goes by air at our cost. And for this order, we'll take two percent off the invoice.", cn: "我会写进协议：一旦可能延误，急的部分我们出空运费。本单发票再减 2%。" },
      { sp: "A", en: "Accepted. But next season, the deadline is real — no customs surprises.", cn: "接受。但下一季交期是硬的——别再冒出海关意外。" },
      { sp: "B", en: "Understood. From now on you'll get a shipment status update every Monday, whether there's news or not.", cn: "明白。以后每周一您都会收到发货状态更新，有没有消息都发。" }
    ]
  });

  /* ---- U11 技术沟通 · 冷冻食品膜结构选型（行业） ---- */
  add(11, {
    title: "冷冻食品膜的 PA/PE 结构选型（Choosing PA/PE for Frozen Food）",
    lines: [
      { sp: "A", en: "For frozen food, should we use PA / PE or PET / PE?", cn: "冷冻食品用 PA/PE 还是 PET/PE？" },
      { sp: "B", en: "For frozen use, PA / PE is better. PA handles low temperature and puncture resistance.", cn: "冷冻场景 PA/PE 更好。PA 耐低温、耐穿刺。" },
      { sp: "A", en: "What thickness do you recommend?", cn: "厚度你推荐多少？" },
      { sp: "B", en: "PA 15 microns, PE 60 to 80 microns, depending on the filling weight.", cn: "PA 15 微米，PE 60 到 80 微米，看灌装重量。" },
      { sp: "A", en: "And if the customer wants to microwave the pouch?", cn: "如果客户要微波加热呢？" },
      { sp: "B", en: "Then we switch the sealant to CPP or a special retort PE. Standard PE softens and delaminates.", cn: "那就把热封层换成 CPP 或耐蒸煮 PE。普通 PE 会软化脱层。" },
      { sp: "A", en: "What about the printing surface? PA needs corona treatment, right?", cn: "印刷面呢？PA 需要电晕处理吧？" },
      { sp: "B", en: "The film supplier treats it; we check the dyne level before printing. Below 38 dynes we refuse the roll.", cn: "膜厂会处理；印刷前我们测达因值。低于 38 达因的膜卷我们拒收。" },
      { sp: "A", en: "Clear. Please quote both structures for comparison.", cn: "清楚了。两个结构都报价，我们对比一下。" },
      { sp: "B", en: "Sure. PA / PE will be about fifteen percent higher, but the drop-test result is much better.", cn: "好。PA/PE 大约贵 15%，但跌落测试好得多。" }
    ]
  });

  /* ---- U12 订单执行 · 复合排产同步（行业） ---- */
  add(12, {
    title: "复合工序排产与交期同步（Laminating Schedule Sync）",
    lines: [
      { sp: "A", en: "Our customer moved the launch forward by one week. Can your laminating line catch up?", cn: "我们客户把上市时间提前了一周。你们的复合线赶得上吗？" },
      { sp: "B", en: "Let me check the schedule. Printing is done; laminating is booked for Thursday.", cn: "我查一下排产。印刷已完成，复合排在周四。" },
      { sp: "A", en: "Curing takes another two days, right?", cn: "熟化还要再放两天，对吧？" },
      { sp: "B", en: "Forty-eight hours, then slitting and bag making. That lands on Monday.", cn: "48 小时，然后分切制袋，落在周一。" },
      { sp: "A", en: "The customer needs the goods at the port next Wednesday. Is that enough time?", cn: "客户要求下周三货到港口。来得及吗？" },
      { sp: "B", en: "It's tight but doable if the truck leaves Monday night. I'll flag the order as priority.", cn: "紧张但可行，只要周一晚上货车出发。我会把这单标成优先。" },
      { sp: "A", en: "Please also book the QC release on Friday, not later.", cn: "质检放行也请约在周五，别再晚了。" },
      { sp: "B", en: "Will do. If anything slips, you'll hear it from me the same day, not after the cut-off.", cn: "一定。有任何滑动，我当天就告诉您，不会拖到截关后。" }
    ]
  });

  /* ---- U12 验货 · 制袋首件（行业） ---- */
  add(12, {
    title: "制袋首件验货（Bag-Making First Article Inspection）",
    lines: [
      { sp: "A", en: "The pouches are off the bag-making machine. When can we inspect?", cn: "袋子下制袋机了。我们什么时候能验货？" },
      { sp: "B", en: "You're welcome anytime, or we can do a video inspection.", cn: "随时欢迎，或者我们可以视频验货。" },
      { sp: "A", en: "What defect rate did the first run show?", cn: "首件跑下来的不良率是多少？" },
      { sp: "B", en: "Under 0.3 percent, mostly edge wrinkles. That's within the AQL we agreed.", cn: "低于 0.3%，主要是边缘皱褶。在我们约定的 AQL 之内。" },
      { sp: "A", en: "What about the heat seal strength?", cn: "热封强度呢？" },
      { sp: "B", en: "Sealing is at 180 degrees, and every hour we pull a test pouch. Records are on the board.", cn: "热封温度 180 度，每小时拉一个测试袋，记录都挂在看板上。" },
      { sp: "A", en: "Send us photos of the seal area and the tear notch.", cn: "把封边区域和撕口的照片发给我们。" },
      { sp: "B", en: "Sure. The bottom gusset — that was the customer's concern last time — we double-checked it.", cn: "好。底部风琴位上次客户最担心，我们做了双重检查。" },
      { sp: "A", en: "Good. If the video inspection passes, we release the shipment without flying over.", cn: "好。如果视频验货通过，我们就不飞过来了，直接放行。" }
    ]
  });

  /* ---- U13 海运 · 膜卷防潮（行业） ---- */
  add(13, {
    title: "膜卷海运的防潮安排（Moisture Protection for Film Rolls）",
    lines: [
      { sp: "A", en: "Film rolls for sea freight — do we need a special container?", cn: "膜卷走海运——需要特殊柜型吗？" },
      { sp: "B", en: "A standard dry container is fine, but moisture protection matters.", cn: "普通干货柜就行，但防潮是关键。" },
      { sp: "A", en: "What do you do about condensation?", cn: "结露问题怎么处理？" },
      { sp: "B", en: "Desiccant bags inside each pallet wrap, and the rolls go in foil-lined cartons.", cn: "每个托盘缠膜内放干燥剂，膜卷装铝箔内衬纸箱。" },
      { sp: "A", en: "Should we ask the shipping line for a vented container?", cn: "要不要向船公司要通风柜？" },
      { sp: "B", en: "For printed film, a vented container helps in humid seasons. Let's book one from May to September.", cn: "印刷膜在潮湿季节用通风柜有帮助。5 到 9 月我们都订通风柜。" },
      { sp: "A", en: "And the rolls must stand upright, not flat?", cn: "膜卷必须直立放，不能平放？" },
      { sp: "B", en: "Upright, and no pallets stacked above them. We'll mark it on the shipping marks.", cn: "直立，上面不压托盘。我们会写进唛头。" }
    ]
  });

  /* ---- U14 贸易术语 · EXW 还是 FOB（通用） ---- */
  add(14, {
    title: "买家要求报 EXW，怎么办（EXW or FOB for a New Buyer）",
    lines: [
      { sp: "A", en: "The buyer asked us to quote EXW our factory. Is that wise?", cn: "买家让我们报工厂交货价 EXW。这样明智吗？" },
      { sp: "B", en: "EXW looks cheap but pushes all the export work to the buyer.", cn: "EXW 看着便宜，但把所有出口手续都推给了买家。" },
      { sp: "A", en: "And if the buyer has no agent here?", cn: "如果买家在国内没有代理呢？" },
      { sp: "B", en: "Then the goods sit in the warehouse, and you still carry the risk until they're picked up.", cn: "那货就躺在仓库里，而且在被提走之前风险都在你这边。" },
      { sp: "A", en: "So we should advise FOB?", cn: "所以我们该建议 FOB？" },
      { sp: "B", en: "For a first-time buyer, yes. Quote FOB Shanghai — we handle customs and loading, and the price difference is small.", cn: "首次合作的买家，是的。报 FOB 上海——我们负责报关装船，差价很小。" },
      { sp: "A", en: "What if they insist on EXW to use their own forwarder?", cn: "如果他们坚持 EXW、用自己的货代呢？" },
      { sp: "B", en: "Fine, but then we state clearly in the PI: buyer bears all risks and costs from ex-works pickup.", cn: "可以，但在形式发票里写清楚：自工厂提货起一切风险与费用由买方承担。" }
    ]
  });

  /* ---- U15 收款 · 信用证软条款（行业） ---- */
  add(15, {
    title: "胶水订单信用证的软条款（A Soft Clause in the L/C）",
    lines: [
      { sp: "A", en: "The buyer opened the L/C for the adhesive order. But there's a soft clause.", cn: "买家为胶水订单开出了信用证，但里面有一条软条款。" },
      { sp: "B", en: "What does it say?", cn: "写了什么？" },
      { sp: "A", en: "Inspection certificate signed by the buyer's representative before shipment.", cn: "「发货前由买方代表签署的检验证书」。" },
      { sp: "B", en: "That means their agent controls whether we can ship. Risky.", cn: "那他们的代理就能决定我们能不能发货。有风险。" },
      { sp: "A", en: "Exactly. We asked them to change it to a third-party inspection, like SGS.", cn: "正是。我们要求改成第三方检验，比如 SGS。" },
      { sp: "B", en: "Did they agree?", cn: "他们同意了吗？" },
      { sp: "A", en: "They agreed to SGS, but we pay the inspection fee. About 350 dollars.", cn: "同意换成 SGS，但检验费我们出，大约 350 美元。" },
      { sp: "B", en: "Take it. A delayed payment under L/C costs more than 350 dollars.", cn: "接受吧。信用证下付款拖延的损失比 350 美元大。" },
      { sp: "A", en: "Also, all documents must show the goods name exactly as the L/C says.", cn: "还有，所有单据上的品名必须与信用证一字不差。" },
      { sp: "B", en: "One word off and the bank rejects the documents. I'll brief the documentation team.", cn: "差一个词银行就拒付。我会跟单证组交代清楚。" }
    ]
  });

  /* ---- U16 风险与纠纷 · 色差索赔（行业） ---- */
  add(16, {
    title: "批量色差的索赔调解（Mediating a Color Difference Claim）",
    lines: [
      { sp: "A", en: "The buyer claims the printed bags don't match the approved proof and wants a 15 percent discount.", cn: "买家说印刷袋与确认样不符，要 15% 折扣。" },
      { sp: "B", en: "Did you compare with the signed color proof under standard light?", cn: "你们是在标准光源下对比签样了吗？" },
      { sp: "A", en: "We did — under D65. The red is noticeably darker in the bulk goods.", cn: "对比了——D65 光源下。大货的红色明显偏深。" },
      { sp: "B", en: "Then it's a genuine color difference, not a lighting excuse. Where did it drift?", cn: "那是真实色差，不是光源借口。哪个环节跑偏的？" },
      { sp: "A", en: "The second printing run. The first run matched perfectly.", cn: "第二个印刷批次。第一批完全对得上。" },
      { sp: "B", en: "Same ink batch?", cn: "同一批油墨吗？" },
      { sp: "A", en: "The ink supplier changed one pigment. They admitted it.", cn: "油墨供应商换了一种颜料。他们承认了。" },
      { sp: "B", en: "OK. Here's the deal we can defend: eight percent discount for this batch, and we guarantee the third run against the original proof.", cn: "好。我们能站得住的方案：本批 8% 折扣，第三批按原签样担保。" },
      { sp: "A", en: "I'll propose that with a signed color standard for the next run. The buyer should accept it.", cn: "我会附上下一批的签色标准一起提。买家应该会接受。" },
      { sp: "B", en: "And keep the retained samples from both runs — we may need them if it goes to a formal claim.", cn: "两个批次的留样都留好——万一走到正式索赔会用到。" }
    ]
  });

  /* ---- U17 技术沟通 · 熟化与配比（行业） ---- */
  add(17, {
    title: "熟化时间与固化剂配比（Curing Time and Mixing Ratio）",
    lines: [
      { sp: "A", en: "The customer says the pouches smell a bit after laminating. Is it the curing?", cn: "客户说复合后袋子有点味道。是熟化的问题吗？" },
      { sp: "B", en: "Possibly. If residual solvent is high, curing was too short or the ratio was off.", cn: "有可能。残留溶剂高，一般是熟化不够或配比不对。" },
      { sp: "A", en: "We use a two-component adhesive. The ratio is 100 to 5 by weight.", cn: "我们用双组分胶，重量比 100 比 5。" },
      { sp: "B", en: "Weigh the curing agent precisely — an error of two grams matters at this ratio.", cn: "固化剂一定要精确称量——这个比例下差 2 克都有影响。" },
      { sp: "A", en: "How long should we cure for retort pouches?", cn: "蒸煮袋要熟化多久？" },
      { sp: "B", en: "Retort needs 72 hours at 40 degrees. Regular pouches, 48 hours at 25.", cn: "蒸煮袋 40 度 72 小时。普通袋 25 度 48 小时。" },
      { sp: "A", en: "And how do we check residual solvent ourselves?", cn: "我们自己怎么测残留溶剂？" },
      { sp: "B", en: "Gas chromatography, if you have it. Otherwise, smell the sample right after slitting — a strong odor means re-cure and retest.", cn: "有气相色谱仪最好。没有的话，分切后马上闻样——味道重就重新熟化再测。" },
      { sp: "A", en: "Our lab only has an oven. Can we send samples to you?", cn: "我们实验室只有烘箱。能寄样给你们测吗？" },
      { sp: "B", en: "Yes, mail them over — we run GC free for customers.", cn: "可以，寄过来——给客户做气相色谱是免费的。" }
    ]
  });

  /* ---- U18 合规 · 迁移测试报告（行业） ---- */
  add(18, {
    title: "欧盟食品接触迁移测试（EU Migration Test Request）",
    lines: [
      { sp: "A", en: "The German buyer wants a migration test report for the pouches before placing the order.", cn: "德国买家下单前要袋子的迁移测试报告。" },
      { sp: "B", en: "EU 10/2011 compliance?", cn: "是 EU 10/2011 合规吗？" },
      { sp: "A", en: "Yes, overall migration and specific migration for the food types they pack.", cn: "对，总迁移和针对他们包装食品类型的特定迁移。" },
      { sp: "B", en: "We test through an accredited lab in Shanghai. About two weeks per food simulant.", cn: "我们通过上海一家有资质的实验室测试。每种食品模拟物约两周。" },
      { sp: "A", en: "Which food simulants do we need?", cn: "需要哪些食品模拟物？" },
      { sp: "B", en: "For dry foods, simulant A is enough. For fatty snacks, they'll ask for simulant D2 — that one costs more.", cn: "干性食品模拟物 A 就够。油脂零食会被要求 D2——那个更贵。" },
      { sp: "A", en: "Who keeps the original report?", cn: "报告原件由谁保管？" },
      { sp: "B", en: "We hold the original; you get a certified copy with the batch numbers on it.", cn: "原件我们保管；您拿的是带批号的认证副本。" },
      { sp: "A", en: "The buyer may audit the report. Make sure the lab name and accreditation number are visible.", cn: "买家可能核查报告。确保实验室名称和资质编号清晰可见。" },
      { sp: "B", en: "They are. And note the declaration of compliance comes separately — the lab tests, we declare.", cn: "都在。另外符合性声明是另一份——实验室负责检测，我们出具声明。" }
    ]
  });

  /* ---- U19 客户会议 · 年度验厂（行业） ---- */
  add(19, {
    title: "品牌方年度验厂准备（Annual Supplier Audit Prep）",
    lines: [
      { sp: "A", en: "The brand's audit team is coming next month. What will they focus on?", cn: "品牌的审核团队下个月来。他们会重点看什么？" },
      { sp: "B", en: "For packaging suppliers, three areas: quality system, food contact compliance, and social responsibility.", cn: "对包装供应商来说三块：质量体系、食品接触合规、社会责任。" },
      { sp: "A", en: "Our ISO 9001 certificate is valid. What else?", cn: "我们的 ISO 9001 证书在有效期内。还有什么？" },
      { sp: "B", en: "They'll walk the laminating and bag-making lines, check batch records, and interview workers.", cn: "他们会走复合和制袋车间、查批次记录、访谈工人。" },
      { sp: "A", en: "Should we prepare the migration reports again?", cn: "迁移测试报告要再准备一遍吗？" },
      { sp: "B", en: "Yes, plus the corrective actions from last year's audit. They always check whether you closed the gaps.", cn: "要，还有去年审核的整改措施。他们一定会查你们是否关闭了不符合项。" },
      { sp: "A", en: "What about the warehouse?", cn: "仓库方面呢？" },
      { sp: "B", en: "Raw material traceability — they'll pick one roll number and trace it from incoming to shipment.", cn: "原材料可追溯——他们会抽一个卷号，从来料一直追到出货。" },
      { sp: "A", en: "Two weeks to get ready. Let's do a mock audit on Friday.", cn: "还有两周准备。周五我们做一次模拟审核吧。" },
      { sp: "B", en: "Good idea. I'll play the auditor and be difficult.", cn: "好主意。我来扮演审核员，往难里挑。" }
    ]
  });
})();
