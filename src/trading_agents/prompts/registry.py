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


_bootstrap()
