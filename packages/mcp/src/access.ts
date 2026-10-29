/**
 * SPEC-80 Part A item 3: what each keyed tool needs, so a connection without a key lists every tool with its whole
 * schema and an agent reads the whole capability set before its owner signs up. The keyless build (server.ts) lists
 * every keyed tool with a description that begins "Needs a <seller|buyer|warehouse> key (<activity>: Can act)." and a
 * handler that answers needs_key (status 401) with the role, the activity and the sign-up call.
 *
 * The role is the key kind the tool belongs to (scope.ts toolKind: a seller tool, a warehouse tool, or a tool every key
 * reaches, named here for a buyer key, the kind that reaches only those). The activity is the one the API's permission
 * gate reads for the tool's endpoint (api_action_permission, api_seller_action_permission, api_market_permission,
 * api_shipping_permission, api_carrier_permission and api_feedback_permission in the database); a GET reads (Can
 * read), every other method acts (Can act). An endpoint the gate opens to any key reads "no activity needed".
 * Pure: no I/O.
 */
import { toolKind } from './scope.js';
import { ALIASES } from './intent-table.js';

export type AccessRole = 'seller' | 'buyer' | 'warehouse';
export interface ToolAccess {
  role: AccessRole;
  /** The activity label as Agent access shows it (Catalog, Orders, Leads); null when any key of the role may call it. */
  activity: string | null;
  level: 'read' | 'act';
  /** "GET /seller/catalog/lots", read from the start of the tool's description; null when it names none. */
  endpoint: string | null;
}

