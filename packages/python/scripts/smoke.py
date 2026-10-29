"""Smoke: calls the endpoints that need no key (network_now, market_book, search_products, product) against COMMERCEBOOK_BASE
(default https://commercebook.ai) and prints one JSON line. Never prints a key.

    COMMERCEBOOK_BASE=http://127.0.0.1:4229/.netlify/functions/api python scripts/smoke.py [query]
"""
from __future__ import annotations

import json
import os
import sys

from commercebook import CommerceBook, CommerceBookError


def main() -> int:
    cb = CommerceBook(base_url=os.environ.get("COMMERCEBOOK_BASE") or "https://commercebook.ai")
    out: dict[str, object] = {"base": cb.base_url}
    try:
        now = cb.network_now()
        out["network_now"] = {k: now.get(k) for k in ("members_verified", "lots_public", "sellers_public", "as_of")}
        book = cb.market_book()
        out["market_book"] = sorted(book.keys())[:6]
        found = cb.search_products(sys.argv[1] if len(sys.argv) > 1 else None, limit=3)
        out["search"] = {"count": found.get("count"), "first": [i.get("lot_id") for i in found.get("items", [])]}
        if found.get("items"):
            lot = cb.product(found["items"][0]["lot_id"])
            out["product"] = {"lot_id": lot.get("lot_id"), "title": lot.get("title"), "unit_price_cents": lot.get("unit_price_cents")}
    except CommerceBookError as e:
        out["error"] = {"status": e.status, "code": e.code, "detail": e.detail}
        print(json.dumps(out))
        return 1
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
