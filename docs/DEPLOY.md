# 部署指南：试运营上线（半天版）

目标：把代码从 GitHub 部署到能给真人访问的网址，进入 closed beta 试运营。

## 总览

```
你的电脑                 GitHub                    Vercel              Railway
   │                       │                         │                    │
   │  git push main ──────►│                         │                    │
   │                       │  webhook ──────────────►│ build & deploy     │
   │                       │                         │ (前端)             │
   │                       │  webhook ──────────────────────────────────►│ build & deploy
   │                       │                                              │ (后端)
   │                                                                      │
                           用户浏览器  ──HTTPS──►  app.example.com  ──API──►  api.example.com
```

总耗时（已熟悉 Vercel/Railway 的话）：**约 90 分钟**。

---

## 第 1 步：把代码推到 GitHub（5 分钟）

```bash
cd trading-agents-platform
git init
git add .
git commit -m "feat: initial trading agents platform"
gh repo create trading-agents-platform --private --source=. --push
# 或手动: gh repo create -> 在 GitHub 网页上 New repo -> 按提示 git remote add + push
```

如果不用 `gh` CLI，去 github.com 新建私有 repo，然后：

```bash
git remote add origin git@github.com:<你>/trading-agents-platform.git
git branch -M main
git push -u origin main
```

GitHub Actions 会自动跑 `.github/workflows/ci.yml`，看到 ✅ 才往下走。

---

## 第 2 步：部署后端到 Railway（30 分钟）

