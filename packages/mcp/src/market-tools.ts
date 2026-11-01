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

/** The tools of a connection with no key (the buyer briefing's scope). SPEC-63 adds the seller record, CB-965 the warehouse record. */
export const MARKET_KEYLESS_TOOL_NAMES = ['commercebook_market_search', 'commercebook_market_lot', 'commercebook_market_seller', 'commercebook_market_warehouse'] as const;
export const MARKET_TOOL_NAMES = [
  ...MARKET_KEYLESS_TOOL_NAMES,
  'commercebook_market_quote', 'commercebook_market_order_place', 'commercebook_market_orders', 'commercebook_market_order',
  // CB-964: the owner's purchase order number on an order, until the seller ships.
  'commercebook_market_order_po_number',
  'commercebook_market_order_confirm_delivery', 'commercebook_market_order_dispute', 'commercebook_market_order_rate',
  // CB-968: the invoice of an order.
  'commercebook_market_order_invoice',
  // SPEC-56: the result sheet.
  'commercebook_result_sheet', 'commercebook_result_sheets', 'commercebook_result_sheet_get', 'commercebook_result_sheet_delete',
  // CB-970: the owner's tax exemption certificates.
  'commercebook_tax_certificates', 'commercebook_tax_certificate_add',
] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
const QTY = z.number().int().min(1);
/**
 * CB-948 (D5): a quote and a request post take the same quantity field, qty, and each accepts quantity as the same
 * field. One of the two is required; both sent must agree.
 */
export function oneQuantity(qty: number | undefined, quantity: number | undefined): number | ToolResult {
  const refuse = (detail: string): ToolResult => ({ isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'invalid_arguments', detail: [detail], arguments: ['qty', 'quantity'] }) }] });
  if (qty !== undefined && quantity !== undefined && qty !== quantity) return refuse('qty: qty and quantity differ; send one of them');
  const n = qty ?? quantity;
  return n === undefined ? refuse('qty: required (a whole number, at least 1)') : n;
}
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
    description: 'GET /market/search: the products for sale on CommerceBook, by words (a product matches any meaningful word of the query as a whole word, with an optional plural ending, so stretch never matches stretcher, and the products that match more words rank first) in the title, the category (its key, its name and its synonyms, so groom finds grooming), the item specifics, the brand or the part number; the description adds to the score and never makes a hit alone, and each item names its matched_fields and matched_terms; a query whose words match nothing answers no items, no_match true and nearest_categories with their counts; category (a key from commercebook_market_book), price per unit in cents (min_price, max_price), the ship-to state, the condition, goods_kind (new, used, surplus). Sorted by relevance, then price; with zip, each item carries to_zip (its shipping to that ZIP and the line the buyer reads), and sort delivered orders by price plus shipping. Each item carries goods_kind, condition and pickup (Pickup free in <city>). Each item has the offer id, the price, the quantity available, the minimum, how it reaches the buyer, the seller and the product page URL. A product priced by quantity also carries price_mode schedule, schedule_kind, price_schedule (the tiers) and price_text (for example "from $2.40 each, 50 or more at $1.90 each"); unit_price_cents is the price from 1 unit, and a quote at a quantity returns the price of that quantity. A product sold in packs carries pack_size and reads its price per pack in price_text (for example "$9.14 per pack of 12"). No key needed.',
    inputSchema: {
      q: z.string().max(200).optional().describe('Words; a product matches any of them as a whole word of the title, the category, the specifics, the brand or the part number (a plural ending s or es matches too), and more matched words rank higher.'),
      query: z.string().max(200).optional().describe('The same as q, for an agent that names it query.'),
      category: z.string().max(80).optional().describe('A category key, exact (for example packaging, tools, home_garden). commercebook_market_book lists every key with its products and open requests.'),
      min_price: z.number().int().min(0).optional(),
      max_price: z.number().int().min(0).optional(),
      state: z.string().regex(/^[A-Za-z]{2}$/).optional().describe('Two-letter state the goods ship to.'),
      condition: z.string().max(40).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      // SPEC-100: used and surplus goods, and the price plus shipping to the buyer's ZIP.
      goods_kind: z.enum(['new', 'used', 'surplus']).optional().describe('new, used, or surplus (new goods sold below list, in the original packaging or open box).'),
      zip: z.string().regex(/^\d{5}(-\d{4})?$/).optional().describe('The buyer\u2019s ZIP: each item carries to_zip with its shipping there and the line "$5.00 + $8.40 shipping to 77008".'),
      sort: z.enum(['relevance', 'delivered']).optional().describe('delivered: price plus shipping to zip, lowest first. Needs zip.'),
      max_delivered: z.number().int().min(0).optional().describe('Ships to zip for at most this many cents, price plus shipping. Needs zip.'),
    },
  }, async (args) => run(() => api.get('/market/search', args)));
  server.registerTool('commercebook_market_lot', {
    title: 'Read one product',
    annotations: READ_ONLY,
    description: 'GET /market/lots/{id}: one public product (lot_id) as its product page shows it (the count, the condition, goods_kind (new, used, surplus), the return terms, pickup, the date the seller last confirmed the count, the photos, the shipping) with every active offer and the states it ships to, the seller\'s documents (spec sheets, certificates, manuals) and published answers, and fact_sheet_url and fact_sheet_markdown_url (the page to hand a buyer and its Markdown version). No key needed.',
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
  // CB-965 (182): the warehouse record, the same jsonb as the record on the warehouse profile.
  server.registerTool('commercebook_market_warehouse', {
    title: 'Read a warehouse record',
    annotations: READ_ONLY,
    description: 'GET /market/warehouses/{slug} (warehouse_slug: the slug in fulfilled_by on a seller record, or a member of the directory): the record CommerceBook computes for one warehouse: the market orders for goods stored at its facilities (shipped, delivered, confirmed by the buyer, disputed, and the disputes resolved), the buyers\u2019 four scores on those orders (goods as described, packing and condition on arrival, speed, communication), the leads it posted and sold with their stars and disputes, and the capacity requests it answered. Each rate carries n, of, rate and shown_as (a count until it is built on 10, then a percent). The warehouse writes none of it. No key needed.',
    inputSchema: {
      warehouse_slug: z.string().min(1).max(200).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/).describe('The warehouse member\u2019s slug.'),
    },
  }, async ({ warehouse_slug }) => run(() => api.get(`/market/warehouses/${warehouse_slug}`)));
}

