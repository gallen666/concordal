#!/bin/bash
# push_v83_v4_pro_perplexity.command
# v83: DeepSeek-V4-Pro 命名升级 + Perplexity Sonar 实时联网（含 v82 改动）

set -e

REPO="$HOME/Desktop/trading-agents-platform"

echo "════════════════════════════════════════════════════════"
echo "  v83: V4-Pro + Perplexity Sonar 联网（一并推 v82+v83）"
echo "════════════════════════════════════════════════════════"
echo ""

cd "$REPO"
[ -f .git/index.lock ] && rm -f .git/index.lock && echo "🔓 cleared lock"

git status --short
echo ""

git add -A
git commit -m "v83: DeepSeek-V4-Pro pricing + Perplexity Sonar realtime overlay

Bundles two related improvements:

(1) DeepSeek model lineup refresh (router.py _PRICES + fallback chain)

  DeepSeek published new model names on 2026-04-26:
    deepseek-v4-pro    — flagship, supports thinking+reasoning_effort
    deepseek-v4-flash  — fast tier, supports thinking
    deepseek-chat      — legacy alias of v4-flash non-thinking
                         (deprecated 2026/07/24)
    deepseek-reasoner  — legacy alias of v4-flash thinking
                         (deprecated 2026/07/24)

  Concordal now uses v4-pro for all three tiers (TA_MODEL_DEEP/FAST/MID,
  set in Render env vars). Adds:

  - Four new _PRICES rows (v4-pro at the 2.5x discount rate that runs
    through 2026-05-31; deepseek-chat / -reasoner kept as aliases at
    v4-flash pricing for cost-ledger continuity).
    NOTE: update v4-pro to (1.67, 3.33) USD/Mtoken after 2026-05-31 when
    the discount ends and price reverts to ¥12 in / ¥24 out.

  - _DEEPSEEK_FALLBACK_CHAIN extended:
      v4-pro (500 RPM cap)  →  v4-flash (2500 RPM, ~3x cheaper)
                            →  deepseek-chat (legacy alias)
    Gives the analyst 3 chances on rate-limit before mock kicks in.

  Cost impact: \$0.025/decision vs \$0.009 on flash. Worth it for
  flagship-tier reasoning on the 7-agent pipeline.

(2) Perplexity Sonar realtime web-search adapter (was v82 plan)

  + src/trading_agents/adapters/perplexity_sonar.py  (NEW, ~160 lines)
  ~ src/trading_agents/agents/analysts.py             (_fetch_news overlay)

  DeepSeek V4 API is chat-completion only — no native web browsing.
  Without this overlay the news analyst saw only social-signal news
  (Reddit, EastMoney guba) which lag the actual events. Sonar adds a
  fresh web search at decision time and surfaces primary sources
  (Reuters, Bloomberg, SEC filings, company PR) with citation URLs.

  Merged into the existing news payload, so DeepSeek sees both
  'what happened' (Sonar primary sources) and
  'what people think about it' (Reddit/guba) in one prompt.

  Cost: ~\$0.001/decision (sonar model, max_tokens=600, temp=0.1).
  Opt-in via PERPLEXITY_API_KEY (already configured in Render).
  Unset → adapter is a silent no-op, pipeline degrades to bus-only.

  Locale-aware: zh → Chinese prompt + zh sources (路透/彭博/新华/
  东财/雪球/SEC/公告); en → English sources.

  Robustness: HTTP errors logged WARNING + returned as empty list.
  analysts.py wraps the import in try/except so even a totally
  broken perplexity module cannot crash the decision pipeline.

This is the first commit where 100% of LLM calls go through
DeepSeek-V4-Pro AND the news analyst has true realtime web context." \
  || { echo "⚠ nothing to commit"; }
echo ""

git push origin main
echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅ v83 pushed"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Render 已自动触发 redeploy (~3-5 分钟，Docker cache 命中)。"
echo "完了跑一个测试决策（任意 ticker），news analyst 输出里"
echo "应该出现 source: perplexity + 真实今日新闻 + 引用 URL，"
echo "整个 7-agent pipeline 走 deepseek-v4-pro."
echo ""
read -p "(Enter 退出)"
