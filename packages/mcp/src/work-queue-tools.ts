/**
 * CB-972 (migration 187): the warehouse work queue, one operation per path of
 * netlify/functions/lib/openapi-work-queue.ts. The intent tools reach them as commercebook_work_queue actions list and
 * step (a warehouse key) and commercebook_seller_orders actions warehouse_status and warehouse_exception (a seller key)
 * (intent-table.ts). Registered once from server.ts.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

export const WORK_QUEUE_TOOL_NAMES = [
  'commercebook_work_queue_list', 'commercebook_work_item_step', 'commercebook_seller_order_warehouse_status', 'commercebook_seller_order_warehouse_exception',
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
const STATUS = z.enum(['open', 'new', 'ready', 'picking', 'packed', 'shipped', 'ready_for_pickup', 'picked_up', 'exception', 'cancelled', 'done', 'all']);
const STEP = z.enum(['start_picking', 'packed', 'shipped', 'ready_for_pickup', 'picked_up', 'exception', 'resume', 'assign', 'note']);

export function registerWorkQueueTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_work_queue_list', {
    title: 'Your warehouse work queue',
    annotations: READ_ONLY,
    description: 'GET /warehouse/work-items: the orders for goods stored at your facilities, exceptions first, then the items ready to pick, newest first. Each item: the status (new, picking, packed, shipped, ready_for_pickup, picked_up, exception, cancelled), ready (a shipped order once its seller released it; a pickup order once it is paid), waiting_for (payment or release), the product, the quantity, the seller, the ship-to once ready, the next steps, the carrier and tracking, the note and the assignee. Also the counts by status, the sellers and the team an item may be assigned to. status: open (default), ready, exception, done or all; seller_member_id narrows it. Needs capacity read. The sentence for the owner: "3 orders are ready to pick, 1 is in exception: <the note>".',
    inputSchema: { status: STATUS.optional(), seller_member_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(500).optional() },
  }, async (args) => run(() => api.get('/warehouse/work-items', args)));
  server.registerTool('commercebook_work_item_step', {
    title: 'Take a step on a work item',
    description: 'POST /warehouse/work-items/{id}/step: one step the owner asked for. start_picking, packed, shipped (carrier and tracking: the order reads shipped with that tracking for the buyer and the seller), ready_for_pickup, picked_up (the buyer’s six-digit pickup_code, read from the buyer at the counter; a wrong code answers 409 pickup_code_invalid with attempts_left, and the fifth locks the order), exception (a note; the seller is emailed), resume, assign (profile_id from the queue’s team, or null) and note. A step moves the item forward; a later step may skip the ones between; the same step again answers already. Refused before the seller’s release of a shipped order (409 awaiting_release). Take a step only when the owner says so; shipping with tracking is a step you take on the owner’s word. Needs capacity write.',
    inputSchema: {
      item_id: z.string().uuid(),
      step: STEP,
      carrier: z.string().min(1).max(80).optional().describe('Shipped: the carrier, for example UPS.'),
      tracking: z.string().min(4).max(80).optional().describe('Shipped: the tracking number.'),
      pickup_code: z.string().regex(/^\d{6}$/).optional().describe('Picked up: the six digits the buyer reads from its order.'),
      note: z.string().min(1).max(1000).optional().describe('Exception and note: what happened, in the owner’s words.'),
      profile_id: z.string().uuid().nullable().optional().describe('Assign: a login from the queue’s team, or null to clear.'),
    },
  }, async ({ item_id, ...body }) => run(() => api.post(`/warehouse/work-items/${item_id}/step`, body)));

  server.registerTool('commercebook_seller_order_warehouse_status', {
    title: 'Where an order stands at the warehouse',
    annotations: READ_ONLY,
    description: 'GET /seller/orders/{id}/warehouse: for an order of goods stored at a member warehouse, the queue status (new, picking, packed, shipped, ready_for_pickup, picked_up, exception, cancelled), ready, the warehouse and its facility, the time of each step, the carrier and tracking, the warehouse’s last note and who moved the goods. warehouse_work is null when the goods are not at a member warehouse. The same object is warehouse_work on each seller order. Needs orders read.',
    inputSchema: { order_id: z.string().uuid() },
  }, async ({ order_id }) => run(() => api.get(`/seller/orders/${order_id}/warehouse`)));
  server.registerTool('commercebook_seller_order_warehouse_exception', {
    title: 'Flag a problem to the warehouse',
    description: 'POST /seller/orders/{id}/warehouse/exception: puts the order’s work item in exception with the owner’s note (a hold, a changed address, the wrong goods); the warehouse is emailed and resumes the item once it is resolved. Refused once the goods left (409 state). Needs orders write; send it only when the owner says so.',
    inputSchema: { order_id: z.string().uuid(), note: z.string().min(1).max(1000) },
  }, async ({ order_id, note }) => run(() => api.post(`/seller/orders/${order_id}/warehouse/exception`, { note })));
}
