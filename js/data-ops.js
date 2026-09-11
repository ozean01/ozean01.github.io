/* ============ 单元 12：订单执行与出口单证（追加到 FTE_DATA.units） ============ */
(function () {
  "use strict";
  if (typeof FTE_DATA === "undefined" || !FTE_DATA || !FTE_DATA.units) return;
  FTE_DATA.units.push({
    id: 12,
    title: "订单执行与出口单证",
    titleEn: "Order Execution & Export Documents",
    icon: "📄",
    summary: "订单落地后的执行环节：回签形式发票、产前会议、生产排期、验货、订舱、报关与单证制作，梳理软包装与复膜胶出口常用的英文表达与单据名称，把客户、工厂、货代与报关行之间的沟通说清楚。",
    vocab: [
      { w: "purchase order", ipa: "/ˈpɜːtʃɪs ˈɔːdə/", pos: "n.", cn: "采购订单（PO）", ex: "We received your purchase order for 300,000 laminated pouches this morning.", exCn: "我们今天上午收到了你们 300,000 个复合包装袋的采购订单。" },
      { w: "order confirmation", ipa: "/ˈɔːdə ˌkɑːnfəˈmeɪʃn/", pos: "n.", cn: "订单确认书（OC）", ex: "Our order confirmation will be sent to you within two working days.", exCn: "我们的订单确认书会在两个工作日内发给你。" },
      { w: "countersign", ipa: "/ˈkaʊntəsaɪn/", pos: "v.", cn: "回签，副签（签字盖章后退回）", ex: "Please countersign page two and return the scanned copy by email.", exCn: "请在第二页回签，然后把扫描件邮件发回。" },
      { w: "proforma invoice", ipa: "/proʊˈfɔːmə ˈɪnvɔɪs/", pos: "n.", cn: "形式发票（PI）", ex: "Please countersign the proforma invoice so that we can start production planning.", exCn: "请回签形式发票，我们好安排生产计划。" },
      { w: "commercial invoice", ipa: "/kəˈmɜːʃl ˈɪnvɔɪs/", pos: "n.", cn: "商业发票（CI）", ex: "The commercial invoice must show the same unit price as the contract.", exCn: "商业发票上的单价必须与合同一致。" },
      { w: "packing list", ipa: "/ˈpækɪŋ lɪst/", pos: "n.", cn: "装箱单（PL）", ex: "The packing list shows 40 rolls of film per pallet, eight pallets in total.", exCn: "装箱单上写明每托 40 卷薄膜，共八托。" },
      { w: "bill of lading", ipa: "/bɪl əv ˈleɪdɪŋ/", pos: "n.", cn: "海运提单（B/L）", ex: "The original bill of lading will be couriered after the balance is received.", exCn: "收到尾款后我们会把提单正本快递给你。" },
      { w: "draft bill of lading", ipa: "/drɑːft bɪl əv ˈleɪdɪŋ/", pos: "n.", cn: "提单草稿（提单确认稿）", ex: "Please check the draft bill of lading and confirm the consignee details today.", exCn: "请今天核对提单草稿并确认收货人信息。" },
      { w: "certificate of origin", ipa: "/səˈtɪfɪkət əv ˈɑːrɪdʒɪn/", pos: "n.", cn: "原产地证（CO）", ex: "We will apply for a certificate of origin to reduce your import duty.", exCn: "我们会申请原产地证，帮你降低进口关税。" },
      { w: "customs declaration", ipa: "/ˈkʌstəmz ˌdekləˈreɪʃn/", pos: "n.", cn: "报关，报关单", ex: "The customs declaration was filed yesterday, so we expect release by Friday.", exCn: "报关单昨天已经申报，预计周五放行。" },
      { w: "declaration elements", ipa: "/ˌdekləˈreɪʃn ˈelɪmənts/", pos: "n.", cn: "申报要素", ex: "For adhesive we must fill in the declaration elements, including the solid content.", exCn: "复膜胶报关必须填写申报要素，包括固含量。" },
      { w: "HS code", ipa: "/ˌeɪtʃ ˈes koʊd/", pos: "n.", cn: "海关商品编码（HS 编码）", ex: "The HS code for our solvent-based laminating adhesive is 3506910090.", exCn: "我们溶剂型复膜胶的 HS 编码是 3506910090。" },
      { w: "customs broker", ipa: "/ˈkʌstəmz ˈbroʊkə/", pos: "n.", cn: "报关行，报关代理", ex: "Our customs broker in Ningbo handles all the export paperwork for us.", exCn: "宁波的报关行帮我们处理所有出口文件。" },
      { w: "customs clearance", ipa: "/ˈkʌstəmz ˈklɪərəns/", pos: "n.", cn: "通关，清关", ex: "Customs clearance at destination usually takes two to three working days.", exCn: "目的港清关通常需要两到三个工作日。" },
      { w: "inspection and quarantine", ipa: "/ɪnˈspekʃn ənd ˈkwɑːrəntiːn/", pos: "n.", cn: "检验检疫，报检", ex: "Chemical goods need inspection and quarantine before the container is loaded.", exCn: "化工品在装柜前需要办理检验检疫。" },
      { w: "production schedule", ipa: "/prəˈdʌkʃn ˈʃedjuːl/", pos: "n.", cn: "生产排期，生产计划", ex: "Your order is on the production schedule for the week of May 12.", exCn: "你的订单排在 5 月 12 日那一周生产。" },
      { w: "pre-production meeting", ipa: "/ˌpriː prəˈdʌkʃn ˈmiːtɪŋ/", pos: "n.", cn: "产前会议", ex: "We hold a pre-production meeting to confirm film structure and print colours.", exCn: "我们会开产前会议确认膜结构和印刷颜色。" },
      { w: "production capacity", ipa: "/prəˈdʌkʃn kəˈpæsəti/", pos: "n.", cn: "产能", ex: "Our monthly production capacity is about 600 tons of laminating adhesive.", exCn: "我们每月产能大约 600 吨复膜胶。" },
      { w: "lead time", ipa: "/ˈliːd taɪm/", pos: "n.", cn: "交货周期，前置期", ex: "The standard lead time for printed pouches is 25 days after artwork approval.", exCn: "印刷包装袋的标准交期是稿件确认后 25 天。" },
      { w: "raw material procurement", ipa: "/rɔː məˈtɪəriəl prəˈkjʊəmənt/", pos: "n.", cn: "原材料采购", ex: "Raw material procurement takes a week because the resin is imported.", exCn: "原材料采购要一周，因为树脂是进口的。" },
      { w: "die-cut drawing", ipa: "/ˈdaɪ kʌt ˈdrɔːɪŋ/", pos: "n.", cn: "刀模图", ex: "Please approve the die-cut drawing before we make the printing cylinder.", exCn: "请在我们制印刷滚筒之前确认刀模图。" },
      { w: "inner box", ipa: "/ˈɪnə bɑːks/", pos: "n.", cn: "内盒，中盒", ex: "Each inner box holds 500 pouches with a desiccant bag inside.", exCn: "每个内盒装 500 个包装袋，里面放一包干燥剂。" },
      { w: "outer carton", ipa: "/ˈaʊtə ˈkɑːtn/", pos: "n.", cn: "外箱", ex: "The outer carton is five-layer corrugated to survive sea transport.", exCn: "外箱用五层瓦楞纸，以承受海运。" },
      { w: "carton dimensions", ipa: "/ˈkɑːtn dɪˈmenʃnz/", pos: "n.", cn: "外箱尺寸", ex: "The carton dimensions are 50 by 35 by 30 centimetres.", exCn: "外箱尺寸是 50 × 35 × 30 厘米。" },
      { w: "pieces per carton", ipa: "/ˈpiːsɪz pɜː ˈkɑːtn/", pos: "n.", cn: "每箱数量（装箱数）", ex: "Pieces per carton is 2,000, so 150 cartons make one full pallet.", exCn: "每箱 2,000 个，所以 150 箱正好一整托。" },
      { w: "shipping mark", ipa: "/ˈʃɪpɪŋ mɑːk/", pos: "n.", cn: "唛头，运输标志", ex: "Please send us the shipping mark artwork so we can print the cartons.", exCn: "请把唛头稿件发给我们，好安排印外箱。" },
      { w: "net weight", ipa: "/net weɪt/", pos: "n.", cn: "净重（N.W.）", ex: "Net weight per drum is 200 kilograms of laminating adhesive.", exCn: "每桶复膜胶净重 200 公斤。" },
      { w: "gross weight", ipa: "/ɡroʊs weɪt/", pos: "n.", cn: "毛重（G.W.）", ex: "Total gross weight is 4,280 kilograms including the pallets.", exCn: "含托盘总毛重是 4,280 公斤。" },
      { w: "CBM", ipa: "/ˌsiː biː ˈem/", pos: "n.", cn: "立方米，体积（cubic meter）", ex: "The whole shipment measures 18.6 CBM, which fits one 20-foot container.", exCn: "整批货 18.6 立方，一个 20 尺柜装得下。" },
      { w: "deposit", ipa: "/dɪˈpɑːzɪt/", pos: "n.", cn: "定金，预付款", ex: "We will arrange production once the 30 percent deposit reaches our account.", exCn: "30% 定金到账后我们就安排生产。" },
      { w: "balance payment", ipa: "/ˈbæləns ˈpeɪmənt/", pos: "n.", cn: "尾款", ex: "The balance payment is due against the draft bill of lading.", exCn: "尾款凭提单草稿支付。" },
      { w: "payment in advance", ipa: "/ˈpeɪmənt ɪn ədˈvɑːns/", pos: "n.", cn: "预付货款（先款后货）", ex: "For the first order we usually ask for full payment in advance.", exCn: "首单我们通常要求全额预付。" },
      { w: "third-party inspection", ipa: "/ˌθɜːd ˈpɑːti ɪnˈspekʃn/", pos: "n.", cn: "第三方验货", ex: "The buyer arranged a third-party inspection by SGS on June 18.", exCn: "买方安排了 SGS 在 6 月 18 日做第三方验货。" },
      { w: "final random inspection", ipa: "/ˈfaɪnl ˈrændəm ɪnˈspekʃn/", pos: "n.", cn: "尾期抽检（FRI）", ex: "The final random inspection passed with zero major defects.", exCn: "尾期抽检通过，没有严重缺陷。" },
      { w: "inline inspection", ipa: "/ˈɪnlaɪn ɪnˈspekʃn/", pos: "n.", cn: "在线检测", ex: "Our inline inspection camera rejects any pouch with print misregistration.", exCn: "我们的在线检测相机会剔除套印不准的包装袋。" },
      { w: "retention sample", ipa: "/rɪˈtenʃn ˈsɑːmpl/", pos: "n.", cn: "留样", ex: "We keep a retention sample of every batch for eighteen months.", exCn: "每个批次我们都留样保存十八个月。" },
      { w: "artwork approval", ipa: "/ˈɑːtwɜːk əˈpruːvl/", pos: "n.", cn: "稿件（标签）确认", ex: "Printing starts only after we receive your written artwork approval.", exCn: "只有收到你们书面的稿件确认，我们才开印。" },
      { w: "booking note", ipa: "/ˈbʊkɪŋ noʊt/", pos: "n.", cn: "订舱委托书（B/N，等同 S/O 订舱单）", ex: "The forwarder sent the booking note this morning; the cut-off is Thursday noon.", exCn: "货代今天上午发来订舱单，截关是周四中午。" },
      { w: "trucking", ipa: "/ˈtrʌkɪŋ/", pos: "n.", cn: "拖车，内陆运输（美式也说 drayage）", ex: "Trucking from our factory to Shanghai port takes about four hours.", exCn: "从我们工厂拖车到上海港大约四个小时。" },
      { w: "container number", ipa: "/kənˈteɪnə ˈnʌmbə/", pos: "n.", cn: "集装箱号（箱号）", ex: "Please note the container number and seal number on the packing list.", exCn: "请在装箱单上注明箱号和封条号。" },
      { w: "seal number", ipa: "/siːl ˈnʌmbə/", pos: "n.", cn: "封条号，铅封号", ex: "The seal number is CN0098765 and it matches the customs record.", exCn: "封条号是 CN0098765，与海关记录一致。" },
      { w: "consignee", ipa: "/ˌkɑːnsaɪˈniː/", pos: "n.", cn: "收货人", ex: "The consignee on the bill of lading must be your Rotterdam branch.", exCn: "提单上的收货人必须是你们鹿特丹分公司。" },
      { w: "notify party", ipa: "/ˈnoʊtɪfaɪ ˈpɑːti/", pos: "n.", cn: "通知方", ex: "Please confirm whether the notify party is the same as the consignee.", exCn: "请确认通知方是否与收货人相同。" },
      { w: "telex release", ipa: "/ˈteleks rɪˈliːs/", pos: "n.", cn: "电放（提单电放）", ex: "We will apply for telex release as soon as the balance clears.", exCn: "尾款一到账我们就申请电放。" },
      { w: "shipping advice", ipa: "/ˈʃɪpɪŋ ədˈvaɪs/", pos: "n.", cn: "装运通知", ex: "Our shipping advice with the vessel name was emailed to you yesterday.", exCn: "带船名的装运通知昨天已邮件发给你。" },
      { w: "consistency of documents", ipa: "/kənˈsɪstənsi əv ˈdɑːkjumənts/", pos: "n.", cn: "单单一致", ex: "Under a letter of credit, consistency of documents decides whether you get paid.", exCn: "在信用证项下，单单一致决定你能否收到钱。" }
    ],
    phrases: [
      { p: "place a purchase order", cn: "下采购订单", ex: "The customer placed a purchase order for 20,000 pouches.", exCn: "客户下了 20,000 个包装袋的采购订单。" },
      { p: "countersign the proforma invoice", cn: "回签形式发票", ex: "Please countersign the proforma invoice and send back the scanned copy today.", exCn: "请今天回签形式发票并把扫描件发回。" },
      { p: "book the shipping space", cn: "订舱", ex: "We booked the shipping space for the June 6 vessel yesterday.", exCn: "我们昨天订了 6 月 6 日那条船的舱位。" },
      { p: "clear customs", cn: "清关，办结报关手续", ex: "The goods cleared customs in Ningbo without any inspection.", exCn: "货物在宁波顺利清关，没有被查验。" },
      { p: "issue the bill of lading", cn: "签发提单", ex: "The carrier will issue the bill of lading two days after sailing.", exCn: "船公司会在开船后两天签发提单。" },
      { p: "settle the balance", cn: "结清尾款", ex: "Could you settle the balance before the vessel sails on June 6?", exCn: "能否在 6 月 6 日开船前结清尾款？" },
      { p: "arrange a third-party inspection", cn: "安排第三方验货", ex: "The buyer arranged a third-party inspection for May 23, one man-day.", exCn: "买方安排了 5 月 23 日一个人日的第三方验货。" },
      { p: "apply for telex release", cn: "申请电放", ex: "We will apply for telex release once the balance is in our account.", exCn: "尾款到我们账上后就申请电放。" },
      { p: "lock in the production slot", cn: "锁定生产排期", ex: "Your deposit locks in the production slot for the week of May 12.", exCn: "你的定金可以锁定 5 月 12 日那一周的排期。" },
      { p: "push out the delivery date", cn: "推迟交期", ex: "The film shortage pushed out the delivery date by five days.", exCn: "薄膜缺料把交期往后推了五天。" },
      { p: "check the documents against the L/C", cn: "把单据与信用证核对", ex: "Please check the documents against the L/C before we courier the originals.", exCn: "在我们快递正本之前，请把单据与信用证核对一遍。" },
      { p: "keep a retention sample", cn: "留样", ex: "We keep a retention sample of each batch in case of complaints.", exCn: "每批货我们都留样，以备客户投诉时核查。" }
    ],
    dialogues: [
      {
        title: "验货预约与生产节点同步（Inspection Booking & Production Update）",
        lines: [
          { sp: "A", en: "Hi Lucy, our QA team wants to book the final random inspection for PO 24-0576. Is production still on schedule?", cn: "你好 Lucy，我们质检部想给 PO 24-0576 预约尾期抽检。生产还按排期走吗？" },
          { sp: "B", en: "Hi Mark, yes. The 300,000 stand-up pouches went on the production schedule on May 12, and printing finished last Friday.", cn: "你好 Mark，是的。30 万个自立袋 5 月 12 日已上线排产，印刷上周五完成。" },
          { sp: "A", en: "Good. Which stage are you at now, lamination or bag making?", cn: "好。现在到哪个工序了，复合还是制袋？" },
          { sp: "B", en: "We finished lamination on May 15. The film is curing now, and bag making starts on May 18, four days for the whole batch.", cn: "复合 5 月 15 日已完成，现在薄膜在熟化，5 月 18 日开始制袋，整批四天。" },
          { sp: "A", en: "So the earliest inspection date would be May 22?", cn: "那最早的验货日期是 5 月 22 日？" },
          { sp: "B", en: "May 23 is safer. We need one day to pack the inner boxes and outer cartons and to pull the retention samples.", cn: "5 月 23 日更稳妥。我们需要一天装内盒和外箱，并抽取留样。" },
          { sp: "A", en: "Understood. I will book SGS for May 23 at nine a.m., one man-day. Please have 80 percent of the goods packed and palletised.", cn: "明白。我约 SGS 5 月 23 日上午九点，一个人日。请保证 80% 的货已装箱上托。" },
          { sp: "B", en: "No problem. By May 23 at least 240,000 pieces will be cartoned, 2,000 pieces per carton, 120 cartons on eight pallets.", cn: "没问题。到 5 月 23 日至少 24 万个已装箱，每箱 2,000 个，120 箱共八托。" },
          { sp: "A", en: "Also send me the inline inspection report for print registration before the visit.", cn: "验货前也请把套印的在线检测报告发我。" },
          { sp: "B", en: "I will send the inline inspection record and the seal strength test today, together with two updated production photos.", cn: "我今天就发在线检测记录和封口强度测试，再附两张最新的生产照片。" },
          { sp: "A", en: "One more thing: the inspector will check the shipping mark against our artwork approval, so make sure it is the latest version.", cn: "还有一点：验货员会拿唛头对照我们确认的稿件，请务必用最新版本。" },
          { sp: "B", en: "Noted. We are printing revision C, which you approved on April 28. I will attach that file in the inspection package.", cn: "记下了。我们印的是你们 4 月 28 日确认的 C 版，我会把该文件放进验货资料里。" }
        ]
      },
      {
        title: "催尾款与提单电放（Chasing the Balance & Telex Release）",
        lines: [
          { sp: "B", en: "Hi Mark, the container was loaded on June 2 and the carrier has issued the draft bill of lading.", cn: "你好 Mark，货 6 月 2 日已装柜，船公司出了提单草稿。" },
          { sp: "A", en: "Good news. Please send the draft over so we can check the consignee and notify party.", cn: "好消息。请把草稿发过来，我们核对收货人和通知方。" },
          { sp: "B", en: "Just sent. Container number TCLU7654321, seal number CN0098765, 18.6 CBM, gross weight 4,280 kilograms.", cn: "已发出。箱号 TCLU7654321，封条号 CN0098765，18.6 立方，毛重 4,280 公斤。" },
          { sp: "A", en: "The draft is fine, but the description should read laminating adhesive to match the HS code on the customs declaration.", cn: "草稿没问题，但品名应写 laminating adhesive，与报关单上的 HS 编码对应。" },
          { sp: "B", en: "You are right. I will ask the shipping line to amend it today; changes are free before June 5. The vessel MAERSK KOWLOON sails on June 6.", cn: "你说得对。我今天让船公司改，6 月 5 日前改单免费。船名 MAERSK KOWLOON，6 月 6 日开船。" },
          { sp: "A", en: "Understood. What is the transit time to Rotterdam?", cn: "明白。到鹿特丹的航程是多久？" },
          { sp: "B", en: "About 27 days, ETA July 3. One more thing: the 70 percent balance, USD 42,350, is due against the draft bill of lading.", cn: "大约 27 天，预计 7 月 3 日到港。另外一件事：70% 尾款 42,350 美元凭提单草稿支付。" },
          { sp: "A", en: "Our finance department pays every Wednesday, so the transfer would leave on June 11.", cn: "我们财务每周三付款，所以款项会在 6 月 11 日汇出。" },
          { sp: "B", en: "That is five days after sailing. Could you arrange a manual transfer on June 9? We can only apply for telex release after the funds arrive.", cn: "那是开船后五天了。能否 6 月 9 日单独安排一笔手工汇款？我们只有收到款才能申请电放。" },
          { sp: "A", en: "Let me push them. Please resend the commercial invoice, packing list and certificate of origin for our import file.", cn: "我去催一下。请把商业发票、装箱单和原产地证重发一份，做我们的进口档案。" },
          { sp: "B", en: "All three are attached, and the invoice number matches the packing list, so your broker will find no discrepancy.", cn: "三份都在附件里，发票号与装箱单一致，你们报关行不会挑出不符点。" },
          { sp: "A", en: "Perfect. I will confirm the payment slip on June 9, and you release the cargo by telex the same day.", cn: "很好。我 6 月 9 日把付款凭证发你确认，你当天办电放。" },
          { sp: "B", en: "Agreed. The moment the balance shows in our account, I will apply for telex release and email you the released bill of lading.", cn: "一致。尾款一到账，我立刻申请电放，并把电放提单邮件发你。" }
        ]
      }
    ],
    tips: [
      "产前会议不要省。回签 PI 之后就把刀模图、色标、膜结构、卷向和收缩率一次性开会确认并签字，谁签谁负责。我见过整批二十万个包装袋因为卷向做反，客户上不了自动包装机，返工加空运的钱比这单利润还多。",
      "稿件确认一定要留书面版本号。客户口头说可以印不算数，要拿到写明 revision C 和日期的邮件回复。印刷滚筒一开就是几万块的制版费，改一个字都要重新制版，版本对不上时这笔钱只能自己扛。",
      "复膜胶属于化工品，报关要素比包装袋复杂得多：成分、固含量、溶剂类型、包装规格、是否危险品都要填清楚，MSDS 和危包证提前一周备好。等报关行催你才动手，船期基本赶不上，只能改到下一条船。",
      "尾款和电放的顺序千万不能反。正确做法是拿提单草稿给客户看并催款，钱到账当天再申请电放；先电放后收钱，货已经在对方手里，你就只剩发邮件催的份儿了。再熟的老客户也别开这个口子。",
      "单单一致是信用证结汇的生死线。发票、装箱单、提单上的品名、数量、唛头、金额必须一个字都不差，连 laminating adhesive 写成 glue 都可能被开证行挑成不符点，改单一次几十美金，还要多等一两周。",
      "验货日期要按包装完成节点报，不要按下线节点报。第三方验货一般要求 80% 成品已装箱上托才做，客户订了人日再改期是要收费的。约验货之前先自己做一遍内部预检，把留样和在线检测记录一并整理好。"
    ]
  });
})();
