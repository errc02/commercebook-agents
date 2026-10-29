/**
 * SPEC-36 part 1 parity tools: one per endpoint added in migration 064 (docs/API-PARITY.md lists each against the
 * screen action it matches): the profile page, the logo, facilities and their pictures and video, the rate card,
 * Costs and Warehouse preferences. Same conventions as tools.ts: typed inputs, the API's JSON as text, refusals as
 * error results with the API code. A file goes as url (a public https address the API fetches) or content_base64.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiError, type ApiClient } from './client.js';

const UUID = z.string().uuid();
const page = { cursor: z.string().optional().describe('The next_cursor of the previous page.'), limit: z.number().int().min(1).max(200).optional() };
const sources = z.record(z.string(), z.string().min(1).max(500)).optional().describe('Where each fact came from, one note per field written (a URL, a document, "the owner said").');
const file = {
  url: z.string().url().optional().describe('A public https address of the file; the API fetches and stores it.'),
  content_base64: z.string().optional().describe('The file itself, base64.'),
  filename: z.string().max(200).optional(),
  content_type: z.string().max(100).optional(),
};
const cents = z.number().int().min(1);
const facility = {
  name: z.string().min(1).max(120),
  address: z.string().min(1).max(200).describe('The street address.'),
  city: z.string().min(1).max(80),
  state: z.string().regex(/^[A-Za-z]{2}$/),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/).nullable(),
  sqft: z.number().int().min(0).nullable(),
  services: z.array(z.string().min(1).max(40)).max(12),
};
const person = { name: z.string().min(1).max(80), role: z.string().max(80).nullable().optional(), line: z.string().max(160).nullable().optional() };

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

export const PARITY1_TOOL_NAMES = [
  'commercebook_profile_get', 'commercebook_service_catalog', 'commercebook_profile_completeness', 'commercebook_profile_about', 'commercebook_profile_services',
  'commercebook_profile_people', 'commercebook_profile_person_add', 'commercebook_profile_certifications', 'commercebook_profile_contact',
  'commercebook_profile_logo', 'commercebook_profile_logo_remove', 'commercebook_rate_card_get', 'commercebook_rate_card_set',
  'commercebook_facilities_list', 'commercebook_facility_create', 'commercebook_facility_update', 'commercebook_facility_delete', 'commercebook_facility_pin',
  'commercebook_facility_media_add', 'commercebook_facility_media_order', 'commercebook_facility_media_remove',
  'commercebook_costs_rank', 'commercebook_costs_summary', 'commercebook_price_match', 'commercebook_invoices_list', 'commercebook_invoice_upload', 'commercebook_invoice_parse',
  'commercebook_invoice_delete', 'commercebook_quote_requests', 'commercebook_quote_request', 'commercebook_cost_dismiss',
  'commercebook_rate_shop', 'commercebook_share_requests', 'commercebook_share_request', 'commercebook_share_answer',
  'commercebook_preferences_get', 'commercebook_preferences_set',
] as const;

type Name = (typeof PARITY1_TOOL_NAMES)[number];

export function registerParity1Tools(server: McpServer, api: ApiClient): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the input is validated by inputSchema before the callback runs
  type Args = Record<string, any>;
  const tool = (name: Name, title: string, description: string, inputSchema: z.ZodRawShape, cb: (a: Args) => Promise<unknown>) =>
    server.registerTool(name, { title, description, inputSchema }, async (a: Args) => run(() => cb(a)));

  // The profile page
  tool('commercebook_profile_get', 'Read the profile', 'GET /profile: About and its source, services, people, certifications, the logo, the phone and who sees it.', {}, () => api.get('/profile'));
  tool('commercebook_service_catalog', 'Standard services', 'GET /profile/services/catalog: the standard services a profile can list, by key.', {}, () => api.get('/profile/services/catalog'));
  tool('commercebook_profile_completeness', 'Profile completeness', 'GET /profile/completeness: the ten items of the Home meter with the next call for each gap.', {}, () => api.get('/profile/completeness'));
  tool('commercebook_profile_about', 'Write About', 'PATCH /profile/about: writes the About paragraph (up to 1,200 characters; null clears it).', { about: z.string().max(1200).nullable(), sources }, (a) => api.patch('/profile/about', a));
  tool(
    'commercebook_profile_services',
    'Set services',
    'PATCH /profile/services: replaces the services list in order: {catalog_key} for a standard service, {id?, title, body} for a custom one (6 custom at most).',
    { services: z.array(z.union([z.object({ catalog_key: z.string() }), z.object({ id: UUID.optional(), title: z.string().min(1).max(80), body: z.string().max(240).nullable().optional() })])).max(60), sources },
    (a) => api.patch('/profile/services', a),
  );
  tool(
    'commercebook_profile_people',
    'Set people',
    'PATCH /profile/people: replaces the people list (three at most, in order); keep a person by id, add a photo by photo_url.',
    { people: z.array(z.object({ id: UUID.optional(), ...person, photo_path: z.string().nullable().optional(), photo_url: z.string().url().optional() })).max(3), sources },
    (a) => api.patch('/profile/people', a),
  );
  tool(
    'commercebook_profile_person_add',
    'Add a person',
    'POST /profile/people: adds one person after the others, with a photo by photo_url or photo_base64.',
    { ...person, photo_url: z.string().url().optional(), photo_base64: z.string().optional(), photo_filename: z.string().max(200).optional(), sources },
    (a) => api.post('/profile/people', a),
  );
  tool('commercebook_profile_certifications', 'Set certifications', 'PATCH /profile/certifications: replaces the certifications and systems (12 at most).', { certifications: z.array(z.string().min(1).max(60)).max(12), sources }, (a) => api.patch('/profile/certifications', a));
  tool(
    'commercebook_profile_contact',
    'Set the profile phone',
    'PATCH /profile/contact: changes the profile phone (null clears it) and who sees it (members, public, hidden).',
    { phone: z.string().max(30).nullable().optional(), phone_visibility: z.enum(['members', 'public', 'hidden']).optional(), sources },
    (a) => api.patch('/profile/contact', a),
  );
  tool('commercebook_profile_logo', 'Set the logo', 'POST /profile/logo: adds or replaces the logo from url or content_base64 (JPEG, PNG or WebP).', { ...file, sources }, (a) => api.post('/profile/logo', a));
  tool('commercebook_profile_logo_remove', 'Remove the logo', 'DELETE /profile/logo: removes the logo; the profile shows the initial mark.', {}, () => api.del('/profile/logo'));
  tool('commercebook_rate_card_get', 'Read the rate card', 'GET /profile/rate-card: the rate card as published on your node.', {}, () => api.get('/profile/rate-card'));
  tool(
    'commercebook_rate_card_set',
    'Publish the rate card',
    'PATCH /profile/rate-card: publishes up to four lines, each optional (cents): storage per pallet per month, receiving per pallet, pick and pack per order, projects per hour, shown as from prices. A number sets a line, null clears it; at least one line must remain. handling_out_per_pallet_cents is the out handling for instant quotes when it differs from receiving.',
    {
      storage_per_pallet_month_cents: cents.nullable().optional(),
      handling_in_per_pallet_cents: cents.nullable().optional(),
      pick_pack_per_order_cents: cents.nullable().optional(),
      project_per_hour_cents: cents.nullable().optional(),
      handling_out_per_pallet_cents: cents.nullable().optional(),
      terms: z.string().max(1000).nullable().optional(),
      sources,
    },
    (a) => api.patch('/profile/rate-card', a),
  );

  // Facilities
  tool('commercebook_facilities_list', 'Your facilities', 'GET /facilities: your facilities with their photos, video and pins.', {}, () => api.get('/facilities'));
  tool(
    'commercebook_facility_create',
    'Add a facility',
    'POST /facilities: adds a facility and places its pin from the street address (city centre when the address does not resolve).',
    { ...facility, zip: facility.zip.optional(), sqft: facility.sqft.optional(), services: facility.services.optional(), sources },
    (a) => api.post('/facilities', a),
  );
  tool(
    'commercebook_facility_update',
    'Change a facility',
    'PATCH /facilities/{id}: changes the named fields; a changed address places the pin again.',
    { facility_id: UUID, name: facility.name.optional(), address: facility.address.optional(), city: facility.city.optional(), state: facility.state.optional(), zip: facility.zip.optional(), sqft: facility.sqft.optional(), services: facility.services.optional(), sources },
    ({ facility_id, ...b }) => api.patch(`/facilities/${facility_id}`, b),
  );
  tool('commercebook_facility_delete', 'Remove a facility', 'DELETE /facilities/{id}: removes a facility and its stored files; cannot be undone.', { facility_id: UUID }, ({ facility_id }) => api.del(`/facilities/${facility_id}`));
  tool('commercebook_facility_pin', 'Place the pin', 'POST /facilities/{id}/pin: places the pin again from the address (retry asks the map service again).', { facility_id: UUID, retry: z.boolean().optional() }, ({ facility_id, ...b }) => api.post(`/facilities/${facility_id}/pin`, b));
  tool(
    'commercebook_facility_media_add',
    'Add a photo or video',
    'POST /facilities/{id}/media: adds a photo (10 at most) or the video (1): url as a link, or store true, or content_base64 to store the file.',
    { facility_id: UUID, kind: z.enum(['image', 'video']).optional(), caption: z.string().max(120).nullable().optional(), store: z.boolean().optional(), ...file, sources },
    ({ facility_id, ...b }) => api.post(`/facilities/${facility_id}/media`, b),
  );
  tool(
    'commercebook_facility_media_order',
    'Reorder photos',
    'PATCH /facilities/{id}/media: lists every photo and the video once in the new order, with any caption changes.',
    { facility_id: UUID, items: z.array(z.object({ id: UUID, caption: z.string().max(120).nullable().optional() })).max(11), sources },
    ({ facility_id, ...b }) => api.patch(`/facilities/${facility_id}/media`, b),
  );
  tool('commercebook_facility_media_remove', 'Remove a photo', 'DELETE /facilities/media/{id}: removes one photo or the video; cannot be undone.', { media_id: UUID }, ({ media_id }) => api.del(`/facilities/media/${media_id}`));

  // Costs
  tool('commercebook_costs_rank', 'Cost rank', 'GET /costs/rank: your rank and the network median per category, the categories above the median and the top overspends.', {}, () => api.get('/costs/rank'));
  tool('commercebook_costs_summary', 'Costs summary', 'GET /costs/summary: the invoices read this month and the biggest saving on Your Prices, with its next step (the spend line of Purchases).', {}, () => api.get('/costs/summary'));
  tool(
    'commercebook_price_match',
    'Record a matched price',
    'POST /costs/prices/match: records the price your vendor matched for an item of Your Prices (item_key), or the refusal.',
    { item_key: z.string().min(1), outcome: z.enum(['matched', 'refused']), matched_unit_price_cents: cents.optional(), note: z.string().max(4000).optional(), sources },
    (a) => api.post('/costs/prices/match', a),
  );
  tool('commercebook_invoices_list', 'Your invoices', 'GET /costs/invoices: your invoices and how each was read.', { ...page }, (a) => api.get('/costs/invoices', a));
  tool(
    'commercebook_invoice_upload',
    'Upload an invoice',
    'POST /costs/invoices: uploads an invoice from url or content_base64 (with filename) and reads it into Your Prices (parse false skips the read).',
    { ...file, parse: z.boolean().optional(), sources },
    (a) => api.post('/costs/invoices', a),
  );
  tool('commercebook_invoice_parse', 'Read an invoice again', 'POST /costs/invoices/{id}/parse: reads an invoice again; its lines are replaced.', { invoice_id: UUID }, ({ invoice_id }) => api.post(`/costs/invoices/${invoice_id}/parse`, {}));
  tool('commercebook_invoice_delete', 'Delete an invoice', 'DELETE /costs/invoices/{id}: deletes an invoice, its lines and its file; cannot be undone.', { invoice_id: UUID }, ({ invoice_id }) => api.del(`/costs/invoices/${invoice_id}`));
  tool('commercebook_quote_requests', 'Price requests', 'GET /costs/quote-requests: your network price requests.', { ...page }, (a) => api.get('/costs/quote-requests', a));
  tool(
    'commercebook_quote_request',
    'Request a network price',
    'POST /costs/quote-requests: asks for the network price on an item for a quantity and market (verified members). Name the item (item_key from commercebook_prices, and invoice_line_id) so the confirmed price confirms that item only.',
    { category: z.string().min(1), quote_id: UUID.nullable().optional(), qty: z.number().positive(), unit: z.string().min(1).max(40), ship_to_market: z.string().max(120).optional(), item_key: z.string().min(1).max(600).optional(), invoice_line_id: UUID.optional(), sources },
    (a) => api.post('/costs/quote-requests', a),
  );
  tool('commercebook_cost_dismiss', 'Not now', 'POST /costs/dismissals: hides a category from your savings for now (dismissed true) or shows it again.', { category: z.string().min(1), dismissed: z.boolean() }, (a) => api.post('/costs/dismissals', a));
  // SPEC-90 (migration 120): Rate shop, and Ask the Buyer to Share.
  tool(
    'commercebook_rate_shop',
    'Rate shop an item',
    'GET /costs/rate-shop: what the network pays for one item key, whether or not you buy it: best (the lowest other member price), lowest to highest, the members behind it, the vendor of the best price, the newest date and where your price sits. Never a member name.',
    { item_key: z.string().min(1).max(400).describe('item_key from commercebook_prices, or one built the same way: v2|<category>|<unit>|<field>=<value>;...') },
    (a) => api.get('/costs/rate-shop', a),
  );
  tool('commercebook_share_requests', 'Ask the Buyer to Share requests', 'GET /costs/share-requests: the requests you sent (with their outcome) and the ones other members sent you (anonymous until you add their order).', {}, () => api.get('/costs/share-requests'));
  tool(
    'commercebook_share_request',
    'Ask the buyer to share',
    'POST /costs/share-requests: asks the member behind the best network price for an item of Your Prices, anonymously, to share their vendor contact or add your order to their next purchase. One open request per item; the same member at most once in 30 days.',
    { item_key: z.string().min(1).max(400), qty: z.number().positive().optional() },
    (a) => api.post('/costs/share-requests', a),
  );
  tool(
    'commercebook_share_answer',
    'Answer a share request',
    'POST /costs/share-requests/{id}/answer: share (vendor_name, rep_name, email or phone; the requester sees only these and your price), pool (handling_fee_cents; a Messages thread opens with both company names) or decline.',
    {
      request_id: UUID,
      answer: z.enum(['share', 'pool', 'decline']),
      vendor_name: z.string().min(1).max(160).optional(),
      rep_name: z.string().max(120).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(40).optional(),
      handling_fee_cents: z.number().int().min(0).optional(),
    },
    ({ request_id, ...rest }) => api.post(`/costs/share-requests/${request_id}/answer`, rest),
  );

  // Settings
  tool('commercebook_preferences_get', 'Warehouse preferences', 'GET /settings/preferences: your markets, service chips, notification email, CRM preference and the WMS and CRM you run.', {}, () => api.get('/settings/preferences'));
  tool(
    'commercebook_preferences_set',
    'Change preferences',
    'PATCH /settings/preferences: changes the named fields: markets (City, ST), service chips, notification_email, crm_connection, crm_sharing, wms_system, crm_system, other_systems.',
    {
      markets: z.array(z.string()).min(1).max(30).optional(),
      services: z.array(z.string()).max(30).optional(),
      notification_email: z.string().nullable().optional(),
      crm_connection: z.enum(['none', 'warebook', 'gohighlevel', 'hubspot']).optional(),
      crm_sharing: z.enum(['hidden', 'counts', 'named']).optional(),
      wms_system: z.string().max(80).nullable().optional(),
      crm_system: z.string().max(80).nullable().optional(),
      other_systems: z.array(z.string().max(80)).max(20).nullable().optional(),
      sources,
    },
    (a) => api.patch('/settings/preferences', a),
  );
}
