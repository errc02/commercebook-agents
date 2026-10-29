/**
 * SPEC-72: the seller's Shopify channel tools, one per operation of netlify/functions/lib/openapi-shopify.ts. A seller
 * key (or the owner key of a seller). Registered once from server.ts; the commercebook_seller_ prefix keeps them on a
 * seller key's list (scope.ts).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

export const SHOPIFY_TOOL_NAMES = ['commercebook_seller_shopify_status', 'commercebook_seller_shopify_sync', 'commercebook_seller_checkout_mode'] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    if (e instanceof ApiError) return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
  }
}

export function registerShopifyTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_seller_shopify_status', {
    title: 'Shopify channel status',
    description: 'GET /seller/shopify: the seller’s CommerceBook sales channel in Shopify: whether a store is connected, the last sync with its counts and skipped rows, the products linked and live, the CommerceBook orders sent to the store, Stripe, and the open requests in the store’s categories. With shop (<x>.myshopify.com) it also answers install_url, a single-use link (15 minutes) the owner opens to install the app on that store for this seller; once installed the catalog is on the book within the hour. Needs catalog read.',
    inputSchema: {
      shop: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/).optional().describe('The store address, ending in .myshopify.com: also answer an install link for it.'),
    },
  }, async (args) => run(() => api.get('/seller/shopify', args)));
  server.registerTool('commercebook_seller_shopify_sync', {
    title: 'Sync the Shopify catalog now',
    description: 'POST /seller/shopify/sync: reads the connected store’s products now (variants, prices, the available quantity at the first active location, pictures, SKU, barcode, the commercebook.price_schedule metafield) and writes them as lots; a product not active in Shopify stays a draft and a quantity of 0 takes the lot off the book. The hourly sync and the product webhooks do the same on their own. Needs catalog write.',
    inputSchema: {},
  }, async () => run(() => api.post('/seller/shopify/sync', {})));
  // SPEC-86: how the seller's buyers pay.
  server.registerTool('commercebook_seller_checkout_mode', {
    title: 'How your buyers pay',
    description: 'GET /seller/checkout-mode (POST /seller/checkout-mode with mode): how the seller\'s buyers pay. commercebook: on CommerceBook through Stripe; the CommerceBook refund and dispute rules apply; the fee is taken from each sale. shopify: on the seller\'s own Shopify checkout; Shopify holds the money; the store\'s refund and dispute policies apply; the fee (8 percent, at most $500 an order) is billed once a month to the saved card. Without mode it reads the mode, whether Shopify checkout is available (an installed store) and the saved card. With mode and confirm true it switches (shopify needs an installed store and a saved card). Needs payouts read, and payouts write to switch.',
    inputSchema: {
      mode: z.enum(['commercebook', 'shopify']).optional().describe('Switch to this mode; leave it out to read the mode.'),
      confirm: z.boolean().optional().describe('true to make the switch; the owner is told what changes first.'),
    },
  }, async (args) => run(() => (args.mode ? api.post('/seller/checkout-mode', { mode: args.mode, ...(args.confirm !== undefined ? { confirm: args.confirm } : {}) }) : api.get('/seller/checkout-mode', {}))));
}
