/**
 * SPEC-39 (CB-760, CB-761): the buyer tools, one per operation of netlify/functions/lib/openapi-market.ts. Every key
 * kind reaches them (a buyer key, or a warehouse or seller key buying for its member). Searching the book and reading a
 * lot need no key, so the two read tools are also on a connection without one. Placing an order pays with the owner's
 * balance or saved card and needs the payments activity. Registered once from server.ts. SPEC-56 adds the result sheet:
 * one page with the agent's ranked candidates, sent to the owner as one link (POST /market/sheets and its reads).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

/** The tools of a connection with no key (the buyer briefing's scope). SPEC-63 adds the seller record. */
export const MARKET_KEYLESS_TOOL_NAMES = ['commercebook_market_search', 'commercebook_market_lot', 'commercebook_market_seller'] as const;
export const MARKET_TOOL_NAMES = [
  ...MARKET_KEYLESS_TOOL_NAMES,
  'commercebook_market_quote', 'commercebook_market_order_place', 'commercebook_market_orders', 'commercebook_market_order',
  'commercebook_market_order_confirm_delivery', 'commercebook_market_order_dispute', 'commercebook_market_order_rate',
  // SPEC-56: the result sheet.
  'commercebook_result_sheet', 'commercebook_result_sheets', 'commercebook_result_sheet_get', 'commercebook_result_sheet_delete',
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

/** SPEC-71: the hints the Claude and ChatGPT directories ask of every tool; a read of CommerceBook's own public data. */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

function registerReads(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_market_search', {
    title: 'Search the market',
    annotations: READ_ONLY,
    description: 'GET /market/search: the products for sale on CommerceBook, by words (a product matches any meaningful word of the query as a whole word, with an optional plural ending, so stretch never matches stretcher, and the products that match more words rank first) in the title, the category (its key, its name and its synonyms, so groom finds grooming), the item specifics, the brand or the part number; the description adds to the score and never makes a hit alone, and each item names its matched_fields and matched_terms; a query whose words match nothing answers no items, no_match true and nearest_categories with their counts; category (a key from commercebook_market_book), price per unit in cents (min_price, max_price), the ship-to state, the condition. Sorted by relevance, then price. Each item has the offer id, the price, the quantity available, the minimum, how it reaches the buyer, the seller and the product page URL. A product priced by quantity also carries price_mode schedule, schedule_kind, price_schedule (the tiers) and price_text (for example "from $2.40 each, 50 or more at $1.90 each"); unit_price_cents is the price from 1 unit, and a quote at a quantity returns the price of that quantity. A product sold in packs carries pack_size and reads its price per pack in price_text (for example "$9.14 per pack of 12"). No key needed.',
    inputSchema: {
      q: z.string().max(200).optional().describe('Words; a product matches any of them as a whole word of the title, the category, the specifics, the brand or the part number (a plural ending s or es matches too), and more matched words rank higher.'),
      query: z.string().max(200).optional().describe('The same as q, for an agent that names it query.'),
      category: z.string().max(80).optional().describe('A category key, exact (for example packaging, tools, home_garden). commercebook_market_book lists every key with its products and open requests.'),
      min_price: z.number().int().min(0).optional(),
      max_price: z.number().int().min(0).optional(),
      state: z.string().regex(/^[A-Za-z]{2}$/).optional().describe('Two-letter state the goods ship to.'),
      condition: z.string().max(40).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  }, async (args) => run(() => api.get('/market/search', args)));
  server.registerTool('commercebook_market_lot', {
    title: 'Read one product',
    annotations: READ_ONLY,
    description: 'GET /market/lots/{id}: one public product (lot_id) as its product page shows it (the count, the condition, the date the seller last confirmed the count, the photos, the shipping) with every active offer and the states it ships to. No key needed.',
    inputSchema: { lot_id: z.string().uuid() },
  }, async ({ lot_id }) => run(() => api.get(`/market/lots/${lot_id}`)));
  // SPEC-63: the seller record, the same jsonb as the page /sellers/{slug} and /docs/seller/{slug}.md.
  server.registerTool('commercebook_market_seller', {
    title: 'Read a seller record',
    annotations: READ_ONLY,
    description: 'GET /market/sellers/{slug} (seller_slug, or slug, its older name): the record CommerceBook computes for one seller (seller_slug of a search item or a product): the tier (new, standard or trusted, with founding beside it), the last 90 days and all time (delivered, on time, accurate, cancelled, disputed, refunded; each with n, of, rate and shown_as, a count until it is built on 10 orders, then a percent), the ratings kept apart (confirmed at delivery, rated by shoppers), the live products, where the goods are stored, and the terms a buyer accepts (return terms, the days to file a dispute, the payout days, offers below the listed price). The seller writes none of it. No key needed.',
    // SPEC-79: seller_slug, the field name of a search item and of the briefing; slug is kept as its older name.
    inputSchema: {
      seller_slug: z.string().min(1).max(200).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/).optional().describe('The seller_slug of a search item or a product.'),
      slug: z.string().min(1).max(200).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/).optional().describe('The older name of seller_slug, still accepted.'),
    },
  }, async ({ seller_slug, slug }) => {
    const s = seller_slug ?? slug;
    if (!s) return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'invalid_input', detail: 'seller_slug: the seller_slug of a search item or a product' }) }] };
    return run(() => api.get(`/market/sellers/${s}`));
  });
}

