/**
 * CB-958: the situation map, stated once. Eric 2026-10-31 14:19: "When new users first interact with us, are they going
 * to be able to quickly learn through their agents all the things they can do with CommerceBook?" The capability list
 * (src/lib/sellerCapabilities.ts) is organised by tool; this map starts from the person's situation (used goods and no
 * store, stock in quantity, a store that already exists) and names, for each way, who it is for, the two to four tool
 * steps, what it costs and what waits for the owner.
 *
 * Every surface that shows the map renders it from this module:
 *   - the instructions files ({{first_conversation_<role>}} and {{ways_<role>}}, scripts/write-agent-instructions.mjs);
 *   - the three briefings ({{ways}}, scripts/write-agent-briefing.mjs);
 *   - llms.txt (the section "Ways to sell, buy or use the network", scripts/write-counts.mjs);
 *   - /capabilities on the seller host, regrouped by situation (src/lib/sellerCapabilities.ts plainGroups, which reads
 *     the `page` and `capabilities` fields here);
 *   - GET /api/v1/ways?role= and the keyless MCP tool commercebook_capabilities action ways (src/lib/ways.ts renders the
 *     JSON with the planned dates resolved);
 *   - commercebook_tool_search, which matches the situation words (matchWay) and answers the way beside the tools.
 *
 * Voice. The map never names the owner inside its sentences. The renderers put the owner only in the labels ("Waits for
 * me", "Waits for your owner", "Waits for you"), so one text serves the owner-voice instructions files, the agent-voice
 * briefings and llms.txt, and the people page. Steps name each tool once, with its action, as `tool` action `x`.
 *
 * Facts. Each available way lists the seller capabilities it rests on with the date each became available; QA
 * (qa/cb958-ways-to-sell.mjs) checks every key and date against the capability list and every tool and action against
 * the intent table. A planned way names its row in docs/briefings/coming.md (`planned.feature`); its words ("planned,
 * no date", "planned, last confirmed October 30, 2026") are resolved where the map is rendered, from that row.
 * Pure: no I/O; the one import is the fee sentences of definition.ts (CB-966).
 */
import { BUYER_PAYS_MACHINE, SELLER_PROCESSING_MACHINE } from './definition.js';

/**
 * CB-723: the own-traffic line of the ways "Stock in quantity" and "A store that already exists". The map is rendered at
 * build time with no read of the settings, so the line names the fee without its number (the number is the live
 * market_settings.own_traffic_fee_pct, served by GET /api/v1/seller/capabilities). "the seller's" in place of the brief's
 * "your": the map never names the owner inside its sentences (the voice rule above), and the owner-voice files read it too.
 */
export const OWN_TRAFFIC_WAY_LINE = 'Orders through the seller\'s own link pay the lower own-traffic fee.';

export type WaysRole = 'seller' | 'buyer' | 'warehouse';
export const WAYS_ROLES: readonly WaysRole[] = ['seller', 'buyer', 'warehouse'];

export interface WayStep {
  tool: string;
  action: string;
  /** What the call does, in one sentence with no owner pronoun. */
  does: string;
}
export interface WaySince {
  /** The key of a line of the seller capability list (GET /api/v1/seller/capabilities). */
  capability: string;
  /** A short name for the line, as this map says it. */
  label: string;
  /** YYYY-MM-DD: the line's since date on the capability list. */
  since: string;
}
export interface WayPlanned {
  /** The feature, word for word as its row in docs/briefings/coming.md names it. */
  feature: string;
  /** The row's Date cell: YYYY-MM-DD, or none. */
  date: string;
}
export interface Way {
  key: string;
  role: WaysRole;
  /** The short name an agent says: "Used goods, no store". */
  name: string;
  /** The heading on a page for people: "If you have used goods and no store". */
  situation: string;
  /** Who it is for, one line. */
  for: string;
  /** Two to four tool steps, in order. Empty for a planned way. */
  steps: WayStep[];
  /** What it costs, one line. */
  costs: string;
  /** What waits for the owner, as a list of nouns (the label names the owner). */
  owner: string;
  /** Rules that apply to this way, one sentence each. */
  notes: string[];
  /** What this way does not include today, each "CommerceBook does not offer ..." with the closest thing it does offer. */
  not_today: string[];
  /** The capability lines it rests on, with their dates (seller lines; a buyer way may name the seller line it reads). */
  since: WaySince[];
  /** A planned way: the coming.md rows it waits on. */
  planned?: WayPlanned[];
  /** The page for people (/capabilities): one sentence under the heading, with no tool names. Seller ways only. */
  person?: string;
  /** Plain phrases, comma separated, that point to this way (commercebook_tool_search and the ways action). */
  words: string;
}

/**
 * The seller fee, as the fee schedule states it (docs/policies/08-fees.md; QA checks it against the capability list),
 * and since CB-966 (190) the processing fee the seller pays out of its proceeds.
 */
const SELLER_COST = `Nothing to list. CommerceBook takes 8 percent of each sale, capped at $500 per order. ${SELLER_PROCESSING_MACHINE}`;
/** The buyer's side of the fee schedule (CB-966: the price with shipping, no fee). */
const BUYER_COST = BUYER_PAYS_MACHINE;
/** The first-sale rule (Eric, 2026-10-29), in the words of the seller instructions file. */
const FIRST_SALE = 'A reseller needs no brand authorization to list genuine goods.';
const MISSING = 'CommerceBook does not offer';

export interface WaysOpening {
  /** The heading: "Ways to sell". */
  heading: string;
  /** One sentence under the heading. */
  intro: string;
  /** What comes before every way of this role (the account), as steps. */
  before: { sentence: string; steps: WayStep[]; owner: string };
}

export const WAYS_OPENING: Record<WaysRole, WaysOpening> = {
  seller: {
    heading: 'Ways to sell',
    intro: 'Agentic selling on CommerceBook starts from the goods there are to sell. Each way below names who it is for, the tool steps, the cost and what waits for approval.',
    before: {
      sentence: 'Every way to sell starts with a seller account.',
      steps: [
        { tool: 'commercebook_account_start', action: 'signup', does: 'opens the account with kind seller, an email, a name and a business name; an 8-digit code arrives by email' },
        { tool: 'commercebook_account_start', action: 'confirm', does: 'takes that code and answers the seller key once' },
      ],
      owner: 'the email code, the Stripe identity and bank steps, accepting the policies, and turning on each activity at Agent access',
    },
  },
  buyer: {
    heading: 'Ways to buy',
    intro: 'Each way below starts from what is needed and names who it is for, the tool steps, the cost and what waits for approval.',
    before: {
      sentence: 'Reading the market needs no account. Buying needs a buyer account.',
      steps: [
        { tool: 'commercebook_account_start', action: 'signup', does: 'opens a Shop account with kind buyer, an email and a name; an 8-digit code arrives by email' },
        { tool: 'commercebook_account_start', action: 'confirm', does: 'takes that code and answers the buyer key once' },
      ],
      owner: 'the email code, a saved card, bank account or balance, and turning on Orders and Payments at Agent access',
    },
  },
  warehouse: {
    heading: 'Ways to use the network',
    intro: 'Each way below starts from what the warehouse needs and names who it is for, the tool steps, the cost and what waits for approval.',
    before: {
      sentence: 'Every way below needs a warehouse account, except the selling way, which needs a seller account too.',
      steps: [
        { tool: 'commercebook_account_start', action: 'signup', does: 'opens the account with kind warehouse, an email, a name, the business name and the street address of the first facility' },
        { tool: 'commercebook_account_start', action: 'confirm', does: 'takes the 8-digit code from the email and answers the warehouse key once' },
      ],
      owner: 'the email code, the verification of the warehouse, and turning on each activity at Agent access',
    },
  },
};