/** The read tools only: a connection with no key. */
export function registerMarketKeylessTools(server: McpServer, api: ApiClient): void {
  registerReads(server, api);
}

export function registerMarketTools(server: McpServer, api: ApiClient): void {
  registerReads(server, api);
  server.registerTool('commercebook_market_quote', {
    title: 'Quote an offer',
    description: 'POST /market/quotes: prices one offer at a quantity (qty, as on a request; quantity is the same field), with shipping to the destination from the seller’s shipping profile (method ship; destination a state or ZIP, or {state, zip, residential, service, rate_id}) or pickup. The quote holds the goods for 15 minutes. Needs the orders activity (the key of a buyer or a seller) or payments (the key of a warehouse).',
    inputSchema: {
      offer_id: z.string().uuid(),
      // CB-948 (D5): qty, the field name of a request post; quantity (the API's name) is the same field.
      qty: QTY.optional().describe('How many to price. Required unless quantity is sent.'),
      quantity: QTY.optional().describe('The same as qty.'),
      method: z.enum(['pickup', 'ship']).optional(),
      destination: z.union([z.string(), z.object({ state: z.string().optional(), zip: z.string().optional(), residential: z.boolean().optional(), service: z.enum(['standard', 'expedited']).optional(), rate_id: z.string().optional() })]).optional(),
    },
  }, async ({ qty, quantity, ...rest }) => {
    const n = oneQuantity(qty, quantity);
    return typeof n === 'number' ? run(() => api.post('/market/quotes', { ...rest, quantity: n })) : n;
  });
  server.registerTool('commercebook_market_order_place', {
    title: 'Place and pay an order',
    description: 'POST /market/orders: turns an open quote into an order paid with the owner’s balance or the owner’s saved card (the card is held, not charged, until the seller ships). method bank pays by bank debit from the bank account the owner saved once with its mandate (it settles in about 4 business days and the order is accepted while it settles). The owner pays the price with shipping by every method; the seller pays the processing fee out of its proceeds. Without method: the balance when it covers the total, else the saved card, else the saved bank account. Answers order_id, status (accepted means the order is placed and authorised; GET /market/orders/{id} then reads authorised), buyer_total_cents (the price with shipping) and processing_cents (0: the owner pays no processing fee). 409 no_payment_method or balance_insufficient carry the hint; 403 not_permitted until the owner turns on payments; the spending cap and the confirm amount apply to the buyer total. The monthly budget applies too: an order that would pass it is refused (409 over_monthly_budget with the budget, the amount spent this month and the remaining amount); stop and ask the owner in the owner’s own chat. po_number is the owner’s purchase order number (up to 64 characters). Send it only when the owner’s company uses purchase order numbers and the owner gave you one; never make one up. A bank payment is made by a person in the Shop.',
    inputSchema: {
      quote_id: z.string().uuid(), method: z.enum(['balance', 'card', 'saved', 'ach', 'bank']).optional(), po_number: z.string().max(64).optional(),
      // CB-723: the seller's own-traffic code (the via= part of the seller's link), only when the owner arrived through it.
      via_code: z.string().max(64).optional().describe('The seller’s own-traffic code, only when your owner arrived through the seller’s own link (the via= part of the address). The seller hands it out; never invent one. The price does not change.'),
    },
  }, async (args) => run(() => api.post('/market/orders', args)));
  // CB-964 (176): the owner's purchase order number on an order, changed until the seller ships.
  server.registerTool('commercebook_market_order_po_number', {
    title: 'Set the purchase order number on an order',
    description: 'PUT /market/orders/{id}/po-number: sets or changes the owner’s purchase order number on an order the owner placed (up to 64 characters; null or blank removes it). It shows on the order, to the seller and in the order emails. Once the seller ships, it is fixed (409 po_number_fixed). Use it only with a number the owner gave you; never make one up.',
    inputSchema: { order_id: z.string().uuid(), po_number: z.string().max(64).nullable() },
  }, async ({ order_id, po_number }) => run(() => api.put(`/market/orders/${order_id}/po-number`, { po_number })));
  server.registerTool('commercebook_market_orders', {
    title: 'List the orders',
    description: 'GET /market/orders: the orders this member placed, newest first, with the amounts, the payment line (card_held, bank_settling, paid), the fulfillment and any dispute.',
    inputSchema: { status: z.enum(['created', 'authorised', 'released', 'accepted', 'completed', 'cancelled', 'failed']).optional(), limit: z.number().int().min(1).max(200).optional() },
  }, async (args) => run(() => api.get('/market/orders', args)));
  server.registerTool('commercebook_market_order', {
    title: 'Read one order',
    description: 'GET /market/orders/{id}: one order the member placed: the state, the amounts, the payment line, the fulfillment and tracking, the latest dispute, the rating, and po_number with po_number_editable (CB-964). A pickup order (fulfillment_kind pickup) carries pickup: the six-digit code, the address and the seller contact once the payment is held, and pickup_card_url, a printable card to hand to the owner.',
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
    // CB-965 (182): the four scores. The API still takes the two-score body of earlier agents; this tool sends the four.
    description: 'POST /market/orders/{id}/rate: rates an accepted or completed order on four scores, each 1 to 5: goods_score (goods as described), packing_score (packing and condition on arrival), speed_score (shipped and delivered when promised) and communication_score, with an optional note; a second call changes the rating. The scores show on the seller record and on the record of the warehouse that stored the goods.',
    inputSchema: {
      order_id: z.string().uuid(),
      goods_score: z.number().int().min(1).max(5).describe('Goods as described, 1 to 5.'),
      packing_score: z.number().int().min(1).max(5).describe('Packing and condition on arrival, 1 to 5.'),
      speed_score: z.number().int().min(1).max(5).describe('Shipped and delivered when promised, 1 to 5.'),
      communication_score: z.number().int().min(1).max(5).describe('Communication, 1 to 5.'),
      note: z.string().max(1000).optional(),
    },
  }, async ({ order_id, ...body }) => run(() => api.post(`/market/orders/${order_id}/rate`, body)));

  // CB-968 (SPEC-125): the invoice of an order, as a link the owner opens.
  server.registerTool('commercebook_market_order_invoice', {
    title: 'Get the invoice of an order',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: 'GET /market/orders/{id}/invoice: the invoice of one order the member placed (or sold): invoice_number (sequential per seller, for example INV-000001) and url, a link to the invoice PDF that works for 15 minutes with no key. The PDF names the seller as the party that sold, the buyer\u2019s business name and address, the lines, shipping, the sales tax, the total and the payment. Give the owner the link and never paste the contents of the PDF into the chat.',
    inputSchema: { order_id: z.string().uuid() },
  }, async ({ order_id }) => run(() => api.get(`/market/orders/${order_id}/invoice`)));

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

  // CB-970 (188): the owner's tax exemption certificates. The agent adds the details only; the owner uploads the file.
  server.registerTool('commercebook_tax_certificates', {
    title: 'List the tax exemption certificates',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: 'GET /market/tax-certificates: the owner\u2019s resale and exemption certificates, those on file first. status on_file means an order shipped to that state (or any state, for multistate) is marked tax-exempt and the seller sees the certificate; expired and needs_file cover no order. upload_in is the Shop Settings page where the owner uploads a file.',
    inputSchema: {},
  }, async () => run(() => api.get('/market/tax-certificates')));
  server.registerTool('commercebook_tax_certificate_add', {
    title: 'Add a tax exemption certificate',
    description: 'POST /market/tax-certificates: adds the details of a resale or exemption certificate the owner gave you: kind (resale, exempt_organisation, government, other), issuing_state (two letters, or multistate), certificate_number, legal_name (the name on the certificate) and expires_on (YYYY-MM-DD, left out when the state sets none). It reads needs_file and covers no order until the owner uploads the file. Ask the owner to upload the file in Shop Settings, Tax exemption (upload_in). Never ask for or send a certificate image or file in chat. Needs the orders activity.',
    inputSchema: {
      kind: z.enum(['resale', 'exempt_organisation', 'government', 'other']),
      issuing_state: z.string().regex(/^([A-Za-z]{2}|multistate)$/i).describe('Two letters (TX), or multistate.'),
      certificate_number: z.string().min(1).max(60),
      legal_name: z.string().min(1).max(200).describe('The name exactly as it appears on the certificate.'),
      expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('The last valid day; leave out when the state sets no expiry.'),
    },
  }, async (args) => run(() => api.post('/market/tax-certificates', args)));
}