/** The read tools only: a connection with no key. */
export function registerMarketKeylessTools(server: McpServer, api: ApiClient): void {
  registerReads(server, api);
}

export function registerMarketTools(server: McpServer, api: ApiClient): void {
  registerReads(server, api);
  server.registerTool('commercebook_market_quote', {
    title: 'Quote an offer',
    description: 'POST /market/quotes: prices one offer at a quantity, with shipping to the destination from the seller’s shipping profile (method ship; destination a state or ZIP, or {state, zip, residential, service, rate_id}) or pickup. The quote holds the goods for 15 minutes. Needs the orders activity (the key of a buyer or a seller) or payments (the key of a warehouse).',
    inputSchema: {
      offer_id: z.string().uuid(),
      quantity: z.number().int().min(1),
      method: z.enum(['pickup', 'ship']).optional(),
      destination: z.union([z.string(), z.object({ state: z.string().optional(), zip: z.string().optional(), residential: z.boolean().optional(), service: z.enum(['standard', 'expedited']).optional(), rate_id: z.string().optional() })]).optional(),
    },
  }, async (args) => run(() => api.post('/market/quotes', args)));
  server.registerTool('commercebook_market_order_place', {
    title: 'Place and pay an order',
    description: 'POST /market/orders: turns an open quote into an order paid with the owner’s balance (no processing line) or the owner’s saved card (the card fee, 2.90 percent plus 30 cents; the card is held, not charged, until the seller ships). method bank pays by bank debit from the bank account the owner saved once with its mandate (0.80 percent, at most $5; it settles in about 4 business days and the order is accepted while it settles). Without method: the balance when it covers the total, else the saved card, else the saved bank account. Answers order_id, status (accepted means the order is placed and authorised; GET /market/orders/{id} then reads authorised), buyer_total_cents and processing_cents (the card fee). 409 no_payment_method or balance_insufficient carry the hint; 403 not_permitted until the owner turns on payments; the spending cap and the confirm amount apply to the buyer total. A bank payment is made by a person in the Shop.',
    inputSchema: { quote_id: z.string().uuid(), method: z.enum(['balance', 'card', 'saved', 'ach', 'bank']).optional() },
  }, async (args) => run(() => api.post('/market/orders', args)));
  server.registerTool('commercebook_market_orders', {
    title: 'List the orders',
    description: 'GET /market/orders: the orders this member placed, newest first, with the amounts, the payment line (card_held, bank_settling, paid), the fulfillment and any dispute.',
    inputSchema: { status: z.enum(['created', 'authorised', 'released', 'accepted', 'completed', 'cancelled', 'failed']).optional(), limit: z.number().int().min(1).max(200).optional() },
  }, async (args) => run(() => api.get('/market/orders', args)));
  server.registerTool('commercebook_market_order', {
    title: 'Read one order',
    description: 'GET /market/orders/{id}: one order the member placed: the state, the amounts, the payment line, the fulfillment and tracking, the latest dispute and the rating.',
    inputSchema: { order_id: z.string().uuid() },
  }, async ({ order_id }) => run(() => api.get(`/market/orders/${order_id}`)));
  server.registerTool('commercebook_market_order_confirm_delivery', {
    title: 'Confirm the goods arrived',
    description: 'POST /market/orders/{id}/confirm-delivery: accepts the goods of a released order, which ends the time to file a dispute early; the seller is paid out within the hour. Report a problem first if something is wrong.',
    inputSchema: { order_id: z.string().uuid() },
  }, async ({ order_id }) => run(() => api.post(`/market/orders/${order_id}/confirm-delivery`, {})));
  server.registerTool('commercebook_market_order_dispute', {
    title: 'Report a problem with an order',
    description: 'POST /market/orders/{id}/dispute: opens a dispute (non_delivery, shortage, condition or other) on a released, accepted or completed order. Shoppers have 30 days from delivery to file a dispute; after that the order is non-refundable (409 claim_window_closed). Claims name the listing field (quantity, condition_grade, identity with attribute, known_defects, delivery, return_terms, other) with what was stated and what arrived; a field the listing did not state is refused (claim_field_not_stated). Shortage and condition need evidence.photos (receipt_evidence_required).',
    inputSchema: {
      order_id: z.string().uuid(), reason: z.enum(['non_delivery', 'shortage', 'condition', 'other']), note: z.string().max(1000).optional(),
      evidence: z.object({ photos: z.array(z.string().min(3).max(2000)).max(20).optional(), received_count: z.number().int().min(0).optional() }).passthrough().optional(),
      claims: z.array(z.object({ field: z.enum(['quantity', 'condition_grade', 'identity', 'known_defects', 'delivery', 'return_terms', 'other']), attribute: z.enum(['title', 'brand', 'model', 'gtin']).optional(), stated: z.string().max(1000).optional(), observed: z.string().max(1000).optional(), evidence_ids: z.array(z.string().max(2000)).max(20).optional() })).max(10).optional(),
    },
  }, async ({ order_id, ...body }) => run(() => api.post(`/market/orders/${order_id}/dispute`, body)));
  server.registerTool('commercebook_market_order_rate', {
    title: 'Rate an order',
    description: 'POST /market/orders/{id}/rate: rates an accepted or completed order, the goods and the seller from 1 to 5, with an optional note; a second call changes the rating.',
    inputSchema: { order_id: z.string().uuid(), product_score: z.number().int().min(1).max(5), seller_score: z.number().int().min(1).max(5), note: z.string().max(1000).optional() },
  }, async ({ order_id, ...body }) => run(() => api.post(`/market/orders/${order_id}/rate`, body)));

  // SPEC-56: the result sheet.
  server.registerTool('commercebook_result_sheet', {
    title: 'Make a result sheet',
    description: 'POST /market/sheets: one page with the ranked candidates for the owner, instead of a link per product. Give the owner’s query, the ship-to (postal_code and state), up to 12 items (offer_id, quantity, rank, reason, optional tradeoff), up to 6 spec names to compare, notes, a title, and the owner’s budget and deadline in the owner’s words. CommerceBook checks each offer, quotes the delivered shipping and the totals, and answers url (https://commercebook.ai/sheet/<token>, readable by anyone with the link), markdown (the sheet as text) and json (with order_via_agent per item). Prices and stock re-read on every open. 409 items_unavailable names the offers that failed. Any key may make one; the owner places the order from the sheet, or the agent does with commercebook_market_quote and commercebook_market_order_place.',
    inputSchema: {
      query: z.string().min(1).max(300),
      ship_to: z.object({ postal_code: z.string().regex(/^\d{5}(-\d{4})?$/).optional(), state: z.string().regex(/^[A-Za-z]{2}$/).optional() }),
      items: z.array(z.object({ offer_id: z.string().uuid(), quantity: z.number().int().min(1), rank: z.number().int().min(1).max(12).optional(), reason: z.string().min(1).max(400), tradeoff: z.string().max(300).optional() })).min(1).max(12),
      compare: z.array(z.string().min(1).max(60)).max(6).optional(),
      notes: z.string().max(600).optional(),
      title: z.string().max(120).optional(),
      budget: z.string().max(80).optional(),
      deadline: z.string().max(80).optional(),
      public: z.boolean().optional().describe('true lets search engines index the page; noindex by default.'),
    },
  }, async (args) => run(() => api.post('/market/sheets', args)));
  server.registerTool('commercebook_result_sheets', {
    title: 'List the result sheets',
    description: 'GET /market/sheets: the sheets this member made that have not expired, newest first, with the link, whether the owner opened it and the top choice.',
    inputSchema: { limit: z.number().int().min(1).max(200).optional() },
  }, async (args) => run(() => api.get('/market/sheets', args)));
  server.registerTool('commercebook_result_sheet_get', {
    title: 'Read one result sheet',
    description: 'GET /market/sheets/{id}: one sheet re-read live (sold out, price changed), as markdown and json.',
    inputSchema: { sheet_id: z.string().uuid() },
  }, async ({ sheet_id }) => run(() => api.get(`/market/sheets/${sheet_id}`)));
  server.registerTool('commercebook_result_sheet_delete', {
    title: 'Delete a result sheet',
    description: 'DELETE /market/sheets/{id}: removes a sheet this member made; its link answers 404 after.',
    inputSchema: { sheet_id: z.string().uuid() },
  }, async ({ sheet_id }) => run(() => api.request('DELETE', `/market/sheets/${sheet_id}`)));
}
