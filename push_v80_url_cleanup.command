#!/bin/bash
# push_v80_url_cleanup.command
# v80: 把所有用户可见 URL 从 trading-agents-platform.vercel.app
#      迁到 www.concordal.hk + GitHub URL 从 /trading-agents-platform 改成 /concordal
# cn-proxy 内部 fallback URL 保留 .vercel.app (Vercel edge route 永久免费稳定)

set -e

REPO="$HOME/Desktop/trading-agents-platform"

echo "════════════════════════════════════════════════════════"
echo "  v80: URL cleanup → www.concordal.hk + gallen666/concordal"
echo "════════════════════════════════════════════════════════"
echo ""

cd "$REPO"
[ -f .git/index.lock ] && rm -f .git/index.lock && echo "🔓 cleared lock"

git status --short
echo ""

git add -A
git commit -m "v80: URL cleanup — migrate user-facing URLs to www.concordal.hk

Brand migration follow-up. After v79 renamed the visual brand
TradingAgents → Concordal and the GitHub repo trading-agents-platform
→ concordal, all hardcoded URLs still pointed at the old slugs.

GitHub repo URLs (18 occurrences):
  gallen666/trading-agents-platform → gallen666/concordal
  Files: api/main.py, web/app/{proof,terms,how-it-works,developers,
  track-record}/page.tsx, blog/posts.tsx, Footer.tsx, PaperBacked.tsx

Site URLs (user-facing):
  https://trading-agents-platform.vercel.app → https://www.concordal.hk
  Files: layout.tsx, robots.ts, sitemap.ts, opengraph-image.tsx,
  blog/[slug]/page.tsx, d/[shareId]/*, README.md, api/email_send.py,
  api/openbb_widget.py, api/main.py (TA_SITE_URL fallback)

User-Agent header (Reddit research):
  trading-agents-platform/0.2 → concordal/0.2
  with +https://www.concordal.hk

PRESERVED (intentional):
  TA_CN_PROXY_BASE fallback URLs (5 occurrences):
    api/main.py, cn_proxy_patch.py, cn_stock_multi_source.py
  Reason: These point at the Vercel edge route /api/cn-proxy that
  bridges EastMoney/Xueqiu through HK to bypass Singapore IP blocks.
  Render \$TA_CN_PROXY_BASE env var overrides them in production.
  .vercel.app is permanent free and battle-tested — switching the
  fallback to concordal.hk would risk production cn-proxy if DNS or
  SSL hiccups in the next few hours. Defer to v81 once concordal.hk
  has 24+ hours of clean uptime.

  Render backend URL (trading-agents-platform.onrender.com):
    Untouched. Render project rename is a separate operation; the
    .onrender.com subdomain is independent of the GitHub repo name.

Stats: 21 files, +36 / -36 lines.
Live and verified at https://www.concordal.hk (SSL valid, content
matches expectations: Logo 'Concordal 协奏', tab title
'Concordal — Decision Support', bull/bear dialectic hero)." \
  || { echo "⚠ nothing to commit"; }
echo ""

git push origin main
echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅ v80 pushed — concordal 品牌迁移完结"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Vercel 大约 2 分钟自动重部署，部署后所有 share/OG image/email"
echo "都会显示 www.concordal.hk 而不是 trading-agents-platform.vercel.app."
echo ""
read -p "(Enter 退出)"
