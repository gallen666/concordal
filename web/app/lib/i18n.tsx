"use client";

/**
 * Lightweight in-app i18n. No external library — just a React Context, a
 * dictionary, and a localStorage persistence layer. Avoids bundling a full
 * i18n framework for what is currently a two-locale app (English + 中文).
 *
 * Usage:
 *   const { t, locale, setLocale } = useT();
 *   <h1>{t("landing.heroLine1")}</h1>
 *
 * Adding a new string: add an entry to `dict` keyed by the same logical
 * id in both `en` and `zh`. Try to keep keys descriptive and namespaced
 * (e.g. `decision.runDebate`, `header.watchlist`).
 *
 * Why TSX (not .ts): exporting a JSX provider component keeps the React
 * import implicit and lets us colocate the hook, provider, and dict in
 * a single file without a build step.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types & dict
// ---------------------------------------------------------------------------

export type Locale = "en" | "zh";

const STORAGE_KEY = "ta_locale";

const dict = {
  // ---- Header / nav -------------------------------------------------------
  "header.watchlist":           { en: "Watchlist",          zh: "自选股" },
  "header.newDecision":         { en: "New decision",       zh: "新建决策" },
  "header.backtest":            { en: "Backtest",           zh: "回测" },
  "header.redeemInvite":        { en: "Redeem invite",      zh: "兑换邀请码" },
  "header.real":                { en: "REAL",               zh: "真实" },
  "header.mock":                { en: "MOCK",               zh: "模拟" },
  "header.realTitle":           { en: "Real LLM enabled",   zh: "已启用真实大模型" },
  "header.mockTitle":           { en: "Mock mode",          zh: "模拟模式" },
  "header.logout":              { en: "Logout",             zh: "登出" },
  "header.langToggle":          { en: "中",                 zh: "EN" },
  "header.langToggleTitle":     { en: "切换到中文",         zh: "Switch to English" },

  // ---- Landing page -------------------------------------------------------
  "landing.pillBeta":           { en: "Closed beta · Decision-support", zh: "封闭测试 · 决策支持" },
  "landing.heroLine1":          { en: "Seven AI agents",                 zh: "七个 AI 分析师" },
  "landing.heroLine2":          { en: "debate every ticker",             zh: "为每只股票辩论" },
  "landing.heroLine3":          { en: "on your watchlist.",              zh: "替你深度复盘。" },
  "landing.heroBlurb":          {
    en: "A multi-agent LLM research desk modeled on real trading firms — fundamentals, sentiment, news, technical analysts; bull/bear researcher debate; risk committee; fund manager. Every decision is fully traceable, line by line.",
    zh: "一套对标真实买方机构的多 agent 研究台 —— 基本面、情绪、新闻、技术四大分析师；多空辩论；三档风控委员会；基金经理终审。每一个结论都可逐句溯源。",
  },
  "landing.checkNoLookahead":   { en: "No-lookahead enforced",  zh: "严格禁止前瞻偏差" },
  "landing.checkOpenSource":    { en: "Fully open-source core", zh: "核心代码完全开源" },
  "landing.checkNoTrades":      { en: "Never executes trades",  zh: "绝不替你下单交易" },

  "landing.featuresLabel":      { en: "What you get",                      zh: "你将获得" },
  "landing.featuresHeading":    { en: "Research, not a black box.",        zh: "研究报告，不是黑箱。" },
  "landing.featuresBlurb":      {
    en: "Every recommendation comes with the full debate behind it. Read the reasoning, challenge it, override it.",
    zh: "每一个推荐都附带完整的多空辩论。读它、挑战它、覆盖它。",
  },
  "landing.feature1Title":      { en: "One-click decision",                zh: "一键决策" },
  "landing.feature1Body":       {
    en: "Enter a ticker. Seven agents run in sequence — analysts, debaters, trader, risk committee, fund manager — and produce an explained Buy/Hold/Sell with target weight and confidence.",
    zh: "输入股票代码，七个 agent 顺序跑完——四大分析师、多空辩论、交易员、风控委员会、基金经理——给出可解释的买/持/卖建议、目标仓位和置信度。",
  },
  "landing.feature2Title":      { en: "Backtest replay",                   zh: "回测复盘" },
  "landing.feature2Body":       {
    en: "See how the agents would have decided on past dates. Strict no-lookahead enforced at the data layer, so you can trust the simulation.",
    zh: "看 agent 在历史日期上会怎么决策。数据层严格禁止前瞻，结果可靠。",
  },
  "landing.feature3Title":      { en: "Daily watchlist briefings",         zh: "盘前自选股简报" },
  "landing.feature3Body":       {
    en: "Every ticker you follow gets an automatic pre-market report (rolling out). Wake up to a coherent argument, not a wall of indicators.",
    zh: "你关注的每只票，每天盘前自动出报告（陆续上线）。看到的是一段有逻辑的论述，不是一墙的指标。",
  },

  "landing.pipelineLabel":      { en: "Inside one decision",                          zh: "一次决策的内部" },
  "landing.pipelineHeading":    { en: "The pipeline mirrors a real trading firm.",    zh: "流水线对标真实买方机构。" },
  "landing.pipelineStep":       { en: "step",                                         zh: "步骤" },
  "landing.pipeline1Label":     { en: "Data gathering",        zh: "数据搜集" },
  "landing.pipeline1Detail":    { en: "4 analysts in parallel", zh: "4 名分析师并行" },
  "landing.pipeline2Label":     { en: "Dialectical analysis", zh: "辩证分析" },
  "landing.pipeline2Detail":    { en: "Bull vs Bear debate",  zh: "多 vs 空 辩论" },
  "landing.pipeline3Label":     { en: "Trading decision",     zh: "交易决策" },
  "landing.pipeline3Detail":    { en: "Trader synthesis",     zh: "交易员综合" },
  "landing.pipeline4Label":     { en: "Risk control",         zh: "风险控制" },
  "landing.pipeline4Detail":    { en: "Aggressive / Neutral / Conservative", zh: "激进 / 中性 / 保守" },
  "landing.pipeline5Label":     { en: "Final approval",       zh: "终审" },
  "landing.pipeline5Detail":    { en: "Fund manager",         zh: "基金经理" },

  "landing.disclaimerStrong":   { en: "Decision-support tool only.",                  zh: "仅为决策支持工具。" },
  "landing.disclaimerBody":     {
    en: "Outputs are research generated by language models, not investment advice, not personal recommendations, and not solicitations to buy or sell any security. We don't execute trades. Past performance and backtests do not predict future results. Read the",
    zh: "输出内容仅为大模型生成的研究材料，不构成投资建议、个人推荐或买卖任何证券的要约。本平台不替你下单交易。过往业绩与回测结果均不预示未来回报。请查看",
  },
  "landing.disclaimerLink":     { en: "full disclaimer", zh: "完整免责声明" },

  // Waitlist on landing
  "waitlist.emailPlaceholder":  { en: "you@firm.com",                       zh: "you@firm.com" },
  "waitlist.notePlaceholder":   { en: "(optional) what would you use this for?", zh: "（可选）你打算用它做什么？" },
  "waitlist.join":              { en: "Join waitlist",                      zh: "加入等候名单" },
  "waitlist.sending":           { en: "Sending…",                           zh: "提交中…" },
  "waitlist.successTitle":      { en: "You're on the list",                 zh: "已加入候补名单" },
  "waitlist.successBody1":      { en: "We'll send your invite as we onboard the first cohort. Already have a code?", zh: "首批用户上线时会把邀请发给你。已经有邀请码？" },
  "waitlist.successRedeem":     { en: "Redeem here",                        zh: "在这里兑换" },
  "waitlist.alreadyHaveCode":   { en: "Already have a code?",               zh: "已有邀请码？" },
  "waitlist.redeem":            { en: "Redeem",                             zh: "去兑换" },

  // ---- Redeem page --------------------------------------------------------
  "redeem.title":               { en: "Redeem invite code",                 zh: "兑换邀请码" },
  "redeem.subtitle":            { en: "Enter the email and code we sent you.", zh: "填入邮箱和我们发给你的邀请码。" },
  "redeem.email":               { en: "EMAIL",                              zh: "邮箱" },
  "redeem.inviteCode":          { en: "INVITE CODE",                        zh: "邀请码" },
  "redeem.codePlaceholder":     { en: "trial",                              zh: "trial" },
  "redeem.submit":              { en: "Redeem",                             zh: "兑换" },
  "redeem.submitting":          { en: "Redeeming…",                         zh: "兑换中…" },
  "redeem.noCode":              { en: "Don't have a code?",                 zh: "还没有邀请码？" },
  "redeem.joinWaitlist":        { en: "Join the waitlist",                  zh: "加入候补名单" },

  // ---- Watchlist page -----------------------------------------------------
  "watchlist.label":            { en: "WATCHLIST",                          zh: "自选股" },
  "watchlist.heading":          { en: "Your tracked tickers",               zh: "你正在追踪的股票" },
  "watchlist.subheading":       { en: "Tickers here will get an automatic pre-market briefing each trading day (rolling out).", zh: "这里的票会在每个交易日盘前自动收到简报（陆续上线）。" },
  "watchlist.addPlaceholder":   { en: "ADD TICKER (E.G. NVDA)",             zh: "添加股票代码（例如 NVDA）" },
  "watchlist.add":              { en: "Add",                                zh: "添加" },
  "watchlist.adding":           { en: "Adding…",                            zh: "添加中…" },
  "watchlist.empty":            { en: "No tickers yet",                     zh: "还没有股票" },
  "watchlist.emptyHint":        { en: "Add a ticker above. Or run a one-off decision without saving.", zh: "上面输入框加一个，或者直接跑一次决策不保存。" },
  "watchlist.runOneOff":        { en: "Run a one-off decision",             zh: "跑一次决策" },
  "watchlist.remove":           { en: "Remove",                             zh: "移除" },
  "watchlist.runNow":           { en: "Run now",                            zh: "立即运行" },

  // ---- Decision page (form + status) --------------------------------------
  // v48 Phase 2: trust banner above the decision form
  "decision.trust.licensed":    { en: "HK SFC Type 4 — application in preparation", zh: "HK SFC Type 4 申请筹备中" },
  "decision.trust.regression":  { en: "27 regression tests · zero lookahead", zh: "27 个回归测试 · 零前瞻偏差" },
  "decision.trust.audit":       { en: "Every LLM call audit-logged",          zh: "每次 LLM 调用全程留痕" },
  "decision.trust.consensus":   { en: "DeepSeek V4 primary · Gemini fallback",  zh: "DeepSeek V4 主推理 · Gemini 兜底" },
  "decision.label":             { en: "NEW DECISION",                       zh: "新建决策" },
  "decision.heading":           { en: "Run the 7-agent pipeline",           zh: "运行 7-agent 流水线" },
  "decision.subheading":        { en: "Enter a ticker. The system goes from data gathering to final approval, fully traced.", zh: "输入股票代码。系统从数据搜集到终审一气呵成，全程可追溯。" },
  "decision.tickerPlaceholder": { en: "AAPL",                               zh: "AAPL" },
  "decision.run":               { en: "Run debate",                         zh: "开始辩论" },
  "decision.running":           { en: "running 7 agents…",                  zh: "7 个 agent 运行中…" },
  "decision.refresh":           { en: "Re-run with fresh data",             zh: "拿最新数据再跑" },
  "decision.cached":            { en: "Cached result · click refresh for live data", zh: "缓存结果 · 点刷新拿最新数据" },
  "decision.fresh":             { en: "Fresh from live data",               zh: "刚从实时数据生成" },
  "decision.dataAt":            { en: "Generated",                          zh: "分析时间" },
  "decision.callToAction":      { en: "Final call",                         zh: "最终建议" },
  "decision.recDecision":       { en: "Decision",                           zh: "最终建议" },
  "decision.targetWeight":      { en: "TARGET WEIGHT",                      zh: "目标仓位" },
  "decision.confidence":        { en: "CONFIDENCE",                         zh: "置信度" },
  "decision.llmCost":           { en: "LLM COST",                           zh: "LLM 费用" },
  "decision.reports":           { en: "REPORTS",                            zh: "分析报告" },
  "decision.asof":              { en: "asof",                               zh: "截止" },
  "decision.analystReports":    { en: "Analyst reports",                    zh: "分析师报告" },
  "decision.analystSubtitle":   { en: "Four specialists, four lenses on the same ticker.", zh: "四位专家，四个视角，同一只股票。" },
  "decision.fundamentals":      { en: "Fundamentals",                       zh: "基本面" },
  "decision.sentiment":         { en: "Sentiment",                          zh: "情绪" },
  "decision.news":              { en: "News",                               zh: "新闻" },
  "decision.technical":         { en: "Technical",                          zh: "技术面" },
  "decision.macro":             { en: "Macro",                              zh: "宏观" },
  "decision.researchers":       { en: "Researcher debate",                  zh: "研究员辩论" },
  "decision.researchersSubtitle": { en: "Bull vs Bear, multi-round.",       zh: "多空双方多轮辩论。" },
  "decision.bull":              { en: "Bull",                               zh: "多方" },
  "decision.bear":              { en: "Bear",                               zh: "空方" },
  "decision.round":             { en: "Round",                              zh: "第" },
  "decision.synthesis":         { en: "Synthesis",                          zh: "综合观点" },
  "decision.trader":            { en: "Trader plan",                        zh: "交易员方案" },
  "decision.traderSubtitle":    { en: "Synthesizes the debate into a sized, conditioned trade.", zh: "把辩论综合成有仓位、有条件的具体方案。" },
  "decision.risk":              { en: "Risk committee",                     zh: "风控委员会" },
  "decision.riskSubtitle":      { en: "Three lenses — Aggressive, Neutral, Conservative.", zh: "三种视角——激进、中性、保守。" },
  "decision.aggressive":        { en: "Aggressive",                         zh: "激进" },
  "decision.neutral":           { en: "Neutral",                            zh: "中性" },
  "decision.conservative":      { en: "Conservative",                       zh: "保守" },
  "decision.manager":           { en: "Fund manager final call",            zh: "基金经理终审" },
  "decision.managerSubtitle":   { en: "Approves, sizes, and adds risk notes.", zh: "审批、定仓位、补充风控提示。" },
  "decision.flags":             { en: "Flags",                              zh: "标记" },
  "decision.riskNotes":         { en: "Risk notes",                         zh: "风险提示" },
  "decision.signals":           { en: "Signals",                            zh: "关键信号" },
  "decision.sources":           { en: "Sources",                            zh: "数据来源" },
  "decision.noReports":         { en: "No analyst reports.",                zh: "暂无分析师报告。" },
  "decision.quickPicks":        { en: "Quick picks",                        zh: "常用代码" },
  "decision.quickPicks.us":     { en: "US",                                 zh: "美股" },
  "decision.quickPicks.cn":     { en: "A-share",                            zh: "A股" },
  "decision.quickPicks.crypto": { en: "Crypto",                             zh: "加密" },
  "decision.lessonsInjected":   { en: "Reflection memory injected",         zh: "已注入反思记忆" },
  "decision.lessonsBody":       {
    en: "The Fund Manager saw your prior decisions on this ticker (with realised forward returns) before making this call. The system is learning from your history.",
    zh: "基金经理在做这次决策前看到了你在这只票上的历史决策 + 已实现回报。系统正在从你的历史里学。",
  },

  // ---- Live progress (per-stage labels shown while the pipeline runs) ----
  "progress.heading":           { en: "Live progress",                       zh: "实时进度" },
  "progress.subheading":        { en: "Watch the agents work — data first, debate next, decision last.", zh: "看 agent 干活——先取数，再辩论，最后定决策。" },
  "progress.starting":          { en: "Starting up…",                        zh: "启动中…" },
  "progress.waiting":           { en: "Waiting",                             zh: "待运行" },
  "progress.running":           { en: "Running",                             zh: "运行中" },
  "progress.done":              { en: "Done",                                zh: "已完成" },
  "progress.errored":           { en: "Errored",                             zh: "出错" },
  "progress.quote":             { en: "Fetching quote",                      zh: "拉取行情" },
  "progress.fundamentals":      { en: "Fundamentals analyst",                zh: "基本面分析师" },
  "progress.sentiment":         { en: "Sentiment analyst",                   zh: "情绪分析师" },
  "progress.news":              { en: "News analyst",                        zh: "新闻分析师" },
  "progress.technical":         { en: "Technical analyst",                   zh: "技术面分析师" },
  "progress.macro":             { en: "Macro strategist (OpenBB / FRED)",    zh: "宏观策略师 (OpenBB / FRED)" },
  "progress.researcher_debate": { en: "Bull vs Bear debate",                 zh: "多空辩论" },
  "progress.trader":            { en: "Trader synthesizing",                 zh: "交易员组装方案" },
  "progress.risk_debate":       { en: "Risk committee review",               zh: "风控委员会审视" },
  "progress.manager":           { en: "Manager final call",                  zh: "基金经理终审" },

  // ---- Backtest page ------------------------------------------------------
  "backtest.label":             { en: "BACKTEST",                           zh: "回测" },
  "backtest.heading":            { en: "Replay the agents on history",      zh: "在历史区间上回放 agent" },
  "backtest.subheading":         { en: "Strict no-lookahead is enforced at the data layer.", zh: "数据层严格禁止前瞻偏差。" },
  "backtest.ticker":             { en: "TICKER",                            zh: "股票代码" },
  "backtest.from":               { en: "FROM",                              zh: "起始日" },
  "backtest.to":                 { en: "TO",                                zh: "结束日" },
  "backtest.frequency":          { en: "FREQUENCY",                         zh: "调仓频率" },
  "backtest.weekly":             { en: "Weekly",                            zh: "每周" },
  "backtest.daily":              { en: "Daily",                             zh: "每日" },
  "backtest.run":                { en: "Run backtest",                      zh: "开始回测" },
  "backtest.running":            { en: "running…",                          zh: "运行中…" },
  "backtest.crossValidate":      { en: "Cross-validate with Backtrader",    zh: "用 Backtrader 交叉验证" },
  "backtest.crossValidateBody":  {
    en: "Replay each strategy through the battle-tested Backtrader broker simulator. Differences >0.5pp annualised return are flagged — a free bug detector.",
    zh: "把每个策略再用 Backtrader 那个久经验证的撮合器跑一遍。年化收益偏差 >0.5pp 会标黄——免费 bug 探测器。",
  },
  "backtest.metricsHeading":     { en: "Summary",                           zh: "汇总指标" },
  "backtest.cumReturn":          { en: "CUM RETURN",                        zh: "累计收益" },
  "backtest.sharpe":             { en: "SHARPE",                            zh: "夏普比率" },
  "backtest.maxDD":              { en: "MAX DD",                            zh: "最大回撤" },
  "backtest.trades":             { en: "TRADES",                            zh: "交易次数" },

  // ---- Disclaimer page ----------------------------------------------------
  "disclaimer.heading":         { en: "Disclaimer",                         zh: "免责声明" },
  "disclaimer.body1":           {
    en: "TradingAgents is a research and decision-support tool. Outputs are generated by large language models on top of public market data, and may be wrong, stale, biased, or misleading.",
    zh: "TradingAgents 是一款研究与决策支持工具。其输出由大语言模型基于公开市场数据生成，可能出错、滞后、有偏见或具有误导性。",
  },
  "disclaimer.body2":           {
    en: "Nothing on this site is investment advice, a personal recommendation, or a solicitation to buy or sell any security. We do not execute trades on your behalf. Past performance and backtest results do not predict future returns.",
    zh: "本网站任何内容均不构成投资建议、个人推荐或买卖任何证券的要约。我们不替你下单交易。历史业绩和回测结果不预示未来回报。",
  },
  "disclaimer.body3":           {
    en: "You are solely responsible for your investment decisions. If you need advice tailored to your situation, consult a licensed professional in your jurisdiction.",
    zh: "你须对自己的投资决策完全负责。如需针对个人情况的建议，请咨询你所在司法管辖区的持牌专业人士。",
  },
  "disclaimer.back":            { en: "← Back",                             zh: "← 返回" },

  // ---- 3 core value props (from the latest TauricResearch slide) --------
  "value.label":                { en: "WHY THIS APPROACH",                  zh: "为什么用这种做法" },
  "value.title":                {
    en: "TradingAgents isn't just a trading framework — it's the future of collaborative AI in finance.",
    zh: "TradingAgents 不仅是一个交易框架，更是 AI 协作智慧在金融领域的未来。",
  },
  "value.firmTitle":            { en: "Realistic Firm Simulation",          zh: "真实组织模拟" },
  "value.firmBody":             {
    en: "Successfully replicates the collaborative intelligence of a professional trading desk.",
    zh: "成功复制了专业交易团队的协作式智慧。",
  },
  "value.dialecticTitle":       { en: "Multi-faceted Dialectical Reasoning", zh: "多维度辩证推理" },
  "value.dialecticBody":        {
    en: "Bull / bear debate produces more robust, comprehensive decisions than a single prompt.",
    zh: "透过多空辩论产生更稳健、更全面的决策。",
  },
  "value.commTitle":             { en: "Efficient Structured Communication", zh: "高效结构化沟通" },
  "value.commBody":              {
    en: "Solves the information-distortion problem that plagues classic multi-agent systems.",
    zh: "克服了传统多智能体系统中的信息失真问题。",
  },
  "value.attribution":          {
    en: "Methodology adapted from",
    zh: "方法论参考自",
  },

  // ---- /hot — EastMoney attention rankings -----------------------------
  "header.hot":                 { en: "Hot rankings",                       zh: "热度榜" },
  "hot.label":                  { en: "EASTMONEY ATTENTION",                zh: "东方财富关注度" },
  "hot.heading":                { en: "What A-share retail is watching right now", zh: "A 股散户此刻在关注什么" },
  "hot.subheading":             {
    en: "Live retail attention ranking from EastMoney 个股人气榜. Updated each minute. Click a ticker to run the 7-agent analysis on it.",
    zh: "东方财富个股人气榜实时数据。每分钟刷新。点代码可直接对它跑 7-agent 决策。",
  },
  "hot.colRank":                { en: "Rank",                               zh: "排名" },
  "hot.colTicker":              { en: "Ticker",                             zh: "代码" },
  "hot.colName":                { en: "Name",                               zh: "名称" },
  "hot.colPrice":               { en: "Last",                               zh: "最新价" },
  "hot.colChange":              { en: "Change %",                           zh: "涨跌幅" },
  "hot.colHeat":                { en: "Heat",                               zh: "热度值" },
  "hot.refresh":                { en: "Refresh",                            zh: "刷新" },
  "hot.fetched":                { en: "Fetched at",                         zh: "拉取时间" },
  "hot.runAnalysis":            { en: "Run analysis",                       zh: "跑决策" },

  // ---- /pricing page ----------------------------------------------------
  "header.pricing":             { en: "Pricing",                            zh: "定价" },
  "header.proof":               { en: "Proof",                              zh: "证据" },
  "pricing.label":              { en: "PRICING",                            zh: "定价方案" },
  "pricing.heading":            {
    en: "Pay for the alpha, not the lights",
    zh: "为信号付费，不为门面",
  },
  "pricing.subheading":         {
    en: "Same multi-agent pipeline at every tier. Free runs it 5×/day. Pro raises quota and persists your history. Pro+ adds priority queue and watchlist alerts. Enterprise plugs into your compliance stack.",
    zh: "每一档跑的都是同一条多 agent 流水线。免费档每日 5 次。Pro 升额度 + 持久化历史。Pro+ 优先队列 + 自选股提醒。Enterprise 接入你的合规体系。",
  },
  "pricing.tier.free":          { en: "Free",                               zh: "免费" },
  "pricing.tier.pro":           { en: "Pro",                                zh: "Pro" },
  "pricing.tier.proplus":       { en: "Pro+",                               zh: "Pro+" },
  "pricing.tier.team":          { en: "Team",                               zh: "团队" },
  "pricing.tier.enterprise":    { en: "Enterprise",                         zh: "Enterprise · 机构版" },
  "pricing.price.free":         { en: "$0",                                 zh: "¥0" },
  "pricing.price.pro":          { en: "$29 /mo",                            zh: "¥199 /月" },
  "pricing.price.proplus":      { en: "$79 /mo",                            zh: "¥549 /月" },
  "pricing.price.team":         { en: "$99 /mo",                            zh: "¥699 /月" },
  "pricing.price.enterprise":   { en: "Contact",                            zh: "面议" },
  "pricing.price.suffix.free":  { en: "forever",                            zh: "永久" },
  "pricing.price.suffix.pro":   { en: "billed monthly",                     zh: "月付" },
  "pricing.price.suffix.proplus":{ en: "priority queue · 100 / day",        zh: "优先队列 · 每日 100 次" },
  "pricing.price.suffix.team":  { en: "5 seats incl.",                      zh: "含 5 个席位" },
  "pricing.price.suffix.enterprise":{ en: "SFC Type 4 hooks · custom SLA",  zh: "SFC Type 4 接入 · 定制 SLA" },
  "pricing.cta.free":           { en: "Get started",                        zh: "免费开始" },
  "pricing.cta.pro":            { en: "Upgrade to Pro",                     zh: "升级 Pro" },
  "pricing.cta.proplus":        { en: "Go Pro+",                            zh: "升级 Pro+" },
  "pricing.cta.team":           { en: "Talk to us",                         zh: "联系我们" },
  "pricing.cta.enterprise":     { en: "Book a call",                        zh: "预约通话" },
  "pricing.included":           { en: "Included",                           zh: "包含" },
  "pricing.notIncluded":        { en: "Not included",                       zh: "不包含" },
  "pricing.faq.title":          { en: "FAQ",                                zh: "常见问题" },
  "pricing.faq.q1":             { en: "Why does Pro cost what it does?",    zh: "Pro 为什么是这个价" },
  "pricing.faq.a1":             {
    en: "One real-LLM decision through the full 5-analyst + 2-debate pipeline costs us about $0.05–$0.20 in API calls (depending on model + ticker). Pro gets you ~30 decisions/day = $90/mo at our cost. We charge $29 because volume + caching gets us there sustainably.",
    zh: "一次真 LLM 完整决策（5 分析师 + 2 轮辩论）我们的 API 成本是 $0.05–$0.20。Pro 给你约 30 次/天 = 我们成本 $90/月。收 $29 是因为缓存 + 量上来后我们 sustainable。",
  },
  "pricing.faq.q2":             { en: "Can I bring my own LLM key?",        zh: "我能自带 LLM key 吗" },
  "pricing.faq.a2":             {
    en: "Yes. Self-host the open-source backend and set GEMINI_API_KEY / DEEPSEEK_API_KEY / ANTHROPIC_API_KEY. We'll be adding 'BYO key' tier on the hosted version soon — DM us.",
    zh: "可以。自部署开源后端，设 GEMINI_API_KEY / DEEPSEEK_API_KEY 等环境变量即可。托管版的 \"自带 key\" 方案我们正在加，私信我们。",
  },
  "pricing.faq.q3":             { en: "Is this investment advice?",         zh: "这是投资建议吗" },
  "pricing.faq.a3":             {
    en: "No. Decision support — the system gives you a structured analyst view, but every position you take is your own call. We don't execute trades and we don't promise alpha.",
    zh: "不是。决策支持工具——系统给你一个结构化的分析师视角，但每一笔仓位都是你自己的决定。我们不执行交易也不承诺 alpha。",
  },

  // ---- /proof trust page ------------------------------------------------
  "proof.label":                { en: "PROOF",                              zh: "证据" },
  "proof.heading":              {
    en: "Why you can trust the output",
    zh: "为什么可以信",
  },
  "proof.subheading":           {
    en: "Every claim below is backed by code in the public repo. No black box.",
    zh: "下面每条声明都对应公开仓库里的代码。没有黑盒。",
  },
  "proof.section.dataSources":  { en: "Real data sources",                  zh: "真实数据源" },
  "proof.section.lookahead":    { en: "Strict no-lookahead",                zh: "严格禁止前瞻" },
  "proof.section.crossVal":     { en: "Cross-validated against Backtrader", zh: "与 Backtrader 交叉验证" },
  "proof.section.costModel":    { en: "Honest cost model",                  zh: "诚实的成本模型" },
  "proof.section.openSource":   { en: "Fully open source",                  zh: "完全开源" },
  "proof.section.tests":        { en: "Tests + CI",                         zh: "测试 + CI" },

  // ---- /developers landing ---------------------------------------------
  "header.developers":          { en: "Developers",                          zh: "开发者" },
  "dev.label":                  { en: "FOR DEVELOPERS",                      zh: "面向开发者" },
  "dev.heading":                { en: "Use TradingAgents as your backend",   zh: "把 TradingAgents 当你的后端" },
  "dev.subheading":             {
    en: "Same 5-analyst pipeline, available as a JSON API. Add /v1/decisions to your stock terminal, Slack bot, internal dashboard, anything. $99/month for 500 decisions; cached repeats are free.",
    zh: "同样的 5 分析师 pipeline，作为 JSON API 提供。把 /v1/decisions 接到你的行情终端、Slack 机器人、内部 dashboard、任何地方。$99/月 含 500 次决策，缓存复用免费。",
  },
  "dev.cta":                    { en: "Start building",                      zh: "开始接入" },
  "dev.docs.intro":             { en: "Quick start (Python)",                zh: "快速开始（Python）" },

  // ---- Broker affiliate links + testimonials ----------------------------
  "broker.label":               { en: "Execute this trade",                  zh: "执行此交易" },
  "broker.body":                {
    en: "We don't execute trades — but we can hand you off to a broker. Affiliate links — we may earn a small referral when you open an account.",
    zh: "我们不下单——但可以把你引到券商。下面是合作链接，开户成功我们可能拿小额返佣。",
  },
  "broker.disclaimer":          { en: "* affiliate · check your jurisdiction", zh: "* 合作 · 注意所在司法辖区" },
  "testimonials.label":         { en: "WHAT USERS SAY",                       zh: "用户评价" },
  "testimonials.heading":       { en: "Real quotes from beta users",          zh: "Beta 用户真实评价" },
  "testimonials.placeholder":   {
    en: "We're collecting testimonials. If you've used the platform and got value from it, ping us — we'll quote you here (with permission).",
    zh: "我们正在收集用户评价。如果你用过这个平台并觉得有用，发邮件给我们——经你同意后会引用在这里。",
  },

  // ---- Usage / paywall --------------------------------------------------
  "usage.freeUsed":             { en: "{used} / {cap} free decisions today",  zh: "今日已用 {used} / {cap} 免费决策" },
  "usage.unlimited":            { en: "Pro · unlimited",                      zh: "Pro · 无限" },
  "paywall.title":              { en: "Daily limit reached",                  zh: "今日已达上限" },
  "paywall.body":               {
    en: "You've used your {cap} free decisions for today. Upgrade to Pro for ~30 decisions/day with real LLM (Gemini 3.1 Pro / DeepSeek / etc.).",
    zh: "今日免费 {cap} 次决策已用完。升级 Pro 解锁 ~30 次/天 真 LLM（Gemini 3.1 Pro / DeepSeek 等）。",
  },
  "paywall.upgrade":            { en: "Upgrade to Pro",                       zh: "升级 Pro" },
  "paywall.tomorrow":           { en: "Or come back tomorrow",                zh: "或明天再来" },
  "demo.banner.title":          { en: "Try without signing up",               zh: "免登录试一次" },
  "demo.banner.body":           {
    en: "Run 2 free decisions per day on the real LLM pipeline — no email needed. Sign up with an invite code for 5/day, or upgrade to Pro for 30/day.",
    zh: "每天 2 次免费真 LLM 决策——无需邮箱。邀请码登录后 5 次/天，升级 Pro 后 30 次/天。",
  },

  // ---- /me/referral (viral loop) -----------------------------------------
  "header.referral":            { en: "Refer & earn",                         zh: "邀请赚配额" },
  "referral.label":             { en: "INVITE FRIENDS",                       zh: "邀请朋友" },
  "referral.heading":           { en: "Both of you get +5 decisions/day for 7 days", zh: "每邀请一人，双方都得 +5 决策/天 × 7 天" },
  "referral.subheading":        {
    en: "Share your link below. When someone signs up through it, both you and your friend get bonus quota stacked on top of your existing tier — at no cost to either.",
    zh: "分享下面的链接。有人通过它注册，你和他都会在原有 tier 之上叠加 bonus 配额——对双方都零成本。",
  },
  "referral.yourLink":          { en: "Your invite link",                     zh: "你的邀请链接" },
  "referral.copy":              { en: "Copy",                                 zh: "复制" },
  "referral.copied":            { en: "Copied!",                              zh: "已复制！" },
  "referral.stats.invitees":    { en: "Friends invited",                      zh: "已邀请" },
  "referral.stats.bonusActive": { en: "Bonus active",                         zh: "Bonus 状态" },
  "referral.stats.bonusYes":    { en: "Yes — +{n}/day",                       zh: "活跃 — +{n}/天" },
  "referral.stats.bonusNo":     { en: "No — invite someone to activate",      zh: "未激活 — 邀请一人激活" },

  // ---- /sponsor (income channels) ---------------------------------------
  "header.sponsor":             { en: "Support",                              zh: "支持我们" },
  "sponsor.label":              { en: "WAYS TO SUPPORT",                      zh: "支持渠道" },
  "sponsor.heading":            { en: "Keep the platform free for everyone",  zh: "让平台对所有人保持免费" },
  "sponsor.subheading":         {
    en: "TradingAgents is open-source and free forever. If you want to help us keep the LLM bill paid + extend the analyst pipeline, any of these channels works — pick whichever you already use.",
    zh: "TradingAgents 是开源的，永久免费。如果想帮我们 cover LLM 账单 + 加新分析师能力，下面任意一个渠道都行——选你已经在用的。",
  },
  "sponsor.oneTime.title":      { en: "One-time tips",                        zh: "一次性打赏" },
  "sponsor.recurring.title":    { en: "Recurring sponsorship",                zh: "定期赞助" },
  "sponsor.affiliate.title":    { en: "Open an account via these brokers",    zh: "通过这些券商开户" },
  "sponsor.affiliate.body":     {
    en: "When you open a brokerage account through these links and trade on real money, the broker pays us a small referral fee. Costs you nothing extra.",
    zh: "通过这些链接开户并真实交易，券商会给我们小额返佣。对你没有任何额外成本。",
  },
  "sponsor.notConfigured":      {
    en: "(This channel isn't set up yet — operator can add their handle to env vars.)",
    zh: "（这个渠道还没配置——运营方可以把账号 handle 加到 env 变量。）",
  },

  // ---- /login (magic-link auth) -----------------------------------------
  "header.signIn":              { en: "Sign in",                              zh: "登录" },
  "login.label":                { en: "SIGN IN",                              zh: "登录" },
  "login.heading":              { en: "Sign in with your email",              zh: "用邮箱登录" },
  "login.subheading":           {
    en: "We'll email you a one-click sign-in link. No password, no signup form. Already have a friend invite code? Use /redeem.",
    zh: "我们会发一个一键登录链接到你邮箱。无密码、无注册表单。已有邀请码？用 /redeem。",
  },
  "login.emailPlaceholder":     { en: "you@example.com",                      zh: "you@example.com" },
  "login.submit":               { en: "Send sign-in link",                    zh: "发送登录链接" },
  "login.sending":              { en: "Sending…",                             zh: "发送中…" },
  "login.sent.title":           { en: "Check your inbox",                     zh: "请查看邮箱" },
  "login.sent.body":            {
    en: "If {email} is a valid address, a sign-in link is on its way. The link expires in 15 minutes.",
    zh: "如果 {email} 是有效地址，登录链接已发送。15 分钟内有效。",
  },
  "login.devLink":              {
    en: "(Dev mode: Resend isn't configured, so the link was printed to the server console — check Render logs.)",
    zh: "（开发模式：Resend 未配置，链接已打印在服务端日志中——查看 Render 日志。）",
  },
  "login.tryAgain":              { en: "Send another link",                   zh: "再发一次" },
  "login.alreadyHaveInvite":    { en: "Have an invite code? Use /redeem",     zh: "有邀请码？用 /redeem" },

  // ---- /auth/verify (magic-link callback) ------------------------------
  "verify.verifying":           { en: "Verifying your link…",                 zh: "验证登录链接…" },
  "verify.success":             { en: "Signed in!",                           zh: "登录成功！" },
  "verify.successBody":         { en: "Redirecting you to the decision page…", zh: "正在跳转到决策页…" },
  "verify.failed.title":        { en: "This link doesn't work",               zh: "这个链接不可用" },
  "verify.failed.body":         {
    en: "It may have expired (links last 15 minutes) or already been used. Request a new one.",
    zh: "可能已过期（15 分钟有效）或已使用。请重新申请。",
  },
  "verify.requestNew":          { en: "Request a new link",                   zh: "重新申请链接" },

  // ---- Legal pages ------------------------------------------------------
  "footer.terms":               { en: "Terms",                              zh: "服务条款" },
  "footer.privacy":              { en: "Privacy",                            zh: "隐私" },
  "footer.disclaimer":           { en: "Disclaimer",                         zh: "免责声明" },
  "footer.contact":              { en: "Contact",                            zh: "联系" },
  "footer.tagline":              { en: "Decision support, not investment advice.", zh: "决策支持，非投资建议。" },
  "legal.lastUpdated":           { en: "Last updated",                       zh: "最后更新" },
  "legal.boilerplateNote":       {
    en: "This is a v1 placeholder document. Before commercial launch in regulated markets, replace with versions reviewed by qualified counsel in your jurisdiction.",
    zh: "本页是 v1 占位文档。在合规市场商业化之前，请替换为本辖区合格律师审核过的版本。",
  },

  // ---- Decision sharing -------------------------------------------------
  "decision.exportPrompt":      { en: "Export this decision",               zh: "导出本次决策" },
  "share.button":               { en: "Share decision",                     zh: "分享决策" },
  "share.creating":              { en: "Creating link…",                    zh: "生成链接…" },
  "share.copied":               { en: "Link copied!",                       zh: "链接已复制！" },
  "share.copy":                 { en: "Copy link",                          zh: "复制链接" },
  "share.modal.title":          { en: "Share this decision",                zh: "分享这个决策" },
  "share.modal.body":           {
    en: "Anyone with this link can view the full decision (no login required). The page shows your rationale + analyst reports, and links visitors back to make their own decisions.",
    zh: "任何人有这个链接都能查看完整决策（无需登录）。页面会显示你的决策理由 + 分析师报告，并引导访客来做自己的决策。",
  },
  "share.modal.dismiss":        { en: "Done",                               zh: "完成" },
  "share.publicView.label":     { en: "SHARED DECISION",                    zh: "分享的决策" },
  "share.publicView.cta":       {
    en: "Run your own — Free",
    zh: "做你自己的 — 免费",
  },
  "share.publicView.body":      {
    en: "This is a single decision generated by trading-agents-platform — a 5-analyst LLM pipeline (fundamentals + sentiment + news + technical + macro) that debates and votes on every ticker. You can run your own for free, no credit card.",
    zh: "这是 trading-agents-platform 生成的一次决策——5 分析师 LLM pipeline（基本面 + 情绪 + 新闻 + 技术面 + 宏观）每一次都辩论 + 投票。你可以免费跑自己的，不用信用卡。",
  },
  "share.publicView.expired":   {
    en: "This shared decision has expired or doesn't exist.",
    zh: "这个分享链接已过期或不存在。",
  },

  // ---- /decisions/[ticker] timeline comparison page ---------------------
  "tl.label":                   { en: "DECISION TIMELINE",                  zh: "决策时间线" },
  "tl.heading":                 {
    en: "Your decisions on {ticker} over time",
    zh: "你在 {ticker} 上的历次决策",
  },
  "tl.subheading":              {
    en: "Each card is one decision the system made for you, with the realised forward return when available. The shape across cards shows how the system's view evolved.",
    zh: "每张卡片是系统给你的一次决策，已实现回报会标在右下角。卡片连起来就能看到系统对这只票的判断怎么演化。",
  },
  "tl.empty":                   { en: "No decisions on this ticker yet.",   zh: "你还没在这只票上做过决策。" },
  "tl.runFirst":                { en: "Make a decision now",                zh: "现在做一次决策" },
  "tl.totalCalls":              { en: "Total calls",                        zh: "总决策次数" },
  "tl.hitRate":                 { en: "Direction hit rate",                 zh: "方向命中率" },
  "tl.avgReturn":               { en: "Avg signed return",                  zh: "平均带向收益" },
  "tl.avgConfidence":           { en: "Avg confidence",                     zh: "平均置信度" },
  "tl.colDate":                 { en: "Date",                               zh: "日期" },
  "tl.daysAgo":                 { en: "{n} days ago",                       zh: "{n} 天前" },
  "tl.daysHeld":                { en: "{n}d held",                          zh: "持仓 {n}天" },
  "tl.notRealisedYet":          { en: "Not realised yet",                   zh: "尚未实现" },
  "tl.deltaWeight":             { en: "Δ weight vs last",                   zh: "仓位变化" },
  "tl.deltaSide":               { en: "Side flipped",                       zh: "方向反转" },

  // ---- /ecosystem page (10-project meta-platform) -----------------------
  "header.ecosystem":           { en: "Ecosystem",                          zh: "生态" },
  "eco.label":                  { en: "ECOSYSTEM",                          zh: "生态系统" },
  "eco.heading":                {
    en: "Best-of-breed open projects, one data bus, geometric leverage.",
    zh: "一流开源项目，一条数据总线，几何级杠杆。",
  },
  "eco.subheading":             {
    en: "Each project is the best in class for one slice of the AI-quant stack. We don't replace them — we wire them into a single platform with shared data, so the analyst that runs on FRED data can be backtested on Backtrader using Qlib factors and executed via Lean. The whole becomes more than the sum.",
    zh: "每个项目在自己那层都是同类最佳。我们不替代它们——而是把它们串到同一个平台、同一条数据总线上，于是基于 FRED 数据训练的分析师可以用 Qlib 因子在 Backtrader 上回测，再通过 Lean 执行。整体大于部分之和。",
  },
  "eco.statTotal":              { en: "Projects",                           zh: "项目数" },
  "eco.statStars":              { en: "Combined stars",                     zh: "累计 stars" },
  "eco.statLive":               { en: "Live today",                         zh: "已上线" },
  "eco.statBuilding":           { en: "In progress",                        zh: "开发中" },
  "eco.statPlanned":            { en: "Planned",                            zh: "规划中" },
  "eco.role.data_source":       { en: "Data sources",                       zh: "数据源" },
  "eco.role.feature_engine":    { en: "Factor / feature engine",            zh: "因子引擎" },
  "eco.role.llm_layer":         { en: "LLM / agent layer",                  zh: "LLM / Agent 层" },
  "eco.role.strategy_rl":       { en: "Strategy / RL",                      zh: "策略 / 强化学习" },
  "eco.role.backtest":          { en: "Backtest engines",                   zh: "回测引擎" },
  "eco.role.execution":         { en: "Execution",                          zh: "执行层" },
  "eco.role.terminal":          { en: "Terminal / UI",                      zh: "终端 / UI" },
  "eco.status.live":            { en: "Live",                               zh: "已上线" },
  "eco.status.beta":            { en: "Beta",                               zh: "Beta" },
  "eco.status.building":        { en: "Building",                           zh: "开发中" },
  "eco.status.planned":         { en: "Planned",                            zh: "规划中" },
  "eco.consume":                { en: "We consume",                         zh: "我们消费" },
  "eco.export":                 { en: "We export",                          zh: "我们暴露" },
  "eco.feedsInto":              { en: "Feeds into",                         zh: "流向" },
  "eco.fedBy":                  { en: "Fed by",                             zh: "上游" },
  "eco.viewRepo":               { en: "GitHub ↗",                           zh: "GitHub ↗" },
  "eco.howItWorksTitle":        { en: "How the data bus works",             zh: "数据总线怎么工作" },
  "eco.howItWorksBody":         {
    en: "Every data request inside the platform is a typed Need (macro / quote / fundamentals / factor / crypto OHLCV / …). The bus tries each registered source in priority order and falls back gracefully — so a FinRL agent can request a Qlib factor without knowing which backend serves it.",
    zh: "平台里每一次数据请求都是一个有类型的 Need（宏观 / 报价 / 基本面 / 因子 / 加密 OHLCV / …）。总线按优先级试每个注册过的源，失败优雅降级——所以 FinRL agent 请求 Qlib 因子时根本不需要知道是哪个后端在服务。",
  },
  "eco.dataFlow":               { en: "Live data flow",                     zh: "实时数据流" },
  "eco.wiredToday":             { en: "Wired today",                        zh: "今日已接通" },
  "eco.honesty.title":          { en: "Be honest about what's shipping",    zh: "诚实标注上线状态" },
  "eco.honesty.body":           {
    en: "Of these projects, only those with a green Live badge actually flow data through our pipeline today. Building / Roadmap items are committed work-in-progress with adapter stubs and clear extension points — not aspirational marketing. We update this page from the live registry, not a slide deck.",
    zh: "这些项目里，只有打绿色「Live」徽章的今天真在我们的 pipeline 里跑数据。Building / Roadmap 是有 adapter 桩和明确扩展点的进行中工作，不是 PPT 上的愿望。这页内容从生产 registry 实时拉取，不是我自己手写的。",
  },
  "eco.section.live":           { en: "Live integrations",                  zh: "已上线集成" },
  "eco.section.building":       { en: "In active development",              zh: "开发中" },
  "eco.section.roadmap":        { en: "Roadmap (specced, not built)",       zh: "路线图（已规划，未实现）" },
  "eco.notWired":               { en: "Not wired yet",                      zh: "尚未接通" },

  // ---- /integrations page (OpenBB Workspace etc.) -----------------------
  "header.integrations":        { en: "Integrations",                       zh: "集成" },
  "integrations.label":         { en: "INTEGRATIONS",                       zh: "集成" },
  "integrations.heading":       {
    en: "Use TradingAgents inside your favorite tools",
    zh: "在你常用的工具里直接使用 TradingAgents",
  },
  "integrations.subheading":    {
    en: "Bring the 7-agent decision view into terminals you already love. Currently shipping: OpenBB Workspace.",
    zh: "把 7-agent 决策视角带进你已经在用的金融终端。目前已支持：OpenBB Workspace。",
  },
  "integrations.openbb.title":  { en: "OpenBB Workspace",                   zh: "OpenBB Workspace" },
  "integrations.openbb.tag":    { en: "Open-source Bloomberg alt · 67k★",   zh: "开源 Bloomberg 替代 · 67k★" },
  "integrations.openbb.body":   {
    en: "OpenBB Workspace is the open-source quant terminal. Add our backend as a custom widget source and the 7-Agent Decision, Macro Brief, and Track Record widgets show up in your widget catalog — drag them onto any dashboard.",
    zh: "OpenBB Workspace 是开源 quant 终端。把我们的后端添加为自定义 widget 源，「7-Agent 决策」「宏观简报」「回测战绩」三个 widget 就会出现在你的 widget 目录里——拖到任意 dashboard 即可使用。",
  },
  "integrations.openbb.urlLabel": { en: "Backend URL (paste this in OpenBB)", zh: "后端 URL（粘贴到 OpenBB 设置里）" },
  "integrations.openbb.copy":   { en: "Copy",                               zh: "复制" },
  "integrations.openbb.copied": { en: "Copied!",                            zh: "已复制！" },
  "integrations.openbb.steps":  { en: "Setup (3 steps, ~2 minutes)",        zh: "三步搞定（约 2 分钟）" },
  "integrations.openbb.step1":  {
    en: "Open OpenBB Workspace → Settings → Custom Backend.",
    zh: "打开 OpenBB Workspace → Settings → Custom Backend。",
  },
  "integrations.openbb.step2":  {
    en: "Paste the URL above and give it a name (e.g. \"TradingAgents\").",
    zh: "把上面的 URL 粘贴进去，起个名字（例如 \"TradingAgents\"）。",
  },
  "integrations.openbb.step3":  {
    en: "Open any dashboard, click + Add widget, and you'll see our 3 widgets under \"AI Analysis\".",
    zh: "打开任意 dashboard，点 + Add widget，就能在「AI Analysis」分类里看到我们的 3 个 widget。",
  },
  "integrations.widgets":       { en: "Widgets exposed",                    zh: "已暴露的 widgets" },
  "integrations.widget1":       { en: "7-Agent Decision (markdown)",        zh: "7-Agent 决策（markdown）" },
  "integrations.widget2":       { en: "Macro Brief (markdown)",             zh: "宏观简报（markdown）" },
  "integrations.widget3":       { en: "Track Record (markdown)",            zh: "回测战绩（markdown）" },
  "integrations.openbb.cta":    { en: "Open OpenBB Workspace ↗",            zh: "打开 OpenBB Workspace ↗" },
  "integrations.openbb.docs":   { en: "OpenBB custom backend docs ↗",       zh: "OpenBB 自定义后端文档 ↗" },
  "integrations.future":        { en: "More coming",                        zh: "后续规划" },
  "integrations.future.body":   {
    en: "Excel add-in (via OpenBB SDK), Tauri desktop app, plus direct MCP server for Claude / Cursor agents. Want one of these prioritised? Open an issue.",
    zh: "Excel 加载项（通过 OpenBB SDK）、Tauri 桌面 app、以及给 Claude / Cursor 的 MCP server。想优先做哪个？开个 issue。",
  },

  // ---- /how-it-works page ------------------------------------------------
  "header.howItWorks":          { en: "How it works",                       zh: "如何工作" },
  "how.label":                  { en: "OUR APPROACH",                       zh: "我们的做法" },
  "how.heroTitle":              {
    en: "An AI framework that mirrors a real trading firm.",
    zh: "一个模拟真实交易公司的 AI 框架。",
  },
  "how.heroBody":               {
    en: "TradingAgents gives each AI agent a specialized role, drives structured debate among them, and mirrors the workflow of an actual buy-side desk. We turn a chaotic single-prompt LLM into an organized, collaborative decision process.",
    zh: "TradingAgents 透过赋予 AI 智能体特定角色、促进结构化辩论，并模仿真实世界的工作流程，把混乱的单 prompt 互动转变为一个有组织、可协作的决策过程，旨在提高决策质量。",
  },

  "how.pipelineLabel":          { en: "ORG CHART",                          zh: "组织架构" },
  "how.pipelineTitle":          {
    en: "Seven specialized roles working in a closed-loop decision process",
    zh: "七个专业角色协同运作，形成决策闭环",
  },
  "how.pipelineBody":           {
    en: "Inspired by the org chart of an actual hedge fund. Each agent has a specific objective, skillset, and toolset.",
    zh: "受真实交易公司组织结构的启发，每个角色都被赋予特定的目标、技能和工具。",
  },
  "how.stage.gather":           { en: "Data Gathering",                     zh: "信息收集" },
  "how.stage.gatherTeam":       { en: "Analyst Team",                       zh: "分析师团队" },
  "how.stage.gatherDetail":     { en: "Fundamentals · Sentiment · News · Technical", zh: "基本面 · 情绪 · 新闻 · 技术分析师" },
  "how.stage.dialect":          { en: "Dialectical Analysis",               zh: "辩证分析" },
  "how.stage.dialectTeam":      { en: "Researcher Team",                    zh: "研究员团队" },
  "how.stage.dialectDetail":    { en: "Bull vs Bear researchers",           zh: "多头 & 空头研究员" },
  "how.stage.trade":            { en: "Trading Decision",                   zh: "交易决策" },
  "how.stage.tradeTeam":        { en: "Trader",                             zh: "交易员" },
  "how.stage.tradeDetail":      { en: "Synthesizes inputs into a sized, conditioned trade", zh: "综合输入，形成有仓位、有条件的方案" },
  "how.stage.risk":             { en: "Risk Control",                       zh: "风险管控" },
  "how.stage.riskTeam":         { en: "Risk Management Team",               zh: "风险管理团队" },
  "how.stage.riskDetail":       { en: "Aggressive · Neutral · Conservative debate", zh: "进取 · 中性 · 保守 三方辩论" },
  "how.stage.final":            { en: "Final Approval",                     zh: "最终批准" },
  "how.stage.finalTeam":        { en: "Fund Manager",                       zh: "基金经理" },
  "how.stage.finalDetail":      { en: "Authorizes the transaction with explicit rationale", zh: "授权交易并附明确理由" },
  "how.stage.exec":             { en: "Decision Output",                    zh: "决策输出" },
  "how.stage.execTeam":         { en: "Traceable Record",                   zh: "可追溯记录" },
  "how.stage.execDetail":       { en: "Stored, ranked, audit-able. We never auto-execute trades.", zh: "存档、可排名、可审计。我们从不自动下单。" },

  "how.analystsLabel":          { en: "ANALYST TEAM",                       zh: "分析师团队" },
  "how.analystsTitle":          { en: "Four lenses on one ticker",          zh: "从四大维度全面扫描市场" },
  "how.analyst.fundTitle":      { en: "Fundamental Analyst",                zh: "基本面分析师" },
  "how.analyst.fundBody":       {
    en: "Reads financial statements, earnings reports, and insider transactions to estimate intrinsic value.",
    zh: "评估公司财务状况、财报和内幕交易，以确定内在价值。",
  },
  "how.analyst.sentTitle":      { en: "Sentiment Analyst",                  zh: "情绪分析师" },
  "how.analyst.sentBody":       {
    en: "Processes social-media posts and sentiment scores to gauge market mood and predict investor behavior.",
    zh: "处理社交媒体贴文和情绪分数，以衡量市场情绪并预测投资者行为。",
  },
  "how.analyst.newsTitle":      { en: "News Analyst",                       zh: "新闻分析师" },
  "how.analyst.newsBody":       {
    en: "Analyzes news, government announcements, and macro indicators to assess events that may move the market.",
    zh: "分析新闻、政府公告和宏观经济指标，以评估可能影响市场的重大事件。",
  },
  "how.analyst.techTitle":      { en: "Technical Analyst",                  zh: "技术分析师" },
  "how.analyst.techBody":       {
    en: "Computes technical indicators (MACD, RSI), reads price patterns and volume to forecast direction.",
    zh: "计算并选择相关技术指标（如 MACD、RSI），分析价格模式和交易量以预测未来走势。",
  },

  "how.balanceLabel":           { en: "TRADER × RISK",                      zh: "交易员 × 风险" },
  "how.balanceTitle":           { en: "Balancing opportunity and discipline", zh: "在机会与纪律之间取得平衡" },
  "how.balance.traderTitle":    { en: "Trader: synthesize, propose",        zh: "交易员：综合洞察，提出建议" },
  "how.balance.traderBody":     {
    en: "The trader integrates every analyst report and the bull/bear debate into a concrete trade proposal — with timing and sizing.",
    zh: "交易员综合所有分析师报告和研究员的辩论结果，提出具体的交易建议，包括时机和规模。",
  },
  "how.balance.riskTitle":      { en: "Risk Team: evaluate, adjust",        zh: "风险管理团队：评估与调整" },
  "how.balance.riskBody":       {
    en: "The risk team holds its own internal debate (aggressive / neutral / conservative) and adjusts the trade to fit pre-set risk parameters.",
    zh: "风险管理团队对交易提案进行评估。团队内部同样进行辩论（进取、中性、保守），以调整交易计划，确保其符合预设的风险参数。",
  },

  "how.dataLabel":              { en: "DATA SOURCES",                       zh: "数据源" },
  "how.dataTitle":              { en: "What the agents actually read",      zh: "Agent 实际读取的数据" },
  "how.dataBody":               {
    en: "Honest list. We use free public sources today; institutional data feeds (Bloomberg, FactSet, Wind) are on the roadmap.",
    zh: "诚实清单。当前用免费公开数据源；机构级数据（Bloomberg / FactSet / Wind）在路线图上。",
  },
  "how.data.usMarket":          { en: "US market data",                     zh: "美股行情" },
  "how.data.usMarketSrc":       { en: "Yahoo Finance via yfinance",         zh: "Yahoo Finance（yfinance）" },
  "how.data.cnMarket":          { en: "A-share market data",                zh: "A 股行情" },
  "how.data.cnMarketSrc":       { en: "EastMoney / Sina / Tencent via akshare", zh: "东方财富 / 新浪 / 腾讯（akshare）" },
  "how.data.usNews":            { en: "US news",                            zh: "美股新闻" },
  "how.data.usNewsSrc":         { en: "Yahoo Finance news feed",            zh: "Yahoo Finance news" },
  "how.data.cnNews":            { en: "A-share news",                       zh: "A 股新闻" },
  "how.data.cnNewsSrc":         { en: "EastMoney news (akshare)",           zh: "东方财富新闻（akshare）" },
  "how.data.fundamentals":      { en: "Financials & filings",               zh: "财务与公告" },
  "how.data.fundamentalsSrc":   { en: "Yahoo info / EastMoney info",        zh: "Yahoo / 东方财富 个股信息" },
  "how.data.sentiment":         { en: "Social sentiment",                   zh: "社交情绪" },
  "how.data.sentimentSrc":      { en: "Mocked — Twitter/Reddit/Xueqiu integration is roadmap", zh: "暂为模拟 — Twitter / Reddit / 雪球接入在路线图上" },

  "how.modelsLabel":            { en: "LLM ROUTING",                        zh: "LLM 路由" },
  "how.modelsTitle":            { en: "Cost-aware model routing",           zh: "成本感知的模型路由" },
  "how.modelsBody":             {
    en: "Each agent runs at the cheapest tier that still produces good output. Trader and Manager get Pro; analysts/risk run on Flash.",
    zh: "每个 agent 用能保证质量的最便宜模型。Trader / Manager 用 Pro，分析师 / 风控用 Flash。",
  },
  "how.models.deep":            { en: "Pro tier",                           zh: "Pro 档" },
  "how.models.deepFor":         { en: "Trader · Fund Manager",              zh: "交易员 · 基金经理" },
  "how.models.deepModel":       { en: "Gemini 3.1 Pro Preview",             zh: "Gemini 3.1 Pro Preview" },
  "how.models.fast":            { en: "Flash tier",                         zh: "Flash 档" },
  "how.models.fastFor":         { en: "Analysts · Researchers · Risk team", zh: "分析师 · 研究员 · 风控团队" },
  "how.models.fastModel":       { en: "Gemini 2.5 Flash",                   zh: "Gemini 2.5 Flash" },

  "how.cta.try":                { en: "Try it on a ticker",                 zh: "拿一只票试试" },
  "how.cta.code":               { en: "Read the source",                    zh: "看源代码" },

  // ---- Mock-mode warning banner -----------------------------------------
  "mockBanner.title":           { en: "Mock mode — output is a template, not real analysis", zh: "模拟模式 — 输出是模板，不是真实分析" },
  "mockBanner.body":            {
    en: "You're not on the real-LLM allowlist. The decision below is generated by a deterministic mock and does NOT reflect the actual stock. Ask the operator to enable real LLM for your account.",
    zh: "你不在真实大模型白名单。下面的决策是确定性模板生成的，与真实股票无关。如需启用真实 LLM，请联系站长。",
  },
  "mockBanner.contact":         { en: "Request access",                     zh: "申请权限" },

  // ---- Decision feedback (thumbs up/down for RLHF) ----------------------
  "feedback.helpful":           { en: "Useful",                             zh: "有用" },
  "feedback.notHelpful":        { en: "Not useful",                         zh: "没用" },
  "feedback.thanks":            { en: "Thanks — feedback recorded.",        zh: "谢谢 — 反馈已记录。" },
  "feedback.prompt":            { en: "Was this analysis useful?",          zh: "这份分析有用吗？" },

  // ---- My history (per-user past decisions) ------------------------------
  "header.myHistory":           { en: "My history",                         zh: "我的历史" },
  "history.label":              { en: "MY DECISIONS",                       zh: "我的决策" },
  "history.heading":            { en: "Your decision history",              zh: "你跑过的所有决策" },
  "history.subheading":         {
    en: "Every ticker you've decided on, with how the stock has actually moved since. Honest receipts.",
    zh: "你跑过的每只票，加上之后股价的真实表现。诚实记账。",
  },
  "history.empty":              { en: "You haven't made any decisions yet. Go run one!", zh: "你还没跑过任何决策，去跑一个！" },
  "history.colDate":            { en: "Date",                               zh: "日期" },
  "history.colTicker":          { en: "Ticker",                             zh: "代码" },
  "history.colSide":            { en: "Call",                               zh: "建议" },
  "history.colWeight":          { en: "Weight",                             zh: "目标仓位" },
  "history.colConfidence":      { en: "Confidence",                         zh: "置信度" },
  "history.colReturn":          { en: "Return since",                       zh: "至今涨跌" },
  "history.colDays":            { en: "Days",                               zh: "天数" },
  "history.totalCalls":         { en: "Total calls",                        zh: "总决策数" },
  "history.hitRate":            { en: "Calls in the right direction",       zh: "方向正确率" },
  "history.avgReturn":          { en: "Avg signed return",                  zh: "平均带方向收益" },
  "history.runFirst":           { en: "Run your first decision",            zh: "去跑第一个决策" },

  // ---- Track Record / Backtest results -----------------------------------
  "header.trackRecord":         { en: "Track record",                       zh: "回测战绩" },
  "track.label":                { en: "TRACK RECORD",                       zh: "回测战绩" },
  "track.heading":              { en: "Does the agent actually beat the market?", zh: "Agent 真的能跑赢市场吗？" },
  "track.subheading":           {
    en: "Out-of-sample weekly rebalance over a recent window. We publish the raw decisions so you can audit every call.",
    zh: "近期窗口的样本外周度调仓，每一次决策都在仓库里可审。",
  },
  "track.empty":                { en: "No backtest report yet — run one to populate this page.", zh: "还没有回测报告 —— 跑一次本地脚本就会出现在这里。" },
  "track.window":               { en: "Window",                             zh: "回测窗口" },
  "track.tickers":              { en: "Tickers",                            zh: "股票数" },
  "track.decisions":            { en: "Decisions",                          zh: "决策次数" },
  "track.cost":                 { en: "Est. cost",                          zh: "预估费用" },
  "track.portfolioHeading":     { en: "Portfolio (equal-weighted)",         zh: "组合（等权）" },
  "track.tickerHeading":        { en: "Per-ticker breakdown",               zh: "单票拆解" },
  "track.colTicker":            { en: "Ticker",                             zh: "代码" },
  "track.colAgent":             { en: "Agent return",                       zh: "Agent 收益" },
  "track.colBH":                { en: "Buy & Hold",                         zh: "Buy & Hold" },
  "track.colExcess":            { en: "Excess",                             zh: "超额" },
  "track.colSharpe":            { en: "Agent Sharpe",                       zh: "Agent 夏普" },
  "track.cumReturn":            { en: "Cum return",                         zh: "累计收益" },
  "track.annualReturn":         { en: "Annual return",                      zh: "年化收益" },
  "track.sharpe":               { en: "Sharpe",                             zh: "夏普" },
  "track.maxDD":                { en: "Max drawdown",                       zh: "最大回撤" },
  "track.winRate":              { en: "% tickers beat B&H",                 zh: "跑赢 B&H 比例" },
  "track.excess":               { en: "Excess return vs B&H",               zh: "vs B&H 超额收益" },
  "track.runYourself":          { en: "Run your own backtest",              zh: "自己跑一次回测" },
  "track.repo":                 { en: "Source on GitHub",                   zh: "GitHub 源代码" },

  // ---- Common ---------------------------------------------------------
  "common.loading":             { en: "Loading…",                           zh: "加载中…" },
  "common.error":               { en: "Error",                              zh: "出错" },
  "common.retry":               { en: "Retry",                              zh: "重试" },
  "common.cancel":              { en: "Cancel",                             zh: "取消" },
  "common.close":               { en: "Close",                              zh: "关闭" },
} as const;

export type TKey = keyof typeof dict;

// ---------------------------------------------------------------------------
// Detection & persistence
// ---------------------------------------------------------------------------

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh") return stored;
  } catch {
    /* localStorage might be blocked */
  }
  // Fall back to browser language
  const nav = window.navigator?.language || "";
  if (nav.toLowerCase().startsWith("zh")) return "zh";
  return "en";
}

