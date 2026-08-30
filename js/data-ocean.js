/* ============ 单元 13：海运操作与货代术语（追加到 FTE_DATA.units） ============ */
(function () {
  "use strict";
  if (typeof FTE_DATA === "undefined" || !FTE_DATA || !FTE_DATA.units) return;
  FTE_DATA.units.push({
    id: 13,
    title: "海运操作与货代术语",
    titleEn: "Ocean Freight Operations & Forwarder Terms",
    icon: "🚢",
    summary: "软包装出口的海运实操：箱型与整拼箱、海运费与各类附加费、滞期与滞留、提单与单证流程，以及订舱、截关、VGM、甩柜等高频节点的英文说法，跟船公司和货代把细节谈清楚。",
    vocab: [
      { w: "TEU/FEU", ipa: "/ˌtiː iː ˈjuː, ˌef iː ˈjuː/", pos: "n.", cn: "二十英尺／四十英尺标准箱（Twenty-foot / Forty-foot Equivalent Unit）", ex: "The film reels fill two TEU, so we booked one FEU instead.", exCn: "这批薄膜卷占两个二十尺箱的量，所以我们改订了一个四十尺箱。" },
      { w: "FCL", ipa: "/ˌef siː ˈel/", pos: "n.", cn: "整箱货（Full Container Load）", ex: "We ship in FCL to keep the pouches clean and avoid damage.", exCn: "我们走整箱，以保持包装袋干净、避免破损。" },
      { w: "LCL", ipa: "/ˌel siː ˈel/", pos: "n.", cn: "拼箱货（Less than Container Load）", ex: "Sample rolls go LCL, but the charges per cubic meter are much higher.", exCn: "样品卷走拼箱，但每立方米的费用要高得多。" },
      { w: "CY/CFS", ipa: "/ˌsiː ˈwaɪ, ˌsiː ef ˈes/", pos: "n.", cn: "集装箱堆场／集装箱货运站（Container Yard / Container Freight Station）", ex: "Our terms are CY to CY, so the buyer unpacks the film at his own plant.", exCn: "我们做场到场，所以由买方在自己厂里拆箱卸膜。" },
      { w: "GP/HC", ipa: "/ˌdʒiː ˈpiː, ˌeɪtʃ ˈsiː/", pos: "n.", cn: "普通箱／高箱（General Purpose / High Cube container）", ex: "A 40' HC takes two more pallets of laminated pouches than a 40' GP.", exCn: "四十尺高箱比四十尺普通箱能多装两托复合包装袋。" },
      { w: "OT/FR", ipa: "/ˌəʊ ˈtiː, ˌef ˈɑː/", pos: "n.", cn: "开顶箱／框架箱（Open Top / Flat Rack）", ex: "The oversized slitting machine needs an OT or FR, not a normal box.", exCn: "这台超尺寸分切机要用开顶箱或框架箱，普通箱装不了。" },
      { w: "ocean freight (O/F)", ipa: "/ˌəʊʃn ˈfreɪt/", pos: "n.", cn: "海运费（Ocean Freight，简称 O/F）", ex: "Ocean freight to Hamburg went up three hundred dollars per FEU this week.", exCn: "本周到汉堡的海运费每四十尺箱涨了三百美元。" },
      { w: "THC", ipa: "/ˌtiː eɪtʃ ˈsiː/", pos: "n.", cn: "码头操作费（Terminal Handling Charge）", ex: "THC at destination is on the consignee's account under FOB terms.", exCn: "FOB 条件下，目的港码头操作费由收货人承担。" },
      { w: "ORC", ipa: "/ˌəʊ ɑːr ˈsiː/", pos: "n.", cn: "本地出口附加费（Origin Receiving Charge）", ex: "South China shipments always carry ORC, so include it in your quotation.", exCn: "华南出口一直有本地费，报价时请把它算进去。" },
      { w: "DOC", ipa: "/ˌdiː əʊ ˈsiː/", pos: "n.", cn: "文件费／单证费（Document Fee）", ex: "The DOC fee is fifty dollars per bill of lading, whoever pays it.", exCn: "不管谁付，单证费都是每票提单五十美元。" },
      { w: "BAF", ipa: "/ˌbiː eɪ ˈef/", pos: "n.", cn: "燃油附加费（Bunker Adjustment Factor）", ex: "Carriers revise BAF every quarter, so our freight quote is valid one month.", exCn: "船公司每季度调整燃油附加费，所以我们的运费报价只有效一个月。" },
      { w: "CAF", ipa: "/ˌsiː eɪ ˈef/", pos: "n.", cn: "货币贬值附加费（Currency Adjustment Factor）", ex: "CAF is charged as a percentage of the basic ocean freight.", exCn: "货币贬值附加费按基本海运费的百分比收取。" },
      { w: "PSS", ipa: "/ˌpiː es ˈes/", pos: "n.", cn: "旺季附加费（Peak Season Surcharge）", ex: "PSS starts on the first of July, so we should load the pouches in June.", exCn: "旺季附加费七月一日起征，所以包装袋最好六月装柜。" },
      { w: "EBS", ipa: "/ˌiː biː ˈes/", pos: "n.", cn: "紧急燃油附加费（Emergency Bunker Surcharge）", ex: "The line added EBS of one hundred and twenty dollars per box.", exCn: "船公司每箱加收了一百二十美元紧急燃油附加费。" },
      { w: "GRI", ipa: "/ˌdʒiː ɑːr ˈaɪ/", pos: "n.", cn: "综合费率上涨（General Rate Increase）", ex: "A GRI is announced for May, so please confirm the booking before April ends.", exCn: "五月要涨综合费率，请在四月底前把舱位定下来。" },
      { w: "DDC", ipa: "/ˌdiː diː ˈsiː/", pos: "n.", cn: "目的港交货费（Destination Delivery Charge）", ex: "DDC applies to US shipments and is normally prepaid by the shipper.", exCn: "美国航线有目的港交货费，通常由发货人预付。" },
      { w: "PCS", ipa: "/ˌpiː siː ˈes/", pos: "n.", cn: "港口拥堵附加费（Port Congestion Surcharge）", ex: "Because of the strike the carrier imposed PCS on all cargo to that port.", exCn: "由于罢工，船公司对该港所有货物加收了港口拥堵附加费。" },
      { w: "CSC", ipa: "/ˌsiː es ˈsiː/", pos: "n.", cn: "集装箱安全附加费（Container Security Charge）", ex: "CSC is a small fixed amount per container, but it still shows on the invoice.", exCn: "集装箱安全附加费每箱金额不高，但账单上照样列出。" },
      { w: "demurrage", ipa: "/dɪˈmʌrɪdʒ/", pos: "n.", cn: "滞期费（货柜在港区超过免箱期产生的费用）", ex: "Demurrage runs from the day the free time inside the terminal expires.", exCn: "滞期费从港内免箱期到期那天开始计算。" },
      { w: "detention", ipa: "/dɪˈtenʃn/", pos: "n.", cn: "滞留费（提箱出场后超期未还箱的用箱费）", ex: "Detention is counted after the container leaves the terminal until it is returned empty.", exCn: "滞留费从箱子提出码头算起，直到空箱还回为止。" },
      { w: "free time", ipa: "/ˌfriː ˈtaɪm/", pos: "n.", cn: "免箱期／免费用箱天数（Free Time / Free Days）", ex: "We asked the carrier for fourteen days free time at destination.", exCn: "我们向船公司申请了目的港十四天免箱期。" },
      { w: "booking charge", ipa: "/ˈbʊkɪŋ tʃɑːdʒ/", pos: "n.", cn: "订舱费（Booking Charge）", ex: "The forwarder adds a small booking charge on every shipping order.", exCn: "货代在每份订舱单上都会加一笔小额订舱费。" },
      { w: "customs clearance fee", ipa: "/ˈkʌstəmz ˈklɪərəns fiː/", pos: "n.", cn: "报关费（Customs Clearance Fee）", ex: "Our customs clearance fee covers the declaration only, not inspection.", exCn: "我们的报关费只含申报，不含查验。" },
      { w: "telex release fee", ipa: "/ˈteleks rɪˈliːs fiː/", pos: "n.", cn: "电放费（Telex Release Fee）", ex: "Pay the telex release fee and we will wire the release to the destination agent.", exCn: "付了电放费，我们就把放货指令发给目的港代理。" },
      { w: "amendment charge", ipa: "/əˈmendmənt tʃɑːdʒ/", pos: "n.", cn: "改单费（Amendment Charge）", ex: "Any change after the manifest is filed brings an amendment charge.", exCn: "舱单上传后再改动，都要收改单费。" },
      { w: "inspection fee", ipa: "/ɪnˈspekʃn fiː/", pos: "n.", cn: "查验费（Inspection Fee）", ex: "Customs pulled our container for X-ray, so an inspection fee was charged.", exCn: "海关把我们的柜子调去过机查验，因此产生了查验费。" },
      { w: "storage fee", ipa: "/ˈstɔːrɪdʒ fiː/", pos: "n.", cn: "堆存费（Storage Fee，港区或堆场的仓储费用）", ex: "Storage fee at the yard is billed per container per day after three free days.", exCn: "堆场超过三天免费期后，按箱按天收堆存费。" },
      { w: "B/L", ipa: "/ˌbiː ˈel/", pos: "n.", cn: "提单（Bill of Lading）", ex: "Please send the draft B/L for checking before you release the originals.", exCn: "请先发提单草稿供核对，再放正本。" },
      { w: "MB/L & HB/L", ipa: "/ˌem biː ˈel, ˌeɪtʃ biː ˈel/", pos: "n.", cn: "船东提单与货代提单（Master B/L & House B/L）", ex: "The carrier issues the MB/L to the NVOCC, and the NVOCC issues the HB/L to us.", exCn: "船公司把船东提单签给无船承运人，无船承运人再签货代提单给我们。" },
      { w: "S/O", ipa: "/ˌes ˈəʊ/", pos: "n.", cn: "订舱单／装货单（Shipping Order）", ex: "The S/O shows the vessel, the voyage and the empty container depot.", exCn: "订舱单上写明船名、航次和提空箱的堆场。" },
      { w: "SI", ipa: "/ˌes ˈaɪ/", pos: "n.", cn: "托书／装运指示（Shipping Instruction）", ex: "Send the SI before the documentation cut-off or the bill will be wrong.", exCn: "请在截单前发出托书，否则提单会做错。" },
      { w: "D/O", ipa: "/ˌdiː ˈəʊ/", pos: "n.", cn: "提货单（Delivery Order）", ex: "The consignee exchanges the original B/L for a D/O at the agent's counter.", exCn: "收货人在代理柜台用提单正本换取提货单。" },
      { w: "EIR", ipa: "/ˌiː aɪ ˈɑː/", pos: "n.", cn: "设备交接单（Equipment Interchange Receipt）", ex: "Keep the EIR; it proves the box was sound when we returned it.", exCn: "留好设备交接单，它能证明我们还箱时箱况完好。" },
      { w: "manifest", ipa: "/ˈmænɪfest/", pos: "n.", cn: "舱单（船舶载货清单）", ex: "The manifest must match the B/L exactly, including the net weight of the film.", exCn: "舱单必须与提单完全一致，包括薄膜的净重。" },
      { w: "ETD/ETA", ipa: "/ˌiː tiː ˈdiː, ˌiː tiː ˈeɪ/", pos: "n.", cn: "预计开船时间／预计到港时间（Estimated Time of Departure / Arrival）", ex: "ETD is the sixteenth and ETA Rotterdam is the tenth of next month.", exCn: "预计十六日开船，预计下月十日到鹿特丹。" },
      { w: "ATD/ATA", ipa: "/ˌeɪ tiː ˈdiː, ˌeɪ tiː ˈeɪ/", pos: "n.", cn: "实际开船时间／实际到港时间（Actual Time of Departure / Arrival）", ex: "The ATD was two days late, so the ATA will slip as well.", exCn: "实际开船晚了两天，实际到港也会往后推。" },
      { w: "POL/POD", ipa: "/ˌpiː əʊ ˈel, ˌpiː əʊ ˈdiː/", pos: "n.", cn: "装货港／卸货港（Port of Loading / Port of Discharge）", ex: "POL is Ningbo and POD is Felixstowe, with one transshipment at Singapore.", exCn: "装货港是宁波，卸货港是费利克斯托，在新加坡中转一次。" },
      { w: "cut-off time", ipa: "/ˈkʌt ɒf taɪm/", pos: "n.", cn: "截关／截港时间（Cut-off Time）", ex: "The port cut-off time is Thursday 17:00, and documents close one day earlier.", exCn: "截关时间是周四下午五点，截单再早一天。" },
      { w: "VGM", ipa: "/ˌviː dʒiː ˈem/", pos: "n.", cn: "集装箱核实总重（Verified Gross Mass）", ex: "No VGM, no loading: the terminal will simply leave the box on the ground.", exCn: "没有核实总重就不装船，码头会直接把箱子留在场地上。" },
      { w: "AMS/ISF", ipa: "/ˌeɪ em ˈes, ˌaɪ es ˈef/", pos: "n.", cn: "美国自动舱单申报／进口安全申报（Automated Manifest System / Importer Security Filing）", ex: "For US cargo we file AMS and the buyer files ISF before loading.", exCn: "美国货由我们做自动舱单申报，买方在装船前做进口安全申报。" },
      { w: "rollover", ipa: "/ˈrəʊləʊvə/", pos: "n.", cn: "甩柜／甩货（船公司将货柜改至下一航次）", ex: "Our two boxes suffered a rollover and will sail on next week's vessel.", exCn: "我们两个柜子被甩柜了，要搭下周的船。" },
      { w: "transshipment", ipa: "/trænsˈʃɪpmənt/", pos: "n.", cn: "转船／中转（Transshipment）", ex: "Transshipment at Port Klang adds about seven days to the transit time.", exCn: "在巴生港中转会让航程多出大约七天。" },
      { w: "NVOCC", ipa: "/ˌen viː əʊ siː ˈsiː/", pos: "n.", cn: "无船承运人（Non-Vessel Operating Common Carrier）", ex: "As an NVOCC our forwarder can issue its own house bill of lading.", exCn: "作为无船承运人，我们的货代可以签发自己的货代提单。" },
      { w: "freight forwarder", ipa: "/ˈfreɪt ˌfɔːwədə/", pos: "n.", cn: "货运代理／货代（Freight Forwarder）", ex: "Our freight forwarder handles booking, customs and trucking for every film shipment.", exCn: "每批薄膜出运的订舱、报关和拖车都由我们的货代处理。" },
      { w: "shipper/consignee", ipa: "/ˈʃɪpə, ˌkɒnsaɪˈniː/", pos: "n.", cn: "发货人／收货人（Shipper / Consignee）", ex: "The shipper is our factory and the consignee is the buyer's packaging plant.", exCn: "发货人是我们工厂，收货人是买方的包装厂。" },
      { w: "liner / tramp shipping", ipa: "/ˈlaɪnə ˈʃɪpɪŋ, ˈtræmp ˈʃɪpɪŋ/", pos: "n.", cn: "班轮运输／租船运输（Liner Shipping / Tramp Shipping）", ex: "Packaging cargo goes by liner shipping; tramp shipping suits bulk resin.", exCn: "包装材料走班轮，租船运输适合散装树脂。" },
      { w: "feeder vessel", ipa: "/ˈfiːdə ˈvesl/", pos: "n.", cn: "支线船／驳船（Feeder Vessel）", ex: "A feeder vessel takes the box to Shanghai for the mother vessel.", exCn: "先由支线船把箱子驳到上海接大船。" },
      { w: "base port", ipa: "/ˈbeɪs pɔːt/", pos: "n.", cn: "基本港（Base Port）", ex: "Hamburg is a base port, so the freight is lower than for inland delivery.", exCn: "汉堡是基本港，运费比内陆交货便宜。" },
      { w: "direct shipment", ipa: "/dəˈrekt ˈʃɪpmənt/", pos: "n.", cn: "直达船／直达运输（Direct Shipment）", ex: "The customer pays extra for a direct shipment to avoid transshipment damage.", exCn: "客户愿意加钱走直达船，以免中转造成破损。" },
      { w: "multimodal transport", ipa: "/ˌmʌltiˈməʊdl ˈtrænspɔːt/", pos: "n.", cn: "多式联运（Multimodal Transport）", ex: "Multimodal transport covers sea, rail and truck under one bill of lading.", exCn: "多式联运用一份提单涵盖海运、铁路和卡车。" }
    ],
    phrases: [
      { p: "book shipping space", cn: "订舱", ex: "Please book shipping space at least ten days before the film reels are ready.", exCn: "请在薄膜卷备好前至少十天订舱。" },
      { p: "meet the cut-off time", cn: "赶上截关时间", ex: "If we load on Tuesday we can still meet the cut-off time on Thursday.", exCn: "如果周二装柜，我们还能赶上周四的截关。" },
      { p: "submit the VGM", cn: "提交核实总重", ex: "Remember to submit the VGM before Wednesday noon, otherwise the box stays behind.", exCn: "记得周三中午前提交核实总重，否则柜子会留下来。" },
      { p: "pick up the empty container", cn: "提空箱", ex: "Our trucker will pick up the empty container at the depot on Monday morning.", exCn: "我们的拖车周一上午到堆场提空箱。" },
      { p: "return the empty box", cn: "还空箱", ex: "The consignee must return the empty box within the free time to avoid detention.", exCn: "收货人必须在免箱期内还空箱，以免产生滞留费。" },
      { p: "arrange telex release", cn: "安排电放", ex: "Once the balance is received we will arrange telex release to your agent.", exCn: "收到尾款后，我们就安排电放给你的代理。" },
      { p: "amend the bill of lading", cn: "修改提单", ex: "We had to amend the bill of lading because the net weight was wrong.", exCn: "因为净重写错了，我们只好修改提单。" },
      { p: "waive the demurrage", cn: "免除滞期费", ex: "Please ask the carrier to waive the demurrage caused by the rollover.", exCn: "请让船公司免除因甩柜产生的滞期费。" },
      { p: "apply for extra free days", cn: "申请延长免箱期", ex: "Could you apply for extra free days at destination, say fourteen in total?", exCn: "你能否在目的港申请延长免箱期，比如总共十四天？" },
      { p: "check the draft B/L", cn: "核对提单草稿", ex: "Please check the draft B/L carefully before the originals are printed.", exCn: "请在打印正本前仔细核对提单草稿。" },
      { p: "nominate a forwarder", cn: "指定货代", ex: "Under FOB the buyer will nominate a forwarder and cover the ocean freight.", exCn: "FOB 条件下由买方指定货代并承担海运费。" },
      { p: "split the shipment", cn: "分批出运", ex: "We may split the shipment into two containers to catch this week's vessel.", exCn: "我们可能把这批货分成两个柜，以赶上本周的船。" }
    ],
    dialogues: [
      {
        title: "向货代订舱并确认截关时间（Booking with the Forwarder）",
        lines: [
          { sp: "A", en: "Hi Kevin, I need to book one 40' HC from Ningbo to Rotterdam, film reels, twenty-one tons net.", cn: "你好 Kevin，我要订一个四十尺高箱，宁波到鹿特丹，薄膜卷，净重二十一吨。" },
          { sp: "B", en: "Noted. I can offer MSC MARIA, voyage 236E, ETD the sixteenth, ETA Rotterdam the tenth of next month.", cn: "收到。我可以安排 MSC MARIA 轮 236E 航次，十六日开船，预计下月十日到鹿特丹。" },
          { sp: "A", en: "Is that a direct shipment, or is there a transshipment on the way?", cn: "这是直达船，还是中途要中转？" },
          { sp: "B", en: "Direct to Rotterdam, no feeder vessel and no transshipment, thirty-two days transit.", cn: "直达鹿特丹，不用支线船也不中转，航程三十二天。" },
          { sp: "A", en: "Good. What is the all-in ocean freight, and does it include BAF and origin THC?", cn: "好。全包海运费是多少，含燃油附加费和起运港码头操作费吗？" },
          { sp: "B", en: "Two thousand and fifty dollars per FEU, including BAF, ORC and THC at origin; destination charges are on the consignee.", cn: "每个四十尺箱两千零五十美元，含燃油附加费、本地费和起运港码头操作费；目的港费用由收货人承担。" },
          { sp: "A", en: "Please also confirm the cut-off times in writing.", cn: "也请把各项截止时间用邮件确认给我。" },
          { sp: "B", en: "Port cut-off is Thursday 17:00, and the SI and VGM cut-off is Wednesday noon.", cn: "截关是周四下午五点，托书和核实总重截止到周三中午。" },
          { sp: "A", en: "Then we will pick up the empty container on Monday and load the pouches on Tuesday.", cn: "那我们周一提空箱，周二装包装袋。" },
          { sp: "B", en: "Fine. Send me the shipping instruction early so the draft B/L is ready for checking.", cn: "好的。请早点发托书，这样提单草稿可以提前给你核对。" },
          { sp: "A", en: "One more thing: the buyer asks for fourteen days free time at destination.", cn: "还有一点：买方要求目的港十四天免箱期。" },
          { sp: "B", en: "I will apply to the carrier and put the free days on the S/O once it is approved.", cn: "我去向船公司申请，批下来后把免箱天数写在订舱单上。" }
        ]
      },
      {
        title: "货柜被甩柜与滞箱费交涉（Rollover and Demurrage）",
        lines: [
          { sp: "A", en: "Kevin, tracking still shows our box in the yard. Was it loaded on voyage 236E?", cn: "Kevin，跟踪显示我们的柜子还在堆场。它上了 236E 航次吗？" },
          { sp: "B", en: "I am sorry, the vessel was overbooked and your container was rolled over.", cn: "抱歉，这条船超订舱了，你们的柜子被甩柜了。" },
          { sp: "A", en: "A rollover? Then what is the new vessel and voyage?", cn: "甩柜？那新的船名航次是什么？" },
          { sp: "B", en: "CMA ATLAS, voyage 118W, ETD next Tuesday, ETA Rotterdam the eighteenth, eight days later than planned.", cn: "CMA ATLAS 轮 118W 航次，下周二开船，预计十八日到鹿特丹，比原计划晚八天。" },
          { sp: "A", en: "That is a real problem. The customer's laminating line is waiting for these reels.", cn: "这很麻烦，客户的复膜线就等着这批卷料。" },
          { sp: "B", en: "I understand. The carrier has agreed to keep the original freight rate as compensation.", cn: "我理解。船公司同意维持原运价作为补偿。" },
          { sp: "A", en: "The rate is not enough. We picked up the empty box two weeks ago, so the clock is running.", cn: "维持运价还不够。空箱是两周前提的，计费时间一直在走。" },
          { sp: "B", en: "The box is still inside the terminal, so it is storage and demurrage, not detention.", cn: "柜子还在码头里，所以算堆存费和滞期费，不是滞留费。" },
          { sp: "A", en: "Whoever pays, we did not cause the delay. Please ask the line to waive those days.", cn: "不管由谁付，延误不是我们造成的。请让船公司免掉这几天。" },
          { sp: "B", en: "I will apply for a waiver and also for seven extra free days at destination.", cn: "我去申请免除，同时申请目的港再加七天免箱期。" },
          { sp: "A", en: "Please put the rollover reason in writing; I have to explain it to the buyer today.", cn: "请把甩柜原因给我书面说明，我今天要跟买方解释。" },
          { sp: "B", en: "You will have the carrier's notice and the revised S/O this afternoon.", cn: "今天下午就把船公司的通知和更新后的订舱单发给你。" }
        ]
      }
    ],
    tips: [
      "免箱期只是「不收钱的天数」，不等于货可以慢慢提。柜子在港区超期算滞期费（demurrage），拉出场后超期不还箱算滞留费（detention），两笔分开计算。订舱时把这两段天数分别写进邮件确认，别只写一句 free time 14 days 就以为都包了。",
      "VGM 必须在截 VGM 时间前提交，重量要含货重、托盘和箱皮重，误差一般不超过百分之五。漏报或迟报，码头直接不安排装船，箱子留在场地上还会产生堆存费和改单费。薄膜卷、复膜胶这类重货更要按实际过磅数据报，别拿理论重量凑。",
      "FOB 下客户指定货代，起运港这端的费用要提前问清：本地费、码头操作费、报关费、拖车费谁付，有没有莫名的文件费。最稳的做法是让指定货代先出一份本地费用明细并邮件确认，装柜前不要凭一句电话答复就放货，否则提单捏在对方手里会很被动。",
      "时间一定要倒推：ETD 前通常截关一到两天，截单（托书和 VGM）再早一天，报关放行留一天，货好装柜再留一到两天，也就是说 ETD 往前推五天工厂就得完工。旺季码头拥堵，建议再加两天缓冲，一次赶不上往往就是等一周。",
      "被甩柜先别急着吵，第一时间要三样东西：新船名航次、新的 ETD 与 ETA、以及书面的甩柜原因。是超订舱、超重还是危品文件不全，责任方不同，谈判筹码也不同。同时立刻通知客户改期并申请免箱期顺延，否则到港后的滞箱费还是算在你头上。",
      "电放费不高，风险在流程：一定是收到全款或客户完全可控时才做电放，电放函要写清提单号、船名航次和放货对象。改单费同理，草单阶段就把品名、唛头、净重、收货人核对干净，等舱单上传后再改，几十美元不说，还可能赶不上截单。"
    ]
  });
})();
