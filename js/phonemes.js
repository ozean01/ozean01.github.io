/* ============ 🔤 音素课（Phonemes）============
   把「辨音 · 最小音对」的 25 组，扩成一套完整的音素课：41 个音素（单元音 12 / 双元音 5 / 辅音 24），
   每个音素给出「口型舌位要点 + 易混音 + 站内真实例词」。

   关键差异化：**例词不用教材里的 apple / banana，而是从本站 798 条行业词自动索引出来的**——
   复合膜、上胶量、剥离强度、订舱、信用证……你练的是自己业务里真的要发的那些音。
   索引由 ipa 字段实时算出（`buildIndex`），词库一改，例词自动跟着变，无需手工维护对照表。

   与站内已有模块的关系：
     · 「辨音 · 最小音对」(listen.js)  → 练「听」：听一个词二选一
     · 「音素课」(本模块)             → 练「懂 + 说」：先明白口型舌位，再拿行业词开口
   依赖（按需读取）：window.FTE_BOOT（DATA）、window.Player、window.CoachBridge。
   零构建、无第三方依赖。渲染：window.Phonemes.render()。 */
(function () {
  "use strict";

  window.Phonemes = { render: render };
  /* 注：测试钩子 _t 在文件末尾赋值——INVENTORY / SKIP / PHONEMES 都是 const，
     在声明前引用会触发 TDZ 直接抛错（曾在加载期整模块失败）。 */

  const S = window.Phonemes._state = { group: "all", open: null, fullOpen: false };

  /* ---------------- 音素表 ----------------
     口径：美式通用口音（General American），与站内 IPA 规范一致（e 而非 ɛ、ɡ U+0261、无 ɝ/ɚ）。
     tip 为教学近似描述，用来「知道舌头往哪放」，不等于声学定义。 */
  /* P1-B（S05 · C1/C2/C4）：只有下面三条的**教学文案**被改写，音素条目数与音标数据一字未动——
       · /ɪ/（S05 引 phonemes.js:29）—— 与 listen.js 的 /ɪ/ vs /iː/ 统一为「两个不同的音，不是长短」（音质/松紧优先，时长为伴随特征）
       · /ŋ/（S05 引 phonemes.js:68）—— 「词尾不要拖出 /ɡ/」收窄为条件规则，并补词中 /ŋɡ/ 的反例（longer / stronger / finger / language）
       · /r/（S05 引 phonemes.js:70）—— 补 bunched 舌形（舌尖上卷不是唯一正确舌形）
     HIGH_RISK 区块里同类文案（/r/、/ŋ/ 两组）按同一口径改写，避免站内自相矛盾。 */
  const PHONEMES = [
    /* ---- 单元音 ---- */
    { ipa: "iː", type: "vowel", zh: "长音「衣」", tip: "舌前部抬高接近硬腭，嘴角向两侧展开，肌肉紧张，比 /ɪ/ 更长更紧。", contrast: ["ɪ"] },
    { ipa: "ɪ", type: "vowel", zh: "短音「衣」", tip: "舌位比 /iː/ 略低略后，口型放松，短促——不是把 /iː/ 读短，而是另一个音。首要区别是音质与松紧（不是长短）：时长只是伴随特征，还受后接辅音清浊影响（seat 的 /iː/ 比 seed 的短）。", contrast: ["iː", "i"] },
    { ipa: "i", type: "vowel", zh: "弱化「衣」（词尾 -y）", tip: "出现在非重读音节末，如 city /ˈsɪti/、quality。既不是紧 /iː/ 也不是松 /ɪ/，轻快带过即可。", contrast: ["iː", "ɪ"] },
    { ipa: "e", type: "vowel", zh: "「诶」前半", tip: "舌前部中高，口张开约一指宽，嘴角略展。站内统一用 e，不用英式 /ɛ/。", contrast: ["æ", "eɪ"] },
    { ipa: "æ", type: "vowel", zh: "大开口「哎」", tip: "舌前部放低，下颌明显下降，口型扁而大。中文没有这个音，最接近「啊」与「诶」之间。", contrast: ["e", "ʌ"] },
    { ipa: "ɑː", type: "vowel", zh: "后低长音「啊」", tip: "舌身后缩放低，口张大，像医生检查喉咙。美音里 hot、product 都是这个音。", contrast: ["ʌ", "ɔː"] },
    { ipa: "ɔː", type: "vowel", zh: "圆唇后元音「奥」", tip: "舌后部中低，双唇收圆并略前突，比 /ɑː/ 更圆更长。", contrast: ["oʊ", "ɑː"] },
    { ipa: "ʊ", type: "vowel", zh: "短「乌」", tip: "舌后部次高，双唇略圆但不前突，短促放松。不是把 /uː/ 读短。", contrast: ["uː"] },
    { ipa: "uː", type: "vowel", zh: "长「乌」", tip: "舌后部抬高，双唇收圆前突，紧张拉长。", contrast: ["ʊ"] },
    { ipa: "ʌ", type: "vowel", zh: "短「啊」", tip: "舌中部偏后、中低，口半开，短促有力。cup、customs、trust 都是它。", contrast: ["ɑː", "æ"] },
    { ipa: "ə", type: "vowel", zh: "央元音（弱读）", tip: "舌位自然居中、完全放松。英语里出现频率最高的音——几乎所有非重读元音都会弱化成它。说英语「含糊」的秘诀就在这里。", contrast: ["ʌ"] },
    { ipa: "ɜː", type: "vowel", zh: "卷舌长元音", tip: "舌中部抬起并向后卷，美音带明显 r 音色。word、confirm、return 都是它。", contrast: ["ɔː"] },

    /* ---- 双元音 ---- */
    { ipa: "eɪ", type: "diphthong", zh: "「诶→衣」滑动", tip: "从 /e/ 滑向 /ɪ/，前长后短、前重后轻，是一个音不是两个音。", contrast: ["e", "aɪ"] },
    { ipa: "aɪ", type: "diphthong", zh: "「啊→衣」滑动", tip: "开口大，从低位滑向 /ɪ/。price、supply、buyer 都是它。", contrast: ["eɪ", "ɪ"] },
    { ipa: "ɔɪ", type: "diphthong", zh: "「奥→衣」滑动", tip: "圆唇起始，滑向 /ɪ/，唇形由圆变扁。", contrast: ["ɔː"] },
    { ipa: "oʊ", type: "diphthong", zh: "「欧」滑动", tip: "从 /o/ 滑向 /ʊ/，双唇由圆到略展。站内统一写 oʊ，不写英式 /əʊ/。", contrast: ["ɔː", "ʊ"] },
    { ipa: "aʊ", type: "diphthong", zh: "「啊→乌」滑动", tip: "开口大，滑向 /ʊ/，唇形由开到圆。discount、amount、out 都是它。", contrast: ["oʊ"] },

    /* ---- 辅音 ---- */
    { ipa: "p", type: "consonant", zh: "双唇爆破（清）", tip: "双唇闭合后突然放气，声带不振动；词首送气要强（paper、price）。", contrast: ["b"] },
    { ipa: "b", type: "consonant", zh: "双唇爆破（浊）", tip: "同 /p/ 但声带振动，送气弱。", contrast: ["p"] },
    { ipa: "t", type: "consonant", zh: "齿龈爆破（清）", tip: "舌尖抵上齿龈后弹开。美音关键：两个元音之间的 t 常浊化成闪音，water 听起来像 wader。", contrast: ["d"] },
    { ipa: "d", type: "consonant", zh: "齿龈爆破（浊）", tip: "同 /t/ 但声带振动。", contrast: ["t"] },
    { ipa: "k", type: "consonant", zh: "软腭爆破（清）", tip: "舌后部抵软腭后放开。", contrast: ["ɡ"] },
    { ipa: "ɡ", type: "consonant", zh: "软腭爆破（浊）", tip: "同 /k/ 但声带振动。", contrast: ["k"] },
    { ipa: "f", type: "consonant", zh: "唇齿摩擦（清）", tip: "上齿轻咬下唇，气流从缝隙挤出。中文没有，不要读成 /h/。", contrast: ["v"] },
    { ipa: "v", type: "consonant", zh: "唇齿摩擦（浊）", tip: "同 /f/ 但声带振动。最常见错误：读成 /w/（very ≠ worry）。", contrast: ["f", "w"] },
    { ipa: "θ", type: "consonant", zh: "齿间摩擦（清）", tip: "舌尖轻伸入上下齿之间，气流从缝隙出。中文没有此音，常被读成 /s/（think ≠ sink）。", contrast: ["s", "ð"] },
    { ipa: "ð", type: "consonant", zh: "齿间摩擦（浊）", tip: "同 /θ/ 但声带振动。the、this、those 里的 th 都是它，常被读成 /z/ 或 /d/。", contrast: ["z", "θ"] },
    { ipa: "s", type: "consonant", zh: "齿龈摩擦（清）", tip: "舌尖接近上齿龈，气流从窄缝挤出。", contrast: ["z", "θ"] },
    { ipa: "z", type: "consonant", zh: "齿龈摩擦（浊）", tip: "同 /s/ 但声带振动。美音里名词复数的 s 常读 /z/（documents、films）。", contrast: ["s", "ð"] },
    { ipa: "ʃ", type: "consonant", zh: "舌叶摩擦（清）「西」", tip: "舌叶抬向上齿龈后部，双唇略前突。ship、shipment、specification 都是它。", contrast: ["ʒ", "s"] },
    { ipa: "ʒ", type: "consonant", zh: "舌叶摩擦（浊）「日」", tip: "同 /ʃ/ 但声带振动。多来自法语借词或 -sion（decision）。", contrast: ["ʃ"] },
    { ipa: "h", type: "consonant", zh: "声门摩擦（清）", tip: "气流通过张开的声门摩擦而出，口型随后面的元音变化。", contrast: ["f"] },
    { ipa: "tʃ", type: "consonant", zh: "塞擦（清）「吃」", tip: "/t/ 的闭塞 + /ʃ/ 的摩擦连成一气，不是两个音分开读。", contrast: ["dʒ", "ʃ"] },
    { ipa: "dʒ", type: "consonant", zh: "塞擦（浊）「知」", tip: "同 /tʃ/ 但声带振动。packaging、damage、adjust 都是它。", contrast: ["tʃ", "j"] },
    { ipa: "m", type: "consonant", zh: "双唇鼻音", tip: "双唇闭合，气流从鼻腔出。", contrast: ["n"] },
    { ipa: "n", type: "consonant", zh: "齿龈鼻音", tip: "舌尖抵上齿龈，气流从鼻腔出。", contrast: ["ŋ", "m"] },
    { ipa: "ŋ", type: "consonant", zh: "软腭鼻音", tip: "舌后部抵软腭，气流从鼻腔出。词末的 /ŋ/ 不加 /ɡ/（sing、thing、coating /ˈkoʊtɪŋ/、shipping）；但 ng 夹在词中、属比较级或词干时读 /ŋɡ/（longer、stronger、finger、language），别把 longer 读成 /ˈlɔːŋər/。", contrast: ["n"] },
    { ipa: "l", type: "consonant", zh: "齿龈边音", tip: "舌尖抵上齿龈，气流从舌两侧出。词尾的 l 要发「暗 l」：舌后部同时抬起（film、label）。", contrast: ["r"] },
    { ipa: "r", type: "consonant", zh: "卷舌近音", tip: "舌形有两种、都算对：① 舌尖上卷但不碰上腭（retroflex）；② 舌尖下收、舌体抬起（bunched）。共同点是双唇略圆、咽部收窄——别把第二种当成读错了。美音核心特征：词尾的 r 必须发出来（buyer、order、container）。", contrast: ["l"] },
    { ipa: "w", type: "consonant", zh: "圆唇半元音", tip: "双唇收圆前突后迅速滑向元音，声带振动。易与 /v/ 混淆。", contrast: ["v"] },
    { ipa: "j", type: "consonant", zh: "硬腭半元音「耶」", tip: "舌前部抬近硬腭后滑向元音。易与 /dʒ/ 混淆（yet ≠ jet）。", contrast: ["dʒ"] }
  ];

  const GROUP_NAME = { all: "全部", vowel: "单元音", diphthong: "双元音", consonant: "辅音" };
  const NAMES = GROUP_NAME;

  /* ---------------- IPA 分词器 ----------------
     站内 ipa 形如 "/ˌmænjuˈfæktʃərər/"：含首尾斜杠、重音符号 ˈ ˌ、空格、以及多读音逗号。
     先做最长匹配，再跳过分隔符。INVENTORY 覆盖站内 798 条语料的全部字符（测试有断言）。
     多字符必须排在单字符之前，否则 aɪ 会被拆成 a + ɪ。 */
  const INVENTORY = [
    "tʃ", "dʒ", "eɪ", "aɪ", "ɔɪ", "oʊ", "aʊ",
    "iː", "uː", "ɑː", "ɔː", "ɜː",
    "p", "b", "t", "d", "k", "ɡ", "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h",
    "m", "n", "ŋ", "l", "r", "w", "j",
    "i", "ɪ", "e", "æ", "ɑ", "ɔ", "ʊ", "ʌ", "ə", "ɜ", "ɒ", "u", "o", "a"
  ];
  /* 分隔与修饰符（不入 token） */
  const SKIP = { "/": 1, " ": 1, "ˈ": 1, "ˌ": 1, ",": 1 };

  function tokenize(ipa) {
    const s = String(ipa == null ? "" : ipa);
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (SKIP[c]) { i++; continue; }
      let hit = null;
      for (let k = 0; k < INVENTORY.length; k++) {
        if (s.startsWith(INVENTORY[k], i)) { hit = INVENTORY[k]; i += INVENTORY[k].length; break; }
      }
      if (hit) out.push(hit);
      else { out.push("?" + c); i++; }   /* 未识别：保留原字符便于测试定位 */
    }
    return out;
  }

  /* ---------------- 站内词库索引 ----------------
     倒排：音素 → 包含它的词条（含释义/例句/所属单元），供每个音素直接给「你的业务例词」。 */
  function units() {
    const boot = window.FTE_BOOT;
    if (boot && boot.DATA && boot.DATA.units) return boot.DATA.units;
    if (typeof FTE_DATA !== "undefined" && FTE_DATA && FTE_DATA.units) return FTE_DATA.units;
    return [];
  }

  function buildIndex(unitList) {
    const list = unitList || units();
    const DIFF = (typeof FTE_DIFF !== "undefined") ? FTE_DIFF : null;
    const acc = {};
    PHONEMES.forEach(function (p) { acc[p.ipa] = {}; });   /* 先按词去重：同一个词可能出现在多个单元 */
    list.forEach(function (u) {
      (u.vocab || []).forEach(function (v) {
        if (!v.ipa) return;
        const d = (DIFF && DIFF.words && DIFF.words[String(v.w).toLowerCase()]) || null;
        const entry = {
          w: v.w, ipa: v.ipa, cn: v.cn || "", ex: v.ex || "", exCn: v.exCn || "",
          unitId: u.id, unitTitle: u.title || "", dom: !!(d && d.dom)
        };
        const key = String(v.w).toLowerCase();
        const seen = {};
        tokenize(v.ipa).forEach(function (t) {
          if (!acc[t] || seen[t]) return;      /* 只收课程里有的音素；同一个词内同音素只计一次 */
          seen[t] = true;
          const cur = acc[t][key];
          /* 同一个词跨单元重复时：优先保留带「专」角标（行业术语）的那一条 */
          if (!cur || (entry.dom && !cur.dom)) acc[t][key] = entry;
        });
      });
    });
    /* 行业术语优先，其次短的在前（短词更容易读准、更适合练单音） */
    const idx = {};
    Object.keys(acc).forEach(function (k) {
      idx[k] = Object.keys(acc[k]).map(function (w) { return acc[k][w]; }).sort(function (a, b) {
        if (a.dom !== b.dom) return a.dom ? -1 : 1;
        if (a.w.length !== b.w.length) return a.w.length - b.w.length;
        return a.w < b.w ? -1 : (a.w > b.w ? 1 : 0);
      });
    });
    return idx;
  }

  let _cache = null;
  function index() { if (!_cache) _cache = buildIndex(); return _cache; }

  /* ---------------- 精确查词（用于「高危音」——只认站内词库，保证 IPA 口径一致） ---------------- */
  function findWord(w) {
    const key = String(w).toLowerCase();
    const list = units();
    for (let i = 0; i < list.length; i++) {
      const vs = list[i].vocab || [];
      for (let j = 0; j < vs.length; j++) {
        if (String(vs[j].w).toLowerCase() === key) {
          return { w: vs[j].w, ipa: vs[j].ipa, cn: vs[j].cn, unitId: list[i].id, ex: vs[j].ex };
        }
      }
    }
    return null;
  }

  /* ---------------- 🚨 高危音（优先于 41 音素全量表） ----------------
     来自一线外贸英语培训师的评审，原话：
       「41 个音素对四级荒废多年的业务员是负担；他们分不清 /θ/ /s/ 不是不懂口型而是不练。
         真正出事故的只有十来个（th/s、v/w、l/r、词尾辅音、-ed），且必须绑行业词
         （coating weight → 客户直接听错），比口型图有用十倍。」

     故本区块置于 41 音素表【之前】，每组只给「会出什么事故 + 一句口型要点 + 你的行业词」。
     词与 IPA 全部取自站内词库（findWord），保证与全站口径一致，也不引入未核对内容。
     pick 里的词若被从词库删掉，只会少显示一个词，不会报错。 */
  const HIGH_RISK = [
    { key: "th", sym: "θ", name: "/θ/ 舌尖齿间音", unit: 11,
      risk: "中文没有这个音。发成 /s/ 会把「厚度」说成「疾病」（thickness → sickness），" +
        "把「剥离强度」说成 s-trength——客户会以为你在说别的指标。",
      tip: "舌尖轻轻伸进上下齿之间，气流从缝隙挤出，声带不振动。",
      pick: ["thickness", "peel strength", "bonding strength", "thinner", "ethyl acetate", "web width"] },
    { key: "dh", sym: "ð", name: "/ð/ 浊齿间音", unit: 4,
      risk: "常被说成 /z/ 或 /d/。comply with 说成 comply wiz，客户要顿一下才反应过来。",
      tip: "与 /θ/ 同一个口型，但声带要振动（摸着喉咙能感到震颤）。",
      pick: ["comply with", "With Particular Average"] },
    { key: "v", sym: "v", name: "/v/ 唇齿摩擦音", unit: 3,
      risk: "常被说成 /w/。valid 说成 walid、adhesive 说成 adheziw——「有效期」和「胶」都是天天用的词。",
      tip: "上齿轻咬下唇，气流从缝隙挤出；不是把双唇收圆。",
      pick: ["valid", "validity", "value proposition", "laminating adhesive", "solvent-based adhesive", "leverage"] },
    { key: "r", sym: "r", name: "词尾 /r/ —— 必须发出来", unit: 1,
      risk: "中文没有词尾 r。supplier 说成 supplia、buyer 说成 baia，客户听不出你在说谁。",
      tip: "舌尖上卷不碰上腭，或舌尖下收、舌体抬起（bunched）——两种舌形都算对；共同点是双唇略圆、咽部收窄。词尾的 r 是美音的标志，不能吞。",
      pick: ["supplier", "buyer", "manufacturer", "exporter", "importer", "seller"] },
    { key: "l", sym: "l", name: "词尾暗 /l/ —— 别吞掉", unit: 11,
      risk: "film 说成 fim、sample 说成 sampo。「薄膜」和「样品」是每天都要说的词。",
      tip: "舌尖抵上齿龈，同时舌后部抬起，气流从舌两侧出。",
      pick: ["film", "sample", "flexible packaging", "polyol", "scale-up"] },
    { key: "ie", sym: "iː", name: "/iː/ 长音 —— 别与 /ɪ/ 混", unit: 3,
      risk: "lead time 的 lead /liːd/ 说成 /lɪd/ 就成了 lid（盖子）；specification sheet 的 sheet 说错会变成很不礼貌的词。",
      tip: "嘴角向两侧展开，肌肉紧张、拉长；不是把 /ɪ/ 读长。",
      pick: ["lead time", "specification sheet", "lead", "attendee"] },
    { key: "ae", sym: "æ", name: "/æ/ 大开口 —— 中文没有", unit: 3,
      risk: "sample、tariff、contract、valid 都是高频词，口型开不够会影响辨识。",
      tip: "下颌明显下降，口型扁而大，介于「啊」与「诶」之间。",
      pick: ["sample", "tariff", "contract", "valid", "stand"] },
    { key: "ng", sym: "ŋ", name: "/ŋ/ 鼻音 —— 词末别加 /ɡ/，词中该加的要加", unit: 3,
      risk: "coating 说成 coatin 或 coatingk。上胶量、复合、包装、运输全是 -ing 结尾。" +
        "但反过来一刀切也错：ng 夹在词中、属比较级或词干时要读 /ŋɡ/——longer 是 /ˈlɔːŋɡər/ 不是 /ˈlɔːŋər/，stronger、finger、language 同理。",
      tip: "舌后部抵软腭，气流从鼻腔出。词末的 /ŋ/ 不加 /ɡ/（coating /ˈkoʊtɪŋ/、shipping、flexible packaging）；ng 在词中且属比较级或词干时读 /ŋɡ/（longer、stronger、finger、language）。",
      pick: ["coating weight", "laminating adhesive", "flexible packaging", "shipping", "tunneling"] },
    { key: "z", sym: "z", name: "词尾浊 /z/ —— 复数别读成 /s/", unit: 1,
      risk: "customs /ˈkʌstəmz/、terms /tɜːrmz/、Incoterms 读成 /s/ 会听起来像另一个词。",
      tip: "声带要振动。名词复数的 s 在浊音后读 /z/。",
      pick: ["customs", "Incoterms", "terms", "bank charges"] },
    { key: "cl", sym: "ks/kt/st", name: "词尾辅音丛 —— 别吞音也别加元音", unit: 1,
      risk: "contract 说成 contrac、defect 说成 defec、price list 说成 price lis。中文习惯开音节，天然想吞尾音或补一个元音。",
      tip: "词尾两个辅音都要发出来，中间不加元音（不是 contrac-to）。",
      pick: ["contract", "prospect", "price list", "catalyst", "food contact", "defect", "logistics", "packing list"] }
  ];

  function highRiskHtml() {
    const rows = HIGH_RISK.map(function (g) {
      const ws = g.pick.map(findWord).filter(Boolean);
      const chips = ws.map(function (x) {
        return '<span class="hr-item">' +
          '<button class="hr-word" data-action="ph-say" data-w="' + esc(x.w) + '" title="' +
            esc(x.ipa + "  " + x.cn) + '">' + esc(x.w) + '<span class="hr-ipa">' + esc(x.ipa) + "</span></button>" +
          '<button class="hr-shadow" data-action="ph-shadow" data-w="' + esc(x.w) +
            '" title="跟读：先听标准音，留空跟你读，录下自己再回放对比" aria-label="跟读 ' + esc(x.w) + '">🎤</button>' +
        "</span>";
      }).join("");
      return `
      <div class="hr-card">
        <div class="hr-head"><span class="hr-sym">${esc(g.sym)}</span><b>${esc(g.name)}</b>
          <span class="hr-n">${ws.length} 个你的行业词</span></div>
        <div class="hr-risk">⚠️ ${esc(g.risk)}</div>
        <div class="hr-tip">👄 ${esc(g.tip)}</div>
        <div class="hr-words">${chips || '<span class="field-note">（词库中未找到这些词）</span>'}</div>
      </div>`;
    }).join("");

    const P = (window.Player && window.Player.repPref) || { n: 2, gap: 1.5 };
    const repCtl = `
        <div class="hr-rep">
          <span class="hr-rep-label">🔁 跟读设置</span>
          <label>复读 <select data-action="ph-rep-n" aria-label="复读次数">${repOptions(P.n)}</select> 次</label>
          <label>跟读窗口 <select data-action="ph-rep-gap" aria-label="每轮之间的跟读窗口秒数">${gapOptions(P.gap)}</select> 秒</label>
          <span class="field-note" style="margin:0">🎤 = 听完后录下自己、回放与原声对比。<b>本页不打分</b>——识别不等于发音，单词级评分不可靠，A/B 对照才是诚实的上限。</span>
        </div>`;

    return `
    <details class="hr-box" open>
      <summary><b>🚨 先练这 ${HIGH_RISK.length} 组（真会出事故的）</b>
        <span class="hr-sub">业务员分不清 /θ/ /s/ 通常不是不懂口型，而是没练——所以每组都配了你自己的行业词，点词即朗读</span></summary>
      <div class="hr-body">
        ${repCtl}
        <div class="hr-grid">${rows}</div>
        <div class="field-note" style="margin-top:10px">下面还有一个 <b>${PHONEMES.length} 个音素的完整表</b>（默认折叠）——那是<b>参考/查询</b>用的，从头背没有意义。日常先把上面这 ${HIGH_RISK.length} 组练顺。</div>
      </div>
    </details>`;
  }

  /* 复读次数/间隔的下拉选项：**优先由 Player 的夹取函数派生**，不在这里手写范围与步长。
     为什么带一份本地兜底：player.js 若因加载顺序/失败而缺席，下拉框仍要存在（设置项消失
     是最难发现的一类回归）；而真正的写入一律经过 Player.setRepPref，故兜底不会造成两处口径。
     口径常量集中在 REP_BOUNDS，与 Player 的 clampRepeat / clampGap 同值（test-shadow.js 守）。
     用整数循环推进，不用 0.5 累加浮点——累加会漂移，`c === cur` 的选中判断会时灵时不灵。 */
  const REP_BOUNDS = { nMin: 1, nMax: 5, gapMin: 0.5, gapMax: 5, gapStep: 0.5 };
  function roundHalf(v) { return Math.round(v * 2) / 2; }
  function clampN(v) {
    const b = REP_BOUNDS;
    if (window.Player && window.Player.clampRepeat) return window.Player.clampRepeat(v);
    const n = parseInt(v, 10);
    if (!(n >= b.nMin)) return b.nMin;
    return n > b.nMax ? b.nMax : n;
  }
  function clampG(v) {
    const b = REP_BOUNDS;
    if (window.Player && window.Player.clampGap) return window.Player.clampGap(v);
    const g = parseFloat(v);
    if (!(g >= b.gapMin)) return b.gapMin;
    return g > b.gapMax ? b.gapMax : roundHalf(g);
  }
  function optionsFrom(clamp, gen, cur) {
    let out = "";
    for (let i = 0; ; i++) {
      const v = gen(i);
      if (v === null) break;
      const c = clamp(v);
      out += '<option value="' + c + '"' + (c === cur ? " selected" : "") + ">" + c + "</option>";
    }
    return out;
  }
  function repOptions(cur) {
    return optionsFrom(clampN, function (i) {
      return i <= REP_BOUNDS.nMax - REP_BOUNDS.nMin ? REP_BOUNDS.nMin + i : null;
    }, cur);
  }
  function gapOptions(cur) {
    return optionsFrom(clampG, function (i) {
      const v = REP_BOUNDS.gapMin + i * REP_BOUNDS.gapStep;
      return v <= REP_BOUNDS.gapMax + 1e-9 ? roundHalf(v) : null;
    }, cur);
  }

  /* ---------------- 朗读 / 送进单词卡 ---------------- */
  function speakWord(w) {
    if (!window.Player || !window.Player.speak) return;
    const boot = window.FTE_BOOT;
    const rate = (boot && boot.progress && boot.progress.rate) || 1;
    window.Player.speak(w, { rate: rate });
  }

  function speakPhonemeWords(p) {
    const list = (index()[p.ipa] || []).slice(0, 10);
    if (!list.length) return;
    if (!window.Player || !window.Player.speak) return;
    const boot = window.FTE_BOOT;
    const rate = (boot && boot.progress && boot.progress.rate) || 1;
    /* 逐词连读，中间用逗号拉开停顿，方便跟读 */
    if (window.Player.repeat) {
      window.Player.repeat(list.map(function (x) { return x.w; }).join(", "), { rate: rate });
    } else {
      window.Player.speak(list.map(function (x) { return x.w; }).join(", "), { rate: rate });
    }
  }

  /* ---------------- 🎤 词级跟读（P10） ----------------
     闭环：复读 N 次（每次之间留 gap 秒给你跟读）→ 自动开录 → 自动停 → 回放你自己的 →
     再放一遍标准音做 A/B 对照。三段都复用既有实现：Player.repeat / startRecording /
     stopRecording / speak；本页**不打分**（识别≠发音，单词级评分不可靠）。

     ⚠️ 状态与边界：
       · 一次只允许一条跟读链（S.shadow 令牌），再点即打断上一条，不会两条录音并行；
       · 麦克风不可用（file:// / 微信内置浏览器 / 未授权）→ **明说**并降级为"只听标准音"，
         不假装录上了；
       · blob URL 在下一轮或换页时 revoke，避免一直占内存；
       · `mediaRecorder` 或 `Player.canRecord` 任一缺失即走降级分支。 */
  function shadowWord(w) {
    const P = window.Player;
    if (!P || !w) return;
    S.shadow = (S.shadow || 0) + 1;
    const my = S.shadow;
    const alive = function () { return S.shadow === my; };
    const toast = function (m) {
      const t = window.TutorEnv && window.TutorEnv.toast;
      if (t) t(m); else console.log(m);
    };
    const boot = window.FTE_BOOT;
    const rate = (boot && boot.progress && boot.progress.rate) || 1;

    const canRec = !!(P.canRecord && P.canRecord() && P.startRecording && P.stopRecording);
    const rep = (P.repeat && P.repeatPref) ? P.repeatPref : { n: 1, gap: 0.5 };

    paintShadow(w, "听着…");
    const play = (opts) => {
      if (!P.speak) return;
      P.speak(w, Object.assign({ rate: rate }, opts || {}));
    };

    /* 降级：只能听，不能录 —— 不静默失败，把原因和出口讲清楚 */
    if (!canRec) {
      play();
      toast("麦克风不可用（需 https/localhost + 授权；微信内置浏览器受限）——已只播放标准发音");
      paintShadow(w, "");
      return;
    }

    const rehearse = (P.repeat)
      ? P.repeat(w, { rate: rate, n: rep.n, gap: rep.gap, onDone: afterRehearse })
      : (play(), setTimeout(afterRehearse, 800));
    S.shadowRep = rehearse;

    function afterRehearse() {
      if (!alive()) return;
      paintShadow(w, "录音中… 跟读");
      P.startRecording().then(function () {
        if (!alive()) { P.stopRecording(); return; }
        S.shadowTimer = setTimeout(function () {
          if (!alive()) return;
          P.stopRecording().then(function (url) {
            if (!alive() || !url) { paintShadow(w, ""); return; }
            if (S.shadowUrl) { try { URL.revokeObjectURL(S.shadowUrl); } catch (e) { /* ignore */ } }
            S.shadowUrl = url;
            const a = new Audio(url);
            paintShadow(w, "回放你的 →");
            a.onended = function () {
              if (!alive()) return;
              paintShadow(w, "对比标准音 →");
              play({ onend: function () { if (alive()) paintShadow(w, ""); } });
            };
            a.onerror = function () { if (alive()) paintShadow(w, ""); };
            a.play().catch(function () { if (alive()) paintShadow(w, ""); });
          });
        }, Math.max(1200, rep.gap * 1000));
      }).catch(function (err) {
        if (!alive()) return;
        const name = (err && err.message) || "denied";
        toast(name === "no-media"
          ? "此环境不支持录音（需 https/localhost），已改为只听标准音"
          : "麦克风未授权或不可用，已改为只听标准音");
        play();
        paintShadow(w, "");
      });
    }
  }

  /* 把"当前在跟读哪个词 / 进行到哪一步"写在词旁边（局部 DOM 更新，不整页 render） */
  function paintShadow(w, stage) {
    const els = document.querySelectorAll('.hr-shadow[data-w="' + w.replace(/"/g, '\\"') + '"]');
    for (let i = 0; i < els.length; i++) {
      els[i].classList.toggle("on", !!stage);
      els[i].setAttribute("aria-busy", stage ? "true" : "false");
    }
    const host = document.querySelector(".hr-rep");
    if (host) {
      let s = host.querySelector(".hr-rep-stage");
      if (!s) {
        s = document.createElement("span");
        s.className = "hr-rep-stage";
        host.appendChild(s);
      }
      s.textContent = stage ? "🎤 " + w + "：" + stage : "";
    }
  }

  function sendToFlash(ipa) {
    const list = (index()[ipa] || []).slice(0, 30);
    const boot = window.FTE_BOOT;
    if (!list.length) return;
    if (!boot || !boot.State) { return; }
    boot.State.flash = {
      unit: { id: "PH", title: "🔤 音素 " + ipa + " 例词", vocab: [] },
      queue: list.map(function (x, i) {
        return { id: "ph-" + ipa + "-" + i, w: x.w, ipa: x.ipa, cn: x.cn, ex: x.ex, exCn: x.exCn, why: "" };
      }),
      idx: 0, stats: { known: 0, unknown: 0 }, freshLeft: 0, dueLeft: 0
    };
    location.hash = "#/flash";
  }

  function credit(secs) {
    try { if (window.CoachBridge && window.CoachBridge.credit) window.CoachBridge.credit(secs || 60); } catch (e) { /* ignore */ }
  }

  /* ---------------- 渲染 ---------------- */
  function esc(s) { const f = window.TutorEnv && window.TutorEnv.esc; return f ? f(s) : String(s == null ? "" : s); }

  function render() {
    const app = document.getElementById("app");
    if (!app) return;
    const idx = index();
    const list = PHONEMES.filter(function (p) { return S.group === "all" || p.type === S.group; });
    const totalWords = units().reduce(function (a, u) { return a + (u.vocab || []).length; }, 0);

    const chips = ["all", "vowel", "diphthong", "consonant"].map(function (g) {
      const n = g === "all" ? PHONEMES.length : PHONEMES.filter(function (p) { return p.type === g; }).length;
      return '<button class="scen-chip' + (S.group === g ? " on" : "") + '" data-action="ph-group" data-id="' + g + '" aria-pressed="' + (S.group === g ? "true" : "false") + '" title="只看这一类音素">' +
        GROUP_NAME[g] + " " + n + "</button>";
    }).join("");

    const cards = list.map(function (p) {
      const ws = idx[p.ipa] || [];
      const isOpen = S.open === p.ipa;
      const shown = isOpen ? ws.slice(0, 40) : ws.slice(0, 6);
      const wordChips = shown.map(function (x) {
        return '<button class="ph-word" data-action="ph-say" data-w="' + esc(x.w) + '" title="' + esc(x.ipa + (x.cn ? "  " + x.cn : "")) + '">' +
          esc(x.w) + (x.dom ? '<span class="ph-dom">专</span>' : "") + "</button>";
      }).join("");
      const contrast = (p.contrast || []).map(function (c) {
        const t = PHONEMES.filter(function (q) { return q.ipa === c; })[0];
        return '<button class="ph-vs" data-action="ph-jump" data-id="' + esc(c) + '" title="' + esc(t ? t.zh : "") + '">↔ ' + esc(c) + "</button>";
      }).join("");
      return `
      <div class="ph-card${isOpen ? " open" : ""}">
        <div class="ph-top">
          <span class="ph-sym">${esc(p.ipa)}</span>
          <span class="ph-meta"><b>${esc(p.zh)}</b><span class="ph-type">${GROUP_NAME[p.type]}</span></span>
          <span class="ph-count">${ws.length} 词</span>
        </div>
        <div class="ph-tip">${esc(p.tip)}</div>
        ${contrast ? '<div class="ph-vsrow"><span class="field-note" style="margin:0">易混：</span>' + contrast + "</div>" : ""}
        <div class="ph-words">${wordChips || '<span class="field-note">（站内暂无例词）</span>'}</div>
        <div class="ph-ops">
          <button class="btn btn-soft btn-sm" data-action="ph-play" data-id="${esc(p.ipa)}">🔊 连读前 10 个</button>
          <button class="btn btn-outline btn-sm" data-action="ph-flash" data-id="${esc(p.ipa)}">🃏 例词进单词卡</button>
          ${ws.length > 6 ? '<button class="btn btn-outline btn-sm" data-action="ph-more" data-id="' + esc(p.ipa) + '" aria-pressed="' + (isOpen ? "true" : "false") + '" title="' + (isOpen ? "只看前 6 个例词" : "展开这个音素的全部 " + ws.length + " 个例词") + '">' + (isOpen ? "收起" : "显示全部 " + ws.length + " 词") + "</button>" : ""}
        </div>
      </div>`;
    }).join("");

    app.innerHTML = `
    <div class="page-head">
      <div class="crumbs"><a href="#/home">首页</a> / 音素课</div>
      <h2>🔤 音素与辨音 <span class="en">只练会出事故的那几组，其余当参考</span></h2>
      <p style="margin-top:8px;max-width:820px;color:var(--muted)"><b>发音不是练完 41 个音素才算过关。</b>对四级荒废多年的在职业务员，真正会让你在客户面前出事的只有十来个——所以这一页的主次很明确：<b>上面那十组先练</b>，下面的完整音素表只作<b>查阅</b>（想知道某个音出现在哪些行业词里时再展开）。</p>
      <p style="margin-top:6px;max-width:820px;color:var(--muted)">每组配的例词都<b>不是教材里的 apple / banana</b>，而是从本站 ${totalWords} 条行业词里自动索引出来的——复合膜、上胶量、剥离强度、订舱、信用证。你练的就是真要发的那些音。</p>
      <div class="field-note" style="margin-top:8px">口径：<b>美式通用口音（General American）</b>，与站内音标规范一致（用 <code>e</code> 不用 <code>ɛ</code>、用 <code>ɡ</code>、不用 <code>ɝ/ɚ</code>）。下方的口型描述是<b>教学近似</b>，帮你找到发音位置，不等于声学定义；以真实母语发音为准。</div>
    </div>

    ${highRiskHtml()}

    <!-- 完整音素表默认【折叠】：一线教师评审指出「41 个音素对四级荒废多年的业务员是负担」。
         它真正的用途是**查**（某个音出现在哪些行业词里），不是从头学——故降为参考附录，
         与上面「先练这 10 组」形成明确主次。折叠状态记在 S.fullOpen，
         否则点筛选 chip 触发重渲染时会自动收起。 -->
    <details class="ph-full"${S.fullOpen ? " open" : ""}>
      <summary><b>📖 完整音素表（${PHONEMES.length} 个 · 参考用）</b>
        <span class="ph-full-sub">平时不用展开——先练上面那 ${HIGH_RISK.length} 组就够。这里适合<b>查</b>：想知道某个音出现在哪些行业词里，按类型筛选，或用浏览器 Ctrl+F 搜音标。</span></summary>
      <div class="ph-full-body">
        <div class="card" style="padding:14px 16px">
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${chips}
            <span class="field-note" style="margin:0 0 0 auto">听音对比请用「🎤 口语听说 → <a href="#/listen">辨音 · 最小音对</a>」</span>
          </div>
        </div>
        <div class="ph-grid" style="margin-top:12px">${cards}</div>
      </div>
    </details>
    `;
    window.scrollTo(0, 0);
  }

  /* ---------------- 事件 ---------------- */
  if (typeof document !== "undefined") document.addEventListener("click", function (e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const act = el.getAttribute("data-action");
    if (!act || act.indexOf("ph-") !== 0) return;
    const id = el.getAttribute("data-id");
    if (act === "ph-group") { S.group = id || "all"; S.open = null; S.fullOpen = true; render(); return; }
    if (act === "ph-more") { S.open = (S.open === id) ? null : id; render(); return; }
    if (act === "ph-say") { speakWord(el.getAttribute("data-w") || ""); return; }
    if (act === "ph-shadow") { shadowWord(el.getAttribute("data-w") || ""); credit(60); return; }
    if (act === "ph-play") {
      const p = PHONEMES.filter(function (q) { return q.ipa === id; })[0];
      if (p) { speakPhonemeWords(p); credit(60); }
      return;
    }
    if (act === "ph-flash") { sendToFlash(id); credit(60); return; }
    if (act === "ph-jump") {
      const t = PHONEMES.filter(function (q) { return q.ipa === id; })[0];
      if (!t) return;
      S.group = "all";
      S.open = id;
      render();
      const card = document.querySelector(".ph-card.open");
      if (card && card.scrollIntoView) card.scrollIntoView({ block: "center" });
      return;
    }
  });
  /* 复读设置用 change（select 不触发 click）——同样是**事件委托**，不写内联 onchange：
     CSP 与 tools/test-immerse-weekly.js 的内联处理器扫描都盯着这一点。
     改完只更新既有输入框的值，**不整页 render()**（否则正在跑的那一轮跟读会被打断）。 */
  if (typeof document !== "undefined") document.addEventListener("change", function (e) {
    const el = e.target && e.target.closest ? e.target.closest("[data-action]") : null;
    if (!el) return;
    const act = el.getAttribute("data-action");
    if (act !== "ph-rep-n" && act !== "ph-rep-gap") return;
    const P = window.Player;
    if (!P || !P.setRepPref) return;
    const pre = P.repPref || { n: 2, gap: 1.5 };
    const v = parseFloat(el.value);
    const next = (act === "ph-rep-n") ? P.setRepPref(v, pre.gap) : P.setRepPref(pre.n, v);
    paintRepCtl(next);
  });

  /* 把夹取后的有效值回写到两个下拉框（用户在 Player 夹取过的值上看到的应是真的生效值） */
  function paintRepCtl(pref) {
    const map = { "ph-rep-n": pref.n, "ph-rep-gap": pref.gap };
    Object.keys(map).forEach(function (a) {
      const el = document.querySelector('[data-action="' + a + '"]');
      if (el) el.value = String(map[a]);
    });
  }

  /* 供自动化测试/诊断使用（不影响运行时）。放在文件末尾：
     PHONEMES / INVENTORY / SKIP 均为 const，声明前引用会触发 TDZ。 */
  window.Phonemes._t = {
    tokenize: tokenize, INVENTORY: INVENTORY, SKIP: SKIP,
    PHONEMES: PHONEMES, buildIndex: buildIndex, NAMES: NAMES,
    HIGH_RISK: HIGH_RISK, findWord: findWord, highRiskHtml: highRiskHtml,
    repOptions: repOptions, gapOptions: gapOptions, shadowWord: shadowWord, REP_BOUNDS: REP_BOUNDS
  };
})();