// ---------------------------------------------------------------------------
// React provider + hook
// ---------------------------------------------------------------------------

type I18nCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TKey) => string;
  /** Toggle between en and zh. */
  toggle: () => void;
};

const Ctx = createContext<I18nCtx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Server render uses "en" so SSR markup matches the most common case;
  // the client effect below upgrades to the user's stored / browser
  // preference on hydration. Avoids hydration mismatch warnings.
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const detected = detectInitialLocale();
    if (detected !== locale) setLocaleState(detected);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
    }
  }, []);

  const toggle = useCallback(() => {
    setLocale(locale === "en" ? "zh" : "en");
  }, [locale, setLocale]);

  const t = useCallback(
    (key: TKey) => {
      const entry = dict[key];
      if (!entry) return key;
      return entry[locale] ?? entry.en;
    },
    [locale]
  );

  const value = useMemo<I18nCtx>(
    () => ({ locale, setLocale, t, toggle }),
    [locale, setLocale, t, toggle]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Allow components rendered without the provider (e.g. unit tests) to
    // fall back to English instead of crashing.
    const fallback: I18nCtx = {
      locale: "en",
      setLocale: () => {},
      toggle: () => {},
      t: (key: TKey) => dict[key]?.en ?? key,
    };
    return fallback;
  }
  return ctx;
}
