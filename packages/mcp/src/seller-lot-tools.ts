/**
 * SPEC-58 (migration 087): the lot edit tool, one per operation of netlify/functions/lib/openapi-seller-lot.ts. A
 * seller key with catalog write, or the owner key of a seller. Registered once from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';
import { PRICE_SCHEDULE_TEXT, PRICE_TIERS, SCHEDULE_KIND } from './tools.js';

export const SELLER_LOT_TOOL_NAMES = ['commercebook_seller_lot_update'] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    if (e instanceof ApiError) return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
  }
}

export function registerSellerLotTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_seller_lot_update', {
    title: 'Edit a product, or publish a draft',
    description:
      'PATCH /seller/catalog/lots/{id}: the seller product page’s edit. Send only the fields to change: title, description (empty clears it), condition (new, open_box, used, refurbished, defective), quantity on hand (a new quantity confirms the count, and now becomes its count date; never below what is reserved or sold; 0 makes a live product sold out), unit_price_cents, min_qty, photos (up to 11 https links, the first is the main photo). publish true publishes a draft once the seller can sell and the product has stock and a price. price_schedule sets price by quantity (the first tier becomes the unit price), null goes back to one price, schedule_kind alone changes how the tiers apply: ' + PRICE_SCHEDULE_TEXT.volume + ' ' + PRICE_SCHEDULE_TEXT.graduated + ' ship_from names the address it ships from, by label or id (buyers see only its city and state). The answer names the fields that changed and the product state.',
    inputSchema: {
      lot_id: z.string().uuid(),
      title: z.string().min(1).max(150).optional(),
      description: z.string().max(5000).optional(),
      condition: z.enum(['new', 'open_box', 'used', 'refurbished', 'defective']).optional(),
      quantity: z.number().int().min(0).optional(),
      unit_price_cents: z.number().int().min(1).optional(),
      min_qty: z.number().int().min(1).optional(),
      photos: z.array(z.string().url()).max(11).optional(),
      // SPEC-60 (093): the product's own return terms; return_terms null inherits the category or default terms.
      return_window_days: z.number().int().min(0).max(365).optional(),
      return_method: z.enum(['by_mail', 'same_warehouse', 'no_returns']).optional(),
      restocking_fee_pct: z.number().min(0).max(100).optional(),
      return_terms: z.null().optional().describe('null clears the product\u2019s own return terms, so it inherits again.'),
      // SPEC-68: price by quantity.
      price_schedule: PRICE_TIERS.nullable().optional(),
      schedule_kind: SCHEDULE_KIND.optional(),
      // SPEC-83 (115): where the product ships from.
      ship_from: z.string().min(1).max(60).nullable().optional().describe('The ship-from address by label or id (commercebook_seller_ship_from_list); null follows the default. A product stored at a warehouse ships from the warehouse.'),
      publish: z.boolean().optional(),
      operation_id: z.string().min(8).max(96).optional(),
    },
  }, async ({ lot_id, ...b }) => run(() => api.patch(`/seller/catalog/lots/${lot_id}`, b)));
}
