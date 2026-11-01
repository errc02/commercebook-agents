/**
 * CB-977 (SPEC-131): the profile engine. It resolves a category (a Shopify id or gid, a CommerceBook key, or plain words
 * through each overlay's words), computes which trait modules apply (research record, section 5), and checks a product's
 * facts against the base profile, the modules and the overlay: refused (policy 06, a disabled overlay, a refusal on the
 * product's own facts), restricted until its declarations are present, or missing the fields publishing waits for.
 * compileRules() writes the same rules as JSON for the database: listing_profile_eval() (migration 191) reads them with
 * the same operators, so the import and the publish check in SQL and this engine give the same answer.
 * No model call (Eric's rule: hand rules first). Pure apart from cpscRecallCheck(), which takes its fetch as an argument.
 */
import { BASE_FIELDS, BASE_FULFILMENT } from './base.js';
import { MODULES, MODULE_BY_KEY } from './modules.js';
import { CB_CATEGORY_NODES, OVERLAYS } from './overlays.js';
import { ADULT_REASON, POLICY_RULES } from './policy.js';
import type { CheckKey, Condition, Declaration, FactValue, ModuleKey, Overlay, PolicyRule, ProfileField, Refusal, TraitModule } from './types.js';

/** The profile rules' version: a patch for wording, a minor for a recommended field, a major for a new requirement. */
export const PROFILES_VERSION = '1.0.0';
/** The Shopify Standard Product Taxonomy release the profiles are written against. */
export const TAXONOMY_VERSION = '2026-10';
export const TAXONOMY_RELEASE_URL = 'https://github.com/Shopify/product-taxonomy/releases/tag/v2026-10';
/** The words the fact sheet and the agent use for an overlay written from the research and not yet reviewed. */
export const UNREVIEWED_NOTE = 'Profile from research, not yet reviewed.';

const GID_PREFIX = 'gid://shopify/TaxonomyCategory/';
const ID_RE = /^(?:[a-z]{2})(?:-\d+)*$/;

/** A Shopify category id from an id, a gid or a URL-ish form; null when the text is not one. */
export function taxonomyId(input: string | null | undefined): string | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  const id = s.startsWith(GID_PREFIX) ? s.slice(GID_PREFIX.length) : s;
  return ID_RE.test(id) ? id : null;
}
export const taxonomyGid = (id: string): string => `${GID_PREFIX}${id}`;

/** True when a category sits at or under one of the ids. */
export function isUnder(category: string | null | undefined, ids: readonly string[]): boolean {
  if (!category) return false;
  return ids.some((p) => category === p || category.startsWith(`${p}-`));
}

/* ------------------------------------------------------------------ the facts */

/**
 * The facts of one product (and its lot) as the engine and listing_profile_eval() read them. lot.photos is the count of
 * photos; documents.<kind> is the count of documents of that kind; declarations.<key> is true when affirmed.
 */
export interface Facts {
  category: string | null;
  cb_category: string | null;
  /** The Shopify attribute handles of the category (from taxonomy_categories). */
  attributes?: string[];
  text?: string;
  product?: Record<string, FactValue>;
  specs?: Record<string, FactValue>;
  lot?: Record<string, FactValue>;
  documents?: Record<string, number>;
  declarations?: Record<string, boolean>;
}

export function factAt(facts: Facts, path: string): FactValue {
  if (path === 'category') return facts.category;
  if (path === 'cb_category') return facts.cb_category;
  if (path === 'text') return facts.text ?? '';
  const [head, ...rest] = path.split('.');
  let v: FactValue = (facts as unknown as Record<string, FactValue>)[head];
  for (const k of rest) {
    if (v === null || v === undefined || typeof v !== 'object' || Array.isArray(v)) return undefined;
    v = (v as Record<string, FactValue>)[k];
  }
  return v;
}

/** The present test both engines share: null, blank text, an empty list, an empty object and a zero count are absent. */
export function isPresent(v: FactValue, path = ''): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  if (typeof v === 'number' && (path === 'lot.photos' || path.startsWith('documents.'))) return v > 0;
  return true;
}

