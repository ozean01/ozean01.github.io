/* ============ 单元 14：Incoterms 2020 贸易术语与报价核算（追加到 FTE_DATA.units） ============ */
(function () {
  "use strict";
  if (typeof FTE_DATA === "undefined" || !FTE_DATA || !FTE_DATA.units) return;
  FTE_DATA.units.push({
    id: 14,
    title: "Incoterms 2020 贸易术语与报价核算",
    titleEn: "Incoterms 2020 & Export Quotation",
    icon: "📐",
    summary: "Incoterms 2020 十一个术语的风险转移点、费用划分与适用运输方式；结合软包装按公斤报胶、按千个报袋的场景，练习 FOB、CIF、FCA、CPT、DDP 的英文报价与到岸成本核算表达。",
    vocab: [
      { w: "Incoterms", ipa: "/ˈɪŋkoʊtɜːmz/", pos: "n.", cn: "国际贸易术语解释通则（International Commercial Terms）", ex: "All prices in this offer are based on Incoterms 2020 published by the ICC.", exCn: "本报价中的所有价格均以国际商会发布的 Incoterms 2020 为准。" },
      { w: "EXW", ipa: "/ˌiː eks ˈdʌbljuː/", pos: "n.", cn: "工厂交货、出厂价（Ex Works）", ex: "The EXW price for our lamination adhesive is USD 2.85 per kilogram at our Dongguan plant.", exCn: "我们复膜胶的出厂价是东莞工厂交货每公斤 2.85 美元。" },
      { w: "FCA", ipa: "/ˌef siː ˈeɪ/", pos: "n.", cn: "货交承运人（Free Carrier）", ex: "We can offer FCA Shenzhen Airport at USD 3.05 per kilogram for the sample order.", exCn: "样品订单我们可以报深圳机场货交承运人价每公斤 3.05 美元。" },
      { w: "FAS", ipa: "/ˌef eɪ ˈes/", pos: "n.", cn: "装运港船边交货（Free Alongside Ship）", ex: "FAS Ningbo is rarely used for our packaging film, since we always ship in containers.", exCn: "我们的包装膜很少用宁波船边交货，因为一直是集装箱出运。" },
      { w: "FOB", ipa: "/ˌef oʊ ˈbiː/", pos: "n.", cn: "装运港船上交货、离岸价（Free On Board）", ex: "Our price is USD 3.20 per kilogram FOB Shenzhen, Incoterms 2020.", exCn: "我们的价格是每公斤 3.20 美元，深圳港离岸价，适用 Incoterms 2020。" },
      { w: "CFR", ipa: "/ˌsiː ef ˈɑː/", pos: "n.", cn: "成本加运费，到港价不含保险（Cost and Freight）", ex: "CFR Hamburg works out at USD 3.46 per kilogram, with insurance to be arranged by you.", exCn: "CFR 汉堡核算下来是每公斤 3.46 美元，保险由你方自行安排。" },
      { w: "CIF", ipa: "/ˌsiː aɪ ˈef/", pos: "n.", cn: "成本、保险费加运费（Cost, Insurance and Freight）", ex: "Please quote CIF Rotterdam for twenty tonnes of solvent-free adhesive in steel drums.", exCn: "请报二十吨钢桶装无溶剂胶的 CIF 鹿特丹价格。" },
      { w: "CPT", ipa: "/ˌsiː piː ˈtiː/", pos: "n.", cn: "运费付至（Carriage Paid To）", ex: "For air shipments we normally quote CPT Frankfurt instead of CFR.", exCn: "空运我们通常报 CPT 法兰克福，而不是 CFR。" },
      { w: "CIP", ipa: "/ˌsiː aɪ ˈpiː/", pos: "n.", cn: "运费加保险费付至（Carriage and Insurance Paid To）", ex: "Under CIP we must insure the cargo under Institute Cargo Clauses A.", exCn: "在 CIP 条件下我们必须按协会货物条款 A 为货物投保。" },
      { w: "DAP", ipa: "/ˌdiː eɪ ˈpiː/", pos: "n.", cn: "目的地交货（Delivered at Place）", ex: "DAP your Warsaw warehouse means we deliver, but you handle import clearance and duty.", exCn: "DAP 你方华沙仓库意味着我们送货，但进口清关和关税由你方办理。" },
      { w: "DPU", ipa: "/ˌdiː piː ˈjuː/", pos: "n.", cn: "卸货地交货（Delivered at Place Unloaded）", ex: "DPU requires us to unload the packaging bags at your Lyon distribution centre.", exCn: "DPU 要求我们在你方里昂配送中心把包装袋卸下。" },
      { w: "DDP", ipa: "/ˌdiː diː ˈpiː/", pos: "n.", cn: "完税后交货（Delivered Duty Paid）", ex: "The DDP price includes import duty, VAT and delivery to your Milan factory gate.", exCn: "DDP 价格包含进口关税、增值税以及送到你方米兰工厂门口的费用。" },
      { w: "risk transfer", ipa: "/ˈrɪsk ˌtrænsfɜː/", pos: "n.", cn: "风险转移（transfer of risk）", ex: "Under CIF the risk transfer happens once the goods are loaded on board the vessel.", exCn: "在 CIF 条件下，货物一装上船风险即完成转移。" },
      { w: "point of delivery", ipa: "/ˌpɔɪnt əv dɪˈlɪvəri/", pos: "n.", cn: "交货地点（point of delivery）", ex: "Please confirm the exact point of delivery; otherwise the delivery point is ambiguous.", exCn: "请确认具体交货地点，否则交货点就是含糊的。" },
      { w: "export clearance", ipa: "/ˈekspɔːt ˈklɪərəns/", pos: "n.", cn: "出口清关（export customs clearance）", ex: "Except for EXW, export clearance is always the seller's obligation.", exCn: "除 EXW 之外，出口清关始终是卖方的义务。" },
      { w: "import clearance", ipa: "/ˈɪmpɔːt ˈklɪərəns/", pos: "n.", cn: "进口清关（import customs clearance）", ex: "Import clearance in Brazil takes about ten days, so please prepare the documents early.", exCn: "巴西的进口清关大约需要十天，请提早准备单据。" },
      { w: "customs duty", ipa: "/ˈkʌstəmz ˌdjuːti/", pos: "n.", cn: "关税（customs duty）", ex: "Customs duty on adhesive products in that market is seven percent of the CIF value.", exCn: "该市场胶粘剂产品的关税是 CIF 货值的百分之七。" },
      { w: "tariff", ipa: "/ˈtærɪf/", pos: "n.", cn: "税则、关税率（tariff）", ex: "Check the HS code first, because the tariff on film differs from that on finished bags.", exCn: "先核对 HS 编码，因为薄膜和成品袋的关税率并不相同。" },
      { w: "VAT", ipa: "/ˌviː eɪ ˈtiː/", pos: "n.", cn: "增值税（Value Added Tax）", ex: "Italian import VAT of twenty-two percent must be included in any DDP quotation.", exCn: "意大利百分之二十二的进口增值税必须计入任何 DDP 报价。" },
      { w: "freight prepaid", ipa: "/ˌfreɪt priːˈpeɪd/", pos: "adj.", cn: "运费预付（freight prepaid）", ex: "The bill of lading should be marked freight prepaid under CIF terms.", exCn: "在 CIF 条件下提单应注明运费预付。" },
      { w: "freight collect", ipa: "/ˌfreɪt kəˈlekt/", pos: "adj.", cn: "运费到付（freight collect）", ex: "For FOB shipments the bill of lading is marked freight collect.", exCn: "FOB 出运的提单注明运费到付。" },
      { w: "main carriage", ipa: "/ˌmeɪn ˈkærɪdʒ/", pos: "n.", cn: "主运输、国际段运输（main carriage）", ex: "The seller pays the main carriage under CFR, CIF, CPT and CIP.", exCn: "在 CFR、CIF、CPT 和 CIP 条件下，主运输由卖方支付。" },
      { w: "carrier", ipa: "/ˈkæriə/", pos: "n.", cn: "承运人（carrier）", ex: "Once the cargo is handed to the carrier, our FCA obligation is complete.", exCn: "货物一交给承运人，我们的 FCA 义务即履行完毕。" },
      { w: "named place of destination", ipa: "/ˌneɪmd ˈpleɪs əv ˌdestɪˈneɪʃn/", pos: "n.", cn: "指定目的地（named place of destination）", ex: "For DAP you must state the named place of destination in full detail.", exCn: "使用 DAP 时必须完整详细地写明指定目的地。" },
      { w: "port of loading", ipa: "/ˌpɔːt əv ˈloʊdɪŋ/", pos: "n.", cn: "装运港（port of loading）", ex: "Our usual port of loading is Yantian, but we can also ship from Shekou.", exCn: "我们常用的装运港是盐田，但也可以从蛇口出运。" },
      { w: "port of destination", ipa: "/ˌpɔːt əv ˌdestɪˈneɪʃn/", pos: "n.", cn: "目的港（port of destination）", ex: "Please advise the port of destination so that we can check the ocean freight.", exCn: "请告知目的港，以便我们查询海运费。" },
      { w: "Institute Cargo Clauses A", ipa: "/ˈɪnstɪtjuːt ˈkɑːɡoʊ ˈklɔːzɪz ˈeɪ/", pos: "n.", cn: "协会货物条款 A、一切险（Institute Cargo Clauses A）", ex: "Under CIP we cover the cargo under Institute Cargo Clauses A for the full value; under CIF the minimum cover is only Clauses C.", exCn: "在 CIP 条件下我们按协会货物条款 A 就全部货值投保；而在 CIF 下最低险别只是条款 C（这一点中国出口商最容易搞错）。" },
      { w: "minimum insurance cover", ipa: "/ˈmɪnɪməm ɪnˈʃʊərəns ˈkʌvə/", pos: "n.", cn: "最低保险险别（minimum insurance cover）", ex: "CIF only requires minimum insurance cover, that is Clauses C, unless otherwise agreed.", exCn: "除另有约定外，CIF 只要求最低险别，即条款 C。" },
      { w: "insurable value", ipa: "/ɪnˈʃʊərəbl ˈvæljuː/", pos: "n.", cn: "保险金额（insurable value）", ex: "The insurable value is the CIF value plus ten percent, as the contract requires.", exCn: "按合同要求，保险金额为 CIF 货值加百分之十。" },
      { w: "unloading", ipa: "/ˌʌnˈloʊdɪŋ/", pos: "n.", cn: "卸货（unloading）", ex: "Under DAP unloading at destination is at the buyer's risk and cost.", exCn: "在 DAP 条件下目的地卸货由买方承担风险和费用。" },
      { w: "door-to-door", ipa: "/ˌdɔː tə ˈdɔː/", pos: "adj.", cn: "门到门（door-to-door）", ex: "Our forwarder offers a door-to-door service for full containers of packaging bags.", exCn: "我们的货代为整柜包装袋提供门到门服务。" },
      { w: "landed cost", ipa: "/ˌlændɪd ˈkɑːst/", pos: "n.", cn: "到岸成本、落地成本（landed cost）", ex: "Your landed cost per thousand bags will be about eighteen dollars after duty and VAT.", exCn: "扣完关税和增值税后，你方每千个袋子的到岸成本约十八美元。" },
      { w: "profit margin", ipa: "/ˈprɑːfɪt ˌmɑːdʒɪn/", pos: "n.", cn: "利润率（profit margin）", ex: "A ten percent profit margin is built into the FOB price of this adhesive.", exCn: "这款胶水的 FOB 价格中已包含百分之十的利润率。" },
      { w: "commission", ipa: "/kəˈmɪʃn/", pos: "n.", cn: "佣金（commission）", ex: "The quotation includes a three percent commission for your agent in Istanbul.", exCn: "报价中含给你方伊斯坦布尔代理的百分之三佣金。" },
      { w: "bank charges", ipa: "/ˈbæŋk ˌtʃɑːdʒɪz/", pos: "n.", cn: "银行费用（bank charges）", ex: "Bank charges outside China are for the buyer's account under this contract.", exCn: "本合同项下中国境外的银行费用由买方承担。" },
      { w: "inland freight", ipa: "/ˌɪnlənd ˈfreɪt/", pos: "n.", cn: "内陆运费（inland freight）", ex: "Inland freight from our Dongguan plant to Yantian port is about 1,200 yuan per container.", exCn: "从我们东莞工厂到盐田港的内陆运费约每柜 1,200 元。" },
      { w: "customs broker fee", ipa: "/ˈkʌstəmz ˈbroʊkə fiː/", pos: "n.", cn: "报关代理费（customs broker fee）", ex: "The customs broker fee and the terminal handling charge are included in our FOB price.", exCn: "报关代理费和码头操作费已包含在我们的 FOB 价格中。" },
      { w: "quotation formula", ipa: "/kwoʊˈteɪʃn ˈfɔːmjələ/", pos: "n.", cn: "报价公式（quotation formula）", ex: "Our quotation formula adds inland freight, port charges and margin to the ex-works cost.", exCn: "我们的报价公式是在出厂成本上加内陆运费、港杂费和利润。" },
      { w: "cost breakdown", ipa: "/ˈkɑːst ˌbreɪkdaʊn/", pos: "n.", cn: "成本拆分、成本明细（cost breakdown）", ex: "Please send us a cost breakdown so that we can compare your FOB and CIF prices.", exCn: "请发一份成本明细给我们，以便比较你方的 FOB 价和 CIF 价。" },
      { w: "export tax refund", ipa: "/ˈekspɔːt tæks ˈriːfʌnd/", pos: "n.", cn: "出口退税（duty drawback / export tax refund）", ex: "The thirteen percent export tax refund allows us to lower the FOB price slightly.", exCn: "百分之十三的出口退税让我们可以把 FOB 价格略降一些。" }
    ],
    phrases: [
      { p: "quote on a CIF basis", cn: "按 CIF 条件报价", ex: "Could you quote on a CIF basis to Hamburg?", exCn: "能否按 CIF 汉堡报价？" },
      { p: "revise the quotation to DDP terms", cn: "把报价改为 DDP 条件", ex: "We have revised the quotation to DDP terms as your purchasing department asked.", exCn: "我们已按你方采购部要求把报价改为 DDP 条件。" },
      { p: "at your risk and cost", cn: "由你方承担风险和费用", ex: "Unloading at the destination warehouse is at your risk and cost.", exCn: "在目的地仓库卸货由你方承担风险和费用。" },
      { p: "hand the goods over to the carrier", cn: "把货物交给承运人", ex: "We hand the goods over to the carrier at the airport cargo terminal.", exCn: "我们在机场货站把货物交给承运人。" },
      { p: "arrange marine insurance", cn: "安排海运保险", ex: "Under CFR you have to arrange marine insurance yourselves.", exCn: "在 CFR 条件下，海运保险须由你方自行安排。" },
      { p: "cover the cargo for 110 percent of the invoice value", cn: "按发票金额的 110% 为货物投保", ex: "We will cover the cargo for 110 percent of the invoice value in US dollars.", exCn: "我们将按发票金额的 110% 以美元为货物投保。" },
      { p: "clear the goods for export", cn: "办理货物出口清关", ex: "The seller must clear the goods for export under all terms except EXW.", exCn: "除 EXW 外，所有术语下卖方都必须办理货物出口清关。" },
      { p: "be responsible for import duty and taxes", cn: "负责进口关税和税金", ex: "Under DAP the buyer is responsible for import duty and taxes.", exCn: "在 DAP 条件下由买方负责进口关税和税金。" },
      { p: "work out the landed cost", cn: "核算到岸成本", ex: "Let us work out the landed cost per thousand bags before we confirm the order.", exCn: "在确认订单前，我们先核算每千个袋子的到岸成本。" },
      { p: "break the price down into cost items", cn: "把价格拆分成各项成本", ex: "We can break the price down into cost items if that helps your budget approval.", exCn: "如果有助于你方预算审批，我们可以把价格拆分成各项成本。" },
      { p: "state the term, the place and the version", cn: "写明术语、地点和版本", ex: "In the contract please state the term, the place and the version, such as CIF Hamburg Incoterms 2020.", exCn: "合同中请写明术语、地点和版本，例如 CIF Hamburg Incoterms 2020。" },
      { p: "switch from FOB to FCA", cn: "把 FOB 改为 FCA", ex: "For this air shipment we suggest you switch from FOB to FCA.", exCn: "这批空运货物我们建议你方把 FOB 改为 FCA。" }
    ],
    dialogues: [
      {
        title: "客户要求把 FOB 改成 CIF 或 DDP 报价（Switching Trade Terms）",
        lines: [
          { sp: "A", en: "We have your FOB Shenzhen price of USD 3.20 per kilogram, but our own forwarder is not competitive. Could you quote CIF Hamburg instead?", cn: "我们收到你们深圳 FOB 每公斤 3.20 美元的价格，但我们自己的货代报价没有优势。能否改报 CIF 汉堡？" },
          { sp: "B", en: "Certainly. For twenty tonnes of solvent-free adhesive in twenty-kilogram pails, the ocean freight to Hamburg is USD 1,850 per forty-foot container.", cn: "当然可以。二十吨无溶剂胶用二十公斤桶装，到汉堡的海运费是每四十尺柜 1,850 美元。" },
          { sp: "A", en: "How much does that change the unit price?", cn: "这会让单价变动多少？" },
          { sp: "B", en: "One container takes eighteen tonnes, so the freight adds about USD 0.10 per kilogram. With insurance, CIF Hamburg is USD 3.32 per kilogram.", cn: "一个柜装十八吨，所以运费折算每公斤约 0.10 美元。加上保险，CIF 汉堡是每公斤 3.32 美元。" },
          { sp: "A", en: "What cover does that insurance include?", cn: "保险包含什么险别？" },
          { sp: "B", en: "CIF only requires minimum cover, but we will insure under Institute Cargo Clauses A for 110 percent of the invoice value at no extra charge.", cn: "CIF 只要求最低险别，但我们会按协会货物条款 A、发票金额的 110% 投保，不额外收费。" },
          { sp: "A", en: "Good. And if the cargo is damaged at sea, who has to claim?", cn: "很好。那如果货物在海上受损，由谁索赔？" },
          { sp: "B", en: "You do. Under CIF the risk transfers to you once the goods are loaded on board at Yantian; we simply pass you the policy and the bill of lading.", cn: "由你方索赔。CIF 下货物在盐田装上船后风险就转移给你方，我们只需把保单和提单交给你方。" },
          { sp: "A", en: "Understood. Then could you also give us a DDP price to our Hamburg warehouse for comparison?", cn: "明白了。那能否再给一个到我们汉堡仓库的 DDP 价格作比较？" },
          { sp: "B", en: "We can, but German import duty of 6.5 percent and VAT of nineteen percent would be added, plus inland trucking and the customs broker fee.", cn: "可以，但要加上德国 6.5% 的进口关税和 19% 的增值税，还有内陆卡车运费和报关代理费。" },
          { sp: "A", en: "Please quote both, and mark the terms clearly in the contract.", cn: "两个都请报，并在合同里把术语写清楚。" },
          { sp: "B", en: "Understood. We will write CIF Hamburg Incoterms 2020 and DDP Hamburg Incoterms 2020 on separate lines of the offer sheet.", cn: "明白。我们会在报价单上分行写明 CIF Hamburg Incoterms 2020 和 DDP Hamburg Incoterms 2020。" }
        ]
      },
      {
        title: "空运客户误用 FOB，业务员建议改用 FCA 或 CPT（Choosing the Right Incoterm）",
        lines: [
          { sp: "A", en: "For the urgent sample of 500 kilograms of lamination adhesive, please quote FOB Shenzhen by air.", cn: "这批 500 公斤复膜胶的紧急样品，请报深圳 FOB 空运价。" },
          { sp: "B", en: "There is a problem with the term. FOB is only for sea and inland waterway transport, because delivery takes place on board a vessel.", cn: "这个术语有问题。FOB 只适用于海运和内河水运，因为交货是在船上完成的。" },
          { sp: "A", en: "So which term should we use for an air shipment?", cn: "那空运应该用哪个术语？" },
          { sp: "B", en: "FCA Shenzhen Airport if you book the flight yourselves, or CPT Frankfurt Airport if you want us to pay the air freight.", cn: "如果你方自己订舱，用 FCA 深圳机场；如果希望我们付空运费，用 CPT 法兰克福机场。" },
          { sp: "A", en: "What exactly is the difference in responsibility?", cn: "两者在责任上具体有什么区别？" },
          { sp: "B", en: "Under FCA we clear the goods for export and hand them to your airline or agent at the cargo terminal; risk and freight are yours from that point.", cn: "FCA 下我们办理出口清关，并在货站把货交给你方航空公司或代理；从那时起风险和运费归你方。" },
          { sp: "A", en: "And under CPT?", cn: "那 CPT 呢？" },
          { sp: "B", en: "We pay the carriage to Frankfurt, but the risk still passes to you when the cargo is handed to the first carrier in Shenzhen.", cn: "我们支付到法兰克福的运费，但风险仍在深圳交给第一承运人时转移给你方。" },
          { sp: "A", en: "So insurance is still on our side under CPT?", cn: "所以 CPT 下保险还是我方负责？" },
          { sp: "B", en: "Yes. If you want us to insure the cargo as well, we should quote CIP Frankfurt Airport instead.", cn: "是的。如果希望我们也代为投保，那就应改报 CIP 法兰克福机场。" },
          { sp: "A", en: "Let us take CPT Frankfurt this time. What is the price per kilogram?", cn: "这次就用 CPT 法兰克福。每公斤价格是多少？" },
          { sp: "B", en: "Air freight is USD 4.60 per kilogram, so based on our FCA price of USD 3.05, CPT Frankfurt Airport comes to USD 7.65 per kilogram, Incoterms 2020.", cn: "空运费每公斤 4.60 美元，以我们 FCA 价 3.05 美元为基础，CPT 法兰克福机场为每公斤 7.65 美元，适用 Incoterms 2020。" }
        ]
      }
    ],
    tips: [
      "CIF 和 CFR 下，风险在装运港货物装上船的那一刻就转移给买方，卖方支付运费（CIF 还要投保）并不等于承诺把货安全送到目的港。货在海上出险，由买方凭保单向保险公司索赔，卖方只需按约定投保并及时交单。客户说「你负责送到汉堡」时，务必问清他要的是 CIF 还是 DAP，两者责任差别很大。",
      "FAS、FOB、CFR、CIF 只适用于海运和内河水运，交货点是船边或船上。走空运、卡航、铁路或集装箱门到门时报 FOB 属于误用：集装箱在码头堆场就已交给承运人，不存在「越过船舷」的环节。此类业务应改用 FCA（货交承运人）、CPT（运费付至）或 CIP，责任划分才与实际操作对得上。",
      "EXW 下卖方只需在自己工厂把货交给买方，出口报关、装货以及出口退税单据全部由买方负责。但实际上外商在中国通常没有报关主体，做不了出口清关，也拿不到报关单，卖方因此无法办理退税。遇到客户坚持 EXW 时，建议改成 FCA 工厂或 FCA 深圳：卖方办出口清关，其余环节仍由买方安排，双方都省事。",
      "报 DDP 之前必须查清目的国的进口关税率、增值税率和清关杂费，并把这些全部计入成本。复膜胶、包装膜在部分国家关税较高，或需要 REACH、食品接触等认证，漏算一项就可能把利润吃光。另外 DDP 下卖方还要在进口国承担纳税义务，能否作为非居民纳税人清关，应先与货代和当地客户确认。",
      "合同和报价单里的贸易术语必须写成「术语 + 具体地点 + 版本」三段式，例如 CIF Hamburg Incoterms 2020。只写 FOB 而不写港口，或不写版本年份，一旦出现争议就无法确定交货点和适用规则。地点越具体越好，DAP 和 DDP 尤其要写到收货仓库的门牌地址。",
      "报价前先做成本拆分：出厂价 + 内陆运费 + 报关及港杂费 + 主运费 + 保险费 + 银行费用 + 佣金 - 出口退税，再加目标利润。常用公式为 CFR = FOB + 海运费，CIF = CFR ÷（1 - 投保加成率 × 保险费率）。按公斤报胶水、按千个报包装袋时，务必先统一计价单位，避免报错价格。"
    ]
  });
})();
