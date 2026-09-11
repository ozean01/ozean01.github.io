/* ============ 单元 16：合同风险、贸易纠纷与产品合规认证（追加到 FTE_DATA.units） ============
   补齐《借鉴价值评估方案》中指出的两个覆盖较薄的环节：
     · 合同风险与贸易纠纷（违约/不可抗力/仲裁/管辖…）
     · 产品认证与市场合规（CE/UKCA/FCC/REACH/RoHS/FDA 食品接触…）
   数据为软包装与复膜胶行业背景的对外表达；例句均为真实业务语料风格。 */
(function () {
  "use strict";
  if (typeof FTE_DATA === "undefined" || !FTE_DATA || !FTE_DATA.units) return;
  FTE_DATA.units.push({
    id: 16,
    title: "合同风险、贸易纠纷与产品合规",
    titleEn: "Contract Risk, Trade Disputes & Product Compliance",
    icon: "⚖️",
    summary: "把合同履行与产品出口里最容易被忽略的风险吃透：违约与救济、不可抗力、索赔与仲裁、适用法律与管辖权；以及软包装出口要面对的 CE / UKCA / FCC / REACH / RoHS / FDA 食品接触等认证与合规表达——谈条款、处理纠纷、说明合规时把话说准。",
    vocab: [
      { w: "breach of contract", ipa: "/ˌbriːtʃ əv ˈkɑːntrækt/", pos: "n.", cn: "违约（违反合同）", ex: "Late delivery amounted to a material breach of contract and entitled us to cancel.", exCn: "迟交货构成实质性违约，我们有权解除合同。" },
      { w: "force majeure", ipa: "/ˌfɔːs mæˈjɜːr/", pos: "n.", cn: "不可抗力（自然灾害、战乱、禁运等）", ex: "We claim force majeure because the port was closed by the typhoon for five days.", exCn: "我们主张不可抗力，因为台风导致港口关闭五天。" },
      { w: "liquidated damages", ipa: "/ˈlɪkwɪdeɪtɪd ˈdæmɪdʒɪz/", pos: "n.", cn: "约定损害赔偿（预先约定数额的违约金）", ex: "The contract caps liquidated damages at 5% of the contract value for delay.", exCn: "合同将迟延的约定损害赔偿上限设为合同额的 5%。" },
      { w: "penalty clause", ipa: "/ˈpenəlti klɔːz/", pos: "n.", cn: "违约金条款", ex: "A clear penalty clause deters the buyer from canceling the order at the last minute.", exCn: "清晰的违约金条款能约束买方不要在最后一刻撤单。" },
      { w: "damages", ipa: "/ˈdæmɪdʒɪz/", pos: "n.", cn: "损害赔偿（复数）", ex: "We are claiming damages for the extra warehouse rent caused by the delay.", exCn: "我们正就迟延造成的额外仓储费主张损害赔偿。" },
      { w: "indemnity", ipa: "/ɪnˈdemnəti/", pos: "n.", cn: "赔偿、补偿（赔偿金）", ex: "The supplier agreed to an indemnity for the recall of the non-compliant pouches.", exCn: "供应商同意就不合规袋子的召回提供赔偿。" },
      { w: "liability", ipa: "/ˌlaɪəˈbɪləti/", pos: "n.", cn: "责任（赔偿责任）", ex: "Our liability is limited to the value of the defective goods actually returned.", exCn: "我们的责任以实际退回的缺陷货物价值为限。" },
      { w: "claim", ipa: "/kleɪm/", pos: "n.", cn: "索赔；主张", ex: "Please file your claim with copies of the photos and the test report within 30 days.", exCn: "请在 30 天内随照片和检测报告副本提出索赔。" },
      { w: "dispute", ipa: "/dɪˈspjuːt/", pos: "n.", cn: "争议、纠纷", ex: "Any dispute arising under this contract shall be settled by friendly negotiation first.", exCn: "本合同项下产生的任何争议应首先通过友好协商解决。" },
      { w: "settlement", ipa: "/ˈsetlmənt/", pos: "n.", cn: "和解、结算", ex: "We reached an amicable settlement and the buyer withdrew the arbitration request.", exCn: "我们达成和解，买方撤回了仲裁申请。" },
      { w: "arbitration", ipa: "/ˌɑːrbɪˈtreɪʃn/", pos: "n.", cn: "仲裁", ex: "The contract provides for arbitration in Shanghai under the CIETAC rules.", exCn: "合同约定在上海依贸仲规则仲裁。" },
      { w: "mediation", ipa: "/ˌmiːdiˈeɪʃn/", pos: "n.", cn: "调解", ex: "Rather than litigate, both sides agreed to try mediation by a third party.", exCn: "双方同意由第三方调解，而不是诉诸诉讼。" },
      { w: "litigation", ipa: "/ˌlɪtɪˈɡeɪʃn/", pos: "n.", cn: "诉讼", ex: "Litigation in a foreign court is costly, so arbitration is usually the better choice.", exCn: "在外国法院诉讼成本高昂，因此仲裁通常是更优选择。" },
      { w: "governing law", ipa: "/ˈɡʌvərnɪŋ lɔː/", pos: "n.", cn: "适用法律（合同受何法律管辖）", ex: "This contract is governed by the laws of the People's Republic of China.", exCn: "本合同适用中华人民共和国法律。" },
      { w: "jurisdiction", ipa: "/ˌdʒʊərɪsˈdɪkʃn/", pos: "n.", cn: "管辖权（法院或仲裁机构管辖）", ex: "The parties submit to the exclusive jurisdiction of the Shanghai court.", exCn: "双方同意接受上海法院的专属管辖。" },
      { w: "dispute resolution", ipa: "/dɪˈspjuːt ˌrezəˈluːʃn/", pos: "n.", cn: "争议解决（方式：协商/调解/仲裁/诉讼）", ex: "We propose a dispute resolution clause that favors negotiation before arbitration.", exCn: "我们建议采用先协商、后仲裁的争议解决条款。" },
      { w: "termination", ipa: "/ˌtɜːrmɪˈneɪʃn/", pos: "n.", cn: "终止（合同的解除）", ex: "Either party may terminate with 30 days' written notice for a material breach.", exCn: "任一方对实质性违约可提前 30 天书面通知终止合同。" },
      { w: "nonperformance", ipa: "/ˌnɑːnpəˈfɔːməns/", pos: "n.", cn: "不履行（未按约履行）", ex: "We will not accept the goods after such continued nonperformance by the supplier.", exCn: "在供应商如此持续不履行后，我们将不再收货。" },
      { w: "warranty", ipa: "/ˈwɑːrənti/", pos: "n.", cn: "保证、担保（warranty）", ex: "We warrant the film is free from defects for 12 months from the date of shipment.", exCn: "我们保证该薄膜自装运之日起 12 个月内无缺陷。" },
      { w: "remedy", ipa: "/ˈremədi/", pos: "n.", cn: "救济（违约后的补偿手段）", ex: "The buyer's only remedy under this clause is replacement of the non-conforming film.", exCn: "依本条，买方唯一的救济是更换不合格薄膜。" },
      { w: "waiver", ipa: "/ˈweɪvər/", pos: "n.", cn: "弃权（放弃某项权利）", ex: "No waiver of any breach shall be deemed a waiver of any later breach.", exCn: "对任何违约的弃权不应被视为对后续违约的弃权。" },
      { w: "confidentiality", ipa: "/ˌkɑːnfɪˌdenʃiˈæləti/", pos: "n.", cn: "保密性（保密条款）", ex: "Both parties shall keep the formula and pricing strictly confidential for five years.", exCn: "双方应在五年内对配方与价格严格保密。" },
      { w: "notice", ipa: "/ˈnoʊtɪs/", pos: "n.", cn: "通知（正式通知）", ex: "Any notice must be given in writing and sent to the registered address of the other party.", exCn: "任何通知须以书面形式发送至对方注册地址。" },
      { w: "amendment", ipa: "/əˈmendmənt/", pos: "n.", cn: "修订（合同修改）", ex: "The amendment to the quantity and price was signed by both parties yesterday.", exCn: "关于数量与价格的修订昨日由双方签署。" },
      { w: "compliance", ipa: "/kəmˈplaɪəns/", pos: "n.", cn: "合规（符合法规要求）", ex: "Please confirm compliance with the local food-contact regulations for your market.", exCn: "请确认产品符合目标市场的食品接触法规。" },
      { w: "declaration of conformity", ipa: "/ˌdekləˈreɪʃn əv kənˈfɔːməti/", pos: "n.", cn: "符合性声明（DoC）", ex: "We will provide a declaration of conformity for the CE-marked laminated films.", exCn: "我们将为打 CE 标志的复合膜提供符合性声明。" },
      { w: "food contact material", ipa: "/ˌfuːd ˈkɑːntækt məˈtɪəriəl/", pos: "n.", cn: "食品接触材料", ex: "As a food contact material, the adhesive must meet the migration limits of Regulation 1935/2004.", exCn: "作为食品接触材料，该复合胶须符合 1935/2004 法规的迁移限量。" },
      { w: "migration test", ipa: "/maɪˈɡreɪʃn test/", pos: "n.", cn: "迁移测试（物质向食品迁移量）", ex: "The migration test showed the total migration is well below the limit.", exCn: "迁移测试显示总迁移量远低于限量。" },
      { w: "CE marking", ipa: "/ˌsiː ˈiː ˈmɑːrkɪŋ/", pos: "n.", cn: "CE 标志（欧盟合规标志）", ex: "The pouches carry the CE marking only where the relevant directive applies.", exCn: "只有在相关指令适用时才给袋子打 CE 标志。" },
      { w: "UKCA marking", ipa: "/ˌjuː keɪ siː ˈeɪ ˈmɑːrkɪŋ/", pos: "n.", cn: "UKCA 标志（英国合格评定标志）", ex: "For Great Britain we switch from CE to the UKCA marking on the packaging.", exCn: "针对英国市场，我们在包装上由 CE 改为 UKCA 标志。" },
      { w: "FCC", ipa: "/ˌef siː ˈsiː/", pos: "n.", cn: "美国联邦通信委员会认证（电子类）", ex: "The printer's controller may require FCC authorization before import into the US.", exCn: "打印机的控制器在进入美国前可能需要 FCC 授权。" },
      { w: "FDA", ipa: "/ˌef diː ˈeɪ/", pos: "n.", cn: "美国食品药品监督管理局（食品接触合规）", ex: "The adhesive complies with the FDA food-contact requirements in 21 CFR 175.105.", exCn: "该复合胶符合 FDA 21 CFR 175.105 食品接触要求。" },
      { w: "REACH", ipa: "/riːtʃ/", pos: "n.", cn: "欧盟化学品注册、评估、授权和限制法规", ex: "We confirm the adhesive contains no SVHC above the 0.1% threshold under REACH.", exCn: "我们确认该复合胶不含 REACH 下超过 0.1% 阈值的 SVHC 物质。" },
      { w: "SVHC", ipa: "/ˌes viː eɪtʃ ˈsiː/", pos: "n.", cn: "高度关注物质（Substances of Very High Concern）", ex: "The buyer requested evidence that no SVHC is present in the printing ink.", exCn: "买方要求提供油墨中不含高度关注物质的证据。" },
      { w: "RoHS", ipa: "/roʊ ˌeɪtʃ ˈes/", pos: "n.", cn: "有害物质限制指令（限制铅汞镉等）", ex: "The heating element is RoHS compliant, which we can prove by the test report.", exCn: "该加热元件符合 RoHS，可由检测报告证明。" },
      { w: "phthalate", ipa: "/ˈθæleɪt/", pos: "n.", cn: "邻苯二甲酸酯（增塑剂）", ex: "We use non-phthalate plasticizers to keep the film suitable for food contact.", exCn: "我们使用不含邻苯二甲酸酯的增塑剂，使薄膜适合食品接触。" },
      { w: "certificate of analysis", ipa: "/səˌtɪfɪkət əv əˈnæləsɪs/", pos: "n.", cn: "分析证书（CoA，批次检验报告）", ex: "Each batch of adhesive is shipped with a certificate of analysis covering solid content and viscosity.", exCn: "每批复合胶都随附覆盖固含量与粘度的分析证书。" },
      { w: "material safety data sheet", ipa: "/məˌtɪəriəl ˈseɪfti ˈdeɪtə ʃiːt/", pos: "n.", cn: "材料安全数据表（MSDS）", ex: "Please send the MSDS for the solvent-based adhesive before we arrange carriage.", exCn: "请在安排运输前寄送溶剂型复合胶的材料安全数据表。" },
      { w: "test report", ipa: "/test rɪˈpɔːrt/", pos: "n.", cn: "检测报告", ex: "We can provide the third-party test report for migration and tensile strength if needed.", exCn: "如有需要，我们可提供第三方关于迁移与拉伸强度的检测报告。" }
    ],
    phrases: [
      { p: "be governed by the laws of", cn: "适用于……法律", ex: "This contract is governed by the laws of China.", exCn: "本合同适用中国法律。" },
      { p: "subject to", cn: "受制于、以……为准", ex: "The price is subject to the final quotation confirmed in writing.", exCn: "价格以书面确认的最终报价为准。" },
      { p: "in the event of", cn: "若发生……", ex: "In the event of late delivery, the buyer may claim liquidated damages.", exCn: "若发生迟延交货，买方可主张约定损害赔偿。" },
      { p: "at the buyer's option", cn: "由买方选择", ex: "Replacement or a refund is at the buyer's option for the defective pouches.", exCn: "对有缺陷的袋子，换货或退款由买方选择。" },
      { p: "within 30 days of", cn: "在……起 30 天内", ex: "The buyer must file any claim within 30 days of receipt of the goods.", exCn: "买方须在收货后 30 天内提出任何索赔。" },
      { p: "mutual agreement", cn: "双方协议", ex: "The terms were revised by mutual agreement.", exCn: "条款经双方协议修订。" }
    ],
    dialogues: [
      {
        title: "处理质量索赔（风险与合规）",
        lines: [
          { sp: "A", en: "We received the delivery, but 3% of the stand-up pouches show seal leakage.", cn: "我们收到了货，但 3% 的站立袋有封口漏液。" },
          { sp: "B", en: "I'm sorry to hear that. Please send us the test report and photos so we can confirm the defect.", cn: "很抱歉听到这个。请把检测报告和照片发我们，以便确认缺陷。" },
          { sp: "A", en: "We'll send them today. Under the contract, are we entitled to a replacement?", cn: "我们今天发。按合同，我们是否有权要求换货？" },
          { sp: "B", en: "Yes, for the confirmed quantity. The seal strength should meet our internal 12 N/15 mm standard.", cn: "是的，对确认的数量如此。封口强度应满足我们内部 12 N/15 mm 的标准。" },
          { sp: "A", en: "Good. And please confirm the replacement film is food-contact compliant for the EU market.", cn: "好。也请确认更换的薄膜符合欧盟食品接触要求。" },
          { sp: "B", en: "We will provide the CE declaration and the migration test report for the new batch.", cn: "我们会为新批次提供 CE 符合性声明与迁移检测报告。" }
        ]
      }
    ],
    tips: [
      "签合同前先看清三块：违约与救济（谁来付、赔多少、怎么赔）、争议解决（协商→仲裁还是诉讼、在哪个机构、适用哪国法律）、以及无争议时的通知与保密义务。不要只看给了多少单价。",
      "仲裁通常比在外国法院诉讼更可控（费用、时效、可执行性）。写合同时尽量约成『先友好协商，再提交某指定仲裁委员会仲裁』，并写清沿用哪套规则。",
      "认证不可能『一个标志走天下』：CE 管欧盟、UKCA 管英国、FCC/UL 管美国。软包装还要盯食品接触的迁移限量（EU 1935/2004、美国 FDA），务必让供应商提供对应批次的 CoA、MSDS 与第三方检测报告，而不是一句『合规』了事。",
      "索赔要在合同约定期限内（常见 30 天）书面提出，附照片、检测报告和对应批号，证据链完整，否则容易被以『超出索赔期』为由拒绝。",
      "涉及 REACH 时，重点确认是否含 SVHC 超过 0.1%；涉及 RoHS 时确认限用物质（铅、汞、镉、六价铬等）。把『合规证据』写进采购订单和合同，才能事后追责。"
    ]
  });
})();
