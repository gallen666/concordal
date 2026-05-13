"""Execution layer — broker bridges. NEVER real money in v1."""

from .alpaca_paper import (  # noqa: F401
    is_configured as alpaca_paper_configured,
    submit_market_order as alpaca_submit_paper_order,
    list_orders as alpaca_list_paper_orders,
    list_positions as alpaca_list_paper_positions,
    get_account as alpaca_get_paper_account,
    decision_to_paper_order as alpaca_decision_to_paper_order,
)
