---
name: buy-on-commercebook
description: Buy supplies on CommerceBook, a network of verified warehouses and the sellers who sell through them. Use when the principal asks to find a supplier, buy packaging (stretch film, cartons, pallets, tape, labels), source a product at a target price, restock, or compare suppliers with shipping. Posts a standing request with a ceiling at no cost, reads quotes, and buys only within the limits the owner sets, through the CommerceBook API or MCP server.
---

# Buy on CommerceBook

CommerceBook is a network of verified warehouses and the sellers who sell through them. A buyer reads the market without a key, posts a request for what it needs at no cost, and accepts a quote or orders a listed product. This skill registers the principal's need first, so the market comes to the principal, and buys only when the owner allows it.

## Connect

Use one of these doors. Each one reaches the same API at https://commercebook.ai/api/v1.

- MCP server: https://commercebook.ai/mcp (Streamable HTTP). Without a key it offers the market, the book, the open requests, the network figures, feedback and sign-up. With `Authorization: Bearer <key>`, or https://commercebook.ai/mcp?role=buyer, it lists the buyer tools. The tools are grouped by task: each takes `action` and that action's arguments (for example `commercebook_market` with action search), and `commercebook_tool_search` finds the tool and action for plain words. The single-action names of version 0.3 still answer until January 25, 2027.
- Local MCP server: `npx -y @commercebook/mcp`, with `COMMERCEBOOK_API_KEY` in its environment for the keyed tools.
- SDKs: `npm install @commercebook/sdk` or `pip install commercebook`.

No account yet? `commercebook_account_start` action `signup` (POST /api/v1/signup/start) with kind buyer, the owner's email and the owner's name (contact_name) sends the owner one email with an 8-digit code. The company is optional and no address is asked. Ask the owner for the code, then `commercebook_account_start` action `confirm` (POST /api/v1/signup/confirm) answers the key once. Keep the key secret and never print it.

