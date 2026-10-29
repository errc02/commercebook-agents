/**
 * SPEC-84: the tool surface of version 0.4. The register functions of every *-tools.ts file run unchanged against a
 * collector (collectOps), which keeps each operation's schema and handler; this file then registers on the server:
 *   - one intent tool per entry of intent-table.ts, taking `action` and that action's arguments, each call validated
 *     with the operation's own schema and answered by the operation's own handler;
 *   - commercebook_tool_search, which answers the tool, the action and the arguments for plain words;
 *   - every 0.3 name as an alias for 90 days (ALIAS_WINDOW): it answers as before, with a second text block holding
 *     deprecated_use (the new tool and action). Aliases are never listed.
 * tools/list answers the tools of a role (intent-table.ts toolsForRole): the role argument of tools/list (or its
 * _meta.role), else the connection's role (the address's ?role=, the x-commercebook-role header, the initialize
 * clientInfo.role, COMMERCEBOOK_ROLE for the stdio server), else the key's kind, else the keyless tools only.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ALIAS_WINDOW, ALIASES, INTENT_TOOLS, TOOL_SEARCH_NAME, renderOpNames, toolsForRole, type IntentRole, type IntentTool } from './intent-table.js';
import { toolAccess, type ToolAccess } from './access.js';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
type Handler = (args: Record<string, unknown>, extra: unknown) => Promise<ToolResult> | ToolResult;
type Shape = Record<string, z.ZodType>;
type Annotations = { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };

/** One 0.3 operation as its register function described it. */
export interface Op {
  name: string;
  title: string;
  /** The operation's own description (it starts with its endpoint). */
  description: string;
  shape: Shape;
  annotations?: Annotations;
  cb: Handler;
  /** Answers without a key (signup-tools.ts KEYLESS_TOOL_NAMES). */
  keyless: boolean;
  access: ToolAccess;
}

export type ConnectionRole = IntentRole | 'all';
export const ROLES: readonly ConnectionRole[] = ['buyer', 'seller', 'warehouse', 'all'];
export function parseRole(v: unknown): ConnectionRole | null {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v.trim().toLowerCase()) ? (v.trim().toLowerCase() as ConnectionRole) : null;
}

/** A stand-in for McpServer that keeps each registration (the register functions only call registerTool). */
export function collector(into: Map<string, Op>, wrap: (name: string, config: Record<string, unknown>, cb: Handler) => Op | null): McpServer {
  return {
    registerTool(name: string, config: Record<string, unknown>, cb: Handler) {
      if (into.has(name)) return undefined;
      const op = wrap(name, config, cb);
      if (op) into.set(name, op);
      return undefined;
    },
  } as unknown as McpServer;
}

export function opFrom(name: string, config: Record<string, unknown>, cb: Handler, keyless: boolean): Op {
  const description = String(config.description ?? '');
  return {
    name,
    title: String(config.title ?? name),
    // SPEC-85: another operation named in the text reads as its intent tool and action (the access rule reads the raw text).
    description: renderOpNames(description),
    shape: (config.inputSchema as Shape | undefined) ?? {},
    annotations: config.annotations as Annotations | undefined,
    cb,
    keyless,
    access: toolAccess(name, description),
  };
}

/** SPEC-85: every description in a JSON Schema with the 0.3 names rendered as intent tools and actions. */
function renderSchemaText(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(renderSchemaText);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = k === 'description' && typeof v === 'string' ? renderOpNames(v) : renderSchemaText(v);
  return out;
}

const text = (o: unknown): { type: 'text'; text: string } => ({ type: 'text', text: JSON.stringify(o) });
const errorResult = (o: Record<string, unknown>): ToolResult => ({ isError: true, content: [text(o)] });

/* ------------------------------------------------------------------ descriptions */

/** "(Orders: Can act)", "(no key)", "(no activity needed)" for one action. */
function accessWords(op: Op | undefined, toolKeyed: boolean): string {
  if (!op) return 'not on this key';
  if (op.keyless) return 'no key';
  const a = op.access;
  if (a.activity) return `${a.activity}: Can ${a.level}`;
  return toolKeyed ? 'no activity needed' : `any ${a.role === 'buyer' ? '' : `${a.role} `}key`;
}

