/**
 * SPEC-47 item 4: which tools a key's member kind reaches. The API answers 404 not_found on the other kind's actions
 * (api_call, 057 and 062); the remote server at https://commercebook.ai/mcp lists only the tools that work for the key.
 * A seller key: the commercebook_seller_* and commercebook_shipping_* tools and the common ones. A warehouse key:
 * everything else and the common ones. The local stdio server lists every tool, as before.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** SPEC-91: lead_partner, a lead partner's key (scope warehouse): the common tools, the lead tools a partner uses, messages. */
export type MemberKind = 'warehouse' | 'seller' | 'buyer' | 'lead_partner';
export type ToolKind = 'common' | 'warehouse' | 'seller';

/** Tools every key reaches: who it is, standing, the document, the OpenAPI, the limits and activities (SPEC-52), the network, a shipping quote, feedback (SPEC-48), the buyer tools (SPEC-39). A buyer key reaches these only. */
export const COMMON_TOOL_NAMES = [
  'commercebook_whoami', 'commercebook_me', 'instructions', 'commercebook_my_standing', 'commercebook_openapi',
  'commercebook_key_limits_get', 'commercebook_key_limits_set', 'commercebook_pending_list', 'commercebook_pending_decide', 'commercebook_key_permissions',
  'commercebook_network_now', 'commercebook_shipping_quote', 'commercebook_agent_limits', 'commercebook_feedback',
  // SPEC-39: the buyer tools, for every key (a buyer key, or a warehouse or seller key buying for its member).
  'commercebook_market_search', 'commercebook_market_lot', 'commercebook_market_seller', 'commercebook_market_warehouse', 'commercebook_market_quote', 'commercebook_market_order_place', 'commercebook_market_orders',
  'commercebook_market_order', 'commercebook_market_order_confirm_delivery', 'commercebook_market_order_dispute', 'commercebook_market_order_rate',
  // CB-968: the invoice of an order (the buyer's key, or the seller's).
  'commercebook_market_order_invoice',
  'commercebook_market_order_po_number', // CB-964
  // SPEC-56: the result sheet.
  'commercebook_result_sheet', 'commercebook_result_sheets', 'commercebook_result_sheet_get', 'commercebook_result_sheet_delete',
  // CB-970 (188): the owner's tax exemption certificates (the details; the owner uploads the file).
  'commercebook_tax_certificates', 'commercebook_tax_certificate_add',
  // SPEC-67: a buyer's tracking and the address check before an order.
  'commercebook_market_order_tracking', 'commercebook_shipping_address_check',
  // SPEC-65: the feedback board.
  'commercebook_feedback_board', 'commercebook_feedback_read', 'commercebook_feedback_post', 'commercebook_feedback_reply', 'commercebook_feedback_vote',
  // SPEC-68 Part B: requests on the book, for every key (the commercebook_seller_* request tools stay a seller key's).
  'commercebook_market_intents', 'commercebook_intent_create', 'commercebook_intent_withdraw', 'commercebook_intent_quotes', 'commercebook_intent_quote_accept', 'commercebook_intent_quote_decline',
  // CB-967: private offers as the buyer, for every key (the commercebook_seller_negotiation* tools stay a seller key's).
  'commercebook_negotiations', 'commercebook_negotiation_get', 'commercebook_negotiation_open', 'commercebook_negotiation_counter',
  'commercebook_negotiation_accept', 'commercebook_negotiation_decline',
  // CB-969 (185): watch and buy.
  'commercebook_watch_list', 'commercebook_watch_withdraw',
  // SPEC-68 Part C: the book right now.
  'commercebook_market_book',
  // SPEC-77: the rules the owner set and what the agent did.
  'commercebook_agent_rules', 'commercebook_agent_activity',
  // CB-953 (180): the agent introduces itself with the name its owner uses for it.
  'commercebook_introduce',
  // SPEC-79: reach before an email and the shipping of one product to a state (keyless reads, every key too).
  'commercebook_request_reach', 'commercebook_market_shipping_estimate',
  // SPEC-80: every seller capability in one read (keyless, every key too). CB-958: the situation map of a role.
  'commercebook_seller_capabilities', 'commercebook_ways', 'commercebook_listing_profile',
  // SPEC-102: the event feed and webhooks per key.
  'commercebook_events_list', 'commercebook_event_types', 'commercebook_webhooks_list', 'commercebook_webhook_add', 'commercebook_webhook_remove',
  'commercebook_webhook_test', 'commercebook_webhook_replay', 'commercebook_webhook_rotate_secret',
  // CB-963 (170): the auctions a buyer reads and bids in (the commercebook_seller_auction* tools stay a seller key's).
  'commercebook_auctions', 'commercebook_auction', 'commercebook_auction_status', 'commercebook_auction_bid', 'commercebook_auction_bids_mine',
  // CB-971 (186): checkout sessions in the Agentic Commerce Protocol shape, every key, as the buyer tools are.
  'commercebook_checkout_session_create', 'commercebook_checkout_session_update', 'commercebook_checkout_session_get',
  'commercebook_checkout_session_complete', 'commercebook_checkout_session_cancel',
  // CB-973 (189): the services a buyer reads, books and cancels (the commercebook_seller_service* tools stay a seller key's).
  'commercebook_service_slots', 'commercebook_service_book', 'commercebook_service_cancel',
] as const;
const COMMON = new Set<string>(COMMON_TOOL_NAMES);

