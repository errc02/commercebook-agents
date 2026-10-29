---
name: commercebook-warehouse
description: Work the CommerceBook lead exchange for a warehouse (a 3PL or fulfillment center) on the network of verified warehouses. Use when the principal asks to find more warehouse customers, buy leads for storage or fulfillment, pass on or sell a lead it cannot serve, refer a prospect to another warehouse, or fill empty pallet positions. Sets the markets and services at no cost, posts unservable deals as leads, and buys leads within the limits the owner sets.
---

# The CommerceBook lead exchange for a warehouse

CommerceBook is a network of verified warehouses and the sellers who sell through them. Warehouses trade leads among themselves: a member posts a prospect it cannot serve, with a description in its own words and a price, and a member that serves that market buys it. This skill sets the warehouse up for the right leads and passes on the deals it cannot serve. It buys leads only within the owner's limits.

## Connect

- MCP server: https://commercebook.ai/mcp (Streamable HTTP) with `Authorization: Bearer <key>`. The server lists the warehouse tools; without a key, https://commercebook.ai/mcp?role=warehouse lists the same tools. The tools are grouped by task: each takes `action` and that action's arguments (for example `commercebook_market` with action search), and `commercebook_tool_search` finds the tool and action for plain words. The single-action names of version 0.3 still answer until January 25, 2027.
- Local MCP server: `npx -y @commercebook/mcp` with `COMMERCEBOOK_API_KEY` in its environment.
- SDKs: `npm install @commercebook/sdk` or `pip install commercebook`. The lead calls are `request(method, path)`.

The key is the warehouse's agent link key or a named key, from Settings, Agent access at https://warehouse.commercebook.ai. Every key starts read-only. The owner turns on the activities the agent needs: settings (markets and services), leads (post and claim free leads) and payments (buy priced leads).

No account yet? `commercebook_account_start` action `signup` (POST /api/v1/signup/start) with kind warehouse sends the owner one email with an 8-digit code. It takes the owner's email, the owner's name (contact_name), the company and the street address of the first facility. Ask the owner for the code, then `commercebook_account_start` action `confirm` (POST /api/v1/signup/confirm) answers the key once. A warehouse is verified before it trades leads. Keep the key secret and never print it.

## Step 1. Read the exchange

1. `commercebook_market` action `network_now` (GET /api/v1/network/now, no key): verified members and the leads listed in the last 7 days.
2. `commercebook_warehouse_account` action `preferences` (GET /api/v1/settings/preferences): the markets (City, ST) and the service chips on file.
3. `commercebook_leads` action `open` (GET /api/v1/leads/open) with market and service: the open leads other members posted, each with its price.
4. `commercebook_crm` action `leads_table` (GET /api/v1/leads/table): the member's own Leads table, every open CRM deal, shared or not.

Report each figure as the API answers it, including zero.

## Step 2. The zero-cost actions

1. Set the markets and services. `commercebook_warehouse_account` action `preferences_set` (PATCH /api/v1/settings/preferences) with markets (at least one, as City, ST), services and a notification_email. Leads in those markets then show in `commercebook_leads` action `open` with the market filter. Setting them costs nothing.
2. Post a deal the warehouse cannot serve. `commercebook_leads` action `post` (POST /api/v1/leads) with a deal_id from the Leads table, or with the fields: need (the prospect's need in the member's own words), title (80 characters), summary_short (140 characters), service and market. With no price the lead takes the member's Lead defaults. `commercebook_leads` action `defaults` (GET /api/v1/settings/lead-defaults) reads them. Posting costs nothing. CommerceBook takes its lead fee from the seller's share only when the lead sells.
3. Publish the rate card. `commercebook_warehouse_profile` action `rate_card_set` (PATCH /api/v1/profile/rate-card) sets up to four lines: storage per pallet per month, receiving per pallet, pick and pack per order, and projects per hour. With storage and receiving set, a capacity request to the member's node is quoted at once.

The exchange sends no email for each new lead today. Read `commercebook_leads` action `open` on a schedule, for example once a day.

## Step 3. Tell the principal in one sentence

Use the facts from the calls, for example:

> I set your CommerceBook markets to Houston, TX and Katy, TX, at no cost, and 3 open leads match them today. I also listed the Phoenix pallet storage deal we cannot serve, at $40. A member that buys it pays you the price less CommerceBook's lead fee.

## The fuller loop: buy, work, record

1. Read one lead. `commercebook_leads` action `read` (GET /api/v1/leads/{id}) answers the lead as the exchange shows it, before the contact is revealed.
2. Buy it. `commercebook_leads` action `claim` (POST /api/v1/leads/{id}/claim) with method balance (no card fee) or card (2.90 percent plus 30 cents). A free lead claims at once with the leads activity. A priced lead needs the payments activity. The contact is revealed at once.
3. Work it. `commercebook_leads` action `bought` (GET /api/v1/leads/claims) lists the leads bought. The buyer pays no CommerceBook fee.
4. Record what happened. `commercebook_leads` action `outcome` (POST /api/v1/leads/claims/{id}/outcome) records the result. `commercebook_leads` action `rate` (POST /api/v1/leads/{id}/rating) rates the lead as described or overstated. `commercebook_leads` action `defect` (POST /api/v1/leads/claims/{id}/defect) reports a defect within the seven-day window.
5. The seller of a lead follows it with `commercebook_leads` action `mine` (GET /api/v1/leads/mine). `commercebook_leads` action `introduction` (POST /api/v1/leads/{id}/introduction) sends the introduction to its buyers. `commercebook_leads` action `withdraw` (POST /api/v1/leads/{id}/withdraw) withdraws an unsold lead.

## Rules the agent works under

- Leads are expected to be true. A confirmed report that a lead's volumes, scope or contact were false counts as a strike against the posting member. Three strikes in 90 days suspend posting for 30 days. `commercebook_start` action `standing` (GET /api/v1/me/standing) reads the member's standing.
- The posting tool refuses a need text that names the shipper (409 summary_names_shipper): describe the need, keep the company in company_name.
- Do-not-solicit marks on CRM records are honored.
- Fees (fee schedule effective 2026-10-26): the lead fee is 10 percent of the lead price, minimum $1.00, paid by the seller of the lead at the sale. Founding members pay 5 percent for 24 months from verification. A free lead carries no fee. The live figures: https://commercebook.ai/docs/policies/fees.md.
- A call that needs an activity the owner has not turned on answers 403 not_permitted with the activity and a hint. Relay the hint to the owner and do not retry. A call over the key's limits answers 202 pending_owner_confirmation and waits for the owner at Agent access.
- Every call made with the key is on the owner's ledger.

## The same calls in the SDKs

| Step | TypeScript (`@commercebook/sdk`) | Python (`commercebook`) |
| --- | --- | --- |
| Network figures | `networkNow()` | `network_now()` |
| Open leads | `request('GET', '/leads/open', { query: { market } })` | `request("GET", "/leads/open", query={"market": ...})` |
| Post a lead | `request('POST', '/leads', { body })` | `request("POST", "/leads", body=...)` |
| Buy a lead | `request('POST', '/leads/' + id + '/claim', { body: { method: 'balance' } })` | `request("POST", f"/leads/{id}/claim", body={"method": "balance"})` |

The full contract: https://commercebook.ai/api/v1/openapi.json. The warehouse briefing: https://commercebook.ai/docs/briefing/warehouse.md.
