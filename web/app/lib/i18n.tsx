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
  "decision.label":             { en: "NEW DECISION",                       zh: "新建决策" },
  "decision.heading":           { en: "Run the 7-agent pipeline",           zh: "运行 7-agent 流水线" },
  "decision.subheading":        { en: "Enter a ticker. The system goes from data gathering to final approval, fully traced.", zh: "输入股票代码。系统从数据搜集到终审一气呵成，全程可追溯。" },
  "decision.tickerPlaceholder": { en: "AAPL",                               zh: "AAPL" },
  "decision.run":               { en: "Run debate",                         zh: "开始辩论" },
  "decision.running":           { en: "running 7 agents…",                  zh: "7 个 agent 运行中…" },
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
  "decision.researchers":       { en: "Researcher debate",                  zh: "研究员辩论" },
  "decision.researchersSubtitle": { en: "Bull vs Bear, multi-round.",       zh: "多空双方多轮辩论。" },
  "decision.bull":              { en: "Bull",                               zh: "多方" },
  "decision.bear":              { en: "Bear",                               zh: "空方" },
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