1. 注册 [railway.app](https://railway.app)（用 GitHub 账号登录）。
2. **New Project → Deploy from GitHub repo**，选你的 repo。
3. Railway 自动检测 `Dockerfile` 和 `railway.toml`，开始构建。
4. 部署完成后会给你一个域名，类似 `https://trading-agents-api-production.up.railway.app`。
5. 进入 **Variables** 标签页，配置：

   | 变量名                      | 值（试运营）                                                                |
   | --------------------------- | --------------------------------------------------------------------------- |
   | `TA_ENV`                    | `production`                                                                |
   | `TA_MODE`                   | `mock`（默认）；当 `TA_REAL_LLM_USERS` 命中的用户来访时会切真实             |
   | `TA_API_BASE_URL`           | Railway 给你的 URL                                                          |
   | `TA_ALLOWED_ORIGINS`        | `https://your-frontend.vercel.app`（先放占位，前端上线后再改）              |
   | `TA_JWT_SECRET`             | **运行 `python -c "import secrets; print(secrets.token_hex(32))"` 复制输出** |
   | `TA_JWT_TTL_HOURS`          | `168`（7天）                                                                |
   | `TA_REQUIRE_INVITE`         | `true`                                                                      |
   | `TA_INVITE_CODES`           | `alice2026:alice@x.com,bob2026:bob@y.com,trial:*`                           |
   | `TA_REAL_LLM_USERS`         | （留空，等你需要时填邮箱列表，逗号分隔）                                    |
   | `TA_REAL_DATA_USERS`        | （同上）                                                                    |
   | `TA_RATE_LIMIT_PER_MIN`     | `10`                                                                        |
   | `TA_EMERGENCY_STOP`         | `false`                                                                     |
   | `TA_LOG_LEVEL`              | `INFO`                                                                      |
   | `TA_ADMIN_TOKEN`            | 另一段随机 token，用于 `/v1/waitlist/_admin/count`                          |
   | `TA_DATA_DIR`               | `/app/.tradingagents`（Dockerfile 默认值，可不设）                          |

   想接真实 LLM 时再加：
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `TA_MODEL_FAST` `TA_MODEL_MID` `TA_MODEL_DEEP`

6. **Settings → Networking → Generate Domain** 拿到固定域名，或绑你自己的子域名（如 `api.yourdomain.com`）。
7. 验证：
   ```bash
   curl https://<your-railway-domain>/v1/health
   # {"status":"ok","mode":"mock","emergency_stop":false,...}
   ```

---

## 第 3 步：部署前端到 Vercel（20 分钟）

1. 注册 [vercel.com](https://vercel.com)（用 GitHub 账号）。
2. **New Project**，选你的 repo。
3. **Root Directory** 设成 `web`（不是 repo 根目录）。
4. **Environment Variables** 加一项：
   - `NEXT_PUBLIC_API` = Railway 给你的后端 URL（如 `https://trading-agents-api-production.up.railway.app`）
5. Deploy。
6. 部署完成会给你一个域名，类似 `https://trading-agents.vercel.app`。
7. 回到 Railway，把 `TA_ALLOWED_ORIGINS` 更新为 Vercel 给的域名（含 `https://` 前缀，无尾斜杠）。**Redeploy** 后端。
8. 测试：访问 Vercel 域名，看到 landing page；点 "Redeem"，输入 `trial` + 任意邮箱，应该能进 watchlist 页面。

---

## 第 4 步：邀请 + 监控（持续）

**发邀请码**：

只需要在 Railway 的 `TA_INVITE_CODES` 里加一条 `<code>:<email>`（或 `<code>:*` 任意邮箱可用），保存后等几秒生效，无需重启。

```
alice2026:alice@x.com,bob2026:bob@y.com,demo:*,gallen:gallen@yourdomain.com
```

**升级用户到真实 LLM**：

把邮箱加到 `TA_REAL_LLM_USERS`：
```
TA_REAL_LLM_USERS=gallen@yourdomain.com,alice@x.com
```
保存后这两个用户的请求会走真 OpenAI / Anthropic（其余用户继续走 Mock）。

**看 waitlist 数量**：
```bash
curl "https://<your-railway-domain>/v1/waitlist/_admin/count?token=$TA_ADMIN_TOKEN"
```

**紧急熔断**（如果某天 LLM 出问题或被监管约谈）：

把 `TA_EMERGENCY_STOP` 设为 `true`，所有 `/v1/decisions` 返回 503，UI 上用户会看到 "Decision engine is temporarily disabled"，前端继续可访问。

---

## 第 5 步：成本预估（试运营第一个月）

| 项                     | 预估                                                            |
| ---------------------- | --------------------------------------------------------------- |
| Vercel (Hobby)         | $0（免费够用，前端流量 < 100GB/月）                             |
| Railway (Hobby)        | ~$5（一直跑的 Hobby plan）                                      |
| 域名（可选）           | $10-15/年                                                       |
| OpenAI + Anthropic     | $0~$50（取决于 alpha 用户调用频率；前期都走 Mock 时为 $0）      |
| Sentry (Developer)     | $0（5K 事件免费）                                               |
| **合计**               | **$5-70/月**                                                    |

走出 50 个 alpha 用户、每天每人 5 次决策、全部走真实 LLM 模型时，token 成本会冲到 ~$300-600/月。这时候要做的：开 ticker 缓存命中率监控、降到 1 轮辩论、把分析师切到便宜模型。

---

## 第 6 步：上线前自查清单

- [ ] `/v1/health` 返回 200
- [ ] CORS 已收紧到 Vercel 域名（不是 `*`）
- [ ] `TA_JWT_SECRET` 是随机 32 字节 hex（不是 `dev-secret-change-me`）
- [ ] `TA_REQUIRE_INVITE=true`
- [ ] 至少注册了一个真人邀请码
- [ ] Vercel 前端访问无报错
- [ ] Landing page 上免责声明可见
- [ ] `/disclaimer` 页能打开
- [ ] CI 在 main 分支是绿的
- [ ] Sentry DSN（可选）已配置，能收到测试错误
- [ ] 你的 `gh repo` 是 **private**

---

## 一些常见坑

**Q：Vercel build 失败说找不到 `lib/api`**
A：Root Directory 一定要设成 `web`，不是 repo 根目录。

**Q：前端调用后端 CORS 报错**
A：Railway 的 `TA_ALLOWED_ORIGINS` 必须**完全匹配**前端 URL，含 `https://`，不含尾斜杠，不含 path。改完要 Redeploy 后端才生效。

**Q：访问 `/redeem` 用 trial 进去后再访问 `/watchlist` 又被踢回 redeem**
A：localStorage 没拿到 JWT。打开浏览器 Console，看 `localStorage.getItem('ta_jwt')` 是不是 null。如果是 null，看 redeem 时 Network 里 `/v1/auth/redeem` 的响应体。

**Q：Mock 模式下点 "Run" 永远转圈**
A：后台任务没起来。看 Railway logs，搜 `decision job failed`。

**Q：要绑自定义域名**
A：Vercel + Railway 都支持 free 自定义域。买完域名（Cloudflare $10/年），在 Vercel 加 `app.yourdomain.com`、Railway 加 `api.yourdomain.com`，按平台提示加 CNAME 记录即可。

---

## 之后的迁移路线

试运营顺利、用户超过 50 之后该做：

1. **Postgres 替换 in-memory job/watchlist**：用 Railway 自带的 Postgres add-on 或 Supabase；这一步是从"演示"到"产品"的关键。
2. **Celery / Arq + Redis 替换 in-process BackgroundTasks**：跨实例可见、任务可重试。
3. **Clerk / Auth0 替换自己写的 JWT**：当 SSO、密码重置、双因子等需求出现时。
4. **Cloudflare 在 Vercel/Railway 前面**：DDoS 防护 + 边缘缓存 + WAF。
5. **第二个市场（推荐加密）**：用 §"Add a new market" 配方做 CoinGecko 适配器。
6. **观测加深**：Grafana + Prometheus；看 LLM 平均时延、缓存命中率、token 成本/决策。

不要在试运营第一周做这些。先让真人用。
