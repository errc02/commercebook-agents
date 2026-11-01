/**
 * SPEC-68 Part B (migration 102): requests on the book and the quotes against them, one tool per operation of
 * netlify/functions/lib/openapi-intents.ts. "Request" is the word for the owner; the API keeps "intent". Reading the
 * open requests needs no key, so commercebook_market_intents is also on a connection without one. The buyer tools are
 * every key's (a buyer key, or a warehouse or seller key buying for its member); the commercebook_seller_* tools are a
 * seller key's. Registered once from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';
import { oneQuantity } from './market-tools.js';
import { registerNegotiationTools } from './negotiation-tools.js';

export const INTENT_KEYLESS_TOOL_NAMES = ['commercebook_market_intents'] as const;
export const INTENT_BUYER_TOOL_NAMES = [
  ...INTENT_KEYLESS_TOOL_NAMES,
  'commercebook_intent_create', 'commercebook_intent_withdraw', 'commercebook_intent_quotes', 'commercebook_intent_quote_accept', 'commercebook_intent_quote_decline',
  // CB-969 (185): watch and buy.
  'commercebook_watch_list', 'commercebook_watch_withdraw',
] as const;
export const INTENT_SELLER_TOOL_NAMES = ['commercebook_seller_intents', 'commercebook_seller_quote', 'commercebook_seller_quote_withdraw'] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    if (e instanceof ApiError) return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
  }
}

const CATEGORY = z.string().regex(/^[a-z][a-z0-9_]{1,59}$/).describe('A category key, lower case with underscores (for example packaging, office_supplies, industrial_equipment).');

/** SPEC-71: the hints the Claude and ChatGPT directories ask of every tool; a read of CommerceBook's own public data. */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

function registerList(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_market_intents', {
    title: 'Read the open requests',
    annotations: READ_ONLY,
    description: 'GET /market/intents: the demand side of the book. Every open public request (an intent in the API) with its title, category, quantity, the most the buyer pays each (ceiling_unit_cents; a band when the buyer hid it), the state it goes to, the expiry and the open quotes; no buyer is named. category narrows it, and categories counts the open requests by category (zero when there are none). With a key the answer adds mine, the member’s own requests in every state. No key needed.',
    inputSchema: { category: CATEGORY.optional(), q: z.string().max(200).optional().describe('Words; each must match a whole word of the request title (stretch finds stretch wrap, never stretcher).'), limit: z.number().int().min(1).max(200).optional() },
  }, async (args) => run(() => api.get('/market/intents', args)));
}

/** The read tool only: a connection with no key. */
export function registerIntentKeylessTools(server: McpServer, api: ApiClient): void {
  registerList(server, api);
}

