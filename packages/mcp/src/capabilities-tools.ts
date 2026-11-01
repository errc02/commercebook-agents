/**
 * SPEC-80 Part B item 4: commercebook_seller_capabilities, GET /seller/capabilities with no key: every way a seller
 * offers goods, is found and is paid on CommerceBook, what the record shows, the rules and the first steps, grouped,
 * each with available true or false, since or planned_as_of, the tool and the endpoint that does it and one sentence.
 * The answer is rendered from one module (src/lib/sellerCapabilities.ts) that the seller briefing, /sell on the seller
 * host and llms.txt also render from. On a connection without a key and on every keyed connection (scope.ts
 * COMMON_TOOL_NAMES). Registered from server.ts. CB-958: commercebook_ways, GET /ways with no key: the situation map of one
 * role (packages/commercebook-mcp/src/ways.ts): for each way who it is for, the tool steps, the cost and what waits for the
 * owner; situation takes the owner's words and answers the way they point to. CB-977: commercebook_listing_profile, GET
 * /profiles with no key: the listing profile of a category (packages/commercebook-mcp/src/profiles).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const CAPABILITIES_TOOL_NAMES = ['commercebook_seller_capabilities', 'commercebook_ways', 'commercebook_listing_profile'] as const;

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
    description: 'GET /seller/capabilities: every seller capability on CommerceBook in one read, grouped as ways_to_offer (a standing offer, price by quantity, quote on request with a private floor, quotes on buyer requests, the category watch, and the planned private offers, auctions with a reserve, group buys and promoted listings), ways_to_be_found, ways_to_be_paid (the fee with its cap and the payout days), what_the_record_shows, your_own_system (a product feed from the seller’s own system, and events and webhooks to it), rules and first_steps. Each capability carries available, since or planned_as_of, the tool and the endpoint, and one sentence. The first call for a seller agent. No key needed.',
    inputSchema: { group: z.enum(['ways_to_offer', 'ways_to_be_found', 'ways_to_be_paid', 'what_the_record_shows', 'your_own_system', 'rules', 'first_steps']).optional().describe('One group only; left out, every group.') },
  }, async (a) => run(() => api.get('/seller/capabilities', a)));
  server.registerTool('commercebook_ways', {
    annotations: READ_ONLY,
    title: 'Read the ways that fit the owner',
    description: 'GET /ways: the ways to sell, buy or use the network for one role, by situation. Each way names who it is for, the two to four tool steps, what it costs, what waits for the owner, and the capability lines it rests on with their dates; a planned way carries its planned words. first_conversation holds the three questions to ask the owner first and the way each answer leads to. situation takes the owner\u2019s words ("I have a garage full of used tools") and answers match, the way they point to. Offer only the ways on the map. No key needed.',
    inputSchema: {
      role: z.enum(['seller', 'buyer', 'warehouse']).optional().describe('seller, buyer or warehouse; left out, the situation words choose.'),
      situation: z.string().min(1).max(200).optional().describe('What the owner has or needs, in the owner\u2019s words.'),
    },
  }, async (a) => run(() => api.get('/ways', a)));
  server.registerTool('commercebook_listing_profile', {
    annotations: READ_ONLY,
    title: 'Read what a listing needs',
    description: 'GET /profiles: the listing profile of a category. Read it before listing anything. category takes a Shopify category id or gid or a CommerceBook category key; q takes the owner\u2019s words ("a 2014 Ford F-150", "a GIA diamond ring", "200 cases of tape"). The answer names the category, the modules that apply, the required fields with their units and allowed values, the declarations the owner affirms, the fulfilment and return rules, the questions to ask the owner and the checks to run (recall with model runs the CPSC recall search for a children\u2019s product). A product missing a required field stays a draft. No key needed.',
    inputSchema: {
      category: z.string().min(1).max(120).optional().describe('A Shopify category id or gid (aa-6-9), or a CommerceBook category key (tape).'),
      q: z.string().min(1).max(200).optional().describe('What the owner has, in the owner\u2019s words.'),
      recall: z.string().min(1).max(80).optional().describe('A product name to search the CPSC recalls for.'),
      model: z.string().min(1).max(60).optional().describe('The model number for the recall search.'),
    },
  }, async (a) => run(() => api.get('/profiles', a)));
}
