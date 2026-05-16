"use client";

/**
 * /report — landing for the deep-report module.
 *
 * Lets the user type any A-share (6 digits) or HK (4-5 digits / .HK)
 * ticker and jump to /report/[ticker] where the StockAlpha-style
 * 11-section + 4-extension report is generated server-side.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BookOpen, FileText, Sparkles } from "lucide-react";

const SAMPLE_TICKERS = [
  { code: "600418", name: "江淮汽车", market: "A 股" },
  { code: "600519", name: "贵州茅台", market: "A 股" },
  { code: "300750", name: "宁德时代", market: "A 股" },
  { code: "601318", name: "中国平安", market: "A 股" },
  { code: "00700", name: "腾讯控股", market: "港股" },
  { code: "09988", name: "阿里巴巴-SW", market: "港股" },
];

function classify(raw: string): "a_share" | "hk_equity" | "unsupported" {
  const t = raw.trim().toUpperCase();
  if (/^(60|68|00|30|83|87|88)\d{4}$/.test(t)) return "a_share";
  if (/^\d{4,5}(\.HK)?$/.test(t)) return "hk_equity";
  return "unsupported";
}

export default function ReportLandingPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const t = input.trim().toUpperCase();
    if (!t) return;
    const kind = classify(t);
    if (kind === "unsupported") {
      setError("仅支持 A 股 (6 位数字) 和港股 (4-5 位数字 / .HK)。如 600519, 00700, 09988.HK");
      return;
    }
    setError(null);
    router.push(`/report/${t}`);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-elev text-xs text-ink-tertiary mb-4">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          深度投研报告 · StockAlpha 风格 11 节 + 4 个 TradingAgents 专属拓展
        </div>
        <h1 className="text-4xl sm:text-5xl font-serif text-ink-primary mb-4">深度报告</h1>
        <p className="text-ink-tertiary max-w-2xl mx-auto">
          输入任意 A 股 / 港股代码，由 Gemini Pro + UniversalDataBus 在 15-40s 内生成
          11 节专业研报（三步估值 / 杜邦分解 / 逻辑链 / 三情景 / 多空辩论 / 操作计划 / 跟踪清单），
          附总线遥测审计 + 校准置信度上下文。
        </p>
      </div>

      <form onSubmit={submit} className="max-w-xl mx-auto mb-10">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(null); }}
            placeholder="输入 ticker（如 600519 / 00700 / 09988.HK）"
            className="flex-1 px-4 py-3 bg-surface-elev border border-rule-soft rounded-lg text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
            autoFocus
          />
          <button type="submit" className="btn-primary px-6">
            生成报告 <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs text-signal-sell">{error}</p>
        )}
      </form>

      <div className="mb-8">
        <p className="text-xs uppercase tracking-wider text-ink-tertiary mb-3">热门示例</p>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_TICKERS.map((s) => (
            <Link
              key={s.code}
              href={`/report/${s.code}`}
              className="px-3 py-2 bg-surface-elev hover:bg-surface-hover rounded-lg border border-rule-soft text-sm transition-colors group"
            >
              <span className="font-mono text-ink-primary">{s.code}</span>
              <span className="text-ink-tertiary mx-2">·</span>
              <span className="text-ink-secondary">{s.name}</span>
              <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-tertiary">{s.market}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12">
        <div className="p-5 bg-surface-elev rounded-lg border border-rule-soft">
          <BookOpen className="w-5 h-5 text-accent mb-3" />
          <h3 className="text-sm font-semibold text-ink-primary mb-1">11 节结构</h3>
          <p className="text-xs text-ink-tertiary leading-relaxed">
            投资概要 · 定性 · 定量 · 估值 · 资金 · 技术 · 辩论 · 风险 · 操作 · 跟踪 · 附录
          </p>
        </div>
        <div className="p-5 bg-surface-elev rounded-lg border border-rule-soft">
          <FileText className="w-5 h-5 text-accent mb-3" />
          <h3 className="text-sm font-semibold text-ink-primary mb-1">三大分析框架</h3>
          <p className="text-xs text-ink-tertiary leading-relaxed">
            三步估值定位 · 杜邦分解 · 逻辑链构建。每节附验证信号 + 失效条件 + 时间窗口。
          </p>
        </div>
        <div className="p-5 bg-surface-elev rounded-lg border border-rule-soft">
          <Sparkles className="w-5 h-5 text-accent mb-3" />
          <h3 className="text-sm font-semibold text-ink-primary mb-1">4 项独家拓展</h3>
          <p className="text-xs text-ink-tertiary leading-relaxed">
            总线遥测审计 · 校准置信度 · 跨市场覆盖 · 导出与分享
          </p>
        </div>
      </div>
    </div>
  );
}