const str = (v: FactValue): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const num = (v: FactValue): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Whole words or phrases in lower-case text (the same pattern listing_profile_eval() builds). */
export function hasWords(text: string, phrases: readonly string[]): boolean {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9-]+/g, ' ').replace(/-/g, ' - ').replace(/\s+/g, ' ').trim();
  const t = ` ${norm(text)} `;
  return phrases.some((p) => {
    const q = norm(p);
    return t.includes(` ${q} `);
  });
}

export function holds(c: Condition, facts: Facts): boolean {
  if ('all' in c) return c.all.every((x) => holds(x, facts));
  if ('any' in c) return c.any.some((x) => holds(x, facts));
  const v = factAt(facts, c.path);
  switch (c.op) {
    case 'present': return isPresent(v, c.path);
    case 'absent': return !isPresent(v, c.path);
    case 'true': return v === true || v === 'true';
    case 'eq': return isPresent(v, c.path) && str(v) === String(c.value);
    case 'neq': return isPresent(v, c.path) && str(v) !== String(c.value);
    case 'in': return Array.isArray(v) ? v.some((x) => c.value.map(String).includes(str(x))) : isPresent(v, c.path) && c.value.map(String).includes(str(v));
    case 'lt': { const n = num(v); return n !== null && n < c.value; }
    case 'gte': { const n = num(v); return n !== null && n >= c.value; }
    case 'under': return isUnder(typeof v === 'string' ? v : null, c.value);
    case 'words': return hasWords(str(v), c.value);
    default: return false;
  }
}

/* ------------------------------------------------------------------ the overlay and the modules */

/** The overlay of a category: the longest Shopify id match across overlays, else the CommerceBook key. */
export function overlayFor(category: string | null | undefined, cbCategory?: string | null): Overlay | null {
  let best: { o: Overlay; len: number } | null = null;
  if (category) {
    for (const o of OVERLAYS) {
      for (const p of o.under) {
        if (isUnder(category, [p]) && (!best || p.length > best.len)) best = { o, len: p.length };
      }
    }
  }
  if (best) return best.o;
  if (cbCategory) return OVERLAYS.find((o) => o.cbKeys.includes(cbCategory)) ?? null;
  return null;
}

/** Why a module fires: the first test that holds, in plain words; null when none does. */
export function moduleFires(m: TraitModule, facts: Facts, overlay: Overlay | null): string | null {
  if (overlay?.modules.includes(m.key)) return `the ${overlay.name} profile includes it`;
  if (m.trigger.under && isUnder(facts.category, m.trigger.under)) return 'the category sits in its part of the taxonomy';
  if (m.trigger.attributes && (facts.attributes ?? []).some((a) => m.trigger.attributes!.includes(a))) return 'the category carries its attribute';
  if (m.trigger.facts && m.trigger.facts.some((c) => holds(c, facts))) return 'the product\'s own facts call for it';
  return null;
}

export function modulesFor(facts: Facts, overlay: Overlay | null = overlayFor(facts.category, facts.cb_category)): Array<{ key: ModuleKey; name: string; because: string }> {
  const out: Array<{ key: ModuleKey; name: string; because: string }> = [];
  for (const m of MODULES) {
    const because = moduleFires(m, facts, overlay);
    if (because) out.push({ key: m.key, name: m.name, because });
  }
  return out;
}

/** The fields of a profile: the base, then each module, then the overlay; a later field with the same key wins. */
export function fieldsOf(overlay: Overlay | null, modules: ModuleKey[]): ProfileField[] {
  const byKey = new Map<string, ProfileField>();
  for (const x of BASE_FIELDS) byKey.set(x.key, x);
  for (const k of modules) for (const x of MODULE_BY_KEY[k].fields) byKey.set(x.key, x);
  for (const x of overlay?.fields ?? []) byKey.set(x.key, x);
  return [...byKey.values()];
}

export function declarationsOf(overlay: Overlay | null, modules: ModuleKey[]): Declaration[] {
  const byKey = new Map<string, Declaration>();
  for (const k of modules) for (const x of MODULE_BY_KEY[k].declarations) byKey.set(x.key, x);
  for (const x of overlay?.declarations ?? []) byKey.set(x.key, x);
  return [...byKey.values()];
}

