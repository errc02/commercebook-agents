/**
 * SPEC-36 part 2 parity tools: one per endpoint added in migration 063 (docs/API-PARITY.md lists each against the
 * screen action it matches). Same conventions as tools.ts: typed inputs, the API's JSON as text, refusals as error
 * results with the API code (needs_approval carries the approval_id the owner sees on Agent access).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiError, type ApiClient } from './client.js';

/** SPEC-64 fact 8: an agent never accepts the policies for the owner; the API answers the same refusal. */
export const OWNER_ACCEPTS_POLICIES_HINT = 'The owner accepts the seller policies in person, signed in on the seller portal: https://seller.commercebook.ai/sell?step=policies.';

const UUID = z.string().uuid();
const OPID = z.string().min(8).max(96).regex(/^[A-Za-z0-9_:-]+$/).optional().describe('Idempotency key; a retry with the same one returns the first answer.');
const page = { cursor: z.string().optional().describe('The next_cursor of the previous page.'), limit: z.number().int().min(1).max(200).optional() };

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    if (e instanceof ApiError) {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
    }
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
  }
}

export const PARITY2_TOOL_NAMES = [
  'commercebook_lead_get', 'commercebook_lead_buy', 'commercebook_lead_withdraw', 'commercebook_lead_places', 'commercebook_lead_price', 'commercebook_lead_text', 'commercebook_lead_update', 'commercebook_lead_introduction',
  'commercebook_lead_call', 'commercebook_lead_rate', 'commercebook_lead_challenge',
  // SPEC-91 (124): the stars of a bought lead and what your leads earned.
  'commercebook_lead_stars', 'commercebook_lead_mark', 'commercebook_lead_earnings', 'commercebook_lead_statement', 'commercebook_claims_list', 'commercebook_claim_outcome',
  'commercebook_claim_defect',
  // CB-901 (153): your sold prices by stated source, and a member's lead scorecard.
  'commercebook_lead_source_prices', 'commercebook_member_lead_scorecard',
  'commercebook_deal_get', 'commercebook_deal_delete', 'commercebook_deal_note_add', 'commercebook_crm_import',
  'commercebook_capacity_accept', 'commercebook_capacity_quote_withdraw', 'commercebook_capacity_request_withdraw',
  'commercebook_thread_respond', 'commercebook_thread_read', 'commercebook_thread_mute', 'commercebook_thread_report', 'commercebook_member_block',
  'commercebook_group_create', 'commercebook_attachables', 'commercebook_unread_count',
  'commercebook_member_get', 'commercebook_delegations', 'commercebook_delegation_respond', 'commercebook_delegation_end',
  'commercebook_settings_get', 'commercebook_settings_contact', 'commercebook_agent_limits',
  'commercebook_seller_entity_get', 'commercebook_seller_entity_update', 'commercebook_seller_fulfillment', 'commercebook_seller_policies_accept',
  'commercebook_seller_delegation_warehouses', 'commercebook_seller_delegation_end',
  // SPEC-83 (115): the ship-from addresses.
  'commercebook_seller_ship_from_list', 'commercebook_seller_ship_from_set',
] as const;

type Name = (typeof PARITY2_TOOL_NAMES)[number];

