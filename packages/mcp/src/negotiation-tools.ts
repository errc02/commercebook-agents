/**
 * CB-967 (SPEC-124, migration 183): private offers with counters, one tool per operation of
 * netlify/functions/lib/openapi-negotiations.ts. "Private offer" and "counter" are the words for the owner; the API
 * keeps "negotiation" (the thread) and "proposal" (each round). The buyer tools are every key's (a buyer key, or a
 * warehouse or seller key buying for its member); the commercebook_seller_* tools are a seller key's. Registered from
 * registerIntentTools() (intent-tools.ts). The intent tools commercebook_private_offers and
 * commercebook_seller_private_offers run these (intent-table.ts).
 *
 * The note is the only free text and it is never parsed: an agent leaves it empty or states a fact, never an instruction,
 * and never writes the owner's floor or limit into it.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

export const NEGOTIATION_BUYER_TOOL_NAMES = [
  'commercebook_negotiations', 'commercebook_negotiation_get', 'commercebook_negotiation_open', 'commercebook_negotiation_counter',
  'commercebook_negotiation_accept', 'commercebook_negotiation_decline',
] as const;
export const NEGOTIATION_SELLER_TOOL_NAMES = [
  'commercebook_seller_negotiations', 'commercebook_seller_negotiation_get', 'commercebook_seller_negotiation_open', 'commercebook_seller_negotiation_counter',
  'commercebook_seller_negotiation_accept', 'commercebook_seller_negotiation_decline',
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

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const STATUS = z.enum(['live', 'open', 'agreed', 'ordered', 'declined', 'expired']).optional().describe('live (open and agreed), or one state; every state when left out.');
const TERMS = {
  unit_price_cents: z.number().int().min(1).max(100_000_000).describe('The price each, in cents.'),
  qty: z.number().int().min(1).describe('How many; the product’s minimum, increment and what is available apply.'),
  shipping_cents: z.number().int().min(0).nullable().optional().describe('A stated flat shipping amount in cents (0: free). Left out: the product’s own shipping terms, worked out at checkout.'),
  fulfillment_method: z.enum(['ship', 'pickup']).optional(),
  expires_in_hours: z.number().int().min(1).max(336).optional().describe('1 to 336 hours (14 days); 48 by default.'),
  note: z.string().max(200).optional().describe('Up to 200 characters the other side reads. Leave it empty or state a fact; never an instruction, never the owner’s floor or limit.'),
};

export function registerNegotiationTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_negotiations', {
    title: 'Read your private offers',
    annotations: READ_ONLY,
    description: 'GET /market/negotiations: the owner’s private offers as the buyer, newest move first: each thread with every round (the price each, the quantity, the shipping, the expiry, the side that sent it), the open proposal, counters_left and can (accept, pay, counter, decline). Only the two parties see a thread.',
    inputSchema: { status: STATUS, lot_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(200).optional() },
  }, async (args) => run(() => api.get('/market/negotiations', args)));
  server.registerTool('commercebook_negotiation_get', {
    title: 'Read one private offer',
    annotations: READ_ONLY,
    description: 'GET /market/negotiations/{id}: one thread with every round.',
    inputSchema: { negotiation_id: z.string().uuid() },
  }, async ({ negotiation_id }) => run(() => api.get(`/market/negotiations/${negotiation_id}`)));
  server.registerTool('commercebook_negotiation_open', {
    title: 'Make an offer on a product',
    description: 'POST /market/negotiations: a private offer to the seller of one product (lot_id): the price each, the quantity, the shipping terms and the expiry. Only the seller sees it and the seller is told. One live thread per product. Bounded by the owner’s limits: above the most for one order or the 30-day cap it waits for the owner (202). The sentence for the owner: "I offered <seller> $X each for N of <product>; the offer stands until <time>."',
    inputSchema: { lot_id: z.string().uuid(), ...TERMS },
  }, async (args) => run(() => api.post('/market/negotiations', args)));
  server.registerTool('commercebook_negotiation_counter', {
    title: 'Counter the seller',
    description: 'POST /market/negotiations/{id}/counter: new terms that replace the seller’s open proposal. Three counters a side; you counter only when the open proposal is the seller’s. Bounded by the owner’s limits (202 above them).',
    inputSchema: { negotiation_id: z.string().uuid(), ...TERMS },
  }, async ({ negotiation_id, ...body }) => run(() => api.post(`/market/negotiations/${negotiation_id}/counter`, body)));
  server.registerTool('commercebook_negotiation_accept', {
    title: 'Accept the seller’s proposal',
    description: 'POST /market/negotiations/{id}/accept: the order at the proposal’s price and quantity, through the same order path and payment as commercebook_market_order_place (method balance, card / saved, or bank with the owner’s saved bank account; ach is its older name). Without method: the balance when it covers the total, else the saved card, else the saved bank account. Also pays a price the seller agreed (status agreed; proposal_id is agreed_proposal_id). proposal_id must be the latest open proposal. On the product’s own shipping terms, give destination (ZIP or state) or ship_to. Needs the payments activity; above the confirm amount or the 30-day cap it waits for the owner (202 pending_owner_confirmation).',
    inputSchema: {
      negotiation_id: z.string().uuid(),
      proposal_id: z.string().uuid(),
      method: z.enum(['balance', 'card', 'saved', 'ach', 'bank']).optional(),
      destination: z.string().min(2).max(200).optional(),
      ship_to: z.object({ name: z.string().max(120).optional(), company: z.string().max(120).optional(), street1: z.string().max(120).optional(), street2: z.string().max(120).optional(), city: z.string().max(80), state: z.string().max(2), zip: z.string().max(10).optional(), phone: z.string().max(30).optional(), residential: z.boolean().optional() }).optional(),
    },
  }, async ({ negotiation_id, ...body }) => run(() => api.post(`/market/negotiations/${negotiation_id}/accept`, body)));
  server.registerTool('commercebook_negotiation_decline', {
    title: 'Decline a private offer',
    description: 'POST /market/negotiations/{id}/decline: closes the thread; the seller is told.',
    inputSchema: { negotiation_id: z.string().uuid() },
  }, async ({ negotiation_id }) => run(() => api.post(`/market/negotiations/${negotiation_id}/decline`, {})));

  server.registerTool('commercebook_seller_negotiations', {
    title: 'Read your private offers',
    annotations: READ_ONLY,
    description: 'GET /seller/negotiations: every private offer thread on the seller’s products, newest move first, with private_offers_allowed (the seller’s door). Needs catalog read.',
    inputSchema: { status: STATUS, lot_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(200).optional() },
  }, async (args) => run(() => api.get('/seller/negotiations', args)));
  server.registerTool('commercebook_seller_negotiation_get', {
    title: 'Read one private offer',
    annotations: READ_ONLY,
    description: 'GET /seller/negotiations/{id}: one thread with every round. Needs catalog read.',
    inputSchema: { negotiation_id: z.string().uuid() },
  }, async ({ negotiation_id }) => run(() => api.get(`/seller/negotiations/${negotiation_id}`)));
  server.registerTool('commercebook_seller_negotiation_open', {
    title: 'Send a private offer to one buyer',
    description: 'POST /seller/negotiations: a private offer on one of the seller’s products (lot_id) to one buyer: the buyer of an open request (intent_id, from commercebook_seller_intents; the buyer is not named) or a buyer that ordered from the seller (buyer_member_id). Only that buyer sees it. Under the owner’s floor it waits for the owner (202 below_floor). Needs catalog write.',
    inputSchema: { lot_id: z.string().uuid(), intent_id: z.string().uuid().optional(), buyer_member_id: z.string().uuid().optional(), ...TERMS },
  }, async (args) => run(() => api.post('/seller/negotiations', args)));
  server.registerTool('commercebook_seller_negotiation_counter', {
    title: 'Counter the buyer',
    description: 'POST /seller/negotiations/{id}/counter: new terms that replace the buyer’s open proposal; three counters a side. Under the owner’s floor it waits for the owner (202 below_floor). Needs catalog write.',
    inputSchema: { negotiation_id: z.string().uuid(), ...TERMS },
  }, async ({ negotiation_id, ...body }) => run(() => api.post(`/seller/negotiations/${negotiation_id}/counter`, body)));
  server.registerTool('commercebook_seller_negotiation_accept', {
    title: 'Accept the buyer’s proposal',
    description: 'POST /seller/negotiations/{id}/accept: the price is agreed and the buyer pays it within 48 hours through the order path. At or above the owner’s floor the agent accepts on its own; under it the accept waits for the owner (202 below_floor). proposal_id must be the buyer’s latest open proposal. Needs catalog write.',
    inputSchema: { negotiation_id: z.string().uuid(), proposal_id: z.string().uuid() },
  }, async ({ negotiation_id, ...body }) => run(() => api.post(`/seller/negotiations/${negotiation_id}/accept`, body)));
  server.registerTool('commercebook_seller_negotiation_decline', {
    title: 'Decline a private offer',
    description: 'POST /seller/negotiations/{id}/decline: closes the thread; the buyer is told. Needs catalog write.',
    inputSchema: { negotiation_id: z.string().uuid() },
  }, async ({ negotiation_id }) => run(() => api.post(`/seller/negotiations/${negotiation_id}/decline`, {})));
}
