"""OpenBB Workspace custom-widget integration.

OpenBB Workspace (https://pro.openbb.co, also self-hosted) supports
third-party widgets via a public manifest endpoint. Once a user adds our
backend URL in their Workspace settings, our widgets show up in their
catalog and can be dragged into any dashboard.

Spec we're targeting (OpenBB custom backend protocol):
    GET  /openbb/widgets.json    -> array of widget definitions
    GET  /openbb/<widget_id>     -> widget data (markdown/table/JSON)

Widget definition shape (simplified — see https://docs.openbb.co):
    {
      "name": "Display name",
      "description": "Tooltip text",
      "category": "AI Analysis",
      "endpoint": "trading-agents-decision",   # URL path under /openbb/
      "type": "markdown" | "table" | "metric",
      "params": [
        {"paramName": "ticker", "type": "ticker", "value": "AAPL",
         "label": "Ticker", "description": "Stock symbol"}
      ]
    }

Design choices:
  * Public endpoints (no JWT). OpenBB Workspace doesn't carry our auth.
    We rate-limit by client IP instead, and force mock mode for any
    request not coming from a known origin (so quota abuse can't drain
    our Gemini key).
  * Synchronous (no background job IDs) — OpenBB widgets fetch data
    once per render. We rely on the existing TickerCache so repeat
    renders are <100ms.
  * Markdown output for the decision widget — gives OpenBB users a
    formatted analyst report card. Tables would lose the rationale.
"""

from __future__ import annotations

import logging
import os
from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse, PlainTextResponse

from trading_agents.adapters import get_adapter
from trading_agents.adapters.macro_openbb import fetch_macro_snapshot
from trading_agents.cache.ticker_cache import TickerCache
from trading_agents.core.graph import run_decision

log = logging.getLogger("ta.openbb")

# `include_in_schema=False` keeps these endpoints out of /docs and the
# auto-generated OpenAPI JSON — they're a presentation layer for OpenBB
# Workspace, not part of the public developer API surface.
router = APIRouter(
    prefix="/openbb",
    tags=["openbb-workspace"],
    include_in_schema=False,
)

# Re-use the same cache singleton that /v1/decisions uses, so OpenBB calls
# get warm-cached results from frontend runs and vice versa.
_cache = TickerCache()


# ---------------------------------------------------------------------------
# Tiny IP-based rate limit (OpenBB calls don't carry user_id)
# ---------------------------------------------------------------------------

# Per-IP limit + a global decision-cost ceiling. Real LLM calls are now
# routed through these endpoints (we removed the forced-mock downgrade),
# so two separate guards: 5/hour per IP, AND a global ceiling that
# prevents a swarm of new IPs from drowning our LLM budget.
_LIMIT_PER_HOUR = int(os.environ.get("TA_OPENBB_LIMIT_PER_HOUR", "5"))
_GLOBAL_DECISIONS_PER_HOUR = int(os.environ.get("TA_OPENBB_GLOBAL_PER_HOUR", "60"))
_ip_buckets: dict[str, list[float]] = {}
_global_decisions_log: list[float] = []


def _rate_limit_ip(request: Request) -> None:
    """Per-IP throttle for all OpenBB widget endpoints."""
    import time
    ip = request.client.host if request.client else "anonymous"
    now = time.time()
    bucket = _ip_buckets.setdefault(ip, [])
    cutoff = now - 3600
    bucket[:] = [t for t in bucket if t > cutoff]
    if len(bucket) >= _LIMIT_PER_HOUR:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"OpenBB widget rate limit ({_LIMIT_PER_HOUR}/hour per IP). "
            "Try again later or self-host the backend (it's open source).",
        )
    bucket.append(now)


