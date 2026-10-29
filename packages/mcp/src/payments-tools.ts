/**
 * SPEC-55: the saved cards and the balance, one tool per operation of netlify/functions/lib/openapi-payments.ts. A
 * warehouse key or a warehouse owner key. Reading is open to any key; a return to the bank needs the payments activity;
 * a key never adds or removes a card (the owner does, at Settings, Payment methods). Registered once from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

export const PAYMENTS_TOOL_NAMES = [
  'commercebook_payment_methods', 'commercebook_payment_method_remove',
  'commercebook_balance', 'commercebook_balance_funding_instructions', 'commercebook_balance_return',
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

export function registerPaymentsTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_payment_methods', {
    title: 'Read the saved cards and the balance',
    description: 'GET /me/payment-methods: the cards the owner saved at Settings, Payment methods (brand, last four, expiry, the default) and the balance held by Stripe. A claim with method card charges the default card off-session; a claim with method balance pays from the balance.',
    inputSchema: {},
  }, async () => run(() => api.get('/me/payment-methods')));
  server.registerTool('commercebook_payment_method_remove', {
    title: 'Remove a saved card (owner only)',
    description: 'DELETE /me/payment-methods/{id}: answers 403 owner_only for every key. The owner removes a card at Settings, Payment methods; relay that sentence.',
    inputSchema: { payment_method_id: z.string().uuid() },
  }, async ({ payment_method_id }) => run(() => api.del(`/me/payment-methods/${payment_method_id}`)));
  server.registerTool('commercebook_balance', {
    title: 'Read the balance',
    description: 'GET /me/balance: the member’s CommerceBook balance, held by Stripe: available now, recent events (funded, applied_to_payment and the rest), an open return, and the funding instructions once asked for. The owner funds it by ACH (1 to 3 business days) or wire (same day); a card cannot fund it. Unused balance returns to the sender’s bank after 75 days.',
    inputSchema: {},
  }, async () => run(() => api.get('/me/balance')));
  server.registerTool('commercebook_balance_funding_instructions', {
    title: 'Get the funding instructions of the balance',
    description: 'POST /me/balance/funding-instructions: the routing number, account number, account holder and bank the owner sends an ACH or a wire to. Asking again answers the same instructions. Moves no money.',
    inputSchema: {},
  }, async () => run(() => api.post('/me/balance/funding-instructions', {})));
  server.registerTool('commercebook_balance_return', {
    title: 'Return the balance to the bank',
    description: 'POST /me/balance/return: returns the balance (or amount_cents of it) to the owner’s bank; Stripe emails the owner for the account details. One return at a time. Needs the payments activity (403 not_permitted with the hint until the owner turns it on).',
    inputSchema: { amount_cents: z.number().int().min(1).optional() },
  }, async ({ amount_cents }) => run(() => api.post('/me/balance/return', amount_cents ? { amount_cents } : {})));
}
