#!/bin/bash
# push_v85_pre_ipo_and_honesty.command
# v85: /pre-ipo 私募市场观察站 + LLM 标语诚实化
#
# 包含两组改动：
#   1) 新页面 web/app/pre-ipo/page.tsx + Header 加入口
#   2) 诚实度修复：首页 trust strip + decision.trust.consensus
#      "DeepSeek V4 + Gemini" → "DeepSeek V4-Pro + Perplexity Sonar"
#      (Gemini 在 v51 就移除了，标语没跟上；v83-v84 加 Sonar 后也没更新)

set -e

REPO="$HOME/Desktop/trading-agents-platform"

echo "════════════════════════════════════════════════════════"
echo "  v85: /pre-ipo + LLM 标语诚实化"
echo "════════════════════════════════════════════════════════"
echo ""

cd "$REPO"
[ -f .git/index.lock ] && rm -f .git/index.lock && echo "🔓 cleared lock"

git status --short
echo ""

git add -A
git commit -m "v85: /pre-ipo Private Market Observatory + LLM stack honesty fix

Part 1 — /pre-ipo page (Private Market Observatory)
  New page tracking 6 unicorns (OpenAI, Anthropic, SpaceX, xAI,
  Anduril, Stripe) with valuation snapshot, YoY change, and a
  Concordal-style weighting recommendation. Includes a sample
  7-agent dialectic for OPENAI @ \$500B, weekly brief subscription
  CTA priced at \$99/mo, and tier-mapping into the existing 4
  subscription levels.

  Strategic positioning: Type 4 compatible extension. Research
  opinion only, no trade matching, no asset custody, no SPV or
  token issuance. Compliance perimeter footer makes these four
  boundaries explicit on every page view — both for SFC reviewers
  and to differentiate from marketplace platforms that take Type
  1/7 risk.

  Files:
    + web/app/pre-ipo/page.tsx          (NEW, ~320 lines)
    ~ web/app/components/Header.tsx     (lucide Eye import, new
                                         Markets > Private markets section)

  Roadmap:
    v86: backend /v1/pre-ipo/companies endpoint (daily 04:00 UTC refresh)
    v87: pre-IPO prompt pack + 7-agent pipeline wired to these tickers
    v88: weekly Brief cron + Resend email template
    v89: i18n polish + SEO meta

Part 2 — LLM stack honesty fix
  The landing page and decision trust banner still advertised
  'DeepSeek V4 + Gemini', which has been false since v51 removed
  Gemini and v83-v84 added Perplexity Sonar as the realtime-search
  overlay for the news analyst. Updated both surfaces:

  ~ web/app/page.tsx
      \"LLM providers live · DeepSeek V4 + Gemini\"
        → \"LLM stack · DeepSeek V4-Pro + Perplexity Sonar\"
      Comment block rewritten to describe the actual current wiring
      (DeepSeek = all 7 agents' writing/reasoning, Sonar = news
      analyst's realtime web search since DeepSeek cannot browse).

  ~ web/app/lib/i18n.tsx
      decision.trust.consensus:
        en: \"DeepSeek V4 primary · Gemini fallback\"
          → \"DeepSeek V4-Pro reasoning · Perplexity Sonar realtime search\"
        zh: \"DeepSeek V4 主推理 · Gemini 兜底\"
          → \"DeepSeek V4-Pro 推理 · Perplexity Sonar 实时检索\"

  Why this matters for an SFC-pending Type 4 application: marketing
  claims about which models are live need to match what the backend
  actually invokes. The audit log shows DeepSeek + Sonar, the trust
  banner should say the same." \
  || { echo "⚠ nothing to commit"; }
echo ""

git push origin main
echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅ v85 pushed"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Vercel 2 分钟内自动重部署。完了访问:"
echo "  • https://www.concordal.hk/pre-ipo  (新页面)"
echo "  • https://www.concordal.hk/          (trust strip 应该显示"
echo "    DeepSeek V4-Pro + Perplexity Sonar)"
echo ""
read -p "(Enter 退出)"
