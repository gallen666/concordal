# Concordal 研报格式升级设计 v90+

**学习样本**：
- 开源证券晨会纪要（国内券商）
- 毕马威中国经济观察 2026 Q2（四大宏观研究）
- Morgan Stanley *Energy Meets Compute: Power Constrains GB200/300 NVL2 Rack Deployments*（外资投行）

**目标**：把 Concordal 决策报告从"AI agent 输出"升级到"专业 sell-side research"格式 + 同步铺垫 SFC Type 4 合规要求。

---

## A. 三本研报的 12 大共同写作公式

1. **类型标签** — UPDATE / INITIATION / EARNINGS / DEEP-DIVE / TACTICAL（决定预期）
2. **主题 hashtag** — 横向 colorful tags（如 `Energy Meets Compute | Asia Pacific`）
3. **大标题强结论** — 动作动词 + 量化对象 + 状态（"Power Constrains X"）
4. **Key Takeaways 4 bullets** — 每条至少 1 个数字 + 边际变化 + 时间锚
5. **Bold 论断 + 即时数据支撑** — 段落首句 bold + 紧跟数字
6. **图表 + 数据源标注** — 每数据论断后必跟图表，"Source: X, MS Research"
7. **图编号交叉引用** — "（图 3）" 文字 + 图编号串联
8. **数字密度** — 每段 200 字内 5+ 个数字（绝对值 + 同比 + 边际）
9. **Cross-reference 链接** — "See XX Report" 链接前序研报（知识图谱）
10. **风险提示 boilerplate** — 固定 2-4 行格式
11. **Analyst Block + 证书编号** — 跨地区多分析师 + 邮箱 + 电话 + CE 编号
12. **Industry View 评级框** — 行业级 Attractive/In-Line/Cautious

---

## B. Morgan Stanley 独有的 8 大产品化设计

### B1. 不用 BUY/HOLD/SELL — 用 Relative Weighting

| Rating | 定义 |
|---|---|
| Overweight (O) | 预期 **超过** 行业 coverage universe 平均 total return |
| Equal-weight (E) | 预期 **持平** 行业平均 |
| Not-Rated (NR) | analyst **缺乏 conviction** |
| Underweight (U) | 预期 **低于** 行业平均 |

**4 大法律护城河设计**：
- `total return` ≠ price（包含 dividend）
- `vs. industry universe` ≠ vs. SP500（缩小比较范围）
- `risk-adjusted basis`（输了也不算骗）
- `12-18 months window`（短期波动免责）

### B2. Industry View 三档

| Rating | 含义 | 基准 |
|---|---|---|
| Attractive (A) | 行业表现 vs 市场基准 = 优 | 区域基准（见下） |
| In-Line (I) | 行业 = 市场 | |
| Cautious (C) | 行业 < 市场 | |

**Region Benchmark**：
- North America → **S&P 500**
- Latin America → MSCI Latin America Index
- Europe → **MSCI Europe**
- Japan → **TOPIX**
- Asia → MSCI AC Asia Pacific ex Japan

### B3. Rating Distribution 公开披露表（FINRA 强制）

| Rating | Coverage Universe | % | IBC Count | % Total IBC | % Rating Cat |
|---|---|---|---|---|---|
| O/Buy | 1,542 | 42% | 465 | 51% | 30% |
| E/Hold | 1,571 | 43% | 369 | 40% | 23% |
| U/Sell | 551 | 15% | 86 | 9% | 16% |
| **Total** | **3,667** | | **920** | | |

→ **公开"IBC 客户的 BUY 比例" vs "Coverage 总体 BUY 比例"** 对比，主动披露防 conflict 嫌疑。

### B4. 12-Month / 3-Month 业务披露（模板化）

```
Within the last 12 months, Morgan Stanley managed or co-managed a public offering of Maynilad Water Services, Inc.

In the next 3 months, Morgan Stanley expects to receive compensation for investment banking services from [20+ specific company names list]
```

→ 时间窗口 + 业务类型 + 具体公司 list（不是 "may have positions" 含糊措辞）。

### B5. Analyst Certification（FINRA / SFC 命门）

```
The following analysts hereby certify that their views about the companies and their securities discussed in this report are accurately expressed and that they have not received and will not receive direct or indirect compensation in exchange for expressing specific recommendations or views in this report: Howard Kao; Mayank Maheshwari.
```

签字声明必须有。

### B6. Tactical Idea 双层评级体系

> "Tactical Idea views on a particular stock **may be contrary to the recommendations** in research on the same stock."

**长期评级 + 短期 tactical** 可以反向共存（不同 time horizon）。

### B7. 跨境合规独立段落（17 国）

每个司法管辖区独立 disclosure paragraph：Taiwan / PRC / Brazil / Mexico / Japan / Hong Kong / Singapore / Australia / Korea / India / Canada / Germany / US / UK / SA / Saudi / UAE / Qatar / Turkey

### B8. Industry Coverage List（末页）

每篇报告末页列出 analyst 全部 coverage：

```
INDUSTRY COVERAGE: ASEAN Utilities and Infrastructure
Company (Ticker)              Rating (As Of)        Price* (06/18/2026)
Airports of Thailand (AOT.BK) O (08/25/2021)        Bt59.50
Global Power Synergy (GPSC.BK) U (09/12/2025)       Bt43.25
...
```

→ **"As Of" 日 = 上次评级变更日** = 让用户看到 analyst 的 battle log。

---

## C. Concordal 现状 vs 专业研报 — 7 大 Gap

