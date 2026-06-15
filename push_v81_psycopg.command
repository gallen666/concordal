#!/bin/bash
# push_v81_psycopg.command
# v81: 修 v80 后端 deploy fail —— Dockerfile 加 psycopg[binary]
# 原因: db.py:50 当 DATABASE_URL 非空时 `import psycopg`，但 Dockerfile pip
# install 列表里没装。v80 first deploy 之所以成功是因为当时还没有 DATABASE_URL
# 环境变量（IS_POSTGRES=False，跳过 psycopg import）。一加 DATABASE_URL 触发
# 重部署时 import 就炸了 ModuleNotFoundError: No module named 'psycopg'。

set -e

REPO="$HOME/Desktop/trading-agents-platform"

echo "════════════════════════════════════════════════════════"
echo "  v81: 修后端 Postgres deploy — Dockerfile 加 psycopg"
echo "════════════════════════════════════════════════════════"
echo ""

cd "$REPO"
[ -f .git/index.lock ] && rm -f .git/index.lock && echo "🔓 cleared lock"

git status --short
echo ""

git add -A
git commit -m "v81: fix backend deploy — add psycopg[binary] to Dockerfile

Root cause:
  api/db.py:50 conditionally imports psycopg when DATABASE_URL is set:

    DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
    IS_POSTGRES = bool(DATABASE_URL)
    if IS_POSTGRES:
        import psycopg

  But the Dockerfile's pip install list never included psycopg.
  v66 (#191) added the dual-backend code but treated psycopg as an
  optional dependency — fine for local SQLite dev, but the moment
  DATABASE_URL is configured in production the import crashes.

Trigger:
  v80 first deploy at 16:03 succeeded because no DATABASE_URL → SQLite
  path → psycopg import skipped.
  At 20:46 we configured DATABASE_URL pointing at concordal-db
  (Render Postgres internal hostname pg-d8na3m1kh4rs73f1ec90-a).
  Render triggered an automatic redeploy, IS_POSTGRES became True,
  api/db.py:50 tried to import psycopg, ModuleNotFoundError, exit 1.

Fix:
  Dockerfile pip install list += 'psycopg[binary]>=3.1'

  Using the [binary] extra so we get pre-compiled wheels — no need
  to install libpq-dev or build-essential at image build time.

After this lands, Render auto-rebuilds the Docker image with psycopg
included, IS_POSTGRES stays True, the connection to concordal-db opens
on the Singapore private network, /v1/health flips from 'degraded' to
'ok' (the ephemeral-filesystem warning disappears), and user data
finally survives redeploys." \
  || { echo "⚠ nothing to commit"; }
echo ""

git push origin main
echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅ v81 pushed"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Render 会自动重建 Docker 镜像 (~5-10 分钟)。重建期间后端不可达。"
echo "建议: 等 8 分钟后去看 Render Events，应该显示 Deploy live for v81。"
echo "然后 fetch https://trading-agents-platform.onrender.com/v1/health"
echo "看 ephemeral filesystem warning 是否消失、status 从 degraded → ok"
echo ""
read -p "(Enter 退出)"
