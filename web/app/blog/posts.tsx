/**
 * /blog/[slug] post registry.
 *
 * Each post has structured metadata (for SEO + indexing) and a render
 * function returning the article body. We don't use MDX because the
 * five articles here are written manually for SEO long-tail coverage;
 * an MDX pipeline would add tooling without saving meaningful effort
 * at this volume.
 *
 * SEO strategy:
 *   - Slugs are stable, lowercase, keyword-dense
 *   - Titles ≤ 60 chars when possible (Google SERP truncation at ~60)
 *   - Descriptions ≤ 160 chars (SERP description truncation)
 *   - Each article has an English + Chinese variant where it makes
 *     sense (the A-share article is Chinese-first because the target
 *     reader Googles "东方财富 量化")
 *   - All five link back into product pages (/decision, /proof,
 *     /how-it-works, /backtest) so internal pagerank flows correctly
 *
 * Adding a new post: drop it in POSTS below, then add the slug to the
 * BLOG_SLUGS export in sitemap.ts so it gets indexed.
 */

import Link from "next/link";
import type { ReactElement } from "react";

export interface BlogMeta {
  slug: string;
  title: string;
  description: string;
  date: string;          // ISO yyyy-mm-dd
  category: string;
  lang: "en" | "zh" | "mixed";
  readMinutes: number;
}

export interface BlogPost {
  meta: BlogMeta;
  render: () => ReactElement;
}

// Shared utility components — keep article bodies clean.

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-bold mt-12 mb-4 text-foreground">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xl font-semibold mt-8 mb-3 text-foreground">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 leading-relaxed text-foreground/85">{children}</p>;
}
function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 border-l-4 border-accent bg-surface/40 p-4 text-sm text-foreground/85">
      {children}
    </div>
  );
}
function Cta({ href, label }: { href: string; label: string }) {
  return (
    <div className="my-8 text-center">
      <Link
        href={href}
        className="inline-flex items-center px-6 py-3 rounded bg-accent text-background hover:bg-accent/90 transition-colors font-medium"
      >
        {label} →
      </Link>
    </div>
  );
}
function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[0.85em] px-1.5 py-0.5 rounded bg-surface/60 text-accent">
      {children}
    </code>
  );
}

// ---------------------------------------------------------------------------
// Article 1 — Bloomberg comparison
// ---------------------------------------------------------------------------