function refusalsOf(overlay: Overlay | null, modules: ModuleKey[]): Refusal[] {
  return [...modules.flatMap((k) => MODULE_BY_KEY[k].refusals ?? []), ...(overlay?.refusals ?? [])];
}

/* ------------------------------------------------------------------ the check */

export interface PolicyHit {
  key: string;
  kind: 'prohibited' | 'restricted';
  policy: string;
  reason: string;
  /** For a restricted rule: the declarations still to affirm. */
  declarations_missing: Array<{ key: string; text: string }>;
}

export function policyHits(facts: Facts): PolicyHit[] {
  const title = str(factAt(facts, 'product.title'));
  const out: PolicyHit[] = [];
  for (const r of POLICY_RULES) {
    const byNode = isUnder(facts.category, r.under);
    const byWords = r.words.length > 0 && hasWords(title, r.words);
    if (!byNode && !byWords) continue;
    const missing = (r.declarations ?? []).filter((x) => facts.declarations?.[x.key] !== true).map((x) => ({ key: x.key, text: x.text }));
    out.push({ key: r.key, kind: r.kind, policy: r.policy, reason: policyReason(r), declarations_missing: missing });
  }
  return out;
}

export function policyReason(r: PolicyRule): string {
  if (r.key === 'adult') return ADULT_REASON;
  return r.kind === 'prohibited' ? `Policy 06 prohibits this: ${r.policy}` : `Policy 06 restricts this: ${r.policy}`;
}

export interface MissingItem {
  key: string;
  label: string;
  kind: 'field' | 'declaration';
  path?: string;
  unit?: string;
}

export interface CheckResult {
  overlay: string | null;
  reviewed: boolean;
  modules: ModuleKey[];
  /** The first refusal: the product cannot be listed. */
  refused: { key: string; reason: string } | null;
  /** Restricted by policy 06 and not yet declared: the product cannot be saved until these are affirmed. */
  restricted: PolicyHit[];
  /** What publishing waits for. */
  missing: MissingItem[];
  ok_to_publish: boolean;
}

/** The whole check of one product's facts. */
export function checkFacts(facts: Facts): CheckResult {
  const overlay = overlayFor(facts.category, facts.cb_category);
  const modules = modulesFor(facts, overlay).map((m) => m.key);
  const hits = policyHits(facts);
  let refused: CheckResult['refused'] = null;
  const prohibited = hits.find((h) => h.kind === 'prohibited');
  if (prohibited) refused = { key: prohibited.key, reason: prohibited.reason };
  else if (overlay && !overlay.enabled) refused = { key: `profile_disabled:${overlay.key}`, reason: overlay.disabledReason ?? 'CommerceBook does not offer this today.' };
  else {
    const r = refusalsOf(overlay, modules).find((x) => holds(x.when, facts));
    if (r) refused = { key: r.key, reason: r.reason };
  }
  const restricted = hits.filter((h) => h.kind === 'restricted' && h.declarations_missing.length > 0);
  const missing: MissingItem[] = [];
  for (const x of fieldsOf(overlay, modules)) {
    const need = x.requirement === 'required' || (x.requirement === 'conditional' && x.when !== undefined && holds(x.when, facts));
    if (need && !isPresent(factAt(facts, x.path), x.path)) missing.push({ key: x.key, label: x.label, kind: 'field', path: x.path, ...(x.unit ? { unit: x.unit } : {}) });
  }
  for (const x of declarationsOf(overlay, modules)) {
    const need = x.requirement === 'required' || (x.when !== undefined && holds(x.when, facts));
    if (need && facts.declarations?.[x.key] !== true) missing.push({ key: x.key, label: x.text, kind: 'declaration' });
  }
  return { overlay: overlay?.key ?? null, reviewed: overlay ? overlay.reviewed : true, modules, refused, restricted, missing, ok_to_publish: !refused && restricted.length === 0 && missing.length === 0 };
}

/* ------------------------------------------------------------------ resolving plain words */

