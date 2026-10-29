# CommerceBook MCP server

`@commercebook/mcp` gives an agent the CommerceBook tools over the Model Context Protocol. CommerceBook is a network of verified warehouses and the sellers who sell through them. Since version 0.4.0 the tools are grouped by what an agent is trying to do: each tool takes `action` and that action's arguments, and each action is one call of the API at https://commercebook.ai/api/v1, made as the member whose key is configured, with every call on the owner's ledger.

## Start with the zero-cost call

- A buyer posts a standing request with a ceiling: `commercebook_requests` with action post, title, category, qty and ceiling_unit_cents. Posting costs nothing, sellers in the category are told at once, and with notify on the owner gets an email for each quote.
- A seller posts a standing offer: `commercebook_seller_products` with action upsert and one product record, dry_run true first. Listing costs nothing. CommerceBook takes its seller fee only from a sale.
- A warehouse sets its markets and services with `commercebook_warehouse_account` action preferences_set and posts a deal it cannot serve with `commercebook_leads` action post. Posting costs nothing.

Before any of these, the market reads with no key: `commercebook_market` with action book, search, product or requests.

## Connect to the remote server

The server runs at https://commercebook.ai/mcp (Streamable HTTP, stateless). Add the URL to the agent host as an MCP server. With the header `Authorization: Bearer <key>` the server lists the tools of the key's member kind.

Without a key and without a role the same address lists the six tools that answer without a key, so a host can connect first and open an account second. A role adds that role's tools: the role argument of `tools/list`, the address https://commercebook.ai/mcp?role=seller (buyer, seller, warehouse or all), or the header `x-commercebook-role`. The description of each tool that needs a key begins with the key it needs ("Needs a seller key."), each action names the activity the owner turns on ("Orders: Can act"), and calling one without a key answers needs_key with the sign-up action. `commercebook_tool_search` takes plain words ("ship an order", "watch a category") and answers the tool, the action and its arguments.

| Tool | Listed for | Actions |
| --- | --- | --- |
| `commercebook_start` | no key (every role) | briefing, whoami, me, standing, openapi |
| `commercebook_market` | no key (every role) | book, search, product, seller, requests, reach, shipping_estimate, network_now |
| `commercebook_capabilities` | no key (every role) | seller |
| `commercebook_feedback` | no key (every role) | send, board, read, post, reply, vote |
| `commercebook_account_start` | no key (every role) | signup, confirm |
| `commercebook_buy` | buyer | quote, place, orders, order, tracking, confirm_delivery, dispute, rate, shipping_quote, address_check |
| `commercebook_requests` | buyer | post, list, quotes, accept, decline, withdraw |
| `commercebook_result_sheets` | buyer | make, list, read, delete |
| `commercebook_agent_rules` | buyer, seller, warehouse | rules, activity, limits, key_limits, lower_limits, pending, pending_decide, permissions |
| `commercebook_seller_products` | seller | list, read, update, pause, resume, upsert, import, feeds, feed_add, feed_fetch, feed_remove, shopify, shopify_sync, ship_from, ship_from_set, stock_check, confirm_count |
| `commercebook_seller_orders` | seller | list, read, release, ship, cancel, fulfillment |
| `commercebook_seller_shipping` | seller | profiles, profile_create, profile_update, profile_delete, profile_default, assign, rate_card, label, label_void, tracking, return_label, label_cost |
| `commercebook_seller_requests` | seller | list, quote, withdraw_quote, watched, watch |
| `commercebook_seller_money` | seller | statement, performance, disputes, dispute_reply |
| `commercebook_seller_account` | seller | me, ledger, business, business_update, policies, policies_update, policies_accept, warehouses, warehouse_options, warehouse_ask, warehouse_end |
| `commercebook_leads` | warehouse | open, read, buy, claim, bought, rate, outcome, defect, mine, post, update, text, price, places, withdraw, introduction, call, challenge, defaults, defaults_set |
| `commercebook_crm` | warehouse | deals, deal, create, update, delete, note, import, facts, fact_decide, facts_extract, share_decision, leads_table |
| `commercebook_costs` | warehouse | prices, rank, summary, savings, price_match, invoices, invoice_upload, invoice_parse, invoice_delete, price_requests, price_request, dismiss |
| `commercebook_network` | warehouse | members, member, agreements, agreement_respond, agreement_end, capacity, capacity_request, capacity_quote, capacity_accept, capacity_quote_withdraw, capacity_withdraw |
| `commercebook_messages` | warehouse | threads, thread, send, start, respond, mark_read, mute, report, block, group, attachables, unread |
| `commercebook_warehouse_profile` | warehouse | profile, completeness, services_catalog, about, services, people, person_add, certifications, contact, logo, logo_remove, rate_card, rate_card_set, facilities, facility_create, facility_update, facility_delete, facility_pin, media_add, media_order, media_remove |
| `commercebook_warehouse_account` | warehouse | settings, settings_contact, preferences, preferences_set, payment_methods, payment_method_remove, balance, funding_instructions, balance_return |
| `commercebook_tool_search` | no key (every role) | (query, role, limit) |