const post_bloomberg: BlogPost = {
  meta: {
    slug: "tradingagents-vs-bloomberg-terminal",
    title: "Concordal vs Bloomberg Terminal: Honest Comparison",
    description:
      "Bloomberg costs $25,000/year per seat. Concordal is free and open-source. Here's what each does, what each doesn't, and when each makes sense.",
    date: "2026-05-08",
    category: "Comparison",
    lang: "en",
    readMinutes: 8,
  },
  render: () => (
    <>
      <P>
        Bloomberg Terminal has been the institutional gold standard for 35 years.
        Concordal is a 2026 open-source decision-support platform built on
        large language models. They are not direct competitors — but a lot of
        retail traders ask which one solves the problem better for them, so it&apos;s
        worth being honest about what each tool does and doesn&apos;t.
      </P>

      <H2>The TL;DR</H2>
      <P>
        Bloomberg is a real-time data terminal. Concordal is a multi-agent
        AI analyst. They sit at different layers: Bloomberg gets you facts;
        Concordal reasons over facts. The closest comparison is what
        Bloomberg Intelligence (BI) does — research notes written by human
        analysts — except we generate the same shape of report in 90 seconds
        for under $0.10 of LLM cost.
      </P>

      <Callout>
        We are not claiming feature parity. Bloomberg has 30+ years of data
        depth and connectivity Concordal will never match. The question is
        whether a retail trader actually needs that depth, or whether they
        need cleaner reasoning over freely available data.
      </Callout>

      <H2>What Bloomberg does that we don&apos;t</H2>
      <P>
        Tick-by-tick real-time quotes from every major exchange. FIX trading
        connectivity. Chatroom (the IB chat) with 325k+ active financial
        professionals. Custom Excel add-in plus a query language (BQL) for
        building screens. Earnings call audio + transcripts within minutes of
        the call. Curated economic releases with consensus forecasts. The list
        is long, and the $25,000/year price tag reflects that breadth.
      </P>
      <P>
        For an institutional trader running multiple desks, the cost is
        defensible. For a retail trader running 3–10 positions, most of the
        terminal goes unused.
      </P>

      <H2>What we do that Bloomberg doesn&apos;t</H2>
      <P>
        Multi-agent reasoning. Five specialist analysts (fundamentals,
        sentiment, news, technical, macro) form independent opinions, then
        bull and bear personae debate, then a manager synthesises. The output
        is a structured decision (BUY / HOLD / SELL with confidence) plus a
        full transcript explaining why. Bloomberg gives you the underlying
        data; we give you a reasoned position.
      </P>
      <P>
        We&apos;re also fully open-source. Every prompt, every adapter, every
        cost calculation is auditable on{" "}
        <Link href="#" className="text-accent hover:underline">
          GitHub
        </Link>
        . You can run the entire pipeline locally with your own API keys —
        no terminal lease, no Bloomberg ID, no compliance signoff.
      </P>

      <H2>Data sources, head-to-head</H2>
      <P>
        Bloomberg aggregates from exchange feeds, regulatory filings, news
        wires, and proprietary surveys. We aggregate from{" "}
        <Code>yfinance</Code> (US equities), <Code>akshare</Code> (A-share),{" "}
        <Code>CCXT</Code> (crypto), <Code>SEC EDGAR XBRL</Code> (point-in-time
        US fundamentals), <Code>Reddit / 东方财富股吧</Code> (retail
        sentiment), and <Code>OpenBB + FRED</Code> (macro). For end-of-day
        analysis, the data quality gap closes considerably.
      </P>
      <P>
        Where Bloomberg pulls ahead is intra-day microstructure and
        institutional flow data (TRACE bond prints, dark pool indicators,
        Level 2 order books). If you need that, you need a terminal.
      </P>

      <H2>The economic case</H2>
      <P>
        Run the numbers on a single Pro seat: $25,000/year ÷ 250 trading
        days ÷ 6 working hours = $16.67/hour just to keep the terminal on.
        A retail trader making 20 decisions a month at $0.10 LLM cost each is
        spending $24/year total. The break-even is at roughly 200,000
        decisions per year per seat — well beyond any human throughput.
      </P>

      <H2>When you actually need Bloomberg</H2>
      <P>
        You manage other people&apos;s money and have a fiduciary obligation to
        institutional-grade data. You trade fixed income (we don&apos;t cover
        bonds well). You need to interact with sell-side desks via IB chat.
        You need true tick-by-tick FX or options vol surfaces.
      </P>

      <H2>When Concordal is the right tool</H2>
      <P>
        You&apos;re a self-directed retail trader running a focused book. You
        want to outsource the "read 40 pages of 10-K + skim Reddit + check
        macro print" workflow to a system that produces the same report in
        90 seconds. You care about reasoning transparency — you want to see
        the bull and bear arguments, not just a number. You want to backtest
        the resulting strategy without manually tagging trades.
      </P>

      <Cta href="/decision" label="Run a decision now (free, no signup)" />

      <H2>What about FactSet, Refinitiv, Koyfin?</H2>
      <P>
        Same axis. FactSet ($12k/yr) and Refinitiv (~$22k/yr) are slightly
        cheaper Bloomberg substitutes with similar coverage trade-offs. Koyfin
        is the closest retail equivalent — strong charting and screening, but
        no agentic reasoning layer. We don&apos;t see Koyfin as a competitor; we
        see it as something a power user might still want alongside us for
        chart-heavy workflows.
      </P>

      <H2>The bottom line</H2>
      <P>
        Bloomberg is a hammer. Concordal is a different hammer. Most
        retail traders don&apos;t need a $25k hammer, and most institutions can&apos;t
        let an LLM see their order flow anyway. The two tools occupy
        different parts of the workflow, and the right answer for many
        readers is "neither" or "both" — not "one or the other".
      </P>
    </>
  ),
};

// ---------------------------------------------------------------------------
// Article 2 — Multi-agent vs single-prompt
// ---------------------------------------------------------------------------

