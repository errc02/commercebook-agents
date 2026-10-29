/**
 * SPEC-46: the Leads table tools, one per operation of netlify/functions/lib/openapi-leads-table.ts. A warehouse key
 * with crm read (the table) or crm write (the share decision), leads read or write (the Lead defaults), or the owner
 * key of a warehouse. Passing a row to the network is commercebook_lead_post with the row's deal_id. Registered once
 * from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

const UUID = z.string().uuid();

export const LEADS_TABLE_TOOL_NAMES = ['commercebook_leads_table', 'commercebook_deal_share_decision', 'commercebook_lead_defaults_get', 'commercebook_lead_defaults_set'] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    if (e instanceof ApiError) return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
  }
}

export function registerLeadsTableTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_leads_table', {
    title: 'Read the Leads table',
    description:
      'GET /leads/table: every deal that is not archived, newest received first, as the Leads screen shows it: company, received, what we know (service, location, volume), missing facts, estimated value, whether its lead is shared (not_shared, draft, shared, claimed, sold, withdrawn, expired) with price, buyer places, claims and buyer companies, the action the screen offers, and the share decision. tab not_shared (default) or shared; q searches the company; missing, source (ghl, csv, typed, agent) and marked filter; set_aside lists the rows set aside (Not for the network), deleted the GoHighLevel rows deleted from the list. counts gives both tabs, set_aside and deleted. Pass a row to the network with commercebook_lead_post and its deal_id.',
    inputSchema: {
      tab: z.enum(['not_shared', 'shared']).optional(),
      q: z.string().max(200).optional(),
      missing: z.boolean().optional().describe('true: only rows missing a service or a location'),
      source: z.enum(['ghl', 'csv', 'typed', 'agent']).optional(),
      marked: z.boolean().optional().describe('true: only rows marked to share'),
      set_aside: z.boolean().optional().describe('true: only the Not shared rows set aside (Not for the network); without it Not shared leaves them out'),
      deleted: z.boolean().optional().describe('true: only the GoHighLevel rows deleted from the list'),
      cursor: z.string().optional().describe('The next_cursor of the previous page.'),
      limit: z.number().int().min(1).max(200).optional(),
    },
  }, async (a) => run(() => api.get('/leads/table', a)));
  server.registerTool('commercebook_deal_share_decision', {
    title: 'Mark a deal to share, hold or decline',
    description: 'PATCH /crm/deals/{id}/share-decision: the call on a deal. decline is Not for the network (the row moves under Set aside), none is Reconsider; share (Marked to share) and hold are chips. share does not post; post with commercebook_lead_post and the deal_id.',
    inputSchema: { deal_id: UUID, decision: z.enum(['none', 'share', 'hold', 'decline']) },
  }, async ({ deal_id, decision }) => run(() => api.patch(`/crm/deals/${deal_id}/share-decision`, { decision })));
  server.registerTool('commercebook_lead_defaults_get', {
    title: 'Read the Lead defaults',
    description: 'GET /settings/lead-defaults: the price and buyer places a lead takes when commercebook_lead_post sends no price, and whether the Pass for $1 preset shows on the screen. $20, open to 2 buyers, until the member saves its own.',
    inputSchema: {},
  }, async () => run(() => api.get('/settings/lead-defaults')));
  server.registerTool('commercebook_lead_defaults_set', {
    title: 'Change the Lead defaults',
    description: 'PATCH /settings/lead-defaults: price_cents, max_buyers (1 to 5) and dollar_preset; fields left out keep their value.',
    inputSchema: { price_cents: z.number().int().min(0).max(100_000_000).optional(), max_buyers: z.number().int().min(1).max(5).optional(), dollar_preset: z.boolean().optional() },
  }, async (a) => run(() => api.patch('/settings/lead-defaults', a)));
}
