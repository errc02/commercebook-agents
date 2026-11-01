/**
 * SPEC-110: share a lead in one step and send a lead to one warehouse, the six operations of
 * netlify/functions/lib/openapi-lead-share.ts. A warehouse key: crm read for the form, leads read for the offers and
 * the targets, leads write for share, refer and decline. Registered once from server.ts; reached as commercebook_leads
 * share_form, share, refer, referrals, referral_targets and referral_decline. Accepting an offer is buying the lead:
 * commercebook_leads buy with the lead id from referrals.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

export const LEAD_SHARE_TOOL_NAMES = [
  'commercebook_deal_share_form', 'commercebook_deal_share', 'commercebook_deal_refer',
  'commercebook_lead_referrals', 'commercebook_lead_referral_targets', 'commercebook_lead_referral_decline',
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

const listing = {
  title: z.string().max(80).optional(),
  need: z.string().min(10).max(2000).optional(),
  service: z.string().min(1).max(80).optional(),
  location: z.string().max(120).optional(),
  location_any: z.boolean().optional(),
  price_cents: z.number().int().min(0).optional(),
  company_name: z.string().min(1).max(200).optional(),
  // CB-901 (153): where the lead came from, and its name (required for vendor).
  lead_source: z.enum(['own', 'referral', 'vendor', 'event', 'outreach', 'other']).optional(),
  referral_source: z.string().max(60).optional(),
  expected_version: z.number().int().min(0).optional(),
};
const without = <T extends Record<string, unknown>>(o: T, k: keyof T) => Object.fromEntries(Object.entries(o).filter(([x, v]) => x !== k && v !== undefined));

export function registerLeadShareTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_deal_share_form', {
    title: 'What buyers will see for one record',
    description:
      'GET /crm/deals/{id}/share: the listing of one CRM record as buyers will read it, prefilled from the draft, the email reader or the record and the lead defaults; the items still missing (company, need, service, market, price); the listing when it is on the exchange; and the latest offer to one warehouse.',
    inputSchema: { deal_id: z.string().uuid() },
  }, async ({ deal_id }) => run(() => api.get(`/crm/deals/${deal_id}/share`)));

  server.registerTool('commercebook_deal_share', {
    title: 'Share a record’s lead with the network in one step',
    description:
      'POST /crm/deals/{id}/share: drafts and lists the lead on the Lead Exchange in one step. Send the missing items only; a missing item answers 422 missing with the list and writes nothing. price_cents 0 shares it free; max_buyers 1 to 5 (default: the lead defaults).',
    inputSchema: { deal_id: z.string().uuid(), ...listing, max_buyers: z.number().int().min(1).max(5).optional() },
  }, async (args) => run(() => api.post(`/crm/deals/${args.deal_id}/share`, without(args, 'deal_id'))));

  server.registerTool('commercebook_deal_refer', {
    title: 'Send a record’s lead to one warehouse',
    description:
      'POST /crm/deals/{id}/refer: offers the lead to one verified warehouse (to_member_id from commercebook_leads referral_targets) for 48 hours at one price (0 is free), with an optional note of 500 characters. It is not on the exchange; only that warehouse sees it. It buys or declines; on a decline or after 48 hours the lead comes back as a private draft and you are emailed.',
    inputSchema: { deal_id: z.string().uuid(), to_member_id: z.string().uuid(), note: z.string().max(500).optional(), ...listing },
  }, async (args) => run(() => api.post(`/crm/deals/${args.deal_id}/refer`, without(args, 'deal_id'))));

  server.registerTool('commercebook_lead_referrals', {
    title: 'Leads sent to you and by you',
    description:
      'GET /leads/referrals: received (offers to your member, open ones first, with the public card of the lead; buy one with commercebook_leads buy and its lead id) and sent (your offers and their state).',
    inputSchema: {},
  }, async () => run(() => api.get('/leads/referrals')));

  server.registerTool('commercebook_lead_referral_targets', {
    title: 'Warehouses a lead may be sent to',
    description: 'GET /leads/referral-targets: verified warehouses by name, never your own member; q narrows by name or home market.',
    inputSchema: { q: z.string().max(100).optional(), limit: z.number().int().min(1).max(200).optional() },
  }, async ({ q, limit }) => run(() => api.get('/leads/referral-targets', { q, limit })));

  server.registerTool('commercebook_lead_referral_decline', {
    title: 'Decline a lead sent to you',
    description: 'POST /leads/referrals/{id}/decline: closes the offer; the lead goes back to the poster, who is emailed with your reason (200 characters, optional).',
    inputSchema: { referral_id: z.string().uuid(), reason: z.string().max(200).optional() },
  }, async ({ referral_id, reason }) => run(() => api.post(`/leads/referrals/${referral_id}/decline`, reason ? { reason } : {})));
}