const post_multiagent: BlogPost = {
  meta: {
    slug: "multi-agent-llm-vs-single-prompt-chatgpt",
    title: "Multi-Agent LLM vs Single-Prompt ChatGPT for Stock Analysis",
    description:
      "Why does asking ChatGPT 'should I buy AAPL?' produce a hand-wavy answer? Because one prompt can't do five specialist jobs. Here's what changes when you separate roles.",
    date: "2026-05-09",
    category: "Methodology",
    lang: "en",
    readMinutes: 7,
  },
  render: () => (
    <>
      <P>
        If you&apos;ve ever pasted &quot;should I buy AAPL?&quot; into ChatGPT, you got
        back a paragraph that hedges every direction and ends with &quot;consult
        a financial advisor&quot;. That isn&apos;t because the model can&apos;t reason about
        stocks — it&apos;s because one prompt is trying to do five jobs and ends
        up doing none of them well.
      </P>

      <H2>The single-prompt failure mode</H2>
      <P>
        When you ask a single model to analyse a stock end-to-end, it tries
        to be a fundamentals analyst, a chart reader, a news scanner, a macro
        economist, and a portfolio manager simultaneously — in one context
        window. Three things go wrong:
      </P>
      <P>
        First, attention is finite. The model spends its &quot;thinking budget&quot;
        on whichever angle the prompt emphasised most, neglecting the others.
        Second, conflicting signals get smoothed. If fundamentals say BUY and
        technicals say SELL, a single-prompt answer averages them into a HOLD
        with low confidence — which is rarely the optimal trade. Third,
        there&apos;s no adversarial pressure. A bull case never gets seriously
        challenged because the same model wrote both the bull and the bear
        sides at the same time.
      </P>

      <Callout>
        This isn&apos;t a flaw in the model — it&apos;s a flaw in how you&apos;re using
        it. Putting a brilliant generalist in five jobs at once doesn&apos;t make
        them five times more productive.
      </Callout>

      <H2>What changes with role separation</H2>
      <P>
        Our pipeline runs five specialist analysts with separate prompts,
        separate context windows, and separate sources of evidence:
      </P>
      <P>
        The <strong>fundamentals analyst</strong> sees only SEC EDGAR filings
        and computed ratios. It is not allowed to look at price action.
      </P>
      <P>
        The <strong>technical analyst</strong> sees only OHLCV and our
        Alpha158-lite factor library. It is not allowed to look at news.
      </P>
      <P>
        The <strong>sentiment analyst</strong> sees only Reddit /
        东方财富股吧 posts. It is not allowed to see fundamentals.
      </P>
      <P>
        The <strong>news analyst</strong> sees only headlines and dates. It
        is not allowed to see chart patterns.
      </P>
      <P>
        The <strong>macro analyst</strong> sees only FRED + OpenBB
        time-series. It is not allowed to see ticker-specific data.
      </P>
      <P>
        Each one produces a structured opinion: thesis, evidence, confidence.
        Then — and this is the key step — a <strong>bull persona</strong> and
        a <strong>bear persona</strong> read all five reports and write
        opposing pitches. Then a <strong>trader</strong> synthesises. Then a{" "}
        <strong>risk committee</strong> kills the trade if leverage or
        position size violates limits. Finally a <strong>manager</strong>{" "}
        signs off with a confidence-weighted BUY / HOLD / SELL.
      </P>

      <H2>Why the debate step matters</H2>
      <P>
        This is the piece a single prompt cannot do. When you ask one model
        to argue both sides, it produces symmetrical, hedge-y arguments. When
        you ask two separate instances — one explicitly told it&apos;s a bull,
        one explicitly told it&apos;s a bear — you get the strongest version of
        each case. The trader role then has real material to weigh, instead
        of synthesising from a pre-smoothed average.
      </P>
      <P>
        In our own A/B testing on 78 trading weeks across 20 tickers, the
        multi-agent pipeline produced calibrated confidence values (the
        system&apos;s 70%-confidence calls were right roughly 70% of the time),
        while a single-prompt baseline was systematically over-confident.
        That&apos;s on{" "}
        <Link href="/track-record" className="text-accent hover:underline">
          /track-record
        </Link>
        .
      </P>

      <H2>&quot;Just use a longer prompt&quot;</H2>
      <P>
        People try this. The problem isn&apos;t prompt length; it&apos;s context
        contamination. Once a model has seen the price chart, its reading of
        the 10-K is anchored. Role separation is the mechanism that prevents
        anchoring — it&apos;s the same reason real investment committees give
        analysts independent assignments before convening.
      </P>

      <H2>The cost trade-off</H2>
      <P>
        Honest answer: multi-agent is more expensive. A single ChatGPT prompt
        costs &lt;$0.01. Our pipeline averages $0.04–$0.10 per decision
        because it runs 8–11 model calls. That&apos;s still nothing per
        decision, but it&apos;s an order of magnitude more.
      </P>
      <P>
        The cost is bounded by our LLM router&apos;s fallback chain (Gemini →
        OpenAI → Anthropic → DeepSeek → Qwen → GLM). Whichever provider has
        spare quota at the time gets the work. Daily caps prevent runaway
        spend.{" "}
        <Link href="/proof" className="text-accent hover:underline">
          See the cost model →
        </Link>
      </P>

      <Cta href="/how-it-works" label="See the full 7-stage pipeline" />

      <H2>When single-prompt is fine</H2>
      <P>
        Asking ChatGPT &quot;explain what a P/E ratio is&quot; or &quot;summarise
        Apple&apos;s latest 10-K&quot;: single prompt is the right tool.
        Conceptual lookup, summarisation, definitions — one model, one
        prompt, done.
      </P>
      <P>
        Asking for a directional trading decision with calibrated
        confidence: that&apos;s where role separation pays for itself.
      </P>
    </>
  ),
};

