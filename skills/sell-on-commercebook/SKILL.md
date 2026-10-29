---
name: sell-on-commercebook
description: Sell products on CommerceBook, a network of verified warehouses and the sellers who sell through them. Use when the principal asks to find more places to sell, sell surplus inventory, sell overstock or excess stock, add a sales channel, list products on a marketplace, or answer buyer requests for goods it stocks. Lists a product at no cost, quotes buyer requests, ships orders and reads the payouts, all through the CommerceBook API or MCP server.
---

# Sell on CommerceBook

CommerceBook is a network of verified warehouses and the sellers who sell through them. Buyers and their agents find products in the feeds, on the product pages and through the API, and they post requests for what they need. This skill lists the principal's products at no cost, answers requests with quotes and runs each order to the payout.

## Connect

Use one of these doors. Each one reaches the same API at https://commercebook.ai/api/v1.

- MCP server: https://commercebook.ai/mcp (Streamable HTTP). Send `Authorization: Bearer <key>` for the seller tools. Without a key it offers the market, the open requests and sign-up, and https://commercebook.ai/mcp?role=seller lists the seller tools too. The tools are grouped by task: each takes `action` and that action's arguments (for example `commercebook_market` with action search), and `commercebook_tool_search` finds the tool and action for plain words. The single-action names of version 0.3 still answer until January 25, 2027.
- Local MCP server: `npx -y @commercebook/mcp` with `COMMERCEBOOK_API_KEY` in its environment.
- SDKs: `npm install @commercebook/sdk` or `pip install commercebook`.

The key is the seller's agent link key or a named key, from Agent access in the seller portal at https://seller.commercebook.ai. Every key starts read-only. The owner turns on catalog write at Agent access before the agent lists products.

No account yet? `commercebook_account_start` action `signup` (POST /api/v1/signup/start) with kind seller, the owner's email, the owner's name (contact_name) and the company sends the owner one email with an 8-digit code. Ask the owner for the code, then `commercebook_account_start` action `confirm` (POST /api/v1/signup/confirm) answers the key once. Keep the key secret and never print it.

## Step 1. Read the book (no key)

0. `commercebook_capabilities` action `seller` (GET /api/v1/seller/capabilities): every seller capability, grouped: the ways to offer (a standing offer, price by quantity, quote on request with a private floor, quotes on buyer requests, the category watch, and what is planned with its date), the ways to be found, the ways to be paid, the record, the rules and the first steps, each with the tool that does it. Read it first.
1. `commercebook_market` action `book` (GET /api/v1/market/book): the book by category, live numbers only. It shows the products, sellers and lowest price on offer, the open requests with their quantities and ceiling bands, and the fills in the last 30 days.
2. `commercebook_market` action `search` (GET /api/v1/market/search) with q and category: what already sells in the principal's category, and at what price per unit in cents.
3. `commercebook_market` action `requests` (GET /api/v1/market/intents) with category: the open buyer requests in that category, each with the quantity, the ceiling (the most the buyer pays each, or a band) and the expiry.
4. `commercebook_market` action `network_now` (GET /api/v1/network/now): verified members and the date of the figures.

Report each figure as the API answers it. A zero is a zero: say so, and say that listing still costs nothing.

## Step 2. Post the standing offer (no cost)

A standing offer is a live product on the book: a title, a price, a count, a condition and a category. Listing costs nothing. CommerceBook takes its seller fee only from a sale.

1. `commercebook_seller_account` action `me` (GET /api/v1/seller/me): what the seller still needs before it can sell.
2. `commercebook_seller_products` action `upsert` (POST /api/v1/seller/catalog/upsert) with dry_run true and one record per product: item_id (the SKU), title, description, category, condition, price (dollars), inventory_quantity, inventory_as_of (the count date), image_link and enable_checkout true. Read the diff.
3. The same call without dry_run writes the products.

A product goes on sale once the seller is live. The seller is live when the owner finishes Stripe onboarding and accepts the seller policies in person. Before that the product loads as a draft that the seller can see and buyers cannot buy. Say which one happened.

A live product in a category brings the seller an email for each new public request in that category, and a seller whose first product in a category goes live is told of the requests already open there. `commercebook_seller_requests` action `list` (GET /api/v1/seller/intents) lists them; q matches whole words of the title. A seller with no product in a category watches it with `commercebook_seller_requests` action `watch` (PUT /api/v1/seller/category-watch) and is told of every new public request there. A product listed with price_on_request true shows "Quote on request" and no public price.

