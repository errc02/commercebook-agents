/**
 * One MCP tool per endpoint of the warehouse API and the seller API (docs/openapi.json; the seller tools are
 * commercebook_seller_*, SPEC-33 part 3), plus commercebook_whoami. A key reaches its own scope's tools: a warehouse
 * key the warehouse ones, a seller key the seller ones (the other side answers not_found). Inputs are typed with
 * zod; every result is the API's JSON as text, and a refusal comes back as an error result with the API's code so the
 * agent can read it (not_permitted, rate_limited, summary_names_shipper, ...).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';
import { registerParity2Tools } from './tools-parity-2.js';
import { registerParity1Tools } from './tools-parity-1.js';
export { PARITY2_TOOL_NAMES } from './tools-parity-2.js';
export { PARITY1_TOOL_NAMES } from './tools-parity-1.js';

const UUID = z.string().uuid();
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const page = { cursor: z.string().optional().describe('The next_cursor of the previous page.'), limit: z.number().int().min(1).max(200).optional() };
// SPEC-89 (122): the 3PL stages; quoted is Quote sent; offered is accepted and keeps the deal's stage.
const STAGES = ['new', 'qualified', 'discovery', 'site_visit', 'quoted', 'negotiating', 'won', 'onboarding', 'live', 'lost', 'offered'] as const;
const attachment = z.object({ type: z.enum(['lead', 'exchange_post', 'deal', 'facility', 'capacity_request']), id: UUID, label: z.string().optional() }).optional();

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(e: unknown): ToolResult {
  if (e instanceof ApiError) {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
  }
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
}

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    return fail(e);
  }
}

const dealFields = {
  name: z.string().min(1).max(200),
  stage: z.enum(STAGES),
  service: z.string().max(80).nullable(),
  target_market: z.string().max(120).nullable(),
  value_cents: z.number().int().min(0).nullable(),
  monthly_revenue_cents: z.number().int().min(0).nullable(),
  description: z.string().max(4000).nullable(),
  expected_closing_date: DATE.nullable(),
  company_id: UUID.nullable().describe('One of your companies.'),
  company_name: z.string().max(200).nullable().describe('Finds your company of that name or creates it.'),
  attributes: z.record(z.string(), z.unknown()),
};

export const TOOL_NAMES = [
  'commercebook_whoami', 'commercebook_me', 'commercebook_my_standing', 'commercebook_openapi',
  'commercebook_leads_open', 'commercebook_leads_mine', 'commercebook_lead_post', 'commercebook_lead_claim',
  'commercebook_deals_list', 'commercebook_deal_create', 'commercebook_deal_update',
  'commercebook_capacity_list', 'commercebook_capacity_request', 'commercebook_capacity_quote',
  'commercebook_threads_list', 'commercebook_thread_get', 'commercebook_message_send', 'commercebook_message_request',
  'commercebook_prices', 'commercebook_members',
] as const;

/** SPEC-36: the instruction document of the agent link (an owner key). */
export const AGENT_LINK_TOOL_NAMES = ['instructions'] as const;

export const SELLER_TOOL_NAMES = [
  'commercebook_seller_me', 'commercebook_seller_lots', 'commercebook_seller_lot_get', 'commercebook_seller_catalog_upsert',
  'commercebook_seller_lot_hold', 'commercebook_seller_lot_release', 'commercebook_seller_reconcile', 'commercebook_seller_verify',
  'commercebook_seller_orders', 'commercebook_seller_order_get', 'commercebook_seller_order_release', 'commercebook_seller_order_ship',
  'commercebook_seller_order_cancel', 'commercebook_seller_disputes', 'commercebook_seller_dispute_reply',
  'commercebook_seller_policies_get', 'commercebook_seller_policies_update', 'commercebook_seller_statement', 'commercebook_seller_performance',
  'commercebook_seller_delegations', 'commercebook_seller_delegation_request', 'commercebook_seller_events',
] as const;