export function toolKind(name: string): ToolKind {
  if (COMMON.has(name)) return 'common';
  return name.startsWith('commercebook_seller_') || name.startsWith('commercebook_shipping_') ? 'seller' : 'warehouse';
}

/**
 * SPEC-91: what a lead partner reaches besides the common tools. A partner posts, manages and edits leads, reads what
 * they earned and messages buyers; a partner never buys a lead (the API refuses with partner_cannot_buy), so the open
 * leads, buy, claim, the bought leads, ratings, the Leads table, the CRM, costs, capacity and network stay out.
 */
export const LEAD_PARTNER_TOOL_NAMES = [
  'commercebook_lead_post', 'commercebook_leads_mine', 'commercebook_lead_get', 'commercebook_lead_withdraw', 'commercebook_lead_places',
  'commercebook_lead_price', 'commercebook_lead_text', 'commercebook_lead_update', 'commercebook_lead_introduction', 'commercebook_lead_call',
  'commercebook_lead_defaults_get', 'commercebook_lead_defaults_set', 'commercebook_lead_earnings', 'commercebook_lead_statement',
  // CB-901: a partner prices its own leads by source too.
  'commercebook_lead_source_prices',
  'commercebook_threads_list', 'commercebook_thread_get', 'commercebook_message_send', 'commercebook_message_request', 'commercebook_thread_respond',
  'commercebook_thread_read', 'commercebook_thread_mute', 'commercebook_thread_report', 'commercebook_member_block', 'commercebook_group_create',
  'commercebook_attachables', 'commercebook_unread_count',
] as const;
const LEAD_PARTNER = new Set<string>(LEAD_PARTNER_TOOL_NAMES);

export function toolAllowed(name: string, kind: MemberKind | 'both'): boolean {
  const k = toolKind(name);
  if (kind === 'lead_partner') return k === 'common' || LEAD_PARTNER.has(name);
  return k === 'common' || kind === 'both' || k === kind;
}

/**
 * Makes `server` keep only the tools `allow` accepts: every registration still runs (so the registration files stay
 * as they are) and a tool outside the scope is removed at once, before any client connects.
 */
export function limitTools(server: McpServer, allow: (name: string) => boolean): void {
  type Register = (name: string, config: unknown, cb: unknown) => { remove(): void };
  const target = server as unknown as { registerTool: Register };
  const original = target.registerTool.bind(server) as Register;
  target.registerTool = (name, config, cb) => {
    const tool = original(name, config, cb);
    if (!allow(name)) tool.remove();
    return tool;
  };
}
