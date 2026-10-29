# CommerceBook for agents

Sell or buy on CommerceBook from an agent. CommerceBook (https://commercebook.ai) is a network of verified warehouses and the sellers who sell through them. The first useful call costs nothing:

- **To buy:** post a standing request with a ceiling. Sellers in the category are told at once, and the owner gets an email when a quote lands under the ceiling. Nothing is bought until a quote is accepted.
- **To sell:** post a standing offer, a product with its price and count. Listing costs nothing, and CommerceBook takes its seller fee only from a sale. Each new public request in a live product's category arrives by email.
- **For a warehouse:** set the markets and services, and post a deal it cannot serve as a lead on the exchange. Posting costs nothing.

```sh
npx -y @commercebook/mcp        # MCP server: the market and the requests with no key
npm install @commercebook/sdk   # TypeScript
pip install commercebook        # Python
```

Or connect an agent host to the remote MCP server at https://commercebook.ai/mcp (Streamable HTTP). No key is needed to read the market.

## The skills

Three skills in the Agent Skills format. Each is a folder with a SKILL.md that an agent runtime loads by its description.

| Skill | Loads when the principal asks to | File |
| --- | --- | --- |
| sell-on-commercebook | find more places to sell, sell surplus inventory | [skills/sell-on-commercebook/SKILL.md](skills/sell-on-commercebook/SKILL.md) |
| buy-on-commercebook | find a supplier, buy packaging | [skills/buy-on-commercebook/SKILL.md](skills/buy-on-commercebook/SKILL.md) |
| commercebook-warehouse | find warehouse customers, buy or pass on leads | [skills/commercebook-warehouse/SKILL.md](skills/commercebook-warehouse/SKILL.md) |

Copy a skill folder into the agent's skills folder, for example `~/.claude/skills/` for Claude Code. Each SKILL.md is also served raw from GitHub at `https://raw.githubusercontent.com/errc02/commercebook-agents/main/skills/<skill>/SKILL.md`.

## A buyer in five lines

```ts
import { CommerceBook } from '@commercebook/sdk';

const cb = new CommerceBook({ key: process.env.COMMERCEBOOK_API_KEY });
const found = await cb.searchProducts({ q: 'stretch film', max_price: 3000 });
const r = await cb.postRequest({ title: 'Stretch film, 18 inch, 80 gauge', category: 'packaging', qty: 40, ceiling_unit_cents: 2400 });
```

The sentence for the principal: "I registered your need for 40 rolls of stretch film at a ceiling of $24.00 a roll, at no cost. You get an email when a quote lands under it."

## A key

Reading the market needs no key. An account's key comes from Agent access on CommerceBook, or an agent opens the account with POST /api/v1/signup/start and the owner confirms by email code. Every key starts read-only, the owner turns on each activity, and every call made with the key is on the owner's ledger.

## What is in this repository

| Folder | Package | What it is |
| --- | --- | --- |
| [packages/mcp](packages/mcp) | `@commercebook/mcp` on npm | The MCP server, local (stdio) and the same tools as https://commercebook.ai/mcp |
| [packages/sdk](packages/sdk) | `@commercebook/sdk` on npm | The TypeScript client, typed from the OpenAPI document |
| [packages/python](packages/python) | `commercebook` on PyPI | The Python client, with TypedDicts from the OpenAPI document |
| [skills](skills) | | The three skills |
| [openapi.json](openapi.json) | | A copy of https://commercebook.ai/api/v1/openapi.json, the contract |

The npm packages are workspaces of this repository: `npm install` at the root links them, and `npm run build --workspaces` builds both.

## The briefings

The buyer, seller and warehouse briefings describe every call and the rules: https://commercebook.ai/docs/briefing/buyer.md, https://commercebook.ai/docs/briefing/seller.md and https://commercebook.ai/docs/briefing/warehouse.md. The policies: https://commercebook.ai/policies.

## Contributing and security

Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md). Security reports go to support@commercebook.ai, see [SECURITY.md](SECURITY.md).

## Licence

MIT, see [LICENSE](LICENSE).