export function registerParity2Tools(server: McpServer, api: ApiClient): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the input is validated by inputSchema before the callback runs
  type Args = Record<string, any>;
  const tool = (name: Name, title: string, description: string, inputSchema: z.ZodRawShape, cb: (a: Args) => Promise<unknown>) =>
    server.registerTool(name, { title, description, inputSchema }, async (a: Args) => run(() => cb(a)));

  // Lead Exchange
  tool('commercebook_lead_get', 'Read a lead', 'GET /leads/{id}: one lead as the exchange shows it, with quality: the lead quality score (0 to 9), what is present, and on your own lead what is missing.', { lead_id: UUID }, ({ lead_id }) => api.get(`/leads/${lead_id}`));
  tool(
    'commercebook_lead_buy',
    'Buy a lead',
    'POST /leads/{id}/buy: buys a lead within the money limits on the key; over a limit the answer is needs_approval with the approval_id the owner sees. In Stripe test mode payment_method (pm_card_visa) confirms the card payment at once. A priced lead needs the payments activity on the key.',
    { lead_id: UUID, payment_method: z.string().regex(/^pm_[A-Za-z0-9_]+$/).optional(), operation_id: z.string().min(8).max(128).optional() },
    ({ lead_id, ...b }) => api.post(`/leads/${lead_id}/buy`, b),
  );
  tool('commercebook_lead_withdraw', 'Withdraw a lead', 'POST /leads/{id}/withdraw: takes your draft or open lead off the exchange, until a buyer claims it.', { lead_id: UUID }, ({ lead_id }) => api.post(`/leads/${lead_id}/withdraw`, {}));
  tool('commercebook_lead_places', 'Set buyer places', 'PATCH /leads/{id}/places: how many buyers may buy your lead (1 makes it exclusive).', { lead_id: UUID, places: z.number().int().min(1).max(50) }, ({ lead_id, places }) => api.patch(`/leads/${lead_id}/places`, { places }));
  tool('commercebook_lead_price', 'Change a lead price', 'PATCH /leads/{id}/price: the flat price in cents of your draft or open lead, before any buyer claims it (0 is a free lead).', { lead_id: UUID, price_cents: z.number().int().min(0).max(100_000_000) }, ({ lead_id, price_cents }) => api.patch(`/leads/${lead_id}/price`, { price_cents }));
  tool(
    'commercebook_lead_text',
    'Change a lead title, summary or source',
    'PATCH /leads/{id}/text: the title (80 characters), the one-line summary (140) and where the lead came from (lead_source: own, referral, vendor, event, outreach or other; referral_source: the name that goes with it, required for vendor) of your draft or open lead. Fields left out stay as they are; the title and the summary must not name the shipper.',
    { lead_id: UUID, title: z.string().min(1).max(80).optional(), summary_short: z.string().min(1).max(140).optional(), lead_source: z.enum(['own', 'referral', 'vendor', 'event', 'outreach', 'other']).optional(), referral_source: z.string().max(60).optional() },
    ({ lead_id, ...b }) => api.patch(`/leads/${lead_id}/text`, b),
  );
  // SPEC-75 (107): Add details on a My Listings card.
  const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const nInt = z.number().int().min(0).nullable().optional();
  tool(
    'commercebook_lead_update',
    'Add details to a lead',
    'PATCH /leads/{id}: adds details to your draft or open lead before any buyer claims it (409 lead_has_claims after one): product, current_provider (a buyer sees it after purchase), inbound_mode (parcel, pallet, container), units_per_order, rate_expectation (the budget), the volumes and the window. A field sent replaces the stored one, null clears it, a field left out stays. The summary and the scope of work stay as they are. The answer carries quality, the lead quality score (0 to 9) with what is present and missing.',
    {
      lead_id: UUID,
      product: z.string().max(200).nullable().optional(),
      current_provider: z.string().max(200).nullable().optional(),
      inbound_mode: z.array(z.enum(['parcel', 'pallet', 'container'])).max(3).nullable().optional(),
      units_per_order: nInt,
      rate_expectation: z.string().max(200).nullable().optional(),
      orders_month: nInt,
      pallets_on_hand: nInt,
      pallets_inbound_month: nInt,
      units_month: nInt,
      containers_month: nInt,
      sqft: nInt,
      skus: nInt,
      window_start: day.nullable().optional(),
      window_end: day.nullable().optional(),
    },
    ({ lead_id, ...b }) => api.patch(`/leads/${lead_id}`, b),
  );
  tool('commercebook_lead_introduction', 'Send the introduction', 'POST /leads/{id}/introduction: sends the introduction to the buyers of your lead.', { lead_id: UUID, message: z.string().max(2000).optional() }, ({ lead_id, ...b }) => api.post(`/leads/${lead_id}/introduction`, b));
  tool('commercebook_lead_call', 'Schedule the call', 'POST /leads/{id}/call: schedules the call with the buyers of your lead (at: ISO 8601 with zone).', { lead_id: UUID, at: z.string() }, ({ lead_id, at }) => api.post(`/leads/${lead_id}/call`, { at }));
  tool('commercebook_lead_rate', 'Rate a bought lead', 'POST /leads/{id}/rating: rates a lead you bought as_described or overstated, once.', { lead_id: UUID, rating: z.enum(['as_described', 'overstated']) }, ({ lead_id, rating }) => api.post(`/leads/${lead_id}/rating`, { rating }));
  tool('commercebook_lead_stars', 'Give a bought lead stars', 'POST /leads/{id}/stars: gives a lead you bought 1 to 5 stars, once, within 30 days of the purchase. The stars count toward the rating of the poster.', { lead_id: UUID, stars: z.number().int().min(1).max(5) }, ({ lead_id, stars }) => api.post(`/leads/${lead_id}/stars`, { stars }));
  tool('commercebook_lead_mark', 'Pass on a lead or save it', 'POST /leads/{id}/mark: pass lists the lead last on your exchange, save keeps it under Saved, null clears the mark. Your own note on another member\u2019s lead; every role may mark.', { lead_id: UUID, mark: z.enum(['pass', 'save']).nullable() }, ({ lead_id, mark }) => api.post(`/leads/${lead_id}/mark`, { mark }));
  tool('commercebook_lead_source_prices', 'Your sold prices by source', 'GET /leads/source-prices: your paid, unrefunded sales per stated source (a paid lead vendor per vendor name): how many, the low, median and high price and the last sale. Guidance for pricing your next lead; nothing reprices a lead.', {}, () => api.get('/leads/source-prices'));
  tool('commercebook_lead_earnings', 'What your leads earned', 'GET /leads/earnings: one row per lead you posted with sales, the fee, your proceeds, the part held and the part paid out, and the totals.', {}, () => api.get('/leads/earnings'));
  tool(
    'commercebook_lead_statement',
    'Your lead sales statement',
    'GET /leads/statement: one line per sale of your leads in the window (from, to as ISO 8601 times; all time by default) with the fee, your proceeds and the payout state.',
    { from: z.string().optional(), to: z.string().optional() },
    ({ from, to }) => api.get('/leads/statement', { from, to }),
  );
  tool('commercebook_lead_challenge', 'Challenge a duplicate', 'POST /leads/{id}/challenge: challenges a listing that duplicates your prospect, with evidence.', { lead_id: UUID, evidence: z.string().min(1).max(4000) }, ({ lead_id, evidence }) => api.post(`/leads/${lead_id}/challenge`, { evidence }));
  tool('commercebook_claims_list', 'My bought leads', 'GET /leads/claims: the leads you bought, newest first.', { ...page }, (a) => api.get('/leads/claims', a));
  tool('commercebook_claim_outcome', 'Record an outcome', 'POST /leads/claims/{id}/outcome: records what happened with a lead you bought.', { claim_id: UUID, outcome: z.string().min(1).max(40) }, ({ claim_id, outcome }) => api.post(`/leads/claims/${claim_id}/outcome`, { outcome }));
  tool('commercebook_claim_defect', 'Report a defect', 'POST /leads/claims/{id}/defect: reports a problem with a lead you bought, within 7 days of buying it. kind is email_bounced, phone_invalid, already_client, duplicate, never_asked or fabricated (a contact that does not exist), the six refund reasons; fabricated needs evidence, is decided at review, and a confirmed one is a strike against the seller. overstated (volumes smaller than posted) needs evidence, refunds nothing and is noted on the seller’s record without a strike.', { claim_id: UUID, kind: z.string().min(1).max(40), evidence: z.string().max(4000).optional() }, ({ claim_id, ...b }) => api.post(`/leads/claims/${claim_id}/defect`, b));

  // CRM
  tool('commercebook_deal_get', 'Read a deal', 'GET /crm/deals/{id}: one deal with its notes.', { deal_id: UUID }, ({ deal_id }) => api.get(`/crm/deals/${deal_id}`));
  tool('commercebook_deal_delete', 'Delete a deal', 'DELETE /crm/deals/{id}: deletes an archived deal (archive it first with commercebook_deal_update). A GoHighLevel deal is not deleted: it is archived and hidden from the Leads table (hidden true), archived or not before, because GoHighLevel keeps the opportunity; commercebook_deal_update with archived false restores it.', { deal_id: UUID }, ({ deal_id }) => api.del(`/crm/deals/${deal_id}`));
  tool('commercebook_deal_note_add', 'Add a deal note', 'POST /crm/deals/{id}/notes: adds a note to a deal.', { deal_id: UUID, text: z.string().min(1).max(8000), type: z.string().max(40).optional() }, ({ deal_id, ...b }) => api.post(`/crm/deals/${deal_id}/notes`, b));
  tool(
    'commercebook_crm_import',
    'Import deals',
    'POST /crm/import: imports deals from CSV text (the CRM sample columns; HubSpot style names are renamed) or rows; dry_run returns what would be created.',
    { csv: z.string().optional(), rows: z.array(z.record(z.string(), z.unknown())).optional(), dry_run: z.boolean().optional() },
    (a) => api.post('/crm/import', a),
  );

  // Capacity
  tool('commercebook_capacity_accept', 'Accept a quote', 'POST /capacity/requests/{id}/accept: accepts the quote on a request you sent; a contract record, nothing is paid.', { request_id: UUID }, ({ request_id }) => api.post(`/capacity/requests/${request_id}/accept`, {}));
  tool('commercebook_capacity_quote_withdraw', 'Withdraw a quote', 'POST /capacity/requests/{id}/quote/withdraw: takes back a quote your node gave, before it is accepted.', { request_id: UUID }, ({ request_id }) => api.post(`/capacity/requests/${request_id}/quote/withdraw`, {}));
  tool('commercebook_capacity_request_withdraw', 'Withdraw a request', 'POST /capacity/requests/{id}/withdraw: withdraws a capacity request you sent, while it is requested or quoted; once accepted it answers capacity_state.', { request_id: UUID }, ({ request_id }) => api.post(`/capacity/requests/${request_id}/withdraw`, {}));

  // Messages
  tool('commercebook_thread_respond', 'Answer a request', 'POST /messages/threads/{id}/respond: accepts or ignores a message request.', { thread_id: UUID, accept: z.boolean() }, ({ thread_id, accept }) => api.post(`/messages/threads/${thread_id}/respond`, { accept }));
  tool('commercebook_thread_read', 'Mark read', 'POST /messages/threads/{id}/read: marks a thread read.', { thread_id: UUID }, ({ thread_id }) => api.post(`/messages/threads/${thread_id}/read`, {}));
  tool('commercebook_thread_mute', 'Mute a thread', 'POST /messages/threads/{id}/mute: mutes or unmutes a thread.', { thread_id: UUID, muted: z.boolean() }, ({ thread_id, muted }) => api.post(`/messages/threads/${thread_id}/mute`, { muted }));
  tool('commercebook_thread_report', 'Report a thread', 'POST /messages/threads/{id}/report: reports a thread or one message to CommerceBook.', { thread_id: UUID, reason: z.string().min(1).max(1000), message_id: UUID.optional() }, ({ thread_id, ...b }) => api.post(`/messages/threads/${thread_id}/report`, b));
  tool('commercebook_member_block', 'Block a member', 'POST /messages/members/{id}/block: blocks or unblocks a member.', { member_id: UUID, block: z.boolean() }, ({ member_id, block }) => api.post(`/messages/members/${member_id}/block`, { block }));
  tool('commercebook_group_create', 'Start a group', 'POST /messages/groups: starts a group with two or more members you already message.', { member_ids: z.array(UUID).min(2).max(20), subject: z.string().min(1).max(200), body: z.string().min(1).max(4000) }, (a) => api.post('/messages/groups', a));
  tool('commercebook_attachables', 'Attachable records', 'GET /messages/attachables: your leads, deals, facilities and capacity requests as attachment cards for a message.', {}, () => api.get('/messages/attachables'));
  tool('commercebook_unread_count', 'Unread count', 'GET /messages/unread: how many messages wait unread.', {}, () => api.get('/messages/unread'));

  // Network
  tool('commercebook_member_get', 'Read a member', 'GET /network/members/{id}: one member’s public card with facilities, node, rate card, record and lead scorecard.', { member_id: UUID }, ({ member_id }) => api.get(`/network/members/${member_id}`));
  tool('commercebook_member_lead_scorecard', 'Read a lead scorecard', 'GET /network/members/{id}/lead-scorecard: how a member’s leads turned out, from outcomes only: posted, sold, sales, ratings as described, confirmed defects, refunds and strikes, overall and per stated source. A rate is null under 3 in its count.', { member_id: UUID }, ({ member_id }) => api.get(`/network/members/${member_id}/lead-scorecard`));
  tool('commercebook_delegations', 'Warehouse agreement requests', 'GET /network/delegations: sellers asking your warehouse for a warehouse agreement (a delegation in the API) to store and ship their goods.', { ...page }, (a) => api.get('/network/delegations', a));
  tool('commercebook_delegation_respond', 'Answer a warehouse agreement request', 'POST /network/delegations/{id}/respond: accepts or declines a seller’s request for a warehouse agreement.', { delegation_id: UUID, accept: z.boolean() }, ({ delegation_id, accept }) => api.post(`/network/delegations/${delegation_id}/respond`, { accept }));
  tool('commercebook_delegation_end', 'End a warehouse agreement', 'POST /network/delegations/{id}/end: ends a warehouse agreement; the products stored under it stop selling.', { delegation_id: UUID }, ({ delegation_id }) => api.post(`/network/delegations/${delegation_id}/end`, {}));

  // Settings and the key
  tool('commercebook_settings_get', 'Contact settings', 'GET /settings: your phone, who sees it and how you hear about messages.', {}, () => api.get('/settings'));
  tool(
    'commercebook_settings_contact',
    'Change contact settings',
    'PATCH /settings/contact: changes the phone (null clears it), its visibility (members, public, hidden) or message notifications (immediate, daily, none).',
    { phone: z.string().max(30).nullable().optional(), phone_visibility: z.enum(['members', 'public', 'hidden']).optional(), message_notify: z.enum(['immediate', 'daily', 'none']).optional() },
    (a) => api.patch('/settings/contact', a),
  );
  tool('commercebook_agent_limits', 'Key limits', 'GET /agent/limits: the money ceilings and approval areas on this key, today’s spend, the 30-day cap and the monthly budget with what was spent this month and what remains, and the approvals not yet used.', {}, () => api.get('/agent/limits'));

  // Seller sign-up steps except Stripe
  tool('commercebook_seller_entity_get', 'Business details', 'GET /seller/entity: your business details, what they still need and readiness.', {}, () => api.get('/seller/entity'));
  tool('commercebook_seller_entity_update', 'Fill in the business details', 'PATCH /seller/entity: sets fields of the business details (legal_name, entity_type, ein, address, responsible person, beneficial_owners, w9_status).', { entity: z.record(z.string(), z.unknown()), operation_id: OPID }, (a) => api.patch('/seller/entity', a));
  tool(
    'commercebook_seller_fulfillment',
    'Choose fulfillment',
    'PATCH /seller/fulfillment: who ships your orders, self (ship_from, cutoff_local HH:MM, carriers) or warehouse; with warehouse_member_id the request for a warehouse agreement goes out too.',
    {
      fulfillment_mode: z.enum(['self', 'warehouse']),
      ship_from: z.object({ address_line1: z.string(), address_line2: z.string().optional(), city: z.string(), state: z.string().length(2), postal_code: z.string() }).optional(),
      cutoff_local: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      carriers: z.array(z.string()).optional(),
      warehouse_member_id: UUID.optional(),
      facility_id: UUID.optional(),
      terms: z.string().max(2000).optional(),
      operation_id: OPID,
    },
    (a) => api.patch('/seller/fulfillment', a),
  );
  // SPEC-64 fact 8: the tool stays registered under its name and always refuses; the API route answers the same 403.
  tool('commercebook_seller_policies_accept', 'Accept policies (the owner only)', 'POST /seller/policies/accept: always refused with 403 owner_accepts_policies. An agent never accepts the policies for the owner; the owner accepts them in person on the seller portal.', { version: z.string().max(40).optional(), operation_id: OPID }, async () => {
    throw new ApiError(403, 'owner_accepts_policies', 'an agent never accepts the policies for the owner', null, null, OWNER_ACCEPTS_POLICIES_HINT);
  });
  tool('commercebook_seller_delegation_warehouses', 'Warehouses that can ship for you', 'GET /seller/delegations/warehouses: verified warehouses that can store and ship your goods.', { ...page }, (a) => api.get('/seller/delegations/warehouses', a));
  // SPEC-83 (115): ship-from addresses. Buyers see only the city and state.
  tool(
    'commercebook_seller_ship_from_list',
    'Ship-from addresses',
    'GET /seller/ship-from: every address you ship from (label, street lines, city, state, postal code, phone), the default first, with the products that name each one. You can ship from more than one address; buyers see only the city and state.',
    {},
    () => api.get('/seller/ship-from'),
  );
  tool(
    'commercebook_seller_ship_from_set',
    'Add or change a ship-from address',
    'POST /seller/ship-from (PATCH /seller/ship-from/{id} with id): without id, adds an address (label, address_line1, city, state, postal_code; the first one becomes the default). With id, changes the named fields, makes it the default (is_default true), archives it (archived true; refused while a live product names it, with the count) or restores it (archived false). label is your own name for the place and never reaches a buyer; a product names its address by label or id with ship_from on commercebook_seller_catalog_upsert.',
    {
      id: UUID.optional().describe('The address to change; leave it out to add one.'),
      label: z.string().min(1).max(60).optional(),
      address_line1: z.string().min(1).max(200).optional(),
      address_line2: z.string().max(200).nullable().optional(),
      city: z.string().min(1).max(100).optional(),
      state: z.string().length(2).optional(),
      postal_code: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
      country: z.literal('US').optional(),
      phone: z.string().max(30).nullable().optional().describe('For the carrier label.'),
      is_default: z.boolean().optional(),
      archived: z.boolean().optional(),
      operation_id: OPID,
    },
    ({ id, ...b }) => (id ? api.patch(`/seller/ship-from/${id}`, b) : api.post('/seller/ship-from', b)),
  );
  tool('commercebook_seller_delegation_end', 'End a warehouse agreement', 'POST /seller/delegations/{id}/end: ends your warehouse agreement with a warehouse.', { delegation_id: UUID, operation_id: OPID }, ({ delegation_id, ...b }) => api.post(`/seller/delegations/${delegation_id}/end`, b));
}
