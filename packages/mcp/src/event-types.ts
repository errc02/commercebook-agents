/**
 * SPEC-102: the event types, in one list. The OpenAPI document (netlify/functions/lib/openapi-events.ts), the MCP tool
 * commercebook_events, the guide (docs/connect-your-oms.md and /docs/connect-your-oms), the seller capability list and
 * the API read this file; the database holds the same lists (events_seller_types() and events_buyer_types() in
 * migration 137) and qa/spec102-channel.mjs compares the two. Pure data, no imports.
 */

export interface EventType {
  type: string;
  /** Who reads it: a seller (a seller key, or the owner of a seller account), a buyer (every key buys), or every member. */
  side: 'seller' | 'buyer' | 'every';
  /** One plain line: when CommerceBook writes it. */
  when: string;
  /** The object the event is about. */
  object: 'order' | 'intent' | 'intent_quote' | 'payment' | 'catalog_feed' | 'lot' | 'webhook_endpoint';
}

export const EVENT_TYPES: readonly EventType[] = [
  { type: 'request.posted', side: 'seller', object: 'intent', when: 'a buyer posted a public request in a category you watch' },
  { type: 'quote.accepted', side: 'seller', object: 'intent_quote', when: 'a buyer accepted your quote; the order follows as order.placed' },
  { type: 'quote.declined', side: 'seller', object: 'intent_quote', when: 'a buyer declined your quote' },
  { type: 'order.placed', side: 'seller', object: 'order', when: 'a buyer placed an order of your product' },
  { type: 'order.paid', side: 'seller', object: 'order', when: 'the payment of the order is secured (a card hold, a settled bank payment, or the balance); release it to ship' },
  { type: 'order.cancelled', side: 'seller', object: 'order', when: 'the order was cancelled, or its payment failed; do not ship it' },
  { type: 'order.disputed', side: 'seller', object: 'order', when: 'the buyer reported a problem with the order' },
  { type: 'order.delivered', side: 'every', object: 'order', when: 'the order was delivered or picked up (sent to the seller and to the buyer)' },
  { type: 'payout.sent', side: 'seller', object: 'payment', when: 'the proceeds of an order were paid out to you' },
  { type: 'feed.failed', side: 'seller', object: 'catalog_feed', when: 'a saved product feed failed three times in a row and stopped' },
  { type: 'count.stale', side: 'seller', object: 'lot', when: 'the count of a product with stock passed the end of its window (count_fresh_until), so buyers see it as stale' },
  { type: 'quote.received', side: 'buyer', object: 'intent_quote', when: 'a seller quoted your request' },
  { type: 'order.shipped', side: 'buyer', object: 'order', when: 'the seller shipped your order, with the carrier and the tracking number' },
  { type: 'request.expired', side: 'buyer', object: 'intent', when: 'your request reached its end date with no accepted quote' },
  // CB-969 (185): watch and buy.
  { type: 'request.bought', side: 'buyer', object: 'intent', when: 'a watch (a request with auto_buy) bought a match within your limits and the payment went through; the summary names the order' },
  { type: 'request.waiting', side: 'buyer', object: 'intent', when: 'a watch found a match and waits for the owner: a limit, the card’s check, payments off or a failed payment (reason names it)' },
  { type: 'webhook.paused', side: 'every', object: 'webhook_endpoint', when: 'one of your webhook endpoints failed seven times in a row and was paused' },
];

/** The types a seller reads, in the order of section 1 of SPEC-102 (order.delivered included). */
export const SELLER_EVENT_TYPES: readonly string[] = [
  'request.posted', 'quote.accepted', 'quote.declined', 'order.placed', 'order.paid', 'order.cancelled', 'order.disputed', 'order.delivered',
  'payout.sent', 'feed.failed', 'count.stale',
];
/** The types a buyer reads. Every key buys, so every member reads these. */
export const BUYER_EVENT_TYPES: readonly string[] = ['quote.received', 'order.shipped', 'order.delivered', 'request.expired', 'request.bought', 'request.waiting'];
/** Every member reads it. */
export const EVERY_EVENT_TYPES: readonly string[] = ['webhook.paused'];
/** Every type, in the order of EVENT_TYPES. */
export const ALL_EVENT_TYPES: readonly string[] = EVENT_TYPES.map((e) => e.type);
/** The test ping (POST /webhooks/{id}/test). It is sent at once to one endpoint and never kept in the feed. */
export const PING_EVENT_TYPE = 'webhook.ping';

export type EventKind = 'seller' | 'buyer' | 'warehouse' | 'lead_partner';
/** The types a member of a kind reads, sorted (a seller reads both lists; every other kind the buyer list). */
export function eventTypesFor(kind: EventKind | string | null | undefined): string[] {
  const out = new Set<string>([...(kind === 'seller' ? SELLER_EVENT_TYPES : []), ...BUYER_EVENT_TYPES, ...EVERY_EVENT_TYPES]);
  return [...out].sort();
}

/** The wait after each failed delivery, in minutes (1, 5 and 30 minutes, 2, 12 and 24 hours). */
export const WEBHOOK_RETRY_MINUTES: readonly number[] = [1, 5, 30, 120, 720, 1440];
/** The failure after the last wait pauses the endpoint: 7 attempts in all. */
export const WEBHOOK_ATTEMPTS = WEBHOOK_RETRY_MINUTES.length + 1;
export const WEBHOOK_TIMEOUT_SECONDS = 10;
export const WEBHOOK_MAX_PER_KEY = 5;
export const WEBHOOK_HEADERS = { signature: 'X-CommerceBook-Signature', event: 'X-CommerceBook-Event', delivery: 'X-CommerceBook-Delivery' } as const;
/** How old a signature may be when a receiver checks it (seconds). */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/** "1 minute", "2 hours": one wait of the ladder in words. */
export function retryWords(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const h = minutes / 60;
  return `${h} hour${h === 1 ? '' : 's'}`;
}