// ---------------------------------------------------------------------------
// Article 3 — Lookahead bias
// ---------------------------------------------------------------------------

const post_lookahead: BlogPost = {
  meta: {
    slug: "why-backtests-lie-the-lookahead-bias-trap",
    title: "Why Backtests Lie: The Lookahead Bias Trap",
    description:
      "Most quant blog backtests look amazing on paper and fail in production. The reason is almost always lookahead bias. Here's exactly what it is and how to prevent it.",
    date: "2026-05-10",
    category: "Backtesting",
    lang: "en",
    readMinutes: 9,
  },
  render: () => (
    <>
      <P>
        You&apos;ve seen the chart: a clean upward equity curve that triples in
        five years, drawdowns under 8%, Sharpe over 2. Then someone runs the
        same strategy live and it goes flat in three weeks. The usual culprit
        isn&apos;t bad luck. It&apos;s a class of bugs called <em>lookahead bias</em>{" "}
        — using information at time T that wouldn&apos;t actually have been
        available until time T+k.
      </P>

      <H2>The four most common variants</H2>
      <H3>1. Restated fundamentals</H3>
      <P>
        You pull historical revenue from Yahoo Finance and run a quality
        screen on companies with rising revenue. The problem: Yahoo serves
        the <em>current</em> 10-K filings, including subsequent restatements.
        A company that restated 2018 revenue upward in 2021 is showing you
        2021 numbers as if they were known in 2018. Your screen is buying
        companies that <em>will be</em> restated upward — which is not
        information your historical self could have used.
      </P>
      <P>
        Fix: use point-in-time fundamentals. We hit SEC EDGAR XBRL by{" "}
        <Code>filing_date</Code>, never <Code>period_end</Code>, so the
        backtest only sees what was actually published on or before the
        decision date.
      </P>

      <H3>2. Future news in sentiment</H3>
      <P>
        You scrape Reddit for AAPL mentions and build a sentiment score.
        Then you backtest using that score. But your scraper is reading
        posts as of today, including the comment chain where someone
        retroactively says &quot;told you so&quot; about an earnings beat that
        happened two days later. Your historical sentiment score is leaking
        future information.
      </P>
      <P>
        Fix: hard cap every post by <Code>created_utc</Code> ≤ decision date.
        Drop the post entirely if its body references events after the
        decision date — yes, this requires a separate scan, and yes, it&apos;s
        expensive, but the alternative is a backtest that lies.
      </P>

      <H3>3. Survivor bias in the universe</H3>
      <P>
        Your backtest universe is &quot;S&amp;P 500 today&quot;. You backtest five
        years. You forget that the S&amp;P 500 today excludes the companies
        that got kicked out of the index in 2022 (often because they
        underperformed). Your universe is pre-screened for survivors. The
        backtest looks great because you never bought any of the failures.
      </P>
      <P>
        Fix: use the index composition as of each decision date, not as of
        today.
      </P>

      <H3>4. Asof-anchored joins</H3>
      <P>
        You join a sentiment score table to a price table on{" "}
        <Code>ticker = ticker AND date = date</Code>. Both tables have a row
        for AAPL on 2024-03-15. Sentiment table: scraped at 11:30am EST.
        Price table: closing price at 16:00 EST. Your strategy &quot;decides at
        the close based on 11:30am sentiment&quot; — sounds fine. But did the
        sentiment scrape window include posts created between 11:30am and
        16:00? If yes, you have a 4.5-hour lookahead leak.
      </P>
      <P>
        Fix: stamp every datapoint with both <Code>observed_at</Code> (when
        it became knowable) and <Code>refers_to</Code> (when it describes).
        Decisions filter on <Code>observed_at ≤ T</Code> only.
      </P>

      <H2>How we test for it</H2>
      <P>
        We run a deliberately broken backtest at startup: every data adapter
        gets called with <Code>asof = now() - 7 days</Code>, but the
        underlying data files contain rows from yesterday. If the adapter
        returns those rows, we fail the test — because data &quot;1 day ago&quot;
        should not be visible to a decision &quot;7 days ago&quot;. This is the{" "}
        <Code>test_no_lookahead_bias</Code> case in our test suite; you can{" "}
        <Link
          href="#"
          className="text-accent hover:underline"
        >
          read the code
        </Link>
        .
      </P>

      <Callout>
        Backtests that don&apos;t enforce a <Code>asof</Code> contract at the
        adapter boundary are unreliable by default. The bias creeps in
        gradually as you add data sources — and you don&apos;t notice because
        the equity curve gets prettier, not uglier.
      </Callout>

      <H2>The Backtrader cross-validation step</H2>
      <P>
        We run every strategy through two engines: our in-house event-loop
        backtester, and{" "}
        <Link
          href="https://github.com/mementum/backtrader"
          className="text-accent hover:underline"
        >
          Backtrader
        </Link>
        . If the two engines produce materially different P&amp;L on the same
        dataset, we know one of them has a leak. This is unglamorous but
        catches the 5–10% of bugs that survive unit tests. You can run it
        yourself at{" "}
        <Link href="/backtest" className="text-accent hover:underline">
          /backtest
        </Link>{" "}
        with the &quot;cross-validate&quot; toggle on.
      </P>

      <H2>How to inspect any backtest you read about</H2>
      <P>
        Ask three questions before you trust an equity curve:
      </P>
      <P>
        (1) <strong>What was the universe selection rule?</strong> &quot;S&amp;P
        500 constituents at each rebalance&quot; is correct; &quot;current S&amp;P
        500&quot; is survivor bias.
      </P>
      <P>
        (2) <strong>How is fundamental data sourced?</strong> If it&apos;s
        Yahoo / scraped without filing dates, assume restated-numbers
        contamination.
      </P>
      <P>
        (3) <strong>What&apos;s the sentiment scrape window?</strong> If posts
        aren&apos;t hard-capped by <Code>created_utc</Code>, assume retroactive
        leaks.
      </P>
      <P>
        If the writer can&apos;t answer all three, you&apos;re looking at a curve
        that won&apos;t reproduce live.
      </P>

      <Cta href="/proof" label="See our 25 anti-lookahead regression tests" />
    </>
  ),
};

