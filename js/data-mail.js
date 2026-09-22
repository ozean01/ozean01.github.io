/* ============ 真实业务语料：按真实场景撰写的 8 封来信 ============
   ⚠️ 出处口径（诚实说明，勿删）：这 8 封是**按真实业务场景撰写的教学语料**，
      刻意保留了各语域特征（印式 / 中东 / 德式 / 美式 / 巴西 / 中式草稿），
      但它们**不是逐封可溯源的客户原件** —— 本站无法核验其「真实性」，
      请当「高质量仿真语料」使用；引用给客户看之前请自行判断适用性。

   由来（SLA 专家评审遗留项「补真实业务语料」）：
     站内已有 768 词 / 174 短语 / 28 段对话 + SOP 英文，但**全部是构造出来的教科书英文**：
     主谓一致、时态正确、句子完整、没有缩写、没有多余信息。
     学员在站内读得懂，一收到真实客户来信就卡住——因为真实的信件长这样：
       · 印度客户的 is having / do the needful，时态全乱但意思清楚；
       · 中东客户的 Please note / urgent，直接、急、信息塞在一段里；
       · 德国客户的 8D / retained samples，术语密度高、每句都是任务；
       · 美国客户的 mil / COF / letter of guaranty，单位与合规体系完全不同；
       · 巴西客户的 never we had problem，关系话术与真实诉求混在一起；
       · 一封 re: re: re: 的线程，**关键信息不在最新一封**；
       · 还有一份中式英语草稿——它语法全错，但真正的毛病是通篇没有具体信息。

   设计原则（刻意做小，架构不动）：
     1) **不新增导航、不新增路由**。整个语料挂进已有的「✍️ 写作专区」（#/write）里，
        因为真实工作流就是「读到一封来信 → 回一封」。
     2) 读完之后**复用既有引擎**：要点自查 / 二稿闭环 / AI 批改 / 保存作品全部照用，
        只是把「关键表达」换成这封信**真正要求你回答的事**（points）。
        另接两个既有出口：🃏 实词进 FSRS 单词卡、🎤 关键句进五阶段闯关。
     3) 每封信都给三层：
        gloss  逐句注释（含中式/印式/葡式英语的用法说明，以及更地道的改法 fix）
        traps  「这封信的坑」——真实业务里会因此报错价、答非所问、或直接得罪客户的地方
        drill  值得开口练的回信模板句（送进闯关用）
     数据是纯静态 JS，可继续增补；新增一封只需往 threads 里加一条。
*/
(function () {
  "use strict";
  if (typeof window === "undefined") return;

  window.FTE_MAIL = {
    v: 1,
    threads: [
      /* ------------------------------ 1 ------------------------------ */
      {
        id: "in-enquiry",
        icon: "🇮🇳",
        title: "印度客户首封询盘",
        who: "Indian converter · Mumbai（咖啡袋厂，直接用户）",
        tag: "询盘 · 缩写密集 · 印式英语",
        subject: "Enquiry for PET/AL/PE laminate - 3 layer - urgent",
        unitIds: [3, 11],
        body: [
          { k: "h", s: "From: purchase@vaibhavflex.in" },
          { k: "h", s: "Subject: Enquiry for PET/AL/PE laminate - 3 layer - urgent" },
          { k: "p", s: "Dear Sir," },
          { k: "p", s: "We are Vaibhav Flexibles, Mumbai. We are doing coffee pouches since 12 years." },
          { k: "p", s: "Kindly send your best rate for below:" },
          { k: "p", s: "1) PET 12 / AL 7 / PE 60 - 3 layer laminate" },
          { k: "p", s: "2) Width 1050 mm, qty approx 3000 kg / month" },
          { k: "p", s: "Also confirm MOQ, delivery and whether you can give FOB Nhava Sheva." },
          { k: "p", s: "We are having one doubt - your film is having FDA or not? Because our customer is exporting to UK. Kindly do the needful at the earliest." },
          { k: "p", s: "Awaiting your reply." },
          { k: "p", s: "Thanks and Regards,\nRohit Sharma\nVaibhav Flexibles Pvt Ltd" }
        ],
        gloss: [
          { t: "We are doing coffee pouches since 12 years.", cn: "印式英语高频时态：用现在进行时 + since 表「做了 12 年」。标准英语是 We have been making coffee pouches for 12 years。**读懂就行，别照着写。**" },
          { t: "Kindly send your best rate for below:", cn: "请报以下规格的最优价。below 后面省略冒号、直接接列表，是南亚商务信的常见写法。" },
          { t: "PET 12 / AL 7 / PE 60", cn: "12μm PET 面材 + 7μm 铝箔 + 60μm PE 热封层。行业报结构时**省略 μm**是惯例；PE 60 指的是热封层厚度。" },
          { t: "qty approx 3000 kg / month", cn: "数量约每月 3000 公斤。qty = quantity，approx = approximately，缩写密度是印式商务信的标志。" },
          { t: "We are having one doubt", cn: "我们有一个疑问。印度英语用 are having 表「有」，是固定说法，不表示「正在拥有」。" },
          { t: "your film is having FDA or not?", cn: "你们这款膜有没有 FDA 认证。is having … or not 是印式疑问句式（= does your film have FDA?）。" },
          { t: "Kindly do the needful at the earliest.", cn: "请尽快把该办的事办了。**这是印度商务英语的标志性说法**，几乎每封都有。语气是礼貌催促，不是敷衍。" },
          { t: "FOB Nhava Sheva", cn: "那瓦舍瓦（孟买新港）FOB。Nhava Sheva 是印度最大集装箱港，缩写 JNPT。" }
        ],
        traps: [
          { t: "「do the needful」不是一句空话", cn: "它指的是**上面列出来的那几件具体事**——给最优价、确认 MOQ、确认交期、回答 FDA、确认能否做到 FOB Nhava Sheva。如果回信只写 We will do the needful，等于一个问题都没回答，客户会立刻转去问下一家。" },
          { t: "「your film is having FDA or not」问的是产品，不是公司", cn: "他问的是**这款膜**能不能用于食品接触，不是「你们公司有没有 FDA 证书」。回信要落到具体法规条文（常温 PET/PE 结构：**21 CFR 175.300** 涂层与胶粘剂 + **177.1520** 烯烃聚合物（PE 热封层）/ **177.1630**（PET））与**原材料合规声明 / 保函**上。答「我们有 FDA 证书」会被 QA 直接退档。详见下方 gloss 里 177.1390 的辨析——**引错章节比不引更糟**。" },
          { t: "PE 60 到底是哪一层？", cn: "这是真实业务里**最容易报错价的一处**：12/7/60 可能是「面材 12、铝箔 7、热封层 60，总厚 79μm」，也可能是「总厚 60」。两者用料差 25% 以上。回信必须先复述确认（如 please confirm the PE sealant layer is 60μm and the total structure is 79μm），再报价。" },
          { t: "FOB Nhava Sheva 是他的期望，不是你的条件", cn: "若你只能做 FOB 宁波/上海，不要沉默地改掉——要点明并给替代方案（如 FOB Ningbo + 到 Nhava Sheva 的海运费参考），否则他拿到报价会发现术语不对，直接弃用。" }
        ],
        drill: [
          { en: "Thank you for your enquiry for the three-layer PET/AL/PE laminate.", cn: "感谢您对三层 PET/AL/PE 复合膜的询盘。" },
          { en: "Our MOQ for this structure is 500 kg per width, and the lead time is 25 days after artwork approval.", cn: "该结构的最小起订量是每个门幅 500 公斤，确认稿件后交期 25 天。" },
          { en: "The PE sealant layer complies with FDA 21 CFR 177.1520 and the adhesive with 21 CFR 175.300; we can issue a food contact declaration.", cn: "PE 热封层符合 FDA 21 CFR 177.1520，胶粘剂符合 21 CFR 175.300，我们可以出具食品接触合规声明。" },
          { en: "Could you please confirm whether the 60μm refers to the PE sealant layer, so that we can quote the correct structure?", cn: "能否确认 60μm 指的是 PE 热封层？这样我们才能按正确结构报价。" }
        ],
        points: [
          { t: "Thank you for your enquiry", cn: "先接住询盘" },
          { t: "MOQ", cn: "最小起订量" },
          { t: "lead time", cn: "交期" },
          { t: "confirm", cn: "复述确认结构" },
          { t: "sealant layer", cn: "热封层（点明 PE 60 是哪一层）" },
          { t: "FDA", cn: "回答食品接触合规" },
          { t: "food contact", cn: "食品接触声明" },
          { t: "FOB", cn: "回应贸易术语" },
          { t: "total thickness", cn: "给总厚度" }
        ],
        task: "用英文回这封信：确认结构与总厚度；报出 MOQ、交期与价格（价格可写 XX 占位）；回答 FDA 食品接触合规并说明会出具什么文件；回应 FOB 港口；最后用一句话把下一步定死（比如请他确认结构后我们出正式报价单）。"
      },

      /* ------------------------------ 2 ------------------------------ */
      {
        id: "ae-chase",
        icon: "🇦🇪",
        title: "阿联酋客户催货 + 临时改规格",
        who: "UAE trading company · Dubai（供大卖场渠道）",
        tag: "催货 · 变更 · 中东英语",
        subject: "URGENT - our PO 4471 - need to change the bag size",
        unitIds: [7, 12],
        body: [
          { k: "p", s: "Hi," },
          { k: "p", s: "Please note our PO 4471 was supposed to load this week but we did not receive any update from your side." },
          { k: "p", s: "Also we need to change the bag size. Our customer wants 250g instead of 500g. Same material, same print, only the size will change." },
          { k: "p", s: "Please confirm if this is possible without changing the price, and send us the new artwork layout today if possible." },
          { k: "p", s: "We are under pressure from the hypermarket, they are waiting." },
          { k: "p", s: "Best regards,\nKhalid" }
        ],
        gloss: [
          { t: "Please note", cn: "请注意。中东商务信几乎固定用 Please note 开头，**不是责备语气**，只是提醒。" },
          { t: "was supposed to load this week", cn: "本该这周装柜。be supposed to 表「原定应该」，这里隐含了不满。" },
          { t: "we did not receive any update from your side", cn: "我们没收到你们那边的任何进展。from your side 是委婉的「你们」，先把责任说得不刺人——这是客户在给你台阶。" },
          { t: "Same material, same print, only the size will change.", cn: "同材质、同印刷，只改尺寸。**这句话是他的一厢情愿，是这封信最大的坑。**" },
          { t: "the new artwork layout", cn: "新版印刷稿。artwork = 印前稿/图案设计稿；layout = 版面排布。" },
          { t: "We are under pressure from the hypermarket", cn: "我们被大卖场那边压着。hypermarket = 大卖场（家乐福/露露等），是中东零售主渠道。" }
        ],
        traps: [
          { t: "「without changing the price」不能直接答应", cn: "袋子从 500g 改到 250g，**面积变了，用料就变了**。价格通常按面积/克重算，250g 袋单只用料少、但**单位面积的加工成本反而升高**（换版、开机损耗分摊到更少的米数上）。正解：说明会重新核算并给新价，同时解释为什么不能同价——而不是先答应了再涨价。" },
          { t: "「same print」不等于不用花钱", cn: "同图案，但**袋宽变了 → 印刷版辊的周长必须换**，这是整个变更里最贵的一项（制版费）。真实业务里先问一句：是否沿用同一支版辊？如果尺寸变化在设计容差内可以不改版，那就便宜很多。" },
          { t: "「send today」要先分清谁做稿", cn: "artwork layout 是**他们提供设计**还是**你们代做**？如果由你们设计，这是一项额外服务、需要工时；直接答应 today 会做不出来。正解：先确认稿源，再给一个做得到的时点。" },
          { t: "催货与变更混在一封里，回信必须分开答", cn: "第一段是**交期**（PO 4471 为什么没动静），第二段是**变更**（能不能改）。这两件事的结论可能互相冲突（改规格会推迟交期）。回信分两段答，并明确「若改规格，原船期是否还赶得上」——这才是他真正要的答案。" }
        ],
        drill: [
          { en: "Apologies for the delay in updating you on PO 4471.", cn: "抱歉没有及时向您汇报 PO 4471 的进展。" },
          { en: "Changing the bag from 500g to 250g requires a new printing cylinder, since the repeat length will change.", cn: "从 500g 改为 250g 需要重新制版，因为印刷版辊的周长会变。" },
          { en: "We can hold the original price only if the existing cylinder can still be used; otherwise a one-off plate cost applies.", cn: "只有沿用现有版辊才能维持原价，否则会产生一次性制版费。" },
          { en: "Please confirm the bag width and the artwork source today, and we will revert with the new cost and the revised ETD.", cn: "请今天确认袋宽与稿件来源，我们会回复新成本与修订后的预计开船日。" }
        ],
        points: [
          { t: "Apologies", cn: "先认延迟" },
          { t: "PO 4471", cn: "指名订单号" },
          { t: "cylinder", cn: "说明版辊/制版" },
          { t: "repeat length", cn: "点出版长变化" },
          { t: "artwork", cn: "回应稿件" },
          { t: "confirm", cn: "要求确认" },
          { t: "ETD", cn: "给新船期" },
          { t: "cost", cn: "给新报价而非空口答应" }
        ],
        task: "用英文回这封信：① 为 PO 4471 没及时同步进展道歉，并说明当前状态与新 ETD；② 说明改尺寸必然涉及版辊/版长变化，因此不能保证同价，给出「若沿用现有版辊则可维持原价」的条件；③ 问清袋宽、稿件由谁提供；④ 明确改规格后原船期是否可行。"
      },

      /* ------------------------------ 3 ------------------------------ */
      {
        id: "de-claim",
        icon: "🇩🇪",
        title: "德国客户脱层客诉（要 8D）",
        who: "German converter · North Rhine-Westphalia（食品品牌一级供应商）",
        tag: "质量客诉 · 体系术语 · 德式英语",
        subject: "Quality complaint - PO 4412 - delamination after 6 weeks",
        unitIds: [9, 11, 17],
        body: [
          { k: "p", s: "Dear Mr. Wang," },
          { k: "p", s: "We have to inform you that we detected delamination on the pouches made from PO 4412." },
          { k: "p", s: "The film was processed on our VFFS line 3 weeks after receipt, under the conditions we agreed. After six weeks of storage at 23 °C / 50 % RH, we found separation between the PET and the aluminium layer on approximately 12 % of the pouches. Photos and the affected reel numbers are attached." },
          { k: "p", s: "We need from you:" },
          { k: "p", s: "1. A written root cause analysis, 8D format\n2. The retained samples of the affected reels for our own testing\n3. A statement whether the adhesive used was solvent-free and, if so, the coating weight" },
          { k: "p", s: "Please treat this as priority. Until we have your analysis we will hold the remaining stock." },
          { k: "p", s: "Mit freundlichen Grüßen / Best regards,\nSabine Krüger" }
        ],
        gloss: [
          { t: "We have to inform you that", cn: "我们不得不通知您。德语区商务信的固定分寸感：内容很硬，措辞克制。**不是敌意。**" },
          { t: "VFFS line", cn: "立式成型填充封口机（Vertical Form Fill Seal）。制袋厂的核心设备，客户提这个是在说明「制袋工序没问题，问题在膜」。" },
          { t: "23 °C / 50 % RH", cn: "23 摄氏度 / 50% 相对湿度。这是**标准测试条件**（RH = relative humidity）。客户特意写出条件，是在强调「我们是按规范存放的」，即**排除自己一方的原因**。" },
          { t: "3 weeks after receipt", cn: "收货后 3 周才上机。这个时间点很关键，见「坑」。" },
          { t: "separation between the PET and the aluminium layer", cn: "PET 与铝箔之间分离。注意不是 PE 层脱层——**脱层的层位决定了根本原因方向**（面材/铝箔之间通常是胶水或熟化问题）。" },
          { t: "8D format", cn: "8 Disciplines，制造业标准的问题解决八步框架（团队/问题描述/临时对策/根本原因/纠正措施/验证/预防/关闭）。**不是「写八条」。**" },
          { t: "retained samples", cn: "留样（每批出货留存的样品）。客户要留样是为了自己做对比测试。" },
          { t: "the coating weight", cn: "涂布克重（上胶量，通常 g/m² 或 gsm）。这是复合膜最核心的工艺参数之一。" },
          { t: "we will hold the remaining stock", cn: "剩余库存我们先扣住不出。**也可能是暂停付款的委婉说法**，见「坑」。" }
        ],
        traps: [
          { t: "8D 不是八条意见，要给框架", cn: "客户点名 8D，回信若只是「我们会调查」，等于没给。第一封回信至少要先落 **D3 临时对策**（containment）——例如：立即冻结同批留样、通知同类客户停用、提供替换批次的交期。**这才是客户当下真正需要的**，根本原因可以后补。" },
          { t: "「hold the remaining stock」可能意味着停付款", cn: "扣货与扣款在德语区客户那里经常同时发生。回信应主动澄清：剩余的未结货款如何处理、是否影响后续订单。**不要假装没看见这句**——拖到对方正式发函，性质就变了。" },
          { t: "「3 weeks after receipt」是线索，不是甩锅的理由", cn: "膜卷收货后放置 3 周才制袋，若环境湿度高，面材（PET）吸湿会影响复合牢度——这在技术上确实是常见诱因。**但绝不能在调查前把责任推给客户**。正解：把这条写成「需要核实的变量」，同时索取那 3 周的仓储温湿度记录与制袋工艺参数（胶水配比、熟化时间与温度）。" },
          { t: "「12 %」是比例，客户要的是数量", cn: "12% 只是比例。德国客户的客户是食品品牌，**他需要向自己的客户交代「影响多少只袋子、如何补货」**。回信要主动把 12% 换算成多少公斤/多少米/多少只，并给出补货方案——这一步做了，客户关系反而会变好。" },
          { t: "三个要求要逐条回应，不能只答一半", cn: "8D 书面分析、寄留样、胶水是否无溶剂及涂布克重——这三条是并列的清单。回信要**编号逐条回**，并给每条的时点。漏掉「寄留样」这种看似简单的项，是真实客诉里最常见的失分点。" }
        ],
        drill: [
          { en: "Thank you for the detailed report; we take this complaint very seriously.", cn: "感谢详尽反馈，我们非常重视这一客诉。" },
          { en: "As an immediate containment action, we have frozen all retained samples of the affected reels and started a batch trace.", cn: "作为临时对策，我们已冻结相关卷的留样并发起批次追溯。" },
          { en: "Could you send us the storage temperature and humidity records for the three weeks before lamination?", cn: "能否提供制袋前那三周的仓储温湿度记录？" },
          { en: "The adhesive is solvent-free; the nominal coating weight is 2.5 g/m², and we will confirm the actual value from the line records.", cn: "所用胶水为无溶剂型，标称涂布克重 2.5 g/m²，实际值我们会从产线记录核实后确认。" },
          { en: "You will receive the full 8D report within 10 working days, with the D3 containment already in place.", cn: "完整 8D 报告将于 10 个工作日内提交，其中 D3 临时对策已先执行。" }
        ],
        points: [
          { t: "take this complaint very seriously", cn: "先表态重视" },
          { t: "containment", cn: "给临时对策（D3）" },
          { t: "retained samples", cn: "回应留样" },
          { t: "batch", cn: "批次追溯" },
          { t: "solvent-free", cn: "回答胶水类型" },
          { t: "coating weight", cn: "给涂布克重" },
          { t: "8D", cn: "承诺 8D 报告" },
          { t: "working days", cn: "给明确时点" },
          { t: "replace", cn: "给补货方案" }
        ],
        task: "用英文回这封客诉：① 表态重视并给出 D3 临时对策（冻结留样、批次追溯、必要时通知同类客户）；② 逐条回应他的三项要求并各给时点；③ 说明胶水为无溶剂型并给出标称涂布克重（实际值后续核实）；④ 把 12% 换算成数量、给出补货或退换方案；⑤ 主动问清未结货款与后续订单的处理方式。"
      },

      /* ------------------------------ 4 ------------------------------ */
      {
        id: "us-tech",
        icon: "🇺🇸",
        title: "美国客户下单前的技术清单",
        who: "US snack producer · Midwest（食品厂，直接用户）",
        tag: "技术问答 · 美制单位 · 合规文件",
        subject: "Questions before we release the PO (PET/PE, 1.5 mil)",
        unitIds: [17, 18],
        body: [
          { k: "p", s: "Hi there," },
          { k: "p", s: "Thanks for the samples - the seal looked good on our lab sealer." },
          { k: "p", s: "Before we cut the PO, a few things our QA needs on file:" },
          { k: "p", s: "- TDS for the structure\n- COA, per lot\n- Is the sealant layer compliant under 21 CFR 177.1520 for fatty foods, and is the adhesive covered by 21 CFR 175.300? Can you issue a letter of guaranty?\n- What is the WVTR and OTR? We need it at 100 °F / 90 % RH, not at the standard condition.\n- What is the COF on the outside so it runs on our f/f/s?\n- Shelf life and storage conditions for the rolls" },
          { k: "p", s: "Our line runs at 60 pouches/min, so please advise on the slip and the anti-block." },
          { k: "p", s: "Please advise." },
          { k: "p", s: "Thanks,\nDoug Petrakis\nDoug Petrakis | Procurement\nMidwest Snack Co." }
        ],
        gloss: [
          { t: "1.5 mil", cn: "1.5 密耳 = 约 **38 μm**。美国习惯用 mil（千分之一英寸）而不是微米。**这个换算必须张口就来**，否则整个技术沟通都对不上。" },
          { t: "before we cut the PO", cn: "在我们开订单之前。cut a PO = 开出采购订单，美式说法。" },
          { t: "our QA needs on file", cn: "我们质检部门需要归档备查。on file = 存档。这句在说「不给文件就不下单」。" },
          { t: "TDS", cn: "Technical Data Sheet，技术数据表（典型值：厚度、克重、COF、WVTR/OTR、抗拉、热封参数）。" },
          { t: "COA, per lot", cn: "Certificate of Analysis，每批次的出厂检验报告。注意 per lot 是**每批都要**，不是给一次就完。" },
          { t: "letter of guaranty", cn: "保函 / 合规担保函。美国食品接触材料常用，**法律效力比欧洲的 DoC 更强**——通常要公司名义签发，业务员不能自己出。" },
          { t: "WVTR and OTR", cn: "水蒸气透过率（Water Vapor Transmission Rate）与氧气透过率（Oxygen Transmission Rate）。阻隔性能的两个核心指标。" },
          { t: "100 °F / 90 % RH, not at the standard condition", cn: "100 华氏度（约 38 °C）/ 90% 相对湿度，**不是标准条件**。高湿高温下阻隔数值会明显变差——客户特意强调，是在提醒你**别拿标准条件的数据糊弄**。" },
          { t: "COF on the outside", cn: "外层摩擦系数（Coefficient of Friction）。膜卷外层太滑跑机会跑偏，太涩会走不动，是设备适性的关键。" },
          { t: "so it runs on our f/f/s", cn: "好让它在我们的成型填充封口机上跑得顺。f/f/s = form-fill-seal。" },
          { t: "the slip and the anti-block", cn: "滑爽性与抗粘连。slip 决定走机顺不顺，anti-block 决定膜卷会不会粘在一起揭不开。" },
          { t: "21 CFR 177.1390 ≠ 常温结构（最容易张冠李戴的一处）", cn: "**177.1390 的正式标题是“Laminate structures for use at temperatures of 250 °F and above”，只适用于 121 °C 以上的蒸煮层压结构。** 常温零食袋（如本信的 PET/PE 1.5 mil）应引 **177.1520**（烯烃聚合物，PE 热封层）+ **175.300**（涂层与胶粘剂），PET 另有 **177.1630**。客户口头问 177.1390 时，正确做法是**先答对条、再点明适用范围**（例如：for a retort structure we would cite 177.1390; for this ambient structure it is 177.1520 + 175.300）——引错章节会让对方的 QA 直接怀疑你的合规文件。" },
          { t: "Please advise.", cn: "请指示/请答复。美式邮件最高频的收尾，等于「等你回话」。**不是客套，是真的在等。**" }
        ],
        traps: [
          { t: "阻隔数据必须带测试条件", cn: "客户明确要 100 °F / 90 % RH 下的数值。**拿 23 °C / 50 % RH 的标准值交差，会被 QA 直接退档**——这是美国客户最常见的退档原因。如果手上只有标准条件的数据，正解是：附标准值 + 说明测试条件 + 承诺按客户条件送第三方测试并给时点。" },
          { t: "letter of guaranty 不能业务员自己签", cn: "这是**有法律责任的担保文件**。回信要说明由哪个部门签发、需要什么材料、多久能给，而不是「好的我们提供」。真实业务里业务员擅自出具保函，出事是个人责任。" },
          { t: "1.5 mil 换算错一步，整封信都崩", cn: "1.5 mil ≈ 38 μm。若答成 1.5 mm 或 150 μm，客户会立刻判断你不专业。同理：他把 60 pouches/min 说出来，是在**暗示样品可能跑不快**——真正要正面回答的是开口性/滑爽，而不是把 COF 数字一贴了事。" },
          { t: "shelf life 要给数字", cn: "「shelf life and storage conditions for the rolls」必须落到具体数值，例如：12 个月（未开封）、≤ 30 °C、避免阳光直射、膜卷直立存放、开封后 7 天内用完。写 long 或 good 等于没答。" },
          { t: "六项清单要编号逐条回", cn: "TDS / COA / 合规 / 阻隔 / COF / 有效期——客户用项目符号列出来，就是希望**编号对应回复**。逐条答清楚，比写一封漂亮的信有用得多。这在美式商务沟通里是基本礼节。" }
        ],
        drill: [
          { en: "Attached is the TDS for the PET/PE structure; COA will be issued per lot.", cn: "随附 PET/PE 结构的 TDS，COA 将按批次出具。" },
          { en: "The PE sealant layer complies with 21 CFR 177.1520 for fatty foods and the adhesive with 21 CFR 175.300, and our QA department can issue a letter of guaranty within five working days.", cn: "PE 热封层符合 21 CFR 177.1520（适用于油脂类食品），胶粘剂符合 21 CFR 175.300，我司质检部门可在五个工作日内出具保函。" },
          { en: "Our standard WVTR value is measured at 38 °C / 90 % RH, which is close to the condition you specified.", cn: "我们的水蒸气透过率标准值是在 38 摄氏度 / 90% 相对湿度下测得的，与您指定的条件接近。" },
          { en: "The outside COF is 0.28 kinetic, which runs cleanly on high-speed f/f/s equipment.", cn: "外层动摩擦系数为 0.28，可在高速成型填充封口机上顺畅运行。" },
          { en: "Regarding the storage, the rolls should be kept upright below 30 °C and used within 12 months of production.", cn: "关于存放：膜卷应直立存放于 30 摄氏度以下，并在生产后 12 个月内使用。" }
        ],
        points: [
          { t: "TDS", cn: "给技术数据表" },
          { t: "COA", cn: "确认按批出报告" },
          { t: "21 CFR", cn: "接住法规编号" },
          { t: "letter of guaranty", cn: "说明由谁签发" },
          { t: "WVTR", cn: "回答阻隔" },
          { t: "OTR", cn: "回答透氧" },
          { t: "COF", cn: "给摩擦系数" },
          { t: "f/f/s", cn: "点明设备适性" },
          { t: "shelf life", cn: "给存放期数字" },
          { t: "working days", cn: "给文件时点" }
        ],
        task: "用英文回这封技术清单：**编号逐条**回答他的六项要求（TDS 随附、COA 按批、合规与保函由质检部门签发并给时点、阻隔数据带测试条件、外层 COF 数值、存放条件给具体数字）；正面回应 60 pouches/min 的滑爽与抗粘连；把 1.5 mil 换算成微米复述一遍以示专业；结尾给出下一步（何时发正式报价单 / 样品）。"
      },

      /* ------------------------------ 5 ------------------------------ */
      {
        id: "br-payment",
        icon: "🇧🇷",
        title: "巴西客户谈账期",
        who: "Brazilian distributor · São Paulo（经销商）",
        tag: "付款条件 · 关系话术 · 绕",
        subject: "Re: PO 4490 - payment terms",
        unitIds: [6, 15],
        body: [
          { k: "p", s: "Dear friend," },
          { k: "p", s: "Thank you for the proforma. We are very happy with the price." },
          { k: "p", s: "We need to speak about the payment. Our company is working with 90 days after arrival, this is normal here in Brazil for all our suppliers." },
          { k: "p", s: "I know you asked for 30% deposit and balance against copy of B/L, but for us it is difficult now because the exchange is not good and the bank is charging a lot." },
          { k: "p", s: "Maybe we can do 60 days? We are a serious company, we are buying from you since long time and never we had problem." },
          { k: "p", s: "Please understand our situation." },
          { k: "p", s: "Abraços,\nCarlos" }
        ],
        gloss: [
          { t: "the proforma", cn: "形式发票（Proforma Invoice，PI）。客户拿它去开信用证或办进口许可。" },
          { t: "90 days after arrival", cn: "**到港后** 90 天付款。注意不是 after B/L date（开船后）——两者差一整个航程。" },
          { t: "balance against copy of B/L", cn: "余款见提单副本付款。比见正本宽松，比赊销安全，是中间档。" },
          { t: "the exchange is not good", cn: "汇率不好。指雷亚尔贬值，买方换汇成本上升——这是真实的付款拖延诱因。" },
          { t: "the bank is charging a lot", cn: "银行收费太高。巴西的进口融资与开证成本确实偏高。" },
          { t: "we are buying from you since long time", cn: "我们跟你买很久了。巴西英语常见时态（= we have been buying），不必纠正。" },
          { t: "never we had problem", cn: "我们从没出过问题。倒装是葡萄牙语影响（葡语否定词前置会触发倒装），属于**母语迁移**，读懂即可。" },
          { t: "Abraços", cn: "葡萄牙语「拥抱」，用在商务信结尾相当于 Best regards，说明关系已经很近。" },
          { t: "Please understand our situation.", cn: "请体谅我们的处境。这是关系导向文化里的**请求让步信号**，不等于最后通牒。" }
        ],
        traps: [
          { t: "after arrival 与 after B/L date 差一个航程", cn: "到巴西的航程通常 30-40 天。他说的「90 天」若按到港算，实际等于**开船后 120-130 天**。谈判时必须把口径钉死写进合同：是 after B/L date 还是 after arrival。这一句之差，就是几万美元的资金占用。" },
          { t: "「never we had problem」是关系话术，不是信用证明", cn: "不能拿它当风控依据。真正要看的是他的付款历史、有没有信用保险、能不能开证。正解：**先把关系接住**（表达我们同样重视长期合作），再给结构性方案——而不是直接让步。" },
          { t: "直接说 no 会伤关系", cn: "巴西商务文化里，生硬拒绝等于否定对方个人。要用 **We understand … however, our best possible is …** 的结构：认可处境、说明自己的约束、给出你能做到的最好条件。这不只是礼貌，是成交概率问题。" },
          { t: "usance L/C 是被忽略的成交点", cn: "双方的难处都是真的：他要账期，你要安全。**60 天远期信用证（usance L/C at 60 days）**能同时满足——对你有银行信用，对他不占即期额度。真实业务里这是最可能的落点，比在「90 天还是 30 天」上僵持有效得多。" },
          { t: "让步要给条件，不要白给", cn: "账期是可以换的：换更大的量、换更长的合作期限、换承担运费/保险、换接受分批发货。白给账期等于把自己的现金流送给对方，而且**下次他不会觉得这是让步，只觉得这是底价**。" }
        ],
        drill: [
          { en: "We understand the pressure from the exchange rate and the banking costs in Brazil.", cn: "我们理解贵方在汇率与银行成本上的压力。" },
          { en: "However, our standard terms are 30 % deposit with the balance against copy of B/L.", cn: "不过我们的标准条件是 30% 定金、余款见提单副本。" },
          { en: "As an alternative, we could accept a usance letter of credit at 60 days, which gives you the credit period without using your cash line.", cn: "另一种方案是接受 60 天远期信用证，这样您能获得账期又不占用现金额度。" },
          { en: "Just to be clear, could you confirm whether the 90 days is counted from the B/L date or from arrival?", cn: "为免误解，能否确认 90 天是从提单日起算还是从到港日起算？" },
          { en: "We value this relationship and would like to find a structure that works for both sides.", cn: "我们珍视这段合作，希望找到一个双方都可行的方案。" }
        ],
        points: [
          { t: "We understand", cn: "先接住对方的处境" },
          { t: "However", cn: "再说明自己的条件" },
          { t: "deposit", cn: "重申定金要求" },
          { t: "copy of B/L", cn: "重申余款条件" },
          { t: "letter of credit", cn: "提出信用证替代方案" },
          { t: "usance", cn: "点明远期" },
          { t: "60 days", cn: "给出具体天数" },
          { t: "confirm", cn: "把口径问清" },
          { t: "relationship", cn: "收尾保关系" }
        ],
        task: "用英文回这封信：① 理解他的汇率与银行成本压力（先接关系）；② 说明我方标准条件与约束；③ 提出一个**结构性替代方案**（如 60 天远期信用证，或加量换账期）；④ 把「90 天」的起算口径问死（B/L date 还是 arrival）；⑤ 结尾表达长期合作意愿。注意全程不要出现生硬的 no。"
      },

      /* ------------------------------ 6 ------------------------------ */
      {
        id: "tr-price",
        icon: "🇹🇷",
        title: "土耳其客户压价",
        who: "Turkish trader · Istanbul（贸易商，比价中）",
        tag: "砍价 · 未来承诺 · 双重让利",
        subject: "PRICE",
        unitIds: [3, 5],
        body: [
          { k: "p", s: "Dear Sir," },
          { k: "p", s: "We received your offer 1.86 USD/kg CIF Istanbul. Our target is 1.62." },
          { k: "p", s: "Your competitor from China is giving 1.68 with same structure PET 12/PE 70. We want to continue with you but the price must be workable." },
          { k: "p", s: "Please give your best price and we can give you big order, maybe 20 tons per month. Also we need 60 days credit." },
          { k: "p", s: "We are talking with two other suppliers also, so please understand we must compare." },
          { k: "p", s: "Delivery must be before 15 June because our customer needs the pouches for the summer campaign." },
          { k: "p", s: "Also please send 5 kg sample roll for trial, we will pay the courier." },
          { k: "p", s: "Waiting your reply." }
        ],
        gloss: [
          { t: "your offer 1.86 USD/kg CIF Istanbul", cn: "到伊斯坦布尔的 CIF 报价 1.86 美元/公斤。CIF 含运费与保险，**运费本身是变量**。" },
          { t: "Our target is 1.62", cn: "我们的目标价是 1.62。target 是**谈判起点**，不是「低于此不谈」的底线——真实成交往往在两者之间。" },
          { t: "same structure PET 12/PE 70", cn: "同结构。**这句话最需要核对**，见「坑」。" },
          { t: "the price must be workable", cn: "价格得能做。workable 是买家固定说法，等于「现在这个价我接受不了」。" },
          { t: "we can give you big order, maybe 20 tons per month", cn: "我们可以给你大单，也许每月 20 吨。**用未来承诺换当下让价**，是压价的标准套路，且带 hedging（maybe）。" },
          { t: "60 days credit", cn: "60 天账期。注意它是**和降价一起提的**——这是双重让利。" },
          { t: "We are talking with two other suppliers also", cn: "我们也在和另外两家谈。**明示比价**，是把压力摆到台面上——但不代表他会走，土耳其贸易商几乎都会同时询 3–5 家。" },
          { t: "Delivery must be before 15 June", cn: "必须在 6 月 15 日前交货。**这是这封信里含金量最高的一句**，见「坑」——它比价格更能决定这单成不成。" },
          { t: "5 kg sample roll for trial, we will pay the courier", cn: "要 5 公斤试机样卷，运费他们付。注意他**只提了运费、没提样品费**——样卷货值谁承担是留白的。" },
          { t: "Waiting your reply.", cn: "等你回复。省略 to be 的直译体，不是不礼貌，只是语法简化。" }
        ],
        traps: [
          { t: "先核对「同结构」，再谈价格", cn: "PET 12/PE 70 只说了面材和总厚，**完全没说**：PE 是不是三层共挤、有没有 EVOH 阻隔层、油墨是里印还是表印、有没有哑光/触感效果、袋子有没有拉链或阀。这些差异往往正好就是那 0.18 美元。**逐项对比之后往往发现根本不是同一个东西**——这是最有效的回应方式，而且不伤和气。" },
          { t: "20 tons/month 是承诺，不是订单", cn: "不能拿未兑现的承诺换永久价格。正解：给**阶梯价**（按累计量分档，量到某档再降），这样承诺兑现你才让利，没兑现你也没损失。直接把单价降到底是把风险全揽到自己身上。" },
          { t: "CIF 报价里运费是变量", cn: "BAF/CAF/PSS/GRI 都会动。若锁不住运费，就不要承诺长期固定 CIF 价——改成 **FOB + 运费另计**，或报价单写明**有效期 30 天**。真实业务里因为运费暴涨而亏单的，几乎都是这一条没写。" },
          { t: "降价与账期不能同时给", cn: "低价 + 60 天账期 = 双重让利，还要自己垫资。**两项里只能给一项**，并且要把这个逻辑明确告诉客户（不是拒绝，是让试探到边界）。可以给的是：降价则维持 30% 定金；要账期则价格维持。" },
          { t: "别急着报「最优价」", cn: "第一封邮件就交出底价，后面没有牌了。正解：先给「基于 20 吨/月的量价」并附条件（月度累计、不可拆单），把优惠和承诺绑在一起。" },
          { t: "「15 June」比价格更能决定这单成不成", cn: "从 6 月 15 日**倒推**：他的客户还要制袋、灌装、上架，所以你的货实际得在 5 月中前到港；再扣掉海运 25–35 天与生产 25 天，**如果现在才开始谈价，6 月 15 日大概率赶不上**。正解：回信主动把这个倒推讲清楚，并给出一个真实可行的日期。这有两个作用——既显得专业，又把话题从「只谈价格」拉到「你确实需要我」。" },
          { t: "样卷的货值没人提，别默认免费", cn: "他说 we will pay the courier（付运费），**没说付样品费**。5 公斤样卷本身有料与工时成本。正解：明确「样卷免费 / 收取 XX 样品费、下单后返还」——先讲清规则，比事后扯皮好。同时问清试机条件（什么设备、什么速度），因为样卷要按他的机器调滑爽度。" }
        ],
        drill: [
          { en: "Before discussing the price, could you share the full specification you are comparing with?", cn: "在谈价格之前，能否提供您正在对比的完整规格？" },
          { en: "Your reference structure does not state whether the PE is a three-layer coextrusion or whether there is an EVOH barrier layer.", cn: "您给出的参照结构未说明 PE 是否为三层共挤，也未说明是否含 EVOH 阻隔层。" },
          { en: "We can offer a tiered price based on the monthly accumulated volume rather than a flat reduction.", cn: "我们可以按月度累计数量提供阶梯价，而不是直接给统一降价。" },
          { en: "Our CIF quotation is valid for 30 days, as the ocean freight and surcharges are revised monthly.", cn: "我们的 CIF 报价有效期为 30 天，因为海运费与附加费按月调整。" },
          { en: "We can support either the lower price or the credit terms, but unfortunately not both.", cn: "低价与账期我们只能支持其中一项，很遗憾无法两者同时满足。" },
          { en: "Working back from 15 June, the goods would need to reach Istanbul by mid-May, so the order has to be confirmed this week.", cn: "从 6 月 15 日倒推，货物需在 5 月中前抵达伊斯坦布尔，因此订单必须本周确认。" }
        ],
        points: [
          { t: "specification", cn: "先要完整规格" },
          { t: "coextrusion", cn: "点出共挤结构差异" },
          { t: "EVOH", cn: "点出阻隔层差异" },
          { t: "tiered price", cn: "用阶梯价代替直接降价" },
          { t: "accumulated", cn: "把优惠绑定累计量" },
          { t: "valid for 30 days", cn: "报价设有效期" },
          { t: "surcharges", cn: "说明运费附加费变量" },
          { t: "credit terms", cn: "点明账期需单独谈" },
          { t: "15 June", cn: "回推交期并给真实可行日期" },
          { t: "sample", cn: "说明样卷规则" }
        ],
        task: "用英文回这封信：① 不直接降价，先要求对方给出「同结构」的完整规格并列出需要核对的项（共挤层数、EVOH、印刷方式、袋型附加功能）；② 说明我们可以给**阶梯价**，按月度累计量分档，把优惠与承诺绑定；③ 说明 CIF 报价有效期 30 天（运费与附加费按月调整），或建议改 FOB 另计运费；④ 明确「降价」与「60 天账期」只能给一项；⑤ 从 6 月 15 日**倒推**交期并给出真实可行的日期；⑥ 说明样卷的样品费与运费规则，并问清试机条件。语气保持合作，不要生硬。"
      },

      /* ------------------------------ 7 ------------------------------ */
      {
        id: "thread-long",
        icon: "📧",
        title: "一整条 re: 邮件线程（关键信息不在最新一封）",
        who: "European brand owner · 印刷稿审批与船期",
        tag: "线程阅读 · 多轮历史 · 双重截止日",
        subject: "RE: RE: RE: PO 2205 / artwork approval / delivery",
        unitIds: [4, 12],
        body: [
          { k: "q", s: ">>> On 12 Mar, from you:\n>>> Please find attached the updated artwork for approval. Kindly approve by 18 Mar so that we can keep the ETD." },
          { k: "q", s: ">> On 14 Mar, from customer:\n>> The artwork is approved with one change - please move the Recyclable logo to the bottom right and reduce it by 20%." },
          { k: "q", s: "> On 15 Mar, from you:\n> Noted. We will send the revised file for final approval." },
          { k: "p", s: "On 19 Mar, from customer:" },
          { k: "p", s: "Hello," },
          { k: "p", s: "We have not received the revised artwork. Our marketing team is asking." },
          { k: "p", s: "Also, please note the delivery date on the PO is 10 April. If the artwork is not approved by 25 March we cannot make the vessel and the next one is 8 May." },
          { k: "p", s: "Please advise today." },
          { k: "p", s: "Regards,\nMarta" }
        ],
        gloss: [
          { t: ">>> / >> / >", cn: "邮件引用层级：每多一个 > 就是**更早的一轮**。读线程要**从最下面往上读**，时间顺序才成立。" },
          { t: "kindly approve by 18 Mar so that we can keep the ETD", cn: "请在 3 月 18 日前批准，以便保住原定开船日。keep the ETD = 维持原船期。" },
          { t: "approved with one change", cn: "有条件批准：整体通过，但要改一处。**这一处就是真正待办事项**。" },
          { t: "move the Recyclable logo to the bottom right and reduce it by 20 %", cn: "把「可回收」标识移到右下角并缩小 20%。" },
          { t: "Noted. We will send the revised file for final approval.", cn: "已知悉，我们将发送修订稿供最终确认。这是 3/15 的**承诺**，而客户 3/19 说没收到。" },
          { t: "Our marketing team is asking.", cn: "我们市场部在问。把内部压力来源说出来，是在给你台阶——意思是「不是我要为难你，是我这边也顶着」。" },
          { t: "we cannot make the vessel", cn: "赶不上这条船。make the vessel 是外贸核心动词，等于「赶上船期」。" },
          { t: "the next one is 8 May", cn: "下一班船是 5 月 8 日。**这就是真实的代价**——错过 3/25，交付直接推后约一个月。" },
          { t: "Please advise today.", cn: "请今天答复。带 today 的收尾是**明确的时限要求**，不是客套。" }
        ],
        traps: [
          { t: "关键信息在第二轮，不在最新一封", cn: "最新一封只说「没收到修订稿」，**没说改什么**。真正要做的修改写在 3/14 那轮里：logo 移到右下角 + 缩小 20%。只看最后一封就回信，等于暴露你没读历史——这在真实商务里非常失分。" },
          { t: "截止日有两层，回信必须都给", cn: "表层是 PO 上的 4 月 10 日交货；真实约束是 **3 月 25 日前完成稿件批准**，否则赶不上船、下一班 5 月 8 日。回信要给**明确日期承诺**（例如「今天 18:00 前发修订稿」），而不是「尽快」。客户已经说了 today。" },
          { t: "先认延迟，别直接进技术内容", cn: "你 3/15 承诺要发稿，客户 3/19 才来催——中间 **4 天**没有动作。回信第一句应当先认这个延迟并给出补救，然后才谈 logo 的技术细节。跳过认错直接讲技术，客户读到的是「你根本没当回事」。" },
          { t: "缩小 20% 可能触碰合规红线", cn: "可回收标识（Recyclable）在多个市场有**最小尺寸/字号要求**（欧盟包装法规尤甚）。直接答应缩小 20% 有可能导致标识不合规，最终损失还是在你这。正解：答应设计调整，同时提示「缩小后需确认是否仍满足最小尺寸要求」——这是加分项，客户会认为你专业。" },
          { t: "回答要用「已改好 + 时点 + 影响」，三件齐", cn: "客户此刻要的是三件事：修订稿什么时候来、还能不能赶上 4/10、如果不能会变成什么时候。三件都给，才算回完；少一件客户还得再发一封。" }
        ],
        drill: [
          { en: "Apologies for the delay - we should have sent the revised file on 15 March.", cn: "抱歉延迟——我们本应在 3 月 15 日发出修订稿。" },
          { en: "We have moved the Recyclable logo to the bottom right and reduced it by 20 % as requested; the revised file is attached.", cn: "我们已按要求把可回收标识移到右下角并缩小 20%，修订稿见附件。" },
          { en: "Please note that at 20 % reduction the logo may fall below the minimum print size required in some markets.", cn: "请注意缩小 20% 后，该标识可能低于部分市场要求的最小印刷尺寸。" },
          { en: "If we receive your final approval by 25 March, we can still make the 10 April vessel.", cn: "如能在 3 月 25 日前收到最终确认，我们仍能赶上 4 月 10 日的船。" },
          { en: "Should the approval come later than that, the next available vessel is 8 May.", cn: "若确认晚于该日期，下一班可用船期为 5 月 8 日。" }
        ],
        points: [
          { t: "Apologies", cn: "先认延迟" },
          { t: "bottom right", cn: "复述他要求的修改内容" },
          { t: "20 %", cn: "确认缩小比例" },
          { t: "attached", cn: "给出稿件" },
          { t: "minimum", cn: "提示最小尺寸合规风险" },
          { t: "25 March", cn: "给出真实截止日" },
          { t: "vessel", cn: "回应船期" },
          { t: "8 May", cn: "给出备选船期" },
          { t: "today", cn: "给出明确时间承诺" }
        ],
        task: "用英文回这封信：① 先为 3/15 的承诺未兑现道歉；② **复述并确认**他 3/14 提出的一处修改（logo 移到右下角、缩小 20%）并说明修订稿已发出/何时发出；③ 提示缩小后可能触及最小尺寸合规要求；④ 给出真实的双重截止日（3/25 批准 → 保住 4/10 船期；否则下一班 5/8）；⑤ 给一个明确到小时的时间承诺。"
      },

      /* ------------------------------ 8 ------------------------------ */
      {
        id: "cn-draft",
        icon: "🇨🇳",
        title: "一份中式英语草稿（真正的问题不是语法）",
        who: "本方同事写的延误通知草稿 · 待改写",
        tag: "中式英语 · 改写 · 通篇无具体信息",
        subject: "about the delivery",
        unitIds: [4, 7],
        body: [
          { k: "p", s: "Subject: about the delivery" },
          { k: "p", s: "Dear customer," },
          { k: "p", s: "We are very sorry to inform you that because our factory have some problem, so the delivery will be delay about one week. Please don't worry, we will try our best to catch the vessel." },
          { k: "p", s: "About the quality, please don't worry, our quality is very good and no any problem. If you have any question please tell me, I will give you a satisfactory reply." },
          { k: "p", s: "Hope you can understand, thank you very much for your cooperation." },
          { k: "p", s: "Best regards" }
        ],
        gloss: [
          { t: "about the delivery", cn: "主题行太含糊。真实客户一天收几十封邮件，主题要带**订单号 + 动作 + 时间**，例如 PO 4530 – revised ETD / 5 May。", fix: "Subject: PO 4530 – revised ETD (delayed by 7 days)" },
          { t: "our factory have some problem", cn: "两处错：factory 是单数应用 has；problem 应加复数。但更重要的是——**含糊**。客户拿到这句只知道「出事了」，不知道**是什么事、影响多大**。", fix: "an unplanned maintenance stop on our lamination line" },
          { t: "so the delivery will be delay about one week", cn: "双错：because 与 so 不能同句连用（英语二选一）；delay 是动词/名词、不是形容词，应为 will be **delayed** by about one week。", fix: "the delivery will be delayed by about one week." },
          { t: "we will try our best to catch the vessel.", cn: "catch the vessel 用法正确，**保留**。但「try our best」是软承诺，客户要的是一个日期。", fix: "we have rebooked to the 5 May vessel." },
          { t: "our quality is very good and no any problem", cn: "no any 是中式搭配（英语中 no 与 any 不这样连用）；且「我们质量很好」是**空话**——客户看的是数据与记录，不是自我评价。", fix: "our QC records for this lot show no non-conformity." },
          { t: "I will give you a satisfactory reply", cn: "「给你一个满意的答复」是教科书式套话，英语母语者会觉得空洞且回避。改成**具体动作 + 时间 + 责任人**。", fix: "I will send the full inspection report by 6 May at the latest." },
          { t: "Please don't worry", cn: "整封信出现了**两次**。英语里反复叫客户「别担心」，效果恰恰相反——会让人觉得有问题在瞒着。**删掉。**", fix: "（删除，改为直接给方案）" },
          { t: "Hope you can understand", cn: "中式高频收尾，隐含「你得体谅我」。商务英语不这样表达，改为感谢对方耐心或直接给补偿方案。", fix: "We appreciate your patience while we resolve this." },
          { t: "thank you very much for your cooperation", cn: "中式结尾套话。英语商务信一般以**下一步动作**收尾，把球稳稳交到对方手里。", fix: "Please confirm whether the revised ETD still works for your production schedule." }
        ],
        traps: [
          { t: "语法其实好改，真正的病是通篇没有信息", cn: "这封信 6 句话，**没有一个具体信息**：晚了几天（说了一周但没给新日期）、什么原因、谁负责、下一步做什么、对他的影响是什么。改写的第一原则是**先给事实**，把形容词全部换成数字和日期。" },
          { t: "「Please don't worry」要删掉", cn: "出现两次，而且是在没有给出任何解决方案的情况下说「别担心」——读者只会更不安。**用方案代替安慰。**" },
          { t: "只报坏消息不给方案，等于把问题丢给客户", cn: "延误通知的结构应当是：坏消息 → 原因（一句）→ **新日期** → 对客户的影响评估 → 补救或补偿 → 需要他做什么。缺了后半段，客户就得自己想办法，关系就受损。" },
          { t: "别在没搞清楚前自称「质量很好」", cn: "延误通知里主动强调质量没问题，反而会让客户怀疑**是不是质量出了问题才延误**。如果延误与质量无关，就**不要提质量**——多说一句就是多引一个怀疑。" },
          { t: "主题行是可检索性，不是装饰", cn: "about the delivery 这种主题，客户三个月后想找这封信根本搜不到。带订单号与具体日期，是专业度的直接体现。" }
        ],
        drill: [
          { en: "I am writing to inform you that PO 4530 will be delayed by seven days.", cn: "兹通知您，PO 4530 将延误七天。" },
          { en: "The delay was caused by an unplanned maintenance stop on our lamination line.", cn: "延误原因是复合线发生了一次计划外停机检修。" },
          { en: "The revised ETD is 5 May, and the ETA remains within the window on your PO.", cn: "修订后的预计开船日为 5 月 5 日，预计到港仍在您订单规定的时间窗内。" },
          { en: "To protect your production schedule, we can air-freight two rolls at our own cost.", cn: "为保障您的生产计划，我们可以承担费用空运两卷。" },
          { en: "Please confirm whether the revised schedule still works for you.", cn: "请确认修订后的时间安排是否仍可行。" }
        ],
        points: [
          { t: "PO", cn: "主题行/正文带订单号" },
          { t: "delayed", cn: "用正确词形" },
          { t: "seven days", cn: "给具体天数" },
          { t: "ETD", cn: "给新的开船日" },
          { t: "ETA", cn: "给到港日" },
          { t: "caused by", cn: "一句说明原因" },
          { t: "air-freight", cn: "给补救方案" },
          { t: "at our own cost", cn: "承担费用" },
          { t: "confirm", cn: "把下一步交给客户" }
        ],
        task: "把这封中式英语草稿**改写成真正专业的英文延误通知**。要求：主题行带订单号与新日期；一句说明原因；给出具体的新 ETD 与 ETA（可用占位日期）；说明是否影响客户的生产计划并给一个补救方案（如自费空运部分货物）；**删掉所有 Please don't worry / Hope you can understand / thank you for your cooperation** 这类套话，改用事实与日期；结尾把下一步交给客户确认。"
      }
    ]
  };
})();