export const WAYS: readonly Way[] = [
  // ------------------------------------------------------------------ seller
  {
    key: 'used_goods',
    role: 'seller',
    name: 'Used goods, no store',
    situation: 'If you have used goods and no store',
    for: 'A person or a small shop with used or surplus household and shop goods, one item or a few, and no online store.',
    steps: [
      { tool: 'commercebook_seller_products', action: 'upsert', does: 'loads one record per item with a title, condition used, a price, the count and at least two photos; dry_run true shows the result first' },
      { tool: 'commercebook_seller_products', action: 'update', does: 'sets goods_kind used or surplus, the package weight and size, the shipping (calculated, flat or free), pickup true for free local pickup, return_method no_returns for sold as is, and publish true' },
      { tool: 'commercebook_seller_orders', action: 'release', does: 'hands over a pickup order with the six-digit pickup_code the buyer reads out, which completes the payment' },
    ],
    costs: SELLER_COST,
    owner: 'each listing and its price before it goes live, and the hand-off of a pickup order',
    notes: [
      'A used or surplus product goes live only with a condition, at least two photos, its weight and size, and its own terms: sold as is, or a return window.',
      'Pickup is free. A buyer in the same 3-digit ZIP area reads "Pickup free in <city>", and the street address shows only after the order is placed.',
      'An item over 150 lb, longer than 108 in, or over 165 in in length plus girth is a large item: it gets no parcel rate, and large_item true marks any other item large.',
      FIRST_SALE,
    ],
    not_today: [`${MISSING} delivery by the seller today. A large item without pickup reads "Large item: delivery quoted at checkout".`],
    since: [
      { capability: 'used_surplus_goods', label: 'used and surplus goods', since: '2026-10-29' },
      { capability: 'local_pickup', label: 'local pickup', since: '2026-10-29' },
      { capability: 'large_item', label: 'large items', since: '2026-10-30' },
      { capability: 'pickup_code', label: 'the pickup code', since: '2026-10-30' },
    ],
    person: 'Your agent lists each item with its condition and photos, and a buyer near you can pick it up for free.',
    words: 'used, secondhand, second hand, pre-owned, garage, garage sale, garage full, yard sale, estate sale, household, furniture, used tools, old tools, tools, appliances, bike, couch, sofa, desk, declutter, clean out, get rid of, no store, no website, no online store, craigslist, facebook marketplace, offerup, my stuff, a few items, one item, local pickup',
  },
  {
    key: 'stock_in_quantity',
    role: 'seller',
    name: 'Stock in quantity',
    situation: 'If you hold stock in quantity',
    for: 'A business with cases, pallets or a stock count of the same product, sold again and again.',
    steps: [
      { tool: 'commercebook_seller_products', action: 'upsert', does: 'loads up to 500 records with the count and its date; offer price_mode schedule with price_schedule gives a lower price for larger quantities, and min_order_qty sets the smallest order; dry_run true first' },
      { tool: 'commercebook_seller_products', action: 'import', does: 'reads a spreadsheet or file in the CommerceBook template, Shopify CSV, eBay CSV, Google Shopping or products JSON' },
      { tool: 'commercebook_seller_products', action: 'feed_add', does: 'saves a catalog feed address that CommerceBook reads on a schedule, so the counts stay fresh; feed_fetch runs it now' },
      { tool: 'commercebook_seller_products', action: 'confirm_count', does: 'confirms a count after a physical count, so the product stays on sale' },
    ],
    costs: SELLER_COST,
    owner: 'the prices and the quantity tiers, and each listing before it goes live',
    notes: [
      'A product at a set price stays on sale until the stock runs out or the seller pauses it.',
      'A volume schedule prices every unit at the tier the quantity reaches. A graduated schedule prices the units in each tier at that tier\'s price.',
      'A count stays fresh for 72 hours on a feed and for 30 days on stock counted by hand. Past its window, the product takes no new order until the count is confirmed.',
      OWN_TRAFFIC_WAY_LINE, // CB-723
      'A buyer of a large quantity can make a private offer on a product, and the seller can send a past buyer one: `commercebook_seller_private_offers` actions `accept`, `counter` and `send`. The agent accepts at or above the lowest price set in the policies and asks below it.',
    ],
    not_today: [],
    since: [
      { capability: 'standing_offer', label: 'a product at a set price', since: '2026-10-22' },
      { capability: 'price_by_quantity', label: 'price by quantity', since: '2026-10-26' },
      { capability: 'ship_from_addresses', label: 'more than one ship-from address', since: '2026-10-27' },
      { capability: 'oms_feed', label: 'a product feed', since: '2026-10-23' },
      { capability: 'stale_rule', label: 'the count windows', since: '2026-10-22' },
      { capability: 'own_traffic', label: 'a lower fee on your own traffic', since: '2026-10-31' }, // CB-723
      { capability: 'private_offer', label: 'private offers and counters', since: '2026-10-31' },
    ],
    person: 'Your agent lists your stock with its count and a lower price for larger quantities, by hand, from a spreadsheet or from a product feed.',
    words: 'stock, inventory, cases, pallets, cartons, units, skus, wholesale, bulk, in quantity, quantity tiers, volume pricing, tier pricing, price breaks, catalog, spreadsheet, csv, product feed, distributor, manufacturer, restock, again and again, thousands, hundreds',
  },
  {
    key: 'whole_stock',
    role: 'seller',
    name: 'Liquidation and sold-whole stock',
    situation: 'If you want to sell everything at once',
    for: 'A business clearing out surplus, returns, closeouts or a closing inventory, sold to one buyer at once.',
    steps: [
      { tool: 'commercebook_seller_products', action: 'upsert', does: 'loads the stock as one product with its count, condition and photos; dry_run true first' },
      { tool: 'commercebook_seller_products', action: 'update', does: 'sets min_qty to the whole count so one order takes everything, goods_kind surplus or used with the package, and pickup true for pallets and machines' },
      { tool: 'commercebook_seller_requests', action: 'watch', does: 'emails every new buyer request in the categories the stock fits' },
    ],
    costs: SELLER_COST,
    owner: 'the price of the whole stock, and each listing before it goes live',
    notes: [
      'Pallets and machines over the parcel limits are large items: no parcel rate, with pickup or delivery quoted at checkout.',
      'A shipped order over $500 needs release evidence: the count shipped and photos of the packed goods.',
    ],
    not_today: [`${MISSING} a mark for "sold whole" through a tool today. The Trade lots filter in the Shop shows only products CommerceBook marked that way. The closest is min_qty set to the whole count.`],
    since: [
      { capability: 'used_surplus_goods', label: 'used and surplus goods', since: '2026-10-29' },
      { capability: 'large_item', label: 'large items', since: '2026-10-30' },
    ],
    person: 'Your agent sets the smallest order to the whole count, so one buyer takes everything at once, with pickup for pallets and machines.',
    words: 'liquidation, liquidate, clearance, clear out, closeout, close out, closing down, closing inventory, overstock, surplus, excess, dead stock, returns, job lot, whole lot, all at once, everything at once, one buyer, trade lot, trade lots',
  },
  {
    key: 'quote_on_request',
    role: 'seller',
    name: 'Quote on request',
    situation: 'If your price depends on the buyer',
    for: 'A seller whose price depends on the quantity, the buyer or the job, who wants no public price.',
    steps: [
      { tool: 'commercebook_seller_products', action: 'upsert', does: 'lists the product with price_on_request true: it shows "Quote on request", and the stored price stays private' },
      { tool: 'commercebook_seller_account', action: 'policies_update', does: 'sets offer_floor_pct, so no quote goes below that percent of the stored price' },
      { tool: 'commercebook_seller_requests', action: 'list', does: 'reads the open requests in the seller\'s categories; action watch emails each new one' },
      { tool: 'commercebook_seller_requests', action: 'quote', does: 'answers one request with a live product at a price at or under the buyer\'s ceiling; the quote holds 72 hours or until the request expires' },
    ],
    costs: SELLER_COST,
    owner: 'the lowest price accepted, each quote, because a quote is a commitment to a deal, and each private offer below the lowest price',
    notes: [
      'A buyer accepts or declines a quote; an accepted quote becomes the order at the quoted price.',
      'A private offer gives one buyer a price each, a quantity, the shipping and an expiry that only that buyer sees, with up to three counters a side: `commercebook_seller_private_offers` action `send` to the buyer of a request (intent_id) or a past buyer. The agent accepts at or above the lowest price set in the policies and asks below it.',
    ],
    not_today: [],
    since: [
      { capability: 'quote_on_request', label: 'quote on request with a private floor', since: '2026-10-26' },
      { capability: 'quote_a_request', label: 'quotes on buyer requests', since: '2026-10-26' },
      { capability: 'category_watch', label: 'the category watch', since: '2026-10-26' },
      { capability: 'private_offer', label: 'private offers and counters', since: '2026-10-31' },
    ],
    person: 'Your agent shows "Quote on request" in place of a price, quotes each buyer and sends one buyer a private offer, and it asks you before any price below the lowest you set.',
    words: 'quote on request, request a quote, rfq, custom price, price depends, negotiate, no public price, private price, price floor, answer requests, made to order, custom order, bespoke, by quote, private offer, a price for one buyer, one buyer only, best offer, haggle, counter offer',
  },
  {
    key: 'at_a_warehouse',
    role: 'seller',
    name: 'Goods at a member warehouse',
    situation: 'If your goods sit at a member warehouse',
    for: 'A seller whose stock is stored, or will be stored, at a verified warehouse on CommerceBook.',
    steps: [
      { tool: 'commercebook_seller_account', action: 'warehouse_options', does: 'lists the verified warehouses that can store and ship for the seller; action warehouse_ask asks one for a warehouse agreement' },
      { tool: 'commercebook_seller_products', action: 'upsert', does: 'loads the stock with title_holder custodial and count_source wms_count, so the product sells from the warehouse count; dry_run true first' },
      { tool: 'commercebook_seller_orders', action: 'fulfillment', does: 'sets who ships the orders: the seller, or the warehouse' },
      { tool: 'commercebook_seller_products', action: 'stock_check', does: 'reads stale counts and mismatches against the count on record at the warehouse' },
    ],
    costs: `${SELLER_COST} Storage and handling are agreed with the warehouse.`,
    owner: 'the warehouse agreement, and each listing before it goes live',
    notes: [
      'A count of stock at a warehouse stays fresh for 72 hours from the last stock event.',
      // CB-972 (187): each order joins the warehouse's work queue; the seller's release starts the warehouse.
      'Each order goes into the warehouse\'s work queue, and the warehouse starts once the seller releases it. `commercebook_seller_orders` action `warehouse_status` reads where it stands, up to "Shipped by" the warehouse; action `warehouse_exception` asks the warehouse to hold it.',
    ],
    not_today: [`${MISSING} consignment selling, where the warehouse sells the goods, today. The closest is this way: the seller's agent sells from the warehouse count.`],
    since: [{ capability: 'stale_rule', label: 'the count windows', since: '2026-10-22' }, { capability: 'warehouse_queue', label: 'orders in the warehouse queue', since: '2026-10-31' }],
    person: 'Your agent lists the stock a member warehouse holds for you and sells it from the warehouse count.',
    words: 'warehouse, 3pl, third party logistics, stored at a warehouse, holds my stock, fulfillment center, fulfilment centre, consignment, consign, sell for me, stored goods, custodial, member warehouse',
  },
  {
    key: 'existing_store',
    role: 'seller',
    name: 'A store that already exists',
    situation: 'If you already have an online store',
    for: 'A seller with a Shopify store, or any store or order system that exports a product feed.',
    steps: [
      { tool: 'commercebook_seller_products', action: 'shopify', does: 'reads the Shopify link and answers the install link of the CommerceBook channel app; action shopify_sync reads the store now' },
      { tool: 'commercebook_seller_products', action: 'feed_add', does: 'saves the feed address of any other store or order system, in five formats; feed_fetch with dry_run true previews it' },
      { tool: 'commercebook_webhooks', action: 'add', does: 'sends each order, payment and payout to the seller\'s own system as a signed POST' },
      { tool: 'commercebook_seller_account', action: 'checkout_mode', does: 'lets a Shopify seller\'s buyers pay on the store\'s own Shopify checkout' },
    ],
    costs: `${SELLER_COST} On the store's own Shopify checkout, the fee is billed once a month to the saved card.`,
    owner: 'installing the channel app in Shopify, and the change of checkout',
    notes: ['Each order of a Shopify product becomes a Shopify order the seller fulfils as usual.', OWN_TRAFFIC_WAY_LINE /* CB-723 */],
    not_today: [],
    since: [
      { capability: 'shopify', label: 'the Shopify channel app', since: '2026-10-26' },
      { capability: 'shopify_checkout', label: 'the store\'s own Shopify checkout', since: '2026-10-28' },
      { capability: 'oms_feed', label: 'a product feed', since: '2026-10-23' },
      { capability: 'oms_webhooks', label: 'events and webhooks', since: '2026-10-29' },
      { capability: 'own_traffic', label: 'a lower fee on your own traffic', since: '2026-10-31' }, // CB-723
    ],
    person: 'Your agent connects your Shopify store or your product feed, and each order reaches your own system.',
    words: 'shopify, online store, my store, my website, existing store, ecommerce, woocommerce, bigcommerce, order system, oms, sales channel, connect my store, sync my catalog, google shopping, ebay store',
  },
  {
    // CB-963 (170): auctions left the planned way on 2026-10-31.
    key: 'auction',
    role: 'seller',
    name: 'Sell by auction with a reserve',
    situation: 'If you want buyers to bid',
    for: 'A seller with one lot whose price is best found by bidding, such as a collectible, a machine or a pallet of stock, with a lowest price it accepts.',
    steps: [
      { tool: 'commercebook_seller_account', action: 'policies_update', does: 'sets auctions_allowed true, the Allow auctions switch of the seller policies' },
      { tool: 'commercebook_seller_orders', action: 'auction_open', does: 'opens a timed auction on one published product, the whole lot: a start price, a private reserve and a close 1 to 14 days out; the fixed price is off sale until the close' },
      { tool: 'commercebook_seller_orders', action: 'auction_status', does: 'reads the current price, Reserve met and the bid count; action auction_close_early closes it while it has no bid' },
      { tool: 'commercebook_seller_orders', action: 'release', does: 'releases the order the close makes for the winner, as any order' },
    ],
    costs: SELLER_COST,
    owner: 'turning on Allow auctions, the start price and the reserve, and opening each auction',
    notes: [
      'Buyers bid with a maximum. The price rises one increment at a time, 2 percent of the price rounded up to the dollar and at least $1, and a bid in the last five minutes moves the close five minutes on.',
      'At or over the reserve, the close makes the order for the winner at the current price; below it, the product goes back to its fixed price.',
      'The prices are for the whole lot and include shipping when the product ships.',
    ],
    not_today: [`${MISSING} an auction on part of a lot, or a buy-now price beside an auction, today. The closest is a separate product for the part, sold at a set price.`],
    since: [{ capability: 'auctions', label: 'auctions with a reserve', since: '2026-10-31' }],
    person: 'Your agent opens a timed auction on one product with a lowest price you accept, and the winner\u2019s order is made at the close.',
    words: 'auction, auctions, sell by auction, auction it, put it up for auction, reserve, reserve price, highest bidder, sell to the highest bidder, let buyers bid, timed auction, start price, collectible, collectibles, rare, one of a kind',
  },
  {
    // CB-973 (189): services with booking left the planned way on 2026-10-31.
    key: 'service',
    role: 'seller',
    name: 'Sell a service by appointment',
    situation: 'If you perform a service',
    for: 'A seller who performs a service at a set price, such as a repair visit, an installation or a cleaning, at the buyer\u2019s address or at its own place.',
    steps: [
      { tool: 'commercebook_seller_products', action: 'service_list', does: 'lists the service: the price of one booking, the duration, where (the ZIP prefixes served, or the seller\u2019s place) and the no-show fee' },
      { tool: 'commercebook_seller_products', action: 'availability_set', does: 'sets the weekly open times, the closed dates and the time zone; slots of the duration run for the next 60 days' },
      { tool: 'commercebook_seller_orders', action: 'list', does: 'reads each booking as an order with its appointment: the date, the time in the seller\u2019s zone and where' },
      { tool: 'commercebook_seller_orders', action: 'done', does: 'marks the booking done after it starts; the card hold is captured and the buyer confirms as with a delivery' },
    ],
    costs: SELLER_COST,
    owner: 'the price, the area or the address, the open times and the no-show fee',
    notes: [
      'A booking holds its slot for 15 minutes while the buyer pays. A booked slot leaves the open times.',
      'Either side cancels more than 24 hours ahead with the full amount back, and the slot opens again.',
      'Photos, condition and shipping do not apply to a service.',
    ],
    not_today: [`${MISSING} a service area by distance, a calendar sync or a collected no-show fee today. The closest are ZIP prefixes, open times set by hand, and a seller who cancels a late booking.`],
    since: [{ capability: 'services', label: 'services with booking', since: '2026-10-31' }],
    person: 'Your agent lists your service with a price, the area you cover and your open times, and buyers\u2019 agents book a slot.',
    words: 'service, services, plumber, plumbing, repair, repair visit, booking, appointment, book a time, handyman, installation, cleaning, a service i perform, by appointment, open times, service area, house call, visit',
  },
  {
    key: 'planned_selling',
    role: 'seller',
    name: 'Group buys',
    situation: 'Planned ways to sell',
    for: 'A seller whose buyers want to join one order to reach a quantity price.',
    steps: [],
    costs: 'It cannot be called today.',
    owner: 'nothing today',
    notes: ['When asked for it, say that CommerceBook does not offer it today and offer the closest way: price by quantity, where one buyer reaches the quantity price alone.'],
    not_today: [],
    since: [],
    planned: [
      { feature: 'Group buys on the market', date: '2026-10-30' },
    ],
    words: 'group buy, group buys, group purchase, pool an order, split an order, buy together, co-op order',
  },

  // ------------------------------------------------------------------ buyer
  {
    key: 'one_thing',
    role: 'buyer',
    name: 'One thing for one person',
    situation: 'If you want one thing',
    for: 'A person who wants one item, delivered or picked up.',
    steps: [
      { tool: 'commercebook_market', action: 'search', does: 'finds products by words, category, price and condition; with zip and sort delivered it orders them by the price with shipping, lowest first' },
      { tool: 'commercebook_market', action: 'product', does: 'reads one product: the count, the condition, the photos, the seller and the fact sheet' },
      { tool: 'commercebook_buy', action: 'quote', does: 'prices the offer at the quantity with shipping to the ZIP, or with method pickup, and holds the goods for 15 minutes' },
      { tool: 'commercebook_buy', action: 'place', does: 'turns the quote into an order paid from the balance or the saved card; the cart link https://commercebook.ai/cart/<offer_id>:<qty> does the same for a person' },
    ],
    costs: BUYER_COST,
    owner: 'the choice of product, turning payments on, and each payment above $250',
    notes: [
      'A card is held, not charged, until the seller ships.',
      // CB-971 (186): the session path for an assistant that speaks the protocol.
      'An assistant that speaks the Agentic Commerce Protocol checks out through a session with `commercebook_buy` actions `checkout_create` and `checkout_complete`, paid as action `place` pays.',
    ],
    not_today: [],
    since: [{ capability: 'acp_checkout', label: 'checkout sessions in the Agentic Commerce Protocol shape', since: '2026-10-31' }],
    words: 'one item, one thing, a single item, for my home, gift, buy one, find me, cheapest, delivered price, best price, shop for me',
  },
  {
    key: 'business_quantity',
    role: 'buyer',
    name: 'A business buying in quantity',
    situation: 'If your business buys in quantity',
    for: 'A business that buys cases, pallets or repeat supplies.',
    steps: [
      { tool: 'commercebook_market', action: 'search', does: 'finds products priced by quantity, which read "from $X each, N or more at $Y each"' },
      { tool: 'commercebook_buy', action: 'quote', does: 'prices the offer at the full quantity, at the tier that quantity reaches, with shipping' },
      { tool: 'commercebook_requests', action: 'post', does: 'asks sellers for quotes on a quantity with a ceiling, the most paid each, when no listed price fits' },
      { tool: 'commercebook_buy', action: 'place', does: 'places the order; method bank pays from the saved bank account' },
    ],
    costs: BUYER_COST,
    owner: 'every order, the bank account saved at Settings, Payment methods in the Shop, and any raise of the spending limits',
    notes: [
      'An order is paid when it is placed, by balance, card or bank.',
      // CB-970 (188): the certificate on file marks an order to its state tax-exempt; the owner uploads the file.
      'Resale and exemption certificates live in Shop Settings, Tax exemption: commercebook_buy action tax_certificate_add adds the details, and a person uploads the file there. An order to a state a certificate covers is marked tax-exempt, and the seller sees the certificate.',
      'When a listed price is close, a private offer asks that seller for a price each and a quantity that only the two see: `commercebook_private_offers` actions `make`, `counter` and `accept`. Each proposal and each accept stays within the spending limits.',
      // CB-968 (184): the invoice of each order for the books.
      'Each order has an invoice for the books: commercebook_buy action invoice_pdf gives the owner a link to the PDF that works for 15 minutes, with the business name and billing address of the account.',
      // CB-964 (176), CB-983: purchase order numbers are live; they left the planned list.
      'An order carries the owner\u2019s purchase order number when the owner gives one: commercebook_buy action place takes po_number, and action po_number adds or changes it until the seller ships. The seller sees it on the order.',
    ],
    not_today: [`${MISSING} net terms (pay later on account) today.`],
    since: [
      { capability: 'price_by_quantity', label: 'price by quantity', since: '2026-10-26' },
      { capability: 'quote_a_request', label: 'quotes on requests', since: '2026-10-26' },
      { capability: 'private_offer', label: 'private offers and counters', since: '2026-10-31' },
    ],
    planned: [
      { feature: 'Group buys on the market', date: '2026-10-30' },
    ],
    words: 'business, company, office supplies, for my business, for our business, cases, pallets, bulk, in quantity, wholesale, repeat order, reorder, every month, tape, boxes, stretch wrap, procurement, purchasing, volume, make an offer, private offer, negotiate, haggle, lower price, best offer',
  },
  {
    key: 'request',
    role: 'buyer',
    name: 'When nothing fits, a request',
    situation: 'If nothing on the market fits',
    for: 'A buyer who finds nothing that fits on the market, at the price or the quantity.',
    steps: [
      { tool: 'commercebook_market', action: 'reach', does: 'counts the sellers a request in one category reaches, before posting' },
      { tool: 'commercebook_requests', action: 'post', does: 'posts the request with a title, a category, the quantity, the ceiling and notify true; it stays open until it expires or is withdrawn' },
      { tool: 'commercebook_requests', action: 'quotes', does: 'reads the quotes sellers send' },
      { tool: 'commercebook_requests', action: 'accept', does: 'accepts one quote, which makes the order at its price; action decline turns one down' },
    ],
    costs: 'Posting a request costs nothing and commits the buyer to nothing. An accepted quote is paid as an order is.',
    owner: 'posting the request, and accepting a quote',
    notes: [],
    not_today: [],
    since: [{ capability: 'quote_a_request', label: 'quotes on requests', since: '2026-10-26' }],
    words: 'nothing fits, cannot find, not on the market, post a request, ask sellers, get quotes, request quotes, hard to find, special order',
  },
  {
    key: 'large_items',
    role: 'buyer',
    name: 'Large items and pickup',
    situation: 'If you buy something large',
    for: 'A buyer of furniture, machines or anything over parcel size, or anyone near a seller who offers pickup.',
    steps: [
      { tool: 'commercebook_market', action: 'search', does: 'with zip, answers each product with its pickup line, "Pickup free in <city>" for a buyer in the same 3-digit ZIP area' },
      { tool: 'commercebook_market', action: 'shipping_estimate', does: 'answers one product\'s shipping or pickup line for the ZIP' },
      { tool: 'commercebook_buy', action: 'quote', does: 'prices the offer with method pickup; action place then holds the card' },
      { tool: 'commercebook_buy', action: 'order', does: 'reads the six-digit pickup code and the pickup address once the payment is held' },
    ],
    costs: 'Pickup is free. The card is held at the order and charged when the seller enters the pickup code at the hand-off.',
    owner: 'the buy, and the trip to collect it with the pickup code',
    notes: ['A pickup order not collected within the pickup window is cancelled, and the hold is released.'],
    not_today: [`${MISSING} delivery by the seller today. A large item without pickup reads "Large item: delivery quoted at checkout".`],
    since: [
      { capability: 'local_pickup', label: 'local pickup', since: '2026-10-29' },
      { capability: 'large_item', label: 'large items', since: '2026-10-30' },
      { capability: 'pickup_code', label: 'the pickup code', since: '2026-10-30' },
    ],
    words: 'large, big, heavy, furniture, couch, sofa, table, machine, machinery, equipment, forklift, pickup, pick up, collect, near me, local, oversized, freight',
  },

  {
    // CB-973 (189): booking a service.
    key: 'book_service',
    role: 'buyer',
    name: 'Book a service',
    situation: 'If you need a service',
    for: 'A buyer who needs a service done at a set price, such as a repair visit, at its own address or at the seller\u2019s place.',
    steps: [
      { tool: 'commercebook_market', action: 'search', does: 'finds the service; a service reads goods_kind service and its price per booking' },
      { tool: 'commercebook_market', action: 'service_slots', does: 'reads the open slots, the area served and the cancel rule, with no key' },
      { tool: 'commercebook_buy', action: 'book', does: 'holds one slot for 15 minutes with the address where the work is done; action place then pays it as any order' },
      { tool: 'commercebook_buy', action: 'booking_cancel', does: 'cancels it more than 24 hours ahead with the full amount back' },
    ],
    costs: `${BUYER_COST} The price of a booking includes everything; there is no shipping.`,
    owner: 'the booking and its time, and the payment above $250',
    notes: [
      'The order shows the appointment: the date, the time in the seller\u2019s zone and where.',
      'After the visit the seller marks it done, and the owner confirms as with a delivery. The dispute window applies.',
    ],
    not_today: [`${MISSING} a change of time on a booking today. The closest is to cancel more than 24 hours ahead and book another slot.`],
    since: [{ capability: 'services', label: 'services with booking', since: '2026-10-31' }],
    words: 'book a service, book an appointment, hire, schedule a visit, plumber, repair, fix, install, cleaning, someone to come, appointment, time slot, visit',
  },

  {
    // CB-963 (170): bidding in an auction.
    key: 'auction_bid',
    role: 'buyer',
    name: 'Bid in an auction',
    situation: 'If you want to bid',
    for: 'A buyer who wants a lot a seller put up for auction, at a price no higher than a maximum.',
    steps: [
      { tool: 'commercebook_market', action: 'auctions', does: 'reads the open auctions with the current price, Reserve met, the lowest next bid and the close' },
      { tool: 'commercebook_buy', action: 'auction_bid', does: 'bids the maximum for the whole lot, with the destination when the lot ships; CommerceBook raises the bid one increment at a time up to that maximum' },
      { tool: 'commercebook_buy', action: 'my_bids', does: 'reads whether the bid leads, and the order once it won' },
    ],
    costs: `${BUYER_COST} The winning price includes shipping when the lot ships.`,
    owner: 'the maximum, because it is a commitment to buy, and any maximum above $250',
    notes: [
      'The maximum stays private and counts against the spending limits until the bid is outbid or the auction closes.',
      'The winner\u2019s order is made at the close at the current price and paid from the balance or the saved card.',
    ],
    not_today: [],
    since: [{ capability: 'auctions', label: 'auctions with a reserve', since: '2026-10-31' }],
    words: 'bid on, bid in an auction, place a bid, my bid, win an auction, outbid, bid for me, bid up to, auction for me',
  },

  // ------------------------------------------------------------------ warehouse
  {
    key: 'fill_space',
    role: 'warehouse',
    name: 'Fill your space',
    situation: 'If you have space to fill',
    for: 'A warehouse with open pallet positions or handling time.',
    steps: [
      { tool: 'commercebook_warehouse_account', action: 'preferences_set', does: 'saves the markets the warehouse serves' },
      { tool: 'commercebook_leads', action: 'open', does: 'reads the open leads for a market, "City, ST"; action buy buys one within the key\'s money limits' },
      { tool: 'commercebook_warehouse_profile', action: 'rate_card_set', does: 'publishes the rate card; with storage and receiving set, a capacity request to the warehouse is quoted at once' },
      { tool: 'commercebook_network', action: 'capacity', does: 'reads the capacity requests received; action capacity_quote quotes one' },
    ],
    costs: 'Reading and watching leads cost nothing. A lead costs its price, plus 2.90 percent and 30 cents by card or nothing from the balance. The fee schedule lists no fee for capacity requests and quotes.',
    owner: 'each lead purchase, and each capacity quote',
    notes: [],
    not_today: [],
    since: [],
    words: 'fill space, fill our space, empty space, open pallet positions, free space, spare capacity, vacancy, need clients, need customers, more business, leads, utilization, dock space',
  },
  {
    key: 'cut_supply_costs',
    role: 'warehouse',
    name: 'Cut supply costs',
    situation: 'If you want to pay less for supplies',
    for: 'A warehouse that buys cartons, film, pallets, labels and parcel and wants to pay less.',
    steps: [
      { tool: 'commercebook_costs', action: 'invoice_upload', does: 'uploads a supplier invoice and reads its lines into Your Prices' },
      { tool: 'commercebook_costs', action: 'prices', does: 'sets each invoiced item against the network quotes; action rank shows the rank and the network median per category' },
      { tool: 'commercebook_costs', action: 'price_request', does: 'asks for the network price on an item' },
      { tool: 'commercebook_costs', action: 'share_request', does: 'asks the member behind the best price to share the vendor or pool an order' },
    ],
    costs: 'The fee schedule lists no fee for price comparison.',
    owner: 'the invoices shared, and any change of supplier',
    notes: [],
    not_today: [],
    since: [],
    words: 'supplies, supply costs, supplier, vendor, invoices, cartons, stretch film, stretch wrap, labels, parcel rates, pay less, what we pay, lower what we pay, cheaper, save money, overpaying',
  },
  {
    key: 'sell_floor_stock',
    role: 'warehouse',
    name: 'Sell what sits on the floor',
    situation: 'If goods you own sit on the floor',
    for: 'A warehouse with goods it owns: surplus supplies, equipment, or stock it bought.',
    steps: [
      { tool: 'commercebook_account_start', action: 'signup', does: 'opens a seller account with kind seller and the same email' },
      { tool: 'commercebook_seller_products', action: 'upsert', does: 'loads the goods as a seller, by the seller way that fits: used goods, stock in quantity, or liquidation' },
    ],
    costs: SELLER_COST,
    owner: 'the seller account steps, and each listing before it goes live',
    notes: ['Only goods the warehouse owns are its to sell; a client\'s goods are the client\'s to list.'],
    not_today: [],
    since: [{ capability: 'used_surplus_goods', label: 'used and surplus goods', since: '2026-10-29' }],
    words: 'what sits on the floor, floor stock, abandoned goods, leftover, our own surplus, racking, we own',
  },
  {
    key: 'find_space',
    role: 'warehouse',
    name: 'Find a warehouse for your goods',
    situation: 'If you need space elsewhere',
    for: 'A warehouse that is full, or needs space in another market.',
    steps: [
      { tool: 'commercebook_network', action: 'members', does: 'reads the directory, with each member\'s node id; action member reads one card with its facilities and rate card' },
      { tool: 'commercebook_network', action: 'capacity_request', does: 'asks another warehouse for pallet positions' },
      { tool: 'commercebook_network', action: 'capacity_accept', does: 'accepts the quote on a request sent' },
    ],
    costs: 'The fee schedule lists no fee for capacity requests and quotes. The quoting warehouse sets its own rates.',
    owner: 'accepting a quote',
    notes: [],
    not_today: [],
    since: [],
    words: 'we are full, out of space, overflow, need space, another market, another city, need pallet positions, find a warehouse, capacity request, rent space',
  },
  {
    // CB-972 (187): the orders for goods sellers store with the warehouse, in its work queue.
    key: 'work_queue',
    role: 'warehouse',
    name: 'Ship the orders of goods you store',
    situation: 'If sellers store goods with you',
    for: 'A warehouse that stores goods for sellers on CommerceBook, under a warehouse agreement or at its facilities.',
    steps: [
      { tool: 'commercebook_network', action: 'agreements', does: 'reads the sellers asking for a warehouse agreement; action agreement_respond accepts one' },
      { tool: 'commercebook_work_queue', action: 'list', does: 'reads the orders for goods stored at the warehouse, exceptions first, then the orders ready to pick once the seller released them' },
      { tool: 'commercebook_work_queue', action: 'step', does: 'takes the step the owner names: start_picking, packed, shipped with the carrier and tracking, ready_for_pickup, picked_up with the buyer\'s pickup code, or exception with a note' },
    ],
    costs: 'The fee schedule lists no fee for the work queue. Storage and handling are agreed with the seller.',
    owner: 'each warehouse agreement, and each step that ships or hands over goods',
    notes: ['A shipped order is ready to pick once its seller releases it; a pickup order once the buyer pays.'],
    not_today: [],
    since: [{ capability: 'warehouse_queue', label: 'the work queue', since: '2026-10-31' }],
    words: 'orders to ship, ship orders, work queue, pick list, fulfil orders, fulfillment, stored goods, client orders, seller orders, pick pack ship, what to ship today, tracking',
  },
];

