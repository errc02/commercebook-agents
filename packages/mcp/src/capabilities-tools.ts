/**
 * SPEC-80 Part B item 4: commercebook_seller_capabilities, GET /seller/capabilities with no key: every way a seller
 * offers goods, is found and is paid on CommerceBook, what the record shows, the rules and the first steps, grouped,
 * each with available true or false, since or planned_as_of, the tool and the endpoint that does it and one sentence.
 * The answer is rendered from one module (src/lib/sellerCapabilities.ts) that the seller briefing, /sell on the seller
 * host and llms.txt also render from. On a connection without a key and on every keyed connection (scope.ts
 * COMMON_TOOL_NAMES). Registered from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const CAPABILITIES_TOOL_NAMES = ['commercebook_seller_capabilities'] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    if (e instanceof ApiError) return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
  }
}

export function registerCapabilitiesTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_seller_capabilities', {
    annotations: READ_ONLY,
    title: 'Read what a seller can do',
    description: 'GET /seller/capabilities: every seller capability on CommerceBook in one read, grouped as ways_to_offer (a standing offer, price by quantity, quote on request with a private floor, quotes on buyer requests, the category watch, and the planned private offers, auctions with a reserve, group buys and promoted listings), ways_to_be_found, ways_to_be_paid (the fee with its cap and the payout days), what_the_record_shows, rules and first_steps. Each capability carries available, since or planned_as_of, the tool and the endpoint, and one sentence. The first call for a seller agent. No key needed.',
    inputSchema: { group: z.enum(['ways_to_offer', 'ways_to_be_found', 'ways_to_be_paid', 'what_the_record_shows', 'rules', 'first_steps']).optional().describe('One group only; left out, every group.') },
  }, async (a) => run(() => api.get('/seller/capabilities', a)));
}