const OPID = z.string().min(8).max(96).regex(/^[A-Za-z0-9_:-]+$/).optional().describe('Idempotency key; a retry with the same one returns the first answer.');
const LOT_STATUS = ['draft', 'active', 'paused', 'sold_out', 'withdrawn'] as const;
const ORDER_STATUS = ['created', 'authorised', 'released', 'accepted', 'completed', 'cancelled', 'failed'] as const;
// SPEC-60 (093): the release evidence and the return terms by category.
const RELEASE_EVIDENCE = z.object({ count: z.number().int().min(1), photos: z.array(z.string().min(3).max(2000)).min(1).max(20), note: z.string().max(1000).optional() }).optional()
  .describe('The count shipped and photo links of the packed goods; required on shipped orders over $500.');
const RETURN_TERMS = z.object({ window_days: z.number().int().min(0).max(365).optional(), method: z.enum(['by_mail', 'same_warehouse', 'no_returns']).optional(), restocking_fee_pct: z.number().min(0).max(100).optional() });
const RETURN_POLICY_FIELDS = {
  return_terms_by_category: z.record(z.string().regex(/^[a-z][a-z0-9_]{1,59}$/), RETURN_TERMS).optional().describe('Return terms by product category key (the whole map is replaced). A product can still carry its own terms.'),
  claim_window_days: z.number().int().min(30).max(365).nullable().optional().describe('Days a shopper has to file a dispute after delivery: 30 or more; null uses the platform 30.'),
};

/**
 * SPEC-68: price by quantity on a catalog record (offer) and on the product edit. The same sentences as the OpenAPI
 * document (netlify/functions/lib/openapi.ts PRICE_SCHEDULE_TEXT).
 */
export const PRICE_SCHEDULE_TEXT = {
  tiers: 'The tiers, ascending by min_qty: {min_qty, unit_price_cents}; the first tier starts at min_qty 1 (or at the offer minimum) and its price is the unit price; each later tier has a larger min_qty and a lower price; 2 to 10 tiers.',
  volume: 'volume: every unit is priced at the price of the highest tier the quantity reaches.',
  graduated: 'graduated: the units within each tier are priced at that tier\u2019s price.',
};
export const PRICE_TIERS = z.array(z.object({ min_qty: z.number().int(), unit_price_cents: z.number().int() })).describe(PRICE_SCHEDULE_TEXT.tiers);
export const SCHEDULE_KIND = z.enum(['volume', 'graduated']).describe(`How the tiers apply (default volume). ${PRICE_SCHEDULE_TEXT.volume} ${PRICE_SCHEDULE_TEXT.graduated}`);
const CATALOG_OFFER = z.object({
  price_mode: z.enum(['fixed', 'schedule']).optional().describe('schedule prices the product by quantity from price_schedule; fixed (the default) is one price.'),
  schedule_kind: SCHEDULE_KIND.optional(),
  price_schedule: PRICE_TIERS.optional(),
}).describe('Price by quantity. A bad schedule refuses the call with 400 invalid_input, detail price_schedule: <reason>.');
const CATALOG_RECORD = z.object({ offer: CATALOG_OFFER.optional() }).passthrough().describe('One template v1.1 record (ACP field names), with an optional offer for price by quantity.');