export interface WordMatch {
  overlay: Overlay;
  node: string;
  words: string[];
}

/**
 * Plain words to an overlay and a node: each overlay scores the characters of the phrases it finds in the words; the
 * highest score wins (ties go to the overlay listed first), and within it the deepest node among the matched phrases.
 */
export function matchWords(q: string): WordMatch | null {
  let best: { o: Overlay; score: number; hits: Array<{ phrase: string; node: string }> } | null = null;
  for (const o of OVERLAYS) {
    const hits: Array<{ phrase: string; node: string }> = [];
    for (const w of o.words) for (const p of w.words) if (hasWords(q, [p])) hits.push({ phrase: p, node: w.node ?? o.defaultNode });
    if (!hits.length) continue;
    const score = hits.reduce((n, h) => n + h.phrase.length, 0);
    if (!best || score > best.score) best = { o, score, hits };
  }
  if (!best) return null;
  const depth = (id: string) => id.split('-').length;
  const node = best.hits.map((h) => h.node).sort((a, b) => depth(b) - depth(a))[0];
  return { overlay: best.o, node, words: [...new Set(best.hits.map((h) => h.phrase))] };
}

/**
 * CB-980 (finding 5): a request string names a key of one of these maps only when the map holds it as its own key. A
 * plain object answers `in` for its prototype too, so 'constructor' or 'toString' would resolve to a function.
 */
export const ownKey = (map: object, key: string): boolean => Object.hasOwn(map, key);
/** True when the text is a CommerceBook category key of the profile source (CB_CATEGORY_NODES). */
export const isCbCategoryKey = (raw: string): boolean => ownKey(CB_CATEGORY_NODES, raw);

export interface Resolved {
  category: string | null;
  cb_category: string | null;
  how: 'category' | 'cb_key' | 'words' | 'search' | 'none';
  words?: string[];
}

/**
 * A category from what the caller has: a Shopify id or gid, a CommerceBook category key, or plain words. The search
 * fallback (the database's taxonomy search) is the caller's: resolveCategory answers how 'none' when no word matched.
 */
export function resolveCategory(input: { category?: string | null; q?: string | null }): Resolved {
  const raw = (input.category ?? '').trim();
  if (raw) {
    const id = taxonomyId(raw);
    if (id && !isCbCategoryKey(raw)) return { category: id, cb_category: null, how: 'category' };
    if (isCbCategoryKey(raw)) return { category: CB_CATEGORY_NODES[raw], cb_category: raw, how: 'cb_key' };
  }
  const q = (input.q ?? '').trim();
  if (q) {
    const m = matchWords(q);
    if (m) return { category: m.node, cb_category: null, how: 'words', words: m.words };
  }
  return { category: null, cb_category: raw || null, how: 'none' };
}

/* ------------------------------------------------------------------ the profile a seller or an agent reads */

export interface FieldOut {
  key: string;
  label: string;
  type: ProfileField['type'];
  unit?: string;
  values?: string[];
  requirement: ProfileField['requirement'];
  when?: string;
  scope: 'product' | 'lot';
  path: string;
  private?: boolean;
  help?: string;
  source: string;
}

export interface ProfileAnswer {
  profiles_version: string;
  taxonomy_version: string;
  category: string | null;
  cb_category: string | null;
  overlay: { key: string; name: string; reviewed: boolean; enabled: boolean; note: string | null; disabled_reason: string | null; research: string; leaders: string[] } | null;
  modules: Array<{ key: ModuleKey; name: string; because: string }>;
  /** Modules this category does not turn on by itself that a product's own facts can (a serial, a battery, the large-item flag). */
  may_apply: Array<{ key: ModuleKey; name: string; fires_when: string }>;
  policy: { status: 'allowed' | 'restricted' | 'prohibited' | 'disabled'; reasons: string[] };
  fields: { required: FieldOut[]; conditional: FieldOut[]; recommended: FieldOut[]; feed: FieldOut[] };
  declarations: Array<{ key: string; text: string; requirement: 'required' | 'conditional'; when?: string; source: string }>;
  fulfilment: { allowed: Array<'ship' | 'pickup'>; note: string; pickup_only_when?: string };
  returns: { accepts_returns: boolean | null; rule: string };
  questions: string[];
  checks: Array<{ key: CheckKey; how: string }>;
}

