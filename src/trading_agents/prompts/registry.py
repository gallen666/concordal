from __future__ import annotations

from .base import PromptPack

_PACKS: dict[str, PromptPack] = {}


def register_pack(name: str, pack: PromptPack) -> None:
    _PACKS[name] = pack


def get_pack(name: str) -> PromptPack:
    if name not in _PACKS:
        raise KeyError(
            f"No prompt pack '{name}'. Known: {list(_PACKS)}"
        )
    return _PACKS[name]


def _bootstrap() -> None:
    from .us_equity_en import US_EQUITY_EN
    register_pack("us_equity:en", US_EQUITY_EN)
    register_pack("us_equity", US_EQUITY_EN)
    # A-share market reuses the US-equity prompt pack for now. Analyst
    # logic (fundamentals/sentiment/news/technical/debate) is largely
    # market-agnostic, and the LLM router appends a "answer in 简体中文"
    # directive when locale="zh", so the output reads naturally in
    # Chinese even though the system-prompt template is English.
    # Future: a `cn_equity_zh.py` pack with A-share-specific framing
    # (涨跌停板、T+1、ST 股、流通市值 vs 总市值、限售解禁).
    register_pack("a_share", US_EQUITY_EN)
    register_pack("a_share:zh", US_EQUITY_EN)
    # Crypto reuses the US pack for now (the analyst prompts are market-
    # agnostic and the Fundamentals adapter returns honest "no traditional
    # fundamentals" notes for crypto, which the prompt already handles).
    # Future: dedicated crypto pack with on-chain / tokenomics framing.
    register_pack("crypto", US_EQUITY_EN)
    register_pack("crypto:en", US_EQUITY_EN)


_bootstrap()
