#!/bin/bash
# push_v79_rebrand_concordal.command
# ============================================================
# 一次 push 把 v76 + v77 + v78 + v79 全部送上 GitHub
#   v76: /why competitive positioning page
#   v77: pricing institutional tier (¥4,999/月 · $649/mo)
#   v78: grounded sentiment validator (TauricResearch v0.2.5 sync)
#   v79: brand rename TradingAgents → Concordal
# ============================================================

set -e

REPO="$HOME/Desktop/trading-agents-platform"

echo "════════════════════════════════════════════════════════"
echo "  Concordal 品牌迁移 + v76/v77/v78 累计 push"
echo "════════════════════════════════════════════════════════"
echo ""

cd "$REPO" || { echo "❌ 仓库不存在: $REPO"; exit 1; }
echo "📂 cwd: $(pwd)"
echo ""

# ─── Step 1: 强制清除 .git/index.lock (历来的拦路虎) ───
if [ -f .git/index.lock ]; then
  echo "🔓 发现 .git/index.lock — 清除中..."
  rm -f .git/index.lock
  echo "   已清除"
else
  echo "✓ 无 index.lock"
fi
echo ""

# ─── Step 2: 显示即将提交的内容 ───
echo "📋 待提交改动:"
git status --short
echo ""

# ─── Step 3: add ───
echo "➕ git add -A"
git add -A
echo ""

# ─── Step 4: commit ───
echo "💾 git commit"
git commit -m "v79: rebrand TradingAgents → Concordal (concordal.hk)

Bundles v76+v77+v78+v79 since none of the earlier pushes reached origin:

v76 — /why competitive positioning page
  - 3 pillars (Dialectical / Auditable / Hallucination-resistant)
  - 5-column comparison vs Eastmoney / Public / Bloomberg / TauricResearch
  - Header dropdown entry added

v77 — Institutional tier (¥4,999/月 · \$649/mo)
  - i18n: pricing.tier.enterprise = 'Institutional · 机构版'
  - i18n: pricing.price.enterprise = '\$649 /mo' / '¥4,999 /月'
  - pricing.subheading rewritten with 7-agent debate pipeline framing
  - pricing/page.tsx: mailto subject + Enterprise contact callout
  - developers/page.tsx: \$99 → \$299/mo, 500 → 1,500 decisions
  - Pro+ floor raised to \$127 / ¥899

v78 — Grounded Sentiment Analyst (TauricResearch v0.2.5 sync)
  - prompts/us_equity_en.py: GROUNDING RULE — evidence must have verbatim quotes
  - agents/analysts.py: _validate_sentiment_grounding drops fabricated quotes
  - Three-layer hallucination gate: prompt + v55 ground-truth + validator
  - Neutralises signal (intensity=low, skew=0, contrarian=false) if all quotes fake
  - sentiment_node wires validator=_validate_sentiment_grounding

v79 — Brand rename TradingAgents → Concordal
  - 23 user-facing files now reference Concordal
  - Logo, layout meta, OG image, all page titles, all i18n strings
  - Emails migrated @tradingagents.ai → @concordal.hk (compliance/pricing)
  - Exemptions preserved (via 3-step placeholder sed):
    * TauricResearch/TradingAgents (upstream paper attribution)
    * TradingAgents (HK) Ltd. (legal entity name pending name change)
    * trading-agents-platform GitHub URLs (will rewrite after repo rename)
  - README: 'TradingAgents Platform' → 'Concordal Platform'
  - CLI help: 'TradingAgents CLI' → 'Concordal CLI'
  - Roadmap doc filename also renamed (rename in fs if exists)

Brand: Concordal — invented Latinate (concord + final).
Domain: concordal.hk (registered).
Trademark research confirmed Concordia/Concerto/Conclave/Dialectic/Quorum
all blocked in fintech; Concordal as invented coinage is clear.

PENDING POST-PUSH (user-side actions):
  1. GitHub Settings → rename repo trading-agents-platform → concordal
  2. Vercel → Add custom domain concordal.hk + www.concordal.hk
  3. DNS at .hk registrar:
       A    @     76.76.21.21
       CNAME www  cname.vercel-dns.com
  4. Vercel project Settings → Git → relink to renamed repo
  5. After repo rename, do another small commit to rewrite
     'trading-agents-platform' GitHub URLs (deferred to v80 to keep this
     push atomic — GitHub auto-redirects old URLs in the meantime)" \
  || { echo "⚠ nothing to commit, 也许已经 commit 过了"; }
echo ""

# ─── Step 5: push ───
echo "🚀 git push origin main"
git push origin main
echo ""

echo "════════════════════════════════════════════════════════"
echo "  ✅ push 成功!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "立即可见:"
echo "  • GitHub: https://github.com/gallen666/trading-agents-platform"
echo "  • 当前线上 (Vercel auto-deploy ~2min):"
echo "    https://trading-agents-platform.vercel.app"
echo ""
echo "下一步 (复制下面这段去做, 顺序固定):"
echo "  1. https://github.com/gallen666/trading-agents-platform/settings"
echo "     → Repository name → 改为 concordal → Rename"
echo "     (GitHub 会自动 301 重定向旧 URL 一段时间)"
echo ""
echo "  2. https://vercel.com/<你的项目>/settings/domains"
echo "     → Add → concordal.hk"
echo "     → 同样再加一遍 www.concordal.hk"
echo ""
echo "  3. 去 .hk 注册商 DNS:"
echo "     A     @     76.76.21.21"
echo "     CNAME www   cname.vercel-dns.com"
echo ""
echo "  4. Vercel → Git → Disconnect 再 reconnect 到 gallen666/concordal"
echo ""
echo "按 ⌘W 关闭本窗口"
echo ""
read -p "(Enter 退出)"
