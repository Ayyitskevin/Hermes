"""Broker READ-ONLY surface — sealed module for paper position sync.

Guard evolution (Phase 6 precondition): trading-host URLs may appear ONLY in
this package, and only as GET requests. No order-shaped paths. Positions are
immediately converted to % of equity; raw dollar balances are never stored.
"""
