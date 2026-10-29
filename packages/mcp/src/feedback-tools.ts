/**
 * SPEC-48: the briefing tools every connection has, with a key or without one.
 *   instructions            GET /instructions          the briefing: with a key, the one of the key's member kind (a
 *                                                      login that holds both kinds gets both, or the one named by kind);
 *                                                      with no key, the buyer briefing; SPEC-80: role (buyer, seller,
 *                                                      warehouse) names one, and the first line names the other two
 *   commercebook_feedback   POST /feedback             a note on what happened and what would help; with no key 20
 *                                                      per address per day, with a key recorded against it
 * Registered once from server.ts, on a keyed and on a keyless connection.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

export const FEEDBACK_TOOL_NAMES = ['instructions', 'commercebook_feedback'] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
function fail(e: unknown): ToolResult {
  if (e instanceof ApiError) return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
}

/** SPEC-71: the hints the Claude and ChatGPT directories ask of every tool; a read of CommerceBook's own public data. */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export function registerFeedbackTools(server: McpServer, api: ApiClient, options: { keyless?: boolean } = {}): void {
  // SPEC-80 item 2: role names the briefing (buyer, seller or warehouse); without a key the default is buyer, with a key
  // the key's kind. The answer names the other two briefings' addresses in its first line.
  const ROLE = z.enum(['buyer', 'seller', 'warehouse']).optional().describe('The briefing to return: buyer, seller or warehouse. Left out: buyer without a key, the key’s own kind with a key.');
  server.registerTool(
    'instructions',
    {
      title: 'Instructions',
      annotations: READ_ONLY,
      description: options.keyless
        ? 'GET /instructions with no key: the briefing of the role asked for (role buyer, seller or warehouse; buyer when left out): what CommerceBook does for that role, how each thing is done, the rules, what is coming and how to send feedback. The first line names the other two briefings.'
        : 'GET /instructions: the briefing of the key’s member kind (warehouse, seller or buyer), rendered from live state, the same document as the agent link https://commercebook.ai/agent/<token>. role names another briefing (the public copy of a role this login does not hold); a login that holds both a warehouse and a seller gets both joined, and kind names one of them. The first line names the other briefings. Needs an agent link key.',
      inputSchema: options.keyless ? { role: ROLE } : { role: ROLE, kind: z.enum(['warehouse', 'seller']).optional().describe('A login that holds both kinds: the one briefing to return.') },
    },
    async (a: { kind?: 'warehouse' | 'seller'; role?: 'buyer' | 'seller' | 'warehouse' }) => {
      try {
        const q = new URLSearchParams();
        if (a?.role) q.set('role', a.role);
        if (a?.kind) q.set('kind', a.kind);
        const qs = q.toString();
        return { content: [{ type: 'text' as const, text: await api.getText(qs ? `/instructions?${qs}` : '/instructions') }] };
      } catch (e) {
        return fail(e);
      }
    },
  );
  server.registerTool(
    'commercebook_feedback',
    {
      title: 'Tell CommerceBook what would help',
      // SPEC-71: a note to CommerceBook; it changes nothing the agent reads.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        'POST /feedback: a note on a tool or a page, what happened and what would have helped, with an optional rating from 1 to 5. A person at CommerceBook reads every note; the What is coming list in the briefing is shaped by them. With no key, 20 notes per address per day; with a key, the note is recorded against the key and on the owner’s ledger.',
      inputSchema: {
        about: z.string().min(1).max(200).describe('A tool name (for example commercebook_shipping_quote) or a page (for example /feeds).'),
        what_happened: z.string().max(4000).optional(),
        what_would_help: z.string().max(4000).optional(),
        rating: z.number().int().min(1).max(5).optional(),
      },
    },
    async (a) => {
      try {
        return { content: [{ type: 'text' as const, text: JSON.stringify(await api.post('/feedback', a), null, 2) }] };
      } catch (e) {
        return fail(e);
      }
    },
  );
}
