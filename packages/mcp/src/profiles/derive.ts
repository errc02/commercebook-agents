/**
 * CB-985 (SPEC-135): the CommerceBook category key derived from a Shopify category. The seller picks one category on the
 * Add a product sheet (the taxonomy search); the key the older parts of the site still read (the categories table's
 * spec_fields for the 21 warehouse keys, request matching by category, the Browse chips, the default return terms) is
 * derived here and stored with the product, so no second control asks for it.
 *
 * The rule, the reverse of CB_CATEGORY_NODES (migration 191's taxonomy_cb_category_map, unchanged):
 *   1. Walk from the picked node up through its ancestors (aa-6-9, aa-6, aa) and stop at the first one that a key maps to.
 *   2. One key at that node: that key.
 *   3. Several keys at that node (Packing Materials os-14-2 carries five): the key whose words appear in the seller's
 *      words (what was typed to find the category, and the title); else the node's primary key (CB_KEY_PRIMARY).
 *   4. No ancestor maps to a key (Electronics, Furniture, Food other than tea): other.
 * Pure: no I/O. The database map is not changed and needs no reverse function: the form sends the derived key as the
 * record's category beside the node, and the product trigger keeps the node it is sent.
 */
import { hasWords } from './engine.js';
import { CB_CATEGORY_NODES } from './overlays.js';

/** The key a shared node takes when the seller's words name none of its keys. */
export const CB_KEY_PRIMARY: Record<string, string> = {
  'os-14-2': 'packaging',
  'hg-10-6': 'cleaning',
  'bi-18': 'equipment',
  bi: 'business_industrial',
};

/** The words that pick one key among the keys of a shared node. */
export const CB_KEY_WORDS: Record<string, readonly string[]> = {
  stretch_film: ['stretch film', 'stretch wrap', 'pallet wrap', 'shrink wrap', 'hand wrap', 'machine wrap'],
  poly_bags: ['poly bag', 'poly bags', 'plastic bag', 'plastic bags', 'zip bag', 'zip bags', 'reclosable bag', 'reclosable bags'],
  kraft_paper: ['kraft paper', 'kraft', 'packing paper', 'butcher paper'],
  mailers: ['mailer', 'mailers', 'padded envelope', 'padded envelopes', 'bubble mailer', 'bubble mailers', 'poly mailer', 'poly mailers'],
  cleaning_supplies: [],
  material_handling: ['hand truck', 'pallet jack', 'dolly', 'dollies', 'material handling'],
  maintenance_supplies: ['maintenance', 'repair supplies', 'mro'],
};

/** The parent of a Shopify id (aa-6-9 to aa-6, aa to null). */
const parentOf = (id: string): string | null => (id.includes('-') ? id.slice(0, id.lastIndexOf('-')) : null);

/** The keys that map to exactly this node, in the order of CB_CATEGORY_NODES (the warehouse keys first). */
export function keysAtNode(node: string): string[] {
  return Object.entries(CB_CATEGORY_NODES).filter(([, n]) => n === node).map(([k]) => k);
}

/**
 * The CommerceBook key for a picked Shopify node. words are the seller's own words (the search text and the title); they
 * decide only between keys that share one node. Answers 'other' when no ancestor of the node maps to a key.
 */
export function cbKeyForNode(node: string | null | undefined, words = ''): string {
  for (let at = (node ?? '').trim() || null; at; at = parentOf(at)) {
    const keys = keysAtNode(at);
    if (keys.length === 0) continue;
    if (keys.length === 1) return keys[0] as string;
    const named = keys.find((k) => (CB_KEY_WORDS[k] ?? []).length > 0 && hasWords(words, CB_KEY_WORDS[k] as readonly string[]));
    return named ?? CB_KEY_PRIMARY[at] ?? (keys[0] as string);
  }
  return 'other';
}

/** The node a key maps to (the edit sheet's suggestion for an older product with a key and no node); null for none. */
export function nodeForCbKey(key: string | null | undefined): string | null {
  const k = (key ?? '').trim();
  return k && Object.hasOwn(CB_CATEGORY_NODES, k) ? (CB_CATEGORY_NODES[k] ?? null) : null;
}