/** The questions every listing asks before the profile's own (the base profile). */
export const BASE_QUESTIONS = [
  'What is it, exactly: the brand, the model and anything printed on the label?',
  'Is it new, used or surplus, and what condition is it in?',
  'How many do you have, and at what price each?',
];

const fieldOut = (x: ProfileField): FieldOut => ({
  key: x.key, label: x.label, type: x.type, ...(x.unit ? { unit: x.unit } : {}), ...(x.values ? { values: x.values } : {}), requirement: x.requirement,
  ...(x.whenText ? { when: x.whenText } : {}), scope: x.scope, path: x.path, ...(x.private ? { private: true } : {}), ...(x.help ? { help: x.help } : {}), source: x.source,
});

export const CHECK_HOW: Record<CheckKey, string> = {
  cpsc_recall: 'Before listing, search the CPSC recalls (https://www.saferproducts.gov/RestWebServices/Recall?format=json&ProductName=<name>, no key) by the product name and the model, or call GET /api/v1/profiles with recall=<name>. A match is refused unless the remedy was applied.',
};

/** The profile of a category: what the seller or the agent fills in, declares and asks before listing. */
export function profileFor(category: string | null, cbCategory: string | null = null, attributes: string[] = []): ProfileAnswer {
  const overlay = overlayFor(category, cbCategory);
  const facts: Facts = { category, cb_category: cbCategory, attributes };
  const modules = modulesFor(facts, overlay);
  const keys = modules.map((m) => m.key);
  const fields = fieldsOf(overlay, keys);
  const hits = policyHits({ ...facts, product: {} });
  const prohibited = hits.filter((h) => h.kind === 'prohibited');
  const restricted = hits.filter((h) => h.kind === 'restricted');
  const status: ProfileAnswer['policy']['status'] = prohibited.length ? 'prohibited' : overlay && !overlay.enabled ? 'disabled' : restricted.length ? 'restricted' : 'allowed';
  const reasons = [...prohibited.map((h) => h.reason), ...(overlay && !overlay.enabled ? [overlay.disabledReason ?? ''] : []), ...restricted.map((h) => h.reason)].filter(Boolean);
  const decl = declarationsOf(overlay, keys);
  for (const h of restricted) for (const x of POLICY_RULES.find((r) => r.key === h.key)?.declarations ?? []) if (!decl.some((y) => y.key === x.key)) decl.push(x);
  const fulfil = [...keys.map((k) => MODULE_BY_KEY[k].fulfilment).filter(Boolean), overlay?.fulfilment].filter(Boolean) as NonNullable<Overlay['fulfilment']>[];
  const allowed = (['ship', 'pickup'] as const).filter((o) => (fulfil.length ? fulfil : [BASE_FULFILMENT]).every((r) => r.allowed.includes(o)));
  const pickupOnly = fulfil.find((r) => r.pickupOnlyWhen);
  const ret = [...keys.map((k) => MODULE_BY_KEY[k].returns).filter(Boolean), overlay?.returns].filter(Boolean) as Overlay['returns'][];
  const strict = ret.find((r) => r.acceptsReturns === false) ?? ret[ret.length - 1] ?? { acceptsReturns: null, rule: 'The seller\'s own return terms apply.' };
  const questions = [...BASE_QUESTIONS, ...keys.flatMap((k) => MODULE_BY_KEY[k].questions), ...(overlay?.questions ?? [])];
  const checks = [...new Set(keys.flatMap((k) => MODULE_BY_KEY[k].checks ?? []))].map((k) => ({ key: k, how: CHECK_HOW[k] }));
  const fired = new Set(keys);
  return {
    profiles_version: PROFILES_VERSION,
    taxonomy_version: TAXONOMY_VERSION,
    category,
    cb_category: cbCategory,
    overlay: overlay ? {
      key: overlay.key, name: overlay.name, reviewed: overlay.reviewed, enabled: overlay.enabled, note: overlay.reviewed ? null : UNREVIEWED_NOTE,
      disabled_reason: overlay.enabled ? null : overlay.disabledReason ?? null, research: overlay.research, leaders: overlay.leaders,
    } : null,
    modules,
    may_apply: MODULES.filter((m) => !fired.has(m.key) && m.trigger.facts?.length).map((m) => ({ key: m.key, name: m.name, fires_when: m.trigger.text })),
    policy: { status, reasons },
    fields: {
      required: fields.filter((x) => x.requirement === 'required').map(fieldOut),
      conditional: fields.filter((x) => x.requirement === 'conditional').map(fieldOut),
      recommended: fields.filter((x) => x.requirement === 'recommended').map(fieldOut),
      feed: fields.filter((x) => x.requirement === 'feed').map(fieldOut),
    },
    declarations: decl.map((x) => ({ key: x.key, text: x.text, requirement: x.requirement, ...(x.whenText ? { when: x.whenText } : {}), source: x.source })),
    fulfilment: { allowed: [...allowed], note: fulfil.map((r) => r.note).join(' ') || BASE_FULFILMENT.note, ...(pickupOnly ? { pickup_only_when: 'Pickup only for cottage food from a home kitchen.' } : {}) },
    returns: { accepts_returns: strict.acceptsReturns, rule: strict.rule },
    questions: [...new Set(questions)],
    checks,
  };
}

