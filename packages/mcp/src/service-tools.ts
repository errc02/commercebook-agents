/**
 * CB-973 (migration 189): services with booking, one operation per path of netlify/functions/lib/openapi-services.ts.
 * The intent tools reach them as commercebook_market action service_slots (no key), commercebook_buy actions book and
 * booking_cancel, commercebook_seller_products actions services, service, service_list and availability_set, and
 * commercebook_seller_orders action done (intent-table.ts). Reading a service's open slots needs no key, so
 * commercebook_service_slots is also on a connection without one. Registered once from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

export const SERVICE_KEYLESS_TOOL_NAMES = ['commercebook_service_slots'] as const;

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
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('A date, YYYY-MM-DD, in the seller’s time zone.');
const ADDRESS = z.object({ line1: z.string().min(3).max(200), line2: z.string().max(200).optional(), city: z.string().min(2).max(100), state: z.string().regex(/^[A-Za-z]{2}$/), zip: z.string().regex(/^\d{5}(-\d{4})?$/) });
const WINDOW = z.object({ day: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), start: z.string().describe('HH:MM, 24-hour'), end: z.string().describe('HH:MM, 24-hour; 24:00 is midnight') });
const AVAILABILITY = {
  weekly: z.array(WINDOW).max(28).optional().describe('The weekly open times: one window per day and time range; slots of the duration run back to back inside each window.'),
  closed_dates: z.array(DATE).max(400).optional().describe('Dates you are closed (all slots of the day leave the open set).'),
  time_zone: z.string().optional().describe('IANA time zone, America/Chicago by default.'),
};
const SERVICE = {
  title: z.string().min(3).max(300),
  description: z.string().max(5000).optional(),
  category: z.string().regex(/^(services|[a-z][a-z0-9_]{0,50}_services)$/).optional().describe('services by default, or a key ending in _services (for example plumbing_services).'),
  price_cents: z.number().int().min(100).describe('The price of one booking, all in.'),
  duration_minutes: z.number().int().min(15).max(720).describe('15 to 720, in steps of 5.'),
  location: z.enum(['buyer_address', 'seller_place']).describe('buyer_address: you go to the buyer, inside area_zip_prefixes; seller_place: the buyer comes to place.'),
  area_zip_prefixes: z.array(z.string().regex(/^\d{3,5}$/)).max(60).optional().describe('The ZIP prefixes you serve (3 to 5 digits each), for buyer_address.'),
  place: ADDRESS.optional().describe('Your address, for seller_place.'),
  no_show_fee_pct: z.number().min(0).max(100).optional().describe('Your no-show fee in percent (0 by default). Above 0 the buyer cannot cancel within 24 hours of the start.'),
  publish: z.boolean().optional().describe('false holds it off sale.'),
  ...AVAILABILITY,
};

function registerReads(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_service_slots', {
    title: 'Read a service and its open slots',
    annotations: READ_ONLY,
    description: 'GET /services/{id}/slots: one service’s price per booking, duration, where (the ZIP prefixes served, or the seller’s place), the time zone, the cancel rule and its open slots from a date for a number of days (14 by default, up to 60), soonest first. Each slot has starts_at (send it as slot_start to book), local_date and local_start in the seller’s time zone. No key needed.',
    inputSchema: { lot_id: z.string().uuid().describe('The service (the lot id from the market search).'), from: DATE.optional(), days: z.number().int().min(1).max(60).optional() },
  }, async ({ lot_id, ...q }) => run(() => api.get(`/services/${lot_id}/slots`, q)));
}

/** The reads only: a connection with no key. */
export function registerServiceKeylessTools(server: McpServer, api: ApiClient): void {
  registerReads(server, api);
}

