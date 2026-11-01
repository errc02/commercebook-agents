/** Builds the MCP server with the CommerceBook tools bound to one API client. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiClient, configFromEnv, type ClientConfig } from './client.js';
import { registerTools } from './tools.js';
import { registerShippingTools } from './shipping-tools.js';
import { registerCatalogImportTools } from './catalog-import-tools.js';
import { registerCrmFactsTools } from './crm-facts-tools.js';
import { registerLeadIntakeTools } from './lead-intake-tools.js';
import { registerLeadShareTools } from './lead-share-tools.js';
import { registerAgentLimitsTools } from './agent-limits-tools.js';
import { registerAgentRulesTools } from './agent-rules-tools.js';
import { registerLeadsTableTools } from './leads-table-tools.js';
import { KEYLESS_INSTRUCTIONS, KEYLESS_TOOL_NAMES, registerSignupTools, SIGNUP_TOOL_NAMES } from './signup-tools.js';
import { toolAllowed, type MemberKind } from './scope.js';
import { registerFeedbackTools } from './feedback-tools.js';
import { registerPaymentsTools } from './payments-tools.js';
import { registerMarketKeylessTools, registerMarketTools } from './market-tools.js';
import { registerSellerLotTools } from './seller-lot-tools.js';
import { registerCarrierTools } from './carrier-tools.js';
import { registerFeedbackBoardTools } from './feedback-board-tools.js';
import { registerIntentKeylessTools, registerIntentTools } from './intent-tools.js';
import { registerBookTools } from './book-tools.js';
import { registerShopifyTools } from './shopify-tools.js';
import { registerProductDocsTools } from './product-docs-tools.js';
import { registerReachSellerTools, registerReachTools } from './reach-tools.js';
import { registerCapabilitiesTools } from './capabilities-tools.js';
import { registerEventsTools } from './events-tools.js';
import { registerAuctionKeylessTools, registerAuctionTools } from './auction-tools.js';
import { registerCheckoutSessionTools } from './checkout-session-tools.js';
import { registerWorkQueueTools } from './work-queue-tools.js';
import { registerServiceKeylessTools, registerServiceTools } from './service-tools.js';
import { needsKeyAnswer, toolAccess } from './access.js';
import { collector, opFrom, parseRole, registerSurface, type ConnectionRole, type Op } from './intent-surface.js';

export const SERVER_NAME = 'commercebook';
export const SERVER_VERSION = '0.5.0';
/** SPEC-36: the server's own description, one sentence in the documentation voice. */
export const SERVER_DESCRIPTION =
  'CommerceBook (https://commercebook.ai) is a network of verified warehouses and the sellers who sell through them, and these tools, each grouping the actions an agent takes for one task, call its API as the member whose key is configured, with every call recorded on that member’s ledger and commercebook_start returning the member’s full briefing.';

/** Every keyed registration, in one order for both builds. */
function registerKeyed(server: McpServer, api: ApiClient): void {
  registerTools(server, api);
  registerFeedbackTools(server, api);
  registerShippingTools(server, api);
  registerCatalogImportTools(server, api);
  registerCrmFactsTools(server, api);
  registerLeadIntakeTools(server, api);
  // SPEC-110: share in one step, send to one warehouse.
  registerLeadShareTools(server, api);
  registerAgentLimitsTools(server, api);
  registerAgentRulesTools(server, api);
  registerLeadsTableTools(server, api);
  registerPaymentsTools(server, api);
  registerMarketTools(server, api);
  registerSellerLotTools(server, api);
  registerCarrierTools(server, api);
  registerFeedbackBoardTools(server, api);
  registerIntentTools(server, api);
  registerBookTools(server, api);
  // SPEC-72: the seller's Shopify channel.
  registerShopifyTools(server, api);
  // SPEC-103: a product's documents and published answers.
  registerProductDocsTools(server, api);
  // SPEC-79: reach, the shipping estimate, and the seller's category watch.
  registerReachTools(server, api);
  registerReachSellerTools(server, api);
  // SPEC-80: every seller capability in one read (no key needed).
  registerCapabilitiesTools(server, api);
  // SPEC-102: the event feed and webhooks per key.
  registerEventsTools(server, api);
  // CB-963: auctions with a reserve.
  registerAuctionTools(server, api);
  // CB-971: checkout sessions in the Agentic Commerce Protocol shape.
  registerCheckoutSessionTools(server, api);
  // CB-972: the warehouse work queue and the seller's read of it.
  registerWorkQueueTools(server, api);
  // CB-973: services with booking.
  registerServiceTools(server, api);
}

