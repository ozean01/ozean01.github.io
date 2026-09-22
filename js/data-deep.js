/* ============ 单元 17-18：软包装技术深挖 + 合规与客诉（追加到 FTE_DATA.units）============
   数据结构与 data.js 一致：id / title / titleEn / icon / summary / vocab / phrases / dialogues / tips。
   音标统一为美式（General American），与全站口径一致。仅供参考学习，非专业标准定义。 */
(function () {
  "use strict";
  if (typeof FTE_DATA === "undefined" || !FTE_DATA || !FTE_DATA.units) return;

  FTE_DATA.units.push({
    id: 17,
    title: "软包装技术深挖：复合工艺 / 膜材物性 / 质检缺陷",
    titleEn: "Flexible Packaging Deep Dive: Lamination, Film Properties & Defects",
    icon: "🔬",
    summary: "把 U11 的行业词汇再往下挖一层：复合胶的操作时间窗与润湿、膜材的阻隔/强度/热封物性、以及常见缺陷的英文叫法——技术沟通、客诉判定、配方反馈都用得上。",
    vocab: [
      { w: "wetting", ipa: "/ˈwetɪŋ/", pos: "n.", cn: "润湿（胶在膜表面的铺展程度）", ex: "Good wetting of the film is essential for a strong bond.", exCn: "胶在膜上的良好润湿是获得牢固粘合的关键。" },
      { w: "open time", ipa: "/ˈoʊpən taɪm/", pos: "n.", cn: "开放时间（涂胶后仍可贴合的时间窗）", ex: "The open time of this solventless adhesive is about 20 minutes.", exCn: "这款无溶剂胶的开放时间大约 20 分钟。" },
      { w: "work time", ipa: "/ˈwɜːrk taɪm/", pos: "n.", cn: "适用期（双组分混合后保持可用时间）", ex: "Work time is how long the mixed adhesive stays usable before it cures.", exCn: "适用期指双组分胶混合后到固化前仍可用的时间。" },
      { w: "green tack", ipa: "/ɡriːn tæk/", pos: "n.", cn: "初粘力（未固化时的粘性）", ex: "A higher green tack helps the film hold its position before curing.", exCn: "较高的初粘力有助于膜在固化前保持在位。" },
      { w: "NCO index", ipa: "/ˌen siː ˈoʊ ˈɪndeks/", pos: "n.", cn: "异氰酸酯指数（NCO/OH 摩尔比）", ex: "We tune the NCO index to balance adhesion and flexibility.", exCn: "我们调节异氰酸酯指数来平衡粘合性与柔韧性。" },
      { w: "substrate", ipa: "/ˈsʌbstreɪt/", pos: "n.", cn: "基材（被复合的膜/材料）", ex: "Surface tension of the substrate determines how well the adhesive wets it.", exCn: "基材的表面张力决定胶能否充分润湿它。" },
      { w: "primer", ipa: "/ˈpraɪmər/", pos: "n.", cn: "底涂（为提高附着而先涂的一层）", ex: "We apply a primer on the aluminum foil to boost adhesion.", exCn: "我们在铝箔上涂一层底涂以提升附着力。" },
      { w: "adhesion promoter", ipa: "/ədˈhiːʒn prəˈmoʊtər/", pos: "n.", cn: "附着力促进剂", ex: "An adhesion promoter is added for low-surface-tension films.", exCn: "对低表面张力的膜会加入附着力促进剂。" },
      { w: "WVTR", ipa: "/ˌdʌbljuː viː tiː ˈɑːr/", pos: "n.", cn: "水蒸气透过率（Water Vapor Transmission Rate）", ex: "The WVTR of a retort pouch must be very low to protect dry food.", exCn: "蒸煮袋的水蒸气透过率必须很低才能保护干粮。" },
      { w: "OTR", ipa: "/ˌoʊ tiː ˈɑːr/", pos: "n.", cn: "氧气透过率（Oxygen Transmission Rate）", ex: "Coffee packaging demands a low OTR to keep the aroma.", exCn: "咖啡包装要求低氧透过率以保留香气。" },
      { w: "moisture barrier", ipa: "/ˈmɔɪstʃər ˈbæriər/", pos: "n.", cn: "防潮阻隔层", ex: "An aluminum layer acts as an excellent moisture barrier.", exCn: "铝层是极佳的防潮阻隔层。" },
      { w: "oxygen barrier", ipa: "/ˈɑːksɪdʒən ˈbæriər/", pos: "n.", cn: "隔氧层", ex: "EVOH is used as the oxygen barrier in this structure.", exCn: "该结构用 EVOH 作为隔氧层。" },
      { w: "tensile strength", ipa: "/ˈtensəl streŋθ/", pos: "n.", cn: "抗拉强度", ex: "A higher tensile strength reduces the risk of film breakage on the line.", exCn: "更高的抗拉强度可降低产线上薄膜断裂的风险。" },
      { w: "elongation", ipa: "/ˌiːlɔːŋˈɡeɪʃn/", pos: "n.", cn: "延伸率（拉伸伸长百分数）", ex: "Good elongation lets the film stretch without tearing.", exCn: "良好的延伸率让薄膜在拉伸时不撕裂。" },
      { w: "seal strength", ipa: "/ˈsiːl streŋθ/", pos: "n.", cn: "热封强度", ex: "We test the seal strength after sealing the pouches.", exCn: "封袋后我们测试热封强度。" },
      { w: "heat seal temperature window", ipa: "/hiːt siːl ˈtemprətʃər ˈwɪndoʊ/", pos: "n.", cn: "热封温度窗口（可热封有效温度范围）", ex: "The wider the heat seal temperature window, the easier it is to run on your machine.", exCn: "热封温度窗口越宽，越容易在你的设备上运行。" },
      { w: "hot tack", ipa: "/hɑːt tæk/", pos: "n.", cn: "热粘强度（封口仍热时的强度）", ex: "High hot tack is critical for vertical form-fill-seal lines.", exCn: "高的热粘强度对垂直制袋—充填—封口线至关重要。" },
      { w: "sealing jaw", ipa: "/ˈsiːlɪŋ dʒɔː/", pos: "n.", cn: "热封刀（夹爪）", ex: "The temperature and pressure of the sealing jaw must be tuned.", exCn: "热封刀的温度与压力需要调节。" },
      { w: "coefficient of friction", ipa: "/ˌkoʊɪˈfɪʃnt əv ˈfrɪkʃn/", pos: "n.", cn: "摩擦系数（COF；影响走膜与堆叠）", ex: "A low coefficient of friction helps the film run smoothly over the rollers.", exCn: "低摩擦系数让薄膜在辊筒上走得更顺。" },
      { w: "haze", ipa: "/heɪz/", pos: "n.", cn: "雾度（透明度降低的指标）", ex: "Low haze is required for a clear window in the pouch.", exCn: "包装袋透明窗要求低雾度。" },
      { w: "gloss", ipa: "/ɡlɑːs/", pos: "n.", cn: "光泽（度）", ex: "High gloss gives the printed film a premium look.", exCn: "高光泽让印刷膜显得更高级。" },
      { w: "ink adhesion", ipa: "/ɪŋk ədˈhiːʒn/", pos: "n.", cn: "油墨附着力", ex: "Poor ink adhesion causes the print to flake off during lamination.", exCn: "油墨附着力差会导致复合时印刷层剥落。" },
      { w: "printability", ipa: "/ˌprɪntəˈbɪləti/", pos: "n.", cn: "印刷适性（表面是否适合印刷）", ex: "Corona treatment improves the printability of the film.", exCn: "电晕处理提升薄膜的印刷适性。" },
      { w: "release liner", ipa: "/rɪˈliːs ˈlaɪnər/", pos: "n.", cn: "离型膜（隔离纸/膜）", ex: "The adhesive is supplied with a release liner on both sides.", exCn: "胶粘剂采用双面离型膜供货。" },
      { w: "pinhole", ipa: "/ˈpɪnhoʊl/", pos: "n.", cn: "针孔（透明膜微孔缺陷）", ex: "Pinholes in the laminate can ruin the barrier performance.", exCn: "复合膜上的针孔会破坏阻隔性能。" },
      { w: "fish eye", ipa: "/fɪʃ aɪ/", pos: "n.", cn: "鱼眼（涂料/油墨里的圆形无规则缺陷）", ex: "A fish eye on the coating is usually caused by contamination.", exCn: "涂层上的鱼眼通常由污染引起。" },
      { w: "gel", ipa: "/dʒel/", pos: "n.", cn: "凝胶点（胶中局部固化颗粒）", ex: "Filtration removes gel particles from the adhesive.", exCn: "过滤去除胶中的凝胶颗粒。" },
      { w: "curl", ipa: "/kɜːrl/", pos: "n.", cn: "卷曲（膜翘曲）", ex: "A large curl makes the film hard to feed on the machine.", exCn: "明显卷曲会让薄膜难以在机器上走料。" },
      { w: "wrinkle", ipa: "/ˈrɪŋkl/", pos: "n.", cn: "皱褶", ex: "Wrinkles usually appear when the tension is not balanced.", exCn: "皱褶通常出现在张力不平衡时。" },
      { w: "tunneling", ipa: "/ˈtʌnəlɪŋ/", pos: "n.", cn: "隧道效应（复合后局部未粘合形成的通道/气泡带）", ex: "Tunneling is common with solventless lamination at low coating weight.", exCn: "低上胶量下做无溶剂复合常出现隧道效应。" },
      { w: "run a peel test", ipa: "/rʌn ə piːl test/", pos: "v.", cn: "做剥离测试", ex: "We run a peel test on every batch before release.", exCn: "每批放行前我们都会做剥离测试。" }
    ],
    phrases: [
      { p: "run within the heat seal window", cn: "在热封窗口内运行", ex: "Make sure the machine runs within the heat seal temperature window.", exCn: "请确保机器在热封温度窗口内运行。" },
      { p: "maintain proper tension", cn: "保持适当张力", ex: "Maintain proper tension to prevent wrinkle and tunneling.", exCn: "保持适当张力以防皱褶与隧道效应。" },
      { p: "verify the barrier performance", cn: "验证阻隔性能", ex: "We verify the barrier performance on each batch.", exCn: "我们对每批都验证阻隔性能。" },
      { p: "adjust the mix ratio", cn: "调整配比", ex: "Please adjust the mix ratio to suit the ambient humidity.", exCn: "请根据环境湿度调整配比。" }
    ],
    dialogues: [
      {
        title: "膜材物性与工艺沟通",
        lines: [
          { sp: "A", en: "We need a pouch for coffee with a good oxygen barrier and low WVTR.", cn: "我们需要一个咖啡袋，隔氧要好、水蒸气透过率要低。" },
          { sp: "B", en: "Then I'd suggest a PET/AL/PE structure with EVOH in the barrier layer.", cn: "那建议用 PET/AL/PE 结构，阻隔层用 EVOH。" },
          { sp: "A", en: "What about the heat seal window? Our form-fill-seal runs fast.", cn: "热封窗口如何？我们制袋充填封口跑得很快。" },
          { sp: "B", en: "The PE sealing layer gives a wide window and good hot tack.", cn: "PE 热封层窗口很宽、热粘强度也高。" },
          { sp: "A", en: "Good. Please also confirm the OTR and WVTR after lamination.", cn: "好。请同时确认复合后的氧透过率和水蒸气透过率。" }
        ]
      },
      {
        title: "复合后缺陷处理（隧道/皱褶）",
        lines: [
          { sp: "A", en: "We see tunneling on some rolls after solventless lamination.", cn: "我们无溶剂复合后有些卷出现隧道效应。" },
          { sp: "B", en: "That usually points to low coating weight or uneven tension.", cn: "这通常指向上胶量过低或张力不均。" },
          { sp: "A", en: "We kept the coating weight around 1.5 g/m².", cn: "我们把上胶量控制在约 1.5 克/平方米。" },
          { sp: "B", en: "Let's raise it to 1.8 and rebalance the tension between the reels.", cn: "我们把上胶量提到 1.8，并重新平衡两个放卷的张力吧。" },
          { sp: "A", en: "Fine. Send me the suggested parameters and I'll run a trial.", cn: "可以。把建议参数发我，我做次小试。" }
        ]
      }
    ],
    tips: [
      "技术沟通必问：膜结构与厚度、表面张力、热封窗口、上胶量与配比——这四样决定工艺稳不稳。",
      "缺陷要先分类再谈成因：隧道/皱褶多半是张力与上胶量，脱层/剥离是附着问题，针孔/雾度是膜材与洁净度问题。英文先给出分类，沟通更高效。"
    ]
  });

  FTE_DATA.units.push({
    id: 18,
    title: "合规、客诉与持续改进",
    titleEn: "Compliance, Complaints & Continuous Improvement",
    icon: "⚖️",
    summary: "面向食品接触合规与售后客诉：迁移与符合性声明、不合格与追责、客诉处理五步（确认→调查→纠正→预防→关闭），以及常见的索赔与补偿表达。",
    vocab: [
      { w: "food contact compliance", ipa: "/ˈfuːd ˈkɑːntækt kəmˈplaɪəns/", pos: "n.", cn: "食品接触合规", ex: "Food contact compliance is confirmed by the relevant test report.", exCn: "食品接触合规由相关检测报告确认。" },
      { w: "overall migration", ipa: "/ˌoʊvərˈɔːl maɪˈɡreɪʃn/", pos: "n.", cn: "总迁移量", ex: "The overall migration must stay below the legal limit.", exCn: "总迁移量必须低于法定限值。" },
      { w: "specific migration", ipa: "/spəˈsɪfɪk maɪˈɡreɪʃn/", pos: "n.", cn: "特定迁移量（指特定物质）", ex: "We check the specific migration of each monomer.", exCn: "我们检测每种单体的特定迁移量。" },
      { w: "compliance declaration", ipa: "/kəmˈplaɪəns ˌdekləˈreɪʃn/", pos: "n.", cn: "符合性声明（DoC）", ex: "A compliance declaration is attached to every food-grade order.", exCn: "每批食品级订单都附符合性声明。" },
      { w: "regulatory", ipa: "/ˌreɡjəˈlætɔːri/", pos: "adj.", cn: "法规的；合规的", ex: "The product meets all regulatory requirements in the EU.", exCn: "该产品满足欧盟所有法规要求。" },
      { w: "complaint handling", ipa: "/kəmˈpleɪnt ˈhændlɪŋ/", pos: "n.", cn: "客诉处理", ex: "Our complaint handling follows a clear five-step process.", exCn: "我们的客诉处理遵循清晰的五步流程。" },
      { w: "acknowledge", ipa: "/əkˈnɑːlɪdʒ/", pos: "v.", cn: "确认收悉（客诉）", ex: "We acknowledge the complaint within 24 hours.", exCn: "我们在 24 小时内确认收到投诉。" },
      { w: "investigation", ipa: "/ɪnˌvestɪˈɡeɪʃn/", pos: "n.", cn: "调查", ex: "The investigation covers the batch record and the film structure.", exCn: "调查涵盖批次记录与膜结构。" },
      { w: "root cause", ipa: "/ruːt kɔːz/", pos: "n.", cn: "根因", ex: "We identified the root cause as a contaminated mixing line.", exCn: "我们确定根因是混胶线被污染。" },
      { w: "corrective action", ipa: "/kəˈrektɪv ˈækʃn/", pos: "n.", cn: "纠正措施（针对**根因**、防止再发；修已发现的缺陷是 rework/containment）", ex: "The corrective action eliminates the root cause so the defect cannot recur.", exCn: "纠正措施消除根因，使该缺陷不再发生。（只把已发现的不合格修好，叫 rework；先隔离止住影响，叫 containment）" },
      { w: "preventive action", ipa: "/prɪˈventɪv ˈækʃn/", pos: "n.", cn: "预防措施（防止复发）", ex: "A preventive action stops the same defect from recurring.", exCn: "预防措施防止同类不合格再次出现。" },
      { w: "nonconformance", ipa: "/ˌnɑːnkənˈfɔːrməns/", pos: "n.", cn: "不合格（不符合）", ex: "Any nonconformance is recorded and quarantined.", exCn: "任何不合格都要记录并隔离。" },
      { w: "deviation", ipa: "/ˌdiːviˈeɪʃn/", pos: "n.", cn: "偏差（与规范的偏离）", ex: "A small deviation in coating weight was noted.", exCn: "记录到上胶量的轻微偏差。" },
      { w: "quarantine", ipa: "/ˈkwɔːrəntiːn/", pos: "n./v.", cn: "隔离（可疑/不合格品）", ex: "We quarantine the affected batch pending review.", exCn: "我们隔离受影响批次，待评审。" },
      { w: "rework", ipa: "/ˌriːˈwɜːrk/", pos: "n./v.", cn: "返工", ex: "Pallets with damaged film are sent for rework.", exCn: "膜受损的托盘返工处理。" },
      { w: "reject", ipa: "/rɪˈdʒekt/", pos: "v.", cn: "拒收", ex: "The buyer rejected the batch because of delamination.", exCn: "买方因脱层拒收了该批货。" },
      { w: "claim", ipa: "/kleɪm/", pos: "n./v.", cn: "索赔", ex: "They filed a claim for the defective pouches.", exCn: "他们就问题包装袋提出了索赔。" },
      { w: "evidence", ipa: "/ˈevɪdəns/", pos: "n.", cn: "证据", ex: "Please send us photos and the batch number as evidence.", exCn: "请把照片和批号作为证据发给我们。" },
      { w: "traceability", ipa: "/ˌtreɪsəˈbɪləti/", pos: "n.", cn: "可追溯性", ex: "Full traceability lets us trace the defect to a specific batch.", exCn: "完整的可追溯性让我们把缺陷追溯到具体批次。" },
      { w: "batch record", ipa: "/bætʃ ˈrekɔːrd/", pos: "n.", cn: "批次记录", ex: "We keep a batch record for every production run.", exCn: "我们为每批生产保留批次记录。" },
      { w: "certificate of analysis", ipa: "/sərˈtɪfɪkət əv əˈnæləsɪs/", pos: "n.", cn: "分析证书（CoA）", ex: "A certificate of analysis is issued for each lot.", exCn: "每批签发分析证书。" },
      { w: "food-grade", ipa: "/ˈfuːd ɡreɪd/", pos: "adj.", cn: "食品级的", ex: "Only food-grade films are used for this application.", exCn: "此应用只使用食品级薄膜。" },
      { w: "resolution", ipa: "/ˌrezəˈluːʃn/", pos: "n.", cn: "解决/结案", ex: "We reached a resolution by sending a replacement lot.", exCn: "我们通过补发一批货达成解决。" },
      { w: "goodwill", ipa: "/ˌɡʊdˈwɪl/", pos: "n.", cn: "善意（售后补偿、维持关系）", ex: "We offered a goodwill discount to keep the partnership.", exCn: "我们拿出善意折扣以维护合作关系。" },
      { w: "credit note", ipa: "/ˈkredɪt noʊt/", pos: "n.", cn: "贷记单（退款/抵扣）", ex: "A credit note will be issued for the returned goods.", exCn: "对退回货物会出具贷记单。" },
      { w: "replacement", ipa: "/rɪˈpleɪsmənt/", pos: "n.", cn: "换货；替代品", ex: "The replacement lot ships this week.", exCn: "换货批次本周发出。" },
      { w: "compensation", ipa: "/ˌkɑːmpənˈseɪʃn/", pos: "n.", cn: "赔偿", ex: "We agreed on compensation for the freight cost.", exCn: "我们就运费损失达成赔偿。" },
      { w: "issue a credit note", ipa: "/ˈɪʃuː ə ˈkredɪt noʊt/", pos: "v.", cn: "开贷项通知单", ex: "We will issue a credit note for the short shipment.", exCn: "短装部分我们会开具贷项通知单。" },
      { w: "recall the batch", ipa: "/rɪˈkɔːl ðə bætʃ/", pos: "v.", cn: "召回批次", ex: "We had to recall the batch after the migration test failed.", exCn: "迁移测试不合格后，我们不得不召回该批次。" },
      { w: "eliminate the root cause", ipa: "/ɪˈlɪmɪneɪt ðə ruːt kɔːz/", pos: "v.", cn: "消除根本原因", ex: "The corrective action must eliminate the root cause.", exCn: "纠正措施必须消除根本原因。" }
    ],
    phrases: [
      { p: "as a gesture of goodwill", cn: "作为善意表示", ex: "We offer this discount as a gesture of goodwill.", exCn: "我们以此折扣作为善意表示。" },
      { p: "take corrective action", cn: "采取纠正措施", ex: "We will take corrective action and report the result.", exCn: "我们将采取纠正措施并反馈结果。" },
      { p: "trace back to a specific batch", cn: "追溯到具体批次", ex: "The tracing ability may trace the issue back to a specific batch.", exCn: "可追溯性可把问题追溯到具体批次。" },
      { p: "close the complaint", cn: "关闭投诉", ex: "We are ready to close the complaint once you confirm.", exCn: "您确认后我们就可关闭此投诉。" }
    ],
    dialogues: [
      {
        title: "食品接触合规确认（客诉前置）",
        lines: [
          { sp: "A", en: "Can you confirm the laminate is food contact compliant?", cn: "能确认这复合膜符合食品接触合规吗？" },
          { sp: "B", en: "Yes. We issue a compliance declaration and a CoA with each batch.", cn: "可以。每批我们都附符合性声明与分析证书。" },
          { sp: "A", en: "What about overall and specific migration?", cn: "总迁移和特定迁移呢？" },
          { sp: "B", en: "Both are tested against the EU limit and are documented in the report.", cn: "两者都按欧盟限值检测并记录在报告里。" },
          { sp: "A", en: "Perfect. Please email the latest test report with the sample.", cn: "很好。请把最新检测报告随样品邮件发来。" }
        ]
      },
      {
        title: "客诉处理：脱层索赔",
        lines: [
          { sp: "A", en: "We found delamination on 4 pallets. We've quarantined them.", cn: "我们发现 4 个托出现脱层，已隔离。" },
          { sp: "B", en: "We're sorry. Please share the photos and the batch number as evidence.", cn: "很抱歉。请提供照片与批号作为证据。" },
          { sp: "A", en: "The batch number is on the label. We also kept a sample roll.", cn: "批号在标签上。我们还留了样卷。" },
          { sp: "B", en: "We've started a root cause investigation and will take corrective action.", cn: "我们已开始根因调查，将采取纠正措施。" },
          { sp: "A", en: "For this batch, we'd like a replacement and some compensation.", cn: "这批我们想换货并要一些赔偿。" },
          { sp: "B", en: "We'll send a replacement lot this week and a credit note for the freight.", cn: "我们本周补发一批，并对运费出具贷记单。" },
          { sp: "A", en: "Good. We'll close the complaint after the goods arrive.", cn: "好。货到后我们关闭投诉。" }
        ]
      }
    ],
    tips: [
      "客诉五步（英文顺序）：acknowledge → investigate → root cause → corrective/preventive action → close。每一步都把证据（照片/批号/样卷）和结论说清楚。",
      "食品级订单必备：compliance declaration（符合性声明）+ certificate of analysis（分析证书）+ 迁移/合规检测报告。缺一不可，也最能体现专业。"
    ]
  });
})();
