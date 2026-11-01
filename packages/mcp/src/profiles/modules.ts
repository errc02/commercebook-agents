/**
 * CB-977 (SPEC-131): the nine trait modules (research record, sections 1 and 5). Each module is one reusable block of
 * fields, declarations, refusals, questions and rules. A module turns on from data, never from memory: the category's
 * place in the Shopify tree, the attributes Shopify gives the category, or the product's own facts (a VIN, a serial, a
 * battery, the large-item flag). Overlays turn modules on as well.
 * Pure: no I/O.
 */
import { all, d, eq, f, has, isTrue, oneOf, spec, under, words } from './base.js';
import type { ModuleKey, TraitModule } from './types.js';

/** eBay Authenticity Guarantee categories (research record 4.3, 4.4): watches, jewelry, cards, sneakers, handbags, coins. */
export const AUTHENTICITY_NODES = ['aa-6', 'ae-2-2-3', 'aa-8-8', 'aa-5-4', 'ae-2-2-2'];
/** The CPSC durable infant and toddler goods that need a manufacture date (Resellers Guide). */
export const DURABLE_INFANT_NODES = ['fr-1', 'bt-6', 'bt-3', 'bt-9'];

export const MODULES: TraitModule[] = [
  {
    key: 'titled',
    name: 'Titled goods',
    trigger: { under: ['vp-2'], facts: [has(spec('cb_vin')), has(spec('cb_hin'))], text: 'The category is under Vehicles (vp-2), or the product carries a VIN or a HIN.' },
    fields: [
      f('cb_title_status', 'Title status', 'enum', 'required', 'eBay community; NMVTIS', { values: ['clean', 'salvage', 'rebuilt', 'flood', 'junk', 'other_brand', 'no_title'] }),
      f('cb_title_brand_text', 'Title brand as written', 'text', 'required', 'NMVTIS', {
        when: oneOf(spec('cb_title_status'), ['salvage', 'rebuilt', 'flood', 'junk', 'other_brand']), whenText: 'when the title is branded',
      }),
      f('cb_title_in_seller_name', 'Title in your name and in hand', 'boolean', 'required', 'BaT seller guidance (secondary)'),
      f('cb_lien', 'A loan is open on it', 'boolean', 'required', 'Owner fact'),
      f('cb_lien_lender', 'Lender', 'text', 'required', 'Owner fact', { when: isTrue(spec('cb_lien')), whenText: 'when a loan is open' }),
    ],
    declarations: [
      d('titled_authority', 'I hold the title to this item or the authority to sell it, and the title status I stated is the one on the title.', 'Policy 06 (goods the seller does not hold title to are prohibited); NMVTIS'),
    ],
    returns: { acceptsReturns: false, rule: 'Final sale. The condition is backed by the listing\'s disclosures.' },
    questions: ['Is the title in your name and in hand? Is it clean or branded, and with which brand?', 'Is there a loan on it, and with which lender?'],
  },
  {
    key: 'serialised',
    name: 'Serialised goods',
    trigger: {
      under: ['vp-2', 'bi-11', 'bi-18-1', 'aa-6-11', 'el-4-8-5', 'el-4-8-6', 'ae-2-8'],
      facts: [has(spec('cb_serial_number')), has(spec('cb_imei'))],
      text: 'The value depends on one unit (vehicles, machinery, watches, phones, instruments), or the seller supplies a serial or an IMEI.',
    },
    fields: [
      f('cb_serial_number', 'Serial number', 'text', 'required', 'Ritchie Bros listings; Reverb; Swappa', {
        private: true, help: 'Kept private until a buyer pays. Write "not legible" when the plate cannot be read.',
      }),
    ],
    declarations: [],
    questions: ['What is the serial number on the data plate? Send a photo of the plate. I keep the number private until a buyer pays.'],
  },
  {
    key: 'graded_or_authenticated',
    name: 'Graded or authenticated goods',
    trigger: {
      under: AUTHENTICITY_NODES,
      attributes: ['grading', 'artwork-authenticity', 'autograph-authentication', 'authenticity'],
      text: 'The category has a Grading or Artwork authenticity attribute, or sits in an eBay Authenticity Guarantee category (watches, jewelry, cards, sneakers, handbags, coins).',
    },
    fields: [
      f('cb_authentication', 'Authentication', 'enum', 'required', 'eBay Authenticity Guarantee; GPT model', { values: ['none', 'seller_evidence', 'third_party_report', 'graded'] }),
      f('cb_report_issuer', 'Grader or lab', 'text', 'required', 'GIA; PSA; CGC; Beckett', {
        when: oneOf(spec('cb_authentication'), ['third_party_report', 'graded']), whenText: 'when a report or a grade exists',
      }),
      f('cb_report_number', 'Report or certificate number', 'text', 'required', 'GIA report check; PSA cert pages', {
        private: true, when: oneOf(spec('cb_authentication'), ['third_party_report', 'graded']), whenText: 'when a report or a grade exists',
        help: 'Kept private until a buyer pays: forgers reuse real certificate numbers.',
      }),
    ],
    declarations: [
      d('genuine', 'The item is genuine, and I disclosed every alteration, repair and replaced part I know of.', 'Policy 06 (counterfeit goods are prohibited); eBay Authenticity Guarantee'),
    ],
    questions: ['Is it graded or does it carry a lab report? Which grader or lab, and the certificate number? I verify it and keep it private until a buyer pays.', 'Any alteration, repair or replaced part that you know of?'],
  },
  {
    key: 'regulated_child',
    name: 'Children\'s products',
    trigger: {
      under: ['bt'],
      attributes: ['recommended-age-group'],
      facts: [{ path: 'specs.cb_disclosures', op: 'present' }],
      text: 'The category has a Recommended age group attribute, sits under Baby & Toddler (bt), or the product carries a CPSC disclosure.',
    },
    fields: [
      f('cb_age_grade', 'Age grade from the label', 'text', 'required', 'Shopify; CPSC', { help: 'The maker\'s range, for example 6 months and up.' }),
      f('cb_childrens_product', 'Made for children 12 or younger', 'boolean', 'required', 'CPSC CPC page'),
      f('cb_manufacture_date', 'Manufacture month and year', 'text', 'required', 'CPSC Resellers Guide', {
        when: { path: 'category', op: 'under', value: DURABLE_INFANT_NODES }, whenText: 'for cribs, car seats, strollers and other durable infant goods', help: 'From the label, for example 2023-04.',
      }),
      f('cb_manufacture_year', 'Manufacture year', 'integer', 'recommended', 'CPSC Resellers Guide'),
      f('cb_tracking_label', 'Tracking label present', 'boolean', 'recommended', 'CPSIA section 103'),
      f('cb_recall_status', 'Recall check', 'enum', 'required', 'CPSC Recalls API (saferproducts.gov)', {
        values: ['clear', 'recalled', 'repaired_under_recall'], help: 'The agent or the form runs the CPSC recall check before listing.',
      }),
      f('cb_recall_checked_at', 'Recall checked on', 'date', 'recommended', 'CPSC Recalls API'),
      f('certificate', 'Children\'s Product Certificate', 'document', 'required', 'CPSC CPC page', {
        path: 'documents.certificate', when: all(eq('lot.goods_kind', 'new'), oneOf(spec('cb_seller_role'), ['maker', 'importer'])), whenText: 'for new goods from the maker or importer',
      }),
      f('cb_seller_role', 'You are the', 'enum', 'recommended', 'CPSC CPC page', { values: ['maker', 'importer', 'reseller'] }),
      f('cb_registration_card', 'Registration card included', 'boolean', 'recommended', '16 CFR 1130'),
      f('cb_disclosures', 'Warnings on the package', 'multi', 'recommended', 'Shopify disclosures file', {
        values: ['us-cpsc-choking_small_parts', 'us-cpsc-choking_balloons', 'us-cpsc-choking_marbles', 'us-cpsc-choking_small_balls'],
      }),
    ],
    declarations: [
      d('child_not_recalled', 'This product is not under a CPSC recall, or the recall remedy was applied, and it meets the lead limits for children\'s products.', 'CPSC Resellers Guide; 16 CFR 1500'),
    ],
    refusals: [
      { key: 'recalled', when: eq(spec('cb_recall_status'), 'recalled'), reason: 'Recalled goods cannot be listed (policy 06, and the CPSC rule for resellers).' },
      { key: 'crib_before_2011', when: all(under('fr-1-6'), { path: spec('cb_manufacture_year'), op: 'lt', value: 2011 }), reason: 'Cribs made before June 2011 cannot be resold (CPSC Resellers Guide).' },
    ],
    checks: ['cpsc_recall'],
    questions: [
      'What are the brand, the model and the manufacture date on the label? Send a photo of the label.',
      'Are all parts, the instructions and the registration card present?',
      'Any crash or damage history?',
      'For new goods in quantity: do you hold the Children\'s Product Certificate and the lab report?',
    ],
  },
  {
    key: 'regulated_food',
    name: 'Food',
    trigger: {
      under: ['fb', 'ap-2-1-3', 'ap-2-1-7', 'ap-2-2-1', 'ap-2-2-6', 'ap-2-3-3', 'ap-2-3-9', 'ap-2-4-16', 'ap-2-46-1', 'ap-2-47-2', 'ap-2-47-5'],
      text: 'The category is under Food & Beverages (fb), or it is pet food under Animals & Pet Supplies.',
    },
    fields: [
      f('cb_net_quantity', 'Net quantity', 'text', 'required', '21 CFR 101', { help: 'Weight, volume or count, as on the label.' }),
      f('ingredients', 'Ingredients', 'text', 'required', '21 CFR 101.4', { help: 'In descending order by weight, as on the label.' }),
      f('cb_allergens', 'Major food allergens', 'multi', 'required', 'FDA allergens page', {
        values: ['none', 'milk', 'eggs', 'fish', 'crustacean_shellfish', 'tree_nuts', 'peanuts', 'wheat', 'soybeans', 'sesame'],
      }),
      f('cb_maker_name_address', 'Maker or packer name and address', 'text', 'required', '21 CFR 101'),
      f('cb_nutrition_facts', 'Nutrition facts', 'enum', 'required', 'Extension guides', { values: ['on_label', 'exempt_small_business'] }),
      f('cb_best_by', 'Best-by date', 'date', 'required', 'Policy 06', { scope: 'lot' }),
      f('cb_storage', 'Storage', 'enum', 'required', 'Policy 06', { values: ['ambient', 'refrigerated', 'frozen'], scope: 'lot' }),
      f('cb_lot_code', 'Lot code', 'text', 'recommended', 'FDA FSMA 204', { scope: 'lot' }),
      f('cb_shelf_life_days', 'Remaining shelf life', 'integer', 'recommended', 'Amazon (via search)', { unit: 'days', scope: 'lot' }),
      f('cb_producer_type', 'Made in', 'enum', 'required', 'ASTHO; Forrager', { values: ['registered_facility', 'home_kitchen'] }),
      f('cb_ship_states', 'States you may ship to', 'text', 'required', 'ASTHO; Forrager', {
        when: eq(spec('cb_producer_type'), 'home_kitchen'), whenText: 'for cottage food from a home kitchen',
      }),
      f('cb_claims', 'Claims on the label', 'multi', 'recommended', 'Shopify; extension guides', { values: ['organic', 'gluten_free', 'kosher', 'halal', 'non_gmo', 'vegan'] }),
      f('certificate', 'Certificate for a claim', 'document', 'conditional', 'Shopify; extension guides', {
        path: 'documents.certificate', when: has(spec('cb_claims')), whenText: 'when the label makes a claim',
      }),
    ],
    declarations: [
      d('food_label_true', 'The label declares the ingredients, the net quantity, the maker and every major food allergen, and the product makes no claim to treat a disease.', '21 CFR 101; FDA allergens page; policy 06'),
      d('food_returns_excluded', 'Returns are excluded on this food product.', 'Policy 06 (perishable food: returns are excluded)'),
    ],
    fulfilment: {
      allowed: ['ship', 'pickup'],
      pickupOnlyWhen: eq(spec('cb_producer_type'), 'home_kitchen'),
      note: 'Refrigerated and frozen goods ship in an insulated pack with coolant; FedEx needs approval for perishables; dry ice ships as UN1845. Cottage food is pickup or in-state delivery only.',
    },
    returns: { acceptsReturns: false, rule: 'Returns are excluded on food (policy 06).' },
    questions: [
      'Was it made in a home kitchen or a registered facility?',
      'What are the best-by date and the lot code?',
      'How is it stored, and was the lot ever thawed?',
      'Which major allergens does the label declare?',
      'Send a photo of the label, with the nutrition panel or the exemption.',
      'Which states may you ship to?',
    ],
  },
  {
    key: 'regulated_device',
    name: 'Over-the-counter medical devices',
    trigger: {
      facts: [has(spec('cb_fda_product_code')), all(under('hb-1'), words('pain relief', 'therapy', 'therapeutic', 'treats', 'treatment', 'relieves', 'medical device', 'brace', 'compression', 'fda'))],
      text: 'The category is under Health Care (hb-1) and the product makes a body-function claim, or the seller supplies an FDA product code.',
    },
    fields: [
      f('model', 'Model', 'text', 'required', 'Policy 06', { path: 'product.model' }),
      f('cb_fda_class', 'FDA device class', 'enum', 'required', 'FDA', { values: ['I', 'II', 'III'] }),
      f('cb_fda_product_code', 'FDA product code', 'text', 'required', 'FDA classification', { help: 'Three letters, for example IMD for a hot or cold pack.' }),
      f('cb_510k', '510(k) number or exempt', 'text', 'required', 'FDA; Amazon', {
        when: oneOf(spec('cb_fda_class'), ['II', 'III']), whenText: 'for Class II and III devices', help: 'K and 6 digits, or exempt.',
      }),
      f('cb_rx_status', 'Prescription status', 'enum', 'required', '21 CFR 801.109', { values: ['otc', 'rx_only'] }),
      f('cb_udi', 'UDI', 'text', 'recommended', 'FDA UDI'),
      f('cb_expiry_date', 'Expiry date', 'date', 'recommended', 'Policy 06', { scope: 'lot', help: 'Required by policy 06 where the device has one.' }),
      f('cb_sealed', 'Sealed and stored as labelled', 'boolean', 'required', 'No primary source read', { scope: 'lot' }),
    ],
    declarations: [
      d('device_claims', 'The listing uses "cleared" and "approved" accurately, shows no FDA logo and claims nothing beyond the label.', 'FDA; policy 06'),
    ],
    refusals: [{ key: 'rx_only', when: eq(spec('cb_rx_status'), 'rx_only'), reason: 'A device labelled Rx only cannot be listed (policy 06 prohibits prescription goods).' }],
    returns: { acceptsReturns: false, rule: 'Opened hygiene and sterile goods are not returnable (proposed; no leader rule read).' },
    questions: [
      'What are the model, the FDA product code and the class?',
      'What is the 510(k) number, or is it exempt?',
      'Is it labelled Rx only? If it is, it cannot be listed.',
      'What are the expiry and the lot?',
      'Is it sealed and stored within the labelled conditions?',
    ],
  },
  {
    key: 'hazmat',
    name: 'Hazardous materials',
    trigger: {
      under: ['ha-1-1', 'hg-10-11-3', 'bi-23-3', 'bi-23-1', 'hg-18-1-7', 'co-4-1-3'],
      attributes: ['battery-type', 'battery-chemistry', 'battery-technology'],
      facts: [has(spec('cb_hazard_kind')), has(spec('cb_un_number')), has(spec('battery-type')), oneOf(spec('cb_disclosures'), ['us-ca-prop65-cancer', 'us-ca-prop65-reproductive', 'us-ca-prop65-cancer_reproductive'])],
      text: 'The product has a battery, aerosol, fuel or chemical attribute, sits in a chemicals category, or carries a Prop 65 disclosure; the SDS is then required for chemicals.',
    },
    fields: [
      f('cb_hazard_kind', 'Hazard', 'enum', 'required', '49 CFR 172.101; USPS Publication 52', {
        values: ['none', 'lithium_ion_battery', 'lithium_metal_battery', 'other_battery', 'aerosol', 'flammable_liquid', 'corrosive', 'other_chemical'],
      }),
      f('cb_battery_wh', 'Battery energy', 'decimal', 'required', 'FedEx Ground', { unit: 'Wh', when: eq(spec('cb_hazard_kind'), 'lithium_ion_battery'), whenText: 'for lithium-ion batteries' }),
      f('cb_lithium_grams', 'Lithium content', 'decimal', 'required', 'FedEx Ground', { unit: 'g', when: eq(spec('cb_hazard_kind'), 'lithium_metal_battery'), whenText: 'for lithium metal batteries' }),
      f('cb_battery_packing', 'Battery is', 'enum', 'required', 'FedEx Ground', {
        values: ['in_equipment', 'packed_with_equipment', 'loose'], when: oneOf(spec('cb_hazard_kind'), ['lithium_ion_battery', 'lithium_metal_battery', 'other_battery']), whenText: 'for batteries',
      }),
      f('cb_hazard_class', 'Hazard class or division', 'text', 'required', '49 CFR 172.101', {
        when: oneOf(spec('cb_hazard_kind'), ['aerosol', 'flammable_liquid', 'corrosive', 'other_chemical']), whenText: 'for aerosols and chemicals', help: '1 to 9 with the division, from SDS section 14.',
      }),
      f('cb_un_number', 'UN or NA number', 'text', 'required', 'PHMSA; FedEx', {
        when: oneOf(spec('cb_hazard_kind'), ['aerosol', 'flammable_liquid', 'corrosive', 'other_chemical']), whenText: 'for aerosols and chemicals', help: 'For example UN1950 for aerosols.',
      }),
      f('cb_proper_shipping_name', 'Proper shipping name', 'text', 'recommended', '49 CFR 172.101'),
      f('cb_packing_group', 'Packing group', 'enum', 'recommended', 'FedEx Ground guide', { values: ['I', 'II', 'III', 'none'] }),
      f('cb_limited_quantity', 'Marked Limited Quantity', 'boolean', 'recommended', 'PHMSA'),
      f('safety_data', 'Safety data sheet (SDS)', 'document', 'required', 'OSHA HazCom', {
        path: 'documents.safety_data', when: oneOf(spec('cb_hazard_kind'), ['aerosol', 'flammable_liquid', 'corrosive', 'other_chemical']), whenText: 'for aerosols and chemicals',
      }),
      f('cb_inhalation_hazard', 'Inhalation or poison hazard', 'boolean', 'required', 'FedEx Ground; policy 06', {
        when: oneOf(spec('cb_hazard_kind'), ['aerosol', 'flammable_liquid', 'corrosive', 'other_chemical']), whenText: 'for aerosols and chemicals',
      }),
      f('cb_container_size', 'Container size', 'text', 'recommended', 'FedEx Ground', { help: 'FedEx Ground refuses pails or drums over 8 gal.' }),
      f('cb_carrier_acceptance', 'Carrier that accepts it', 'enum', 'required', 'FedEx Ground; Publication 52', {
        values: ['pickup_only', 'fedex_ground', 'ups_ground_contract', 'usps_surface', 'ltl'], when: { path: spec('cb_hazard_kind'), op: 'neq', value: 'none' }, whenText: 'when a hazard is present',
      }),
    ],
    declarations: [
      d('hazmat_stated', 'The hazard class I stated comes from the safety data sheet, and the offer is pickup only or ground shipping by a carrier that accepts the class.', 'Policy 06 (restricted: other hazardous materials)', { path: spec('cb_hazard_kind'), op: 'neq', value: 'none' }, 'when a hazard is present'),
    ],
    refusals: [
      { key: 'inhalation', when: isTrue(spec('cb_inhalation_hazard')), reason: 'Goods with an inhalation or poison hazard need a licensed carrier and cannot be listed (policy 06, classes 2.3 and 6.1).' },
      { key: 'damaged_battery', when: eq(spec('cb_battery_condition'), 'damaged'), reason: 'Damaged, swollen or recalled lithium batteries cannot be shipped and cannot be listed.' },
    ],
    fulfilment: { allowed: ['ship', 'pickup'], note: 'Ground only, in the 48 contiguous states; no hazmat to Alaska or Hawaii; no drop boxes. Fully regulated hazmat needs a qualified shipper.' },
    returns: { acceptsReturns: false, rule: 'No returns unless the item is unopened and goes back through a carrier qualified for the class.' },
    questions: [
      'Send the safety data sheet. I read the class, the UN number and the packing group from section 14.',
      'What are the container size and the count?',
      'Is it marked Limited Quantity?',
      'Do you have a hazmat agreement with a carrier, or is it pickup only?',
      'Does it carry an inhalation or poison label? If it does, it cannot be listed.',
      'For a battery: the watt-hours, and is it loose or in the equipment?',
    ],
  },
  {
    key: 'sized',
    name: 'Sized goods',
    trigger: {
      under: ['aa-1', 'aa-8', 'aa-6-9', 'sg-4-4-3', 'sg-4-17-2-17', 'sg-4-16-1'],
      attributes: ['size', 'shoe-size', 'ring-size'],
      text: 'The category is apparel, shoes, rings, bikes or boards (a Size, Shoe size or Ring size attribute).',
    },
    fields: [
      f('cb_size', 'Size', 'text', 'required', 'Google (1604, 187)', { help: 'The size on the tag, ring size or frame size.' }),
      f('cb_size_system', 'Size system', 'enum', 'recommended', 'Google; ACP', { values: ['US', 'UK', 'EU', 'DE', 'FR', 'IT', 'JP', 'CN', 'BR', 'MEX', 'AU'] }),
      f('cb_measurements', 'Measurements', 'text', 'recommended', 'No leader spec read', { unit: 'in', help: 'For used items: chest, waist, length, inseam or the like.' }),
    ],
    declarations: [],
    questions: ['What size is on the tag, and in which size system?', 'For a used item: the measurements in inches.'],
  },
  {
    key: 'freight',
    name: 'Freight',
    trigger: { facts: [isTrue('lot.large_item'), has(spec('freight'))], text: 'The item exceeds parcel limits: the lot is flagged large_item, or the product carries a freight mark.' },
    fields: [
      f('weight_lb', 'Package weight', 'decimal', 'required', 'NMFC density basis', { path: 'lot.dims.weight_lb', scope: 'lot', unit: 'lb' }),
      f('length_in', 'Package length', 'decimal', 'required', 'NMFC density basis', { path: 'lot.dims.length_in', scope: 'lot', unit: 'in' }),
      f('width_in', 'Package width', 'decimal', 'required', 'NMFC density basis', { path: 'lot.dims.width_in', scope: 'lot', unit: 'in' }),
      f('height_in', 'Package height', 'decimal', 'required', 'NMFC density basis', { path: 'lot.dims.height_in', scope: 'lot', unit: 'in' }),
      f('cb_freight_class', 'Freight class', 'text', 'recommended', 'NMFTA (density-based since 2025-07-19)'),
      f('cb_load_out', 'Loading at pickup', 'enum', 'required', 'Owner fact', { values: ['seller_loads', 'dock', 'forklift_on_site', 'buyer_rigger'], scope: 'lot' }),
      f('cb_delivery_type', 'Delivery', 'enum', 'recommended', 'Wayfair (secondary)', { values: ['curbside_freight', 'white_glove', 'pickup_only'], scope: 'lot' }),
    ],
    declarations: [],
    fulfilment: { allowed: ['ship', 'pickup'], note: 'LTL priced on NMFC density, flatbed for large machines, or buyer pickup. No parcel rate.' },
    questions: ['What do the item and its packing weigh, and what is the footprint?', 'Can you load it, or does the buyer bring a rigger?'],
  },
];

export const MODULE_BY_KEY: Record<ModuleKey, TraitModule> = Object.fromEntries(MODULES.map((m) => [m.key, m])) as Record<ModuleKey, TraitModule>;
export const MODULE_KEYS = MODULES.map((m) => m.key);

/** Kept for the trigger table in the spec and the help: one line per module. */
export const moduleRules = (): Array<{ key: ModuleKey; name: string; fires_when: string }> => MODULES.map((m) => ({ key: m.key, name: m.name, fires_when: m.trigger.text }));

