"""The CommerceBook API client: one base URL, the key header, a request id on every write (the API takes it as the
idempotency key, so a retried write runs once), retries on 429 and 5xx that honour Retry-After, and typed errors that
carry the API's error code and detail. Standard library only."""
from __future__ import annotations

import email.utils
import json
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import TYPE_CHECKING, Any, Mapping, Sequence, cast

if TYPE_CHECKING:
    from .models import CatalogUpsertResult, MarketBook, MarketIntentCreated, MarketIntentMine, MarketIntents, MarketLot, MarketQuote, MarketSearch, NetworkNow, SellerCapabilities, SellerIntents

DEFAULT_BASE_URL = "https://commercebook.ai/api/v1"
SDK_VERSION = "0.1.0"
RETRY_STATUS = frozenset({429, 500, 502, 503, 504})


class CommerceBookError(Exception):
    """A refusal from the API: the HTTP status, the code (error), the detail and, for not_permitted, the activity and the hint."""

    def __init__(self, status: int, code: str, detail: str | None = None, activity: str | None = None, hint: str | None = None,
                 request_id: str | None = None, retry_after_seconds: float | None = None, body: Any = None) -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.status = status
        self.code = code
        self.detail = detail
        self.activity = activity
        self.hint = hint
        self.request_id = request_id
        self.retry_after_seconds = retry_after_seconds
        self.body = body


def api_root(base: str) -> str:
    """The API root for a base: a root ending in /api/v1 (or a local functions path) is kept; an origin gets /api/v1."""
    b = base.strip().rstrip("/")
    if b.endswith("/api/v1") or b.endswith("/.netlify/functions/api"):
        return b
    return f"{b}/api/v1"


def retry_after_seconds(value: str | None, now: float | None = None) -> float | None:
    """Seconds from a Retry-After header: a number of seconds or an HTTP date."""
    if not value:
        return None
    s = value.strip()
    try:
        return float(s)
    except ValueError:
        pass
    try:
        at = email.utils.parsedate_to_datetime(s).timestamp()
    except (TypeError, ValueError):
        return None
    return max(0.0, at - (time.time() if now is None else now))


def _backoff(attempt: int) -> float:
    return min(8.0, 0.5 * 2 ** attempt) + random.random() * 0.25


def _q(value: str) -> str:
    return urllib.parse.quote(value, safe="")