export function registerIntentTools(server: McpServer, api: ApiClient): void {
  registerList(server, api);
  // CB-967: private offers with counters (negotiation-tools.ts).
  registerNegotiationTools(server, api);
  server.registerTool('commercebook_intent_create', {
    title: 'Post a request',
    description: 'POST /market/intents: posts what the owner wants, at no cost: title, category, qty and ceiling_unit_cents (the most the owner pays each, in cents). Optional: ceiling_visible false (sellers see a band), destination (a state or a ZIP), notes for sellers, visibility private (kept off the book; only offers that match it tell the owner), notify (email the owner when a quote lands or an offer at or under the ceiling appears; true by default), expires_in_days (1 to 90, 30 by default) or expires_at. Sellers with a live product in the category are told at once (sellers_told), and matches_now lists the live offers already at or under the ceiling. Needs the orders activity (the key of a buyer or a seller) or costs (the key of a warehouse). The sentence for the owner: "I registered your need for <title> at a ceiling of $X each, at no cost; you will be told when a quote lands under it." Watch and buy (CB-969): with auto_buy true this key completes the purchase with no further call when a live offer (the product lot_id names, or the category with every word of the title in the product title) or a seller’s quote meets the ceiling with shipping to destination_zip included, from a verified seller, within every limit on the key; a limit leaves it waiting for the owner and nothing is bought. Set auto_buy only when the owner said to buy without asking again. Before setting it, repeat the ceiling back to the owner as the delivered price for each unit and wait for the yes. Never raise a ceiling on your own. repeat true buys again at each new match until withdrawn. The answer carries watch (its state). The sentence for the owner: "I will buy <title> for you when a verified seller meets $X each delivered, within your limits; anything over a limit waits for your approval."',
    inputSchema: {
      title: z.string().min(1).max(120),
      category: CATEGORY.optional().describe('A category key. Required unless lot_id names the one product watched.'),
      // CB-948 (D5): qty, as on a quote; quantity is the same field.
      qty: z.number().int().min(1).optional().describe('How many. Required unless quantity is sent.'),
      quantity: z.number().int().min(1).optional().describe('The same as qty.'),
      ceiling_unit_cents: z.number().int().min(1),
      ceiling_visible: z.boolean().optional(),
      destination: z.string().min(2).max(200).optional(),
      destination_zip: z.string().regex(/^[0-9]{5}$/).optional().describe('The five-digit ZIP the goods go to; sellers see it on the request.'),
      unit: z.enum(['each', 'roll', 'case', 'pack', 'box', 'pallet', 'other']).optional().describe('The unit of sale qty counts (each, roll, case, pack, box, pallet or other).'),
      unit_note: z.string().min(1).max(120).optional().describe('What one unit holds, for example 6 rolls a case.'),
      notes: z.string().max(1000).optional(),
      visibility: z.enum(['public', 'private']).optional(),
      notify: z.boolean().optional(),
      expires_in_days: z.number().int().min(1).max(90).optional(),
      // CB-969 (185): watch and buy.
      auto_buy: z.boolean().optional().describe('Buy with no further call when a match meets the ceiling with shipping to destination_zip, within the key’s limits. Only when the owner said to buy without asking again; needs ceiling_unit_cents and destination_zip.'),
      repeat: z.boolean().optional().describe('With auto_buy: buy again at each new match until the request is withdrawn or expires. False by default.'),
      expires_at: z.string().datetime({ offset: true }).optional().describe('When the request and its watch end, ISO 8601 (1 hour to 90 days; 30 days by default).'),
      lot_id: z.string().uuid().optional().describe('Watch one product: the match is its price with shipping. The category may then be left out.'),
    },
  }, async ({ qty, quantity, ...rest }) => {
    const n = oneQuantity(qty, quantity);
    return typeof n === 'number' ? run(() => api.post('/market/intents', { ...rest, qty: n })) : n;
  });
  // CB-969 (185): the watches and what they bought; withdrawing a watch withdraws its request.
  server.registerTool('commercebook_watch_list', {
    title: 'Read your watches',
    annotations: READ_ONLY,
    description: 'GET /market/watches: the owner’s requests with auto_buy, open ones first, each with its watch: the state (watching, waiting_approval when a limit stopped a purchase and the owner approves it, waiting_owner when only the owner can change what stopped it, bought, withdrawn, expired), the reason, the delivered ceiling and every purchase with its order number and payment. Needs the orders activity (any key of a warehouse). When a watch waits, tell the owner why in one sentence and where to approve it: on the request in the Shop, or at Agent access, Waiting for you.',
    inputSchema: { limit: z.number().int().min(1).max(200).optional() },
  }, async (args) => run(() => api.get('/market/watches', args)));
  server.registerTool('commercebook_watch_withdraw', {
    title: 'Withdraw a watch',
    description: 'DELETE /market/watches/{id}: stops a watch and withdraws its request; its open quotes close and each seller is told. Purchases already made stand. 404 when the id is not one of the owner’s watches. Needs the orders activity (costs on a warehouse key).',
    inputSchema: { intent_id: z.string().uuid() },
  }, async ({ intent_id }) => run(() => api.request('DELETE', `/market/watches/${intent_id}`)));
  server.registerTool('commercebook_intent_withdraw', {
    title: 'Withdraw a request',
    description: 'DELETE /market/intents/{id}: takes an open request of this member off the book; its open quotes close with it and each seller is told.',
    inputSchema: { intent_id: z.string().uuid() },
  }, async ({ intent_id }) => run(() => api.request('DELETE', `/market/intents/${intent_id}`)));
  server.registerTool('commercebook_intent_quotes', {
    title: 'Read the quotes on a request',
    description: 'GET /market/intents/{id}/quotes: the request and every quote on it, open ones first by total: the quantity, the price each, the shipping, the total, the expiry (72 hours, or the request’s), the seller’s note, the product with its listed price at the quantity, and the seller’s tier and three numbers (delivered, on time, accurate).',
    inputSchema: { intent_id: z.string().uuid() },
  }, async ({ intent_id }) => run(() => api.get(`/market/intents/${intent_id}/quotes`)));
  server.registerTool('commercebook_intent_quote_accept', {
    title: 'Accept a quote',
    description: 'POST /market/intents/{id}/quotes/{quote}/accept: the order at the quote’s price, through the same order path and payment as commercebook_market_order_place (method balance, or card / saved with the owner’s saved card; without method the balance when it covers the total, else the saved card). The fee is the market fee. The request is filled and the other quotes close. Needs the payments activity; the spending cap and the confirm amount apply to the buyer total, so an order above the confirm amount waits for the owner (202 pending_owner_confirmation), and an order past the monthly budget is refused (409 over_monthly_budget). A shipped quote takes ship_to, checked once before payment. po_number is the owner’s purchase order number (up to 64 characters). Send it only when the owner’s company uses purchase order numbers and the owner gave you one; never make one up.',
    inputSchema: {
      intent_id: z.string().uuid(),
      quote_id: z.string().uuid(),
      method: z.enum(['balance', 'card', 'saved']).optional(),
      po_number: z.string().max(64).optional(),
      ship_to: z.object({ name: z.string().max(120).optional(), company: z.string().max(120).optional(), street1: z.string().max(120).optional(), street2: z.string().max(120).optional(), city: z.string().max(80), state: z.string().max(2), zip: z.string().max(10).optional(), phone: z.string().max(30).optional(), residential: z.boolean().optional() }).optional(),
    },
  }, async ({ intent_id, quote_id, ...body }) => run(() => api.post(`/market/intents/${intent_id}/quotes/${quote_id}/accept`, body)));
  server.registerTool('commercebook_intent_quote_decline', {
    title: 'Decline a quote',
    description: 'POST /market/intents/{id}/quotes/{quote}/decline: closes one quote and tells the seller, with the reason when one is given (300 characters). The request stays open.',
    inputSchema: { intent_id: z.string().uuid(), quote_id: z.string().uuid(), reason: z.string().max(300).optional() },
  }, async ({ intent_id, quote_id, ...body }) => run(() => api.post(`/market/intents/${intent_id}/quotes/${quote_id}/decline`, body)));

  server.registerTool('commercebook_seller_intents', {
    title: 'Read the requests in your categories',
    description: 'GET /seller/intents: the open public requests in the categories of the seller’s live products (or the category named), newest first, with the buyer’s notes and the seller’s own quote on each; and the seller’s quotes in every state. No buyer is named. Needs catalog read.',
    inputSchema: { category: CATEGORY.optional(), q: z.string().max(200).optional().describe('Words; each must match a whole word of the request title (stretch finds stretch wrap, never stretcher).'), limit: z.number().int().min(1).max(200).optional() },
  }, async (args) => run(() => api.get('/seller/intents', args)));
  server.registerTool('commercebook_seller_quote', {
    title: 'Quote a request',
    description: 'POST /seller/intents/{id}/quote: the seller’s price each for a request, with one of its live products (lot_id). The product’s live offer must cover the quantity (qty defaults to the request’s and may be less); the price is at most the buyer’s ceiling (409 quote_above_ceiling) and, when the seller’s policies set offer_floor_pct, at least that share of the listed price (409 quote_below_floor:<cents>). shipping_cents is the delivered shipping to the request’s state (0 for pickup). The quote holds 72 hours or until the request expires; a new quote on the same request replaces the seller’s open one. The buyer is told. Needs catalog write.',
    inputSchema: {
      intent_id: z.string().uuid(),
      lot_id: z.string().uuid(),
      unit_price_cents: z.number().int().min(1),
      qty: z.number().int().min(1).optional(),
      shipping_cents: z.number().int().min(0).optional(),
      note: z.string().max(500).optional(),
    },
  }, async ({ intent_id, ...body }) => run(() => api.post(`/seller/intents/${intent_id}/quote`, body)));
  server.registerTool('commercebook_seller_quote_withdraw', {
    title: 'Withdraw a quote',
    description: 'DELETE /seller/quotes/{id}: closes an open quote of the seller; the buyer can no longer accept it. Needs catalog write.',
    inputSchema: { quote_id: z.string().uuid() },
  }, async ({ quote_id }) => run(() => api.request('DELETE', `/seller/quotes/${quote_id}`)));
}
