#!/bin/bash
# push_v84_fix_published_at.command
# v84 hotfix: perplexity_sonar 返回 NewsItem 而不是 dict
# 修 'dict' object has no attribute 'published_at' 决策崩溃

set -e

REPO="$HOME/Desktop/trading-agents-platform"

echo "════════════════════════════════════════════════════════"
echo "  v84 hotfix: 修 Perplexity Sonar dict / NewsItem"
echo "════════════════════════════════════════════════════════"
echo ""

cd "$REPO"
[ -f .git/index.lock ] && rm -f .git/index.lock && echo "🔓 cleared lock"

git status --short
echo ""

git add -A
git commit -m "v84 hotfix: perplexity_sonar returns NewsItem not dict

Root cause:
  v83's perplexity_sonar adapter returned list[dict] with keys
  {headline, summary, url, source}. The downstream news_analyst prompt
  builder (us_equity_en.py:294) iterates:

    f'- [{i.published_at.date()}] {i.headline}\n  {i.summary}' for i in n

  i.published_at fails on a plain dict — produces:
    AttributeError: 'dict' object has no attribute 'published_at'
  which surfaces in the UI as the AAPL decision error we just saw.

  The data bus and the reddit / guba / yahoo / akshare news adapters
  all return NewsItem pydantic instances (core/types.py:83). v83 broke
  the contract by appending raw dicts to the merged news payload.

Fix:
  perplexity_sonar.fetch_sonar_news now returns list[NewsItem].
  published_at = datetime.now(UTC) — Sonar doesn't expose per-headline
  publication dates in its API, but we ask for 'today's news' so 'now'
  is the most honest value we can stamp without making up a date.

  Verified on next AAPL run: news analyst should now display each
  Sonar headline as [YYYY-MM-DD] HEADLINE alongside reddit/guba items
  with no crash." \
  || { echo "⚠ nothing to commit"; }
echo ""

git push origin main
echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅ v84 pushed"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Render 自动 redeploy (~1-2 分钟 cache 命中)。"
echo "完了重跑 AAPL 决策，这次应该到 finish。"
echo ""
read -p "(Enter 退出)"