/** "GET /seller/catalog/lots" from a description that starts "GET /seller/catalog/lots: ...". */
export function endpointOf(description: string | undefined): string | null {
  const m = /^(GET|POST|PUT|PATCH|DELETE) (\/[^\s:(]*)/.exec(description ?? '');
  return m ? `${m[1]} ${m[2]}` : null;
}

type Rule = [RegExp, string | null];
/** Seller endpoints, by path (api_seller_action_permission, api_shipping_permission, api_carrier_permission). */
const SELLER_RULES: Rule[] = [
  [/^\/seller\/(me|events)$/, null],
  [/^\/seller\/(catalog|intents|quotes|category-watch|shopify)(\/|$)/, 'Catalog'],
  [/^\/seller\/shipping\/assign$/, 'Catalog'],
  [/^\/seller\/shipping\/(profiles|rate-card)(\/|$)/, 'Policies'],
  [/^\/seller\/(orders|disputes|returns)(\/|$)/, 'Orders'],
  [/^\/seller\/policies(\/|$)/, 'Policies'],
  [/^\/seller\/payouts(\/|$)/, 'Payouts'],
  [/^\/seller\/performance$/, 'Performance'],
  [/^\/seller\/delegations(\/|$)/, 'Delegations'],
  [/^\/seller\/(entity|fulfillment)$/, 'Business details'],
  [/^\/seller\/ship-from(\/|$)/, 'Business details'],
];
/** Warehouse endpoints, by path (api_action_permission). */
const WAREHOUSE_RULES: Rule[] = [
  [/^\/leads\/table$/, 'CRM'],
  [/^\/leads\/[^/]+\/(claim|buy)$/, 'Payments'],
  [/^\/leads(\/|$)/, 'Leads'],
  [/^\/crm(\/|$)/, 'CRM'],
  [/^\/capacity(\/|$)/, 'Capacity'],
  [/^\/messages(\/|$)/, 'Messages'],
  [/^\/costs(\/|$)/, 'Costs'],
  [/^\/network\/delegations(\/|$)/, 'Network'],
  [/^\/network\/members(\/|$)/, null],
  [/^\/settings\/lead-defaults$/, 'Leads'],
  [/^\/settings(\/|$)/, 'Settings'],
  [/^\/(profile|facilities)(\/|$)/, 'Profile'],
  [/^\/me\/payment-methods\/[^/]+$/, 'Payments'],
  [/^\/me\/balance\/return$/, 'Payments'],
  [/^\/me(\/|$)/, null],
  [/^\/agent\/limits$/, null],
];

/** A tool every key reaches, named for a buyer key (api_market_permission for a buyer kind, the feedback board). */
function buyerActivity(method: string, path: string): string | null {
  if (/^\/market\/orders$/.test(path) && method === 'POST') return 'Payments';
  if (/^\/market\/intents\/[^/]+\/quotes\/[^/]+\/accept$/.test(path)) return 'Payments';
  if (/^\/market\/(orders|intents|quotes)(\/|$)/.test(path)) return 'Orders';
  if (/^\/market\/(sheets|search|lots|sellers|book)(\/|$)/.test(path)) return 'Browse';
  if (/^\/feedback\/(board|posts)(\/|$)/.test(path)) return 'Orders';
  if (/^\/me\/payment-methods\/[^/]+$/.test(path) || /^\/me\/balance\/return$/.test(path)) return 'Payments';
  return null;
}

export function toolAccess(name: string, description: string | undefined): ToolAccess {
  const k = toolKind(name);
  const role: AccessRole = k === 'seller' ? 'seller' : k === 'warehouse' ? 'warehouse' : 'buyer';
  const endpoint = endpointOf(description);
  const [method, path] = endpoint ? (endpoint.split(' ') as [string, string]) : ['GET', ''];
  let activity: string | null = null;
  if (role === 'buyer') activity = buyerActivity(method, path);
  else {
    const rules = role === 'seller' ? SELLER_RULES : WAREHOUSE_RULES;
    activity = rules.find(([re]) => re.test(path))?.[1] ?? null;
  }
  // Browse, Payouts and Performance have nothing to act on (src/lib/keyActivities.ts READ_ONLY_ACTIVITIES): read.
  const readOnly = activity === 'Browse' || activity === 'Payouts' || activity === 'Performance';
  const level: 'read' | 'act' = method === 'GET' || readOnly ? 'read' : 'act';
  return { role, activity, level, endpoint };
}

/** The sentence a keyed tool's description begins with on a connection without a key. */
export function needsKeySentence(a: ToolAccess): string {
  const what = a.activity ? `${a.activity}: Can ${a.level}` : 'no activity needed';
  const also = a.role === 'buyer' ? ' A seller or warehouse key also reaches it.' : '';
  return `Needs a ${a.role} key (${what}).${also}`;
}

/**
 * The start of the description of a tool that needs a key. SPEC-84: an intent tool begins "Needs a seller key.",
 * "Needs a buyer key (a seller or warehouse key also reaches it)." or "Needs a key."; a 0.3 tool began "Needs a seller
 * key (Catalog: Can act)." A tool with an action that answers without a key begins with neither.
 */
export const NEEDS_KEY_RE = /^Needs a (?:(seller|buyer|warehouse) )?key(?: \((?:[A-Z][A-Za-z ]+: Can (?:act|read)|no activity needed|a seller or warehouse key also reaches it)\))?\./;

/** What a keyless call of a keyed tool answers: needs_key with the role, the activity and the sign-up call. */
export function needsKeyAnswer(name: string, a: ToolAccess): Record<string, unknown> {
  const activity = a.activity ? `${a.activity} set to Can ${a.level}` : 'any activity';
  const signupArgs: Record<string, string> = a.role === 'warehouse'
    ? { kind: 'warehouse', email: '<owner email>', company: '<company>', contact_name: '<owner name>', address: '<street address>' }
    : a.role === 'seller'
      ? { kind: 'seller', email: '<owner email>', company: '<company>', contact_name: '<owner name>' }
      : { kind: 'buyer', email: '<owner email>', contact_name: '<owner name>' };
  // SPEC-84: the answer names the intent tool and action (the 0.3 name stays as name) and the sign-up action.
  const target = ALIASES[name];
  const called = target ? `${target.tool} action ${target.action}` : name;
  return {
    error: 'needs_key',
    status: 401,
    tool: target?.tool ?? name,
    action: target?.action ?? null,
    name,
    role: a.role,
    activity: a.activity,
    level: a.activity ? a.level : null,
    endpoint: a.endpoint,
    detail: `${called} needs a ${a.role} key with ${activity}. Without an account, call commercebook_account_start with action signup and kind ${a.role}; the owner gets an 8-digit code by email, and action confirm with that code answers the key once. ${a.activity && a.level === 'act' ? `The owner then sets ${a.activity} to Can act at Agent access. ` : 'A new key reads from the start. '}Then connect again with Authorization: Bearer <key>.`,
    signup: { tool: 'commercebook_account_start', arguments: { action: 'signup', ...signupArgs }, endpoint: 'POST https://commercebook.ai/api/v1/signup/start', then: 'commercebook_account_start action confirm' },
    ...(a.role === 'seller' ? { capabilities: 'commercebook_capabilities (no key) lists every seller capability and the tool and action for each' } : {}),
  };
}
