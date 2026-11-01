/**
 * SPEC-44: the key limits, the actions that wait for the owner, the network's live numbers and the confirmed savings,
 * one tool per operation of netlify/functions/lib/openapi-agent-limits.ts. Registered once from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

const UUID = z.string().uuid();
const MONEY = z.number().int().min(0).max(100_000_000).nullable();
const CONFIRM = z.enum(['lead_post', 'message_new_member', 'capacity_quote', 'order_accept']);
const LEVEL = z.enum(['none', 'read', 'write']);

export const AGENT_LIMITS_TOOL_NAMES = [
  'commercebook_key_limits_get',
  'commercebook_key_limits_set',
  'commercebook_pending_list',
  'commercebook_pending_decide',
  'commercebook_network_now',
  'commercebook_costs_savings',
  'commercebook_key_permissions',
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

export function registerAgentLimitsTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_key_limits_get', {
    title: 'Read the limits on a key',
    description: 'GET /keys/{id}/limits: the spending cap per 30 days, the monthly budget (budget_month_cents, a calendar month in Central time), the amount above which a payment waits for the owner, the actions the owner confirms, the calls per hour, what the key spent in 30 days and this month (spent_month_cents), what remains of the budget (budget_month_remaining_cents) and how many of its actions wait.',
    inputSchema: { key_id: UUID },
  }, async ({ key_id }) => run(() => api.get(`/keys/${key_id}/limits`)));
  server.registerTool('commercebook_key_limits_set', {
    title: 'Lower the limits on a key',
    description: 'PUT /keys/{id}/limits: fields left out keep their value. budget_month_cents is the monthly budget (null is none). With an agent link key a limit can only be lowered or added; raising or removing one needs the owner signed in (403 owner_in_person).',
    inputSchema: { key_id: UUID, spend_cap_cents: MONEY.optional(), confirm_above_cents: MONEY.optional(), confirm_actions: z.array(CONFIRM).optional(), rate_per_hour: z.number().int().min(1).max(600).optional(), budget_month_cents: MONEY.optional() },
  }, async ({ key_id, ...limits }) => run(() => api.put(`/keys/${key_id}/limits`, Object.fromEntries(Object.entries(limits).filter(([, v]) => v !== undefined)))));
  server.registerTool('commercebook_pending_list', {
    title: 'List the actions waiting for the owner',
    description: 'GET /keys/{id}/pending: calls over the key’s limits are not executed; each waits here (202 pending_owner_confirmation gave its pending_id) until the owner approves or declines it, and status and result show what happened.',
    inputSchema: { key_id: UUID, status: z.enum(['pending', 'approved', 'running', 'done', 'failed', 'declined', 'all']).optional() },
  }, async ({ key_id, status }) => run(() => api.get(`/keys/${key_id}/pending`, { status })));
  server.registerTool('commercebook_pending_decide', {
    title: 'Decline a waiting action',
    description: 'POST /keys/{id}/pending/{pending_id}/decide: decline drops the action and runs nothing; approve needs the owner signed in at Agent access, Waiting for you (403 owner_in_person for a key).',
    inputSchema: { key_id: UUID, pending_id: UUID, decision: z.enum(['approve', 'decline']) },
  }, async ({ key_id, pending_id, decision }) => run(() => api.post(`/keys/${key_id}/pending/${pending_id}/decide`, { decision })));
  // SPEC-52: what the key may do. Without activities it reads (GET); with activities it lowers (PUT, a key only lowers).
  server.registerTool('commercebook_key_permissions', {
    title: 'Read or lower what a key may do',
    description: 'GET /keys/{id}/permissions: every activity of the key, Read only or Can act, Payments off or on, and the sentence to relay to the owner. Every key starts read-only with payments off; the owner turns an activity on at Agent access, and after that the next call succeeds without a new key. With activities (for example {"payments": "none"}) it is PUT /keys/{id}/permissions: a key may only lower its own activities; turning one on answers 403 owner_in_person.',
    inputSchema: { key_id: UUID, activities: z.record(z.string(), LEVEL).optional() },
  }, async ({ key_id, activities }) =>
    run(() => (activities && Object.keys(activities).length ? api.put(`/keys/${key_id}/permissions`, { activities }) : api.get(`/keys/${key_id}/permissions`))));
  server.registerTool('commercebook_network_now', {
    title: 'Read the network’s live numbers',
    description: 'GET /network/now (no key needed): verified members, leads listed in the last 7 days, prices posted and savings confirmed this month, cached 15 minutes.',
    inputSchema: {},
  }, async () => run(() => api.get('/network/now')));
  server.registerTool('commercebook_costs_savings', {
    title: 'Read the confirmed savings',
    description: 'GET /costs/savings: one row per confirmed saving (a supplier price confirmed on a request, or a vendor match), with this year’s and this month’s totals.',
    inputSchema: {},
  }, async () => run(() => api.get('/costs/savings')));
}