/* ------------------------------------------------------------------ the first conversation */

export interface FirstConversation {
  questions: string[];
  /** Each answer and the way it leads to (a WAYS key). */
  paths: { answer: string; way: string }[];
  rule: string;
  /** CB-977: what the agent does once the owner says what they have, in the owner's voice and the agent's. */
  then?: { owner: string; agent: string };
}

/** Eric's rule for the map, verbatim (CB-958). */
export const WAYS_RULE = "Offer only the ways on the map; when the owner's case fits none, say so and offer the closest way.";

export const FIRST_CONVERSATION: Record<WaysRole, FirstConversation> = {
  seller: {
    questions: ['What do you have to sell: goods, or a service you perform?', 'How much of it do you have, or which times are you open?', 'How do you want to sell it: once, in quantity, by quote, by auction, by appointment, or from a warehouse?'],
    paths: [
      { answer: 'One item or a few used ones, and no online store', way: 'used_goods' },
      { answer: 'Cases, pallets or a stock count, sold in quantity', way: 'stock_in_quantity' },
      { answer: 'Everything at once, to clear it', way: 'whole_stock' },
      { answer: 'A price that depends on the buyer or the job, by quote or a private offer to one buyer', way: 'quote_on_request' },
      { answer: 'Goods stored at a member warehouse', way: 'at_a_warehouse' },
      { answer: 'An online store that already exists', way: 'existing_store' },
      { answer: 'One lot, sold to the highest bidder above a lowest price', way: 'auction' },
      { answer: 'A service I perform, by appointment', way: 'service' },
      { answer: 'A group buy, where several buyers share one order', way: 'planned_selling' },
    ],
    rule: WAYS_RULE,
    then: {
      owner: 'When I tell you what I have, read its listing profile before you list it: commercebook_capabilities action profile with my words. Ask me the questions it names, one at a time.',
      agent: 'When your owner says what they have, read its listing profile before you list it: commercebook_capabilities action profile with the owner\'s words. Ask your owner the questions it names, one at a time.',
    },
  },
  buyer: {
    questions: ['What do you need: goods, or a service done?', 'How much of it do you need, or when?', 'How do you want to buy it: once, in quantity, by quote, by auction, by appointment, or picked up near you?'],
    paths: [
      { answer: 'One item, once', way: 'one_thing' },
      { answer: 'Cases, pallets or repeat supplies for a business', way: 'business_quantity' },
      { answer: 'By quote, or nothing on the market fits', way: 'request' },
      { answer: 'Something large, or picked up near you', way: 'large_items' },
      { answer: 'A lot in an auction, by bidding', way: 'auction_bid' },
      { answer: 'A service, such as a repair visit, at a set time', way: 'book_service' },
    ],
    rule: WAYS_RULE,
  },
  warehouse: {
    questions: ['What do you have or need: space to fill, supplies to buy, goods to sell, or space elsewhere?', 'How much of it: pallet positions, supply items or goods?', 'How do you want to work: once, in quantity, by quote, or from another warehouse?'],
    paths: [
      { answer: 'Space to fill', way: 'fill_space' },
      { answer: 'Supplies that cost too much', way: 'cut_supply_costs' },
      { answer: 'Goods the warehouse owns, to sell', way: 'sell_floor_stock' },
      { answer: 'Space at another warehouse', way: 'find_space' },
      { answer: 'Goods sellers store with you, to ship', way: 'work_queue' },
    ],
    rule: WAYS_RULE,
  },
};