/** The seller tools (SPEC-33 part 3): one per /seller/* endpoint. */
export function registerSellerTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_seller_me', { title: 'My seller', description: 'GET /seller/me: your seller, what blocks selling (blockers), readiness and counts.', inputSchema: {} }, async () => run(() => api.get('/seller/me')));
  server.registerTool(
    'commercebook_seller_lots',
    { title: 'My products', description: 'GET /seller/catalog/lots: your products (lots in the API), newest first, with state (live, held for paused, draft, stale, sold_out), quantities, price and completeness.', inputSchema: { ...page, status: z.enum(LOT_STATUS).optional(), state: z.enum(['live', 'held', 'draft', 'stale', 'sold_out']).optional() } },
    async (a) => run(() => api.get('/seller/catalog/lots', a)),
  );
  server.registerTool('commercebook_seller_lot_get', { title: 'One product', description: 'GET /seller/catalog/lots/{id}: the product record an agent reads, with its manifest, offers and ledger rows.', inputSchema: { lot_id: UUID } }, async ({ lot_id }) => run(() => api.get(`/seller/catalog/lots/${lot_id}`)));
  server.registerTool(
    'commercebook_seller_catalog_upsert',
    {
      title: 'Load the catalog',
      description:
        'POST /seller/catalog/upsert: up to 500 records of the CommerceBook product data template v1.1 (ACP field names: item_id, title, description, brand, category, condition, price, currency, availability, inventory_quantity, inventory_as_of, image_link, enable_checkout, title_holder, ...). Run with dry_run true first to see created, changed and skipped with reasons, then without it to write. ship_from names the ship-from address of a seller-held product by the label or id of one of your addresses (commercebook_seller_ship_from_list); blank follows your default, and an unknown label skips the record with reason ship_from_unknown and your labels. shipping_methods (pickup, ship, ltl, parcel; channels is its older name and still read) says how the goods reach the buyer. feed_opt_out true keeps the product out of the outside feeds (Google Merchant, the agent product feed), as the lot page checkbox does. price_on_request true lists the product with no public price ("Quote on request"): buyers post a request and you quote it; the price you send stays private. Products go on sale when selling is on (you are live) and enable_checkout is true; before that they load as drafts. Price by quantity: offer {price_mode: schedule, schedule_kind, price_schedule [{min_qty, unit_price_cents}, ...]} on a record; price may then be left out (the first tier is the unit price). ' + PRICE_SCHEDULE_TEXT.volume + ' ' + PRICE_SCHEDULE_TEXT.graduated + ' A bad schedule refuses the call with 400 invalid_input, detail price_schedule: <reason>.',
      inputSchema: { records: z.array(CATALOG_RECORD).min(1).max(500), dry_run: z.boolean().optional(), operation_id: OPID },
    },
    async (a) => run(() => api.post('/seller/catalog/upsert', a)),
  );
  server.registerTool('commercebook_seller_lot_hold', { title: 'Pause sales of a product', description: 'POST /seller/catalog/lots/{id}/hold: pauses the product\u2019s live offers until you resume sales.', inputSchema: { lot_id: UUID, reason: z.string().max(300).optional(), operation_id: OPID } }, async ({ lot_id, ...b }) => run(() => api.post(`/seller/catalog/lots/${lot_id}/hold`, b)));
  server.registerTool('commercebook_seller_lot_release', { title: 'Resume sales of a product', description: 'POST /seller/catalog/lots/{id}/release: resumes sales of a paused product on the market through the publish checks (you must be live).', inputSchema: { lot_id: UUID, operation_id: OPID } }, async ({ lot_id, ...b }) => run(() => api.post(`/seller/catalog/lots/${lot_id}/release`, b)));
  server.registerTool(
    'commercebook_seller_reconcile',
    { title: 'Check the stock', description: 'GET /seller/catalog/reconcile: the stock problems of your products against the count on record at the warehouse that ships them, and the stale counts (a count is stale when it is older than 72 hours): count_mismatch, stale_count, oversold, offer_exceeds_stock, delegation_missing. Writes nothing.', inputSchema: {} },
    async () => run(() => api.get('/seller/catalog/reconcile')),
  );
  server.registerTool(
    'commercebook_seller_verify',
    { title: 'Confirm the count', description: 'POST /seller/catalog/verify: after a physical count matched, every product keeps its quantity on hand as the count, and now becomes its count date.', inputSchema: { operation_id: OPID } },
    async (a) => run(() => api.post('/seller/catalog/verify', a)),
  );
  server.registerTool('commercebook_seller_orders', { title: 'My orders', description: 'GET /seller/orders: orders of your products, newest first.', inputSchema: { ...page, status: z.enum(ORDER_STATUS).optional() } }, async (a) => run(() => api.get('/seller/orders', a)));
  server.registerTool('commercebook_seller_order_get', { title: 'One order', description: 'GET /seller/orders/{id}: the order with payment, fulfillment, disputes, refunds and transitions.', inputSchema: { order_id: UUID } }, async ({ order_id }) => run(() => api.get(`/seller/orders/${order_id}`)));
  server.registerTool('commercebook_seller_order_release', { title: 'Release an order to ship', description: 'POST /seller/orders/{id}/release: releases an authorised order to ship. A shipped order over $500 needs evidence (the count and at least one photo link), else 409 release_evidence_required. You are paid 2 business days after delivery unless a dispute is open; shoppers have 30 days from delivery to file a dispute.', inputSchema: { order_id: UUID, evidence: RELEASE_EVIDENCE, operation_id: OPID } }, async ({ order_id, ...b }) => run(() => api.post(`/seller/orders/${order_id}/release`, b)));
  server.registerTool(
    'commercebook_seller_order_ship',
    { title: 'Ship an order', description: 'POST /seller/orders/{id}/ship: marks a released order shipped (with carrier and tracking) or picked up. buy_label true buys the label for the quoted service at the live price from your balance instead, and writes the carrier and tracking (label_url: a 10-minute link to the PDF); send it without carrier or tracking. Past the key\u2019s confirm amount or 30-day cap it answers 202 pending_owner_confirmation and waits for the owner.', inputSchema: { order_id: UUID, kind: z.enum(['shipped', 'picked_up']).optional(), carrier: z.string().max(80).optional(), tracking: z.string().max(120).optional(), buy_label: z.boolean().optional(), operation_id: OPID } },
    async ({ order_id, ...b }) => run(() => api.post(`/seller/orders/${order_id}/ship`, b)),
  );
  server.registerTool('commercebook_seller_order_cancel', { title: 'Cancel an order', description: 'POST /seller/orders/{id}/cancel: cancels an order before release; the payment is voided.', inputSchema: { order_id: UUID, reason: z.string().max(500).optional(), operation_id: OPID } }, async ({ order_id, ...b }) => run(() => api.post(`/seller/orders/${order_id}/cancel`, b)));
  server.registerTool('commercebook_seller_disputes', { title: 'Disputes', description: 'GET /seller/disputes: disputes on your orders.', inputSchema: { ...page, status: z.enum(['open', 'needs_evidence', 'resolved_buyer', 'resolved_seller', 'withdrawn']).optional() } }, async (a) => run(() => api.get('/seller/disputes', a)));
  server.registerTool(
    'commercebook_seller_dispute_reply',
    { title: 'Answer a dispute', description: 'POST /seller/disputes/{id}/reply: your note and evidence (tracking, photo links) on an open dispute.', inputSchema: { dispute_id: UUID, note: z.string().min(1).max(4000), evidence: z.record(z.string(), z.unknown()).optional(), operation_id: OPID } },
    async ({ dispute_id, ...b }) => run(() => api.post(`/seller/disputes/${dispute_id}/reply`, b)),
  );
  server.registerTool('commercebook_seller_policies_get', { title: 'My policies', description: 'GET /seller/policies: acceptance_days (the business days a buyer has to file a dispute, as the policy states it), returns, restocking fee, the lowest price you accept (offer_floor_pct), auctions.', inputSchema: {} }, async () => run(() => api.get('/seller/policies')));
  server.registerTool(
    'commercebook_seller_policies_update',
    {
      title: 'Change my policies',
      description: 'PATCH /seller/policies: the named fields only. Accepting the policies is the owner’s own step in the app.',
      inputSchema: {
        acceptance_days: z.number().int().min(0).max(14).optional(), return_window_days: z.number().int().min(0).max(365).optional(),
        return_method: z.enum(['by_mail', 'same_warehouse', 'no_returns']).optional(), restocking_fee_pct: z.number().min(0).max(100).optional(),
        offer_floor_pct: z.number().min(0).max(100).nullable().optional(), auctions_allowed: z.boolean().optional(),
        ...RETURN_POLICY_FIELDS,
      },
    },
    async (a) => run(() => api.patch('/seller/policies', a)),
  );
  server.registerTool('commercebook_seller_statement', { title: 'Payout statement', description: 'GET /seller/payouts/statement: proceeds after the fee, refund reversals, fee and processing lines by order (90 days by default).', inputSchema: { from: DATE.optional(), to: DATE.optional() } }, async (a) => run(() => api.get('/seller/payouts/statement', a)));
  server.registerTool('commercebook_seller_performance', { title: 'My seller sheet', description: 'GET /seller/performance: the seller sheet, live, with the counts behind every rate.', inputSchema: {} }, async () => run(() => api.get('/seller/performance')));
  server.registerTool('commercebook_seller_delegations', { title: 'My warehouses', description: 'GET /seller/delegations: your warehouse agreements (delegations in the API) with the warehouses that store and ship for you, and their status.', inputSchema: {} }, async () => run(() => api.get('/seller/delegations')));
  server.registerTool(
    'commercebook_seller_delegation_request',
    { title: 'Ask a warehouse', description: 'POST /seller/delegations: asks a warehouse on CommerceBook for a warehouse agreement to store and ship your goods; it answers from its own account.', inputSchema: { warehouse_member_id: UUID, facility_id: UUID.optional(), terms: z.string().max(2000).optional(), operation_id: OPID } },
    async (a) => run(() => api.post('/seller/delegations', a)),
  );
  server.registerTool(
    'commercebook_seller_events',
    { title: 'My ledger', description: 'GET /seller/events: what happened on your account, newest first, and whether your agent did it.', inputSchema: { ...page, agent_only: z.boolean().optional(), object_id: UUID.optional() } },
    async (a) => run(() => api.get('/seller/events', a)),
  );
}

