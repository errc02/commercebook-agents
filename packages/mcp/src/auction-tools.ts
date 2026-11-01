/**
 * CB-963 (migration 170): auctions with a reserve, one operation per path of netlify/functions/lib/openapi-auctions.ts.
 * The intent tools reach them as commercebook_market actions auctions and auction (no key), commercebook_buy actions
 * auction_status, auction_bid and my_bids, and commercebook_seller_orders actions auction_open, auction_status,
 * auction_close_early and auctions_list (intent-table.ts). Reading the auctions needs no key, so commercebook_auctions
 * and commercebook_auction are also on a connection without one. CB-983: an action on a keyed tool is keyed, so
 * commercebook_buy action auction_status runs commercebook_auction_status, the same read registered as a keyed
 * operation (a connection without a key answers it with needs_key). Registered once from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

export const AUCTION_KEYLESS_TOOL_NAMES = ['commercebook_auctions', 'commercebook_auction'] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    if (e instanceof ApiError) return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
  }
}

/** A read of CommerceBook's own public data. */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const CATEGORY = z.string().regex(/^[a-z][a-z0-9_]{1,59}$/).describe('A category key, lower case with underscores (for example industrial_equipment).');

function registerReads(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_auctions', {
    title: 'Read the open auctions',
    annotations: READ_ONLY,
    description: 'GET /auctions: every open auction, the soonest close first: the product, the whole lot’s quantity, the current price, reserve_met, next_min_cents (the lowest maximum a new bid may have), the bid count and closes_at. No bidder is named and the reserve is never shown. category narrows it. No key needed; with a key each auction adds your maximum and whether you lead.',
    inputSchema: { category: CATEGORY.optional(), limit: z.number().int().min(1).max(200).optional() },
  }, async (args) => run(() => api.get('/auctions', args)));
  server.registerTool('commercebook_auction', {
    title: 'Read one auction',
    annotations: READ_ONLY,
    description: 'GET /auctions/{id}: one auction, open or closed: the current price, reserve_met, next_min_cents, the bid count, closes_at and seconds_left, and the outcome once closed. No key needed; with a key it adds your_max_cents, you_lead and, once you won, your_order_id.',
    inputSchema: { auction_id: z.string().uuid() },
  }, async ({ auction_id }) => run(() => api.get(`/auctions/${auction_id}`)));
}

/** The reads only: a connection with no key. */
export function registerAuctionKeylessTools(server: McpServer, api: ApiClient): void {
  registerReads(server, api);
}

export function registerAuctionTools(server: McpServer, api: ApiClient): void {
  registerReads(server, api);
  // CB-983: the buyer's read of one auction with a key (commercebook_buy action auction_status).
  server.registerTool('commercebook_auction_status', {
    title: 'Read one auction you may bid in',
    annotations: READ_ONLY,
    description: 'GET /auctions/{id}: one auction, open or closed: the current price, reserve_met, next_min_cents, the bid count, closes_at and seconds_left, and the outcome once closed, with your_max_cents, you_lead and, once you won, your_order_id. The same read without a key is commercebook_auction.',
    inputSchema: { auction_id: z.string().uuid() },
  }, async ({ auction_id }) => run(() => api.get(`/auctions/${auction_id}`)));
  server.registerTool('commercebook_auction_bid', {
    title: 'Bid in an auction',
    description: 'POST /auctions/{id}/bids: the owner’s maximum for the whole lot, in cents (proxy bidding: CommerceBook raises the bid for the owner one increment at a time, up to the maximum). A new bidder bids at least next_min_cents (409 bid_too_low names the current price); the leader may only raise its own maximum. A lot that ships needs destination (the ZIP or the address the goods go to); the price includes delivery there. Needs the payments activity, and a saved card, a bank account or a balance that covers the maximum. The maximum counts against the key’s limits until you are outbid or the auction closes: over the confirm amount or the 30-day cap the bid waits for the owner (202 pending_owner_confirmation). At the close the winner’s order is made at the current price and paid from the balance or the saved card. The sentence for the owner: "I bid up to $X on <product>; I lead at $Y" or "another bidder is higher; the next bid is at least $Z".',
    inputSchema: {
      auction_id: z.string().uuid(),
      max_cents: z.number().int().min(100).describe('The most the owner pays for the whole lot, in cents. Private.'),
      destination: z.string().min(2).max(200).optional().describe('Where a shipped lot goes: a ZIP or an address line. Required when the lot ships.'),
    },
  }, async ({ auction_id, ...body }) => run(() => api.post(`/auctions/${auction_id}/bids`, body)));
  server.registerTool('commercebook_auction_bids_mine', {
    title: 'The auctions you bid on',
    annotations: READ_ONLY,
    description: 'GET /auctions/mine: every auction you bid on, newest first, with your maximum, whether you lead, the current price, the close, and the order once you won (your_order_id; pay and track it as any order).',
    inputSchema: { limit: z.number().int().min(1).max(200).optional() },
  }, async (args) => run(() => api.get('/auctions/mine', args)));

  server.registerTool('commercebook_seller_auctions', {
    title: 'Your auctions',
    annotations: READ_ONLY,
    description: 'GET /seller/auctions: your auctions, open first, each with your reserve, the current price, reserve_met, the bid count, the close and the outcome; lot_id narrows it to one product; auctions_allowed says whether Allow auctions is on. Needs catalog read.',
    inputSchema: { lot_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(200).optional() },
  }, async (args) => run(() => api.get('/seller/auctions', args)));
  server.registerTool('commercebook_seller_auction_open', {
    title: 'Open an auction',
    description: 'POST /seller/auctions: a timed auction on one published product (lot_id), the whole lot as listed: start_cents, a private reserve_cents (at least the start) and a close in days (1 to 14) or closes_at. Allowed when the owner turned on Allow auctions in the seller policies, the account is verified and takes payouts, and no other auction is open on the product. While it is open the product’s fixed price is off sale. The prices are for the whole lot and include shipping when the product ships. Needs catalog write. Ask the owner for the reserve before you open one.',
    inputSchema: {
      lot_id: z.string().uuid(),
      start_cents: z.number().int().min(100),
      reserve_cents: z.number().int().min(100).describe('The lowest price the owner accepts for the whole lot. Private.'),
      days: z.number().int().min(1).max(14).optional().describe('Days until the close; or send closes_at.'),
      closes_at: z.string().optional().describe('The close as an ISO 8601 time, between 1 and 14 days from now; or send days.'),
    },
  }, async (body) => run(() => api.post('/seller/auctions', body)));
  server.registerTool('commercebook_seller_auction', {
    title: 'One of your auctions',
    annotations: READ_ONLY,
    description: 'GET /seller/auctions/{id}: one of your auctions with your reserve, the current price, reserve_met, the bid count, closes_at, the outcome, and the order once sold. Needs catalog read.',
    inputSchema: { auction_id: z.string().uuid() },
  }, async ({ auction_id }) => run(() => api.get(`/seller/auctions/${auction_id}`)));
  server.registerTool('commercebook_seller_auction_close', {
    title: 'Close an auction early',
    description: 'POST /seller/auctions/{id}/close: closes an open auction of yours that has no bid; the product is back at its fixed price. An auction with a bid runs to its close (409 auction_has_bids). Needs catalog write.',
    inputSchema: { auction_id: z.string().uuid() },
  }, async ({ auction_id }) => run(() => api.post(`/seller/auctions/${auction_id}/close`, {})));
}
