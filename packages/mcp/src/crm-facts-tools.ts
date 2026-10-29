/**
 * SPEC-41: the CRM facts tools, one per operation of netlify/functions/lib/openapi-crm-facts.ts. A warehouse key with
 * crm read (list) or crm write (decide, extract), or the owner key of a warehouse. Registered once from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

const UUID = z.string().uuid();

export const CRM_FACTS_TOOL_NAMES = ['commercebook_deal_facts_list', 'commercebook_deal_fact_decide', 'commercebook_deal_facts_extract'] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    if (e instanceof ApiError) return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
  }
}

export function registerCrmFactsTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_deal_facts_list', {
    title: 'Read the facts of a deal',
    description: 'GET /crm/deals/{id}/facts: the service, location, volume, product, timing and SKU count read from the deal’s notes, each with its source sentence and status (suggested, confirmed, rejected); ready when the five Post fields are confirmed.',
    inputSchema: { deal_id: UUID },
  }, async ({ deal_id }) => run(() => api.get(`/crm/deals/${deal_id}/facts`)));
  server.registerTool('commercebook_deal_fact_decide', {
    title: 'Confirm or reject a fact',
    description: 'POST /crm/deals/{id}/facts/{fact_id}/decide: confirmed writes the deal’s service, target market or attribute key from the fact; rejected hides it and keeps it.',
    inputSchema: { deal_id: UUID, fact_id: UUID, status: z.enum(['confirmed', 'rejected']) },
  }, async ({ deal_id, fact_id, status }) => run(() => api.post(`/crm/deals/${deal_id}/facts/${fact_id}/decide`, { status })));
  server.registerTool('commercebook_deal_facts_extract', {
    title: 'Read a deal’s notes again',
    description: 'POST /crm/deals/{id}/facts/extract: runs the hand rules over the deal’s notes and fields again and writes the suggestions; decided facts never change.',
    inputSchema: { deal_id: UUID },
  }, async ({ deal_id }) => run(() => api.post(`/crm/deals/${deal_id}/facts/extract`, {})));
}