/* ------------------------------------------------------------------ reads */

export const waysFor = (role: WaysRole): Way[] => WAYS.filter((w) => w.role === role);
export const wayByKey = (key: string): Way | undefined => WAYS.find((w) => w.key === key);

/** "October 29, 2026" for a calendar date (read at noon UTC so no time zone moves the day). */
export function waysDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
}

/** "used and surplus goods since October 29, 2026; local pickup since October 29, 2026". */
export function sinceWords(w: Way): string {
  return w.since.map((s) => `${s.label} since ${waysDate(s.since)}`).join('; ');
}

/* ------------------------------------------------------------------ Markdown */

/** Where the map is rendered: the owner-voice instructions files, the agent-voice briefings and llms.txt. */
export type WaysVoice = 'owner' | 'agent';
/** Resolves a planned row to its words ("planned, no date"); the renderer passes it in from coming.md. */
export type PlannedWords = (p: WayPlanned) => string;

const OWNER_LABEL: Record<WaysVoice, string> = { owner: 'Waits for me', agent: 'Waits for your owner' };
const stepMd = (s: WayStep, i: number) => `${i + 1}. \`${s.tool}\` action \`${s.action}\`: ${s.does}.`;

/** One way as Markdown under a ### heading (the instructions files and the briefings). */
export function wayMarkdown(w: Way, n: number, voice: WaysVoice, planned: PlannedWords, level = 3): string {
  const h = '#'.repeat(level);
  const out = [`${h} ${n}. ${w.name}`, '', `For: ${w.for}`];
  if (w.steps.length) out.push('', ...w.steps.map(stepMd));
  if (w.planned?.length && !w.steps.length) out.push('', ...w.planned.map((p) => `- ${p.feature}: ${planned(p)}.`));
  out.push('', `Costs: ${w.costs}`);
  if (w.steps.length) out.push(`${OWNER_LABEL[voice]}: ${w.owner}.`);
  if (w.since.length) out.push(`Available since: ${sinceWords(w)}.`);
  for (const note of w.notes) out.push(`- ${note}`);
  for (const miss of w.not_today) out.push(`- ${miss}`);
  if (w.planned?.length && w.steps.length) out.push(`- Planned for this way: ${w.planned.map((p) => `${p.feature} (${planned(p)})`).join('; ')}.`);
  return out.join('\n');
}