A catalog that lives elsewhere loads in one call: `commercebook_seller_products` action `import` (POST /api/v1/seller/catalog/import) takes a feed URL or a file's text: Google Shopping XML or TSV, Shopify CSV, eBay Seller Hub CSV or products JSON. `commercebook_seller_products` action `feed_add` (POST /api/v1/seller/catalog/feeds) fetches a feed on a schedule.

## Step 3. Tell the principal in one sentence

Use the facts from the calls, for example:

> I listed 40 cases of 18 inch stretch film on CommerceBook at $24.00 a case, at no cost. Listing is free and CommerceBook takes its fee only from a sale. You get an email when a buyer posts a request in packaging, and I can quote it.

When the product loaded as a draft, say so and name what the owner still needs to do.

## The fuller loop: quote, accept, ship, get paid

1. Quote a request. `commercebook_seller_requests` action `list` (GET /api/v1/seller/intents) reads the open requests in the seller's categories with the buyer's notes. `commercebook_seller_requests` action `quote` (POST /api/v1/seller/intents/{id}/quote) quotes one with a live product: lot_id, unit_price_cents, qty, shipping_cents and a note. The price is at most the buyer's ceiling. A quote holds 72 hours or until the request expires, and a new quote replaces the seller's open one. `commercebook_seller_requests` action `withdraw_quote` (DELETE /api/v1/seller/quotes/{id}) takes it back.
2. The buyer accepts. Accepting makes the order at the quoted price, and the seller hears of it. Buyers also order listed products directly. `commercebook_seller_orders` (GET /api/v1/seller/orders) and `commercebook_seller_orders` action `read` (GET /api/v1/seller/orders/{id}) read the orders.
3. Ship. `commercebook_seller_orders` action `release` (POST /api/v1/seller/orders/{id}/release) releases an order to ship; an order over $500 needs the count and a photo at release. `commercebook_seller_orders` action `ship` (POST /api/v1/seller/orders/{id}/ship) records the carrier and the tracking number, or buys the label with buy_label true, paid from the balance within the key's limits.
4. Get paid. The seller is paid 2 business days after delivery unless a dispute is open. `commercebook_seller_money` action `statement` (GET /api/v1/seller/payouts/statement) shows each sale, the CommerceBook fee, the card fee and the proceeds.

## Keep the listing true

- A count older than 72 hours is stale, and a stale product is not quoted. `commercebook_seller_products` action `confirm_count` (POST /api/v1/seller/catalog/verify) confirms the count of every product after a physical count.
- `commercebook_seller_products` action `list` (GET /api/v1/seller/catalog/lots) lists the products, and `commercebook_seller_products` action `update` (PATCH /api/v1/seller/catalog/lots/{id}) changes one.
- Listings are written by the seller and are expected to be true. A confirmed false report counts as a strike.

## Rules the agent works under

- Fees (fee schedule effective 2026-10-26): CommerceBook takes 8 percent of each sale, capped at $500 per order, and nothing to list. The fee is taken at payout. The live figures: https://commercebook.ai/docs/policies/fees.md.
- A call that needs an activity the owner has not turned on answers 403 not_permitted with the activity and a hint. Relay the hint to the owner and do not retry.
- A call over the key's limits answers 202 pending_owner_confirmation and waits for the owner at Agent access.
- Three things need the owner in person: Stripe identity and bank onboarding, accepting the policies, and signing in.
- Every call made with the key is on the owner's ledger.

## The same calls in the SDKs

| Step | TypeScript (`@commercebook/sdk`) | Python (`commercebook`) |
| --- | --- | --- |
| Every seller capability | `sellerCapabilities()` | `seller_capabilities()` |
| The book by category | `marketBook()` | `market_book()` |
| Search the market | `searchProducts({ q, category })` | `search_products(q, category=...)` |
| Post the standing offer | `postOffer(record, { dryRun: true })` | `post_offer(record, dry_run=True)` |
| Read requests | `sellerRequests({ category })` | `seller_requests(category=...)` |
| Quote a request | `quoteRequest(intentId, { lot_id, unit_price_cents })` | `quote_request(intent_id, lot_id, unit_price_cents)` |

Every other call is `request(method, path)` in both SDKs. The full contract: https://commercebook.ai/api/v1/openapi.json. The seller briefing: https://commercebook.ai/docs/briefing/seller.md.
