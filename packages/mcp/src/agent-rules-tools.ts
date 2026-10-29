/**
 * SPEC-77: Your agent, the rules a member sets that its agent cannot cross. One tool per read of
 * netlify/functions/lib/openapi-agent-rules.ts; PUT /me/agent-rules is the owner's, signed in, so no tool writes the
 * rules (the parity table maps that row to commercebook_agent_rules, whose description says so). Registered once from
 * server.ts; both tools are every key's (scope.ts).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

export const AGENT_RULES_TOOL_NAMES = ['commercebook_agent_rules', 'commercebook_agent_activity'] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    if (e instanceof ApiError) return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
  }
}

export function registerAgentRulesTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_agent_rules', {
    title: 'Read the rules your owner set',
    description:
      'GET /me/agent-rules: the rules CommerceBook enforces on every call you make for your owner. Read them first and plan within them. ' +
      'rules holds the values that bind your key (the lower of the account rule and your key limit for money); text is the same rules as one paragraph. ' +
      'A call outside allowed_actions, allowed_hours, allowed_categories or counterparties answers 403 rule_blocked with the rule; a payment over a money rule answers 202 pending_owner_confirmation and waits for the owner. ' +
      'Only the owner, signed in, changes these rules (PUT /me/agent-rules answers 403 owner_in_person for a key); you may lower the limits on your own key with commercebook_key_limits_set.',
    inputSchema: {},
  }, async () => run(() => api.get('/me/agent-rules')));
  server.registerTool('commercebook_agent_activity', {
    title: 'Read what you did, with the rule behind each result',
    description: 'GET /me/agent-activity: every call of your owner’s keys in the last days (30 by default, up to 90), newest first: the action, the amount, the counterparty, and whether a rule allowed it, held it for the owner or stopped it.',
    inputSchema: { days: z.number().int().min(1).max(90).optional() },
  }, async ({ days }) => run(() => api.get('/me/agent-activity', { days })));
}
