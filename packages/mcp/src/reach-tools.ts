/**
 * SPEC-79 items 8 and 9 (migration 111): reach before an email, the shipping of one product to a state, and the
 * seller's category watch (netlify/functions/lib/api-reach.ts, lib/openapi-reach.ts). The two reads need no key, so
 * they are on a connection without a key and on every keyed connection (scope.ts COMMON_TOOL_NAMES); the watch tools are
 * a seller key's. Registered from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const REACH_TOOL_NAMES = ['commercebook_request_reach', 'commercebook_market_shipping_estimate'] as const;
export const REACH_SELLER_TOOL_NAMES = ['commercebook_seller_category_watch', 'commercebook_seller_category_watch_set'] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    if (e instanceof ApiError) return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
  }
}

const CATEGORY = z.string().regex(/^[a-z][a-z0-9_]{1,59}$/).describe('A category key from commercebook_market_book (for example packaging, material_handling, medical_surgical).');
const STATE = z.string().regex(/^[A-Za-z]{2}$/).describe('A two-letter state.');

/** The two reads that need no key. */
export function registerReachTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_request_reach', {
    annotations: READ_ONLY,
    title: 'See how far a request reaches',
    description: 'GET /market/intents/reach: before posting, how many sellers a public request in the category would be emailed to (each with a live product there, or watching the category), how many of them are not affiliated with the operator (sellers_unaffiliated_told) and how many live products match the quantity and the state. Counts only; no seller is named. When no seller is told, next names the free step for a buyer (post the request, which waits for the first seller) and for a seller (watch the category). No key needed.',
    inputSchema: { category: CATEGORY, qty: z.number().int().min(1).optional(), destination_state: STATE.optional() },
  }, async (a) => run(() => api.get('/market/intents/reach', a)));
  server.registerTool('commercebook_market_shipping_estimate', {
    annotations: READ_ONLY,
    title: 'Estimate shipping to a state or ZIP',
    description: 'GET /market/lots/{id}/shipping: the lowest and highest shipping of one product to a state or a ZIP (destination_zip; the state is read from it), from the seller’s shipping rules (no carrier call). Every amount is the shipping of the whole order of qty units (rate_basis per_order), and each rule names its basis. qty_available is the stock and short_by how far qty is over it. served false means the seller does not ship there; a calculated rule is priced at the quote (commercebook_market_quote). No key needed.',
    inputSchema: {
      lot_id: z.string().uuid().describe('The lot_id of a search item.'),
      state: STATE.optional(),
      destination_zip: z.string().regex(/^\d{5}(-\d{4})?$/).optional().describe('The five-digit ZIP the goods go to; the state is read from it. Send this or state.'),
      qty: z.number().int().min(1).optional(),
    },
  }, async ({ lot_id, ...q }) => run(() => api.get(`/market/lots/${lot_id}/shipping`, q)));
}

/** The seller's category watch. */
export function registerReachSellerTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_seller_category_watch', {
    annotations: READ_ONLY,
    title: 'Read the watched categories',
    description: 'GET /seller/category-watch: the categories you are told of new public requests in, with or without a live product. Needs the catalog activity.',
    inputSchema: {},
  }, async () => run(() => api.get('/seller/category-watch')));
  server.registerTool('commercebook_seller_category_watch_set', {
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    title: 'Watch categories for requests',
    description: 'PUT /seller/category-watch: the whole list of categories to watch (30 at most; an empty list watches none). From then on you are told of every new public request in them, so a dealer that quotes and does not list a public price still hears of demand. Needs the catalog activity (write).',
    inputSchema: { categories: z.array(CATEGORY).max(30), operation_id: z.string().min(8).max(96).optional() },
  }, async (a) => run(() => api.put('/seller/category-watch', a)));
}