def _global_decision_budget() -> None:
    """Hard ceiling on the rate of real-LLM decisions served via OpenBB
    widgets, regardless of IP. Each decision costs us ~$0.05-$0.20, so
    `_GLOBAL_DECISIONS_PER_HOUR=60` caps the worst-case burn at roughly
    $3-$12/hour. Anyone past the ceiling sees a friendly 429 nudging
    them to self-host or upgrade to Pro for their own quota."""
    import time
    now = time.time()
    cutoff = now - 3600
    # Trim in place — keep recent entries only
    _global_decisions_log[:] = [t for t in _global_decisions_log if t > cutoff]
    if len(_global_decisions_log) >= _GLOBAL_DECISIONS_PER_HOUR:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "OpenBB-widget global decision budget exhausted for this hour. "
            "Upgrade to a paid tier (/pricing) for your own quota, "
            "or self-host the backend.",
        )
    _global_decisions_log.append(now)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _auto_market(ticker: str) -> str:
    """Reuse the same simple routing as /v1/decisions:
       6 digits => A-share, otherwise US equity."""
    s = (ticker or "").strip()
    if len(s) == 6 and s.isdigit():
        return "a_share"
    return "us_equity"


def _format_decision_markdown(trace: dict[str, Any], locale: str = "en") -> str:
    """Render a DecisionTrace dict as compact markdown for OpenBB display."""
    d = trace.get("decision") or {}
    side = d.get("side", "?")
    weight = d.get("target_weight", 0.0)
    conf = d.get("confidence", 0.0)
    rationale = d.get("rationale", "")
    risk = d.get("risk_notes", "")
    flags = d.get("flags") or []

    asof = trace.get("asof", "?")
    ticker = trace.get("ticker", "?")
    cost = trace.get("total_cost_usd", 0.0)

    # Pick emoji based on side for visual scan
    side_emoji = {
        "BUY": "🟢", "OVERWEIGHT": "🟢",
        "HOLD": "⚪",
        "UNDERWEIGHT": "🔴", "SELL": "🔴",
    }.get(side, "•")

    lines: list[str] = []
    lines.append(f"## {side_emoji} **{ticker}** — {side}")
    lines.append("")
    lines.append(
        f"| Target weight | Confidence | LLM cost | As of |\n"
        f"|---|---|---|---|\n"
        f"| `{weight:+.2%}` | `{conf*100:.0f}%` | `${cost:.4f}` | `{asof}` |"
    )
    lines.append("")
    if rationale:
        lines.append("### Rationale")
        lines.append(rationale)
        lines.append("")
    if risk:
        lines.append("### Risk notes")
        lines.append(risk)
        lines.append("")
    if flags:
        lines.append("**Flags:** " + ", ".join(f"`{f}`" for f in flags))
        lines.append("")

    # Per-analyst summary row
    reports = trace.get("analyst_reports") or []
    if reports:
        lines.append("### Analyst snapshots")
        lines.append("")
        for r in reports:
            kind = r.get("analyst", "?").title()
            sigs = r.get("signals") or {}
            keyvals = ", ".join(f"`{k}`={v}" for k, v in list(sigs.items())[:5])
            lines.append(f"- **{kind}** — {keyvals or 'no signals'}")
        lines.append("")

    # Researcher debate synthesis (skip the full transcript — OpenBB users
    # can click through to our website if they want it).
    deb = trace.get("researcher_debate") or {}
    syn = deb.get("synthesis")
    if syn:
        lines.append("### Bull/Bear synthesis")
        lines.append(syn)
        lines.append("")

    lines.append("---")
    lines.append(
        "_Decision support, not investment advice. "
        "Powered by [trading-agents-platform](https://www.concordal.hk)._"
    )
    return "\n".join(lines)


