/**
 * SPEC-68 Part C (migration 104): the public book in one read, GET /market/book (netlify/functions/lib/api-book.ts and
 * lib/openapi-book.ts). No key needed, so commercebook_market_book is on a connection without a key and on every keyed
 * connection (scope.ts COMMON_TOOL_NAMES). Registered once from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiClient, ApiError } from './client.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const BOOK_TOOL_NAMES = ['commercebook_market_book'] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    if (e instanceof ApiError) return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
  }
}

export function registerBookTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_market_book', {
    annotations: READ_ONLY,
    title: 'Read the book right now',
    description: 'GET /market/book: what is on the market and what buyers ask for, by category, with live numbers only. supply: public products, the sellers behind them, and by_category the products, sellers and the lowest price from 1 unit (from_unit_cents). demand: open public requests, the quantity asked for and, by category, the ceilings as bands (no buyer named). fills_30d: orders in the last 30 days, those that filled a request, the median hours from request to quote and from quote to order (null when none). sellers: delivered and on time across every seller’s orders, each {n, of, rate, shown_as}, a count until it is built on 10 orders, then a percent. Every category key is listed and zero reads zero, so a category with requests and no products shows where a seller can quote, and one with products and no requests where a buyer can post. Cached 15 minutes. No key needed.',
    inputSchema: {},
  }, async () => run(() => api.get('/market/book')));
}