export function registerServiceTools(server: McpServer, api: ApiClient): void {
  registerReads(server, api);
  server.registerTool('commercebook_service_book', {
    title: 'Book a slot of a service',
    description: 'POST /services/{id}/bookings: a quote for one slot (slot_start, exactly a starts_at from the slots read) that holds the slot for 15 minutes. A service at the buyer’s address needs address, inside the ZIP prefixes the seller serves. Then place and pay it as any order (commercebook_buy action place with the quote_id); the key’s limits apply there. 409 slot_taken: another booking holds it; read the slots again. Needs the orders activity. The sentence for the owner: "I booked <service> on <date> at <time>; it costs $X."',
    inputSchema: {
      lot_id: z.string().uuid(),
      slot_start: z.string().describe('The slot’s starts_at, ISO 8601 with its offset.'),
      address: ADDRESS.optional().describe('Where the work is done, when the seller comes to the buyer.'),
    },
  }, async ({ lot_id, ...body }) => run(() => api.post(`/services/${lot_id}/bookings`, body)));
  server.registerTool('commercebook_service_cancel', {
    title: 'Cancel a booked service',
    description: 'POST /services/orders/{id}/cancel: cancels a booked service. More than 24 hours before the start the payment is voided in full and the slot opens again. Within 24 hours it passes only when the seller’s no-show fee is 0; otherwise 409 late_cancel_fee (detail: the percent) and the agent asks the owner. Needs the orders activity.',
    inputSchema: { order_id: z.string().uuid(), reason: z.string().max(500).optional() },
  }, async ({ order_id, ...body }) => run(() => api.post(`/services/orders/${order_id}/cancel`, body)));

  server.registerTool('commercebook_seller_services', {
    title: 'Your services',
    annotations: READ_ONLY,
    description: 'GET /seller/services: your services with their terms, open times, the next open slots and the bookings to come. Needs catalog read.',
    inputSchema: {},
  }, async () => run(() => api.get('/seller/services')));
  server.registerTool('commercebook_seller_service', {
    title: 'One of your services',
    annotations: READ_ONLY,
    description: 'GET /seller/services/{id}: one service with its terms, open times, the next open slots and the bookings to come. Needs catalog read.',
    inputSchema: { lot_id: z.string().uuid() },
  }, async ({ lot_id }) => run(() => api.get(`/seller/services/${lot_id}`)));
  server.registerTool('commercebook_seller_service_list', {
    title: 'List or change a service',
    description: 'POST /seller/services (no lot_id) or PUT /seller/services/{id} (with lot_id; only the fields sent change): a service sold by appointment: title, the price of one booking, the duration, where (buyer_address with area_zip_prefixes, or seller_place with place), the weekly open times, closed dates, the time zone and the no-show fee. It goes on sale once the account is live and it has open times (draft_until says what is missing). Photos, condition and shipping do not apply. Needs catalog write. Ask the owner for the price, the area and the open times first.',
    inputSchema: { lot_id: z.string().uuid().optional(), ...Object.fromEntries(Object.entries(SERVICE).map(([k, v]) => [k, (v as z.ZodTypeAny).optional()])) },
  }, async ({ lot_id, ...body }) => run(() => (lot_id ? api.put(`/seller/services/${lot_id}`, body) : api.post('/seller/services', body))));
  server.registerTool('commercebook_seller_service_availability', {
    title: 'Set the open times of a service',
    description: 'PUT /seller/services/{id}/availability: the weekly pattern (day, start, end), the closed dates and the time zone; slots of the duration are made for the next 60 days. A booked slot stays booked. Needs catalog write.',
    inputSchema: { lot_id: z.string().uuid(), ...AVAILABILITY },
  }, async ({ lot_id, ...body }) => run(() => api.put(`/seller/services/${lot_id}/availability`, body)));
  server.registerTool('commercebook_seller_service_done', {
    title: 'Mark a booked service done',
    description: 'POST /seller/orders/{id}/done: after the appointment has started, marks the service done: the order is released and the card hold captured; the buyer confirms as with a delivery, within the same window. Before the start: 409 appointment_not_started. Needs orders write.',
    inputSchema: { order_id: z.string().uuid() },
  }, async ({ order_id }) => run(() => api.post(`/seller/orders/${order_id}/done`, {})));
}