def _format_macro_markdown(snap_dict: dict[str, Any]) -> str:
    """Render a MacroSnapshot dict as a compact markdown table."""
    asof = snap_dict.get("asof", "?")
    region = snap_dict.get("region", "?")

    rows: list[tuple[str, Any, str]] = [
        ("CPI YoY",         snap_dict.get("cpi_yoy"),           "%"),
        ("Core CPI YoY",    snap_dict.get("core_cpi_yoy"),      "%"),
        ("PCE YoY",         snap_dict.get("pce_yoy"),           "%"),
        ("Unemployment",    snap_dict.get("unemployment_rate"), "%"),
        ("Policy rate",     snap_dict.get("policy_rate"),       "%"),
        ("2Y yield",        snap_dict.get("yield_2y"),          "%"),
        ("10Y yield",       snap_dict.get("yield_10y"),         "%"),
        ("10Y-2Y spread",   snap_dict.get("yield_curve_2y10y"), "bp"),
        ("GDP YoY",         snap_dict.get("gdp_yoy"),           "%"),
        ("ISM PMI (Mfg)",   snap_dict.get("ism_pmi_manufacturing"), ""),
        ("ISM PMI (Svc)",   snap_dict.get("ism_pmi_services"),     ""),
        ("Retail sales YoY", snap_dict.get("retail_sales_yoy"), "%"),
        ("M2 YoY",          snap_dict.get("m2_yoy"),            "%"),
        ("DXY level",       snap_dict.get("dxy_level"),         ""),
    ]

    out: list[str] = [f"## Macro snapshot — {region} (as of {asof})", ""]
    out.append("| Indicator | Value |\n|---|---|")
    for label, val, unit in rows:
        if val is None:
            continue
        if unit == "bp":
            v = f"{val*100:+.0f} bp"
        elif unit == "%":
            v = f"{val:+.2f}%"
        else:
            v = f"{val:.2f}"
        out.append(f"| {label} | `{v}` |")
    out.append("")

    sources = snap_dict.get("sources") or []
    if sources:
        out.append("**Sources:** " + ", ".join(sources))
        out.append("")

    notes = snap_dict.get("notes")
    if notes:
        out.append(f"_{notes}_")

    return "\n".join(out)


# ---------------------------------------------------------------------------
# Manifest endpoint
# ---------------------------------------------------------------------------


@router.get("/widgets.json")
def widgets_manifest() -> JSONResponse:
    """Lists widgets exposed to OpenBB Workspace.

    OpenBB users add our backend in Settings → Custom Backend, point at
    `<our-host>/openbb`, and these widgets appear in the widget catalog.
    """
    widgets = [
        {
            "name": "TradingAgents — 7-Agent Decision",
            "description": (
                "Full multi-agent dialectical analysis: Fundamentals + Sentiment "
                "+ News + Technical + Macro analysts → Bull vs Bear debate → "
                "Trader plan → Risk Committee (3 views) → Fund Manager final "
                "call. Runs ~60s on first call (then cached)."
            ),
            "category": "AI Analysis",
            "endpoint": "decision",
            "type": "markdown",
            "params": [
                {
                    "paramName": "ticker",
                    "type": "ticker",
                    "value": "AAPL",
                    "label": "Ticker",
                    "description": "US equity (e.g. AAPL) or A-share 6-digit code (e.g. 600519)",
                },
            ],
            "refetchInterval": 0,  # don't auto-refetch — decisions are expensive
            "gridData": {"w": 24, "h": 16},
        },
        {
            "name": "TradingAgents — Macro Brief",
            "description": (
                "Top-down macro snapshot (CPI, PCE, unemployment, Fed funds, "
                "yield curve, PMI, M2, DXY) sourced via OpenBB SDK or FRED REST. "
                "Updated daily."
            ),
            "category": "AI Analysis",
            "endpoint": "macro",
            "type": "markdown",
            "params": [
                {
                    "paramName": "region",
                    "type": "text",
                    "value": "US",
                    "label": "Region",
                    "description": "US | CN | EU",
                    "options": [
                        {"value": "US", "label": "United States"},
                        {"value": "CN", "label": "China"},
                        {"value": "EU", "label": "Euro area"},
                    ],
                },
            ],
            "refetchInterval": 3600 * 1000,  # ms — OK to refresh hourly
            "gridData": {"w": 12, "h": 12},
        },
        {
            "name": "TradingAgents — Track Record",
            "description": (
                "Realised performance of the agent strategy vs Buy & Hold "
                "across the most recent backtest run. Loads from public "
                "reports/latest.json on GitHub."
            ),
            "category": "AI Analysis",
            "endpoint": "track-record",
            "type": "markdown",
            "params": [],
            "refetchInterval": 3600 * 1000,
            "gridData": {"w": 18, "h": 12},
        },
    ]

    # OpenBB allows an array OR an object — we use array form, which is the
    # documented default. Always include CORS-friendly headers since the
    # global CORSMiddleware allow_origin_regex covers OpenBB origins.
    return JSONResponse(
        content=widgets,
        headers={"Cache-Control": "public, max-age=300"},
    )


# ---------------------------------------------------------------------------
# Widget data endpoints
# ---------------------------------------------------------------------------