/* ------------------------------------------------------------------ the labels the fact sheet uses */

/** Every profile field's label with its unit, by key: the fact sheet labels a spec key it knows from here. */
export const PROFILE_LABELS: Record<string, string> = (() => {
  // CB-980 (finding 5): no prototype, so a spec key such as 'constructor' finds no label.
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  const add = (x: ProfileField) => {
    if (x.path.startsWith('specs.') && !(x.key in out)) out[x.key] = x.unit ? `${x.label} (${x.unit})` : x.label;
  };
  BASE_FIELDS.forEach(add);
  MODULES.forEach((m) => m.fields.forEach(add));
  OVERLAYS.forEach((o) => o.fields.forEach(add));
  return out;
})();

/** The keys a fact sheet never shows: private fields (serials, report numbers, IMEI), on file until a buyer pays. */
export const PRIVATE_KEYS: ReadonlySet<string> = new Set(
  [...MODULES.flatMap((m) => m.fields), ...OVERLAYS.flatMap((o) => o.fields)].filter((x) => x.private && x.path.startsWith('specs.')).map((x) => x.key),
);

/** Every declaration's text by key (modules, overlays and policy rules). */
export const DECLARATION_TEXT: Record<string, string> = (() => {
  // CB-980 (finding 5): no prototype, so a stored declaration key such as 'constructor' finds no text.
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const x of [...MODULES.flatMap((m) => m.declarations), ...OVERLAYS.flatMap((o) => o.declarations), ...POLICY_RULES.flatMap((r) => r.declarations ?? [])]) out[x.key] ??= x.text;
  return out;
})();

/* ------------------------------------------------------------------ the rules for the database */

const PHRASE_RE = /^[a-z0-9][a-z0-9 -]*$/;
function checkCondition(c: Condition): void {
  if ('all' in c) return c.all.forEach(checkCondition);
  if ('any' in c) return c.any.forEach(checkCondition);
  if (c.op === 'words') for (const p of c.value) if (!PHRASE_RE.test(p)) throw new Error(`profile words: ${p}`);
}

const cField = (x: ProfileField) => ({ key: x.key, label: x.label, path: x.path, requirement: x.requirement, ...(x.unit ? { unit: x.unit } : {}), ...(x.when ? { when: x.when } : {}) });
const cDecl = (x: Declaration) => ({ key: x.key, label: x.text, requirement: x.requirement, ...(x.when ? { when: x.when } : {}) });

/**
 * The rules as JSON for listing_profile_rules (migration 191), loaded by scripts/load-taxonomy.mjs --profiles. The
 * database evaluates them with listing_profile_eval(); qa/cb977-listing-profiles.mjs proves both engines agree.
 */