/** The sentence a tool that needs a key begins with (access.ts NEEDS_KEY_RE reads it). */
export function toolKeySentence(t: IntentTool, ops: Map<string, Op>): string | null {
  const used = t.actions.map((a) => ops.get(a.op)).filter((o): o is Op => Boolean(o));
  if (!used.length || used.some((o) => o.keyless)) return null;
  const roles = [...new Set(used.map((o) => o.access.role))];
  if (roles.length !== 1) return 'Needs a key.';
  return roles[0] === 'buyer' ? 'Needs a buyer key (a seller or warehouse key also reaches it).' : `Needs a ${roles[0]} key.`;
}

export function describeIntent(t: IntentTool, ops: Map<string, Op>): string {
  const key = toolKeySentence(t, ops);
  const head = key ? `${key} ${t.lead}` : t.lead;
  const lines = t.actions.map((a) => `- ${a.action} (${accessWords(ops.get(a.op), Boolean(key))}): ${a.line}.`);
  const def = t.defaultAction ? ` Without action it runs ${t.defaultAction}.` : '';
  return `${head}\nActions (the activity each needs):\n${lines.join('\n')}\nSend action and its arguments.${def}`;
}

function annotationsOf(t: IntentTool, ops: Map<string, Op>): Annotations {
  const used = t.actions.map((a) => ops.get(a.op)).filter((o): o is Op => Boolean(o));
  const method = (o: Op) => o.access.endpoint?.split(' ')[0] ?? 'GET';
  const ro = (o: Op) => o.annotations?.readOnlyHint ?? method(o) === 'GET';
  return {
    readOnlyHint: used.every(ro),
    destructiveHint: used.some((o) => o.annotations?.destructiveHint ?? method(o) === 'DELETE'),
    idempotentHint: used.every((o) => o.annotations?.idempotentHint ?? (method(o) === 'GET' || method(o) === 'PUT')),
    openWorldHint: used.some((o) => o.annotations?.openWorldHint === true),
  };
}

/* ------------------------------------------------------------------ schemas */

type Json = Record<string, unknown>;
/**
 * The schemas are the same for every build of one kind (the register functions are fixed code), and each stateless
 * request builds a server, so the JSON is kept per process: by operation name and argument names, and per intent tool
 * by the operations it carries in that build.
 */
const opJsonCache = new Map<string, Json>();
const intentJsonCache = new Map<string, Json>();
const opKey = (op: Op): string => `${op.name}(${Object.keys(op.shape).join(',')})`;
/** The JSON Schema of one operation's arguments (draft-07, input side, as the SDK lists a tool). */
export function opJsonSchema(op: Op): Json {
  const key = opKey(op);
  let js = opJsonCache.get(key);
  if (!js) {
    js = renderSchemaText(z.toJSONSchema(z.object(op.shape), { target: 'draft-7', io: 'input', unrepresentable: 'any' })) as Json;
    opJsonCache.set(key, js);
  }
  return js;
}

/** The merged schema of an intent tool: action, then every argument of every action, each naming the actions it serves. */
export function intentJsonSchema(t: IntentTool, ops: Map<string, Op>): Json {
  const present = t.actions.filter((a) => ops.has(a.op));
  const cacheKey = `${t.name}:${present.map((a) => opKey(ops.get(a.op) as Op)).join(';')}`;
  const hit = intentJsonCache.get(cacheKey);
  if (hit) return hit;
  const built = buildIntentJsonSchema(t, present, ops);
  intentJsonCache.set(cacheKey, built);
  return built;
}