@router.get("/decision", response_class=PlainTextResponse)
def widget_decision(
    request: Request,
    ticker: str = Query(..., description="US equity (AAPL) or A-share 6-digit code"),
    locale: str = Query("en", pattern="^(en|zh)$"),
) -> str:
    """OpenBB widget: full 7-agent decision rendered as markdown.

    Always uses the **mock** LLM tier for OpenBB callers — they're not on
    our real-LLM allowlist and we don't want OpenBB traffic to burn our
    Gemini quota. Real-LLM users should call /v1/decisions directly with
    their auth token.
    """
    _rate_limit_ip(request)
    market = _auto_market(ticker)
    asof = date.today()

    # Cache hit? Free, no budget impact.
    cached = _cache.get(ticker.upper(), asof, market)
    if cached:
        return _format_decision_markdown(cached.model_dump(mode="json"), locale=locale)

    # Cache miss => we're about to spend real LLM money. Check the
    # global budget BEFORE firing the pipeline.
    _global_decision_budget()

    # OpenBB widget calls run with the same real-LLM pipeline as the
    # website. IP-rate-limit (~20/hour) + the LLM provider chain itself
    # are the cost guards — we no longer downgrade to mock here.
    try:
        trace = run_decision(
            ticker=ticker.upper(),
            asof=asof,
            market=market,
            debate_rounds=1,
            locale=locale,
        )
    except Exception as e:
        log.exception("OpenBB decision failed")
        return f"## Error\n\nFailed to run decision for `{ticker}`: {e}"

    _cache.put(trace, market)
    return _format_decision_markdown(trace.model_dump(mode="json"), locale=locale)


@router.get("/macro", response_class=PlainTextResponse)
def widget_macro(
    request: Request,
    region: str = Query("US", pattern="^(US|CN|EU)$"),
) -> str:
    """OpenBB widget: macro snapshot table (FRED/IMF via OpenBB SDK)."""
    _rate_limit_ip(request)
    snap = fetch_macro_snapshot(date.today(), region=region)
    if snap is None:
        return (
            f"## Macro snapshot — {region}\n\n"
            "_No data available. Set `FRED_API_KEY` on the backend to enable, "
            "or install the `openbb` Python SDK._"
        )
    return _format_macro_markdown(snap.model_dump(mode="json"))


@router.get("/track-record", response_class=PlainTextResponse)
def widget_track_record(request: Request) -> str:
    """OpenBB widget: latest agent backtest summary, fetched from GitHub."""
    _rate_limit_ip(request)
    import urllib.request
    import json

    url = (
        "https://raw.githubusercontent.com/gallen666/"
        "trading-agents-platform/main/reports/latest.json"
    )
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            data = json.loads(r.read())
    except Exception as e:
        return (
            "## Track record\n\n"
            f"_Failed to load `reports/latest.json` from GitHub: {e}_\n\n"
            "Run `outputs/run_agent_backtest.command` to regenerate."
        )

    pm = data.get("portfolio_metrics") or {}
    out: list[str] = []
    out.append("## Agent vs Buy & Hold — most recent backtest")
    out.append("")
    out.append(f"_Window: {data.get('start_date', '?')} → {data.get('end_date', '?')}_")
    out.append("")
    out.append("| Strategy | Total return | Annualised | Sharpe | Max DD |")
    out.append("|---|---|---|---|---|")
    def _pct(v: Any) -> str:
        return f"{v*100:+.2f}%" if isinstance(v, (int, float)) else "—"

    def _num(v: Any, fmt: str = ".2f") -> str:
        return format(v, fmt) if isinstance(v, (int, float)) else "—"

    for name in ("agent", "buy_and_hold"):
        m = pm.get(name) or {}
        out.append(
            f"| **{name.replace('_', ' ').title()}** | "
            f"{_pct(m.get('total_return'))} | "
            f"{_pct(m.get('annualised_return'))} | "
            f"{_num(m.get('sharpe_ratio'))} | "
            f"{_pct(m.get('max_drawdown'))} |"
        )
    out.append("")
    out.append(
        "[Full report on the website →]"
        "(https://www.concordal.hk/track-record)"
    )
    return "\n".join(out)
