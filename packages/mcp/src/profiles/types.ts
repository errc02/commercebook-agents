/**
 * CB-977 (SPEC-131): the types of the listing profiles. A profile is data: the base profile every listing carries, the
 * trait modules a category or a product's own facts turn on, and the category overlays. One source
 * (packages/commercebook-mcp/src/profiles/) feeds five consumers: the listing form, the fact sheet, the agent's profile
 * read, the import and publish check (through the compiled rules the database reads) and the feeds.
 * Pure: no imports and no I/O.
 */

/** The value of a fact as the engine reads it. */
export type FactValue = string | number | boolean | null | undefined | FactValue[] | { [k: string]: FactValue };

/**
 * Where a fact lives. The engine and the database read the same paths:
 *   product.<column>   title, description, brand, gtin, mpn, model
 *   specs.<key>        a Shopify attribute handle or an overlay key with the cb_ prefix
 *   lot.<column>       condition_grade, goods_kind, photos (a count), known_defects, large_item, qty_on_hand,
 *                      dims.weight_lb, dims.length_in, dims.width_in, dims.height_in
 *   documents.<kind>   the count of the product's documents of that kind (spec_sheet, certificate, test_report, manual,
 *                      safety_data, other)
 *   declarations.<key> true when the seller affirmed it
 *   category           the Shopify category id (for the under operator)
 *   cb_category        the CommerceBook category key
 *   text               the title and the description (for the words operator)
 */
export type FactPath = string;

/** A test on the facts. Each operator has the same meaning in the engine and in listing_profile_eval() (migration 191). */
export type Condition =
  | { path: FactPath; op: 'present' | 'absent' | 'true' }
  | { path: FactPath; op: 'eq' | 'neq'; value: string | number | boolean }
  | { path: FactPath; op: 'in'; value: Array<string | number> }
  | { path: FactPath; op: 'lt' | 'gte'; value: number }
  | { path: 'category'; op: 'under'; value: string[] }
  | { path: 'text'; op: 'words'; value: string[] }
  /** CB-997 (SPEC-144): holds when the value is not a valid UPC, EAN or GTIN-14 (isValidGtin; gtin_valid() in SQL). */
  | { path: FactPath; op: 'no_valid_gtin' }
  | { all: Condition[] }
  | { any: Condition[] };

export type FieldType = 'text' | 'number' | 'integer' | 'decimal' | 'enum' | 'multi' | 'boolean' | 'date' | 'document' | 'images';

/**
 * required: publishing waits for it. conditional: publishing waits for it while `when` holds. recommended: shown and
 * asked, never blocking. feed: Google Merchant Center or the ACP feed needs it; CommerceBook publishes without it.
 */
export type Requirement = 'required' | 'conditional' | 'recommended' | 'feed';

export interface ProfileField {
  /** The stored key: a Shopify attribute handle, an overlay key (cb_), a column name or a document kind. */
  key: string;
  /** Where the value lives (see FactPath). */
  path: FactPath;
  label: string;
  type: FieldType;
  /** The unit the value is stated in, shown beside the label ("in", "lb", "ct", "psi"). */
  unit?: string;
  /** The allowed values of an enum or multi field, in the order the form lists them. */
  values?: string[];
  requirement: Requirement;
  /** For a conditional field: when publishing waits for it. */
  when?: Condition;
  /** The condition in plain words, for the agent and the form ("when the item has an hour meter"). */
  whenText?: string;
  /** product or lot: product facts describe what the thing is; lot facts describe the unit being sold. */
  scope: 'product' | 'lot';
  /** Kept private until purchase (serial numbers, report numbers). The fact sheet shows that it is on file. */
  private?: boolean;
  /** A short help line for the form and the agent. */
  help?: string;
  /** Where the field comes from (the research record's source column). */
  source: string;
}

export interface Declaration {
  key: string;
  /** The words the seller affirms, shown beside a checkbox and on the fact sheet. */
  text: string;
  requirement: 'required' | 'conditional';
  when?: Condition;
  whenText?: string;
  source: string;
}

/** The fulfilment a profile allows: ship (a carrier) and pickup, the two options of an offer. */
export interface FulfilmentRule {
  allowed: Array<'ship' | 'pickup'>;
  /** Pickup only while this holds (cottage food). */
  pickupOnlyWhen?: Condition;
  note: string;
}

export interface ReturnRule {
  /** false: returns are excluded by rule; null: the seller's own terms apply. */
  acceptsReturns: boolean | null;
  rule: string;
}

/** A refusal a profile applies to a product's own facts (an Rx device, a recalled toy, an inhalation hazard). */
export interface Refusal {
  key: string;
  when: Condition;
  reason: string;
}

export type ModuleKey =
  | 'titled'
  | 'serialised'
  | 'graded_or_authenticated'
  | 'regulated_child'
  | 'regulated_food'
  | 'regulated_device'
  | 'hazmat'
  | 'sized'
  | 'freight';

/** The tests that turn a module on. Any one test is enough. */
export interface Trigger {
  /** The category sits under one of these Shopify ids. */
  under?: string[];
  /** The category carries one of these Shopify attributes. */
  attributes?: string[];
  /** A fact of the product or the lot holds. */
  facts?: Condition[];
  /** The plain-words rule (research record, section 5). */
  text: string;
}

export interface TraitModule {
  key: ModuleKey;
  name: string;
  trigger: Trigger;
  fields: ProfileField[];
  declarations: Declaration[];
  refusals?: Refusal[];
  fulfilment?: FulfilmentRule;
  returns?: ReturnRule;
  questions: string[];
  /** Checks the agent or the form runs before listing (cpsc_recall). */
  checks?: CheckKey[];
}

export type CheckKey = 'cpsc_recall';

export interface Overlay {
  key: string;
  name: string;
  /** The research record's rank (section 5); 0 for the warehouse supplies of the founding use. */
  rank: number;
  /** false: written from the research and not yet reviewed; the fact sheet and the agent say so. */
  reviewed: boolean;
  /** false: defined, and refused at import until the ruling named in disabledReason. */
  enabled: boolean;
  disabledReason?: string;
  /** The Shopify ids the overlay covers; the longest match wins across overlays. */
  under: string[];
  /** The CommerceBook category keys the overlay covers. */
  cbKeys: string[];
  /** The node a plain description resolves to when no closer node is named. */
  defaultNode: string;
  /** Plain words that point to this overlay ("forklift", "gia", "tape"), and the node each points to when it is closer. */
  words: Array<{ words: string[]; node?: string }>;
  /** Modules on whenever the overlay applies. */
  modules: ModuleKey[];
  fields: ProfileField[];
  declarations: Declaration[];
  refusals?: Refusal[];
  fulfilment: FulfilmentRule;
  returns: ReturnRule;
  questions: string[];
  leaders: string[];
  /** The research record's section for the overlay. */
  research: string;
}

export interface PolicyRule {
  key: string;
  kind: 'prohibited' | 'restricted';
  /** The line of docs/policies/06-prohibited-goods.md the rule applies, verbatim. */
  policy: string;
  under: string[];
  /** Whole words or phrases in the title that point to the rule (lower case). */
  words: string[];
  /** For a restricted rule: the declarations the product carries before it can be saved. */
  declarations?: Declaration[];
}
