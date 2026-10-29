/**
 * SPEC-67: the carrier tools, one per new operation of netlify/functions/lib/openapi-carrier.ts. A label is bought
 * with commercebook_seller_order_ship and buy_label true (the existing ship tool); these void it, read the tracking,
 * give the label PDFs as links that last 10 minutes (the PDFs are private), buy a return label, read a buyer's tracking and check an address. The shipping_* names are seller tools except the
 * address check, which every key reaches (scope.ts). Registered once from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

const UUID = z.string().uuid();
const OPID = z.string().min(8).max(128).regex(/^[A-Za-z0-9_:-]+$/).optional();
const ADDRESS = z.object({
  name: z.string().max(120).optional(), company: z.string().max(120).optional(), street1: z.string().max(120), street2: z.string().max(120).optional(),
  city: z.string().max(80), state: z.string().length(2), zip: z.string().max(10), phone: z.string().max(30).optional(), residential: z.boolean().optional(),
});

export const CARRIER_TOOL_NAMES = [
  'commercebook_shipping_label_void', 'commercebook_shipping_tracking', 'commercebook_shipping_label', 'commercebook_shipping_return_label',
  'commercebook_market_order_tracking', 'commercebook_shipping_address_check',
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

export function registerCarrierTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_shipping_label_void', {
    title: 'Void a shipping label',
    description: 'POST /seller/orders/{id}/label/void: before the first carrier scan, the label goes back to the carrier, the order returns to released and the label cost is refunded.',
    inputSchema: { order_id: UUID, operation_id: OPID },
  }, async ({ order_id, ...b }) => run(() => api.post(`/seller/orders/${order_id}/label/void`, b)));
  server.registerTool('commercebook_shipping_tracking', {
    title: 'Tracking of an order you sold',
    description: 'GET /seller/orders/{id}/tracking: the label, the carrier events newest first, delivered_at with delivered_by_scan, and attention when the carrier could not deliver.',
    inputSchema: { order_id: UUID },
  }, async ({ order_id }) => run(() => api.get(`/seller/orders/${order_id}/tracking`)));
  server.registerTool('commercebook_shipping_label', {
    title: 'Print a shipping label',
    description: 'GET /seller/orders/{id}/label: the order\u2019s labels (the outbound label and any return label), each with a link to its PDF that lasts 10 minutes. Ask again for a new link.',
    inputSchema: { order_id: UUID },
  }, async ({ order_id }) => run(() => api.get(`/seller/orders/${order_id}/label`)));
  server.registerTool('commercebook_shipping_return_label', {
    title: 'Buy a return label',
    description: 'POST /seller/returns/{id}/label: the label of a return by mail, from the shopper to the return address, charged to the side the return names. Past the key\u2019s confirm amount or 30-day cap it answers 202 pending_owner_confirmation and waits for the owner.',
    inputSchema: { return_id: UUID, operation_id: OPID },
  }, async ({ return_id, ...b }) => run(() => api.post(`/seller/returns/${return_id}/label`, b)));
  server.registerTool('commercebook_market_order_tracking', {
    title: 'Tracking of an order you placed',
    description: 'GET /market/orders/{id}/tracking: the carrier, the tracking number, the events, and delivered_at from the carrier scan.',
    inputSchema: { order_id: UUID },
  }, async ({ order_id }) => run(() => api.get(`/market/orders/${order_id}/tracking`)));
  server.registerTool('commercebook_shipping_address_check', {
    title: 'Check a delivery address',
    description: 'POST /shipping/address-check: deliverable or not, the residential flag, and the corrected form when the carrier writes it differently. Pass the same address as ship_to to commercebook_market_order_place.',
    inputSchema: { address: ADDRESS },
  }, async (b) => run(() => api.post('/shipping/address-check', b)));
}
