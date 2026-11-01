/**
 * CB-977 (SPEC-131): policy 06 (docs/policies/06-prohibited-goods.md) mapped to Shopify nodes and title words. This
 * makes real the line the policy listed under Changes coming: "A check at import will refuse a prohibited category
 * before the product is saved." A prohibited rule refuses the product with the policy line as the reason; a restricted
 * rule refuses it until the declarations it names are present. Words match whole words or phrases in the title, in
 * lower case; they are kept narrow on purpose (a "heat gun" is a tool, "ivory" and "tobacco" are colours, a "whiskey
 * glass" is glassware, a "Firework Stone" is a crystal on the live catalog), and alcohol, tobacco and medicine are refused by their Shopify node. A seller refused by a word
 * in error writes to hello@commercebook.ai, and the word list is corrected. Over-the-counter medicine (hb-1-16) carries an approved
 * label and is not refused here; prescription goods are refused by the device module and the words.
 * Pure: no I/O.
 */
import { d } from './base.js';
import type { PolicyRule } from './types.js';

export const POLICY_RULES: PolicyRule[] = [
  {
    key: 'weapons_explosives',
    kind: 'prohibited',
    policy: 'Firearms, firearm parts, ammunition, explosives and fireworks.',
    under: ['ma-2', 'ae-3-2-14', 'ha-6-18-2'],
    words: ['firearm', 'firearms', 'handgun', 'handguns', 'rifle', 'rifles', 'shotgun', 'shotguns', 'ammunition', 'ammo', 'gunpowder', 'fireworks', 'firecrackers', 'explosives', 'stun gun', 'taser', 'brass knuckles'],
  },
  {
    key: 'drugs',
    kind: 'prohibited',
    policy: 'Controlled substances, prescription drugs, and products that claim to treat a disease without an approved label.',
    under: ['fb-4', 'ap-2-42-11'],
    words: ['prescription drug', 'prescription drugs', 'prescription only', 'rx only', 'controlled substance', 'cannabis', 'marijuana', 'thc', 'cbd', 'kratom', 'psilocybin', 'opioid'],
  },
  {
    key: 'tobacco_alcohol',
    kind: 'prohibited',
    policy: 'Tobacco, nicotine and vaping products, and alcohol.',
    under: ['fb-3', 'fb-1-1', 'fb-2-8-1', 'fb-2-8-2'],
    words: ['chewing tobacco', 'pipe tobacco', 'cigarette', 'cigarettes', 'cigars', 'nicotine', 'vape', 'vapes', 'e-cigarette', 'e-cigarettes', 'e-liquid'],
  },
  {
    key: 'live_animals',
    kind: 'prohibited',
    policy: 'Live animals, animal parts from protected species, and human remains.',
    under: ['ap-1'],
    words: ['live animal', 'live animals', 'elephant ivory', 'rhino horn', 'real tortoiseshell', 'human remains', 'human skull'],
  },
  {
    key: 'data_and_gift_cards',
    kind: 'prohibited',
    policy: 'Personal data, accounts, access codes and gift cards.',
    under: ['gc', 'so-2-3'],
    words: ['gift card', 'gift cards', 'account login', 'access code', 'activation code', 'email list'],
  },
  {
    key: 'licensed_hazmat',
    kind: 'prohibited',
    policy: 'Hazardous materials that need a licensed carrier: classes 1, 2.3, 6.1 inhalation hazard and 7.',
    under: [],
    words: ['radioactive', 'uranium', 'tritium', 'chlorine gas', 'phosphine', 'cyanide'],
  },
  {
    key: 'adult',
    kind: 'prohibited',
    policy: 'Adult products: the product is kept off the public pages and the feeds and is readable only by a signed-in shopper who asked for the category.',
    under: ['ma-1'],
    words: [],
  },
  {
    key: 'perishable_food',
    kind: 'restricted',
    policy: 'Perishable food: the product states the best-by date and the storage condition, and returns are excluded.',
    under: ['fb'],
    words: [],
    declarations: [
      d('food_returns_excluded', 'Returns are excluded on this food product.', 'Policy 06 (perishable food: returns are excluded)'),
    ],
  },
  {
    key: 'other_hazmat',
    kind: 'restricted',
    policy: 'Other hazardous materials (aerosols, flammable liquids, lithium batteries, corrosives): the product states the hazard class, and the offer is pickup only or ground shipping by a carrier that accepts the class.',
    under: ['ha-1-1', 'hg-10-11-3', 'bi-23-3', 'bi-23-1', 'hg-18-1-7', 'co-4-1-3'],
    words: ['aerosol', 'flammable', 'corrosive', 'lithium battery', 'lithium batteries'],
    declarations: [
      d('hazmat_stated', 'The hazard class I stated comes from the safety data sheet, and the offer is pickup only or ground shipping by a carrier that accepts the class.', 'Policy 06 (restricted: other hazardous materials)'),
    ],
  },
  {
    key: 'otc_devices',
    kind: 'restricted',
    policy: 'Medical devices sold over the counter: the product states the model and the expiry where there is one.',
    under: [],
    words: ['medical device'],
    declarations: [
      d('device_claims', 'The listing uses "cleared" and "approved" accurately, shows no FDA logo and claims nothing beyond the label.', 'FDA; policy 06'),
    ],
  },
];

/**
 * The adult rule is prohibited here although policy 06 lists adult products as restricted: its condition (kept off the
 * public pages and the feeds, readable only by a signed-in shopper who asked) is not built, so the check refuses them
 * until it is. The reason a seller reads says so.
 */
export const ADULT_REASON = 'Adult products need a signed-in-only display, which CommerceBook does not offer today. Policy 06 lists them as restricted to that display.';

export const POLICY_BY_KEY: Record<string, PolicyRule> = Object.fromEntries(POLICY_RULES.map((r) => [r.key, r]));