export interface BuildOptions {
  /** SPEC-47: no key yet. SPEC-84: the keyless intent tools answer; every other one is listed for its role and answers needs_key. */
  keyless?: boolean;
  /** SPEC-47: the key's member kind (the remote server). Left out, every tool is registered and listed. */
  kind?: MemberKind | 'both';
  /**
   * SPEC-84: the role whose tools tools/list answers when the request names none (buyer, seller, warehouse or all):
   * the address's ?role=, the x-commercebook-role header or the initialize clientInfo.role. Left out, the key's kind,
   * or the keyless tools only without a key.
   */
  role?: ConnectionRole | string | null;
  /**
   * SPEC-48: the connect-time instructions. The remote server passes the front page (lib/mcp-front-page.ts); left out,
   * the server's own description (keyed) or KEYLESS_INSTRUCTIONS.
   */
  instructions?: string;
}

const KEYLESS = new Set<string>(KEYLESS_TOOL_NAMES);
const ALWAYS = new Set<string>(SIGNUP_TOOL_NAMES);

/**
 * Every 0.3 operation of this build, with its schema and handler (intent-surface.ts registers the intent tools and the
 * aliases from them). Without a key: the keyless operations answer; SPEC-80 Part A item 3: every keyed one answers
 * needs_key (status 401) with the role, the activity and the sign-up action. With a key: the operations the key's kind
 * reaches (scope.ts), plus the sign-up and network-now ones every connection may call.
 */
export function collectOps(api: ApiClient, options: Pick<BuildOptions, 'keyless' | 'kind'> = {}): Map<string, Op> {
  const ops = new Map<string, Op>();
  if (options.keyless) {
    const free = collector(ops, (name, config, cb) => opFrom(name, config, cb as never, KEYLESS.has(name)));
    registerSignupTools(free, api);
    registerFeedbackTools(free, api, { keyless: true });
    // SPEC-39: searching the market and reading a lot need no key.
    registerMarketKeylessTools(free, api);
    // SPEC-68 Part B: the open requests on the book need no key.
    registerIntentKeylessTools(free, api);
    // SPEC-68 Part C: the book right now needs no key.
    registerBookTools(free, api);
    // SPEC-79: reach before an email and the shipping of one product to a state need no key.
    registerReachTools(free, api);
    // SPEC-80: the seller capabilities need no key; then every keyed operation, answering needs_key.
    registerCapabilitiesTools(free, api);
    // CB-963: the open auctions and one auction need no key.
    registerAuctionKeylessTools(free, api);
    // CB-973: a service's open slots need no key.
    registerServiceKeylessTools(free, api);
    const preview = collector(ops, (name, config) => {
      const op = opFrom(name, config, async () => ({ isError: true, content: [{ type: 'text', text: '' }] }), false);
      const answer = needsKeyAnswer(name, toolAccess(name, op.description));
      op.cb = async () => ({ isError: true, content: [{ type: 'text', text: JSON.stringify(answer) }] });
      return op;
    });
    registerKeyed(preview, api);
    return ops;
  }
  const kind = options.kind;
  const keyed = collector(ops, (name, config, cb) => (!kind || kind === 'both' || ALWAYS.has(name) || toolAllowed(name, kind) ? opFrom(name, config, cb as never, KEYLESS.has(name)) : null));
  registerKeyed(keyed, api);
  registerSignupTools(keyed, api);
  return ops;
}

export function buildServer(config: ClientConfig = configFromEnv(), options: BuildOptions = {}): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: options.instructions ?? (options.keyless ? KEYLESS_INSTRUCTIONS : SERVER_DESCRIPTION) },
  );
  const api = new ApiClient(config);
  const ops = collectOps(api, options);
  // SPEC-91: a lead partner's tools are listed under the warehouse role; its ops (scope.ts) leave out buying, so the
  // commercebook_leads actions it lists are the partner's own and the warehouse tools with no reachable action drop out.
  const kind = options.kind === 'both' || !options.kind ? (options.keyless ? undefined : 'both') : options.kind === 'lead_partner' ? 'warehouse' : options.kind;
  registerSurface(server, ops, { keyless: Boolean(options.keyless), kind, role: parseRole(options.role) });
  return server;
}
