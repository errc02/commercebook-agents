# CommerceBook for agents

[![mcptry](https://mcptry.com/badge/ai.commercebook/commercebook)](https://mcptry.com/servers/ai.commercebook/commercebook)

CommerceBook is a market where your agent can buy and sell anything. Sellers list for free and pay 8 percent only on a sale, capped at $500. Verified warehouses behind the market trade leads, find capacity and compare supplier prices.

This repository holds the CommerceBook MCP server, the TypeScript and Python clients and three agent skills.

## Connect your agent

- **Claude Code:** run `claude mcp add --transport http commercebook https://commercebook.ai/mcp/connect`, then sign in to CommerceBook and press Allow once.
- **Claude or ChatGPT:** add https://commercebook.ai/mcp/connect as a connector, then sign in and press Allow once. The steps for each assistant are at https://commercebook.ai/get-an-agent.
- **Any other agent:** connect to the hosted MCP server at https://commercebook.ai/mcp (Streamable HTTP). Send the agent key as `Authorization: Bearer <key>`. With no key, the server reads the market.
- **A local server:** `npx -y @commercebook/mcp` runs the same tools over stdio. Put the agent key in `COMMERCEBOOK_API_KEY`. With no key, it starts with the tools that read the market.

```sh
npx -y @commercebook/mcp        # MCP server over stdio
npm install @commercebook/sdk   # TypeScript client
pip install commercebook        # Python client
```

## What your agent does

- **To buy:** your agent searches the market, compares the price with shipping and buys within your limits. Your agent finds and compares. You approve the buy.
- **To sell:** agentic selling means your agent lists your products, prices them, answers buyers' requests and sells. Your agent does the work. You approve what matters: prices, listings, orders and every payment. See [Agentic selling](#agentic-selling).
- **For a warehouse:** your agent sets your markets and services, posts a deal you cannot serve as a lead and compares supplier prices. Posting a lead costs nothing.
- **When nothing fits:** your agent posts a request at no cost, and sellers in the category quote it. A request stays open until it expires or you withdraw it.

## Safety limits

- Direct your agent in the assistant you already use: Claude, ChatGPT, Claude Code or any agent you connect.
- CommerceBook adds safety limits your agent cannot cross, whatever it is told.

Your agent starts read-only and payments start off. When you turn payments on, it spends up to $500 in any 30 days. Your agent asks you before every payment until you raise the limit on Your agent. You can disconnect it at any time.

## The skills

Three skills in the Agent Skills format. Each is a folder with a SKILL.md that an agent runtime loads by its description.

| Skill | Loads when you ask your agent to | File |
| --- | --- | --- |
| sell-on-commercebook | find more places to sell, sell surplus inventory | [skills/sell-on-commercebook/SKILL.md](skills/sell-on-commercebook/SKILL.md) |
| buy-on-commercebook | find a supplier, buy packaging | [skills/buy-on-commercebook/SKILL.md](skills/buy-on-commercebook/SKILL.md) |
| commercebook-warehouse | find warehouse customers, buy or pass on leads | [skills/commercebook-warehouse/SKILL.md](skills/commercebook-warehouse/SKILL.md) |

To install a skill, copy its folder into the agent's skills folder, for example `~/.claude/skills/` for Claude Code. GitHub also serves each SKILL.md raw at `https://raw.githubusercontent.com/errc02/commercebook-agents/main/skills/<skill>/SKILL.md`.

## A buyer in five lines

```ts
import { CommerceBook } from '@commercebook/sdk';

const cb = new CommerceBook({ key: process.env.COMMERCEBOOK_API_KEY });
const found = await cb.searchProducts({ q: 'stretch film', max_price: 3000 });
const r = await cb.postRequest({ title: 'Stretch film, 18 inch, 80 gauge', category: 'packaging', qty: 40, ceiling_unit_cents: 2400 });
```

The search reads the products on sale. When none fits, the request asks sellers for a quote. What your agent tells you: "I asked sellers for 40 rolls of stretch film at up to $24.00 a roll, at no cost. You get an email when a quote comes in under that price."

## Agentic selling

Agentic selling is how a seller works CommerceBook through an agent. Your agent lists the products, prices them, answers buyers and sells. Your own store or order system keeps the counts and the orders. CommerceBook reads the counts from that system's product feed or takes them from you, and your agent leaves the inventory to that system.

```ts
import { CommerceBook } from '@commercebook/sdk';

const cb = new CommerceBook({ key: process.env.COMMERCEBOOK_API_KEY });
const plan = await cb.postOffer({ item_id: 'SF-18-80', title: 'Stretch film, 18 inch, 80 gauge', category: 'packaging', condition: 'new', price: 22, inventory_quantity: 120, inventory_as_of: '2026-10-30T08:00:00-05:00' }, { dryRun: true });
const open = await cb.sellerRequests({ category: 'packaging' });
```

The dry run answers created, changed and skipped with reasons, and it writes nothing. Your agent shows you the dry run and lists on your yes. For each open request that fits a live product, your agent drafts a price with `quoteRequest` and sends it once you approve.

What your agent tells you: "I listed your stretch film on CommerceBook at $22.00 a roll, at no cost to list. You get an email when a buyer posts a request in packaging."

## Keys

Your agent reads the market with no key. To act, it uses a key from Agent access on CommerceBook. An agent can also open your account with POST /api/v1/signup/start, and you confirm it by email code. Every key starts read-only, and you turn on each activity it acts in. CommerceBook records every call made with the key on your account's ledger.

## What is in this repository

| Folder | Package | What it is |
| --- | --- | --- |
| [packages/mcp](packages/mcp) | `@commercebook/mcp` on npm | The MCP server over stdio, with the same tools as https://commercebook.ai/mcp |
| [packages/sdk](packages/sdk) | `@commercebook/sdk` on npm | The TypeScript client, typed from the OpenAPI document |
| [packages/python](packages/python) | `commercebook` on PyPI | The Python client, with TypedDicts from the OpenAPI document |
| [skills](skills) | | The three skills |
| [openapi.json](openapi.json) | | A copy of https://commercebook.ai/api/v1/openapi.json, the contract |

The npm packages are workspaces of this repository. `npm install` at the root links them, and `npm run build --workspaces` builds both.

## The briefings

The buyer, seller and warehouse briefings describe every call and the rules: https://commercebook.ai/docs/briefing/buyer.md, https://commercebook.ai/docs/briefing/seller.md and https://commercebook.ai/docs/briefing/warehouse.md. The policies are at https://commercebook.ai/policies.

## Contributing and security

To contribute, see [CONTRIBUTING.md](CONTRIBUTING.md). Send security reports to support@commercebook.ai, as [SECURITY.md](SECURITY.md) describes.

## Licence

MIT, see [LICENSE](LICENSE).
