/**
 * Sample report data — 江淮汽车 600418.
 *
 * Modeled after the StockAlpha V0.0.2 PDF report seen on 2025-12-31.
 * Reused as the seed dataset for the /report/[ticker] module so we can
 * demonstrate the 11-section layout without first wiring backend RPC.
 *
 * When the real backend endpoint /v1/report/full?ticker=XXX lands, this
 * exact shape is what it will return — the page renders the same.
 */

import type { ReportData } from "../_types";

export const SAMPLE_600418: ReportData = {
  // ─── Meta ────────────────────────────────────────────────────────────
  ticker: "600418",
  name: "江淮汽车",
  market: "A-share",
  exchange: "SSE",
  asof: "2025-12-31",
  report_id: "report_sample_600418_v002",
  generated_at: "2025-12-31T12:25:51+08:00",
  system_version: "Concordal v3.1 · Report Module v1",

  // ─── Header ──────────────────────────────────────────────────────────
  core_view: "公司基本面尚可但缺乏催化剂，建议持有或等待更好买点。",
  decision_confidence: 0.60,
  confidence_level: "中",

  // ─── §1 Investment Summary ───────────────────────────────────────────
  summary: {
    rating: "HOLD",
    rating_label_zh: "持有",
    current_price: 49.60,
    currency: "CNY",
    target_price_low: 47.00,
    target_price_high: 52.00,
    expected_return_pct: 5.0,
    expected_return_sign: "±",
    holding_period: "3-6 个月",
    investor_type: "平衡型投资者",
    position_size_range: "5-15%",
    entry_timing: "耐心等待更好时机",
    key_observations: [
      "公司的盈利能力如何？",
      "股价趋势如何？",
      "研究问题的验证情况",
    ],
    bull_oneliner: "当前股价对疲弱基本面的偏离是合理的，因为它提前并合理地反映了公司通过与华为、大众的战略合作实现结构性反转的巨大潜力。",
    bear_oneliner: "市场为「转型期权」支付的溢价（高 PB、畸高 PS）已过度透支了合作成功的乐观预期，而中期内合作证伪或不及预期…",
  },

  // ─── §2.1 Qualitative ────────────────────────────────────────────────
  qualitative: {
    research_topic: "标准股票分析",
    core_question: "当前股价是否合理反映基本面状况？",
    research_background: "估值 vs 基本面",
    opening_conclusion: "当前股价并未完全、理性地反映其疲弱的基本面，但其中包含了市场对潜在重大变革（如与大众、华为深化合作）的强烈预期。核心矛盾在于：**极度糟糕的当期财务数据**（估值分母为负，盈利能力崩溃）与 **充满想象空间的战略转型叙事** 之间的巨大撕裂。短期内股价由「故事」和情绪主导，但中期 (3-12 个月) 能否实现价值回归，完全取决于这些战略合作能否转化为实实在在的盈利改善。目前基本面力量（向下）远强于估值修复力量（向上），除非有明确的业务落地信号。",
    framework_1_three_step_valuation: {
      title: "三步估值定位",
      step_1_comparison: {
        title: "对比定位",
        items: [
          {
            label: "与自身历史对比",
            body: "当前 PE 为 -56.65，PB 高达 10.91，PS 异常高（35087.97）。这些数据本身已失真（因亏损导致 PE 为负），高极端的 PB 和 PS 表明，市场给予公司的估值已完全脱离了传统的盈利或销售倍数，而是基于其净资产（特别是生产资质、工厂、与大众的合资公司股权等）和未来可能爆发的收入预期进行定价。",
          },
          {
            label: "与同业对比",
            body: "相较于其他主流车企（无论传统或新势力），江淮汽车的 PB 估值显著偏高。这并非因为其经营更优，而是因为其被视为一个潜在的「壳资源」或「合作平台」，市场在为其独特的「华为智选车」合作伙伴身份和与大众的深度绑定支付溢价。",
          },
          {
            label: "与绝对估值对比",
            body: "在当期净利润为负、自由现金流可能为负的情况下，传统的 DCF 模型无法适用。其估值本质上是基于「实物期权」模型——市场在为「与科技巨头合作成功」这一不确定性事件定价。",
          },
        ],
      },
      step_2_attribution: {
        title: "归因分析",
        market_concerns: [
          {
            label: "主业持续失血",
            body: "公司自身品牌（思皓等）市场竞争力弱，营收下滑（YoY -4.14%），持续亏损（ROE -13.47%，净利率 -4.94%），造血能力堪忧。",
          },
          {
            label: "合作的不确定性",
            body: "与华为的合作（智选车模式）具体车型、销量、利润分成模式尚未完全清晰；与大众的合作虽已落地（大众安徽），但对上市公司的利润贡献路径和规模有待观察。",
          },
          {
            label: "财务健康度",
            body: "风险警示指出存在流动性风险，这限制了公司在转型期自主投入的能力。",
          },
        ],
        are_concerns_reasonable: "非常合理。数据证实了主业羸弱，而重大战略合作从协议到产生规模利润需要时间（通常超过 12 个月），且存在失败风险。",
        catalysts_to_change_concerns: [
          {
            label: "华为合作车型发布及预售数据超预期",
            body: "这是最强的催化剂。",
          },
          {
            label: "大众安徽车型上市并开始向上市公司贡献显著投资收益",
            body: "",
          },
          {
            label: "公司自身降本增效，亏损收窄",
            body: "改善基本面安全垫。",
          },
        ],
      },
      step_3_scenarios: {
        title: "情景测算",
        scenarios: [
          {
            label: "悲观情景",
            assumption: "合作不及预期，主业继续下滑",
            body: "估值将完全回归净资产甚至折价。PB 可能从当前的 10.91 倍跌至 1-2 倍行业平均偏低水平，下行空间巨大（超过 80%）。PS 因营收萎缩而继续畸高无意义。",
            fair_value: 42.16,
          },
          {
            label: "中性情景",
            assumption: "合作稳步推进，主业亏损维持",
            body: "估值维持在高 PB 水平（5-10 倍）宽幅震荡，股价由合作进展的消息面驱动。市值主要由「期权价值」支撑。",
            fair_value: 49.60,
          },
          {
            label: "乐观情景",
            assumption: "合作车型成为爆款，利润开始体现",
            body: "市场将开始用 PE 估值。假设合作带来显著利润，给予一定增长溢价，PE 可能修复至 20-30 倍，推动股价上行。但上行空间取决于利润体量，目前难以量化。",
            fair_value: 59.52,
          },
        ],
        conclusion: "当前股价处于中性偏乐观情景的预期中。下行风险远大于上行机会的确定性。",
      },
    },
    framework_2_dupont: {
      title: "杜邦分解与驱动力识别",
      roe: -13.47,
      decomposition: [
        { name: "净利率", value: -4.95, unit: "%", note: "这是核心拖累。表明公司产品定价能力弱或成本控制差，卖车可能不赚钱甚至亏钱。" },
        { name: "资产周转率", value: null, unit: "—", note: "数据缺失，但营收同比下滑暗示资产运营效率可能也在降低。" },
        { name: "杠杆率（权益乘数）", value: 1.087, unit: "(Book_to_Market)", note: "说明市场市值略高于净资产，杠杆水平需结合具体负债看，但风险警示已提示流动性风险。" },
      ],
      nature_of_change: [
        { label: "结构性而非周期性", body: "江淮自主品牌的弱势是长期问题，非短期行业周期所致。盈利能力下滑是结构性问题。" },
        { label: "可持续性", body: "当前的亏损趋势在没有外力（华为/大众）介入下，大概率可持续（持续亏损）。预期的盈利改善完全依赖于外部合作的「结构性变化」。" },
      ],
      key_observation_indicator: "单季度毛利率和扣非净利润",
      change_signal: "如果毛利率显著提升（表明华为合作的高价值部件开始装车并改善产品结构），或扣非净利润亏损幅度大幅收窄，则证明转型开始触及基本面，逻辑链进入验证阶段。反之，若数据依然糟糕，则证明股价纯属炒作。",
    },
    framework_3_logic_chain: {
      title: "逻辑链构建",
      chain: [
        "政府推动汽车产业升级 / 智能化",
        "江淮与华为达成智选车合作",
        "市场预期合作车型具备爆款潜力",
        "预期江淮获得高额技术服务和销售分成",
        "预期公司净利润由负转正且高增长",
        "推动估值从 PB 切换至 PE 并提升",
        "股价上涨",
      ],
      weakest_link: {
        link: "市场预期合作车型具备爆款潜力 → 预期江淮获得高额…分成",
        fragility: [
          "华为合作车型众多（问界、智界等），江淮车型能否脱颖而出存疑",
          "智选车模式下，华为占据主导，江淮的利润分成比例和绝对值可能有限，沦为「代工厂」",
          "车型从发布到上量再到盈利，周期长、变数多",
        ],
      },
      validation_signals: {
        leading: "合作车型的官方发布、预售订单数（如 24 小时大定数量）",
        coincident: "每月公布的该车型销量数据",
        lagging: "财报中「投资收益」或「其他业务收入」科目出现大幅增长，并能明确归因于合作项目",
      },
    },
    six_questions: [
      { q: "核心矛盾（估值 vs 基本面）", a: "估值已大幅背离基本面。股价反映的是「未来可能的美好基本面」，而非「当前残酷的现实基本面」。矛盾期内无法调和，由预期主导。" },
      { q: "关键变量：公司的盈利能力如何？", a: "当前极差，且无自主改善迹象。所有盈利改善的希望都寄托于外部合作，这是一个高风险假设。" },
      { q: "增长是否稳健？", a: "不稳健。营收负增长，盈利深度负增长，毫无稳健性可言。" },
      { q: "政策催化点？", a: "[情境] 存在。汽车行业「新质生产力」、「智驾」等政策方向，间接利好其与华为的合作故事，是重要的情绪催化剂。" },
      { q: "中期行业趋势与公司地位变化？", a: "[个性化] 行业趋势是智能化、集中化。江淮的地位可能发生巨变——从边缘自主品牌跃升为头部科技公司的核心制造伙伴。但这只是「可能」，非「既定」。" },
      { q: "主要特征与预期差机会？", a: "[个性化] 主要特征是「困境反转期权」。最大的预期差机会在于：市场可能高估了合作成功的概率和江淮的受益程度，或者低估了主业持续失血的速度。真正的预期差机会，出现在合作车型销量持续超预期、且财报证实利润流入之时，而非现在。" },
    ],
    validation_signals_and_window: {
      validation: "下一份季度报告中毛利率的改善；合作车型正式上市后连续 3 个月的销量数据",
      time_window: "未来 6-12 个月",
      falsification: "如果在此期间合作车型销量平淡或财报未体现利润，则当前的高估值叙事将面临破灭风险（失效条件）",
    },
    actionable: {
      type_match: "标准型类型的公司",
      operating_advice: "震荡市操作建议：该股因故事性强，非常适合波段操作，但不宜基于基本面「耐心持有」。投资者应紧密跟踪合作进展的新闻和数据，在利好发布前后博弈，在数据真空期或利好出尽时警惕回落。打破震荡格局的向上因素是爆款车型证据确凿；向下因素是合作进展停滞或主业亏损急剧扩大。",
    },
  },

  // ─── §2.2 Quantitative Verification ──────────────────────────────────
  quantitative: {
    growth: {
      title: '"盘子"在做大吗？',
      body: "公司营收增长情况需根据财报数据分析，建议关注未来几个季度的营收趋势。",
      data_status: "营收趋势图表待生成",
    },
    profitability: {
      title: '"利润"在变厚吗？',
      body: "公司盈利能力需根据财报数据分析，毛利率和净利率水平反映公司盈利质量。",
      data_status: "利润趋势图表待生成",
    },
    cash_health: {
      title: '"利润"变成"真金白银"了吗？',
      body: "公司经营性现金流需根据财报数据分析，经营现金流与净利润的匹配度反映盈利质量。",
      data_status: "现金流图表待生成",
    },
    shareholder_return: {
      title: "企业对股东慷慨吗？",
      body: "公司分红政策需查阅公司年报，近三年平均股息率约为 N/A%，在 A 股市场中属于 待评估 水平。",
      rows: [
        { year: 2022, dividend_ratio: "数据待补充", dividend_yield: "N/A%" },
        { year: 2023, dividend_ratio: "数据待补充", dividend_yield: "N/A%" },
        { year: 2024, dividend_ratio: "数据待补充", dividend_yield: "N/A%" },
      ],
    },
    summary: "财务数据验证了上述定性判断，建议关注未来几个季度的财务指标变化趋势。",
  },

  // ─── §2.3 Professional Valuation ─────────────────────────────────────
  valuation: {
    rows: [
      { metric: "市盈率 (PE)", current: "-56.65", historical_median: "N/A", industry_average: "N/A", assessment: "待评估" },
      { metric: "市净率 (PB)", current: "10.91", historical_median: "N/A", industry_average: "N/A", assessment: "待评估" },
      { metric: "市销率 (PS)", current: "35087.97", historical_median: "N/A", industry_average: "N/A", assessment: "N/A" },
      { metric: "股息率", current: "N/A%", historical_median: "N/A%", industry_average: "N/A%", assessment: "N/A" },
    ],
    relative_conclusion: "从主要估值指标看，公司当前估值水平处于自身历史的 待评估 分位，相对于同行业公司也显得 待评估。",
    fair_value_ranges: [
      { scenario: "悲观情景", assumption: "假设基本面持续恶化", fair_value_cny: 42.16 },
      { scenario: "中性情景", assumption: "假设当前趋势延续", fair_value_cny: 49.60 },
      { scenario: "乐观情景", assumption: "假设基本面改善", fair_value_cny: 59.52 },
    ],
    final_conclusion: "当前估值处于合理区间，既无明显高估也无明显低估，建议等待更好的买卖时机。",
  },

  // ─── §3.1 Money Flow + Sentiment ─────────────────────────────────────
  market_sentiment: {
    capital_flow_status: "待分析",
    capital_flow_note: "近期主力资金呈现 待分析 态势，表明机构态度 需评估。",
    sentiment_zone: "中性",
    sentiment_note: "市场情绪目前处于 中性 区域，股价 可能已包含 过度乐观或悲观预期。",
    sector_effect: "同步于大盘",
    sector_note: "所属 所属板块 近期表现 同步于 大盘，为股价提供了 中性 的环境。",
  },

  // ─── §3.2 Technical Analysis ─────────────────────────────────────────
  technical: {
    opening_conclusion: "技术面显示，江淮汽车股价目前正处于一个由预期驱动、但缺乏基本面支撑的宽幅震荡格局中。当前股价趋势（震荡偏强）与基本面（疲弱）之间存在显著背离，这种背离由市场对「华为合作」等战略转型预期的强烈预期驱动。技术面提供了支撑「估值一方」（即股价因期权价值而维持高位），但启动动能不足，使得短期内呈现出胶着且成交量能持续疲软，表明上涨缺乏足实实在在量能基础。",
    framework_1_trend: {
      title: "趋势定位（三层次分析）",
      layer_1_macro: {
        title: "主趋势判断",
        adx: 24.32,
        body: "当前市场无明显方向的震荡格局。ADX 值为 24.32，处于 20-25 的「震荡趋势」区间上沿，表明市场风险加剧的，也无强烈的下降趋势。多空力量趋于均衡。价格在前期一个完整区间内宽幅波动。",
      },
      layer_2_logic: {
        title: "趋势逻辑",
        why_oscillating: "股价在 49.6 元附近，围绕关键中期均线（如 MA20）上下波动。这种震荡反映了市场核心矛盾：一方面，疲弱的基本面数据和财务风险警示（如 ROE 和能力率、业绩负增长）构成了向下的「重力」，限制了股价的上涨空间；另一方面，对与华为、大众合作的「故事」预期构成了「升力」的浮力，限制了股价的深度下跌。技术指标如 RSI 54.84、MFI 57.96 处于中性区间，也印证了多空僵持的状态。",
      },
      layer_3_signal: {
        title: "趋势预期因素",
        breakout_signals: "需关注是否出现 蓝背离 （例如脱价位出阶段新高，但 RSI 或 MACD 未能同步），但 RSI 或 MACD 未能同步背离。",
        reversal_signals: "需关注收益放大，预期落空的危险信号。目前尚未出现明显背离。",
      },
    },
    framework_2_momentum: {
      title: "动能分析",
      indicators: [
        { name: "RSI(14)", value: 54.84, note: "中性偏弱区域" },
        { name: "MFI(14)", value: 57.96, note: "比 RSI 略强，但仍处中性偏弱" },
        { name: "MACD(12,26,9)", value: null, note: "动能在正值区域接近 0，多空均势" },
        { name: "KDJ", value: 48.40, note: "也处于中性区域" },
      ],
      dynamic_interpretation: {
        driver: "当前微弱的正向动能主要来源于 情绪推动和事件预期，而非扎实的资金持续流入。每次关于合作进展的传闻或行业利好政策，都可能引发脉冲式上涨。",
        sustainability: "最关键的瓶颈是 成交量。最新交易日成交量并未显著放大，Volume_Ratio (0.88) 低于 1，表明买盘力量并不积极。没有量能配合的上涨，如同无源之水，极易在遭遇压力位或利空消息时回落。动能的持续性完全取决于后续是否有重磅合作进展（如车型发布、订单数据）等「故事」的实质性推进。",
      },
    },
    framework_3_key_levels: {
      title: "关键位与策略",
      pressure: {
        level: "50 元整数关口及前期震荡区间上沿",
        body: "这是一个重要的心理和技术双重压力位。若能带量有效突破，技术面将打开向上空间，吸引趋势交易者入场，震荡格局可能被打破。",
      },
      support: {
        level: "48 元附近（近期低点）及中长期均线密集区",
        body: "这里是多头的短期防线。如果跌破，将严重打击市场对「故事」的信心，技术面将转向有利于空头，股价可能向下寻找更低的支撑。",
      },
      breakout_logic: {
        up: "如果股价 放量（成交量显著高于近期平均水平）突破 50 元并站稳，则意味着市场对转型预期的信心增强，买盘开始占据主导，震荡格局可能转为向上的趋势性行情。这将是技术面对「估值故事」的第一次重要确认。",
        down: "如果股价有效跌破 48 元支撑，则表明市场对预期失去耐心，或出现了基本面的新增利空（如合作遇阻、业绩进一步恶化）。「故事」的支撑力失效，技术面将回归基本面引力，开启下跌趋势。",
        false_breakout: "1）成交量显著放大（至少是近期均量的 1.5 倍以上）；2）突破后能站稳 3 个交易日以上，且回踩时不跌破突破位；3）有基本面或消息面的催化剂配合。否则，很可能是假突破，是震荡区间内的诱多行为。",
      },
    },
    answers_to_questions: [
      { q: "关键变量：股价趋势如何？", a: "当前处于无方向的宽幅震荡中。趋势强度弱（ADX=24.32），由多空拉锯形成。" },
      { q: "技术指标信号？", a: "指标显示中性偏弱动能，缺乏一致性方向信号，成交量不配合，表明上涨缺乏根基。" },
      { q: "对核心矛盾（估值 vs 基本面）的解答", a: "技术面目前暂时且脆弱地支持「估值」一方，因为股价并未因糟糕的基本面而崩溃，而是在预期支撑下维持震荡。但这并非对基本面价值的认可，而是对「未来价值」的期权定价。" },
    ],
    answers_to_situational: [
      { q: "震荡市中的波动特征", a: "该股表现为「消息驱动型脉冲，随后横盘消化」的特征。波动率（ATR 1.43，Historical Volatility 23.62%）中等，但方向性差。" },
      { q: "打破震荡的因素", a: "向上需要「故事」兑现的强信号（合作车型爆款订单）；向下则需要「故事」证伪或基本面风险爆发（如流动性危机）。目前看，由于基本面羸弱，向下的「重力」更实在，向下的概率略高于向上。" },
      { q: "操作建议", a: "非常适合波段操作，而非耐心持有。投资者应在支撑位附近（如 48-49 元）基于利好预期博弈反弹，在压力位附近（如 50 元上方）及时兑现。耐心持有需要等待技术面出现「真突破」且基本面出现明确改善信号之后。" },
    ],
    validation_and_falsification: [
      { label: "看涨逻辑的验证信号", body: "股价 放量（Volume_Ratio > 1.5）突破并站稳 50 元关口。这将是市场用钱投票，确认乐观预期的开始。" },
      { label: "当前逻辑的失效条件", body: "股价 收盘价有效跌破 48 元支撑。这意味着技术支撑被打破，市场对「故事」的信任瓦解，震荡格局可能转为下跌趋势，届时技术面将转向支持基本面（向下）的逻辑。" },
    ],
  },

  // ─── §4.1 Bull vs Bear Debate ────────────────────────────────────────
  debate: {
    bull_case: [
      "当前股价对疲弱基本面的偏离是合理的，因为它提前并合理地反映了公司通过与华为、大众的战略合作实现结构性反转的巨大潜力",
      "情景测算显示，乐观情景下合理估值约 59.52 元，相对当前 49.60 元有 20% 上行空间",
      "标准股票分析逻辑成立",
    ],
    bear_case: [
      "好的，投资指挥官。作为看跌研究员，我已深入分析所有材料，并构建审慎的看跌论点如下…",
      "好的，投资指挥官。作为看跌研究员，我已深入分析所有材料，并严格遵循您下达的框架，构建审慎的看跌论点如…",
      "估值 vs 基本面冲突存在",
    ],
    our_judgment: "我们认为多空因素交织，建议等待更明确的信号后再做决策。当前 **持观望态度** 更为合理。",
  },

  // ─── §4.2 Risk Disclosure ────────────────────────────────────────────
  risks: [
    { label: "行业与政策风险", body: "所属行业受宏观经济和政策影响较大，需关注相关政策变化和市场环境变化。" },
    { label: "公司经营风险", body: "公司经营存在不确定性，需关注财报数据和经营状况变化。" },
    { label: "市场与估值风险", body: "市场情绪和风格切换可能影响股价短期表现，需关注市场整体环境和流动性状况。" },
  ],

  // ─── §5.1 Operation Plan ─────────────────────────────────────────────
  operation_plan: {
    action: "HOLD (建议持有)",
    portfolio_advice: "可作为投资组合中的 观望或小幅配置",
    position_management: "建议维持当前仓位或小幅调整。如若操作，建议分批进行，单次变动不超过 5%。",
    key_info: "好的，投资指挥官。我已审阅投资法官的最终决策及辩论总结，现制定详细的交易执行计划如下。",
    trade_decision: "HOLD（对于未持仓者，即「观望」；对于持仓者，即「持有并伺机调整」）",
    position_advice: [],
  },

  // ─── §5.2 Follow-up Checklist ────────────────────────────────────────
  follow_up: [
    { item: "核心验证",   indicator: "公司的盈利能力如何？", expected_time: "下季报发布日", impact: "若低于预期，则标准股票分析弱化" },
    { item: "风险监测",   indicator: "市场整体走势、行业政策", expected_time: "持续",         impact: "若出现重大变化，需重新评估估值 vs 基本面" },
    { item: "技术面验证", indicator: "股价趋势如何？",       expected_time: "每周",         impact: "若跌破关键支撑位，需考虑止损" },
    { item: "催化剂",     indicator: "行业重要政策、公司重大事件", expected_time: "不确定",   impact: "若落地，可能加速价值发现" },
  ],

  // ─── Appendix: Team Contribution ─────────────────────────────────────
  team: {
    teams: [
      { name: "指挥团队", role: "全程协调", agents: 1 },
      { name: "分析团队", role: "五维分析（基本面、技术、情绪、新闻、宏观）", agents: 5 },
      { name: "研究团队", role: "投资辩论（多/空对抗）", agents: 2 },
      { name: "风险团队", role: "风险辩论（保守/中性/激进）", agents: 3 },
      { name: "交易团队", role: "最终决策综合", agents: 1 },
    ],
    architecture: "12 个 Agent 节点（5 分析师 + 多 + 空 + 3 风险 + Manager + Manager-second 共识）",
    decision_mechanism: "双层辩论系统（投资辩论 + 风险辩论 + 双 LLM 共识）",
    problem_generation: "三层结构（研究主题 + 研究问题 + 研究背景）",
    data_sources: ["行情数据：交易所", "财务数据：SEC EDGAR / akshare 财报", "市场数据：5 层 A 股容灾链路", "新闻数据：Reddit + 东方财富股吧 + 雪球"],
  },

  // ─── Concordal Exclusive Extensions ──────────────────────────────
  bus_telemetry: [
    { need_kind: "QUOTE",        source: "tencent",                latency_ms: 142, cache_hit: false },
    { need_kind: "OHLCV",        source: "cn_equity_multi_source", latency_ms: 387, cache_hit: false },
    { need_kind: "FUNDAMENTALS", source: "akshare",                latency_ms: 612, cache_hit: false },
    { need_kind: "FACTOR",       source: "alpha158_lite",          latency_ms: 1,   cache_hit: false },
    { need_kind: "OHLCV",        source: "cache",                  latency_ms: 0,   cache_hit: true  },
    { need_kind: "NEWS",         source: "guba",                   latency_ms: 234, cache_hit: false },
    { need_kind: "SENTIMENT",    source: "guba",                   latency_ms: 0,   cache_hit: true  },
    { need_kind: "MACRO",        source: "openbb",                 latency_ms: 0,   cache_hit: true  },
    { need_kind: "TECHNICAL",    source: "yfinance",               latency_ms: 4,   cache_hit: false },
  ],
  calibration_context: {
    asserted_confidence: 0.60,
    historical_hit_rate_at_band: 0.654,
    band: "[0.6, 0.7)",
    sample_size: 312,
    note: "60% 置信度在我们 1,560 决策回测中对应 65.4% 实际命中率。本系统校准良好，且单调递增。",
  },
};