export function compileRules() {
  for (const r of POLICY_RULES) for (const p of r.words) if (!PHRASE_RE.test(p)) throw new Error(`policy words: ${p}`);
  const conds: Condition[] = [
    ...BASE_FIELDS.flatMap((x) => (x.when ? [x.when] : [])),
    ...MODULES.flatMap((m) => [...m.fields, ...m.declarations, ...(m.refusals ?? [])].flatMap((x) => (x.when ? [x.when] : [])).concat(m.trigger.facts ?? [])),
    ...OVERLAYS.flatMap((o) => [...o.fields, ...o.declarations, ...(o.refusals ?? [])].flatMap((x) => (x.when ? [x.when] : []))),
  ];
  conds.forEach(checkCondition);
  return {
    version: PROFILES_VERSION,
    taxonomy_version: TAXONOMY_VERSION,
    policy: POLICY_RULES.map((r) => ({ key: r.key, kind: r.kind, reason: policyReason(r), under: r.under, words: r.words, declarations: (r.declarations ?? []).map(cDecl) })),
    base: { fields: BASE_FIELDS.map(cField) },
    modules: MODULES.map((m) => ({
      key: m.key,
      trigger: { under: m.trigger.under ?? [], attributes: m.trigger.attributes ?? [], facts: m.trigger.facts ?? [] },
      fields: m.fields.map(cField), declarations: m.declarations.map(cDecl), refusals: (m.refusals ?? []).map((x) => ({ key: x.key, when: x.when, reason: x.reason })),
    })),
    overlays: OVERLAYS.map((o) => ({
      key: o.key, enabled: o.enabled, reviewed: o.reviewed, disabled_reason: o.disabledReason ?? null, under: o.under, cb_keys: o.cbKeys, modules: o.modules,
      fields: o.fields.map(cField), declarations: o.declarations.map(cDecl), refusals: (o.refusals ?? []).map((x) => ({ key: x.key, when: x.when, reason: x.reason })),
    })),
  };
}
export type CompiledRules = ReturnType<typeof compileRules>;

/* ------------------------------------------------------------------ the CPSC recall check */

export interface RecallCheck {
  query: string;
  checked_at: string;
  status: 'clear' | 'possible_match' | 'unavailable';
  matches: Array<{ recall_number: string; date: string; title: string; url: string; products: string[] }>;
  source: string;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * The CPSC recall search (saferproducts.gov, JSON, no key) by product name and, when given, the model. A match is a
 * possible match: the seller or the agent compares the model and the dates, and a recalled item is refused. The fetch
 * is the caller's (the API passes the platform fetch; the QA suite passes a mock).
 */
export async function cpscRecallCheck(name: string, model: string | null, fetchImpl: FetchLike, now: Date = new Date(), timeoutMs = 6000): Promise<RecallCheck> {
  const query = [name, model].filter(Boolean).join(' ').trim().slice(0, 120);
  const base = 'https://www.saferproducts.gov/RestWebServices/Recall';
  const url = `${base}?format=json&ProductName=${encodeURIComponent(name.trim().slice(0, 80))}${model ? `&ProductModel=${encodeURIComponent(model.trim().slice(0, 60))}` : ''}`;
  const out: RecallCheck = { query, checked_at: now.toISOString(), status: 'unavailable', matches: [], source: base };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetchImpl(url, { signal: ctrl.signal, headers: { accept: 'application/json' } }).finally(() => clearTimeout(t));
    if (!r.ok) return out;
    const rows = (await r.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return out;
    out.matches = rows.slice(0, 10).map((x) => ({
      recall_number: String(x.RecallNumber ?? ''),
      date: String(x.RecallDate ?? '').slice(0, 10),
      title: String(x.Title ?? ''),
      url: String(x.URL ?? ''),
      products: Array.isArray(x.Products) ? (x.Products as Array<Record<string, unknown>>).map((p) => String(p.Name ?? '')).filter(Boolean).slice(0, 5) : [],
    }));
    out.status = out.matches.length ? 'possible_match' : 'clear';
    return out;
  } catch {
    return out;
  }
}