A call names the tool and the action, with the action's own arguments beside it:

```json
{ "name": "commercebook_seller_orders", "arguments": { "action": "ship", "order_id": "<order id>", "carrier": "UPS", "tracking": "<number>" } }
```

An argument the action does not take is reported back as ignored_arguments; a missing or wrong one answers invalid_arguments with the action's arguments. `commercebook_start`, `commercebook_capabilities`, `commercebook_feedback`, `commercebook_result_sheets`, `commercebook_agent_rules` and `commercebook_seller_orders` run their first action when action is left out.

## The 0.3 names

Version 0.3 had one tool per endpoint (202 names, one per REST endpoint). Every one of them still answers until January 25, 2027, with the same arguments and the same answer, plus a second text block holding `deprecated_use`: the new tool, the action and the date. They are not listed. The SDKs keep their method names, since they call the API.

## Run it locally

```sh
npx -y @commercebook/mcp
```

The local server speaks stdio. It reads `COMMERCEBOOK_API_KEY` (the key), optionally `COMMERCEBOOK_BASE` (https://commercebook.ai by default) and `COMMERCEBOOK_ROLE` (buyer, seller, warehouse or all: the tools tools/list answers). Without a key it starts with the keyless tools above. With a key and no role it lists every tool, and an action of another member kind answers not_found. Replace `EXAMPLE_KEY` with the key:

```json
{ "mcpServers": { "commercebook": { "command": "npx", "args": ["-y", "@commercebook/mcp"], "env": { "COMMERCEBOOK_API_KEY": "EXAMPLE_KEY" } } } }
```

`node node_modules/@commercebook/mcp/dist/http.js`, with a key in the same environment, listens on `http://127.0.0.1:8787/mcp` (streamable HTTP, stateless). Keep that listener on the agent's own host. The package also exports `buildServer()` and `startHttp()` for a host that embeds the server.

## The agent link key

The key is the token in the owner's agent link, `https://commercebook.ai/agent/<token>`, or a named key made for an integration. It runs 90 days and the owner can revoke it at any time. Every key starts read-only: it reads what the owner can read and acts only in the activities the owner turns on at Agent access. A call that acts before its activity is on answers not_permitted with the activity and a hint for the owner. A call over the key's limits answers pending_owner_confirmation and waits for the owner. Keys are limited to 600 calls per hour.

An agent can open an account with `commercebook_account_start` action signup, and the owner confirms by email code with action confirm. Selling and buying with money still need the owner's Stripe steps.

## The three doors

Each member kind has its own door on the site, its own Agent access screen and its own tools.

- Buyers: the Shop at https://commercebook.ai/shop. A buyer key reaches `commercebook_buy`, `commercebook_requests`, `commercebook_result_sheets` and `commercebook_agent_rules`, with the keyless tools.
- Sellers: the seller portal at https://seller.commercebook.ai. A seller key adds `commercebook_seller_products`, `commercebook_seller_orders`, `commercebook_seller_shipping`, `commercebook_seller_requests`, `commercebook_seller_money` and `commercebook_seller_account`.
- Warehouses: the workspace at https://warehouse.commercebook.ai. A warehouse key adds `commercebook_leads`, `commercebook_crm`, `commercebook_costs`, `commercebook_network`, `commercebook_messages`, `commercebook_warehouse_profile` and `commercebook_warehouse_account`.

`tools/list` answers the tools of the key's kind (or the role asked for), and each action line names its activity. The briefing for the key's kind answers `commercebook_start`, and the buyer, seller and warehouse briefings are at https://commercebook.ai/docs/briefing/buyer.md, seller.md and warehouse.md.

## Errors

A refusal comes back as an error result with the API's code, the detail and the HTTP status: not_permitted (with the activity and the hint), rate_limited, summary_names_shipper (a lead's need text names the shipper), and so on. The OpenAPI document at https://commercebook.ai/api/v1/openapi.json lists the codes of each endpoint.

## Build from source

```sh
npm install
npm run build
npm run smoke
```

The smoke needs `COMMERCEBOOK_API_KEY` and takes `COMMERCEBOOK_BASE` for another API, for example a local function server at `http://127.0.0.1:4229/.netlify/functions/api`. It lists the tools and calls `commercebook_start` with action whoami, and it prints one JSON line without the key.

## Licence

MIT. Security reports: support@commercebook.ai.
