/**
 * SPEC-65: the feedback board tools, one per operation of netlify/functions/lib/openapi-feedback-board.ts. Every key
 * reaches them (scope.ts COMMON_TOOL_NAMES); the reads need the read level of the key's activity (messages for a
 * warehouse key, orders for a seller or a buyer key) and the post, the reply and the vote need write, so an owner turns
 * them off with that switch. The keyless commercebook_feedback note (feedback-tools.ts) is unchanged and apart.
 * Registered once from server.ts, on a keyed connection only.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

const UUID = z.string().uuid();

export const FEEDBACK_BOARD_TOOL_NAMES = [
  'commercebook_feedback_board', 'commercebook_feedback_read', 'commercebook_feedback_post', 'commercebook_feedback_reply', 'commercebook_feedback_vote',
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

export function registerFeedbackBoardTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_feedback_board', {
    title: 'Read the feedback board',
    description: 'GET /feedback/board: every member’s posts on what would make CommerceBook better, a shipped post CommerceBook pinned first, then the most votes and the newest (sort votes) or the newest alone (sort newest). Each post has its author, member, kind, votes, replies, status (open, planned, building, shipped, not_now) and whether your person voted. Read the board before posting, and vote for a post that already says it.',
    inputSchema: {
      sort: z.enum(['votes', 'newest']).optional(),
      kind: z.enum(['warehouse', 'seller', 'buyer']).optional().describe('Only the posts of members of this kind.'),
    },
  }, async ({ sort, kind }) => run(() => api.get('/feedback/board', { sort, kind })));
  server.registerTool('commercebook_feedback_read', {
    title: 'Read one feedback post',
    description: 'GET /feedback/posts/{id}: the post with its full body, its status note and its replies in order, each with the name and member of who wrote it.',
    inputSchema: { post_id: UUID },
  }, async ({ post_id }) => run(() => api.get(`/feedback/posts/${post_id}`)));
  server.registerTool('commercebook_feedback_post', {
    title: 'Post to the feedback board',
    description: 'POST /feedback/posts: a new post under your person’s name, marked as written by an agent: a title of 120 characters at most, an optional body of 4,000, and the page it is about. CommerceBook reads every post. Needs the write level of the key’s activity (messages, or orders for a seller or a buyer key).',
    inputSchema: {
      title: z.string().min(1).max(120),
      body: z.string().max(4000).optional(),
      page: z.string().max(500).optional().describe('The page or the tool it is about, for example /warehouse/leads.'),
    },
  }, async (b) => run(() => api.post('/feedback/posts', b)));
  server.registerTool('commercebook_feedback_reply', {
    title: 'Reply to a feedback post',
    description: 'POST /feedback/posts/{id}/replies: a reply under your person’s name; the author and every earlier replier are emailed once. Needs the write level of the key’s activity.',
    inputSchema: { post_id: UUID, body: z.string().min(1).max(4000) },
  }, async ({ post_id, body }) => run(() => api.post(`/feedback/posts/${post_id}/replies`, { body })));
  server.registerTool('commercebook_feedback_vote', {
    title: 'Vote for a feedback post',
    description: 'POST /feedback/posts/{id}/vote: adds your person’s vote, or takes it back when it is already there (voted and votes come back). One vote per person, no down-votes. Needs the write level of the key’s activity.',
    inputSchema: { post_id: UUID },
  }, async ({ post_id }) => run(() => api.post(`/feedback/posts/${post_id}/vote`, {})));
}
