/* ============ 外贸实操 SOP · 你做对了吗？（Export Operations SOP）============
   把「订单确认 → 生产跟进 → 出货报关 → 提单与回款」四个阶段做成可勾选的实操清单，
   每一步都配一句可直接发给客户 / 货代的英文表达（可朗读、可复制），
   并补充单证规范、运输与报关、收款风控、Incoterms 2020 速查与实用计算器。
   勾选进度保存在 localStorage（fte-sop-v1）。依赖：window.Player（朗读）、data-action 事件委托。 */
(function () {
  "use strict";

  var KEY = "fte-sop-v1";
  var State = { tab: "flow", checks: {}, tplOut: "" };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function toast(m) {
    if (window.ASRUtil && window.ASRUtil.toast) window.ASRUtil.toast(m);
  }
  function speak(t) {
    if (window.Player) window.Player.speak(t, { rate: 1 });
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      State.checks = raw ? (JSON.parse(raw) || {}) : {};
    } catch (e) { State.checks = {}; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(State.checks)); } catch (e) { /* ignore */ }
  }
  function copyText(txt) {
    if (!txt) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt);
      } else {
        var ta = document.createElement("textarea");
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast("📋 已复制");
    } catch (e) { toast("复制失败，请手动选择文本"); }
  }
  function num(id) {
    var el = document.getElementById(id);
    var v = el ? parseFloat(el.value) : NaN;
    return isNaN(v) ? 0 : v;
  }
  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  /* ================= 三条铁律（避坑） ================= */
  var RULES = [
    {
      icon: "💰",
      t: "付款是前提",
      cn: "定金不到账，不派发生产计划单，也不安排生产。口头确认、PO 扫描件、客户催得再急，都不是排产依据——排产依据只有一条：财务确认定金入账。",
      en: "Your order will be released to production once the 30% deposit is credited to our account."
    },
    {
      icon: "📑",
      t: "单据要一致",
      cn: "发票、箱单、提单、原产地证上的信息必须单单一致，尤其是品名、数量、净重毛重和唛头，一个字母、一位小数都不能错。客户清关被卡、银行拒付，九成来自单据打架。",
      en: "Please note that the description, quantity, weight and shipping marks are identical on all documents."
    },
    {
      icon: "📍",
      t: "节点要确认",
      cn: "生产开始、生产完成、验货合格、装柜完毕、开船、单据寄出——每个关键节点主动同步客户，不用等客户来问。信息透明本身就是竞争力，客户信任通常在这里建立。",
      en: "Just a quick update so that you always know where your order stands."
    }
  ];

  /* ================= 四阶段实操清单 ================= */
  var STAGES = [
    {
      id: "s1",
      icon: "📝",
      t: "阶段一 · 订单接收与内部评审",
      en: "Order Intake & Internal Review",
      lead: "起点不是排产，而是把客户的要求翻译成公司内部能执行、能追责的指令。这个阶段偷懒，后面每个环节都要返工。",
      steps: [
        {
          k: "s1a", cn: "审核客户 PO",
          note: "逐项核对产品型号、膜结构与厚度、数量、单价、交货期、付款方式、包装方式与唛头，是否与最后一版确认件一致。有疑问先问清再进系统，不要「先接下来再说」。",
          en: "Before we confirm your order, could you please double-check the film structure, quantity, unit price and shipping marks on PO 24-0518?",
          enCn: "在确认订单前，能否请您再核对一下 PO 24-0518 上的膜结构、数量、单价和唛头？"
        },
        {
          k: "s1b", cn: "制作形式发票 PI 并请客户回签",
          note: "PI 是内部下单和收款的依据：型号、规格、单价（是否含税要写明）、数量、总金额、贸易术语、付款方式、交期、银行账户、有效期缺一不可。客户回签或书面确认后才算成立。",
          en: "Please find attached our proforma invoice PI-24-0518. Kindly countersign it and send a copy back so that we can schedule production.",
          enCn: "附件是我们的形式发票 PI-24-0518。请回签并回传一份，以便我们安排生产。"
        },
        {
          k: "s1c", cn: "确认定金到账，再发放生产计划单",
          note: "财务确认入账（不是客户发的汇款回执）后，业务才开出内部生产计划单。汇款回执与实际到账常差 2 到 5 个工作日，中间的风险不要替客户承担。",
          en: "We have received your 30% deposit today, and your order has been released to our production department.",
          enCn: "我们今天已收到您 30% 的定金，订单已下发到生产部门。"
        },
        {
          k: "s1d", cn: "填写内部生产计划单",
          note: "字段建议：序号、客户型号、工厂型号、数量、膜结构与厚度、宽幅或袋型尺寸、印刷色数与版辊、颜色与光泽、内盒、外箱、每箱数量、备注（细节与注意事项）。一张单让车间不用再问业务。",
          en: "The internal production sheet covers the film structure, printing colours, bag size, cartons and packing details.",
          enCn: "内部生产计划单涵盖膜结构、印刷色数、袋型尺寸、外箱与包装细节。"
        },
        {
          k: "s1e", cn: "组织产前评审会议",
          note: "业务、生产、采购、仓库、品质一起过：产能能否吃下这个交期、原料与版辊是否到位、有没有替代方案。评审结论要落在纸上，口头结论一律无效。",
          en: "We held a pre-production meeting this morning and confirmed that the delivery date of June 20 is achievable.",
          enCn: "我们今天上午开了产前会议，确认 6 月 20 日的交期可以达成。"
        },
        {
          k: "s1f", cn: "新产品确认包装文件与刀模",
          note: "生产部提供内盒与外箱尺寸、刀模图；业务跟催客户确认包装文件、彩色标签、贴标位置和高清印刷稿。这一步卡住的时间，全部会转成交期延误。",
          en: "Attached are the die-cut drawing and the carton dimensions. Please confirm the label artwork and its position before we start printing.",
          enCn: "附件是刀模图和外箱尺寸。请在开印前确认标签稿件及其位置。"
        },
        {
          k: "s1g", cn: "如公司已有 ERP，同步录入系统",
          note: "顺序建议：客户主档与信用额度 → 销售订单（挂 PI 号）→ 物料需求 MRP 展开 → 采购申请 → 生产工单 → 仓库备料。ERP 单号与 PI 号、生产计划单号必须能互相追溯，出问题才查得到源头。",
          en: "The order has been entered in our ERP system under sales order number SO-24-1183.",
          enCn: "订单已录入我们的 ERP 系统，销售订单号为 SO-24-1183。"
        }
      ]
    },
    {
      id: "s2",
      icon: "🏭",
      t: "阶段二 · 生产跟进与进度控制",
      en: "Production Follow-up & Quality Control",
      lead: "这个阶段只有一个动作：盯紧。按交期倒推节点，问题在车间就解决掉，别等验货那天才发现。",
      steps: [
        {
          k: "s2a", cn: "按交期倒推排产节点",
          note: "原料采购 → 制版 → 印刷 → 复合 → 熟化 → 分切 → 制袋 → 检验 → 包装，每个节点写明计划日期与责任人。复膜胶复合后的熟化时间（通常 24 至 72 小时）常被漏算，交期就是这样丢的。",
          en: "The production schedule is: printing by June 5, lamination by June 8, curing until June 11, and slitting and bag making by June 15.",
          enCn: "生产计划为：6 月 5 日前印刷完成，6 月 8 日复合，熟化至 6 月 11 日，6 月 15 日前分切制袋。"
        },
        {
          k: "s2b", cn: "备齐技术与质量资料",
          note: "产品高清图、质量标准、检验报告、COA、TDS、MSDS、食品接触合规声明、残留溶剂检测。客户随时会要，提前准备比临时找快得多。",
          en: "We will send you the TDS, MSDS, COA and the food-contact compliance statement together with the inspection report.",
          enCn: "我们会把 TDS、MSDS、COA 和食品接触合规声明与检验报告一并发给您。"
        },
        {
          k: "s2c", cn: "三查：标签、产品、装箱",
          note: "标签查内容与位置（型号、批号、生产日期、条码、客户 logo）；产品查外观、尺寸、剥离强度、热封强度、印刷套色；装箱查内盒外箱、每箱数量、唛头。三样都要拍照留底。",
          en: "Our QC checked the labels, the pouches and the cartons one by one, and I have attached the photos for your reference.",
          enCn: "我们品检逐一检查了标签、袋子和外箱，照片附上供您参考。"
        },
        {
          k: "s2d", cn: "新产品留样并登记",
          note: "每批留样标注批号、生产日期、检验人、留样数量，保存期至少到质保期结束。客诉来的时候，留样是唯一能替你说话的证据。",
          en: "We keep a retention sample of every batch with the batch number and production date recorded.",
          enCn: "我们每批都留样，并记录批号与生产日期。"
        },
        {
          k: "s2e", cn: "预约验货",
          note: "客户自验提前约一周敲定时间；第三方机构（SGS、Intertek、BV、TUV）建议提前两周预约，同时通知工厂做好准备。验货当天缺资料、缺样品、货没包完，等于白约一次。",
          en: "Shall we book the pre-shipment inspection for June 18? If you use a third party such as SGS, we would need about two weeks to arrange it.",
          enCn: "验货安排在 6 月 18 日可以吗？如果您用 SGS 等第三方，我们需要约两周时间安排。"
        },
        {
          k: "s2f", cn: "自行验货并拍照留底",
          note: "按客户验货标准先自查一遍：产品细节、内盒外箱标签、数量、唛头。发现问题在第三方到场前改掉，成本差十倍。",
          en: "We carried out an internal inspection first, so that everything is ready before your inspector arrives.",
          enCn: "我们先做了内部验货，确保您的验货员到场前一切就绪。"
        },
        {
          k: "s2g", cn: "制作装箱单",
          note: "字段：客户型号、工厂型号、品种、颜色、数量、每箱数量、箱数、外箱尺寸（长宽高 CM）、净重、总净重、毛重、总毛重、体积、订单号。CBM = 长 × 宽 × 高 ÷ 1000000 × 箱数。",
          en: "Attached is the draft packing list with the carton dimensions, net weight, gross weight and total volume.",
          enCn: "附件是装箱单草稿，含外箱尺寸、净重、毛重和总体积。"
        },
        {
          k: "s2h", cn: "验货报告解读与车间闭环",
          note: "拿到客户或第三方的原始验货报告，先分清致命缺陷、严重缺陷、轻微缺陷；把每一条翻译成车间能执行的整改动作，附照片和整改期限，改完再回报客户。",
          en: "We have reviewed the inspection report, and here is our corrective action plan for each finding, with photos and a completion date.",
          enCn: "我们已审阅验货报告，针对每一项问题附上整改方案、照片和完成日期。"
        }
      ]
    },
    {
      id: "s3",
      icon: "🚛",
      t: "阶段三 · 出货准备与物流安排",
      en: "Shipping Preparation & Logistics",
      lead: "货好之前就要把船、单、柜、报关排开。船期不等人，截关时间也不等人。",
      steps: [
        {
          k: "s3a", cn: "租船订舱",
          note: "一般提前 10 到 15 天联系货代订舱；旺季、节前、美线还要更早。FOB 由客户指定货代时，货备好前至少 7 天把订舱委托书（S/O）发过去，并留好发送记录。",
          en: "The cargo will be ready on June 20. Could you please book space on a vessel with an ETD around June 25?",
          enCn: "货物 6 月 20 日备好。能否订 6 月 25 日左右开船的舱位？"
        },
        {
          k: "s3b", cn: "草稿单据先发客户确认，同时催尾款",
          note: "根据工厂装箱资料先做商业发票（CI）和装箱单（PL）草稿发客户确认，顺势提尾款。等提单出来才发现收货人写错，改单费和时间都是白花的。",
          en: "Please check the draft invoice and packing list. Once you confirm them, we will arrange the balance payment and the shipment.",
          enCn: "请核对发票和箱单草稿。您确认后，我们即安排尾款与出运。"
        },
        {
          k: "s3c", cn: "拖车装柜并记录三个号",
          note: "货好且验货合格后安排拖车提柜。装柜后必须记录柜号、车牌号、封条号，并同步给货代。装柜全程拍照：空柜、装载过程、满柜、封条特写。",
          en: "Loading is completed. Container number TGHU1234567, seal number CN889012, and the loading photos are attached.",
          enCn: "装柜完成。柜号 TGHU1234567，封条号 CN889012，装柜照片附上。"
        },
        {
          k: "s3d", cn: "委托报关，预留通关时间",
          note: "全套报关资料交报关行，通常预留至少 2 天通关时间，遇查验要更久。截单、截关、截重柜（VGM）三个时间点都要从开船日倒推，任何一个漏了都可能甩柜。",
          en: "We have handed all customs documents to our broker. The cut-off for documents is Wednesday and the VGM cut-off is Thursday noon.",
          enCn: "报关资料已交报关行。截单时间是周三，VGM 截止是周四中午。"
        },
        {
          k: "s3e", cn: "填报申报要素",
          note: "常见九项：品名、HS 编码、品牌、材质、用途、数量、单位、单价、总价，另加净重、毛重、件数。软包装成品与胶粘剂的 HS 编码不同，归类错了轻则退单重报，重则涉嫌申报不实。",
          en: "The declaration elements include the product name, HS code, brand, material, use, quantity, unit price and total value.",
          enCn: "申报要素包括品名、HS 编码、品牌、材质、用途、数量、单价和总价。"
        },
        {
          k: "s3f", cn: "报检与危险品资料（化工品必看）",
          note: "属法定检验目录的货物要报检；溶剂型复膜胶、油墨等危险化学品出口还需危险特性分类鉴定报告、危包证（性能与使用鉴定）、UN 包装标记与英文危险公示标签。这类资料缺一样，港口直接不收货。",
          en: "This is a solvent-based adhesive classified as UN 1866. We will provide the dangerous goods packing certificate and the MSDS in English.",
          enCn: "这款是溶剂型胶粘剂，危险品编号 UN 1866。我们会提供危包证和英文版 MSDS。"
        }
      ]
    },
    {
      id: "s4",
      icon: "🏦",
      t: "阶段四 · 核对提单与回款收尾",
      en: "B/L Check, Payment Collection & Closing",
      lead: "订单没结束在开船，而是结束在钱到账、客户顺利清关、资料归档。收尾做扎实，复购才有戏。",
      steps: [
        {
          k: "s4a", cn: "核对提单草稿（B/L Draft）",
          note: "开船后船公司出提单草稿，必须逐项核对：Shipper、Consignee、Notify Party、品名、件数重量体积、唛头、装运港与卸货港、运费条款（Freight Prepaid / Collect）、提单份数。信用证项下还要与证内条款逐字对齐。",
          en: "Please check the attached B/L draft carefully, especially the consignee, notify party, description and weights. Any correction after release will incur an amendment fee.",
          enCn: "请仔细核对附件提单草稿，特别是收货人、通知方、品名与重量。放单后修改会产生改单费。"
        },
        {
          k: "s4b", cn: "准备全套清关单证",
          note: "按客户或信用证要求出齐：商业发票、装箱单、提单、原产地证（CO / FORM A / FORM E / RCEP）、保险单、装箱证明、熏蒸证。所有单据的品名、数量、重量、唛头必须完全一致。",
          en: "The full set of documents includes the commercial invoice, packing list, bill of lading and certificate of origin.",
          enCn: "全套单据包括商业发票、装箱单、提单和原产地证。"
        },
        {
          k: "s4c", cn: "T/T 项下交单回款",
          note: "先把提单副本发客户催尾款，确认全款到账后再寄正本提单或做电放（Telex Release）。顺序颠倒一次，可能就是一整柜货的学费。",
          en: "Please find the copy B/L attached. We will arrange the telex release as soon as the balance is credited to our account.",
          enCn: "附件是提单副本。尾款到账后我们立即安排电放。"
        },
        {
          k: "s4d", cn: "L/C 项下按证交单",
          note: "严格按信用证条款做单，注意最迟装运期、交单期（一般 21 天）、议付行要求。出现不符点先自查再联系客户改证或授权接受，不要抱着「银行应该不会挑」的心态交单。",
          en: "We will present the documents to the negotiating bank within the presentation period stated in the credit.",
          enCn: "我们会在信用证规定的交单期内向议付行交单。"
        },
        {
          k: "s4e", cn: "开船通知与到港跟踪",
          note: "开船后 24 小时内发装运通知（Shipping Advice）：船名航次、提单号、ETD、ETA、柜号、件重体、单据寄出方式与快递单号。到港前一周再提醒一次客户准备清关。",
          en: "Your shipment sailed on June 25 on MSC ANNA, voyage 428W. ETA Hamburg is July 22, and the courier tracking number is 1234567890.",
          enCn: "您的货物已于 6 月 25 日由 MSC ANNA 428W 航次开船，预计 7 月 22 日到汉堡，快递单号 1234567890。"
        },
        {
          k: "s4f", cn: "资料归档与订单复盘",
          note: "报关单、提单、发票箱单、收汇凭证、退税资料按订单号归档。复盘三个数：交期达成率、验货一次通过率、客诉率。同一个坑掉两次，就不是运气问题。",
          en: "We have closed this order internally and would love to hear your feedback on the quality and the packing.",
          enCn: "这笔订单我们内部已结案，很想听听您对质量与包装的反馈。"
        }
      ]
    }
  ];

  /* 红线自查 10 问 */
  var SELFCHECK = [
    { q: "客户口头说「订单确认，先做起来」，可以排产吗？", a: "不可以。排产依据只有回签 PI + 定金到账。口头确认在纠纷里没有任何分量，货压在仓库才是真损失。" },
    { q: "客户发来汇款回执截图，能不能发生产计划单？", a: "不能。回执不等于到账，跨境电汇通常还要 2 到 5 个工作日，中途撤单、退汇都发生过。以财务确认入账为准。" },
    { q: "商业发票上的重量和装箱单差了 3 公斤，要紧吗？", a: "要紧。单单不一致会导致客户清关被查、信用证不符点、甚至被认定申报不实。改单成本远低于清关滞留成本。" },
    { q: "唛头上客户型号写错一个字母，货已经装柜了，怎么办？", a: "立即主动告知客户并给方案（重贴标签、目的港换标、书面说明函），不要指望客户发现不了。隐瞒一次，信任归零。" },
    { q: "FOB 条款下客户指定货代，订舱是谁的事？", a: "客户订舱，但你要在货好前至少 7 天把订舱委托书发给指定货代，并留下发送与确认记录。少发一封邮件，延误责任就可能落到你头上。" },
    { q: "报关资料交给报关行当天就能开船吗？", a: "不要这样赌。通常要预留至少 2 天通关时间，遇查验、归类争议会更久。截单、截关、截重柜时间都要从开船日倒推。" },
    { q: "提单草稿只看收货人对不对就够了吗？", a: "不够。品名、件重体、唛头、装运港卸货港、运费条款、提单份数都要逐项核对，信用证项下还要与证内文字逐字对齐。" },
    { q: "客户说尾款在路上了，先电放吧？", a: "不行。全款到账再放正本或电放，这是底线。可以给提单副本让客户先准备清关文件，但控货权不能提前交出去。" },
    { q: "信用证里有「货到目的港由买方检验合格后付款」，能接吗？", a: "这是典型软条款，付款主动权完全在买方手里，等于把信用证降级成赊销。应要求删除或改为凭装运单据付款。" },
    { q: "溶剂型复膜胶出口，只准备发票箱单就行吗？", a: "不行。危险化学品还需 MSDS、危险特性分类鉴定报告、危包证、UN 包装标记与英文危险公示标签，缺一样港口不收货。" }
  ];

  /* ================= 单证规范 ================= */
  var DOC_TABLE = [
    { ab: "PI", en: "Proforma Invoice", cn: "形式发票", by: "卖方", use: "客户下单与内部收款依据，相当于简式合同", warn: "必须写明贸易术语、付款方式、交期、有效期与银行账户；含税与不含税要标清楚" },
    { ab: "PO", en: "Purchase Order", cn: "采购订单", by: "买方", use: "客户正式下单文件", warn: "收到即逐项核对，与 PI 冲突处必须书面澄清，不要默认「按 PI 执行」" },
    { ab: "CI", en: "Commercial Invoice", cn: "商业发票", by: "卖方", use: "报关、结汇、清关的核心单据", warn: "品名、数量、单价、总金额、贸易术语与合同和提单必须一致；金额不得随客户要求低报" },
    { ab: "PL", en: "Packing List", cn: "装箱单", by: "卖方", use: "证明包装方式、件数、重量与体积", warn: "净重、毛重、箱数、唛头与提单和报关单必须完全一致" },
    { ab: "B/L", en: "Bill of Lading", cn: "海运提单", by: "船公司或货代", use: "物权凭证、运输合同证明、收货收据", warn: "Consignee 与 Notify Party 写错要改单付费；正本份数与运费条款务必核对" },
    { ab: "CO", en: "Certificate of Origin", cn: "原产地证", by: "海关或贸促会", use: "证明货物原产地，客户据此享受关税待遇", warn: "FORM A / FORM E / RCEP 等优惠原产地证的品名与发票必须对得上，签证日期不得早于发票日期" },
    { ab: "S/O", en: "Shipping Order", cn: "订舱委托书 / 装货单", by: "货代或船公司", use: "订舱确认，凭此提柜装货", warn: "核对船名航次、截关时间、柜型数量、免箱期天数" },
    { ab: "MSDS", en: "Material Safety Data Sheet", cn: "安全数据表", by: "卖方", use: "化工品运输、清关与安全告知", warn: "复膜胶、油墨等必须提供英文版，UN 编号与包装类别要与实际一致" },
    { ab: "CoA", en: "Certificate of Analysis", cn: "分析证书 / 质检报告", by: "卖方实验室", use: "证明该批货物的技术指标合格", warn: "批号必须与实际发货批号对应，指标不得照抄上一批" },
    { ab: "Insurance Policy", en: "Insurance Policy", cn: "保险单", by: "保险公司", use: "CIF / CIP 项下卖方投保凭证", warn: "投保金额通常按 CIF 价加成 10%，币种与发票一致" }
  ];

  var PI_FIELDS = [
    "序号 No.",
    "产品图片 Photo",
    "工厂产品型号 Factory model",
    "客户产品型号 Customer model",
    "膜结构 Film structure（如 PET12/AL7/PE80）",
    "厚度与宽幅 Thickness / Width",
    "袋型或规格 Bag type / Size",
    "印刷色数 Printing colours",
    "包装方式 Packing（卷装 / 内盒 / 外箱）",
    "每箱数量 PCS per carton",
    "包装尺寸 Carton size",
    "单价（注明含税或不含税）Unit price",
    "数量 Quantity",
    "总金额 Total amount",
    "贸易术语与目的港 Incoterms + place",
    "付款方式 Payment terms",
    "交货期 Delivery time",
    "有效期 Validity",
    "银行账户 Bank details",
    "备注 Remarks（细节与注意事项）"
  ];

  var PLAN_FIELDS = [
    "序号 No.",
    "客户产品名称 / 型号",
    "工厂产品名称 / 型号",
    "数量（PCS / KG / 卷）",
    "膜结构与厚度",
    "宽幅或袋型尺寸",
    "印刷色数与版辊编号",
    "颜色与光泽（哑光 / 亮光）",
    "内盒规格",
    "外箱规格与每箱数量",
    "交货日期与优先级",
    "备注（尺寸、细节、注意事项、留样要求）"
  ];

  var PACK_FIELDS = [
    "客户型号 / 工厂型号",
    "品种与颜色",
    "数量（PCS）",
    "每箱数量（PCS/CTN）",
    "箱数（CTNS）",
    "外箱尺寸 长 × 宽 × 高（CM）",
    "单箱净重 / 总净重（KGS）",
    "单箱毛重 / 总毛重（KGS）",
    "体积 CBM（长 × 宽 × 高 ÷ 1000000 × 箱数）",
    "唛头 Shipping marks",
    "订单号 / PI 号"
  ];

  /* 五种单据：什么阶段用哪一份（新手最容易把 PI 当 CI 用） */
  var DOC_STAGE = [
    { d: "报价单 Quotation", when: "报价阶段（回 RFQ）", law: "无法律效力", use: "响应询价，可列阶梯量价", form: "XLSX / PDF", warn: "必须写有效期，否则客户半年后还拿旧价来砍价" },
    { d: "形式发票 PI", when: "装船前", law: "半正式（回签后视为简式合同）", use: "客户内部审批、申请开证、付定金", form: "DOCX / PDF", warn: "PI 不能拿去清关，它只是「形式」上的发票" },
    { d: "销售合同 Sales Contract", when: "装船前", law: "正式（双方签字）", use: "约定质量、检验、不可抗力与争议解决", form: "DOCX / PDF", warn: "大额、新客户、L/C 项下建议签正式合同，不要只靠 PI" },
    { d: "商业发票 CI", when: "装船后", law: "正式", use: "清关与结汇的核心单据", form: "DOCX / PDF", warn: "必须写船名航次与提单号，且与提单完全一致，否则海关退单" },
    { d: "装箱单 PL", when: "装船后", law: "配套单据", use: "海关查验、目的港分拨", form: "XLSX / PDF", warn: "必须与发票逐行（line-by-line）对应，行数与顺序都别乱" }
  ];

  /* 商业发票 CI 必备字段（清关第一道关卡） */
  var CI_FIELDS = [
    "卖方全称、地址、联系人、电话、税号或营业执照号",
    "买方全称、地址、联系人",
    "通知方 Notify Party（有时是银行或货代）",
    "发票号 Invoice No. 与开票日期",
    "起运港 Port of Loading",
    "目的港 Port of Discharge",
    "船名航次 Vessel & Voyage No.（必须与提单一致）",
    "提单号 B/L No.",
    "装船日期 Shipped on",
    "贸易术语 + 指定地点 + Incoterms 2020",
    "商品明细：SKU、货描、规格、数量、净重、毛重、单价、金额",
    "合计：总件数、总净重、总毛重、总体积 CBM、总金额",
    "币种与金额大小写双写：USD 50,000.00（Say US Dollars Fifty Thousand Only）",
    "唛头 Shipping Marks",
    "签字与公司盖章"
  ];

  /* 销售合同条款骨架 */
  var CONTRACT_ARTICLES = [
    "合同号、签订日期与签订地点",
    "双方当事人完整法律信息（买方 / 卖方）",
    "第 1 条 标的：产品名称与详细描述（膜结构、厚度、袋型、印刷要求）",
    "第 2 条 数量、单价与总金额（含大小写金额）",
    "第 3 条 原产地与运输标志（唛头）",
    "第 4 条 贸易术语（Incoterms 2020 + 具体地点）",
    "第 5 条 付款：T/T、L/C、D/P、D/A 各写专门条款，不要写「或」",
    "第 6 条 装运：最迟装运期、能否分批、能否转运",
    "第 7 条 单据：发票、装箱单、提单、原产地证、保险单、质检报告",
    "第 8 条 检验：检验机构、检验标准、复验期限",
    "第 9 条 不可抗力",
    "第 10 条 争议解决：仲裁机构与适用法律",
    "第 11 条 其他约定与双方签字栏"
  ];

  /* 制单八条铁律 */
  var DOC_RULES = [
    "银行信息绝不凭记忆填：账号、SWIFT、开户行地址每次都要与财务核对后再写进 PI / CI。改账户只走电话或视频二次确认，邮件里出现的新账号一律先当诈骗处理。",
    "单据要匹配交易阶段：询价出报价单，装船前出 PI 或合同，装船后出 CI 与装箱单。把 PI 当 CI 发给客户清关，是新手最常见的返工。",
    "统一用 Incoterms 2020，并写成「术语 + 具体地点 + 版本」。除客户明确要求 2010 版，不要混用。",
    "一份单据只用一个币种，不要 USD 与 CNY 混写；金额大小写必须一致，银行审单时大小写不符是硬伤。",
    "HS 编码必填且要归类正确，软包装成品与胶粘剂、油墨的编码不同；填错轻则退单重报，重则涉嫌申报不实。",
    "装箱单必须与发票逐行对应，行数、顺序、货描、单位都要一致，海关查验时最先比对这两份。",
    "CI 上的船名航次、提单号、装船日期必须与提单一致；这三项对不上，清关第一步就卡住。",
    "报价单必写有效期与交期；PI 必写付款方式、交期、有效期与银行账户。缺一项，后面就要靠邮件扯皮补。"
  ];

  var CONSIST_ROWS = [
    { k: "desc", label: "品名 Description" },
    { k: "qty", label: "数量 Quantity" },
    { k: "ctn", label: "箱数 Cartons" },
    { k: "nw", label: "净重 N.W.(KGS)" },
    { k: "gw", label: "毛重 G.W.(KGS)" },
    { k: "cbm", label: "体积 CBM" },
    { k: "mark", label: "唛头 Marks" }
  ];
  var CONSIST_COLS = [
    { k: "ci", label: "商业发票 CI" },
    { k: "pl", label: "装箱单 PL" },
    { k: "bl", label: "提单 B/L" },
    { k: "co", label: "原产地证 CO" }
  ];

  /* ================= 运输方式与报关 ================= */
  var SHIP_MODES = [
    {
      icon: "🚢", t: "海运 Sea Freight", fit: "大货、整柜、重货、成本敏感",
      time: "欧美 25 至 40 天，东南亚 5 至 12 天",
      cost: "单位成本最低",
      doc: "B/L、CI、PL、CO、报关单、VGM",
      note: "整箱 FCL 干净可控，拼箱 LCL 注意与危险品或异味货同柜；订舱要提前 10 至 15 天，旺季更早。",
      en: "We ship in a 40-foot high cube container, with an ETD of June 25 and an ETA of July 22."
    },
    {
      icon: "✈️", t: "空运 Air Freight", fit: "急单、样品大件、高价值轻货",
      time: "3 至 7 天（含清关）",
      cost: "按计费重量，体积重 = 长×宽×高(cm)÷6000",
      doc: "AWB（空运单）、CI、PL、报关单、危险品还需 DGD",
      note: "空运单不是物权凭证，收货人写谁就是谁能提货，改单极麻烦；溶剂型胶多数航空禁运，务必先确认可运性。",
      en: "We can send it by air freight; the airway bill number will be provided once the goods are uplifted."
    },
    {
      icon: "📦", t: "快递 Courier", fit: "样品、单证、小批量补货",
      time: "3 至 6 天门到门",
      cost: "最高，但省清关人力",
      doc: "运单、形式发票（样品注明 no commercial value）",
      note: "DHL / FedEx / UPS 可门到门含清关；粉末、液体、胶类要提前给 MSDS 审核，不要瞒报品名。",
      en: "The samples were sent by DHL, tracking number 1234567890, and should reach you within four working days."
    }
  ];

  var CUSTOMS_DOCS = [
    "出口合同（或回签 PI）",
    "商业发票 CI（含税与不含税版本按模式准备）",
    "装箱单 PL",
    "报关委托书",
    "入仓核实单 / 进仓单",
    "订舱确认 S/O",
    "申报要素单",
    "法检货物的报检资料、危险品的危包证与鉴定报告",
    "如需退税：出口发票与进项发票、收汇凭证"
  ];

  var DECL_ELEMENTS = ["品名", "HS 海关编码", "品牌", "材质", "用途", "数量", "单位", "单价", "总价", "净重", "毛重", "件数"];

  var EXPORT_MODES = [
    {
      m: "① 一般贸易 · 含税出厂价（EXW 含税）",
      pay: "货款进境内经营主体的公户",
      chan: "一般贸易报关，可申请出口退税",
      doc: "合同、含税与不含税两版发票、装箱单、入仓核实单、S/O、申报要素",
      note: "含税价要把增值税与退税差额算进成本，退税周期通常 1 至 3 个月，现金流要预留。"
    },
    {
      m: "② 一般贸易 · 不含税出厂价（EXW 不含税）",
      pay: "货款进出口经营主体的公户",
      chan: "由报关行按一般贸易或市场采购（1039）通道申报",
      doc: "S/O、报关资料、入仓核实单交报关行",
      note: "不含税不等于不合规：走 1039 市场采购的商品范围、金额上限与收汇要求都有限制，先确认再承诺价格。"
    },
    {
      m: "③ FOB 离岸价 · 境内账户收款",
      pay: "货款进出口经营主体的公户",
      chan: "1039 市场采购或一般贸易",
      doc: "S/O、报关资料、入仓核实单",
      note: "FOB 下船务由客户指定货代，但订舱委托、截关时间、装柜信息仍需你主动推进并留痕。"
    },
    {
      m: "④ FOB 离岸价 · 境外（香港）账户收款",
      pay: "货款进境外银行账户",
      chan: "1039 市场采购或一般贸易",
      doc: "S/O、报关资料、入仓核实单",
      note: "离岸收款要注意资金合规、收汇与报关主体一致性，以及所在地税务申报要求，别把风险留到年底。"
    }
  ];

  /* ================= 收款与风控 ================= */
  var TT_TIMELINE = [
    { n: "1", t: "签 PI 后 · 收 30% 定金", cn: "定金到账才排产。比例低于 30% 时，要求提高比例或缩短尾款账期。", en: "We require a 30% deposit to start production and the balance before shipment." },
    { n: "2", t: "货好验货合格 · 发草稿单据", cn: "CI / PL 草稿发客户确认，同时正式提尾款，附装柜照片增强说服力。", en: "The goods are ready and have passed inspection. Please arrange the balance so that we can ship on schedule." },
    { n: "3", t: "开船后 · 提单副本催尾款", cn: "只给副本，不给正本、不电放。副本足够客户走内部付款流程。", en: "Attached is the copy B/L for your payment arrangement. The original will be released once the balance is received." },
    { n: "4", t: "全款到账 · 寄正本或电放", cn: "以银行入账为准，不以汇款凭证为准。放单同时发装运通知与全套清关单证。", en: "We confirm receipt of your balance payment and have arranged the telex release today." }
  ];

  var TT_RISKS = [
    "尾款拖欠：客户以「货到再付」为由拖尾款。对策——提单副本已给、正本在手，同时在 PI 里写明逾期付款的仓储与滞箱费用由买方承担。",
    "先放单后收款：业务员被客户催得心软，先电放再收款，这是外贸最常见的重大损失。对策——放单权限收归财务与经理双签。",
    "账户被冒充：客户收到伪造的改账户邮件（商务邮件诈骗）。对策——银行账户变更一律电话或视频二次确认，PI 上注明我方账户不会通过邮件变更。",
    "少量试单变大额赊账：客户以增量为条件要求 O/A 60 天。对策——先做资信调查，考虑投保出口信用保险，额度内放账，超额部分仍要定金。"
  ];

  var LC_RISKS = [
    "软条款：如「货到目的港经买方检验合格后付款」「船名由开证人指定并另行通知」「提单需由申请人授权人签字」。这类条款把付款主动权交回买方，应要求删除或改为凭装运单据付款。",
    "单据不符点：品名与证内文字不一致、超装或短装、迟装、迟交单、唛头缺失、保险金额不足、CO 签发日期早于发票日期。一个不符点就可能被扣款或拒付。",
    "开证行资信：小国家、小银行开的证，即使单据完全相符也可能拖付。对策——要求由大行保兑（Confirmed L/C），或改用「定金 + 见提单副本付尾款」。",
    "时间陷阱：最迟装运期、信用证有效期、交单期（通常 21 天）三个日期要一起看。船期一延误就可能同时踩中迟装与迟交单。",
    "改证成本：改证费通常由申请人承担，但时间成本在你这边。审证要在收证 3 个工作日内完成，能改的一次性提出来，不要分批。"
  ];

  var PAY_COMPARE = [
    { m: "T/T 电汇（定金 + 尾款）", risk: "低到中", cn: "定金 30% 起，尾款见提单副本付。最常用、成本最低。" },
    { m: "L/C 信用证", risk: "中", cn: "银行信用，但风险从买家转到单据与开证行。制单能力决定成败。" },
    { m: "D/P 付款交单", risk: "中到高", cn: "买家不付款拿不到单据，但货已到港，拒付时你要承担退运或降价处理。" },
    { m: "D/A 承兑交单", risk: "高", cn: "买家承兑就能拿单提货，到期不付你只剩一张汇票。慎用。" },
    { m: "O/A 赊销", risk: "最高", cn: "先发货后收款。只对长期老客户、且有资信调查与出口信用保险时使用。" }
  ];

  var CHASE_LINES = [
    { en: "Just a friendly reminder that the balance of USD 12,600 is due before we release the shipping documents.", cn: "友善提醒：在我们放单前，尾款 12,600 美元需要结清。" },
    { en: "Your goods have passed inspection and are ready for loading. Could you kindly arrange the balance today so that we can meet the vessel cut-off?", cn: "货物已验货合格，随时可以装柜。能否请您今天安排尾款，以便赶上截关时间？" },
    { en: "We have not yet received the payment. Could you please send us the remittance slip with the value date so that we can trace it with our bank?", cn: "我们尚未收到款项。能否发一份带起息日的汇款凭证，以便我们向银行查询？" },
    { en: "Please note that any storage and demurrage charges caused by delayed payment will be for the buyer's account.", cn: "请注意，因付款延迟产生的仓储费和滞箱费将由买方承担。" },
    { en: "We value our cooperation and would be happy to discuss better payment terms once we have a longer track record together.", cn: "我们很重视这次合作，等合作记录更长一些，很乐意商谈更好的付款条件。" }
  ];

  /* ================= Incoterms 2020 ================= */
  var INCOTERMS = [
    { ab: "EXW", cn: "工厂交货", mode: "任何方式", risk: "货物在卖方场地交由买方处置时", exp: "买方", main: "买方", ins: "买方", imp: "买方", note: "卖方责任最小；买方无法办出口清关时应改用 FCA。" },
    { ab: "FCA", cn: "货交承运人", mode: "任何方式", risk: "交给买方指定承运人时", exp: "卖方", main: "买方", ins: "买方", imp: "买方", note: "2020 版可约定买方指示承运人向卖方签发已装船提单。" },
    { ab: "FAS", cn: "船边交货", mode: "仅海运 / 内河", risk: "货物放置到指定船边时", exp: "卖方", main: "买方", ins: "买方", imp: "买方", note: "适合散货大宗商品，不适合集装箱货。" },
    { ab: "FOB", cn: "船上交货", mode: "仅海运 / 内河", risk: "货物装上船时", exp: "卖方", main: "买方", ins: "买方", imp: "买方", note: "海运最常用；空运或门到门应改用 FCA。" },
    { ab: "CFR", cn: "成本加运费", mode: "仅海运 / 内河", risk: "货物装上船时（早于费用终点）", exp: "卖方", main: "卖方", ins: "买方", imp: "买方", note: "风险转移点与费用承担点分离，这是最常被误解的一条。" },
    { ab: "CIF", cn: "成本、保险加运费", mode: "仅海运 / 内河", risk: "货物装上船时", exp: "卖方", main: "卖方", ins: "卖方（最低险别）", imp: "买方", note: "卖方投保通常按 CIF 加成 10%，最低险别即可，不等于包送到。" },
    { ab: "CPT", cn: "运费付至", mode: "任何方式", risk: "交给第一承运人时", exp: "卖方", main: "卖方", ins: "买方", imp: "买方", note: "CFR 的万能版，空运、陆运、多式联运都能用。" },
    { ab: "CIP", cn: "运费和保险费付至", mode: "任何方式", risk: "交给第一承运人时", exp: "卖方", main: "卖方", ins: "卖方（协会货物条款 A）", imp: "买方", note: "2020 版要求投保一切险级别，保额高于 CIF。" },
    { ab: "DAP", cn: "目的地交货", mode: "任何方式", risk: "运抵指定地点、可卸货时", exp: "卖方", main: "卖方", ins: "卖方自担", imp: "买方", note: "卖方送到但不负责卸货。" },
    { ab: "DPU", cn: "卸货地交货", mode: "任何方式", risk: "在指定地点卸货完成时", exp: "卖方", main: "卖方", ins: "卖方自担", imp: "买方", note: "11 个术语中唯一要求卖方卸货；原 DAT 改名而来。" },
    { ab: "DDP", cn: "完税后交货", mode: "任何方式", risk: "在指定地点交买方处置时", exp: "卖方", main: "卖方", ins: "卖方自担", imp: "卖方", note: "卖方责任最大，报价必须把进口关税与税金算进去。" }
  ];

  var TERM_MYTHS = [
    { q: "误区一：CIF / CFR 就是卖方保证安全送到目的港", a: "错。CIF 与 CFR 的风险转移点在装运港装船时。船在海上出事，货损风险已经在买方，只是 CIF 下买方可以凭卖方投保的保单索赔。费用终点和风险终点是两件事。" },
    { q: "误区二：走空运也可以用 FOB / CFR / CIF", a: "错。这三个术语只适用于海运及内河水运。空运、陆运、集装箱门到门应使用 FCA、CPT、CIP，否则风险转移点与实际交货方式对不上，出事很难说清。" },
    { q: "误区三：EXW 下出口报关是卖方的事", a: "错。EXW 下出口清关是买方责任。现实中境外买方往往办不了中国出口手续，此时应改用 FCA，由卖方完成出口清关后交货。" }
  ];

  var TERM_ADVICE = [
    { who: "新手买家（进口方）", pick: "FOB", why: "自己掌握海运与保险，费用透明，容易比价。" },
    { who: "新手卖家（出口方）", pick: "CIF 或 FCA", why: "CIF 客户省心、订单好拿；FCA 风险转移早，对卖方有利。" },
    { who: "想全包省事", pick: "DDP", why: "客户体验最好，但必须把目的国关税、税金与清关杂费算进报价。" },
    { who: "跨境 B2B（快递 / 空运）", pick: "FCA 或 CPT", why: "避免用 FOB / CFR / CIF，风险点与运输方式不匹配。" }
  ];

  /* ================= 英文节点通知模板 ================= */
  var TPL = [
    {
      k: "confirm", label: "① 订单确认 Order confirmed",
      body: "Dear {NAME},\n\nThank you for your order {PO}. Attached is our proforma invoice for your countersignature.\n\nOnce we receive your signed PI and the 30% deposit, we will release the order to production and confirm the exact delivery date.\n\nBest regards,\n{ME}"
    },
    {
      k: "deposit", label: "② 定金到账 Deposit received",
      body: "Dear {NAME},\n\nWe confirm receipt of your 30% deposit for order {PO} today. Your order has been released to our production department.\n\nThe planned completion date is {DATE}. I will keep you updated at every key stage.\n\nBest regards,\n{ME}"
    },
    {
      k: "inproduction", label: "③ 生产进度 Production update",
      body: "Dear {NAME},\n\nA quick update on order {PO}: printing and lamination are completed, and the material is now curing. Slitting and bag making will start on {DATE}.\n\nEverything is on track for the agreed delivery date.\n\nBest regards,\n{ME}"
    },
    {
      k: "ready", label: "④ 生产完成与验货 Ready for inspection",
      body: "Dear {NAME},\n\nOrder {PO} has been completed and our internal inspection has been passed. Photos of the products, labels and cartons are attached.\n\nShall we book the pre-shipment inspection for {DATE}? Please also let us know if you use a third-party inspector.\n\nBest regards,\n{ME}"
    },
    {
      k: "balance", label: "⑤ 催尾款 Balance reminder",
      body: "Dear {NAME},\n\nThe goods for order {PO} are ready and have passed inspection. Attached are the draft invoice and packing list for your checking.\n\nCould you kindly arrange the balance payment by {DATE} so that we can meet the vessel cut-off? Our bank details are unchanged and shown on the invoice.\n\nBest regards,\n{ME}"
    },
    {
      k: "loaded", label: "⑥ 装柜完成 Loading completed",
      body: "Dear {NAME},\n\nOrder {PO} was loaded today. Container number and seal number are shown on the attached packing list, and the loading photos are enclosed.\n\nThe container has been delivered to the port and customs clearance is in progress.\n\nBest regards,\n{ME}"
    },
    {
      k: "sailed", label: "⑦ 开船通知 Shipping advice",
      body: "Dear {NAME},\n\nYour shipment for order {PO} sailed on {DATE}.\n\nVessel and voyage: {VESSEL}\nB/L number: {BL}\nETA: {ETA}\nQuantity, gross weight and volume: as per the attached packing list\n\nThe full set of documents is attached for your checking.\n\nBest regards,\n{ME}"
    },
    {
      k: "release", label: "⑧ 放单 / 电放 Documents released",
      body: "Dear {NAME},\n\nWe confirm receipt of your balance payment for order {PO}, thank you.\n\nWe have arranged the telex release today, and the original documents including the certificate of origin have been couriered to you.\n\nPlease let us know once the goods arrive so that we can follow up on your feedback.\n\nBest regards,\n{ME}"
    }
  ];

  /* 付款条款速查（合同与 PI 里怎么写） */
  var PAY_TERMS_QUICK = [
    { t: "T/T 30/70", cn: "30% 定金，余款 70% 装船前电汇", use: "新客户默认首选，兼顾成交率与安全" },
    { t: "T/T in advance", cn: "100% 装船前付清", use: "小额试单、样品单、急单，最保护卖方" },
    { t: "T/T 30% + 70% against copy B/L", cn: "定金 30%，见提单副本付余款", use: "老客户常用；正本或电放必须等全款到账" },
    { t: "L/C at sight", cn: "即期信用证，交单相符后付款", use: "大额、新市场、买方要求银行信用时" },
    { t: "L/C 30/60 days", cn: "远期信用证，承兑后 30 或 60 天付款", use: "相当于给账期，要评估开证行资信与资金占用" },
    { t: "D/P at sight", cn: "即期付款交单，银行代收", use: "买方不付款拿不到单据，但拒付时你要处理到港货物" },
    { t: "D/A 30/60", cn: "承兑交单，买方承兑即可提货", use: "风险高，仅对长期客户并配合信用保险" },
    { t: "O/A 30/60/90", cn: "赊销，收货后按账期付款", use: "最有利于买方；需资信调查 + 出口信用保险 + 额度管理" }
  ];

  /* 发货前先查客户：五信源尽调 */
  var DD_SOURCES = [
    { n: "①", t: "公开足迹 Google / 行业目录", cn: "搜公司全称 + 国别 + importer / distributor，看是否有官网、新闻、行业名录记录；有无诉讼、欺诈投诉等负面信息。" },
    { n: "②", t: "客户官网", cn: "看主营品类、服务行业、认证、团队与地址。模板站、Lorem ipsum 占位文、只留邮箱不留地址，都是红旗。" },
    { n: "③", t: "海关与贸易数据", cn: "查真实进口记录、采购频率、原供应商。免费渠道（公开提单记录、UN Comtrade）有 2 至 3 个月滞后，查不到不等于没有，标注「未查到」而不是猜。" },
    { n: "④", t: "域名 WHOIS", cn: "看域名注册年限与注册人。域名不足一年 + 隐私保护 + 注册地与自称总部不一致，风险显著升高。" },
    { n: "⑤", t: "补充核查", cn: "邮箱是否企业域名且可送达、LinkedIn 公司页与员工数、制裁与出口管制名单筛查、网站技术栈。制裁命中即刻停止，不要继续报价。" }
  ];

  var DD_FLAGS = [
    "首单就要大额赊账（O/A 60 天以上），且拒绝提供公司注册信息。",
    "只用免费邮箱（gmail、hotmail）联系，公司域名邮箱一封都没有。",
    "急着要货、催着改收款账户、要求把发票金额改低。",
    "官网域名注册不足一年，地址只有邮政信箱，产品线杂乱无焦点。",
    "指定第三方付款、要求分拆多笔小额收款、或让你收非贸易性质款项。"
  ];

  /* 配套课程单元（把实操流程接回英文学习） */
  var RELATED_UNITS = [
    { id: 12, icon: "📄", t: "订单执行与出口单证", cn: "PI / CI / PL / B/L / CO 与验货、订舱、报关的英文表达" },
    { id: 13, icon: "🚢", t: "海运操作与货代术语", cn: "箱型、附加费、滞期滞留、截关、VGM、甩柜怎么说" },
    { id: 14, icon: "📐", t: "Incoterms 2020 与报价核算", cn: "11 种术语的英文用法与 FOB / CIF / DDP 报价表达" },
    { id: 15, icon: "🏦", t: "货款回收、票据与保险", cn: "T/T、L/C、D/P、D/A 谈判与不符点、索赔英文" },
    { id: 16, icon: "⚖️", t: "合同风险、贸易纠纷与产品合规", cn: "违约、仲裁、管辖、保密与 CE / REACH / RoHS / FDA 合规表达" }
  ];

  /* 参考来源（可点开核对规则原文） */
  var REFS = [
    { t: "Incoterms® 规则官方知识库 · ICC Academy", u: "https://academy.iccwbo.org/knowledge-hub/incoterms/", cn: "11 种贸易术语的官方解释与适用范围" },
    { t: "ICC 规则文库（UCP 600 等出版物）", u: "https://library.iccwbo.org/", cn: "信用证审单标准与交单期规则原文" },
    { t: "集装箱总重验证 VGM 要求说明", u: "https://www.maritimenz.govt.nz/commercial-operators/all-commercial-operators/cargo-and-dangerous-goods/container-weight/", cn: "SOLAS 项下 VGM 的两种称重方法与申报责任" },
    { t: "美国进口安全申报 ISF（10+2）官方 FAQ · CBP", u: "https://www.cbp.gov/sites/default/files/assets/documents/2018-Nov/Updated%20ISF%20FAQ%20FINAL%2011262018.pdf", cn: "美线必看：申报要素、时限与罚则" },
    { t: "中国国际贸易单一窗口", u: "https://www.singlewindow.cn/", cn: "报关、申报要素、原产地证申领的官方办理入口" },
    { t: "海关总署 · 市场采购贸易方式（1039）政策解读", u: "http://www.customs.gov.cn/customs/2026-04/12/article_2026041211245991457.html", cn: "1039 通道适用范围与监管要求" },
    { t: "中华人民共和国海关总署", u: "http://www.customs.gov.cn/", cn: "报关单填报要求、出口管制与公告原文" },
    { t: "开源工具集 foreign-trade-suite（单据生成 / 客户尽调）", u: "https://github.com/Elvinaskill/foreign-trade-suite", cn: "本页单据字段规范与五信源尽调清单参考自该项目，并已按本网站语境改写、补充与验证。作者 Elvina。本站仅个人学习使用。" }
  ];

  /* ================= 渲染 ================= */
  var TABS = [
    { k: "flow", label: "🧭 四阶段流程" },
    { k: "docs", label: "📑 单证规范" },
    { k: "logi", label: "🚢 运输与报关" },
    { k: "pay", label: "🏦 收款与风控" },
    { k: "legal", label: "⚖️ 合同与合规" },
    { k: "terms", label: "📐 Incoterms 2020" },
    { k: "tools", label: "🧮 实用工具" },
    { k: "docgen", label: "📄 单证生成" }
  ];

  function allSteps() {
    var out = [];
    STAGES.forEach(function (s) { s.steps.forEach(function (st) { out.push(st); }); });
    return out;
  }
  function doneCount(list) {
    return list.filter(function (st) { return !!State.checks[st.k]; }).length;
  }

  function enLineHtml(en, cn) {
    return '<div class="sop-en">' +
      '<span class="sop-en-t">' + esc(en) + '</span>' +
      '<span class="sop-en-cn">' + esc(cn || "") + '</span>' +
      '<span class="sop-en-btns">' +
      '<button class="play-btn" data-action="play-text" data-text="' + esc(en) + '" title="朗读">▶</button>' +
      '<button class="play-btn" data-action="sop-copy" data-text="' + esc(en) + '" title="复制">📋</button>' +
      '</span></div>';
  }

  function rulesHtml() {
    return '<div class="sop-rules">' + RULES.map(function (r) {
      return '<div class="sop-rule">' +
        '<div class="sop-rule-h"><span class="sop-rule-ic">' + r.icon + '</span><b>' + esc(r.t) + '</b></div>' +
        '<p>' + esc(r.cn) + '</p>' +
        enLineHtml(r.en, "") +
        '</div>';
    }).join("") + '</div>';
  }

  function flowHtml() {
    var all = allSteps();
    var pct = Math.round(doneCount(all) / all.length * 100);
    var stages = STAGES.map(function (s) {
      var d = doneCount(s.steps);
      var sp = Math.round(d / s.steps.length * 100);
      var steps = s.steps.map(function (st, i) {
        var on = !!State.checks[st.k];
        return '<div class="sop-step' + (on ? " done" : "") + '">' +
          '<label class="sop-step-h">' +
          '<input type="checkbox" data-action="sop-check" data-k="' + st.k + '"' + (on ? " checked" : "") + '>' +
          '<span class="sop-step-n">' + (i + 1) + '</span>' +
          '<b>' + esc(st.cn) + '</b></label>' +
          '<p class="sop-step-note">' + esc(st.note) + '</p>' +
          enLineHtml(st.en, st.enCn) +
          '</div>';
      }).join("");
      return '<div class="card sop-stage">' +
        '<div class="sop-stage-h">' +
        '<div><b>' + s.icon + " " + esc(s.t) + '</b><span class="sop-stage-en">' + esc(s.en) + '</span></div>' +
        '<span class="sop-stage-pct">' + d + " / " + s.steps.length + '</span>' +
        '</div>' +
        '<div class="progressbar" style="margin:6px 0 10px"><i class="' + (sp === 100 ? "full" : "") + '" style="width:' + sp + '%"></i></div>' +
        '<p class="sop-stage-lead">' + esc(s.lead) + '</p>' +
        steps +
        '</div>';
    }).join("");

    var self = SELFCHECK.map(function (x, i) {
      return '<details class="sop-qa"><summary><b>Q' + (i + 1) + '.</b> ' + esc(x.q) + '</summary><p>' + esc(x.a) + '</p></details>';
    }).join("");

    return rulesHtml() +
      '<div class="card sop-overall">' +
      '<div class="sop-overall-h"><b>📋 实操清单完成度</b><span>' + doneCount(all) + " / " + all.length + '（' + pct + '%）</span></div>' +
      '<div class="progressbar"><i class="' + (pct === 100 ? "full" : "") + '" style="width:' + pct + '%"></i></div>' +
      '<div class="sop-overall-a">' +
      '<button class="btn btn-outline btn-sm" data-action="sop-reset">↺ 清空勾选</button>' +
      '<span class="sop-hint">勾选状态保存在本浏览器，下次打开继续。每接一单可以清空重走一遍。</span>' +
      '</div></div>' +
      stages +
      '<div class="card"><div class="chat-head"><span>🚧 红线自查 10 问 · 你做对了吗？</span><span class="sop-hint">点开看答案</span></div>' + self + '</div>';
  }

  function docsHtml() {
    var rows = DOC_TABLE.map(function (d) {
      return '<tr><td><b>' + esc(d.ab) + '</b><span class="sop-td-en">' + esc(d.en) + '</span></td>' +
        '<td>' + esc(d.cn) + '</td><td>' + esc(d.by) + '</td><td>' + esc(d.use) + '</td>' +
        '<td class="sop-warn">' + esc(d.warn) + '</td></tr>';
    }).join("");

    var fieldCard = function (title, list, tip) {
      return '<div class="card"><div class="chat-head"><span>' + title + '</span></div>' +
        '<div class="sop-chips">' + list.map(function (f) { return '<span class="sop-chip">' + esc(f) + '</span>'; }).join("") + '</div>' +
        (tip ? '<p class="sop-tipline">' + esc(tip) + '</p>' : "") + '</div>';
    };

    var consist = '<div class="card"><div class="chat-head"><span>🔍 单单一致核对器</span>' +
      '<span class="sop-hint">把四份单据上的关键字段抄进去，一键找出打架的地方</span></div>' +
      '<div class="sop-table-wrap"><table class="sop-table sop-consist"><thead><tr><th>字段</th>' +
      CONSIST_COLS.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join("") +
      '</tr></thead><tbody>' +
      CONSIST_ROWS.map(function (r) {
        return '<tr><td class="sop-consist-lbl">' + esc(r.label) + '</td>' +
          CONSIST_COLS.map(function (c) {
            return '<td><input type="text" id="cs-' + r.k + "-" + c.k + '" placeholder="—"></td>';
          }).join("") + '</tr>';
      }).join("") +
      '</tbody></table></div>' +
      '<div class="sop-overall-a"><button class="btn btn-primary btn-sm" data-action="sop-consist">🔍 开始核对</button>' +
      '<span class="sop-hint">留空的格子不参与比较；大小写与多余空格会自动忽略。</span></div>' +
      '<div id="sopConsistOut" class="sop-out" hidden></div></div>';

    return '<div class="card"><div class="chat-head"><span>🗓 五种单据：什么阶段用哪一份</span>' +
      '<span class="sop-hint">把 PI 当 CI 用是新手最常见的返工</span></div>' +
      '<div class="sop-table-wrap"><table class="sop-table"><thead><tr><th>单据</th><th>时机</th><th>法律效力</th><th>用途</th><th>常见形式</th><th>提醒</th></tr></thead><tbody>' +
      DOC_STAGE.map(function (d) {
        return '<tr><td><b>' + esc(d.d) + '</b></td><td>' + esc(d.when) + '</td><td>' + esc(d.law) + '</td>' +
          '<td>' + esc(d.use) + '</td><td>' + esc(d.form) + '</td><td class="sop-warn">' + esc(d.warn) + '</td></tr>';
      }).join("") + '</tbody></table></div></div>' +
      '<div class="card"><div class="chat-head"><span>📑 常用出口单证：谁出、干什么用、错在哪</span></div>' +
      '<div class="sop-table-wrap"><table class="sop-table"><thead><tr><th>简称</th><th>中文</th><th>出具方</th><th>用途</th><th>注意事项</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>' +
      fieldCard("🧾 形式发票 PI 字段清单", PI_FIELDS, "单价一栏务必注明含税或不含税：不写默认不含税，是最常见的报价纠纷来源。") +
      fieldCard("🧮 商业发票 CI 必备字段", CI_FIELDS, "CI 是清关与结汇的核心单据：船名航次、提单号、装船日期三项与提单不一致，海关第一步就退单；金额大小写不一致，银行审单直接算不符点。") +
      fieldCard("📜 销售合同条款骨架（11 条）", CONTRACT_ARTICLES, "大额订单、新客户、L/C 项下建议签正式合同；付款条款只写一种方式，不要写「T/T 或 L/C」这种模糊表述。") +
      '<div class="card"><div class="chat-head"><span>⚖️ 制单八条铁律</span><span class="sop-hint">每一条都对应一次真实返工</span></div>' +
      '<ul class="tip-list">' + DOC_RULES.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + '</ul></div>' +
      fieldCard("🏭 内部生产计划单字段清单", PLAN_FIELDS, "一张计划单要让车间不用再问业务：规格、色数、包装、留样要求全部落在纸上。") +
      fieldCard("📦 装箱单字段清单", PACK_FIELDS, "CBM = 长 × 宽 × 高 ÷ 1000000 × 箱数（长宽高单位为厘米）。毛重与净重要分开填，别用估值。") +
      consist;
  }

  function logiHtml() {
    var modes = SHIP_MODES.map(function (m) {
      return '<div class="card sop-mode"><div class="chat-head"><span>' + m.icon + " " + esc(m.t) + '</span></div>' +
        '<table class="sop-kv"><tbody>' +
        '<tr><th>适用</th><td>' + esc(m.fit) + '</td></tr>' +
        '<tr><th>时效</th><td>' + esc(m.time) + '</td></tr>' +
        '<tr><th>成本</th><td>' + esc(m.cost) + '</td></tr>' +
        '<tr><th>单据</th><td>' + esc(m.doc) + '</td></tr>' +
        '<tr><th>要点</th><td>' + esc(m.note) + '</td></tr>' +
        '</tbody></table>' + enLineHtml(m.en, "") + '</div>';
    }).join("");

    var emodes = EXPORT_MODES.map(function (x) {
      return '<div class="sop-emode"><b>' + esc(x.m) + '</b>' +
        '<table class="sop-kv"><tbody>' +
        '<tr><th>收款账户</th><td>' + esc(x.pay) + '</td></tr>' +
        '<tr><th>报关通道</th><td>' + esc(x.chan) + '</td></tr>' +
        '<tr><th>需备资料</th><td>' + esc(x.doc) + '</td></tr>' +
        '<tr><th>提醒</th><td class="sop-warn">' + esc(x.note) + '</td></tr>' +
        '</tbody></table></div>';
    }).join("");

    return modes +
      '<div class="card"><div class="chat-head"><span>🗂 报关资料清单</span><span class="sop-hint">交报关行前逐项过一遍</span></div>' +
      '<ul class="tip-list">' + CUSTOMS_DOCS.map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") + '</ul>' +
      '<p class="sop-tipline">通常预留至少 2 天通关时间；截单、截关、截重柜（VGM）三个时间点都要从开船日倒推。</p></div>' +
      '<div class="card"><div class="chat-head"><span>📝 申报要素（填错要退单重报）</span></div>' +
      '<div class="sop-chips">' + DECL_ELEMENTS.map(function (d) { return '<span class="sop-chip">' + esc(d) + '</span>'; }).join("") + '</div>' +
      '<p class="sop-tipline">软包装成品（袋、膜）与胶粘剂、油墨的 HS 编码不同，归类前先看材质与用途；同一票货多个品名时，逐项申报比合并申报安全。</p></div>' +
      '<div class="card"><div class="chat-head"><span>💼 四种常见出货与收款模式</span><span class="sop-hint">按贸易术语与收款主体区分资料准备</span></div>' +
      emodes + '</div>' +
      '<div class="card"><div class="chat-head"><span>🧪 报检与危险品（软包装行业高频）</span></div>' +
      '<ul class="tip-list">' +
      '<li>属法定检验目录的货物需报检，凭出境货物报检单或通关单办理；食品接触材料出口常被要求提供合规声明与检测报告。</li>' +
      '<li>溶剂型复膜胶、油墨、稀释剂属危险化学品：需危险特性分类鉴定报告、危包证（性能鉴定 + 使用鉴定）、UN 包装标记、英文 MSDS 与危险公示标签。</li>' +
      '<li>危险品订舱要提前更久（通常 2 至 3 周），船公司要审 MSDS 与运输鉴定；空运多数溶剂型产品禁运，报价前先确认可运性。</li>' +
      '<li>无溶剂胶、水性胶多数按普货出口，这是给客户的成本优势，报价时可以主动说明。</li>' +
      '</ul></div>';
  }

  function payHtml() {
    var tl = TT_TIMELINE.map(function (x) {
      return '<div class="sop-tl"><span class="sop-tl-n">' + x.n + '</span>' +
        '<div><b>' + esc(x.t) + '</b><p>' + esc(x.cn) + '</p>' + enLineHtml(x.en, "") + '</div></div>';
    }).join("");

    var cmp = PAY_COMPARE.map(function (c) {
      var cls = c.risk === "低到中" ? "ok" : (c.risk === "中" ? "mid" : "bad");
      return '<tr><td><b>' + esc(c.m) + '</b></td><td><span class="sop-risk ' + cls + '">' + esc(c.risk) + '</span></td><td>' + esc(c.cn) + '</td></tr>';
    }).join("");

    return '<div class="card"><div class="chat-head"><span>💵 T/T 分段收款时间轴</span><span class="sop-hint">顺序错一步，控货权就没了</span></div>' + tl + '</div>' +
      '<div class="card"><div class="chat-head"><span>⚠️ T/T 风险点与对策</span></div>' +
      '<ul class="tip-list">' + TT_RISKS.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + '</ul></div>' +
      '<div class="card"><div class="chat-head"><span>🏛 L/C 风险点与审证要点</span></div>' +
      '<ul class="tip-list">' + LC_RISKS.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + '</ul></div>' +
      '<div class="card"><div class="chat-head"><span>📊 五种付款方式风险排序</span></div>' +
      '<div class="sop-table-wrap"><table class="sop-table"><thead><tr><th>付款方式</th><th>卖方风险</th><th>说明</th></tr></thead><tbody>' + cmp + '</tbody></table></div>' +
      '<p class="sop-tipline">风控三件套：客户资信调查（企业注册信息、行业口碑、付款记录）、出口信用保险、账期与额度分级管理。新客户一律定金起步。</p></div>' +
      '<div class="card"><div class="chat-head"><span>✍️ 付款条款速查：合同与 PI 里怎么写</span>' +
      '<span class="sop-hint">新客户默认 T/T 30/70 或 L/C at sight</span></div>' +
      '<div class="sop-table-wrap"><table class="sop-table"><thead><tr><th>写法</th><th>含义</th><th>适用场景</th></tr></thead><tbody>' +
      PAY_TERMS_QUICK.map(function (x) {
        return '<tr><td><b>' + esc(x.t) + '</b></td><td>' + esc(x.cn) + '</td><td>' + esc(x.use) + '</td></tr>';
      }).join("") + '</tbody></table></div>' +
      '<p class="sop-tipline">付款条款只能写一种：写成「T/T 或 L/C」等于没约定，出问题时双方各执一词。账期类条款要同时写清起算日（提单日 / 到港日 / 发票日）。</p></div>' +
      '<div class="card"><div class="chat-head"><span>🔎 发货前先查客户：五信源尽调</span>' +
      '<span class="sop-hint">十分钟能判断的事，不要等尾款拖三个月再查</span></div>' +
      DD_SOURCES.map(function (d) {
        return '<div class="sop-tl"><span class="sop-tl-n">' + d.n + '</span><div><b>' + esc(d.t) + '</b><p>' + esc(d.cn) + '</p></div></div>';
      }).join("") +
      '<p class="sop-tipline">尽调三条纪律：每个结论都要有来源链接；查不到就写「未查到」，不要推测；命中制裁或出口管制名单立即停止交易并上报。</p></div>' +
      '<div class="card"><div class="chat-head"><span>🚩 高风险客户红旗信号</span></div>' +
      '<ul class="tip-list">' + DD_FLAGS.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + '</ul></div>' +
      '<div class="card"><div class="chat-head"><span>🗣 催款英文话术（由软到硬）</span><span class="sop-hint">可朗读、可复制</span></div>' +
      CHASE_LINES.map(function (l) { return enLineHtml(l.en, l.cn); }).join("") + '</div>';
  }

  /* 合同与合规：直接复用 U16（js/data-risk.js）的词汇/例句，单一数据源自动同步 */
  function legalHtml() {
    var u = (typeof FTE_DATA !== "undefined" && FTE_DATA.units && FTE_DATA.units.find) ? FTE_DATA.units.find(function (x) { return x.id === 16; }) : null;
    var vocab = (u && u.vocab) ? u.vocab : [];
    if (!vocab.length) return '<div class="card"><div class="chat-head"><span>⚖️ 合同与合规</span></div><p class="sop-tipline">词汇库未就绪，请先确保 js/data-risk.js 已加载。</p></div>';
    var RISK = /\b(breach|force majeure|liquidated|penalty|damages|indemn|liab|claim|dispute|settle|arbitr|mediat|litig|govern|jurisdic|terminat|nonperform|warrant|remedy|waiver|confident|notice|amendment)/i;
    var COMP = /\b(compliance|declaration of conformity|food contact|migration|CE marking|UKCA|FCC|FDA|REACH|SVHC|RoHS|phthalate|certificate of analysis|material safety|test report)\b/i;
    var risk = vocab.filter(function (v) { return RISK.test(v.w + " " + v.cn) && !COMP.test(v.w + " " + v.cn); });
    var comp = vocab.filter(function (v) { return COMP.test(v.w + " " + v.cn); });

    var card = function (icon, title, list, hint) {
      return '<div class="card"><div class="chat-head"><span>' + icon + " " + title + '</span>' +
        '<span class="sop-hint">点 ▶ 朗读 · 点 📋 复制，进 U16 练整段对话</span></div>' +
        list.map(function (v) {
          return '<div class="sop-tl"><div><b>' + esc(v.w) + '</b> ' +
            '<span class="sop-en-cn">' + esc(v.ipa || "") + '</span> — ' + esc(v.cn) + '</div>' +
            enLineHtml(v.ex, v.exCn) + '</div>';
        }).join("") +
        (hint ? '<p class="sop-tipline">' + esc(hint) + '</p>' : "") +
        '<div class="sop-overall-a" style="margin-top:10px"><a class="btn btn-soft btn-sm" href="#/unit/16">去 U16 练整段对话 →</a></div></div>';
    };

    return card("📜", "合同风险与争议解决", risk,
      "签合同先看三块：违约与救济（谁来赔、赔多少、怎么赔）、争议解决（先协商→仲裁还是诉讼、在哪、适用哪国法）、以及通知与保密。仲裁通常比在外国法院诉讼更可控。") +
      card("🧪", "产品认证与市场合规", comp,
      "认证没有一个标志走天下：CE 管欧盟、UKCA 管英国、FCC/UL 管美国；软包装还要盯食品接触的迁移限量（EU 1935/2004、美国 FDA 21 CFR）。务必让供应商提供对应批次的 CoA、MSDS 与第三方检测报告，而不是一句『合规』了事。");
  }

  function termsHtml() {
    var rows = INCOTERMS.map(function (t) {      var sellerCls = function (v) { return v.indexOf("卖方") === 0 ? ' class="sop-seller"' : ""; };
      return '<tr><td><b>' + esc(t.ab) + '</b><span class="sop-td-en">' + esc(t.cn) + '</span></td>' +
        '<td>' + esc(t.mode) + '</td>' +
        '<td>' + esc(t.risk) + '</td>' +
        '<td' + sellerCls(t.exp) + '>' + esc(t.exp) + '</td>' +
        '<td' + sellerCls(t.main) + '>' + esc(t.main) + '</td>' +
        '<td' + sellerCls(t.ins) + '>' + esc(t.ins) + '</td>' +
        '<td' + sellerCls(t.imp) + '>' + esc(t.imp) + '</td>' +
        '<td class="sop-warn">' + esc(t.note) + '</td></tr>';
    }).join("");

    var myths = TERM_MYTHS.map(function (m) {
      return '<details class="sop-qa" open><summary><b>' + esc(m.q) + '</b></summary><p>' + esc(m.a) + '</p></details>';
    }).join("");

    var adv = TERM_ADVICE.map(function (a) {
      return '<tr><td>' + esc(a.who) + '</td><td><b>' + esc(a.pick) + '</b></td><td>' + esc(a.why) + '</td></tr>';
    }).join("");

    return '<div class="card"><div class="chat-head"><span>📐 Incoterms 2020 · 11 种术语责任速查</span>' +
      '<span class="sop-hint">蓝底格 = 卖方责任</span></div>' +
      '<div class="sop-table-wrap"><table class="sop-table sop-terms"><thead><tr>' +
      '<th>术语</th><th>运输方式</th><th>风险转移点</th><th>出口清关</th><th>主运费</th><th>保险</th><th>进口清关</th><th>要点</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="sop-tipline">合同写法用三段式：术语 + 具体地点 + 版本，例如「CIF Hamburg Incoterms 2020」「FCA Shenzhen Airport Incoterms 2020」。只写 FOB 不写港口，争议时谁都说不清。</p></div>' +
      '<div class="card"><div class="chat-head"><span>❌ 三大常见误区</span></div>' + myths + '</div>' +
      '<div class="card"><div class="chat-head"><span>✅ 怎么选：一句话建议</span></div>' +
      '<div class="sop-table-wrap"><table class="sop-table"><thead><tr><th>你的角色</th><th>推荐术语</th><th>理由</th></tr></thead><tbody>' + adv + '</tbody></table></div></div>';
  }

  function toolsHtml() {
    var opts = TPL.map(function (t) { return '<option value="' + t.k + '">' + esc(t.label) + '</option>'; }).join("");
    return '<div class="card"><div class="chat-head"><span>🧮 CBM 与装柜估算</span>' +
      '<span class="sop-hint">CBM = 长 × 宽 × 高 ÷ 1000000 × 箱数</span></div>' +
      '<div class="form-row">' +
      '<div class="field"><label>外箱长 L（cm）</label><input type="text" id="cbmL" value="60"></div>' +
      '<div class="field"><label>外箱宽 W（cm）</label><input type="text" id="cbmW" value="40"></div>' +
      '<div class="field"><label>外箱高 H（cm）</label><input type="text" id="cbmH" value="35"></div>' +
      '<div class="field"><label>箱数 CTNS</label><input type="text" id="cbmN" value="300"></div>' +
      '<div class="field"><label>单箱毛重（kg，可选）</label><input type="text" id="cbmG" value="12"></div>' +
      '</div>' +
      '<button class="btn btn-primary btn-sm" data-action="sop-cbm">计算</button>' +
      '<div id="sopCbmOut" class="sop-out" hidden></div></div>' +

      '<div class="card"><div class="chat-head"><span>💱 FOB → CFR / CIF 报价换算</span>' +
      '<span class="sop-hint">CIF =（FOB + 运费）÷（1 − 保险费率 × 投保加成）</span></div>' +
      '<div class="form-row">' +
      '<div class="field"><label>FOB 总价（USD）</label><input type="text" id="cifFob" value="20000"></div>' +
      '<div class="field"><label>海运费 + 港杂（USD）</label><input type="text" id="cifFrt" value="1800"></div>' +
      '<div class="field"><label>保险费率（%）</label><input type="text" id="cifRate" value="0.6"></div>' +
      '<div class="field"><label>投保加成（%）</label><input type="text" id="cifMark" value="110"></div>' +
      '<div class="field"><label>佣金（%，可选）</label><input type="text" id="cifComm" value="0"></div>' +
      '<div class="field"><label>换汇目标币种</label><select id="cifCc"><option value="">不换算</option><option value="CNY">人民币 CNY</option><option value="EUR">欧元 EUR</option><option value="GBP">英镑 GBP</option><option value="JPY">日元 JPY</option></select></div>' +
      '</div>' +
      '<button class="btn btn-primary btn-sm" data-action="sop-cif">计算</button>' +
      '<div id="sopCifOut" class="sop-out" hidden></div></div>' +

      '<div class="card"><div class="chat-head"><span>🏷 HS 编码速查（软包装常用，第 39/32/48 章）</span>' +
      '<span class="sop-hint">快速参考 · 报关以海关系统实际归类为准</span></div>' +
      HS_REF_HTML() +
      '<p class="sop-tipline">这是给常见商品的 6/8 位**参考**编码，最终归类由报关行按商品材质、用途与海关总署归类决定；申报要素还需另填品牌、用途、净重毛重与件数。完整查询走官方「互联网+海关 / 单一窗口」。</p></div>' +

      '<div class="card"><div class="chat-head"><span>🪙 汇率查询（联网获取当日汇率，离线用最近缓存）</span>' +
      '<span class="sop-hint">用于报价时换算人民币成本</span></div>' +
      '<div class="sop-overall-a"><button class="btn btn-primary btn-sm" data-action="sop-rates">🪙 获取今日汇率</button>' +
      '<span class="sop-hint" id="rateStatus">离线未联网时使用上次缓存，并标注汇率日期，避免用旧汇率对外报价。</span></div>' +
      '<div id="rateOut" class="sop-out" hidden></div></div>' +

      '<div class="card"><div class="chat-head"><span>✉️ 英文节点通知模板生成器</span>' +
      '<span class="sop-hint">节点主动同步，客户信任就是这样攒出来的</span></div>' +
      '<div class="form-row">' +
      '<div class="field"><label>节点</label><select id="tplNode">' + opts + '</select></div>' +
      '<div class="field"><label>客户称呼</label><input type="text" id="tplName" value="Mr. Brown"></div>' +
      '<div class="field"><label>订单号 / PO</label><input type="text" id="tplPo" value="PO 24-0518"></div>' +
      '<div class="field"><label>日期</label><input type="text" id="tplDate" value="June 20"></div>' +
      '<div class="field"><label>船名航次（可选）</label><input type="text" id="tplVessel" value="MSC ANNA / 428W"></div>' +
      '<div class="field"><label>提单号（可选）</label><input type="text" id="tplBl" value="MSCUSH123456"></div>' +
      '<div class="field"><label>ETA（可选）</label><input type="text" id="tplEta" value="July 22"></div>' +
      '<div class="field"><label>你的署名</label><input type="text" id="tplMe" value="Lisa"></div>' +
      '</div>' +
      '<div class="sop-overall-a">' +
      '<button class="btn btn-primary btn-sm" data-action="sop-tpl">✨ 生成英文邮件</button>' +
      '<button class="btn btn-soft btn-sm" data-action="sop-tpl-copy">📋 复制</button>' +
      '<button class="btn btn-outline btn-sm" data-action="sop-tpl-say">🔊 朗读</button>' +
      '</div>' +
      '<textarea id="tplOut" class="sop-textarea" rows="12" placeholder="点「生成英文邮件」后在这里出现，可直接编辑再复制。">' + esc(State.tplOut) + '</textarea></div>';
  }

  /* ---------- HS 速查表（内嵌，file:// 也可用） ---------- */
  var HS_REF = [
    { code: "3920.20", en: "Other plates, sheets, film... of polymers of propylene | PP 薄膜", cn: "聚丙烯 PP 薄膜" },
    { code: "3920.10", en: "Plates, sheets, film of polymers of ethylene | PE film", cn: "聚乙烯 PE 薄膜/膜" },
    { code: "3920.62", en: "Plates, sheets, film of poly(ethylene terephthalate) | PET", cn: "聚酯 PET 薄膜" },
    { code: "3920.32", en: "Flexible film of polymers of vinyl chloride | PVC 膜", cn: "聚氯乙烯 PVC 膜" },
    { code: "3921.90", en: "Other plates, sheets, film of plastics (incl. multi-layer)", cn: "其它塑料板/片/膜（含复合多层）" },
    { code: "3923.21", en: "Sacks and bags of polymers of ethylene | PE 袋", cn: "聚乙烯包装袋" },
    { code: "3923.29", en: "Sacks and bags of other plastics", cn: "其它塑料包装袋" },
    { code: "3923.90", en: "Other articles for the conveyance or packing of goods", cn: "其它塑料包装容器" },
    { code: "4819.40", en: "Other sacks and bags of paper/board (with backing, padded)", cn: "纸或纸板袋（含衬垫）" },
    { code: "4821.10", en: "Paper/board labels of all kinds, printed", cn: "印刷纸质标签" },
    { code: "3506.91", en: "Adhesives based on polymers (ready-to-use)", cn: "以聚合物为基料的胶粘剂" },
    { code: "3901.90", en: "Polymers of ethylene, in primary forms", cn: "初级形态乙烯聚合物" },
    { code: "3208.90", en: "Paints/varnishes in non-aqueous medium (ink/gum)", cn: "非水介质油漆/清漆/油墨基料" },
    { code: "3215.19", en: "Printing ink, other than black", cn: "其它印刷油墨" },
    { code: "7607.11 / 7607.19", en: "Aluminium foil (rolls)", cn: "铝箔（卷）" },
    { code: "3920.49 / 3920.99", en: "Oriented / other plastic film", cn: "定向/其它塑料薄膜" },
    { code: "3809.10", en: "Finishing agents / carriers for dyeing", cn: "染整助剂/载体（水性助剂）" },
    { code: "3912.39", en: "Cellulose ethers (in primary forms) — coating agent", cn: "纤维素醚（涂布助剂）" }
  ];
  function HS_REF_HTML() {
    return '<div class="sop-table-wrap"><table class="sop-table"><thead><tr><th>HS 编码</th><th>官方英文品名（节选）</th><th>软包装商品</th></tr></thead><tbody>' +
      HS_REF.map(function (h) {
        return '<tr><td><b>' + esc(h.code) + '</b></td><td>' + esc(h.en) + '</td><td>' + esc(h.cn) + '</td></tr>';
      }).join("") + '</tbody></table></div>';
  }

  /* ---------- 汇率 ---------- */
  var RATES_KEY = "fte-rates-v1";
  var RATES_API = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json";
  function loadRatesCache() {
    try { return JSON.parse(localStorage.getItem(RATES_KEY)) || null; } catch (e) { return null; }
  }
  function saveRatesCache(o) {
    try { localStorage.setItem(RATES_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ }
  }
  function fmtRate(v) {
    if (v == null || isNaN(v)) return "—";
    return (v >= 1 ? v.toFixed(2) : v.toFixed(4));
  }
  function renderRates(o) {
    var out = document.getElementById("rateOut");
    if (!out) return;
    var d = o.date || (o.updatedAt ? o.updatedAt.slice(0, 10) : "未知");
    out.hidden = false;
    var rows = (o.rates || {}).CNY || {};
    var codes = ["CNY", "EUR", "GBP", "JPY"];
    out.innerHTML = '<table class="sop-kv"><tbody>' +
      codes.map(function (c) {
        return '<tr><th>USD → ' + c + '</th><td><b>' + fmtRate(rows[c]) + '</b></td></tr>';
      }).join("") +
      "</tbody></table>" +
      '<p class="sop-tipline">汇率日期：' + esc(d) + '（数据源：fawazahmed0/currency-api，CC0）。报价务必以结算当日银行汇价为准，本表仅作估算。</p>';
    var st = document.getElementById("rateStatus");
    if (st) st.textContent = "上次获取：" + d + "（离线仍在用此缓存）";
  }
  function doRates() {
    var cached = loadRatesCache();
    if (!navigator.onLine) {
      if (cached) { renderRates(cached); toast("当前离线，显示最近一次汇率 " + (cached.date || "")); }
      else toast("当前离线且暂无汇率缓存，联网后再试");
      return;
    }
    toast("正在获取今日汇率…");
    fetch(RATES_API).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (j) {
      var rec = { date: (j.date || new Date().toISOString().slice(0, 10)), rates: j, updatedAt: new Date().toISOString() };
      saveRatesCache(rec);
      renderRates(rec);
      toast("✅ 已获取 " + rec.date + " 汇率");
    }).catch(function (e) {
      if (cached) { renderRates(cached); toast("联网失败，显示最近缓存：" + (cached.date || "")); }
      else toast("获取汇率失败：" + e.message);
    });
  }

  /* 页脚：配套课程单元 + 参考来源（每个 Tab 都显示） */
  function footerHtml() {
    var units = RELATED_UNITS.map(function (u) {
      return '<a class="sop-unit-link" href="#/unit/' + u.id + '">' +
        '<span class="sop-unit-ic">' + u.icon + '</span>' +
        '<span><b>' + esc(u.t) + '</b><em>' + esc(u.cn) + '</em></span></a>';
    }).join("");
    var refs = REFS.map(function (r) {
      return '<li><a href="' + esc(r.u) + '" target="_blank" rel="noopener noreferrer">' + esc(r.t) + '</a>' +
        '<span class="sop-ref-cn">' + esc(r.cn) + '</span></li>';
    }).join("");
    return '<div class="card"><div class="chat-head"><span>🎧 配套课程：把流程里的话用英文说出来</span>' +
      '<span class="sop-hint">流程走对之后，进对应单元练词汇、短语与对话</span></div>' +
      '<div class="sop-unit-links">' + units + '</div>' +
      '<div class="sop-overall-a" style="margin-top:12px">' +
      '<a class="btn btn-soft btn-sm" href="#/speak">🎤 用这些对话做跟读听写 →</a>' +
      '<a class="btn btn-outline btn-sm" href="#/tutor">🤖 让 AI 陪练扮演客户或货代 →</a>' +
      '</div></div>' +
      '<div class="card"><div class="chat-head"><span>📚 参考来源</span>' +
      '<span class="sop-hint">规则以官方原文为准，实操惯例按公司与航线略有差异</span></div>' +
      '<ul class="sop-refs">' + refs + '</ul></div>';
  }

  function render() {
    var app = document.getElementById("app");
    if (!app) return;
    load();
    var body = State.tab === "docs" ? docsHtml()
      : State.tab === "logi" ? logiHtml()
        : State.tab === "pay" ? payHtml()
          : State.tab === "legal" ? legalHtml()
            : State.tab === "terms" ? termsHtml()
            : State.tab === "tools" ? toolsHtml()
              : State.tab === "docgen" ? docgenHtml()
              : flowHtml();

    app.innerHTML = '<div class="page-head">' +
      '<h2>🧭 外贸实操 SOP · 你做对了吗？</h2>' +
      '<div class="en">Export Operations SOP — from order confirmation to payment collection</div>' +
      '<p style="margin-top:8px;color:var(--muted);max-width:820px">订单确认才是大货交付的起点。这里把内部流转、单证制作、运输报关、收款风控拆成可勾选的动作，每一步都配一句可以直接发出去的英文——先把流程走对，英文才用得上。</p>' +
      '</div>' +
      '<div class="tabs">' + TABS.map(function (t) {
        return '<button class="tab' + (State.tab === t.k ? " active" : "") + '" data-action="sop-tab" data-tab="' + t.k + '">' + t.label + '</button>';
      }).join("") + '</div>' +
      '<div id="sopBody">' + body + footerHtml() + '</div>';
    if (State.tab === "docgen") dgLineBody();
  }

  /* ================= 交互 ================= */
  /* 集装箱内尺寸（经验值，米）。实际以货代/船公司实测为准。 */
  var CONTAINERS = [
    { k: "20GP", name: "20GP", L: 5.90, W: 2.35, H: 2.39, cbm: 33.2, pay: 17500 },
    { k: "40GP", name: "40GP", L: 12.03, W: 2.35, H: 2.39, cbm: 67.5, pay: 26500 },
    { k: "40HQ", name: "40HQ", L: 12.03, W: 2.35, H: 2.69, cbm: 76.0, pay: 26500 }
  ];
  /* 贪心 3D 装箱：统一尺寸纸箱，按 6 种朝向分别算能码多少，取最优（不是体积除法，避免系统性高估） */
  function fitCartons(c, l, w, h) {   // 纸箱 l/w/h 单位为米
    var dims = [l, w, h];
    var perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    var best = 0, i;
    for (i = 0; i < perms.length; i++) {
      var o = perms[i];
      var nx = Math.floor(c.L / dims[o[0]]);
      var ny = Math.floor(c.W / dims[o[1]]);
      var nz = Math.floor(c.H / dims[o[2]]);
      var f = nx * ny * nz;
      if (f > best) best = f;
    }
    return best;
  }
  function doCbm() {
    var L = num("cbmL"), W = num("cbmW"), H = num("cbmH"), N = num("cbmN"), G = num("cbmG");
    var l = L / 100, w = W / 100, h = H / 100;         // 输入为厘米 → 米
    var one = l * w * h;
    var total = one * N;
    var gw = G * N;
    var out = document.getElementById("sopCbmOut");
    if (!out) return;
    if (!(L > 0 && W > 0 && H > 0)) { out.hidden = false; out.innerHTML = '<p class="sop-warn">请先填入纸箱长宽高（厘米）。</p>'; return; }
    out.hidden = false;
    var rows = CONTAINERS.map(function (c) {
      var fits = fitCartons(c, l, w, h) || 0;
      var byWeight = G > 0 ? Math.floor(c.pay / G) : Infinity;   // 受限重
      var actual = Math.min(fits, N, byWeight);
      var note = byWeight < fits ? '（按限重 ' + (c.pay / 1000) + ' 吨，最多 ' + byWeight + ' 箱）' : '';
      var volOnly = c.cbm > 0 && one > 0 ? Math.floor(c.cbm / one) : 0;
      return "<tr><th>" + c.name + "</th><td><b>" + actual + "</b> 箱" + note +
        ' <span class="sop-hint">（按码放方向优化；旧体积法 ' + volOnly + ' 箱会高估）</span></td></tr>';
    }).join("");
    out.innerHTML = '<table class="sop-kv"><tbody>' +
      "<tr><th>单箱体积</th><td><b>" + one.toFixed(4) + "</b> CBM</td></tr>" +
      "<tr><th>总体积</th><td><b>" + total.toFixed(3) + "</b> CBM</td></tr>" +
      (G > 0 ? "<tr><th>总毛重</th><td><b>" + gw.toFixed(1) + "</b> KGS</td></tr>" : "") +
      rows +
      '</tbody></table><p class="sop-tipline">柜内尺寸与限重为经验值，实际以货代/船公司实测为准；20GP 重货一般不超过 17.5 吨。贪心按朝向码放，比体积除法更接近真实装载量。</p>';
  }

  function doCif() {
    var fob = num("cifFob"), frt = num("cifFrt"), rate = num("cifRate") / 100,
      mark = num("cifMark") / 100, comm = num("cifComm") / 100;
    var cfr = fob + frt;
    var denom = 1 - rate * mark;
    var out = document.getElementById("sopCifOut");
    if (!out) return;
    out.hidden = false;
    if (denom <= 0) {
      out.innerHTML = '<p class="sop-warn">保险费率与投保加成组合不合理，请检查输入。</p>';
      return;
    }
    var cif = cfr / denom;
    var prem = cif * mark * rate;
    var net = comm > 0 && comm < 1 ? cif / (1 - comm) : cif;
    var cc = val("cifCc");
    var conv = "";
    if (cc) {
      var cached = loadRatesCache();
      var ccy = cached && cached.rates && cached.rates[cc] ? cached.rates[cc] : null;
      if (ccy) {
        /* usd.min.json 结构：{ "CNY": {"1": 7.23, "100": 723, ...} }，直接用 ccy["1"] */
        var perUsd = ccy["1"];
        if (perUsd != null) {
          var target = cif * perUsd;
          conv = "<tr><th>换算 USD → " + cc + "</th><td><b>" + target.toFixed(cc === "JPY" ? 0 : 2) + " " + cc + "</b>（cache日期 " + esc(cached.date || "—") + "，仅供参考）</td></tr>";
        } else {
          conv = "<tr><th>换算</th><td class='sop-warn'>缓存缺少该币种，点「获取今日汇率」刷新</td></tr>";
        }
      } else {
        conv = "<tr><th>换算</th><td class='sop-warn'>还没有汇率数据，先点「获取今日汇率」</td></tr>";
      }
    }
    out.innerHTML = '<table class="sop-kv"><tbody>' +
      "<tr><th>CFR 价</th><td><b>USD " + cfr.toFixed(2) + "</b>（FOB + 运费）</td></tr>" +
      "<tr><th>保险费</th><td>USD " + prem.toFixed(2) + "（按 CIF × " + (mark * 100).toFixed(0) + "% × " + (rate * 100).toFixed(2) + "%）</td></tr>" +
      "<tr><th>CIF 价</th><td><b>USD " + cif.toFixed(2) + "</b></td></tr>" +
      (comm > 0 ? "<tr><th>含佣价 CIFC" + (comm * 100).toFixed(0) + "</th><td><b>USD " + net.toFixed(2) + "</b>，佣金 USD " + (net - cif).toFixed(2) + "</td></tr>" : "") +
      conv +
      '</tbody></table><p class="sop-tipline">保险费按投保金额计收，投保金额通常为 CIF 价加成 10%，所以要用倒算公式而不是直接乘 FOB。DDP 报价还要再加进口关税、目的港清关与派送费。</p>';
  }

  function doConsist() {
    var out = document.getElementById("sopConsistOut");
    if (!out) return;
    var normal = function (s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); };
    var problems = [];
    var filledRows = 0;
    CONSIST_ROWS.forEach(function (r) {
      var vals = [];
      CONSIST_COLS.forEach(function (c) {
        var v = val("cs-" + r.k + "-" + c.k);
        if (v) vals.push({ col: c.label, raw: v, n: normal(v) });
      });
      if (!vals.length) return;
      filledRows++;
      var base = vals[0].n;
      var bad = vals.filter(function (v) { return v.n !== base; });
      if (bad.length) {
        problems.push({
          field: r.label,
          detail: vals.map(function (v) { return v.col + "：" + v.raw; }).join(" ｜ ")
        });
      }
      if (vals.length < CONSIST_COLS.length) {
        var miss = CONSIST_COLS.filter(function (c) { return !val("cs-" + r.k + "-" + c.k); }).map(function (c) { return c.label; });
        problems.push({ field: r.label + "（缺项）", detail: "未填写：" + miss.join("、") + "——请确认这些单据上确实不需要该字段。", soft: true });
      }
    });
    out.hidden = false;
    if (!filledRows) {
      out.innerHTML = '<p class="sop-warn">还没有填入任何字段，先抄两份单据上的数字试试。</p>';
      return;
    }
    var hard = problems.filter(function (p) { return !p.soft; });
    var soft = problems.filter(function (p) { return p.soft; });
    var html = "";
    if (!hard.length) {
      html += '<div class="sop-ok">✅ 已填字段在各单据间一致，可以继续。放单前再核一遍提单草稿上的收货人与通知方。</div>';
    } else {
      html += '<div class="sop-bad">❌ 发现 ' + hard.length + ' 处单单不一致，必须改到完全一致再交单：</div>' +
        '<ul class="tip-list" style="margin-top:10px">' + hard.map(function (p) {
          return "<li><b>" + esc(p.field) + "</b><br>" + esc(p.detail) + "</li>";
        }).join("") + "</ul>";
    }
    if (soft.length) {
      html += '<ul class="tip-list" style="margin-top:10px">' + soft.map(function (p) {
        return '<li style="border-left-color:var(--accent)"><b>' + esc(p.field) + "</b><br>" + esc(p.detail) + "</li>";
      }).join("") + "</ul>";
    }
    out.innerHTML = html;
  }

  function doTpl() {
    var k = val("tplNode");
    var t = TPL.filter(function (x) { return x.k === k; })[0] || TPL[0];
    var map = {
      "{NAME}": val("tplName") || "Mr. Brown",
      "{PO}": val("tplPo") || "PO 24-0518",
      "{DATE}": val("tplDate") || "June 20",
      "{VESSEL}": val("tplVessel") || "MSC ANNA / 428W",
      "{BL}": val("tplBl") || "MSCUSH123456",
      "{ETA}": val("tplEta") || "July 22",
      "{ME}": val("tplMe") || "Lisa"
    };
    var body = t.body;
    Object.keys(map).forEach(function (ph) {
      body = body.split(ph).join(map[ph]);
    });
    State.tplOut = body;
    var ta = document.getElementById("tplOut");
    if (ta) ta.value = body;
    toast("✨ 已生成，可直接编辑后复制");
  }

  /* ================= 单证同源生成器（PI / CI / PL 一键生成） =================
     一次录入买卖双方、订单与装运信息 + 明细行，同源生成形式发票 PI、商业发票 CI、
     装箱单 PL 三份，从源头杜绝「单单不一致」。核心零依赖、离线可用；
     导出 .xlsx 走 ExcelJS（运行时按需从 CDN 加载，加载失败自动回退打印/PDF 与 CSV）。
     数据存 localStorage：fte-docgen-v1。 */
  var DG_KEY = "fte-docgen-v1";
  var DG_STATE = null;
  var DG_FIELDS = [
    { id: "dgsellerName", lb: "公司名称 Company", grp: "seller", ph: "e.g. SoftPack Packaging Co., Ltd." },
    { id: "dgsellerAddr", lb: "地址 Address", grp: "seller" },
    { id: "dgsellerContact", lb: "联系人 / 电话 / 邮箱", grp: "seller" },
    { id: "dgsellerBank", lb: "开户行 Bank（名称+地址）", grp: "seller" },
    { id: "dgsellerAcc", lb: "账号 Account No.", grp: "seller" },
    { id: "dgsellerSwift", lb: "SWIFT", grp: "seller" },
    { id: "dgbuyerName", lb: "公司名称 Company", grp: "buyer" },
    { id: "dgbuyerAddr", lb: "地址 Address", grp: "buyer" },
    { id: "dgbuyerContact", lb: "联系人 / 电话 / 邮箱", grp: "buyer" },
    { id: "dgbuyerNotify", lb: "通知方 Notify Party（可空）", grp: "buyer" },
    { id: "dgorderNo", lb: "单号 Order / PI No.", grp: "order" },
    { id: "dgdate", lb: "日期 Date", grp: "order" },
    { id: "dgcurrency", lb: "币种 Currency", grp: "order" },
    { id: "dgincoterm", lb: "贸易术语 Incoterms", grp: "order" },
    { id: "dgplace", lb: "术语地点 / 目的港 Place", grp: "order" },
    { id: "dgpay", lb: "付款方式 Payment", grp: "order" },
    { id: "dgvalidity", lb: "有效期 Validity", grp: "order" },
    { id: "dgvessel", lb: "船名航次 Vessel & Voyage", grp: "ship" },
    { id: "dgbl", lb: "提单号 B/L No.", grp: "ship" },
    { id: "dgpol", lb: "装运港 Port of Loading", grp: "ship" },
    { id: "dgpod", lb: "卸货港 Port of Discharge", grp: "ship" },
    { id: "dgshipdate", lb: "装船日期 Ship Date", grp: "ship" },
    { id: "dgmarks", lb: "唛头 Shipping Mark", grp: "ship" }
  ];

  function money(n) { n = isFinite(n) ? n : 0; return n.toFixed(2); }
  function mon(n) { n = isFinite(n) ? n : 0; return (Math.round(n * 10) / 10).toFixed(1); }

  function dgDefault() {
    return {
      h: {
        dgsellerName: "", dgsellerAddr: "", dgsellerContact: "", dgsellerBank: "", dgsellerAcc: "", dgsellerSwift: "",
        dgbuyerName: "", dgbuyerAddr: "", dgbuyerContact: "", dgbuyerNotify: "",
        dgorderNo: "", dgdate: "", dgcurrency: "USD", dgincoterm: "FOB", dgplace: "", dgpay: "T/T 30% deposit, 70% before shipment", dgvalidity: "30 days",
        dgvessel: "", dgbl: "", dgpol: "", dgpod: "", dgshipdate: "", dgmarks: ""
      },
      items: [{ desc: "", hs: "", qty: "", unit: "PCS", price: "", nwt: "", gwt: "", ctns: "", cbm: "" }]
    };
  }
  function dgLoadState() {
    var base = dgDefault();
    var raw;
    try { raw = localStorage.getItem(DG_KEY); } catch (e) { return base; }
    if (!raw) return base;
    try {
      var o = JSON.parse(raw);
      if (o.h) Object.keys(base.h).forEach(function (k) { if (o.h[k] != null) base.h[k] = o.h[k]; });
      if (Array.isArray(o.items) && o.items.length) base.items = o.items;
    } catch (e) { /* ignore corrupt */ }
    return base;
  }
  function dgSaveState() {
    try { localStorage.setItem(DG_KEY, JSON.stringify({ h: DG_STATE.h, items: DG_STATE.items })); } catch (e) { /* ignore */ }
  }

  function dgField(f) {
    var v = DG_STATE.h[f.id] || "";
    var list = (f.id === "dgpol" || f.id === "dgpod") ? ' list="fte-ports" autocomplete="off"' : "";
    return '<div class="field"><label class="dg-field-lb">' + esc(f.lb) + '</label>' +
      '<input id="' + f.id + '" data-dg="' + f.id + '" value="' + esc(v) + '" placeholder="' + esc(f.ph || "") + '"' + list + '></div>';
  }
  function dgGrp(grp, title) {
    var arr = DG_FIELDS.filter(function (f) { return f.grp === grp; });
    if (!arr.length) return "";
    return '<div class="dg-lb">' + esc(title) + '</div><div class="dg-grid">' + arr.map(dgField).join("") + '</div>';
  }

  function dgLineRow(i, l) {
    l = l || {};
    var inp = function (k, w, type) {
      return '<td style="width:' + w + '"><input data-l="' + k + '" type="' + (type || "text") + '" value="' + esc(l[k] == null ? "" : l[k]) + '"></td>';
    };
    return '<tr data-dg-line>' +
      '<td class="dg-no">' + (i + 1) + '.</td>' +
      inp("desc", "") + inp("hs", "78px") +
      inp("qty", "62px", "number") + inp("unit", "54px") +
      inp("price", "72px", "number") + inp("nwt", "62px", "number") +
      inp("gwt", "62px", "number") + inp("ctns", "58px", "number") +
      inp("cbm", "58px", "number") +
      '<td style="width:24px"><button class="dg-rm" data-action="dg-rm" data-idx="' + (i + 1) + '" title="删除该行">✕</button></td>' +
      '</tr>';
  }
  function dgLineBody() {
    var tb = document.getElementById("dgLineBody");
    if (!tb) return;
    tb.innerHTML = DG_STATE.items.map(function (l, i) { return dgLineRow(i, l); }).join("");
  }
  function dgReadLines() {
    var out = [], rows = document.querySelectorAll("[data-dg-line]");
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var g = function (k) { var el = tr.querySelector('[data-l="' + k + '"]'); return el ? el.value : ""; };
      var r = {
        desc: g("desc"), hs: g("hs"),
        qty: parseFloat(g("qty")) || 0, unit: g("unit"),
        price: parseFloat(g("price")) || 0, nwt: parseFloat(g("nwt")) || 0,
        gwt: parseFloat(g("gwt")) || 0, ctns: parseFloat(g("ctns")) || 0, cbm: parseFloat(g("cbm")) || 0
      };
      var no = tr.querySelector(".dg-no"); if (no) no.textContent = (i + 1) + ".";
      out.push(r);
    }
    return out;
  }

  function dgBuild() {
    var h = {};
    DG_FIELDS.forEach(function (f) { h[f.id] = val(f.id); });
    var items = dgReadLines();
    var cur = (h.dgcurrency && String(h.dgcurrency).trim()) ? String(h.dgcurrency).trim() : "USD";
    var totalAmount = 0, totalQty = 0, totalNwt = 0, totalGwt = 0, totalCtn = 0, totalCBM = 0;
    items.forEach(function (r) {
      var amt = (r.price || 0) * (r.qty || 0);
      r.amount = amt;
      totalAmount += amt; totalQty += r.qty || 0;
      totalNwt += (r.nwt || 0) * (r.qty || 0); totalGwt += (r.gwt || 0) * (r.qty || 0);
      totalCtn += r.ctns || 0; totalCBM += r.cbm || 0;
    });
    return {
      h: h, items: items, cur: cur,
      totalAmount: totalAmount, totalQty: totalQty, totalNwt: totalNwt,
      totalGwt: totalGwt, totalCtn: totalCtn, totalCBM: totalCBM
    };
  }

  function dgDoc(type, S) {
    var h = S.h, cur = S.cur;
    var join = function (arr) { return arr.filter(function (x) { return x; }).join(", "); };
    var seller = join([h.dgsellerName, h.dgsellerAddr]);
    var buyer = join([h.dgbuyerName, h.dgbuyerAddr]);
    var ship = function () {
      return [
        ["Vessel & Voyage", h.dgvessel], ["B/L No.", h.dgbl],
        ["Port of Loading", h.dgpol], ["Port of Discharge", h.dgpod],
        ["Ship Date", h.dgshipdate], ["Shipping Mark", h.dgmarks]
      ];
    };
    var title, info, th, rows, sum;
    if (type === "PL") {
      title = "PACKING LIST";
      info = [["Doc No.", h.dgorderNo], ["Date", h.dgdate], ["Shipper", seller], ["Buyer", buyer]].concat(ship());
      th = ["No", "Description", "HS", "Cartons", "Qty", "Net Wt (KGS)", "Gross Wt (KGS)", "CBM"];
      S.items.forEach(function (r, i) {
        rows = rows || [];
        rows.push([(i + 1) + ".", r.desc || "", r.hs || "", r.ctns || 0, r.qty || 0, mon(r.nwt * r.qty), mon(r.gwt * r.qty), r.cbm || ""]);
      });
      sum = ["Totals: " + S.totalCtn + " cartons / " + S.totalQty + " pcs  |  Net " + mon(S.totalNwt) + " KGS  |  Gross " + mon(S.totalGwt) + " KGS  |  " + mon(S.totalCBM) + " CBM"];
    } else {
      title = type === "PI" ? "PROFORMA INVOICE" : "COMMERCIAL INVOICE";
      info = [["Doc No.", h.dgorderNo], ["Date", h.dgdate], ["Invoice No.", h.dgorderNo], ["Seller", seller], ["Buyer", buyer]];
      info.push(["Trade Term", join([h.dgincoterm, h.dgplace])]);
      info.push(["Payment", h.dgpay], ["Currency", cur]);
      if (type === "CI") info = info.concat(ship());
      else info.push(["Validity", h.dgvalidity], ["Bank", join([h.dgsellerBank, h.dgsellerAcc, h.dgsellerSwift])]);
      th = ["No", "Description", "HS", "Qty", "Unit", "Unit Price", "Amount"];
      rows = [];
      S.items.forEach(function (r, i) {
        rows.push([(i + 1) + ".", r.desc || "", r.hs || "", r.qty || 0, r.unit || "", money(r.price), money(r.amount) + " " + cur]);
      });
      sum = ["Total Qty: " + S.totalQty + "   |   Total Amount: " + money(S.totalAmount) + " " + cur];
    }
    var metaHtml = info.map(function (p) { return '<div class="dg-meta"><b>' + esc(p[0]) + '</b> ' + esc(p[1] || "") + '</div>'; }).join("");
    var tableHtml = '<table class="sop-table"><thead><tr>' + th.map(function (t) { return '<th>' + esc(t) + '</th>'; }).join("") + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join("") + '</tr>'; }).join("") + '</tbody></table>';
    var sumHtml = '<div class="dg-sum">' + sum.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join("") + '</div>';
    return { title: title, info: info, th: th, rows: rows, sum: sum, metaHtml: metaHtml, tableHtml: tableHtml, sumHtml: sumHtml };
  }

  function dgDocPreview(S, type) {
    var d = dgDoc(type, S);
    var tag = type === "PI" ? "装船前 · 内部下单/收款依据" : type === "CI" ? "装船后 · 清关与结汇核心" : "装箱单 · 件数与重量";
    return '<div class="dg-doc"><h4>' + esc(d.title) + ' <span style="font-weight:400;font-size:12px;color:var(--muted)">' + esc(tag) + '</span></h4>' +
      '<button class="btn btn-outline btn-sm" style="margin-bottom:10px" data-action="dg-print" data-doc="' + type + '">🖨 打印 / PDF</button>' +
      d.metaHtml + d.tableHtml + d.sumHtml + '</div>';
  }

  function docgenHtml() {
    DG_STATE = dgLoadState();
    var portOpts = (window.FTE_PORTS || []).map(function (p) {
      return '<option value="' + esc(p.city + " (" + p.code + ")") + '"></option>';
    }).join("");
    return '<datalist id="fte-ports">' + portOpts + '</datalist>' +
      '<div class="card" style="margin-bottom:14px"><div class="chat-head"><span>📄 单证同源生成器 · 一次录入，PI/CI/PL 三份一致</span></div>' +
      '<p class="sop-tipline">填一份订单信息，同源生成形式发票 PI、商业发票 CI、装箱单 PL——金额、品名、数量、唛头从同一份数据来，杜绝单单不一致。导出 .xlsx 需联网加载 ExcelJS；离线可直接「打印 / PDF」。</p>' +
      dgGrp("seller", "卖方 Seller") + dgGrp("buyer", "买方 Buyer / Consignee") +
      dgGrp("order", "订单 Order") + dgGrp("ship", "装运 Shipment（用于 CI / PL）") +
      '<div class="dg-lb">明细行 Line Items <span class="sop-hint">净重/毛重按「每个」填，自动累加</span></div>' +
      '<table class="dg-lines"><thead><tr>' +
      '<th class="dg-no">#</th><th>品名 Description</th><th>HS</th><th style="width:60px">数量 Qty</th><th style="width:54px">单位</th><th style="width:72px">单价</th><th style="width:62px">净重/个</th><th style="width:62px">毛重/个</th><th style="width:58px">箱数</th><th style="width:58px">CBM</th><th style="width:24px"></th>' +
      '</tr></thead><tbody id="dgLineBody"></tbody></table>' +
      '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-primary btn-sm" data-action="dg-gen">⚙️ 生成三份单证</button>' +
      '<button class="btn btn-outline btn-sm" data-action="dg-add">➕ 添加明细行</button>' +
      '<button class="btn btn-outline btn-sm" data-action="dg-xl">📊 导出 Excel (.xlsx)</button>' +
      '<button class="btn btn-outline btn-sm" data-action="dg-clear">🗑 清空</button>' +
      '</div></div>' +
      '<div class="dg-out" id="dgOut" hidden></div>';
  }

  function dgGen() {
    DG_STATE.items = dgReadLines();
    var S = dgBuild();
    dgSaveState();
    var out = document.getElementById("dgOut");
    if (!out) return;
    out.hidden = false;
    if (!S.items.length || S.totalQty <= 0) {
      out.innerHTML = '<p class="dg-empty">请先添加并填写至少一行「数量 &gt; 0」的明细，再生成。</p>';
      toast("请先填写明细行（数量 > 0）");
      return;
    }
    out.innerHTML =
      '<div style="margin:4px 0 12px;display:flex;gap:16px;flex-wrap:wrap;font-size:13px;border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:9px 12px">' +
      '<span>💰 <b>' + esc(S.cur) + ' ' + money(S.totalAmount) + '</b></span>' +
      '<span>📦 ' + S.totalCtn + ' 箱</span>' +
      '<span>⚖️ 净 ' + mon(S.totalNwt) + ' KGS</span>' +
      '<span>毛 ' + mon(S.totalGwt) + ' KGS</span>' +
      '<span>📐 ' + mon(S.totalCBM) + ' CBM</span>' +
      '</div>' +
      dgDocPreview(S, "PI") + dgDocPreview(S, "CI") + dgDocPreview(S, "PL");
    toast("✅ 已同源生成 PI / CI / PL 三份（一致）");
  }
  function dgAdd() {
    DG_STATE.items = dgReadLines();
    DG_STATE.items.push({ desc: "", hs: "", qty: "", unit: "PCS", price: "", nwt: "", gwt: "", ctns: "", cbm: "" });
    dgLineBody();
    dgSaveState();
  }
  function dgRm(idx) {
    DG_STATE.items = dgReadLines();
    if (idx >= 1 && idx <= DG_STATE.items.length) DG_STATE.items.splice(idx - 1, 1);
    if (!DG_STATE.items.length) DG_STATE.items = [{ desc: "", hs: "", qty: "", unit: "PCS", price: "", nwt: "", gwt: "", ctns: "", cbm: "" }];
    dgLineBody();
    dgSaveState();
  }
  function dgClear() {
    DG_STATE = dgDefault();
    dgSaveState();
    render();
    toast("已清空，可重新录入");
  }

  /* ---------- 打印 / PDF（零依赖，自包含样式） ---------- */
  function printWrap(d, cur) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(d.title) + '</title>' +
      '<style>' +
      'body{font-family:Georgia,SimSun,serif;color:#111;font-size:13px;margin:32px;}' +
      'h1{font-size:20px;text-align:center;letter-spacing:2px;margin:0 0 6px;}' +
      'table{width:100%;border-collapse:collapse;margin-top:14px;}' +
      'th,td{border:1px solid #333;padding:5px 8px;text-align:left;}' +
      'th{background:#f2f2f2;}' +
      '.meta{margin:8px 0;font-size:12px;}' +
      '.sum{margin-top:10px;font-weight:700;}' +
      '@page{margin:18mm;}' +
      '</style></head><body>' +
      '<h1>' + esc(d.title) + '</h1>' +
      d.metaHtml + d.tableHtml + '<div class="sum">' + d.sum.map(function (s) { return esc(s) + "<br>"; }).join("") + '</div>' +
      '</body></html>';
  }
  function dgPrint(docKey) {
    var S = dgBuild();
    if (!S.items.length || S.totalQty <= 0) { toast("请先填写明细行（数量 > 0）"); return; }
    var d = dgDoc(docKey || "PI", S);
    var w = window.open("", "_blank");
    if (!w) { toast("浏览器拦截了弹窗，请在地址栏允许弹窗后重试"); return; }
    w.document.write(printWrap(d, S.cur));
    w.document.close();
    w.onload = function () { w.focus(); w.print(); };
  }

  /* ---------- 导出 .xlsx（ExcelJS 运行时按需加载） ---------- */
  var DG_THIN = { top: { style: "thin", color: { argb: "FFB7BEC8" } }, left: { style: "thin", color: { argb: "FFB7BEC8" } }, bottom: { style: "thin", color: { argb: "FFB7BEC8" } }, right: { style: "thin", color: { argb: "FFB7BEC8" } } };
  function ensureExcelJS(cb) {
    if (window.ExcelJS) return cb(true);
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
    s.onload = function () { cb(!!window.ExcelJS); };
    s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }
  function addDocSheet(wb, name, d) {
    var ws = wb.addWorksheet(name);
    ws.columns = [{ width: 6 }, { width: 34 }, { width: 12 }, { width: 9 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 12 }];
    var rn;
    rn = ws.rowCount + 1;
    var t = ws.addRow([d.title]);
    ws.mergeCells(rn, 1, rn, 8);
    t.getCell(1).font = { bold: true, size: 14 };
    t.alignment = { horizontal: "center" };
    t.height = 22;
    rn++;
    ws.addRow([]); rn++;
    d.info.forEach(function (p) {
      var r = ws.addRow([p[0], p[1] || ""]);
      r.getCell(1).font = { bold: true };
      r.getCell(1).alignment = { vertical: "top" };
      ws.mergeCells(rn, 2, rn, 8);
      r.height = Math.max(15, Math.ceil(String(p[1] || "").length / 26) * 14 + 4);
      r.alignment = { vertical: "top", wrapText: true };
      rn++;
    });
    ws.addRow([]); rn++;
    var hr = ws.addRow(d.th);
    hr.font = { bold: true };
    hr.alignment = { horizontal: "center", vertical: "middle" };
    for (var c = 1; c <= d.th.length; c++) {
      hr.getCell(c).border = DG_THIN;
      hr.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
    }
    rn++;
    d.rows.forEach(function (row) {
      var r = ws.addRow(row);
      for (var cc = 1; cc <= d.th.length; cc++) {
        var cell = r.getCell(cc);
        cell.border = DG_THIN;
        if (d.th[cc - 1] && /Amount|Weight|Qty|Price|Cartons/.test(d.th[cc - 1])) cell.alignment = { horizontal: "right" };
      }
      rn++;
    });
    d.sum.forEach(function (s) {
      var r = ws.addRow([s]);
      r.font = { bold: true };
      ws.mergeCells(rn, 1, rn, 8);
      rn++;
    });
  }
  function dgExportXlsx() {
    var S = dgBuild();
    if (!S.items.length || S.totalQty <= 0) { toast("请先填写明细行（数量 > 0）"); return; }
    ensureExcelJS(function (ok) {
      if (!ok) { toast("加载 ExcelJS 失败（需联网）→ 已改用 CSV / 打印"); dgCsvFallback(S); return; }
      try {
        var wb = new ExcelJS.Workbook();
        wb.creator = "软包装外贸英语";
        addDocSheet(wb, "PI", dgDoc("PI", S));
        addDocSheet(wb, "CI", dgDoc("CI", S));
        addDocSheet(wb, "PL", dgDoc("PL", S));
        wb.xlsx.writeBuffer().then(function (buf) {
          var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
          var name = (S.h.dgorderNo || "doc") + "-PI-CI-PL.xlsx";
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          toast("✅ 已导出三份单证 " + name);
        }).catch(function (e) { toast("导出失败：" + (e && e.message || e)); });
      } catch (e) { toast("导出失败：" + e.message); }
    });
  }
  function dgCsvFallback(S) {
    var parts = ["PI", "CI", "PL"].map(function (k) {
      var d = dgDoc(k, S);
      return "=== " + d.title + " ===\n" +
        d.info.map(function (p) { return '"' + p[0] + '","' + String(p[1] || "").replace(/"/g, '""') + '"'; }).join("\n") +
        "\n" + d.th.map(function (t) { return '"' + t + '"'; }).join(",") + "\n" +
        d.rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n") +
        "\n" + d.sum.join("\n");
    }).join("\n\n\n");
    try {
      var blob = new Blob(["\ufeff" + parts], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (S.h.dgorderNo || "doc") + "-PI-CI-PL.csv";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    } catch (e) { toast("导出失败：" + e.message); }
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var act = el.getAttribute("data-action");
    if (act === "sop-tab") {
      State.tab = el.getAttribute("data-tab");
      render();
      window.scrollTo(0, 0);
    } else if (act === "sop-rates") {
      doRates();
    } else if (act === "sop-check") {
      var k = el.getAttribute("data-k");
      if (el.checked) State.checks[k] = 1; else delete State.checks[k];
      save();
      render();
    } else if (act === "sop-reset") {
      State.checks = {};
      save();
      render();
      toast("↺ 已清空勾选，可以按新订单重走一遍");
    } else if (act === "sop-copy") {
      copyText(el.getAttribute("data-text"));
    } else if (act === "sop-cbm") {
      doCbm();
    } else if (act === "sop-cif") {
      doCif();
    } else if (act === "sop-consist") {
      doConsist();
    } else if (act === "sop-tpl") {
      doTpl();
    } else if (act === "sop-tpl-copy") {
      var ta = document.getElementById("tplOut");
      copyText(ta ? ta.value : "");
    } else if (act === "sop-tpl-say") {
      var ta2 = document.getElementById("tplOut");
      if (ta2 && ta2.value) speak(ta2.value); else toast("先生成邮件内容");
    } else if (act === "dg-gen") {
      dgGen();
    } else if (act === "dg-add") {
      dgAdd();
    } else if (act === "dg-rm") {
      dgRm(parseInt(el.getAttribute("data-idx"), 10));
    } else if (act === "dg-clear") {
      dgClear();
    } else if (act === "dg-xl") {
      dgExportXlsx();
    } else if (act === "dg-print") {
      dgPrint(el.getAttribute("data-doc") || "PI");
    }
  });
  /* 单证生成器：表单与明细行输入时实时保存到本地（fte-docgen-v1） */
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest("[data-dg-line]")) { DG_STATE.items = dgReadLines(); dgSaveState(); return; }
    var id = t.getAttribute && t.getAttribute("data-dg");
    if (id) { DG_STATE.h[id] = t.value; dgSaveState(); }
  });

  window.SOP = {
    render: render,
    /* 供首页横幅使用：实操清单完成度 */
    stats: function () {
      load();
      var all = allSteps();
      return { done: doneCount(all), total: all.length };
    }
  };
})();
