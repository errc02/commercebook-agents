/**
 * SPEC-87: the lead intake tool, the operation of netlify/functions/lib/openapi-lead-intake.ts. A warehouse key with
 * leads write, or the owner key of a warehouse; a seller key is refused. Registered once from server.ts; reached as
 * commercebook_leads intake.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

export const LEAD_INTAKE_TOOL_NAMES = ['commercebook_lead_intake'] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    if (e instanceof ApiError) return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
  }
}

export function registerLeadIntakeTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_lead_intake', {
    title: 'Make a draft lead from an email',
    description:
      'POST /leads/intake: send the text of a forwarded email or a note; CommerceBook reads it (Google’s Gemini service), checks the CRM and the last 90 days, makes the row in Leads and, when the company, need, service, location and a price are known, a draft lead. Answers with the draft, what is still needed and the questions. Never lists: list the draft with commercebook_leads post (replace_draft: the lead_id). A price in the subject or first line is for this lead only.',
    inputSchema: {
      text: z.string().min(1).max(50_000),
      subject: z.string().max(500).optional(),
      from_name: z.string().max(200).optional(),
    },
  }, async (args) => run(() => api.post('/leads/intake', args)));
}