function buildIntentJsonSchema(t: IntentTool, present: IntentTool['actions'], ops: Map<string, Op>): Json {
  const props = new Map<string, { variants: Map<string, Json>; actions: string[] }>();
  for (const a of present) {
    const js = opJsonSchema(ops.get(a.op) as Op);
    for (const [k, v] of Object.entries((js.properties as Record<string, Json> | undefined) ?? {})) {
      const entry = props.get(k) ?? { variants: new Map<string, Json>(), actions: [] as string[] };
      entry.variants.set(JSON.stringify(v), v);
      entry.actions.push(a.action);
      props.set(k, entry);
    }
  }
  const properties: Record<string, Json> = {
    action: {
      type: 'string',
      enum: present.map((a) => a.action),
      description: t.defaultAction ? `The action to run (${t.defaultAction} when left out).` : 'The action to run.',
      ...(t.defaultAction ? { default: t.defaultAction } : {}),
    },
  };
  for (const [k, { variants, actions }] of props) {
    const which = actions.length === present.length && present.length > 1 ? 'every action' : actions.join(', ');
    const list = [...variants.values()];
    const desc = list.map((v) => v.description).find((d): d is string => typeof d === 'string');
    const note = `For ${which}.`;
    if (list.length === 1) {
      properties[k] = { ...list[0], description: desc ? `${note} ${desc}` : note };
    } else {
      properties[k] = { anyOf: list.map(({ description: _d, ...rest }) => rest), description: desc ? `${note} ${desc}` : note };
    }
  }
  return { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties, ...(t.defaultAction ? {} : { required: ['action'] }) };
}

/** The arguments of one action for tool_search: the properties and the required ones. */
function actionArguments(op: Op | undefined): { properties: Json; required: string[] } | null {
  if (!op) return null;
  const js = opJsonSchema(op);
  return { properties: (js.properties as Json | undefined) ?? {}, required: (js.required as string[] | undefined) ?? [] };
}

/* ------------------------------------------------------------------ calls */

function zodIssues(e: z.ZodError): string[] {
  return e.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(arguments)'}: ${i.message}`);
}

/** Runs one action of an intent tool with the operation's own schema and handler. */
async function runAction(t: IntentTool, ops: Map<string, Op>, args: Record<string, unknown>, extra: unknown): Promise<ToolResult> {
  const { action: raw, ...rest } = args ?? {};
  const action = typeof raw === 'string' && raw ? raw : t.defaultAction;
  const actions = t.actions.map((a) => a.action);
  const act = t.actions.find((a) => a.action === action);
  if (!act) {
    return errorResult({ error: 'invalid_action', tool: t.name, action: action ?? null, actions, detail: `${t.name} takes action, one of: ${actions.join(', ')}.` });
  }
  const op = ops.get(act.op);
  if (!op) {
    return errorResult({ error: 'not_for_this_key', tool: t.name, action: act.action, detail: `${t.name} action ${act.action} is not reached by this key's member kind.` });
  }
  const parsed = z.object(op.shape).safeParse(rest);
  if (!parsed.success) {
    const schema = actionArguments(op);
    return errorResult({ error: 'invalid_arguments', tool: t.name, action: act.action, detail: zodIssues(parsed.error), arguments: Object.keys(schema?.properties ?? {}), required: schema?.required ?? [] });
  }
  const result = await op.cb(parsed.data as Record<string, unknown>, extra);
  const ignored = Object.keys(rest).filter((k) => !(k in op.shape));
  if (!ignored.length) return result;
  return { ...result, content: [...result.content, text({ ignored_arguments: ignored, detail: `Not arguments of ${t.name} action ${act.action}; its arguments are ${Object.keys(op.shape).join(', ') || 'none'}.` })] };
}

/** The note an alias answers with, in a second text block so the first stays the answer agents already read. */
export function deprecatedUse(old: string): Record<string, unknown> | null {
  const target = ALIASES[old];
  if (!target) return null;
  return {
    deprecated_use: {
      name: old,
      tool: target.tool,
      action: target.action,
      until: ALIAS_WINDOW.until,
      detail: `${old} is the 0.3 name of ${target.tool} action ${target.action}. It answers until ${ALIAS_WINDOW.until_words}; call ${target.tool} with action ${target.action} and the same arguments.`,
    },
  };
}