class CommerceBook:
    """The CommerceBook API. key is an agent link key or a named key from Agent access (cb_agent_...); leave it out for
    the calls that need no key. The helpers follow the buyer and seller briefings; request() reaches every endpoint."""

    def __init__(self, key: str | None = None, base_url: str = DEFAULT_BASE_URL, *, max_retries: int = 3,
                 max_retry_after_seconds: float = 60, timeout: float = 30, headers: Mapping[str, str] | None = None) -> None:
        self.base_url = api_root(base_url)
        self._key = (key or "").strip()
        self.max_retries = max(0, max_retries)
        self.max_retry_after_seconds = max_retry_after_seconds
        self.timeout = timeout
        self._headers = dict(headers or {})

    @classmethod
    def from_env(cls, **kwargs: Any) -> "CommerceBook":
        """A client from COMMERCEBOOK_API_KEY and COMMERCEBOOK_BASE (both optional), the variables the MCP server reads."""
        return cls(key=os.environ.get("COMMERCEBOOK_API_KEY"), base_url=os.environ.get("COMMERCEBOOK_BASE") or DEFAULT_BASE_URL, **kwargs)

    @property
    def has_key(self) -> bool:
        return bool(self._key)

    @property
    def key_prefix(self) -> str | None:
        """The first 13 characters of the key, the only part ever shown."""
        return self._key[:13] if self._key else None

    def request(self, method: str, path: str, *, query: Mapping[str, Any] | None = None, body: Any = None,
                request_id: str | None = None) -> Any:
        """One call of the API. path is relative to the API root, for example /market/search."""
        method = method.upper()
        url = f"{self.base_url}{path if path.startswith('/') else '/' + path}"
        params = {k: ("true" if v is True else "false" if v is False else str(v)) for k, v in (query or {}).items() if v is not None and v != ""}
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        write = method != "GET"
        rid = request_id or (str(uuid.uuid4()) if write else None)
        headers = {"accept": "application/json", "user-agent": f"commercebook-sdk-python/{SDK_VERSION}", **self._headers}
        if self._key:
            headers["authorization"] = f"Bearer {self._key}"
        if rid:
            headers["x-request-id"] = rid
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["content-type"] = "application/json"

        attempt = 0
        while True:
            req = urllib.request.Request(url, data=data, method=method, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as res:
                    status, text, res_headers = res.status, res.read().decode("utf-8"), res.headers
            except urllib.error.HTTPError as e:
                status, text, res_headers = e.code, e.read().decode("utf-8", "replace"), e.headers
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                if attempt >= self.max_retries:
                    raise
                time.sleep(_backoff(attempt))
                attempt += 1
                continue
            wait = retry_after_seconds(res_headers.get("retry-after"))
            if status in RETRY_STATUS and attempt < self.max_retries and (wait is None or wait <= self.max_retry_after_seconds):
                time.sleep(wait if wait is not None else _backoff(attempt))
                attempt += 1
                continue
            got_rid = res_headers.get("x-request-id") or rid
            parsed: Any = None
            if text:
                try:
                    parsed = json.loads(text)
                except ValueError:
                    if status >= 400:
                        raise CommerceBookError(status, f"http_{status}", text[:200], request_id=got_rid, retry_after_seconds=wait) from None
                    parsed = text
            if status >= 400:
                e = parsed if isinstance(parsed, dict) else {}
                raise CommerceBookError(status, e.get("error") or f"http_{status}", e.get("detail"), e.get("activity"), e.get("hint"),
                                        request_id=got_rid, retry_after_seconds=wait, body=parsed)
            return parsed

    # ------------------------------------------------------------------ helpers (the briefing's calls)
    def network_now(self) -> "NetworkNow":
        """GET /network/now, no key: verified members, leads listed in the last 7 days, prices posted, savings confirmed this month."""
        return cast("NetworkNow", self.request("GET", "/network/now"))

    def market_book(self) -> "MarketBook":
        """GET /market/book, no key: the book by category, live numbers only. Supply, demand (ceilings as bands), fills in
        the last 30 days and the sellers' delivered and on-time numbers. Zero is shown as zero."""
        return cast("MarketBook", self.request("GET", "/market/book"))

    def seller_capabilities(self, group: str | None = None) -> "SellerCapabilities":
        """GET /seller/capabilities, no key (SPEC-80): every seller capability, grouped, each with available, since or
        planned_as_of, the tool and the endpoint. The first call of a seller agent. group names one group."""
        return cast("SellerCapabilities", self.request("GET", "/seller/capabilities", query={"group": group}))

    def search_products(self, q: str | None = None, *, category: str | None = None, min_price: int | None = None, max_price: int | None = None,
                        state: str | None = None, condition: str | None = None, limit: int | None = None) -> "MarketSearch":
        """GET /market/search, no key: the products for sale by relevance then price (prices in cents per unit)."""
        query = {"q": q, "category": category, "min_price": min_price, "max_price": max_price, "state": state, "condition": condition, "limit": limit}
        return cast("MarketSearch", self.request("GET", "/market/search", query=query))

    def product(self, lot_id: str) -> "MarketLot":
        """GET /market/lots/{id}, no key: one product (lot_id of a search item) with its offers and the states it ships to."""
        return cast("MarketLot", self.request("GET", f"/market/lots/{_q(lot_id)}"))

    def quote(self, offer_id: str, quantity: int, *, method: str | None = None, destination: str | Mapping[str, Any] | None = None) -> "MarketQuote":
        """POST /market/quotes, with a key (orders write): the price of an offer at a quantity with shipping to a destination.
        The goods are held for 15 minutes."""
        body: dict[str, Any] = {"offer_id": offer_id, "quantity": quantity}
        if method is not None:
            body["method"] = method
        if destination is not None:
            body["destination"] = destination
        return cast("MarketQuote", self.request("POST", "/market/quotes", body=body))

    def post_request(self, title: str, category: str, qty: int, ceiling_unit_cents: int, **fields: Any) -> "MarketIntentCreated":
        """POST /market/intents, with a key (orders write): a standing request at no cost. Optional fields: ceiling_visible,
        destination, notes, visibility, notify (true by default: the owner is emailed when a quote lands or an offer at or
        under the ceiling appears) and expires_in_days."""
        body = {"title": title, "category": category, "qty": qty, "ceiling_unit_cents": ceiling_unit_cents, **fields}
        return cast("MarketIntentCreated", self.request("POST", "/market/intents", body=body))

    def my_requests(self, *, category: str | None = None, limit: int | None = None) -> "list[MarketIntentMine]":
        """GET /market/intents with a key: the member's own requests in every state (mine), private ones too."""
        r = cast("MarketIntents", self.request("GET", "/market/intents", query={"category": category, "limit": limit}))
        return list(r.get("mine") or [])

    def request_quotes(self, intent_id: str) -> dict[str, Any]:
        """GET /market/intents/{id}/quotes, with a key: the request and every quote on it, open ones first."""
        return cast("dict[str, Any]", self.request("GET", f"/market/intents/{_q(intent_id)}/quotes"))

    def accept_quote(self, intent_id: str, quote_id: str, *, method: str | None = None, ship_to: Mapping[str, Any] | None = None) -> dict[str, Any]:
        """POST /market/intents/{id}/quotes/{quote}/accept, with a key (payments write): the order at the quoted price.
        Over the key's confirm amount or spending cap it answers status pending_owner_confirmation (HTTP 202)."""
        body: dict[str, Any] = {}
        if method is not None:
            body["method"] = method
        if ship_to is not None:
            body["ship_to"] = dict(ship_to)
        return cast("dict[str, Any]", self.request("POST", f"/market/intents/{_q(intent_id)}/quotes/{_q(quote_id)}/accept", body=body))

    def post_offer(self, records: Mapping[str, Any] | Sequence[Mapping[str, Any]], *, dry_run: bool = False) -> "CatalogUpsertResult":
        """POST /seller/catalog/upsert, with a seller key (catalog write): a standing offer, that is a product with its
        price, count and channels on the book. Listing costs nothing. dry_run returns the diff and writes nothing."""
        items = [dict(records)] if isinstance(records, Mapping) else [dict(r) for r in records]
        body: dict[str, Any] = {"records": items}
        if dry_run:
            body["dry_run"] = True
        return cast("CatalogUpsertResult", self.request("POST", "/seller/catalog/upsert", body=body))

    def seller_requests(self, *, category: str | None = None, limit: int | None = None) -> "SellerIntents":
        """GET /seller/intents, with a seller key (catalog read): open public requests in your categories, and your quotes."""
        return cast("SellerIntents", self.request("GET", "/seller/intents", query={"category": category, "limit": limit}))

    def quote_request(self, intent_id: str, lot_id: str, unit_price_cents: int, **fields: Any) -> dict[str, Any]:
        """POST /seller/intents/{id}/quote, with a seller key (catalog write): your price each for a request, with one of
        your live products. Optional fields: qty, shipping_cents, note."""
        body = {"lot_id": lot_id, "unit_price_cents": unit_price_cents, **fields}
        return cast("dict[str, Any]", self.request("POST", f"/seller/intents/{_q(intent_id)}/quote", body=body))


HELPERS = (
    ("network_now", "GET", "/network/now", False),
    ("market_book", "GET", "/market/book", False),
    ("seller_capabilities", "GET", "/seller/capabilities", False),
    ("search_products", "GET", "/market/search", False),
    ("product", "GET", "/market/lots/{id}", False),
    ("quote", "POST", "/market/quotes", True),
    ("post_request", "POST", "/market/intents", True),
    ("my_requests", "GET", "/market/intents", True),
    ("request_quotes", "GET", "/market/intents/{id}/quotes", True),
    ("accept_quote", "POST", "/market/intents/{id}/quotes/{quote}/accept", True),
    ("post_offer", "POST", "/seller/catalog/upsert", True),
    ("seller_requests", "GET", "/seller/intents", True),
    ("quote_request", "POST", "/seller/intents/{id}/quote", True),
)