/** The whole map of a role as Markdown: the heading, the account steps, then each way. */
export function waysMarkdown(role: WaysRole, voice: WaysVoice, planned: PlannedWords, level = 2): string {
  const o = WAYS_OPENING[role];
  const h = '#'.repeat(level);
  const out = [`${h} ${o.heading}`, '', o.intro, '', `${o.before.sentence} ${o.before.steps.map((s) => `\`${s.tool}\` action \`${s.action}\` ${s.does}`).join('. ')}. ${OWNER_LABEL[voice]}: ${o.before.owner}.`];
  waysFor(role).forEach((w, i) => out.push('', wayMarkdown(w, i + 1, voice, planned, level + 1)));
  return out.join('\n');
}

/** The way's number in its role's map (1-based). */
export const wayNumber = (key: string): number => {
  const w = wayByKey(key);
  return w ? waysFor(w.role).findIndex((x) => x.key === key) + 1 : 0;
};

/** The first conversation as Markdown (the instructions files: "ask me"; the briefings and llms.txt: "ask your owner"). */
export function firstConversationMarkdown(role: WaysRole, voice: WaysVoice, level = 2): string {
  const f = FIRST_CONVERSATION[role];
  const h = '#'.repeat(level);
  const who = voice === 'owner' ? 'me' : 'your owner';
  const heading = WAYS_OPENING[role].heading;
  return [
    `${h} Your first conversation`,
    '',
    `On the first task, ask ${who} three questions, one at a time:`,
    '',
    ...f.questions.map((q, i) => `${i + 1}. "${q}"`),
    '',
    `Then take the path that fits the answers, from ${heading} below:`,
    '',
    ...f.paths.map((p) => `- ${p.answer}: way ${wayNumber(p.way)}, ${wayByKey(p.way)?.name}.`),
    '',
    f.rule,
    ...(f.then ? ['', voice === 'owner' ? f.then.owner : f.then.agent] : []),
  ].join('\n');
}

/** The first conversation in one paragraph (the briefings, above the map): the three questions, then the rule. */
export function firstConversationParagraph(role: WaysRole): string {
  const q = FIRST_CONVERSATION[role].questions.map((x) => `"${x}"`);
  const then = FIRST_CONVERSATION[role].then;
  return `On the first task, ask your owner three questions, one at a time: ${q.slice(0, -1).join(', ')} and ${q[q.length - 1]} Then take the way below that fits the answers. ${WAYS_RULE}${then ? ` ${then.agent}` : ''}`;
}

/** The map of a role for a briefing: the heading, the first conversation, the account steps, then each way. */
export function waysBriefingMarkdown(role: WaysRole, planned: PlannedWords): string {
  const md = waysMarkdown(role, 'agent', planned, 3).split('\n');
  // The heading, a blank line, then the first conversation before the intro.
  return [md[0], '', firstConversationParagraph(role), ...md.slice(1)].join('\n');
}

/** llms.txt: one line per way, for every role. */
export function waysLlmsSection(planned: PlannedWords): string {
  const out = ['## Ways to sell, buy or use the network', '', `Ask your owner three questions first: what they have or need, how much of it, and how they want to sell or buy it: once, in quantity, by quote, or from a warehouse. Then take the way that fits. ${WAYS_RULE} The same map as JSON, with the tool steps: GET https://commercebook.ai/api/v1/ways?role=seller (or buyer, or warehouse), the MCP tool commercebook_capabilities action ways, with no key.`];
  for (const role of WAYS_ROLES) {
    out.push('', `${WAYS_OPENING[role].heading}:`, '');
    waysFor(role).forEach((w, i) => {
      if (!w.steps.length) {
        out.push(`${i + 1}. ${w.name}: ${w.planned?.map((p) => `${p.feature} (${planned(p)})`).join('; ')}. ${MISSING} these today.`);
        return;
      }
      const steps = w.steps.map((s) => `${s.tool} action ${s.action}`).join(', then ');
      out.push(`${i + 1}. ${w.name}. For: ${w.for} Steps: ${steps}. Costs: ${w.costs} Waits for your owner: ${w.owner}.${w.since.length ? ` Available since: ${sinceWords(w)}.` : ''}`);
    });
  }
  return out.join('\n');
}

