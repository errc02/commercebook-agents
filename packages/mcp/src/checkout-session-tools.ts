/**
 * CB-971 (migration 186, SPEC-128): checkout sessions in the Agentic Commerce Protocol shape, one operation per path of
 * netlify/functions/lib/openapi-checkout-sessions.ts. The intent tool reaches them as commercebook_buy actions
 * checkout_create, checkout_update, checkout_get, checkout_complete and checkout_cancel (intent-table.ts). Every call
 * needs a key. Registered once from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

export const CHECKOUT_SESSION_TOOL_NAMES = [
  'commercebook_checkout_session_create', 'commercebook_checkout_session_update', 'commercebook_checkout_session_get',
  'commercebook_checkout_session_complete', 'commercebook_checkout_session_cancel',
] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    if (e instanceof ApiError) return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
  }
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const ADDRESS = z.object({
  name: z.string().min(1).max(256), line_one: z.string().min(1).max(60), line_two: z.string().max(60).optional(), city: z.string().min(1).max(60),
  state: z.string().min(2).max(60).describe('The two-letter state.'), country: z.string().min(2).max(60).describe('US.'), postal_code: z.string().min(1).max(20), phone_number: z.string().max(32).optional(),
}).describe('The delivery address in the protocol’s Address shape.');
const BUYER = z.object({ name: z.string().max(256).optional(), email: z.string().max(256).optional(), phone_number: z.string().max(32).optional() });
const ITEM_ID = z.string().uuid().describe('The product id: lot_id from a search or the feed (/feeds/commercebook/products, id).');
const SESSION_ID = z.string().uuid();

export function registerCheckoutSessionTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_checkout_session_create', {
    title: 'Open a checkout session',
    description: 'POST /checkout_sessions: opens an Agentic Commerce Protocol checkout session for one product at a quantity, with the delivery address when the goods ship. The answer is the session: line_items, fulfillment_options (shipping priced to the address, pickup where the product allows it), totals, messages and status (ready_for_payment, or not_ready_for_payment with an error message that says what is missing). One product per session today. Use a session in place of commercebook_buy action place when the owner’s assistant speaks the protocol, or when the address or the quantity must be settled before paying. Needs orders write.',
    inputSchema: { item_id: ITEM_ID, quantity: z.number().int().min(1), fulfillment_address: ADDRESS.optional(), fulfillment_option_id: z.enum(['shipping', 'pickup']).optional(), buyer: BUYER.optional() },
  }, async ({ item_id, quantity, ...rest }) => run(() => api.post('/checkout_sessions', { items: [{ id: item_id, quantity }], ...rest })));
  server.registerTool('commercebook_checkout_session_update', {
    title: 'Update a checkout session',
    description: 'POST /checkout_sessions/{id}: changes the quantity (with item_id), the delivery address, the fulfillment (shipping or pickup) or the buyer. Each change prices the session again, so the totals are the ones complete charges. Refused on a completed or canceled session (405). Needs orders write.',
    inputSchema: { session_id: SESSION_ID, item_id: ITEM_ID.optional(), quantity: z.number().int().min(1).optional(), fulfillment_address: ADDRESS.optional(), fulfillment_option_id: z.enum(['shipping', 'pickup']).optional(), buyer: BUYER.optional() },
  }, async ({ session_id, item_id, quantity, ...rest }) => run(() => api.post(`/checkout_sessions/${session_id}`, { ...(item_id && quantity ? { items: [{ id: item_id, quantity }] } : {}), ...rest })));
  server.registerTool('commercebook_checkout_session_get', {
    title: 'Read a checkout session',
    annotations: READ_ONLY,
    description: 'GET /checkout_sessions/{id}: the session as it stands, with its totals, options, messages and status; once complete, the order (id and permalink_url). Needs orders read.',
    inputSchema: { session_id: SESSION_ID },
  }, async ({ session_id }) => run(() => api.get(`/checkout_sessions/${session_id}`)));
  server.registerTool('commercebook_checkout_session_complete', {
    title: 'Complete a checkout session',
    description: 'POST /checkout_sessions/{id}/complete: places the order at the session’s totals and pays it with the owner’s balance, saved card or saved bank account, as commercebook_buy action place does. Needs the payments activity. The spending limits, the monthly budget and the owner’s rules apply; every payment waits for the owner’s approval (202, status in_progress) until the owner raises the confirm amount, and you stop and ask the owner in the owner’s own chat. The answer carries the order: id and permalink_url.',
    inputSchema: { session_id: SESSION_ID, buyer: BUYER.optional() },
  }, async ({ session_id, ...rest }) => run(() => api.post(`/checkout_sessions/${session_id}/complete`, rest)));
  server.registerTool('commercebook_checkout_session_cancel', {
    title: 'Cancel a checkout session',
    description: 'POST /checkout_sessions/{id}/cancel: closes the session and releases the stock its quote held. A completed or canceled session answers 405. Needs orders write.',
    inputSchema: { session_id: SESSION_ID },
  }, async ({ session_id }) => run(() => api.post(`/checkout_sessions/${session_id}/cancel`, {})));
}
