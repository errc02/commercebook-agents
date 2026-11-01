/**
 * CB-977 (SPEC-131): the base profile (research record, section 3) and the field helpers the modules and overlays use.
 * Every listing in every category carries the base profile. The base fields that publishing waits for are the ones
 * CommerceBook already required before this card (title, condition, price, a photo); the fields Google Merchant Center
 * or the ACP feed needs are marked feed, so the agent asks for them and the product still publishes without them.
 * Pure: no I/O.
 */
import type { Condition, Declaration, FieldType, ProfileField, Requirement } from './types.js';

/** The fact path of a spec key (a Shopify handle or a cb_ key). */
export const spec = (key: string): string => `specs.${key}`;

interface FieldOpts {
  unit?: string;
  values?: string[];
  when?: Condition;
  whenText?: string;
  scope?: 'product' | 'lot';
  private?: boolean;
  help?: string;
  path?: string;
}

/** A field kept in specs under its key. */
export function f(key: string, label: string, type: FieldType, requirement: Requirement, source: string, o: FieldOpts = {}): ProfileField {
  return {
    key,
    path: o.path ?? spec(key),
    label,
    type,
    ...(o.unit ? { unit: o.unit } : {}),
    ...(o.values ? { values: o.values } : {}),
    requirement: o.when && requirement === 'required' ? 'conditional' : requirement,
    ...(o.when ? { when: o.when } : {}),
    ...(o.whenText ? { whenText: o.whenText } : {}),
    scope: o.scope ?? 'product',
    ...(o.private ? { private: true } : {}),
    ...(o.help ? { help: o.help } : {}),
    source,
  };
}

/** A declaration the seller affirms. */
export function d(key: string, text: string, source: string, when?: Condition, whenText?: string): Declaration {
  return when ? { key, text, requirement: 'conditional', when, ...(whenText ? { whenText } : {}), source } : { key, text, requirement: 'required', source };
}

/** Conditions in short form. */
export const has = (path: string): Condition => ({ path, op: 'present' });
export const isTrue = (path: string): Condition => ({ path, op: 'true' });
export const eq = (path: string, value: string | number | boolean): Condition => ({ path, op: 'eq', value });
export const oneOf = (path: string, value: Array<string | number>): Condition => ({ path, op: 'in', value });
export const under = (...ids: string[]): Condition => ({ path: 'category', op: 'under', value: ids });
export const words = (...w: string[]): Condition => ({ path: 'text', op: 'words', value: w });
export const all = (...c: Condition[]): Condition => ({ all: c });
export const any = (...c: Condition[]): Condition => ({ any: c });

/** The goods kinds (market_lots.goods_kind) and the condition grades of the product data template. */
export const GOODS_KINDS = ['new', 'used', 'surplus'] as const;
export const CONDITION_GRADES = ['new', 'open_box', 'used', 'refurbished', 'defective'] as const;

/** The base profile: every listing, every category (research record, section 3). */
export const BASE_FIELDS: ProfileField[] = [
  f('title', 'Title', 'text', 'required', 'Google spec; ACP', { path: 'product.title', help: 'Up to 150 characters.' }),
  f('description', 'Description', 'text', 'feed', 'Google; ACP', { path: 'product.description', help: 'Up to 5,000 characters of plain text.' }),
  f('brand', 'Brand', 'text', 'feed', 'Google', { path: 'product.brand', help: 'Up to 70 characters. Google needs it for new goods except books and media. Leave it blank when the item has no brand.' }),
  f('gtin', 'GTIN (UPC, EAN or ISBN)', 'text', 'feed', 'Google; ACP', { path: 'product.gtin', help: '8, 12, 13 or 14 digits with a valid check digit, when one exists.' }),
  f('mpn', 'Manufacturer part number', 'text', 'feed', 'Google; ACP', { path: 'product.mpn', help: 'Up to 70 characters. Google needs it with the brand when there is no GTIN.' }),
  f('model', 'Model', 'text', 'recommended', 'schema.org model', { path: 'product.model' }),
  f('condition_grade', 'Condition', 'enum', 'required', 'Google; ACP; schema.org', { path: 'lot.condition_grade', scope: 'lot', values: [...CONDITION_GRADES] }),
  f('grading_definition', 'What the grade means', 'text', 'conditional', 'Leaders below', {
    path: 'lot.grading_definition', scope: 'lot', when: oneOf('lot.goods_kind', ['used']), whenText: 'for used goods',
  }),
  f('known_defects', 'Known defects', 'text', 'conditional', 'Policy 06', {
    path: 'lot.known_defects', scope: 'lot', when: eq('lot.condition_grade', 'defective'), whenText: 'when the item is sold as defective',
  }),
  f('photos', 'Photos', 'images', 'required', 'Google', { path: 'lot.photos', scope: 'lot', help: 'At least one photo, 500 x 500 px or larger. Used goods show the actual unit.' }),
  f('weight_lb', 'Package weight', 'decimal', 'recommended', 'ACP; Google', { path: 'lot.dims.weight_lb', scope: 'lot', unit: 'lb' }),
  f('length_in', 'Package length', 'decimal', 'recommended', 'ACP; Google', { path: 'lot.dims.length_in', scope: 'lot', unit: 'in' }),
  f('width_in', 'Package width', 'decimal', 'recommended', 'ACP; Google', { path: 'lot.dims.width_in', scope: 'lot', unit: 'in' }),
  f('height_in', 'Package height', 'decimal', 'recommended', 'ACP; Google', { path: 'lot.dims.height_in', scope: 'lot', unit: 'in' }),
  f('cb_warranty', 'Warranty', 'text', 'recommended', 'Google', { help: 'For example 3 years, or none.' }),
  f('cb_source_statement', 'Where the goods came from', 'enum', 'recommended', 'Policy 06', {
    values: ['retailer_return', 'overstock', 'closeout', 'other'], help: 'Policy 06 asks for it on branded goods in quantity.',
  }),
];

/** The shipping rule every profile starts from: a carrier or pickup, as the offer allows. */
export const BASE_FULFILMENT = { allowed: ['ship', 'pickup'] as Array<'ship' | 'pickup'>, note: 'Ship by carrier or offer pickup, as the offer sets.' };
