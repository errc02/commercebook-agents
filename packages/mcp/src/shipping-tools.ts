/**
 * SPEC-37: the shipping tools, one per operation of the Shipping tag (netlify/functions/lib/openapi-shipping.ts).
 * The profile tools need a seller key; commercebook_shipping_quote takes any key. Registered once from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

const UUID = z.string().uuid();
const REGION = z.enum(['continental_us', 'alaska_hawaii', 'us_territories', 'military', 'canada', 'international']);
const SERVICE = z.enum(['standard', 'expedited']);
const RULE = z.object({
  region: REGION,
  service: SERVICE.optional(),
  served: z.boolean().optional().describe('false: you do not ship there.'),
  rate_kind: z.enum(['free', 'flat_per_order', 'per_item', 'by_weight_band', 'calculated']).optional(),
  amount_cents: z.number().int().min(0).optional().describe('Per order. For calculated: the amount used when a product has no weight and size.'),
  per_item_cents: z.number().int().min(0).optional(),
  bands: z.array(z.object({ max_lb: z.number().positive(), cents: z.number().int().min(0) })).optional(),
  transit_days_min: z.number().int().min(0).max(60).optional(),
  transit_days_max: z.number().int().min(0).max(60).optional(),
});
const PROFILE = {
  name: z.string().min(1).max(80).optional(),
  handling_days: z.number().int().min(0).max(30).optional(),
  handling_cents: z.number().int().min(0).max(100000).optional(),
  is_default: z.boolean().optional(),
  rules: z.array(RULE).max(12).optional().describe('Replaces the rules. A region not listed for standard is not served.'),
};

export const SHIPPING_TOOL_NAMES = [
  'commercebook_shipping_profiles', 'commercebook_shipping_profile_create', 'commercebook_shipping_profile_update',
  'commercebook_shipping_profile_delete', 'commercebook_shipping_profile_set_default', 'commercebook_shipping_assign',
  'commercebook_shipping_rate_card', 'commercebook_shipping_order_actual', 'commercebook_shipping_quote',
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

export function registerShippingTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_shipping_profiles', { title: 'Shipping profiles', description: 'GET /seller/shipping/profiles: your profiles with their rules, the default and the regions you serve.', inputSchema: {} },
    async () => run(() => api.get('/seller/shipping/profiles')));
  server.registerTool('commercebook_shipping_profile_create', { title: 'Create a shipping profile', description: 'POST /seller/shipping/profiles: a named profile (for example Heavy items) with its region rules.', inputSchema: { ...PROFILE, name: z.string().min(1).max(80) } },
    async (b) => run(() => api.post('/seller/shipping/profiles', b)));
  server.registerTool('commercebook_shipping_profile_update', { title: 'Change a shipping profile', description: 'PATCH /seller/shipping/profiles/{id}: name, handling days, handling cents, rules.', inputSchema: { profile_id: UUID, ...PROFILE } },
    async ({ profile_id, ...b }) => run(() => api.patch(`/seller/shipping/profiles/${profile_id}`, b)));
  server.registerTool('commercebook_shipping_profile_delete', { title: 'Delete a shipping profile', description: 'POST /seller/shipping/profiles/{id}/delete: not the default; its offers use the default.', inputSchema: { profile_id: UUID } },
    async ({ profile_id }) => run(() => api.post(`/seller/shipping/profiles/${profile_id}/delete`, {})));
  server.registerTool('commercebook_shipping_profile_set_default', { title: 'Set the default profile', description: 'POST /seller/shipping/profiles/{id}/default: offers with no profile use this one.', inputSchema: { profile_id: UUID } },
    async ({ profile_id }) => run(() => api.post(`/seller/shipping/profiles/${profile_id}/default`, {})));
  server.registerTool('commercebook_shipping_assign', { title: 'Assign a shipping profile', description: 'POST /seller/shipping/assign: a profile for offers or for the open offers of products (lot_ids); profile_id null puts them back on the default.', inputSchema: { profile_id: UUID.nullable(), offer_ids: z.array(UUID).max(1000).optional(), lot_ids: z.array(UUID).max(1000).optional() } },
    async (b) => run(() => api.post('/seller/shipping/assign', b)));
  server.registerTool('commercebook_shipping_rate_card', { title: 'Upload a rate card', description: 'POST /seller/shipping/rate-card: your carrier rates for an origin ZIP3 in the rates.json shape (zones_by_zip3, services[].weight_lbs_to_rates); calculated rules use it.', inputSchema: { origin_zip3: z.string().regex(/^\d{3}$/), card: z.record(z.string(), z.unknown()), label: z.string().max(120).optional() } },
    async (b) => run(() => api.post('/seller/shipping/rate-card', b)));
  server.registerTool('commercebook_shipping_order_actual', { title: 'Record the label cost', description: 'POST /seller/orders/{id}/shipping-actual: what the label cost; the statement shows shipping quote vs actual.', inputSchema: { order_id: UUID, shipping_actual_cents: z.number().int().min(0), source: z.enum(['label', 'rocketfuel', 'carrier_invoice', 'manual']).optional() } },
    async ({ order_id, ...b }) => run(() => api.post(`/seller/orders/${order_id}/shipping-actual`, b)));
  server.registerTool('commercebook_shipping_quote', {
    title: 'Shipping to a destination',
    description: 'POST /shipping/quote: what an offer costs to ship and how many days, from the seller profile, with the goods at that quantity (goods_cents, total_cents), the buyer total by payment method (card, ach, balance; the same price with shipping for each, since the seller pays the processing fee) and the quantity check (requested, available; ok false with reason quantity when the offer has fewer). A region the seller does not serve comes back refused with served_regions. Calculated shipping returns a rate_id for the market quote.',
    inputSchema: {
      offer_id: UUID, qty: z.number().int().min(1).optional(), service: SERVICE.optional(),
      destination: z.union([z.string().min(2).max(300), z.object({ country: z.string().optional(), state: z.string().optional(), zip: z.string().optional(), residential: z.boolean().optional() })]).describe('TX, US-TX, 77043, an address line, or {country, state, zip, residential}.'),
    },
  }, async (b) => run(() => api.post('/shipping/quote', b)));
}
