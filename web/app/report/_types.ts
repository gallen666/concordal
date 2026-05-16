/**
 * Type definitions for the Professional Investment Research Report module.
 *
 * Shape is intentionally exhaustive so backend can implement
 * /v1/report/full?ticker=XXX with strong contracts. Every field maps to a
 * specific section in the 11-section StockAlpha-style report layout.
 */

export type Market = "A-share" | "US" | "HK" | "Crypto";
export type Rating = "BUY" | "HOLD" | "SELL";

export interface SummarySection {
  rating: Rating;
  rating_label_zh: string;
  current_price: number;
  currency: string;
  target_price_low: number;
  target_price_high: number;
  expected_return_pct: number;
  expected_return_sign: "+" | "-" | "±";
  holding_period: string;
  investor_type: string;
  position_size_range: string;
  entry_timing: string;
  key_observations: string[];
  bull_oneliner: string;
  bear_oneliner: string;
}

export interface ThreeStepValuation {
  title: string;
  step_1_comparison: {
    title: string;
    items: { label: string; body: string }[];
  };
  step_2_attribution: {
    title: string;
    market_concerns: { label: string; body: string }[];
    are_concerns_reasonable: string;
    catalysts_to_change_concerns: { label: string; body: string }[];
  };
  step_3_scenarios: {
    title: string;
    scenarios: { label: string; assumption: string; body: string; fair_value: number }[];
    conclusion: string;
  };
}

export interface DupontDecomposition {
  title: string;
  roe: number;
  decomposition: { name: string; value: number | null; unit: string; note: string }[];
  nature_of_change: { label: string; body: string }[];
  key_observation_indicator: string;
  change_signal: string;
}

export interface LogicChain {
  title: string;
  chain: string[];
  weakest_link: { link: string; fragility: string[] };
  validation_signals: { leading: string; coincident: string; lagging: string };
}

export interface QualitativeSection {
  research_topic: string;
  core_question: string;
  research_background: string;
  opening_conclusion: string;
  framework_1_three_step_valuation: ThreeStepValuation;
  framework_2_dupont: DupontDecomposition;
  framework_3_logic_chain: LogicChain;
  six_questions: { q: string; a: string }[];
  validation_signals_and_window: {
    validation: string;
    time_window: string;
    falsification: string;
  };
  actionable: { type_match: string; operating_advice: string };
}

export interface QuantSection {
  growth: { title: string; body: string; data_status: string };
  profitability: { title: string; body: string; data_status: string };
  cash_health: { title: string; body: string; data_status: string };
  shareholder_return: {
    title: string;
    body: string;
    rows: { year: number; dividend_ratio: string; dividend_yield: string }[];
  };
  summary: string;
}

export interface ValuationSection {
  rows: {
    metric: string;
    current: string;
    historical_median: string;
    industry_average: string;
    assessment: string;
  }[];
  relative_conclusion: string;
  fair_value_ranges: { scenario: string; assumption: string; fair_value_cny: number }[];
  final_conclusion: string;
}

export interface MarketSentimentSection {
  capital_flow_status: string;
  capital_flow_note: string;
  sentiment_zone: string;
  sentiment_note: string;
  sector_effect: string;
  sector_note: string;
}

export interface TechnicalSection {
  opening_conclusion: string;
  framework_1_trend: {
    title: string;
    layer_1_macro: { title: string; adx: number; body: string };
    layer_2_logic: { title: string; why_oscillating: string };
    layer_3_signal: { title: string; breakout_signals: string; reversal_signals: string };
  };
  framework_2_momentum: {
    title: string;
    indicators: { name: string; value: number | null; note: string }[];
    dynamic_interpretation: { driver: string; sustainability: string };
  };
  framework_3_key_levels: {
    title: string;
    pressure: { level: string; body: string };
    support: { level: string; body: string };
    breakout_logic: { up: string; down: string; false_breakout: string };
  };
  answers_to_questions: { q: string; a: string }[];
  answers_to_situational: { q: string; a: string }[];
  validation_and_falsification: { label: string; body: string }[];
}

export interface DebateSection {
  bull_case: string[];
  bear_case: string[];
  our_judgment: string;
}

export interface OperationPlanSection {
  action: string;
  portfolio_advice: string;
  position_management: string;
  key_info: string;
  trade_decision: string;
  position_advice: string[];
}

export interface FollowUpRow {
  item: string;
  indicator: string;
  expected_time: string;
  impact: string;
}

export interface TeamSection {
  teams: { name: string; role: string; agents: number }[];
  architecture: string;
  decision_mechanism: string;
  problem_generation: string;
  data_sources: string[];
}

export interface BusTelemetryRow {
  need_kind: string;
  source: string;
  latency_ms: number;
  cache_hit: boolean;
}

export interface CalibrationContext {
  asserted_confidence: number;
  historical_hit_rate_at_band: number;
  band: string;
  sample_size: number;
  note: string;
}

export interface ReportData {
  // Meta
  ticker: string;
  name: string;
  market: Market;
  exchange: string;
  asof: string;
  report_id: string;
  generated_at: string;
  system_version: string;

  // Header
  core_view: string;
  decision_confidence: number;
  confidence_level: string;

  // Sections
  summary: SummarySection;
  qualitative: QualitativeSection;
  quantitative: QuantSection;
  valuation: ValuationSection;
  market_sentiment: MarketSentimentSection;
  technical: TechnicalSection;
  debate: DebateSection;
  risks: { label: string; body: string }[];
  operation_plan: OperationPlanSection;
  follow_up: FollowUpRow[];
  team: TeamSection;

  // TradingAgents exclusive extensions
  bus_telemetry: BusTelemetryRow[];
  calibration_context: CalibrationContext;
}