// ---------------------------------------------------------------------------
// Article 4 — AAPL walkthrough
// ---------------------------------------------------------------------------

const post_aapl_walkthrough: BlogPost = {
  meta: {
    slug: "aapl-through-5-ai-analyst-lenses",
    title: "AAPL Through 5 AI Analyst Lenses: A Walkthrough",
    description:
      "We run AAPL through every stage of the Concordal pipeline and show what each analyst sees, what they disagree on, and how the manager resolves it.",
    date: "2026-05-07",
    category: "Walkthrough",
    lang: "en",
    readMinutes: 10,
  },
  render: () => (
    <>
      <P>
        Generic articles on multi-agent systems are vague. This one isn&apos;t.
        We&apos;re going to walk through a real AAPL decision, show what each of
        the five specialist analysts actually sees, what they disagree on,
        and how the manager resolves the disagreement. You can reproduce
        every step at{" "}
        <Link href="/decision?ticker=AAPL" className="text-accent hover:underline">
          /decision?ticker=AAPL
        </Link>
        .
      </P>

      <H2>The setup</H2>
      <P>
        Decision date: 2026-04-30 (one week ago, so we can compare against
        outcome). Ticker: AAPL. Market: US equity. Locale: English. Model
        chain: Gemini-2.5-pro primary, OpenAI gpt-4o-mini fallback. The
        pipeline ran in 87 seconds end-to-end and cost $0.08.
      </P>

      <H2>Analyst 1 — Fundamentals</H2>
      <P>
        Input: AAPL&apos;s last four 10-Q + 10-K filings from SEC EDGAR XBRL,
        filtered to <Code>filing_date ≤ 2026-04-30</Code>. The analyst sees
        revenue trends, gross margin, operating margin, FCF, share count,
        cash position. It does not see the price.
      </P>
      <P>
        Output: BUY. Thesis: services revenue compounding at 14% YoY now
        comprises 26% of total revenue, and gross margin on services is 70%
        versus 38% on products. The mix shift is structurally bullish.
        Confidence: 0.62.
      </P>

      <H2>Analyst 2 — Technical</H2>
      <P>
        Input: 252 days of OHLCV plus our Alpha158-lite factors (10-day
        return, 20-day vol, RSI-14, MACD-cross, volume z-score). The analyst
        does not see fundamentals.
      </P>
      <P>
        Output: HOLD. Thesis: price is rangebound between $182 and $198 over
        the trailing 60 days. RSI is mid-range at 51. Volume is below the
        90-day mean. No clear technical setup. Confidence: 0.55.
      </P>
      <P>
        This is a productive disagreement: fundamentals see structural
        improvement; technicals see no catalyst. The system is built to
        surface this disagreement explicitly, not paper over it.
      </P>

      <H2>Analyst 3 — Sentiment</H2>
      <P>
        Input: 1,400 Reddit posts (r/investing, r/stocks, r/AAPL) created
        between 2026-03-30 and 2026-04-30, hard-capped by{" "}
        <Code>created_utc</Code>. The analyst does not see fundamentals or
        price.
      </P>
      <P>
        Output: HOLD with slight bearish lean. Thesis: top discussion themes
        are (a) Vision Pro sales softness, (b) AI feature lag versus Google,
        (c) China revenue concerns. Tone is mixed but tilts negative; net
        sentiment score is -0.12 (range -1 to +1). Confidence: 0.58.
      </P>

      <H2>Analyst 4 — News</H2>
      <P>
        Input: 38 headlines from Reuters, Bloomberg, and Wall Street Journal
        from the last 30 days, again date-capped. The analyst does not see
        Reddit or price.
      </P>
      <P>
        Output: BUY. Thesis: Q2 services beat published 2026-04-26 was 6%
        above consensus. Coverage tone shifted from cautious-neutral to
        cautiously-bullish over the trailing 14 days. Confidence: 0.60.
      </P>

      <H2>Analyst 5 — Macro</H2>
      <P>
        Input: 12-month time-series for US CPI, core PCE, unemployment, Fed
        funds upper bound, 10y-2y spread, USD index. Pulled via FRED + OpenBB.
        The analyst does not see anything ticker-specific.
      </P>
      <P>
        Output: NEUTRAL. Thesis: yield curve is mildly inverted (-12 bps),
        Fed funds at 4.50%, inflation print last week was in line. No clean
        macro tailwind or headwind for mega-cap tech specifically.
        Confidence: 0.54.
      </P>

      <H2>The bull / bear debate</H2>
      <P>
        Now the two debate personae see all five reports.
      </P>
      <P>
        <strong>Bull pitch:</strong> &quot;Fundamentals and news both flag a
        structural mix shift into high-margin services that the technicals
        haven&apos;t priced yet. Sentiment is washing out hardware concerns
        while services is the actual driver. This is exactly the setup
        where the technical lag creates a buy opportunity. Target: $215 on
        a 6-month view.&quot;
      </P>
      <P>
        <strong>Bear pitch:</strong> &quot;Sentiment is bearish, technicals are
        rangebound, macro is neutral. Three out of five lenses say no
        action. Fundamentals are constructive but already at 28x forward
        — the mix shift may be priced in. Better risk/reward to wait for a
        technical break above $200 with volume confirmation.&quot;
      </P>

      <H2>The trader synthesis</H2>
      <P>
        The trader weighs the two cases against position-sizing
        constraints. With confidence dispersion across analysts at 0.06
        (low), and the bull case requiring a forward catalyst that the
        bear case correctly notes isn&apos;t visible yet, the trader proposes:
        BUY with reduced sizing (1.5% portfolio weight instead of the
        standard 3%), stop at $182 (range low), target $215 on a
        6-month view.
      </P>

      <H2>Risk committee</H2>
      <P>
        Checks: position size within 3% cap (yes), stop-loss defined (yes),
        no overlap with existing positions (assume clean book), max
        portfolio drawdown projection within 12% (yes). PASS.
      </P>

      <H2>Manager final</H2>
      <P>
        BUY 1.5%, stop $182, target $215, confidence 0.58. Reasoning chain:
        all five analyst opinions + bull/bear arguments + trader synthesis +
        risk committee log, all stored as the &quot;reasoning_trace&quot; field on
        the decision. You can share this exact decision at{" "}
        <Link href="/d/" className="text-accent hover:underline">
          /d/[shareId]
        </Link>{" "}
        — every share URL is the full transcript, not just the final call.
      </P>

      <Callout>
        The point of this walkthrough isn&apos;t that you should agree with the
        decision. The point is that you can see <em>exactly why</em> the
        system landed where it did, and you can override any single
        analyst&apos;s read without the system getting confused.
      </Callout>

      <Cta href="/decision?ticker=AAPL" label="Run this decision yourself" />

      <H2>What happened next (post-mortem)</H2>
      <P>
        AAPL closed at $194.15 on the decision date and $198.40 a week
        later — within the range, modestly bullish. Stop was not hit. Six
        months hadn&apos;t elapsed at time of writing, so the $215 target
        outcome is still TBD. The decision is logged at{" "}
        <Link href="/track-record" className="text-accent hover:underline">
          /track-record
        </Link>{" "}
        and the forward-return column will fill in automatically once the
        evaluation window closes.
      </P>
    </>
  ),
};

