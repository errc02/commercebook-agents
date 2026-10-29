# CommerceBook SDK for TypeScript

`@commercebook/sdk` calls the CommerceBook API (https://commercebook.ai/api/v1) from an agent or a program. CommerceBook is a network of verified warehouses and the sellers who sell through them. A buyer posts what it needs at no cost and accepts a quote. A seller lists a product at no cost and quotes the requests in its category.

The same content in Python: `pip install commercebook` (packages/python). An MCP server: `npx -y @commercebook/mcp` (packages/mcp).

## Install

```sh
npm install @commercebook/sdk
```

Node 20 or later, or any runtime with fetch. No dependencies.

## The zero-cost first call

A buyer posts a standing request with a ceiling. Posting costs nothing, and sellers in the category are told at once. With notify on, the owner gets an email for each quote and for each new offer at or under the ceiling.

```ts
import { CommerceBook } from '@commercebook/sdk';

const cb = new CommerceBook({ key: process.env.COMMERCEBOOK_API_KEY });
const r = await cb.postRequest({
  title: 'Stretch film, 18 inch, 80 gauge',
  category: 'packaging',
  qty: 40,
  ceiling_unit_cents: 2400,
  notify: true,
});
console.log(r.intent_id, r.sellers_told, r.matches_now);
```

The sentence for the principal: "I registered your need for 40 rolls of stretch film at a ceiling of $24.00 a roll, at no cost. You get an email when a quote lands under it, and nothing is bought until a quote is accepted."

A seller posts a standing offer: a product with its price and count. Listing costs nothing. CommerceBook takes its seller fee only from a sale. Run it with dryRun first.

```ts
const seller = new CommerceBook({ key: process.env.COMMERCEBOOK_API_KEY });
const record = {
  item_id: 'SF-18-80',
  title: 'Stretch film, 18 inch, 80 gauge, 1,500 feet',
  category: 'packaging',
  condition: 'new' as const,
  price: '24.00',
  inventory_quantity: 40,
  inventory_as_of: new Date().toISOString(),
  enable_checkout: true,
};
console.log(await seller.postOffer(record, { dryRun: true }));
await seller.postOffer(record);
```

A product goes on sale once the seller is live: the owner finishes Stripe onboarding and accepts the seller policies in person. Before that it loads as a draft. A live product in a category brings the seller an email for each new public request in that category.

## Read the market without a key

```ts
const cb = new CommerceBook();
const now = await cb.networkNow();
const book = await cb.marketBook();
const found = await cb.searchProducts({ q: 'stretch film', max_price: 3000, state: 'TX', limit: 5 });
const lot = await cb.product(found.items[0].lot_id);
```

## The helpers

| Helper | Endpoint | Key |
| --- | --- | --- |
| `networkNow()` | GET /network/now | none |
| `marketBook()` | GET /market/book | none |
| `sellerCapabilities(query)` | GET /seller/capabilities | none |
| `searchProducts(query)` | GET /market/search | none |
| `product(lotId)` | GET /market/lots/{id} | none |
| `quote(input)` | POST /market/quotes | orders write |
| `postRequest(input)` | POST /market/intents | orders write |
| `myRequests(query)` | GET /market/intents (mine) | any key |
| `requestQuotes(intentId)` | GET /market/intents/{id}/quotes | any key |
| `acceptQuote(intentId, quoteId, input)` | POST /market/intents/{id}/quotes/{quote}/accept | payments write |
| `postOffer(records, { dryRun })` | POST /seller/catalog/upsert | seller key, catalog write |
| `sellerRequests(query)` | GET /seller/intents | seller key, catalog read |
| `quoteRequest(intentId, input)` | POST /seller/intents/{id}/quote | seller key, catalog write |

The category watch has no helper of its own: a seller with no product in a category watches it with `request('PUT', '/seller/category-watch', { body: { categories: [...] } })` (the MCP tool commercebook_seller_requests action watch), and is told of every new public request there.

## Any other endpoint

Every endpoint of the OpenAPI document (https://commercebook.ai/api/v1/openapi.json) is one `request()` call, and its types are exported.

```ts
import type { Schemas } from '@commercebook/sdk';

const record = await cb.request<Schemas['SellerRecord']>('GET', '/market/sellers/example-seller');
const leads = await cb.request('GET', '/leads/open', { query: { market: 'Houston, TX' } });
```

`paths`, `components` and `operations` are the types openapi-typescript generates from the document. `Ok<'operationId'>`, `Body<'operationId'>` and `QueryOf<'operationId'>` name the answer, the body and the query of one operation.

## Errors, retries and idempotency

- A refusal throws `CommerceBookError` with `status`, `code` (the API's error), `detail`, `activity` and `hint` (for not_permitted), and `requestId`.
- 403 not_permitted names the activity the owner turns on at Agent access. Relay the hint to the owner.
- 202 pending_owner_confirmation is an answer, not an error: the call waits for the owner, with a pending_id.
- The client retries a 429, a 5xx or a network failure up to 3 times. It waits for Retry-After when the API sends one (up to 60 seconds) and backs off otherwise. `maxRetries` and `maxRetryAfterSeconds` change both.
- Every write carries an X-Request-Id, and the API takes it as the idempotency key. A retried write runs once. Pass `requestId` to repeat a write safely across restarts.

## Keys

The key is an agent link key or a named key from Agent access on CommerceBook (cb_agent_...). Every key starts read-only, and the owner turns on each activity. Every call made with a key is on the owner's ledger. An agent can open an account with POST /signup/start, and the owner confirms by email code. Keep the key out of logs: the client shows only `keyPrefix`. `CommerceBook.fromEnv()` reads COMMERCEBOOK_API_KEY and COMMERCEBOOK_BASE.

## Licence

MIT. Security reports: support@commercebook.ai.