Every key starts read-only. Posting a request needs the orders activity, and paying needs the payments activity. The owner turns both on at Agent access in the Shop (https://commercebook.ai/shop/settings), where the owner also saves a card or funds the balance.

## Step 1. Read the book (no key)

1. `commercebook_market` action `book` (GET /api/v1/market/book): the book by category, live numbers only. It shows the supply and the lowest price, the open requests and their ceiling bands, and the fills in the last 30 days.
2. `commercebook_market` action `search` (GET /api/v1/market/search) with q, category, max_price (cents per unit) and state: the products for sale by relevance, then price.
3. `commercebook_market` action `product` (GET /api/v1/market/lots/{id}): one product with its offers, the count, the date the count was confirmed and the states it ships to.
4. `commercebook_market` action `seller` (GET /api/v1/market/sellers/{slug}): the seller record CommerceBook computes from orders (delivered, on time, accurate). The seller writes none of it.
5. `commercebook_market` action `requests` (GET /api/v1/market/intents) with category: the open requests other buyers posted.

Report what the market has, including zero. No match today is the reason to post the request in step 2.

## Step 2. Post the standing request (no cost)

`commercebook_requests` action `post` (POST /api/v1/market/intents) with:

- title: what the principal wants, in plain words (120 characters).
- category: a category key, lower case with underscores, for example packaging.
- qty and ceiling_unit_cents: the quantity and the most the principal pays each, in cents.
- notify true (the default): the owner gets an email when a quote lands or an offer at or under the ceiling appears.
- Optional: destination (a state or a ZIP) and notes for sellers (1,000 characters).
- Optional: ceiling_visible false (sellers see a band), visibility private (off the book) and expires_in_days (1 to 90, 30 by default).

Posting costs nothing. Sellers with a live product in the category are told at once (sellers_told). The answer lists the live offers already at or under the ceiling (matches_now). Nothing is bought until a quote is accepted.

## Step 3. Tell the principal in one sentence

Use the facts from the answer, for example:

> I registered your need for 40 rolls of 18 inch stretch film at a ceiling of $24.00 a roll on CommerceBook, at no cost. You get an email when a quote lands under it, and nothing is bought until you or I accept one.

When matches_now is not empty, add the best match with its price and seller.

## The fuller loop: quote, accept, receive, rate

1. Read the quotes. `commercebook_requests` action `quotes` (GET /api/v1/market/intents/{id}/quotes) lists every quote, open ones first by total, with the price each, the shipping, the expiry and the seller's three numbers.
2. Accept or decline. `commercebook_requests` action `accept` (POST /api/v1/market/intents/{id}/quotes/{quote}/accept) makes the order at the quoted price. It pays from the balance or the saved card (method balance, card or saved) and takes ship_to for a shipped quote. `commercebook_requests` action `decline` (POST /api/v1/market/intents/{id}/quotes/{quote}/decline) declines one. `commercebook_requests` action `withdraw` (DELETE /api/v1/market/intents/{id}) withdraws the request and its open quotes.
3. Or buy a listed product. `commercebook_buy` action `quote` (POST /api/v1/market/quotes) prices an offer at a quantity with shipping and holds the goods for 15 minutes. `commercebook_buy` action `place` (POST /api/v1/market/orders) turns the quote into an order paid from the balance or the saved card. `commercebook_buy` action `address_check` (POST /api/v1/shipping/address-check) checks the delivery address once before the order.
4. Several candidates? `commercebook_result_sheets` action `make` (POST /api/v1/market/sheets) puts up to 12 offers on one page for the owner, with the totals by payment method. The owner gets one link.
5. Receive. `commercebook_buy` action `orders` (GET /api/v1/market/orders) and `commercebook_buy` action `tracking` (GET /api/v1/market/orders/{id}/tracking) follow the order. `commercebook_buy` action `confirm_delivery` (POST /api/v1/market/orders/{id}/confirm-delivery) accepts the goods.
6. Problems and ratings. `commercebook_buy` action `dispute` (POST /api/v1/market/orders/{id}/dispute) reports non_delivery, shortage, condition or other. Shoppers have 30 days from delivery to file a dispute. After that the order is non-refundable. `commercebook_buy` action `rate` (POST /api/v1/market/orders/{id}/rate) rates the goods and the seller from 1 to 5.

## Rules the agent works under

- Spending: an accept or an order over the key's confirm amount or spending cap answers 202 pending_owner_confirmation and waits for the owner at Agent access. `commercebook_agent_rules` action `limits` (GET /api/v1/agent/limits) reads the limits on the key.
- A call that needs an activity the owner has not turned on answers 403 not_permitted with the activity and a hint. Relay the hint to the owner and do not retry.
- Paying: the balance carries no card fee, and a card carries 2.9 percent plus 30 cents and is held, not charged, until the seller ships. The buyer pays no CommerceBook fee. Fee schedule: https://commercebook.ai/docs/policies/fees.md.
- Every call made with the key is on the owner's ledger, where the owner can revoke the key.
- What to buy is the principal's decision. Present the facts and the quotes, and buy only what the principal asked for.

## The same calls in the SDKs

| Step | TypeScript (`@commercebook/sdk`) | Python (`commercebook`) |
| --- | --- | --- |
| The book by category | `marketBook()` | `market_book()` |
| Search | `searchProducts({ q, max_price })` | `search_products(q, max_price=...)` |
| One product | `product(lotId)` | `product(lot_id)` |
| Quote an offer | `quote({ offer_id, quantity, method: 'ship', destination })` | `quote(offer_id, quantity, method="ship", destination=...)` |
| Post the standing request | `postRequest({ title, category, qty, ceiling_unit_cents })` | `post_request(title, category, qty, ceiling_unit_cents)` |
| My requests | `myRequests()` | `my_requests()` |
| Quotes on a request | `requestQuotes(intentId)` | `request_quotes(intent_id)` |
| Accept a quote | `acceptQuote(intentId, quoteId, { method })` | `accept_quote(intent_id, quote_id, method=...)` |

Every other call is `request(method, path)` in both SDKs. The full contract: https://commercebook.ai/api/v1/openapi.json. The buyer briefing: https://commercebook.ai/docs/briefing/buyer.md.
