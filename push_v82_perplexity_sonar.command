#!/bin/bash
# push_v82_perplexity_sonar.command
# v82: Perplexity Sonar 实时联网 adapter + news analyst 集成

set -e

REPO="$HOME/Desktop/trading-agents-platform"

echo "════════════════════════════════════════════════════════"
echo "  v82: Perplexity Sonar 实时联网集成 (DeepSeek + Sonar)"
echo "════════════════════════════════════════════════════════"
echo ""

cd "$REPO"
[ -f .git/index.lock ] && rm -f .git/index.lock && echo "🔓 cleared lock"

git status --short
echo ""

git add -A
git commit -m "v82: add Perplexity Sonar realtime web-search adapter

What changed:
  + src/trading_agents/adapters/perplexity_sonar.py  (NEW, ~160 lines)
  ~ src/trading_agents/agents/analysts.py            (_fetch_news overlay)

Architecture:
  DeepSeek V4 (deepseek-chat) is chat-completion only — no native web
  browsing. Until v82 the news analyst saw only social-signal news from
  Reddit + EastMoney guba (the data bus 'NEWS' need). Those sources lag
  the actual market-moving event — they discuss it after the fact.

  v82 adds a Perplexity Sonar overlay: at decision time, before the
  news analyst runs, we ask Sonar 'What are today's news on TICKER?'.
  Sonar does a fresh web search, returns a structured list with primary
  sources (Reuters, Bloomberg, SEC filings, company PR) + citation URLs.
  We merge that into the existing bus payload so DeepSeek sees both:
    - what happened (Sonar — primary sources)
    - what people think about it (Reddit / guba — social signal)
  in one prompt.

Cost: ~\$0.001 / decision. Cap output at 600 tokens, temperature 0.1.

Opt-in: PERPLEXITY_API_KEY env var. Unset → adapter silently no-ops,
pipeline falls back to bus-only (current behaviour). Already configured
in Render env vars as of this commit.

Robustness: adapter wraps HTTP errors as WARNING + empty list. The
analyst's try/except around the import means even a totally broken
perplexity module cannot break the decision pipeline.

Locale-aware: zh locale → Chinese prompt + zh sources prefered.

Pairs with: TA_MODEL_DEEP/FAST/MID all set to deepseek-chat earlier this
session, so 100% of LLM calls go through DeepSeek V4 with Sonar feeding
realtime news context." \
  || { echo "⚠ nothing to commit"; }
echo ""

git push origin main
echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅ v82 pushed"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Render 自动重新部署 (~3-5 分钟)。"
echo "完了跑一个测试决策（任意 ticker），news analyst 输出里应该出现"
echo "来自 perplexity 的 source 标记 + 真实今日新闻 + 引用 URL。"
echo ""
read -p "(Enter 退出)"