export function registerTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    'commercebook_whoami',
    { title: 'Who am I', description: 'The member this key belongs to, with verification, counts, the API base and the key prefix.', inputSchema: {} },
    async () => run(async () => ({ base: api.baseUrl, key_prefix: api.keyPrefix, ...(await api.get<Record<string, unknown>>('/me')) })),
  );
  server.registerTool('commercebook_me', { title: 'My member', description: 'GET /me: your member, its organisation (your company), verification and counts.', inputSchema: {} }, async () => run(() => api.get('/me')));
  server.registerTool(
    'commercebook_my_standing',
    {
      title: 'My standing',
      description:
        'GET /me/standing: your strikes in 90 and 365 days, fabricated-contact strikes, whether you may post (posting_suspended_until) and your status. Three strikes in 90 days suspend posting for 30 days; five in a year, or two fabricated contacts, remove the member from the exchange pending review (see /policies).',
      inputSchema: {},
    },
    async () => run(() => api.get('/me/standing')),
  );
  server.registerTool(
    'commercebook_openapi',
    { title: 'API document', description: 'GET /openapi.json: the OpenAPI 3.1 document of the warehouse API.', inputSchema: {} },
    async () => run(() => api.get('/openapi.json')),
  );

  server.registerTool(
    'commercebook_leads_open',
    {
      title: 'Open leads',
      description: 'GET /leads/open: open leads on the exchange, newest first, with the same visibility rules as the app. Filter by service or market (City, ST); a market filter also returns Anywhere leads (location_any). include_own: true adds your own open leads (own: true on each), as the app shows them. Each lead carries acquired_at, listed_at, held_days, poster_logo_url, and your own saved and passed marks (POST /leads/{id}/mark).',
      inputSchema: { ...page, service: z.string().optional(), market: z.string().optional(), include_own: z.boolean().optional() },
    },
    async (a) => run(() => api.get('/leads/open', a)),
  );
  server.registerTool(
    'commercebook_leads_mine',
    { title: 'My leads', description: 'GET /leads/mine: the leads you posted, drafts included.', inputSchema: { ...page, service: z.string().optional(), market: z.string().optional() } },
    async (a) => run(() => api.get('/leads/mine', a)),
  );
  server.registerTool(
    'commercebook_lead_post',
    {
      title: 'Post a lead',
      description:
        'POST /leads: post a lead from one of your CRM deals (deal_id) or from fields (company_name, need, service, markets or market, price). Send a title (80 characters) and a one-line summary (140) with the need: buyers read them first, and the lead takes generated ones when they are left out. lead_source referral with referral_source names the lead company that referred it. The need, title and summary are what buyers read and must not name the shipper; the server refuses one that does (summary_names_shipper). A lead takes one location, several locations (markets) or anywhere (location_any). draft: true saves without listing; replace_draft saves over one of your drafts. Leads must be true; confirmed false leads earn strikes that suspend posting (see /policies). While posting is suspended the tool returns posting_suspended with the end date. With no price the lead takes the member\u2019s Lead defaults (commercebook_lead_defaults_get): the price, and the buyer places unless exclusivity or max_buyers is sent. A deal whose CRM tags carry dnc, do-not-contact, do-not-solicit or do-not-call is refused with do_not_solicit. product, current_provider, inbound_mode, units_per_order and rate_expectation count toward quality, the lead quality score (0 to 9) in the answer; add them later with commercebook_lead_update.',
      inputSchema: {
        deal_id: UUID.optional(),
        company_name: z.string().max(200).optional(),
        contact_name: z.string().max(200).optional(),
        email: z.string().max(200).optional(),
        phone: z.string().max(60).optional(),
        need: z.string().max(2000).optional(),
        title: z.string().min(1).max(80).optional().describe('The title buyers see first; generated from the services, location and volume band when left out'),
        summary_short: z.string().min(1).max(140).optional().describe('One short line under the title, such as Short-term plywood, one container; the first sentence of the need when left out'),
        lead_source: z.enum(['own', 'referral']).optional().describe('own (default): the lead came to you directly; referral: a lead company referred it'),
        referral_source: z.string().max(60).optional().describe('The lead company that referred it, such as Fulfill.com'),
        service: z.string().max(80).optional(),
        market: z.string().max(120).optional().describe('City, ST'),
        markets: z.array(z.string().min(1).max(120)).max(10).optional().describe('Several locations, each City, ST, in order; the first is the primary'),
        location_any: z.boolean().optional().describe('true: the prospect has no preferred place (Anywhere); markets are cleared'),
        replace_draft: UUID.optional().describe('One of your drafts this post replaces (edit a draft)'),
        terms: z.enum(['flat', 'pct', 'both']).optional(),
        price_flat_cents: z.number().int().min(0).optional(),
        price_pct: z.number().min(0).max(100).optional(),
        exclusivity: z.enum(['exclusive', 'open']).optional(),
        max_buyers: z.number().int().min(1).max(50).optional(),
        origin_market: z.string().optional(),
        radius_mi: z.number().int().min(0).max(1000).optional(),
        volume_band: z.string().optional(),
        window_start: DATE.optional(),
        window_end: DATE.optional(),
        last_contact_at: DATE.optional(),
        pallets_on_hand: z.number().int().min(0).optional(),
        pallets_inbound_month: z.number().int().min(0).optional(),
        orders_month: z.number().int().min(0).optional(),
        skus: z.number().int().min(0).optional(),
        containers_month: z.number().int().min(0).optional(),
        sqft: z.number().int().min(0).optional(),
        units_month: z.number().int().min(0).optional(),
        success_fee_pct: z.number().min(0).max(50).optional(),
        draft: z.boolean().optional(),
        // SPEC-75 (107): the quality attributes.
        product: z.string().max(200).optional().describe('The product, such as boxed candles'),
        current_provider: z.string().max(200).optional().describe('The prospect\u2019s current warehouse or 3PL; a buyer sees it after purchase'),
        inbound_mode: z.array(z.enum(['parcel', 'pallet', 'container'])).max(3).optional().describe('How the goods arrive'),
        units_per_order: z.number().int().min(0).optional().describe('Units per order; with orders_month it is the order profile'),
        rate_expectation: z.string().max(200).optional().describe('The budget or rate expectation in the prospect\u2019s words'),
      },
    },
    async (a) => run(() => api.post('/leads', a)),
  );
  server.registerTool(
    'commercebook_lead_claim',
    {
      title: 'Claim a lead',
      description: 'POST /leads/{id}/claim: claims an open lead. A free lead claims at once (payment demo). A priced lead with payments configured is paid without a client secret: method balance pays from the member’s balance at once (no processing line), method card charges the owner’s saved card (price plus 2.90 percent plus 30 cents). Without method: the balance when it covers the price, else the saved card. The answer is status paid with claim_id, amount_cents (the buyer total), processing_cents and method, and the contact is revealed at once. A priced lead needs the payments activity on the key (403 not_permitted, activity payments, until the owner turns it on); 409 no_payment_method or balance_insufficient carry the hint to relay; 409 payment_needs_owner means the card needs the bank’s check, which the owner confirms at Agent access, Waiting for you.',
      inputSchema: { lead_id: UUID, method: z.enum(['balance', 'card']).optional().describe('balance or card; leave out to use the balance when it covers the price, else the saved card.'), operation_id: z.string().min(8).max(128).optional().describe('Idempotency key for the payment.') },
    },
    async ({ lead_id, method, operation_id }) => run(() => api.post(`/leads/${lead_id}/claim`, { ...(method ? { method } : {}), ...(operation_id ? { operation_id } : {}) })),
  );

  server.registerTool(
    'commercebook_deals_list',
    { title: 'My deals', description: 'GET /crm/deals: your CRM deals, most recently updated first.', inputSchema: { ...page, stage: z.enum(STAGES).optional(), archived: z.boolean().optional() } },
    async (a) => run(() => api.get('/crm/deals', a)),
  );
  server.registerTool(
    'commercebook_deal_create',
    {
      title: 'Create a deal',
      description:
        'POST /crm/deals: a new CRM deal; name is required. Also Add a lead on the Leads screen: contact_name, email and phone write the contact, markets (City, ST) or location_any keep the locations, and then_share (true, or the commercebook_lead_post fields) posts the deal to the exchange right after, as Save and share does; share in the answer is what the post answered.',
      inputSchema: {
        name: dealFields.name,
        ...Object.fromEntries(Object.entries(dealFields).filter(([k]) => k !== 'name').map(([k, v]) => [k, v.optional()])),
        contact_name: z.string().max(200).optional(),
        email: z.string().max(200).optional(),
        phone: z.string().max(60).optional(),
        markets: z.array(z.string().min(1).max(120)).max(10).optional().describe('City, ST, in order.'),
        location_any: z.boolean().optional().describe('true: Anywhere.'),
        then_share: z.union([z.boolean(), z.record(z.string(), z.unknown())]).optional().describe('true, or the commercebook_lead_post fields without deal_id: post the new deal right after.'),
      },
    },
    async (a) => run(() => api.post('/crm/deals', a)),
  );
  server.registerTool(
    'commercebook_deal_update',
    {
      title: 'Update a deal',
      description: 'PATCH /crm/deals/{id}: change the named fields of a deal. A stage change runs the board rules. checklist sets or clears the dated items (qualified, meeting_held, site_visited, quote_sent, contract_sent, contract_signed, onboarding_started); follow_up_due sets the next follow-up.',
      inputSchema: {
        deal_id: UUID,
        ...Object.fromEntries(Object.entries(dealFields).map(([k, v]) => [k, v.optional()])),
        archived: z.boolean().optional(),
        checklist: z
          .object({
            qualified: DATE.nullable(),
            meeting_held: DATE.nullable(),
            site_visited: DATE.nullable(),
            quote_sent: DATE.nullable(),
            contract_sent: DATE.nullable(),
            contract_signed: DATE.nullable(),
            onboarding_started: DATE.nullable(),
          })
          .partial()
          .optional()
          .describe('Each item a YYYY-MM-DD date, or null to clear it.'),
        follow_up_due: DATE.nullable().optional().describe('The next follow-up, YYYY-MM-DD.'),
      },
    },
    async ({ deal_id, ...patch }) => run(() => api.patch(`/crm/deals/${deal_id}`, patch)),
  );

  server.registerTool(
    'commercebook_capacity_list',
    {
      title: 'Capacity requests',
      description: 'GET /capacity/requests: the requests you sent and the ones your node received.',
      inputSchema: { ...page, direction: z.enum(['sent', 'received']).optional(), status: z.enum(['requested', 'quoted', 'accepted', 'declined', 'withdrawn']).optional() },
    },
    async (a) => run(() => api.get('/capacity/requests', a)),
  );
  server.registerTool(
    'commercebook_capacity_request',
    {
      title: 'Request capacity',
      description: 'POST /capacity/requests: ask another warehouse (node_id from commercebook_members, or its member_id) for pallet positions over a date range.',
      inputSchema: {
        node_id: UUID.optional(),
        member_id: UUID.optional(),
        positions: z.number().int().min(1),
        start_date: DATE,
        end_date: DATE,
        requirements: z.string().max(2000).optional(),
        for: z.string().max(200).optional().describe('The requester name shown to the node; your member name by default.'),
      },
    },
    async (a) => run(() => api.post('/capacity/requests', a)),
  );
  server.registerTool(
    'commercebook_capacity_quote',
    { title: 'Quote a request', description: 'POST /capacity/requests/{id}/quote: quote a request your node received.', inputSchema: { request_id: UUID, quote_cents: z.number().int().min(1), note: z.string().max(2000).optional() } },
    async ({ request_id, ...body }) => run(() => api.post(`/capacity/requests/${request_id}/quote`, body)),
  );

  server.registerTool('commercebook_threads_list', { title: 'Inbox', description: 'GET /messages/threads: your message threads.', inputSchema: { ...page } }, async (a) => run(() => api.get('/messages/threads', a)));
  server.registerTool(
    'commercebook_thread_get',
    { title: 'Read a thread', description: 'GET /messages/threads/{id}: one thread with its messages, oldest first.', inputSchema: { thread_id: UUID } },
    async ({ thread_id }) => run(() => api.get(`/messages/threads/${thread_id}`)),
  );
  server.registerTool(
    'commercebook_message_send',
    { title: 'Send a message', description: 'POST /messages/threads/{id}: send a message in an open thread.', inputSchema: { thread_id: UUID, body: z.string().min(1).max(4000), attachment } },
    async ({ thread_id, ...body }) => run(() => api.post(`/messages/threads/${thread_id}`, body)),
  );
  server.registerTool(
    'commercebook_message_request',
    {
      title: 'Message a member',
      description: 'POST /messages/request: the first message to a member opens a thread they accept in the app. An existing open or requested thread is returned instead.',
      inputSchema: { member_id: UUID, body: z.string().min(1).max(4000), attachment },
    },
    async (a) => run(() => api.post('/messages/request', a)),
  );

  server.registerTool('commercebook_prices', { title: 'Your Prices', description: 'GET /costs/prices: your invoiced items against the network quotes, as the app computes them. Each quote carries its match (exact, reviewed_equivalent or possible); only an exact or reviewed match carries a saving. annual_qty is null when the yearly use is not known.', inputSchema: {} }, async () => run(() => api.get('/costs/prices')));
  server.registerTool('commercebook_members', { title: 'Member directory', description: 'GET /network/members: the directory, public fields only, with each member’s node id.', inputSchema: { ...page } }, async (a) => run(() => api.get('/network/members', a)));
  registerSellerTools(server, api);
  registerParity2Tools(server, api);
  registerParity1Tools(server, api);
}