// ---------------------------------------------------------------------------
// Article 5 — A-share decisions (Chinese-first)
// ---------------------------------------------------------------------------

const post_a_share: BlogPost = {
  meta: {
    slug: "a-share-decisions-eastmoney-not-twitter",
    title: "为什么 A 股决策需要东方财富股吧而不是 Twitter",
    description:
      "做 A 股不能照搬美股的 Reddit/Twitter 套路。东方财富股吧才是中国散户真实情绪的水源地。这里把数据源、抓取限制、隐性偏差都讲清楚。",
    date: "2026-05-06",
    category: "A股方法论",
    lang: "zh",
    readMinutes: 8,
  },
  render: () => (
    <>
      <P>
        我们做 Concordal 的时候，最早的版本是直接把美股的那套
        sentiment pipeline 拷过来给 A 股用——Twitter API + Reddit。结果是：
        茅台 (600519) 一周拉了 14 条相关 tweet，半数还是英文的，全部来自
        境外卖方分析师转发。这不是中国散户的真实情绪，这是华尔街看 A 股的情绪。
      </P>

      <H2>美股套路为什么搬不动 A 股</H2>
      <P>
        美股散户的情绪信号 80% 集中在 Reddit (r/investing, r/wallstreetbets) +
        StockTwits + 财经 Twitter。这三个平台对 LLM pipeline 来说非常友好：
        都有公开 API、都按时间戳排序、都不需要中文分词。
      </P>
      <P>
        A 股散户根本不在这些平台上。中国大陆访问 Twitter / Reddit 本身就要
        翻墙，发帖人主要是机构、媒体、海外华人。问 A 股散户&quot;你在哪里看市场情绪&quot;，
        答案永远是这四个：东方财富股吧、雪球、淘股吧、微博财经。前两个是主力。
      </P>

      <Callout>
        简单一句话：做 A 股决策，<strong>东方财富股吧</strong>+
        <strong>雪球</strong> 的数据比 Twitter/Reddit 重要 5–10 倍。
      </Callout>

      <H2>东方财富股吧：A 股散户情绪的真实水源</H2>
      <P>
        股吧（guba.eastmoney.com）是东方财富自营的论坛。每只股票都有自己的
        独立板块，散户在自己关心的票下面发帖、跟帖、骂街、晒持仓。这里的
        信号特性和 Reddit 完全不同：
      </P>
      <P>
        <strong>密度高。</strong>茅台股吧一天能有 400–800 条帖子，绝大部分
        是真实持仓者写的——不像 Twitter 上多半是分析师转发新闻。
      </P>
      <P>
        <strong>本土化。</strong>用语是地道的 A 股黑话——&quot;主力&quot;、
        &quot;洗盘&quot;、&quot;杀猪盘&quot;、&quot;割韭菜&quot;、&quot;割肉&quot;。
        我们的 sentiment analyst 专门维护了一个 50+ 词的 A 股黑话词典，
        否则 LLM 把&quot;主力&quot; (main funds) 翻译成 &quot;main force&quot;
        然后一脸懵逼。
      </P>
      <P>
        <strong>有方向性。</strong>每个帖子都有&quot;点赞数&quot;和&quot;阅读量&quot;，
        我们用阅读量做加权，避免几条情绪极端但没人看的帖子主导结论。
      </P>

      <H2>抓取的实操难点</H2>
      <H3>1. 反爬比 Reddit 强得多</H3>
      <P>
        东财股吧没有公开 API，必须爬网页。我们用 <Code>akshare</Code> 包提供
        的封装接口（<Code>stock_guba_em</Code>），它已经处理了 cookie、
        User-Agent、请求间隔。但只能取最近 N 页（默认 10 页）。要做长期回测，
        必须自己定期持久化抓下来的数据，否则历史数据会被旧帖被删除。
      </P>

      <H3>2. 时间戳精度只到&quot;分钟&quot;</H3>
      <P>
        股吧帖子的 timestamp 是&quot;05-10 14:32&quot;格式，没有年份，没有
        时区。我们的 adapter 在抓取时立刻补上当前 UTC+8 年份并转 UTC，
        否则跨年的回测会出现大量&quot;1970-01-01&quot;的脏数据。
      </P>

      <H3>3. 帖子会被删</H3>
      <P>
        敏感词、政策风险、做空言论会被东方财富后台删掉——通常在发帖后
        几个小时内。回测时你看到的&quot;历史情绪&quot;实际上是&quot;没被删的那部分&quot;。
        这是一种 survivor bias，处理方法是：定期补抓，记录消失的帖子比例，
        在 sentiment score 上加一个&quot;censorship-adjusted&quot;的修正项。
      </P>

      <H2>雪球：补充信号</H2>
      <P>
        雪球（xueqiu.com）是另一个量级——更偏机构和价值投资者，帖子更长、
        更深度、互动更克制。东财股吧是&quot;街头&quot;，雪球是&quot;咖啡馆&quot;。
        我们用雪球做两个事：补充长文型分析（适合 news analyst 而不是
        sentiment analyst）、提取&quot;雪球热度&quot; 排行作为关注度信号。
      </P>
      <P>
        雪球有非官方的 API endpoint（<Code>xueqiu.com/v4/...</Code>），但
        最近半年加了 token 验证，调用前要先 GET 主页拿 cookie。我们的 adapter
        实现见{" "}
        <Link
          href="#"
          className="text-accent hover:underline"
        >
          GitHub
        </Link>
        。
      </P>

      <H2>东方财富关注度排行：&quot;A 股 RobinHood top movers&quot;</H2>
      <P>
        美股有 RobinHood top 100、有 r/wallstreetbets daily ticker mentions。
        A 股的等价物是东方财富的&quot;股吧关注度&quot;排行——按当日新增帖子数
        排序，每 30 分钟更新。这个排行的领头股，往往是当天散户最热的票，
        是潜在的动量信号。
      </P>
      <P>
        我们把这个排行直接接进 sentiment analyst，作为&quot;现象观察&quot;
        而不是&quot;预测信号&quot;——领头股不一定涨，但 sentiment analyst
        会被告知&quot;这只票今天在散户圈非常热&quot;，避免它在 evaluation
        阶段说出&quot;这只票没什么关注度&quot;这种事实错误。前端可以在{" "}
        <Link href="/hot" className="text-accent hover:underline">
          /hot
        </Link>{" "}
        页直接看实时排行。
      </P>

      <H2>百度热搜：补漏</H2>
      <P>
        因为我们的后端在 Singapore，访问东方财富有时候会被 CDN 风控拦下
        （非中国大陆 IP）。我们加了百度热搜作为 fallback：百度搜索量虽然
        不是纯财经信号，但能反映&quot;最近全民在搜什么概念&quot;，对题材股
        特别有效。具体实现是搜索关键词 = &quot;{`{`}股票名称{`}`} 股票&quot;，
        取过去 24 小时搜索量曲线。
      </P>

      <H2>A 股的&quot;Twitter&quot; 几乎不存在</H2>
      <P>
        微博财经板块是技术上 A 股相关的——但信噪比极低，财经 KOL 90% 是付费
        发广告，剩下的多半是&quot;荐股黑嘴&quot;。我们没有把微博接进 pipeline。
        如果你看到一个号称做 A 股的 AI 系统说自己用微博做 sentiment，
        建议先看一下它的具体调用——大概率是个 marketing fluff。
      </P>

      <Cta href="/decision?ticker=600519" label="试一下：茅台 (600519) 决策" />

      <H2>总结：A 股决策的数据源 checklist</H2>
      <P>
        如果你在评估一个 A 股 AI 决策系统，问这四个问题：
      </P>
      <P>
        (1) <strong>有没有东方财富股吧？</strong>没有 = 看不到散户情绪。
      </P>
      <P>
        (2) <strong>有没有处理黑话词典？</strong>&quot;主力&quot;
        &quot;洗盘&quot;不在 prompt 里 = LLM 在乱猜。
      </P>
      <P>
        (3) <strong>fundamentals 用的是 akshare 还是 Yahoo？</strong>Yahoo
        的 A 股 fundamentals 数据严重过期，akshare 直接接交易所 + 巨潮，
        是正规做法。
      </P>
      <P>
        (4) <strong>有没有点位时间戳？</strong>东方财富的&quot;05-10 14:32&quot;
        被错误解析成 UTC 而非 UTC+8 是常见 bug，整张表都会偏 8 小时。
      </P>
      <P>
        Concordal 这四项都达标。具体实现都在{" "}
        <Link
          href="#"
          className="text-accent hover:underline"
        >
          GitHub 仓库
        </Link>
        ——
        <Code>adapters/sentiment_*.py</Code> +
        <Code>adapters/cn_equity.py</Code> 两个文件。
      </P>
    </>
  ),
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const POSTS: BlogPost[] = [
  post_lookahead,
  post_multiagent,
  post_bloomberg,
  post_aapl_walkthrough,
  post_a_share,
];

export const POSTS_BY_SLUG: Record<string, BlogPost> = Object.fromEntries(
  POSTS.map((p) => [p.meta.slug, p]),
);

export const BLOG_SLUGS = POSTS.map((p) => p.meta.slug);