/* ------------------------------------------------------------------ matching plain words to a way */

const norm = (s: string): string => ` ${s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
/** A count of goods: "2,000 cases", "40 pallets", "500 units". */
const QUANTITY_RE = /\b\d{1,3}(?:,\d{3})+\b|\b\d{2,}\b/;
const UNIT_RE = /\b(cases?|pallets?|cartons?|boxes|units?|pieces?|pcs|rolls?|skids?|packs?|dozen|gross|truckloads?|containers?)\b/;
const SELL_CUE = /\b(i have|we have|i own|we own|i got|weve got|ive got|sell|selling|list|listing|get rid of|clear|liquidat\w*|offload|unload|consign\w*)\b/;
const BUY_CUE = /\b(i need|we need|need|buy|buying|purchase|looking for|find me|source|want to buy|shop for)\b/;
const WAREHOUSE_CUE = /\b(my warehouse|our warehouse|we run a warehouse|pallet positions|dock|3pl|leads|our space|we are full)\b/;

export interface WayMatch {
  role: WaysRole;
  key: string;
  name: string;
  /** The score of the match (the phrases found, weighted by their length, and the role and quantity cues). */
  score: number;
}

/**
 * The way that fits plain words ("I have a garage full of used tools", "I have 2,000 cases of tape"), or null when no
 * situation word is in them. role narrows the map to one role; without it the words' cues choose (have or sell: a
 * seller; need or buy: a buyer; our warehouse, pallet positions: a warehouse).
 */
export function matchWays(text: string, role: WaysRole | null = null, limit = 3): WayMatch[] {
  const t = norm(text);
  const quantity = QUANTITY_RE.test(text) && UNIT_RE.test(t);
  const cue: WaysRole | null = WAREHOUSE_CUE.test(t) ? 'warehouse' : SELL_CUE.test(t) ? 'seller' : BUY_CUE.test(t) ? 'buyer' : null;
  const scored = WAYS.filter((w) => !role || w.role === role).map((w) => {
    let score = 0;
    for (const phrase of w.words.split(',').map((x) => norm(x).trim()).filter(Boolean)) {
      if (t.includes(` ${phrase} `)) score += phrase.split(' ').length;
    }
    if (score > 0 && cue && w.role === cue) score += 1.5;
    if (quantity && (w.key === 'stock_in_quantity' || w.key === 'business_quantity')) score += 2 + (cue === w.role ? 1.5 : 0);
    return { role: w.role, key: w.key, name: w.name, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.max(1, limit));
}

/** The best way for plain words, or null. */
export function matchWay(text: string, role: WaysRole | null = null): WayMatch | null {
  return matchWays(text, role, 1)[0] ?? null;
}