/* ------------------------------------------------------------------ tool search */

const STOP = new Set('a an the to of for my i on in and or with from by me how do can what is it at this that your you our we want need get please some be will would like into as up out off its it s'.split(' '));
function stem(w: string): string {
  let s = w;
  if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`;
  else if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  if (s.length > 3 && s[s.length - 1] === s[s.length - 2] && !/[aeiou]/.test(s[s.length - 1])) s = s.slice(0, -1);
  return s;
}
/** Every word, lower case and stemmed, the small words kept (for phrases). */
const allTokens = (textIn: string): string[] => textIn.toLowerCase().replace(/’/g, "'").split(/[^a-z0-9]+/).filter(Boolean).map(stem);
export function searchTokens(textIn: string): string[] {
  return allTokens(textIn).filter((w) => !STOP.has(w));
}
const words = (x: string): string => x.replace(/^commercebook_/, '').replace(/_/g, ' ');

interface SearchEntry { tool: IntentTool; action: string; op: string; line: string; own: Set<string>; seqs: string[][]; context: Set<string>; name: string[] }
let searchIndex: SearchEntry[] | null = null;
function index(): SearchEntry[] {
  searchIndex ??= INTENT_TOOLS.flatMap((t) => {
    const context = new Set(searchTokens(`${t.title} ${t.lead}`));
    return t.actions.map((a) => {
      const own = searchTokens(`${words(a.action)} ${a.line} ${a.words ?? ''} ${words(a.op)}`);
      // Phrases come from the reader words only; the 0.3 name counts as words and as a direct match.
      const seqs = [words(a.action), a.line, a.words ?? ''].map(allTokens);
      return { tool: t, action: a.action, op: a.op, line: a.line, own: new Set(own), seqs, context, name: searchTokens(words(a.action)) };
    });
  });
  return searchIndex;
}

/** The longest run of the query's words found in order in one of the action's phrases, counted in non-small words. */
function phraseRun(q: string[], seqs: string[][]): number {
  let best = 0;
  for (const s of seqs) {
    for (let i = 0; i < q.length; i++) {
      for (let j = 0; j < s.length; j++) {
        let k = 0;
        while (i + k < q.length && j + k < s.length && q[i + k] === s[j + k]) k++;
        if (k >= 2) best = Math.max(best, q.slice(i, i + k).filter((w) => !STOP.has(w)).length + (k === q.length ? 1 : 0));
      }
    }
  }
  return best;
}

/** SPEC-85: the words of a warehouse that wants to pay less for its supplies, and the words of buying. */
const COST_WORDS = /\b(cheaper|pay less|what (?:we|i|they) pay|lower (?:what|our|my) |reduce|cut (?:our|my|the) |save|saving|savings|spend|spending|overpay|overpaying|supply costs?|supplies|supply prices?|vendor|vendors|supplier|suppliers|invoice|invoices)\b/;
const BUY_WORDS = /\b(quote|quotes|quoting|buy|buying|purchase|purchasing|price|prices|pricing|rfq|source|sourcing)\b/;

export interface SearchMatch { tool: string; action: string; score: number; what: string }
/** The best tool and action for plain words (pure; QA and the tool share it). */
export function searchIntents(query: string, role: ConnectionRole | null = null, limit = 3): SearchMatch[] {
  const qAll = allTokens(query);
  const qs = new Set(searchTokens(query));
  const direct = /\b(commercebook_[a-z0-9_]+|signup_start|signup_confirm|network_now|instructions)\b/.exec(query)?.[1];
  const lower = query.toLowerCase();
  const costWords = COST_WORDS.test(lower) && !/\blimits?\b/.test(lower);
  // "quote a request" is a seller answering a buyer, never a buyer asking for a price.
  const buyWords = BUY_WORDS.test(lower) && !/\bquote\s+(?:a|an|the|this|that|their|one|buyer'?s?)\s+(?:buyer'?s?\s+)?(?:request|requests|intent)\b/.test(lower);
  const askQuotes = /\b(get|ask for|request|need|want|collect)\s+(a\s+|some\s+)?quotes?\b/.test(lower) && !/\bmy request\b|\breceived\b/.test(lower);
  const scored = index().map((e) => {
    let score = 0;
    for (const w of qs) score += e.own.has(w) ? 2 : e.context.has(w) ? 0.5 : 0;
    score += 0.75 * phraseRun(qAll, e.seqs);
    // The more specific action wins a tie (fewer words of its own).
    if (score > 0) score -= e.own.size / 1000;
    if (direct && (direct === e.op || (ALIASES[direct]?.tool === e.tool.name && ALIASES[direct]?.action === e.action))) score += 20;
    if (direct && direct === e.tool.name) score += 4;
    if (role && role !== 'all' && !e.tool.listing.includes(role) && !e.tool.listing.includes('keyless')) score -= 2.5;
    // Without a role, a tool that answers without a key wins a tie.
    if (!role && score > 0 && e.tool.listing.includes('keyless')) score += 0.3;
    // SPEC-85: an action whose own name the query says in full wins a tie ("quote" is commercebook_buy action quote).
    if (score > 0 && e.name.length && e.name.every((w) => qs.has(w))) score += 0.5;
    // SPEC-85: asking for quotes on a thing is posting a request (sellers quote it), not reading the quotes received.
    if (askQuotes && e.tool.name === 'commercebook_requests' && e.action === 'post') score += 1.5;
    // SPEC-85: plain cost wording ("lower what we pay for stretch wrap", "cheaper supplies") is a warehouse's supply costs.
    if (costWords && (!role || role === 'warehouse' || role === 'all') && e.tool.name === 'commercebook_costs') score += 3;
    // SPEC-85: without a role, buying words ("quote", "buy", "price") prefer what a buyer does to a warehouse's trade.
    if (buyWords && !costWords && !role && score > 0) {
      if (e.tool.listing.includes('buyer') || e.tool.name === 'commercebook_market') score += 1.5;
      else if (!e.tool.listing.includes('keyless')) score -= 1.5;
    }
    return { e, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(10, limit)))
    .map(({ e, score }) => ({ tool: e.tool.name, action: e.action, score: Math.round(score * 100) / 100, what: e.line }));
}

/* ------------------------------------------------------------------ registration */

interface SurfaceOptions {
  keyless: boolean;
  /** The key's member kind ('both' on a local server whose kind is not known). */
  kind?: IntentRole | 'both';
  role?: ConnectionRole | null;
}

const roleHolders = new WeakMap<McpServer, { role: ConnectionRole | null }>();
/** Sets the connection's role after the server is built (the stdio server reads it from initialize). */
export function setConnectionRole(server: McpServer, role: unknown): void {
  const h = roleHolders.get(server);
  const r = parseRole(role);
  if (h && r) h.role = r;
}

const SEARCH_SHAPE = {
  query: z.string().min(1).max(200).describe('What you are trying to do, in plain words.'),
  role: z.enum(['buyer', 'seller', 'warehouse', 'all']).optional().describe('Rank the tools of this role first.'),
  limit: z.number().int().min(1).max(10).optional().describe('How many matches (3 by default).'),
};
let searchJson: Json | null = null;
const searchSchema = (): Json => (searchJson ??= z.toJSONSchema(z.object(SEARCH_SHAPE), { target: 'draft-7', io: 'input' }) as Json);

/** The tools/list request with its role argument kept (the SDK's own schema drops unknown params). */
const ListWithRole = z.object({
  method: z.literal('tools/list'),
  params: z.looseObject({ cursor: z.string().optional(), role: z.string().optional(), _meta: z.looseObject({}).optional() }).optional(),
});

export function registerSurface(server: McpServer, ops: Map<string, Op>, options: SurfaceOptions): void {
  const holder = { role: options.role ?? null };
  roleHolders.set(server, holder);
  const intentNames = new Set<string>();

  // The intent tools. The SDK passes the arguments through (a loose schema); each action is checked with its own.
  for (const t of INTENT_TOOLS) {
    if (!t.actions.some((a) => ops.has(a.op))) continue;
    intentNames.add(t.name);
    server.registerTool(
      t.name,
      { title: t.title, description: describeIntent(t, ops), inputSchema: z.looseObject({}), annotations: annotationsOf(t, ops) },
      async (args: Record<string, unknown>, extra: unknown) => runAction(t, ops, args, extra),
    );
  }

  // The tool search: plain words to the tool, the action and the arguments.
  intentNames.add(TOOL_SEARCH_NAME);
  server.registerTool(
    TOOL_SEARCH_NAME,
    {
      title: 'Find the tool for a task',
      description: `Plain words to the tool and action that do it, with the arguments: for example "ship an order", "post a request", "watch a category". No key needed. role (buyer, seller, warehouse or all) ranks that role's tools first. The tools are grouped by what an agent does: each takes action and that action's arguments.`,
      inputSchema: SEARCH_SHAPE,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, role, limit }: { query: string; role?: ConnectionRole; limit?: number }) => {
      const r = role ?? holder.role ?? (options.kind && options.kind !== 'both' ? options.kind : null);
      const matches = searchIntents(query, r, limit ?? 3).map((m) => {
        const t = INTENT_TOOLS.find((x) => x.name === m.tool) as IntentTool;
        const a = t.actions.find((x) => x.action === m.action) as IntentTool['actions'][number];
        const op = ops.get(a.op);
        const args = actionArguments(op);
        const required = Object.fromEntries((args?.required ?? []).map((k) => [k, `<${k}>`]));
        return {
          tool: m.tool,
          action: m.action,
          what: m.what,
          needs: op ? (op.keyless ? 'no key' : `a ${op.access.role} key${op.access.activity ? ` with ${op.access.activity}: Can ${op.access.level}` : ''}`) : 'another kind of key',
          endpoint: op?.access.endpoint ?? null,
          arguments: args?.properties ?? {},
          required: args?.required ?? [],
          call: { name: m.tool, arguments: { action: m.action, ...required } },
          listed_for: t.listing,
          score: m.score,
        };
      });
      const answer = matches.length
        ? { query, matches }
        : { query, matches: [], detail: 'No tool matched these words. Try a verb and a thing, for example "post a request" or "ship an order"; tools/list with role all lists every tool.' };
      return { content: [{ type: 'text' as const, text: JSON.stringify(answer, null, 2) }] };
    },
  );

  // The 0.3 names, for 90 days: the same schema and handler, a deprecated_use note, never listed.
  for (const op of ops.values()) {
    if (intentNames.has(op.name)) continue;
    const note = deprecatedUse(op.name);
    server.registerTool(
      op.name,
      { title: op.title, description: op.description, inputSchema: op.shape, ...(op.annotations ? { annotations: op.annotations } : {}) },
      async (args: Record<string, unknown>, extra: unknown) => {
        const result = await op.cb(args, extra);
        return note ? { ...result, content: [...result.content, text(note)] } : result;
      },
    );
  }

  // tools/list: the tools of the role, in the table's order, each intent tool with its merged schema. Built here from the
  // registrations (the SDK's own list would convert every alias schema, and none of them is listed).
  const registered = (server as unknown as { _registeredTools: Record<string, { title?: string; description?: string; annotations?: Annotations }> })._registeredTools;
  server.server.setRequestHandler(ListWithRole, async (req) => {
    const asked = parseRole(req.params?.role) ?? parseRole((req.params?._meta as Json | undefined)?.role);
    const role = asked ?? holder.role ?? (options.kind && options.kind !== 'both' ? options.kind : options.keyless ? null : 'all');
    const tools = toolsForRole(role)
      .filter((n) => intentNames.has(n))
      .map((name) => {
        const r = registered[name] ?? {};
        const def = INTENT_TOOLS.find((t) => t.name === name);
        return { name, title: r.title, description: r.description, inputSchema: def ? intentJsonSchema(def, ops) : searchSchema(), annotations: r.annotations };
      });
    return { tools } as never;
  });
}
