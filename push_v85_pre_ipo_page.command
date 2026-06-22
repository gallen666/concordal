#!/bin/bash
# push_v85_pre_ipo_page.command
# v85: 新增 /pre-ipo 页面 (Private Market Observatory) + Header nav 入口

set -e

REPO="$HOME/Desktop/trading-agents-platform"

echo "════════════════════════════════════════════════════════"
echo "  v85: /pre-ipo 私募市场观察站"
echo "════════════════════════════════════════════════════════"
echo ""

cd "$REPO"
[ -f .git/index.lock ] && rm -f .git/index.lock && echo "🔓 cleared lock"

git status --short
echo ""

git add -A
git commit -m "v85: /pre-ipo Private Market Observatory + Header nav entry

New page tracking 6 unicorns (OpenAI, Anthropic, SpaceX, xAI,
Anduril, Stripe) with valuation snapshot, YoY change, and a
Concordal-style weighting recommendation. Includes a sample
7-agent dialectic for OPENAI @ \$500B, weekly brief subscription
CTA priced at \$99/mo, and tier-mapping into the existing 4
subscription levels.

Strategic positioning:
  - Type 4 compatible extension. Research opinion only, no trade
    matching, no asset custody, no SPV or token issuance. Compliance
    perimeter footer makes these four boundaries explicit on every
    page view — both for SFC reviewers and to differentiate from
    marketplace platforms that take Type 1/7 risk.
  - Companies covered span AI (3), space (1), defense (1), fintech
    (1). Valuation figures sourced from public reporting (Forbes,
    Reuters, Crunchbase tenders, SEC EDGAR S-1) as of 2026-06.

Files:
  + web/app/pre-ipo/page.tsx          (NEW, ~320 lines)
  ~ web/app/components/Header.tsx     (lucide Eye import, new
                                       Markets > Private markets section)

Follow-up roadmap:
  v86: backend /v1/pre-ipo/companies endpoint (daily 04:00 UTC refresh)
  v87: pre-IPO prompt pack + 7-agent pipeline wired to these tickers
  v88: weekly Brief cron + Resend email template
  v89: i18n polish + SEO meta" \
  || { echo "⚠ nothing to commit"; }
echo ""

git push origin main
echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅ v85 pushed"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Vercel 2 分钟内自动重部署。完了访问 https://www.concordal.hk/pre-ipo"
echo "或 Header > 市场 > 私募市场 > Pre-IPO 观察站。"
echo ""
read -p "(Enter 退出)"
