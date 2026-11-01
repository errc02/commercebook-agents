/**
 * SPEC-38 builder C: the catalog import tools, one per operation of netlify/functions/lib/openapi-catalog-import.ts.
 * A seller key (or the owner key of a seller). Registered once from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

const UUID = z.string().uuid();
const KIND = z.enum(['google_rss', 'google_tsv', 'shopify_csv', 'ebay_csv', 'acp_json', 'template_csv', 'template_json']);
const SCHEDULE = z.enum(['none', 'hourly', 'daily']);

export const CATALOG_IMPORT_TOOL_NAMES = [
  'commercebook_seller_catalog_import', 'commercebook_seller_feeds_list', 'commercebook_seller_feed_add',
  'commercebook_seller_feed_fetch', 'commercebook_seller_feed_remove',
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

export function registerCatalogImportTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_seller_catalog_import', {
    title: 'Import a catalog file or feed',
    description: 'POST /seller/catalog/import: reads a Google Shopping XML or TSV feed, a Shopify products CSV, an eBay Seller Hub CSV or a products JSON (by url, a feed read up to 10 MB, or the file text as content, up to 4.5 MB) and previews (dry_run true) or writes the products, with created, updated and skipped rows and their reasons.',
    inputSchema: {
      url: z.string().url().max(2000).optional().describe('A feed address to fetch now (http or https).'),
      content: z.string().optional().describe('The file text, when there is no URL.'),
      file_name: z.string().max(300).optional(),
      kind: KIND.optional().describe('Read from the content when left out.'),
      dry_run: z.boolean().optional().describe('true: preview only, nothing written.'),
      default_quantity: z.number().int().min(0).max(100000).optional().describe('The quantity for rows that carry none (Google feeds).'),
      schedule: SCHEDULE.optional().describe('For a URL that writes: save the feed with this schedule.'),
    },
  }, async (b) => run(() => api.post('/seller/catalog/import', b)));
  server.registerTool('commercebook_seller_feeds_list', {
    title: 'Saved feeds',
    description: 'GET /seller/catalog/feeds: the saved feed URLs and imported files with the last fetch, status, counts and the last five runs.',
    inputSchema: {},
  }, async () => run(() => api.get('/seller/catalog/feeds')));
  server.registerTool('commercebook_seller_feed_add', {
    title: 'Save a feed URL',
    description: 'POST /seller/catalog/feeds: saves a feed URL with its schedule (none, hourly or daily); the hourly function fetches it when due.',
    inputSchema: { url: z.string().url().max(2000), kind: KIND.optional(), schedule: SCHEDULE.optional(), default_quantity: z.number().int().min(0).max(100000).optional() },
  }, async (b) => run(() => api.post('/seller/catalog/feeds', b)));
  server.registerTool('commercebook_seller_feed_fetch', {
    title: 'Fetch a feed now',
    description: 'POST /seller/catalog/feeds/{id}/fetch: fetches the saved feed now and imports it (dry_run true previews), with a run record.',
    inputSchema: { feed_id: UUID, dry_run: z.boolean().optional() },
  }, async ({ feed_id, ...b }) => run(() => api.post(`/seller/catalog/feeds/${feed_id}/fetch`, b)));
  server.registerTool('commercebook_seller_feed_remove', {
    title: 'Remove a feed',
    description: 'DELETE /seller/catalog/feeds/{id}: removes the saved feed and its runs; the products it loaded stay.',
    inputSchema: { feed_id: UUID },
  }, async ({ feed_id }) => run(() => api.del(`/seller/catalog/feeds/${feed_id}`)));
}
