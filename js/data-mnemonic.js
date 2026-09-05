/* ============ 抽象术语词根/联想助记层（P1-2）============
   独立数据文件：window.FTE_MEMO = { <词(小写)>: "助记文本" }。
   只覆盖「抽象/难记的专业复合词」——用词根词缀拆解、意象、或已熟词联想，
   降低记忆负担；普通词仍靠「高频复现 + 例句」。词条未命中则不显示，无副作用。

   约定：
   - key 用词的小写形式，App 在单词卡背面按 card.w.toLowerCase() 查。
   - 助记文本为「词源/词根拆解 + 一句话意象」，尽量准确；拿不准的词源会标注「（帮助记忆，以词典为准）」。
   注意：词源拆解主要为帮助记忆，非严谨词源学；涉及专业含义以行业资料为准。
   ============================================ */
(function () {
  "use strict";
  const MEMO = {
    /* ---- 化工/树脂/胶粘剂 ---- */
    "prepolymer": "pre(前) + polymer(聚合物) → 还没完全聚合的「前聚合物」= 预聚体",
    "polyurethane": "poly(多) + urethane(氨基甲酯) → 聚氨酯（PU，常见复合胶/涂层树脂）",
    "polyol": "poly(多) + ol(醇) → 多元醇",
    "isocyanate": "iso(同) + cyanate(氰酸酯) → 异氰酸酯（双组分胶的 NCO 组分）",
    "curing agent": "cure(固化) + agent(剂) → 让胶固化的东西 = 固化剂/硬化剂",
    "hardener": "harden(变硬) + er → 使胶变硬的组分 = 硬化剂",
    "base resin": "base(基础) + resin(树脂) → 主剂/基体树脂",
    "main agent": "main(主) + agent(剂) → 主剂（双组分的 A 主剂）",
    "two-component": "two(二) + component(组分) → 双组分（A+B 按配比混合）",
    "solvent-based": "solvent(溶剂) + based(以…为基) → 溶剂型（含溶剂）",
    "solvent-based adhesive": "溶剂型胶粘剂：靠溶剂溶解，涂布后蒸发固化",
    "water-based": "water(水) + based → 水性/水基（以水为分散介质）",
    "solventless": "solvent(溶剂) + less(无) → 无溶剂（Solventless）",
    "hot-melt": "hot(热) + melt(熔) → 热熔胶（加热熔化，冷却固化）",
    "solid content": "solid(固体) + content(含量) → 固含量：溶剂外的固体成分占比",
    "mixing ratio": "mix(混合) + ratio(比例) → 配比（A:B 的混合比例）",
    "pot life": "pot(罐) + life(寿命) → 适用期：开罐后还能用的时间",
    "tack": "tack 即「黏」→ 初粘力 / 黏性",
    "initial tack": "initial(最初的) + tack(黏) → 初粘力（刚接触时的黏附）",
    "viscosity": "visc(粘稠) + ity(性) → 粘度（液体流动阻力）",
    "thinner": "thin(变稀) + er → 稀释剂/开油水（把胶调稀）",
    "diluent": "dilute(稀释) + ent → 稀释剂",
    "migration": "migrate(迁徙) → 迁移：小分子向食物/其它层移动（食品安全风险）",
    "residual solvent": "residual(残留) + solvent(溶剂) → 残留溶剂（复合后没挥发完的溶剂）",
    "substrate": "sub(在下) + strate(层) → 基材/底材（被复合的那层膜）",
    "adhesion": "ad(向) + hes(粘) + ion → 粘附力（胶与基材的结合）",
    "bonding strength": "bond(结合) + strength(强度) → 结合强度/复合强度",
    "peel strength": "peel(撕) + strength(强度) → 剥离强度（90°/180° 撕开薄膜的力量）",
    "delamination": "de(分离) + lamina(层) + tion → 层与层分开 = 脱层/分层",
    "bubbles": "bubble(气泡) → 复合后残留气泡（外观/粘合问题）",
    "wrinkles": "wrinkle(皱纹) → 起皱/wrinkling（张力不均所致）",
    "blocking": "block(卡住) + ing → 薄膜层间粘连（卷材存放时粘在一起）",
    "tunneling": "tunnel(隧道) → 隧道效应：胶层成隧道状空洞",
    "cockling": "cockle(卷皱) → 起皱/皱褶（膜面不平）",
    "corona treatment": "corona(日冕/光晕) → 电晕处理：电极放电形成光环，提高表面张力好上墨/上胶",
    "surface tension": "surface(表面) + tension(张力) → 表面张力（电晕处理要达到的指标）",
    /* ---- 薄膜/设备 ---- */
    "co-extrusion": "co(共同) + extrusion(挤出) → 共挤：多层同时挤出",
    "extrusion": "ex(出) + trud(推) → 挤出（把熔融塑料从口模推出）",
    "coating": "coat(涂层) + ing → 涂布/涂层",
    "laminating machine": "laminate(层合) → 复合机（把两层膜粘一起的设备）",
    "unwind": "un(反向) + wind(卷) → 放卷（把膜从卷上松开）",
    "rewind": "re(回) + wind(卷) → 收卷/回卷",
    "tension control": "tension(张力) + control(控制) → 张力控制（膜走料保持平稳拉力）",
    "drying oven": "dry(干燥) + oven(烘箱) → 烘干箱/干燥道",
    "slitting": "slit(切缝) + ing → 分切（把宽膜切成窄条）",
    "bag-making machine": "bag(袋) + making(做) → 制袋机",
    "heat sealing": "heat(热) + seal(封) → 热封（把袋口热熔封住）",
    "stand-up pouch": "stand up(立起) + pouch(袋) → 站立袋（能立住的可印袋）",
    "spout pouch": "spout(喷嘴) + pouch(袋) → 吸嘴袋（带小嘴，能挤）",
    "zipper bag": "zipper(拉链) + bag → 拉链袋（可反复开合）",
    "retort pouch": "retort(蒸煮杀菌) + pouch(袋) → 蒸煮袋（耐高温杀菌）",
    "sachet": "sachet(小袋) → 小袋/小包（粉末/样品单个小包装）",
    "roll": "roll(卷) → 卷膜（成卷的复合膜）",
    "flexible film": "flexible(柔性) + film(膜) → 柔性薄膜",
    "barrier film": "barrier(屏障) + film(膜) → 阻隔膜（挡氧气/水分）",
    "metallized film": "metallze(镀金属) → 镀铝膜（表面镀薄铝层，阻隔+反光）",
    "aluminum foil": "aluminum(铝) + foil(箔) → 铝箔",
    "shrink film": "shrink(收缩) → 收缩膜（受热收缩包紧）",
    "peelable": "peel(撕) + able(可) → 可剥离（密封层可整片撕开）",
    /* ---- 贸易/单证/风险 ---- */
    "FOB": "Free On Board → 离岸价：货物在装运港越过船舷即交货",
    "CIF": "Cost, Insurance & Freight → 到岸价：卖方负担运费+保险",
    "demurrage": "demur(滞留) + age → 滞期费（集装箱超时未还船的罚金）",
    "detention": "detain(扣留) → 滞箱费（箱子滞留码头的费用）",
    "consignee": "consign(交付) → 收货人",
    "shipper": "ship(运) → 发货人/托运人",
    "beneficiary": "benefit(受益) → 受益人（信用证的收款人）",
    "discrepancy": "dis(不) + crepancy(一致) → 不符点：单据与信用证不一致",
    "endorsement": "endorse(背书) → 提单/汇票背书（转让）",
    "VGM": "Verified Gross Mass → 集装箱总重核实（SOLAS 要求）",
    "ETD": "Estimated Time of Departure → 预计离港时间",
    "ETA": "Estimated Time of Arrival → 预计到港时间",
    "MOQ": "Minimum Order Quantity → 最低起订量",
    "NDA": "Non-Disclosure Agreement → 保密协议（不泄露）",
    "INCOTERMS": "InterNational COmmercial TERMS → 国际贸易术语（11 种）"
  };
  window.FTE_MEMO = MEMO;
})();
