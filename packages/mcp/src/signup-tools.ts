/**
 * SPEC-47: the tools of a connection with no key (the remote server at https://commercebook.ai/mcp before the agent has
 * a key), so a host can connect first and open an account second. Each calls one endpoint that takes no key:
 *   signup_start    POST /signup/start    the owner gets one email with an 8-digit code (no link), valid 30 minutes
 *   signup_confirm  POST /signup/confirm  the owner's code; answers the key (the agent link key) once
 *   commercebook_network_now  GET /network/now  the network's live numbers, the same name as on a keyed connection
 *   network_now     the older name of commercebook_network_now, kept so agents that call it keep working (SPEC-64)
 * SPEC-48 adds instructions (the buyer briefing) and commercebook_feedback (feedback-tools.ts) to the same connection;
 * SPEC-39 adds commercebook_market_search and commercebook_market_lot (market-tools.ts); SPEC-63 commercebook_market_seller;
 * SPEC-68 Part B commercebook_market_intents (intent-tools.ts); SPEC-68 Part C commercebook_market_book (book-tools.ts);
 * SPEC-79 commercebook_request_reach and commercebook_market_shipping_estimate (reach-tools.ts), the seller fee and the limit.
 * The rule: an agent can open an account; the owner confirms by email code; selling and buying with money still need
 * the owner's Stripe steps. SPEC-84: these are the operations behind commercebook_account_start (signup, confirm) and
 * commercebook_market action network_now; the names here answer as aliases for 90 days.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';
import { COMMERCEBOOK_DEFINITION_MACHINE as COMMERCEBOOK_DEFINITION, WAREHOUSE_ADDITION } from './definition.js';

export const SIGNUP_TOOL_NAMES = ['signup_start', 'signup_confirm', 'commercebook_network_now', 'network_now'] as const;
/** SPEC-48: every tool of a connection with no key. */
export const KEYLESS_TOOL_NAMES = [...SIGNUP_TOOL_NAMES, 'instructions', 'commercebook_feedback', 'commercebook_market_search', 'commercebook_market_lot', 'commercebook_market_seller', 'commercebook_market_warehouse', 'commercebook_market_intents', 'commercebook_market_book', 'commercebook_request_reach', 'commercebook_market_shipping_estimate', 'commercebook_seller_capabilities', 'commercebook_ways', 'commercebook_auctions', 'commercebook_auction', 'commercebook_service_slots', 'commercebook_listing_profile'] as const;

/** The server's own description on a connection without a key (the local servers; the remote one sends the live front page, SPEC-80). */
export const KEYLESS_INSTRUCTIONS =
  `${COMMERCEBOOK_DEFINITION} ${WAREHOUSE_ADDITION} ` +
  'The market summary answers commercebook_market action book, with no key.\n\nIf you sell: call commercebook_capabilities first, with no key. Action seller lists every seller capability with its tool and date; action ways, with the owner’s words, answers the way to sell that fits. The seller briefing is https://commercebook.ai/docs/briefing/seller.md (commercebook_start with role seller). The one action: list a standing offer with commercebook_seller_products action upsert and dry_run true, or watch a category with commercebook_seller_requests action watch, with a seller key from commercebook_account_start action signup (kind seller). CommerceBook takes 8 percent of each sale, capped at $500 per order, and nothing to list.\n\nIf you buy: read the book with commercebook_market action book and search with action search, both with no key. The buyer briefing is https://commercebook.ai/docs/briefing/buyer.md (commercebook_start with role buyer). The one action: post a standing request with commercebook_requests action post, after commercebook_market action reach says how many sellers it reaches.\n\nA warehouse\'s briefing is https://commercebook.ai/docs/briefing/warehouse.md (commercebook_start with role warehouse).\n\nThe tools are grouped by task: each takes action and that action\'s arguments, and commercebook_tool_search finds the tool and action for plain words. Without a key this server lists the tools that answer without one; tools/list with role buyer, seller or warehouse adds that role\'s tools (COMMERCEBOOK_ROLE does the same for the local server), and role all lists every one. The tool names of version 0.3 still answer for 90 days, each with a deprecated_use note. Without a key, each address gets 60 calls a minute and 1,200 an hour (the book, network now, the open requests, one product page and the feeds do not count); with a key, each key gets 600 calls an hour. To open an account, call commercebook_account_start with action signup, the owner\'s email, the kind (warehouse, seller or buyer), the company and the owner\'s name; the owner gets one email with an 8-digit code, and action confirm with that code answers the key once. Then connect again with Authorization: Bearer <key>. A note on what would help goes to commercebook_feedback, with a key or without one.';
type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    if (e instanceof ApiError) return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
  }
}

/** SPEC-71: the hints the Claude and ChatGPT directories ask of every tool; a read of CommerceBook's own public data. */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export function registerSignupTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    'signup_start',
    {
      title: 'Open an account',
      // SPEC-71: sends the owner one email with a code (outside CommerceBook), so open world.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      description:
        'POST /signup/start: asks to open a CommerceBook account for the owner. The owner gets one email with an 8-digit code and no link; the code lives 30 minutes; three starts per email per day. kind is warehouse, seller or buyer (a Shop account that buys on the market: the company is optional and no address is asked); a warehouse also gives its street address. The key starts read-only; the owner turns activities on at Agent access. Then ask the owner for the code and call signup_confirm.',
      inputSchema: {
        email: z.string().min(3).max(254).describe('The owner’s email; the code goes there.'),
        kind: z.enum(['warehouse', 'seller', 'buyer']),
        company: z.string().min(1).max(200).optional().describe('The business name. Required for a warehouse or a seller; optional for a buyer.'),
        contact_name: z.string().min(1).max(120).describe('The owner’s name.'),
        address: z.string().max(400).optional().describe('A warehouse: the street address of its first facility.'),
        city: z.string().max(120).optional(),
        state: z.string().max(40).optional(),
        services: z.array(z.string().min(1).max(80)).max(30).optional(),
        sqft: z.number().int().min(0).optional(),
      },
    },
    async (a) => run(() => api.post('/signup/start', a)),
  );
  server.registerTool(
    'signup_confirm',
    {
      title: 'Confirm the account',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        'POST /signup/confirm: the email and the 8-digit code the owner read in the email. Makes the account and answers the key (the agent link key, shown once), the agent link and the member’s document. Connect again with Authorization: Bearer <key> for the full tool list. Selling and buying with money still need the owner’s Stripe steps.',
      inputSchema: { email: z.string().min(3).max(254), code: z.string().regex(/^\d{8}$/, 'eight digits') },
    },
    async (a) => run(() => api.post('/signup/confirm', a)),
  );
  const networkNow = 'GET /network/now (no key needed): verified members, leads listed in the last 7 days, prices posted and savings confirmed this month, cached 15 minutes.';
  server.registerTool('commercebook_network_now', { title: 'Read the network’s live numbers', description: networkNow, inputSchema: {}, annotations: READ_ONLY }, async () => run(() => api.get('/network/now')));
  server.registerTool(
    'network_now',
    { title: 'The network now (older name)', description: `The older name of commercebook_network_now, kept so agents that call it keep working. ${networkNow}`, inputSchema: {}, annotations: READ_ONLY },
    async () => run(() => api.get('/network/now')),
  );
}