| # | 维度 | 专业研报 | Concordal 现状 | 严重度 |
|---|---|---|---|---|
| 1 | 标题强度 | "Power Constrains X" 动作 + 量级 | "AAPL 决策分析" 中性 | 🔴 高 |
| 2 | 数字密度 | 每段 5+ 数字 + 时间锚 | 散乱 | 🔴 高 |
| 3 | 评级体系 | Overweight/Equal-weight (relative) | BUY/HOLD/SELL (absolute, 法律风险) | 🔴 高 |
| 4 | Industry View | 3 档 + 区域 benchmark | 仅 single ticker level | 🟡 中 |
| 5 | Coverage List | 末页列全部 + battle log | 无 | 🟡 中 |
| 6 | 受益标的列表 | 5-6 个 peer 明示 | Single ticker 孤立 | 🟡 中 |
| 7 | Disclosures | 1/3 篇幅合规披露 | < 5% | 🔴 高（SFC 命门）|

---

## D. SFC Type 4 合规对照表

| 要求 | MS 实践 | Concordal | SFC Type 4 |
|---|---|---|---|
| Analyst Certification | ✓ 名 + 邮 + 签字声明 | ✗ | **必须** |
| Compliance Officer | ✓ 名 + 电 + 邮 | ✗ | **必须** |
| Multi-Entity Reg # | ✓ 全列牌照号 | ✗ | **必须** |
| Conflict Policy URL | ✓ 公开 URL | ✗ | **必须** |
| 12/3 个月业务披露 | ✓ 模板化 | ✗ | **必须** |
| Rating Distribution | ✓ 季度公开 | ✗ | **必须** |
| 跨境独立 disclosure | ✓ 17 国 | ✗ | **建议（HK+CN+US 三国必须）** |
| 历史 rating change log | ✓ Coverage list | ✗ | **建议** |

---

## E. 改造 Roadmap v90 → v95

### v90 — Rating 体系合规化（🔴 P0 法律风险）

**改动**：
- 把 `recommendation: BUY/HOLD/SELL` 改成 `rating: Overweight/Equal-weight/Underweight`
- 加 `time_horizon: "12-18 months"` 字段
- 加 `benchmark: "vs. industry coverage universe"` 字段
- 加 `risk_adjusted: true`

**Prompt 改动**（manager agent）：
```diff
- "Your final recommendation: BUY / HOLD / SELL"
+ "Your final rating: Overweight / Equal-weight / Underweight
+  vs. industry coverage universe, risk-adjusted, 12-18 month horizon"
```

**工时**：2 小时（修 manager prompt + schema + frontend display）

### v91 — 标题 + Key Takeaways 强化

**改动**：
- 决策报告标题改用"动作 + 量级 + 状态"格式
- 强制生成 4 个 Key Takeaways bullet（每条 5+ 数字）

**Prompt 改动**：
```
Generate a Morgan Stanley-style headline:
- Action verb (Constrains / Drives / Reshapes / Threatens)
- Quantified object ($XX bn TAM / X% CAGR / specific product)
- State change

Then write 4 Key Takeaways bullets. Each bullet must contain:
- 1+ absolute number
- 1+ relative change (MoM/YoY/CAGR)
- 1+ time anchor (specific date or quarter)
```

**工时**：1 小时

### v92 — Industry View 评级 + Sector benchmark

**改动**：
- 决策报告加 sector-level 评级 (Attractive/In-Line/Cautious)
- A 股 vs 沪深 300，美股 vs S&P 500，港股 vs 恒指

**工时**：3 小时（修 sector agent + 加 sector benchmark fetch）

### v93 — Disclosures + Compliance footer

**改动**：
- 决策报告末页加 Disclosures Section（10 段固定模板）
- Analyst Certification 签字声明
- Conflict Policy URL（建 /policies/conflict 页）
- 跨境独立段落（HK + CN + US 3 国版本）

**工时**：4 小时

### v94 — Coverage List + Battle log

**改动**：
- 决策报告末页加 "本 analyst 历史 coverage 一览"
- 每个 ticker 显示 rating + "As Of" 上次变更日 + 当前价
- 后端加 rating change history table（与 decisions 表关联）

**工时**：4 小时

### v95 — Tactical Idea 双层评级

**改动**：
- 长期 rating（Overweight/E/U）+ 短期 Tactical Idea（Buy/Sell, 1-3m）
- 决策页 UI 分两栏显示

**工时**：3 小时

---

## F. 优先级建议

**Week 1 重点**（合规优先）：
- v90 Rating 体系（2h）
- v93 Disclosures footer（4h）
- v91 标题 + Key Takeaways（1h）

**Week 2 重点**（专业感）：
- v92 Industry View（3h）
- v94 Coverage List + Battle log（4h）

**Week 3+**（差异化）：
- v95 Tactical Idea
- 数据源脚注 URL 化
- 受益标的 peer group 自动列表

---

## G. 风险提示 boilerplate（直接复制可用）

```
风险提示：
1. 政策变化超预期 — 监管 / 财政 / 货币政策方向调整可能影响行业基本面
2. 经济变化超预期 — 宏观增长放缓或加速可能改变估值锚
3. 流动性风险 — 市场资金面变化可能放大波动
4. 估值波动风险 — 板块情绪 / 拥挤度变化可能影响短期表现
5. 数据源延迟 — 部分数据存在 T+1 / T+30 滞后，请以最新公告为准
```

---

**改造完成后预期效果**：
- 法律风险显著降低（评级 relative 而非 absolute）
- SFC Type 4 牌照审核加分项（Disclosures 完整）
- 用户体验从"AI 工具"提升到"专业研报订阅"
- Pro/Pro+/Institutional 三档定价有了真正的差异化抓手
