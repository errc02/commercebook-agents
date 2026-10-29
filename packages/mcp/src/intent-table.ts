/**
 * SPEC-84: the tools grouped by what the agent is trying to do. Each intent tool takes `action` (an enum naming one of
 * today's operations) and that operation's arguments, validated with the operation's own schema; the operation is the
 * single-action tool of version 0.3 (one per REST endpoint), which keeps its name for 90 days as an alias that answers
 * with a deprecated_use note. The REST API is unchanged.
 *
 * Pure data, no imports: the server (intent-surface.ts), the parity check, the document generators and the app's
 * seller capabilities read the same table. `op` is the 0.3 tool name the action runs; `line` is the one plain line the
 * tool description prints for it (the activity is added from the operation's endpoint); `words` are extra phrases
 * commercebook_tool_search matches; `endpoints` names the REST operations an action reaches when its 0.3 description
 * does not start with the one it calls.
 */

export type IntentRole = 'buyer' | 'seller' | 'warehouse';
/** keyless: listed without a key and without a role, and for every role. */
export type IntentListing = 'keyless' | IntentRole;

export interface IntentAction {
  action: string;
  op: string;
  line: string;
  words?: string;
  endpoints?: string[];
}

export interface IntentTool {
  name: string;
  title: string;
  /** The first sentence of the description: what the agent is trying to do. */
  lead: string;
  /** Where the tool is listed: keyless (always), or the roles it is listed for. */
  listing: IntentListing[];
  /** The action a call without `action` runs (only where the tool's name is also a 0.3 tool name, or one action). */
  defaultAction?: string;
  actions: IntentAction[];
}

/** The 90-day window of the 0.3 names, from the release of 0.4.0. */
export const ALIAS_WINDOW = { days: 90, from: '2026-10-27', until: '2027-01-25', until_words: 'January 25, 2027', version: '0.4.0' } as const;

export const TOOL_SEARCH_NAME = 'commercebook_tool_search';

export const INTENT_TOOLS: IntentTool[] = [
  // ------------------------------------------------------------------ keyless, and every role
  {
    name: 'commercebook_start',
    title: 'Start here',
    lead: 'Start here: the briefing for your role, who the key belongs to and its standing.',
    listing: ['keyless'],
    defaultAction: 'briefing',
    actions: [
      { action: 'briefing', op: 'instructions', line: 'the briefing for a role (role buyer, seller or warehouse): what to do here and the rules', words: 'instructions guide how to start help documentation rules read the briefing getting started' },
      { action: 'whoami', op: 'commercebook_whoami', line: 'who the key belongs to, with the API base and the key prefix', words: 'who am i identity which account my key', endpoints: ['GET /me'] },
      { action: 'me', op: 'commercebook_me', line: 'your member, its company, verification and counts', words: 'my member my company profile account verification' },
      { action: 'standing', op: 'commercebook_my_standing', line: 'your strikes and whether you may post', words: 'strikes suspended posting status standing' },
      { action: 'openapi', op: 'commercebook_openapi', line: 'the OpenAPI document of the API', words: 'api document schema openapi spec endpoints' },
    ],
  },
  {
    name: 'commercebook_market',
    title: 'Read the market',
    lead: 'Read the market with no key: what is for sale, what buyers ask for, a seller record, reach and shipping.',
    listing: ['keyless'],
    actions: [
      { action: 'book', op: 'commercebook_market_book', line: 'what is for sale and what buyers ask for, by category, right now', words: 'book market right now supply demand categories overview what is on the market' },
      { action: 'search', op: 'commercebook_market_search', line: 'products by words, category, price, condition and ship-to state', words: 'search find products look for browse buy items shop price of how much in stock' },
      { action: 'product', op: 'commercebook_market_lot', line: 'one product (lot_id): count, condition, photos, shipping, offers', words: 'product page lot item details read one product read a product' },
      { action: 'seller', op: 'commercebook_market_seller', line: 'a seller record (seller_slug): tier, rates, ratings, products', words: 'seller record seller profile rating trust tier reputation' },
      { action: 'requests', op: 'commercebook_market_intents', line: 'the open requests to buy, with quantity and the most each buyer pays', words: 'open requests demand buyers want intents wanted' },
      { action: 'reach', op: 'commercebook_request_reach', line: 'how many sellers a request in a category reaches, before posting, and the free next step', words: 'request reach how many sellers reach count before posting unaffiliated independent sellers' },
      { action: 'shipping_estimate', op: 'commercebook_market_shipping_estimate', line: 'the lowest and highest shipping of one product to a state or ZIP, with the stock', words: 'shipping estimate cost to ship to a state zip delivery cost freight estimate stock short' },
      { action: 'network_now', op: 'commercebook_network_now', line: 'the network numbers: members, leads this week, prices, savings', words: 'network numbers stats statistics live numbers how big' },
    ],
  },
  {
    name: 'commercebook_capabilities',
    title: 'Read what a seller can do',
    lead: 'Read every seller capability with no key: the ways to offer, to be found and to be paid, with the tool and action for each.',
    listing: ['keyless'],
    defaultAction: 'seller',
    actions: [
      { action: 'seller', op: 'commercebook_seller_capabilities', line: 'every seller capability, grouped (group narrows it); the first call of a seller agent', words: 'seller capabilities what can a seller do sell features ways to offer' },
    ],
  },
  {
    name: 'commercebook_feedback',
    title: 'Tell CommerceBook what would help',
    lead: 'Tell CommerceBook what happened and what would help, with a key or without one, and use the feedback board.',
    listing: ['keyless'],
    defaultAction: 'send',
    actions: [
      { action: 'send', op: 'commercebook_feedback', line: 'a note on what happened and what would help, rating 1 to 5', words: 'feedback note complaint suggestion report an issue tell' },
      { action: 'board', op: 'commercebook_feedback_board', line: 'the feedback board, pinned and most voted first', words: 'feedback board ideas posts' },
      { action: 'read', op: 'commercebook_feedback_read', line: 'one board post with its replies', words: 'feedback post read' },
      { action: 'post', op: 'commercebook_feedback_post', line: 'a new board post under your person’s name', words: 'post to the feedback board' },
      { action: 'reply', op: 'commercebook_feedback_reply', line: 'a reply to a board post', words: 'reply feedback' },
      { action: 'vote', op: 'commercebook_feedback_vote', line: 'add or take back your vote on a post', words: 'vote upvote feedback' },
    ],
  },
  {
    name: 'commercebook_account_start',
    title: 'Open an account',
    lead: 'Open an account for the owner: the owner gets an 8-digit code by email, and confirm answers the key once.',
    listing: ['keyless'],
    actions: [
      { action: 'signup', op: 'signup_start', line: 'ask to open an account (kind warehouse, seller or buyer); the owner gets a code by email', words: 'sign up signup open an account register create account join get a key' },
      { action: 'confirm', op: 'signup_confirm', line: 'the email and the 8-digit code; answers the key once', words: 'confirm the code verification code email code finish sign up' },
    ],
  },

  // ------------------------------------------------------------------ buyer (every key reaches these)
  {
    name: 'commercebook_buy',
    title: 'Buy on the market',
    lead: 'Buy on the market: quote an offer, place and pay the order, follow it, and report a problem.',
    listing: ['buyer'],
    actions: [
      { action: 'quote', op: 'commercebook_market_quote', line: 'price one offer at a quantity with shipping to a destination', words: 'quote an offer price check get a price' },
      { action: 'place', op: 'commercebook_market_order_place', line: 'turn an open quote into an order paid from the balance or saved card', words: 'place an order buy checkout pay purchase order' },
      { action: 'orders', op: 'commercebook_market_orders', line: 'the orders you placed, newest first', words: 'my orders purchases list orders' },
      { action: 'order', op: 'commercebook_market_order', line: 'one order you placed: state, amounts, tracking, dispute', words: 'read an order order status one order' },
      { action: 'tracking', op: 'commercebook_market_order_tracking', line: 'the carrier, the tracking number and the events of your order', words: 'track my order tracking where is my order delivery status' },
      { action: 'confirm_delivery', op: 'commercebook_market_order_confirm_delivery', line: 'confirm the goods arrived', words: 'goods arrived received confirm delivery' },
      { action: 'dispute', op: 'commercebook_market_order_dispute', line: 'report a problem with an order (non_delivery, shortage, condition)', words: 'report a problem dispute refund damaged missing not delivered' },
      { action: 'rate', op: 'commercebook_market_order_rate', line: 'rate the goods and the seller from 1 to 5', words: 'rate an order review rating stars' },
      { action: 'shipping_quote', op: 'commercebook_shipping_quote', line: 'what an offer costs to ship to a destination, and the days', words: 'shipping quote cost to ship destination' },
      { action: 'address_check', op: 'commercebook_shipping_address_check', line: 'check a delivery address before an order', words: 'address check validate address deliverable' },
    ],
  },
  {
    name: 'commercebook_requests',
    title: 'Post a request and take quotes',
    lead: 'Post what the owner needs at no cost and take the sellers’ quotes on it.',
    listing: ['buyer'],
    actions: [
      { action: 'post', op: 'commercebook_intent_create', line: 'post a request: title, category, qty, the most you pay each', words: 'post a request standing request need want to buy register a need ask sellers get quotes request a quote ask for quotes rfq sourcing quotes from sellers' },
      { action: 'list', op: 'commercebook_market_intents', line: 'the open requests; with a key, yours in every state (mine)', words: 'my requests list requests' },
      { action: 'quotes', op: 'commercebook_intent_quotes', line: 'the quotes on one of your requests, open ones first', words: 'quotes on my request offers received' },
      { action: 'accept', op: 'commercebook_intent_quote_accept', line: 'accept a quote: the order at its price, paid as an order is', words: 'accept a quote take the offer' },
      { action: 'decline', op: 'commercebook_intent_quote_decline', line: 'decline one quote; the request stays open', words: 'decline a quote reject quote' },
      { action: 'withdraw', op: 'commercebook_intent_withdraw', line: 'take your request off the market', words: 'withdraw a request cancel request' },
    ],
  },
  {
    name: 'commercebook_result_sheets',
    title: 'Result sheets for the owner',
    lead: 'Make one page of ranked candidates for the owner, then list, read or delete your sheets.',
    listing: ['buyer'],
    defaultAction: 'list',
    actions: [
      { action: 'make', op: 'commercebook_result_sheet', line: 'one page with the ranked candidates for the owner', words: 'make a result sheet shortlist compare options page for the owner' },
      { action: 'list', op: 'commercebook_result_sheets', line: 'your sheets that have not expired, newest first', words: 'my result sheets' },
      { action: 'read', op: 'commercebook_result_sheet_get', line: 'one sheet re-read live', words: 'read a result sheet' },
      { action: 'delete', op: 'commercebook_result_sheet_delete', line: 'remove a sheet; its link answers 404 after', words: 'delete a result sheet' },
    ],
  },
  {
    name: 'commercebook_agent_rules',
    title: 'Your rules and limits',
    lead: 'Read the rules the owner set, what you did, and the limits on the key; lower a limit or decline a waiting action.',
    listing: ['buyer', 'seller', 'warehouse'],
    defaultAction: 'rules',
    actions: [
      { action: 'rules', op: 'commercebook_agent_rules', line: 'the rules CommerceBook enforces on every call you make', words: 'rules owner rules agent rules what am i allowed' },
      { action: 'activity', op: 'commercebook_agent_activity', line: 'what your owner’s keys did, with the rule behind each result', words: 'agent activity history what did i do log' },
      { action: 'limits', op: 'commercebook_agent_limits', line: 'the money limits on this key and today’s spend', words: 'spending limit money limits budget cap' },
      { action: 'key_limits', op: 'commercebook_key_limits_get', line: 'the limits on one key (key_id)', words: 'key limits read limits' },
      { action: 'lower_limits', op: 'commercebook_key_limits_set', line: 'lower a limit on a key (only the owner raises one)', words: 'lower a limit tighten limits' },
      { action: 'pending', op: 'commercebook_pending_list', line: 'the actions waiting for the owner', words: 'waiting for the owner pending approvals' },
      { action: 'pending_decide', op: 'commercebook_pending_decide', line: 'decline a waiting action (the owner approves)', words: 'decline a waiting action approval' },
      { action: 'permissions', op: 'commercebook_key_permissions', line: 'what a key may do; with activities, lower them', words: 'permissions activities can act read only', endpoints: ['GET /keys/{id}/permissions', 'PUT /keys/{id}/permissions'] },
    ],
  },

  // ------------------------------------------------------------------ seller
  {
    name: 'commercebook_seller_products',
    title: 'Your products',
    lead: 'Your products: edit them, load the catalog, import, sync Shopify, set ship-from addresses, confirm counts.',
    listing: ['seller'],
    actions: [
      { action: 'list', op: 'commercebook_seller_lots', line: 'your products with state, quantity and price', words: 'my products list products catalog inventory listings' },
      { action: 'read', op: 'commercebook_seller_lot_get', line: 'one product with its offers and ledger rows', words: 'read a product one product' },
      { action: 'update', op: 'commercebook_seller_lot_update', line: 'edit a product, or publish a draft (publish true)', words: 'edit a product update price change quantity publish a draft' },
      { action: 'pause', op: 'commercebook_seller_lot_hold', line: 'pause sales of a product', words: 'pause a product stop selling hold' },
      { action: 'resume', op: 'commercebook_seller_lot_release', line: 'resume sales of a paused product', words: 'resume sales unpause release a product' },
      { action: 'upsert', op: 'commercebook_seller_catalog_upsert', line: 'load up to 500 records; dry_run true shows the changes first', words: 'catalog upsert load the catalog dry run list products standing offer bulk upload price on request' },
      { action: 'import', op: 'commercebook_seller_catalog_import', line: 'import a feed or a file (Google, Shopify, eBay, JSON)', words: 'import a catalog file csv feed import' },
      { action: 'feeds', op: 'commercebook_seller_feeds_list', line: 'the saved feeds and their last runs', words: 'saved feeds' },
      { action: 'feed_add', op: 'commercebook_seller_feed_add', line: 'save a feed URL with a schedule', words: 'add a feed url schedule' },
      { action: 'feed_fetch', op: 'commercebook_seller_feed_fetch', line: 'fetch a saved feed now (dry_run previews)', words: 'fetch a feed now' },
      { action: 'feed_remove', op: 'commercebook_seller_feed_remove', line: 'remove a saved feed; its products stay', words: 'remove a feed' },
      { action: 'shopify', op: 'commercebook_seller_shopify_status', line: 'the Shopify store and the last sync', words: 'shopify status channel store' },
      { action: 'shopify_sync', op: 'commercebook_seller_shopify_sync', line: 'read the connected Shopify store now', words: 'sync shopify import shopify catalog' },
      { action: 'ship_from', op: 'commercebook_seller_ship_from_list', line: 'your ship-from addresses, the default first', words: 'ship from addresses origin' },
      { action: 'ship_from_set', op: 'commercebook_seller_ship_from_set', line: 'add an address, or change one (id)', words: 'add a ship from address change address', endpoints: ['POST /seller/ship-from', 'PATCH /seller/ship-from/{id}'] },
      { action: 'stock_check', op: 'commercebook_seller_reconcile', line: 'stock problems and stale counts', words: 'check stock reconcile stale counts' },
      { action: 'confirm_count', op: 'commercebook_seller_verify', line: 'confirm the count after a physical count', words: 'confirm the count verify stock count' },
    ],
  },
  {
    name: 'commercebook_seller_orders',
    title: 'Orders of your products',
    lead: 'Orders of your products: read them, release one to ship, mark it shipped, cancel, and choose who ships.',
    listing: ['seller'],
    defaultAction: 'list',
    actions: [
      { action: 'list', op: 'commercebook_seller_orders', line: 'orders of your products, newest first', words: 'my orders sales orders received' },
      { action: 'read', op: 'commercebook_seller_order_get', line: 'one order with payment, fulfillment, disputes and refunds', words: 'read an order one order' },
      { action: 'release', op: 'commercebook_seller_order_release', line: 'release an authorised order to ship', words: 'release an order release to ship accept order' },
      { action: 'ship', op: 'commercebook_seller_order_ship', line: 'mark a released order shipped or picked up, or buy_label true', words: 'ship an order mark shipped tracking number picked up fulfil' },
      { action: 'cancel', op: 'commercebook_seller_order_cancel', line: 'cancel before release; the payment is voided', words: 'cancel an order' },
      { action: 'fulfillment', op: 'commercebook_seller_fulfillment', line: 'who ships your orders: you, or a warehouse', words: 'fulfillment settings who ships self warehouse cutoff' },
    ],
  },
  {
    name: 'commercebook_seller_shipping',
    title: 'Shipping profiles and labels',
    lead: 'Shipping for your products: profiles and their rules, the rate card, and the labels of your orders.',
    listing: ['seller'],
    actions: [
      { action: 'profiles', op: 'commercebook_shipping_profiles', line: 'your profiles with their rules and the default', words: 'shipping profiles rules' },
      { action: 'profile_create', op: 'commercebook_shipping_profile_create', line: 'a named profile with its region rules', words: 'create a shipping profile' },
      { action: 'profile_update', op: 'commercebook_shipping_profile_update', line: 'change a profile', words: 'change a shipping profile' },
      { action: 'profile_delete', op: 'commercebook_shipping_profile_delete', line: 'delete a profile that is not the default', words: 'delete a shipping profile', endpoints: ['POST /seller/shipping/profiles/{id}/delete', 'DELETE /seller/shipping/profiles/{id}'] },
      { action: 'profile_default', op: 'commercebook_shipping_profile_set_default', line: 'make a profile the default', words: 'default shipping profile' },
      { action: 'assign', op: 'commercebook_shipping_assign', line: 'put offers or products on a profile', words: 'assign a shipping profile to products' },
      { action: 'rate_card', op: 'commercebook_shipping_rate_card', line: 'upload your carrier rates for an origin ZIP3', words: 'upload a rate card carrier rates' },
      { action: 'label', op: 'commercebook_shipping_label', line: 'the labels of an order, each with a 10-minute PDF link', words: 'print a shipping label pdf' },
      { action: 'label_void', op: 'commercebook_shipping_label_void', line: 'void a label before the first carrier scan', words: 'void a label cancel label' },
      { action: 'tracking', op: 'commercebook_shipping_tracking', line: 'the tracking of an order you sold', words: 'tracking of an order i sold carrier events' },
      { action: 'return_label', op: 'commercebook_shipping_return_label', line: 'buy the label of a return by mail', words: 'return label' },
      { action: 'label_cost', op: 'commercebook_shipping_order_actual', line: 'record what a label cost', words: 'record label cost actual shipping' },
    ],
  },
  {
    name: 'commercebook_seller_requests',
    title: 'Buyer requests for sellers',
    lead: 'The buyers’ requests in your categories: read them, quote one with a live product, and watch categories.',
    listing: ['seller'],
    actions: [
      { action: 'list', op: 'commercebook_seller_intents', line: 'the open requests in your categories, with your quotes', words: 'requests in my categories buyer requests leads demand' },
      { action: 'quote', op: 'commercebook_seller_quote', line: 'your price each for a request, with one of your live products', words: 'quote a request answer a request make an offer bid' },
      { action: 'withdraw_quote', op: 'commercebook_seller_quote_withdraw', line: 'close one of your open quotes', words: 'withdraw a quote' },
      { action: 'watched', op: 'commercebook_seller_category_watch', line: 'the categories you watch', words: 'watched categories' },
      { action: 'watch', op: 'commercebook_seller_category_watch_set', line: 'the whole list of categories to watch for new requests', words: 'category watch watch a category notify me alerts' },
    ],
  },
  {
    name: 'commercebook_seller_money',
    title: 'Payouts, performance and disputes',
    lead: 'Your money and record as a seller: the payout statement, the seller sheet, and the disputes on your orders.',
    listing: ['seller'],
    actions: [
      { action: 'statement', op: 'commercebook_seller_statement', line: 'proceeds after the fee, by order (90 days by default)', words: 'payout statement payouts proceeds earnings money' },
      { action: 'performance', op: 'commercebook_seller_performance', line: 'the seller sheet, live, with the counts behind each rate', words: 'performance seller sheet my rates' },
      { action: 'disputes', op: 'commercebook_seller_disputes', line: 'the disputes on your orders', words: 'disputes complaints' },
      { action: 'dispute_reply', op: 'commercebook_seller_dispute_reply', line: 'your note and evidence on an open dispute', words: 'answer a dispute reply evidence' },
    ],
  },
  {
    name: 'commercebook_seller_account',
    title: 'Your seller account',
    lead: 'Your seller account: readiness, the ledger, business details, policies and warehouse agreements.',
    listing: ['seller'],
    actions: [
      { action: 'me', op: 'commercebook_seller_me', line: 'your seller, what blocks selling, readiness and counts', words: 'seller me readiness blockers am i live' },
      { action: 'ledger', op: 'commercebook_seller_events', line: 'what happened on your account, newest first', words: 'ledger events history' },
      { action: 'business', op: 'commercebook_seller_entity_get', line: 'your business details and what they still need', words: 'business details entity' },
      { action: 'business_update', op: 'commercebook_seller_entity_update', line: 'fill in the business details', words: 'fill in business details legal name ein' },
      { action: 'policies', op: 'commercebook_seller_policies_get', line: 'returns, restocking fee, the lowest price you accept', words: 'my policies returns floor' },
      { action: 'policies_update', op: 'commercebook_seller_policies_update', line: 'change the named policy fields', words: 'change policies offer floor return window' },
      { action: 'policies_accept', op: 'commercebook_seller_policies_accept', line: 'always refused: the owner accepts the policies', words: 'accept policies' },
      { action: 'warehouses', op: 'commercebook_seller_delegations', line: 'your warehouse agreements and their status', words: 'my warehouses warehouse agreements delegations' },
      { action: 'warehouse_options', op: 'commercebook_seller_delegation_warehouses', line: 'verified warehouses that can store and ship for you', words: 'find a warehouse that can ship for me' },
      { action: 'warehouse_ask', op: 'commercebook_seller_delegation_request', line: 'ask a warehouse for a warehouse agreement', words: 'ask a warehouse request agreement' },
      { action: 'warehouse_end', op: 'commercebook_seller_delegation_end', line: 'end a warehouse agreement', words: 'end a warehouse agreement' },
      { action: 'checkout_mode', op: 'commercebook_seller_checkout_mode', line: 'how your buyers pay: on CommerceBook, or (mode shopify, confirm true) on your Shopify checkout', words: 'checkout mode shopify checkout pay on my store my own checkout how buyers pay payment on shopify', endpoints: ['GET /seller/checkout-mode', 'POST /seller/checkout-mode'] },
    ],
  },

  // ------------------------------------------------------------------ warehouse
  {
    name: 'commercebook_leads',
    title: 'The Lead Exchange',
    lead: 'Find and buy leads, or post and manage your own.',
    listing: ['warehouse'],
    actions: [
      { action: 'open', op: 'commercebook_leads_open', line: 'the open leads (service, market narrow them)', words: 'open leads find leads exchange browse leads' },
      { action: 'read', op: 'commercebook_lead_get', line: 'one lead with its quality score', words: 'read a lead one lead' },
      { action: 'buy', op: 'commercebook_lead_buy', line: 'buy a lead within the key’s money limits', words: 'buy a lead purchase lead' },
      { action: 'claim', op: 'commercebook_lead_claim', line: 'buy a lead, paid by balance or saved card', words: 'claim a lead pay for a lead' },
      { action: 'bought', op: 'commercebook_claims_list', line: 'the leads you bought, newest first', words: 'my bought leads claims' },
      { action: 'rate', op: 'commercebook_lead_rate', line: 'rate a lead you bought, once', words: 'rate a bought lead' },
      { action: 'stars', op: 'commercebook_lead_stars', line: 'give a lead you bought 1 to 5 stars, once, within 30 days', words: 'stars star rating rate the poster review a bought lead' },
      { action: 'mark', op: 'commercebook_lead_mark', line: 'pass on a lead (listed last) or save it (the Saved chip); null clears', words: 'pass skip not interested save bookmark keep for later star shortlist mark' },
      { action: 'outcome', op: 'commercebook_claim_outcome', line: 'record what happened with a bought lead', words: 'record an outcome won lost' },
      { action: 'defect', op: 'commercebook_claim_defect', line: 'report a problem with a bought lead (7 days)', words: 'report a defect bounced email refund' },
      { action: 'mine', op: 'commercebook_leads_mine', line: 'the leads you posted, drafts included', words: 'my leads leads i posted' },
      { action: 'post', op: 'commercebook_lead_post', line: 'post a lead from a deal or from fields', words: 'lead post post a lead sell a lead list a lead share a prospect' },
      { action: 'intake', op: 'commercebook_lead_intake', line: 'a draft from an email', words: 'forwarded email lead email read an email draft from email intake' },
      { action: 'update', op: 'commercebook_lead_update', line: 'add details to your lead', words: 'add details to a lead' },
      { action: 'text', op: 'commercebook_lead_text', line: 'change the title, summary or source', words: 'change lead title summary' },
      { action: 'price', op: 'commercebook_lead_price', line: 'change the price of your lead', words: 'change lead price' },
      { action: 'places', op: 'commercebook_lead_places', line: 'how many buyers may buy your lead', words: 'buyer places exclusive' },
      { action: 'withdraw', op: 'commercebook_lead_withdraw', line: 'take your lead off the exchange', words: 'withdraw a lead' },
      { action: 'introduction', op: 'commercebook_lead_introduction', line: 'send the introduction to your lead’s buyers', words: 'send the introduction' },
      { action: 'call', op: 'commercebook_lead_call', line: 'schedule the call with your lead’s buyers', words: 'schedule the call' },
      { action: 'challenge', op: 'commercebook_lead_challenge', line: 'challenge a duplicate of your prospect', words: 'challenge a duplicate' },
      { action: 'defaults', op: 'commercebook_lead_defaults_get', line: 'the price and places a lead takes by default', words: 'lead defaults' },
      { action: 'defaults_set', op: 'commercebook_lead_defaults_set', line: 'change the Lead defaults', words: 'change lead defaults' },
      { action: 'earnings', op: 'commercebook_lead_earnings', line: 'what each of your leads earned: sales, fee, proceeds, held and paid out', words: 'lead earnings my earnings what my leads earned commission payouts money' },
      { action: 'statement', op: 'commercebook_lead_statement', line: 'one line per sale of your leads (from, to)', words: 'lead statement sales statement payout statement for leads' },
    ],
  },
  {
    name: 'commercebook_crm',
    title: 'Deals and the Leads table',
    lead: 'Your CRM: deals, their notes and facts, the import, the share decision and the Leads table.',
    listing: ['warehouse'],
    actions: [
      { action: 'deals', op: 'commercebook_deals_list', line: 'your deals, most recently updated first', words: 'my deals crm pipeline' },
      { action: 'deal', op: 'commercebook_deal_get', line: 'one deal with its notes', words: 'read a deal' },
      { action: 'create', op: 'commercebook_deal_create', line: 'a new deal (name), optionally posted right after', words: 'create a deal add a deal new prospect' },
      { action: 'update', op: 'commercebook_deal_update', line: 'change the named fields of a deal', words: 'update a deal stage' },
      { action: 'delete', op: 'commercebook_deal_delete', line: 'delete an archived deal', words: 'delete a deal' },
      { action: 'note', op: 'commercebook_deal_note_add', line: 'add a note to a deal', words: 'add a deal note' },
      { action: 'import', op: 'commercebook_crm_import', line: 'import deals from CSV text or rows (dry_run previews)', words: 'import deals csv crm import' },
      { action: 'facts', op: 'commercebook_deal_facts_list', line: 'the facts read from a deal’s notes', words: 'deal facts' },
      { action: 'fact_decide', op: 'commercebook_deal_fact_decide', line: 'confirm or reject one fact', words: 'confirm a fact reject a fact' },
      { action: 'facts_extract', op: 'commercebook_deal_facts_extract', line: 'read a deal’s notes again', words: 'extract facts' },
      { action: 'share_decision', op: 'commercebook_deal_share_decision', line: 'mark a deal to share, hold or decline', words: 'share decision' },
      { action: 'leads_table', op: 'commercebook_leads_table', line: 'the Leads table, as the Leads screen shows it', words: 'leads table' },
    ],
  },
  {
    name: 'commercebook_costs',
    title: 'Supply costs',
    lead: 'Your purchases: invoices, Your Prices against the network, rate shopping, the rank, matched prices, network price requests and asking a buyer to share.',
    listing: ['warehouse'],
    actions: [
      { action: 'prices', op: 'commercebook_prices', line: 'your invoiced items against the network quotes', words: 'your prices supply prices what we pay lower what we pay cheaper supplies compare vendor prices overpay benchmark' },
      { action: 'rank', op: 'commercebook_costs_rank', line: 'your rank and the network median per category', words: 'cost rank median' },
      { action: 'summary', op: 'commercebook_costs_summary', line: 'invoices read this month and the biggest saving', words: 'costs summary' },
      { action: 'savings', op: 'commercebook_costs_savings', line: 'the confirmed savings, with totals', words: 'confirmed savings money saved' },
      { action: 'price_match', op: 'commercebook_price_match', line: 'record the price your vendor matched, or the refusal', words: 'record a matched price vendor match' },
      { action: 'invoices', op: 'commercebook_invoices_list', line: 'your invoices and how each was read', words: 'my invoices' },
      { action: 'invoice_upload', op: 'commercebook_invoice_upload', line: 'upload an invoice and read it into Your Prices', words: 'invoice upload upload an invoice add an invoice' },
      { action: 'invoice_parse', op: 'commercebook_invoice_parse', line: 'read an invoice again', words: 'parse an invoice again' },
      { action: 'invoice_delete', op: 'commercebook_invoice_delete', line: 'delete an invoice, its lines and its file', words: 'delete an invoice' },
      { action: 'price_requests', op: 'commercebook_quote_requests', line: 'your network price requests', words: 'network price requests' },
      { action: 'price_request', op: 'commercebook_quote_request', line: 'ask for the network price on an item', words: 'request a network price ask for a price' },
      { action: 'dismiss', op: 'commercebook_cost_dismiss', line: 'hide a category from your savings for now, or show it', words: 'not now dismiss' },
      { action: 'rate_shop', op: 'commercebook_rate_shop', line: 'what the network pays for one item, bought or not, with the vendor of the best price', words: 'rate shop network price new item what do others pay compare price vendor range' },
      { action: 'share_requests', op: 'commercebook_share_requests', line: 'your Ask the Buyer to Share requests, sent and received', words: 'share requests buyer requests pooled order' },
      { action: 'share_request', op: 'commercebook_share_request', line: 'ask the member behind the best price to share the vendor or pool an order', words: 'ask the buyer to share connect with the buyer vendor contact pool an order' },
      { action: 'share_answer', op: 'commercebook_share_answer', line: 'answer a share request: share the contact, add their order, or no thanks', words: 'answer share request share contact add to my order no thanks' },
    ],
  },
  {
    name: 'commercebook_network',
    title: 'The network of warehouses',
    lead: 'The network: the member directory, sellers’ warehouse agreement requests, and capacity between warehouses.',
    listing: ['warehouse'],
    actions: [
      { action: 'members', op: 'commercebook_members', line: 'the directory, with each member’s node id', words: 'member directory members warehouses list' },
      { action: 'member', op: 'commercebook_member_get', line: 'one member’s card with facilities and rate card', words: 'read a member' },
      { action: 'agreements', op: 'commercebook_delegations', line: 'sellers asking you for a warehouse agreement', words: 'warehouse agreement requests delegations' },
      { action: 'agreement_respond', op: 'commercebook_delegation_respond', line: 'accept or decline an agreement request', words: 'answer a warehouse agreement request' },
      { action: 'agreement_end', op: 'commercebook_delegation_end', line: 'end a warehouse agreement', words: 'end a warehouse agreement' },
      { action: 'capacity', op: 'commercebook_capacity_list', line: 'the capacity requests you sent and received', words: 'capacity requests pallet positions space' },
      { action: 'capacity_request', op: 'commercebook_capacity_request', line: 'ask another warehouse for pallet positions', words: 'request capacity need space' },
      { action: 'capacity_quote', op: 'commercebook_capacity_quote', line: 'quote a capacity request you received', words: 'quote a capacity request' },
      { action: 'capacity_accept', op: 'commercebook_capacity_accept', line: 'accept the quote on a request you sent', words: 'accept a capacity quote' },
      { action: 'capacity_quote_withdraw', op: 'commercebook_capacity_quote_withdraw', line: 'take back a quote you gave', words: 'withdraw a capacity quote' },
      { action: 'capacity_withdraw', op: 'commercebook_capacity_request_withdraw', line: 'withdraw a capacity request you sent', words: 'withdraw a capacity request' },
    ],
  },
  {
    name: 'commercebook_messages',
    title: 'Messages',
    lead: 'Messages with other members: threads, the first message to a member, groups, and mute, report or block.',
    listing: ['warehouse'],
    actions: [
      { action: 'threads', op: 'commercebook_threads_list', line: 'your message threads', words: 'inbox threads messages' },
      { action: 'thread', op: 'commercebook_thread_get', line: 'one thread with its messages', words: 'read a thread' },
      { action: 'send', op: 'commercebook_message_send', line: 'send a message in an open thread', words: 'send a message reply' },
      { action: 'start', op: 'commercebook_message_request', line: 'the first message to a member', words: 'message a member contact a member' },
      { action: 'respond', op: 'commercebook_thread_respond', line: 'accept or ignore a message request', words: 'answer a message request' },
      { action: 'mark_read', op: 'commercebook_thread_read', line: 'mark a thread read', words: 'mark read' },
      { action: 'mute', op: 'commercebook_thread_mute', line: 'mute or unmute a thread', words: 'mute a thread' },
      { action: 'report', op: 'commercebook_thread_report', line: 'report a thread or a message', words: 'report a thread' },
      { action: 'block', op: 'commercebook_member_block', line: 'block or unblock a member', words: 'block a member' },
      { action: 'group', op: 'commercebook_group_create', line: 'start a group with members you message', words: 'start a group' },
      { action: 'attachables', op: 'commercebook_attachables', line: 'records you can attach to a message', words: 'attachable records' },
      { action: 'unread', op: 'commercebook_unread_count', line: 'how many messages wait unread', words: 'unread count' },
    ],
  },
  {
    name: 'commercebook_warehouse_profile',
    title: 'Your profile and facilities',
    lead: 'What the network sees of you: the profile, the rate card and your facilities.',
    listing: ['warehouse'],
    actions: [
      { action: 'profile', op: 'commercebook_profile_get', line: 'the profile as it stands', words: 'read the profile' },
      { action: 'completeness', op: 'commercebook_profile_completeness', line: 'the ten Home items and the next step for each', words: 'profile completeness' },
      { action: 'services_catalog', op: 'commercebook_service_catalog', line: 'the standard services, by key', words: 'standard services' },
      { action: 'about', op: 'commercebook_profile_about', line: 'write the About paragraph', words: 'write about' },
      { action: 'services', op: 'commercebook_profile_services', line: 'replace the services list', words: 'set services' },
      { action: 'people', op: 'commercebook_profile_people', line: 'replace the people list', words: 'set people team' },
      { action: 'person_add', op: 'commercebook_profile_person_add', line: 'add one person', words: 'add a person' },
      { action: 'certifications', op: 'commercebook_profile_certifications', line: 'replace the certifications', words: 'set certifications' },
      { action: 'contact', op: 'commercebook_profile_contact', line: 'the profile phone and who sees it', words: 'profile phone' },
      { action: 'logo', op: 'commercebook_profile_logo', line: 'add or replace the logo', words: 'set the logo' },
      { action: 'logo_remove', op: 'commercebook_profile_logo_remove', line: 'remove the logo', words: 'remove the logo' },
      { action: 'rate_card', op: 'commercebook_rate_card_get', line: 'the rate card as published', words: 'read the rate card' },
      { action: 'rate_card_set', op: 'commercebook_rate_card_set', line: 'publish the rate card', words: 'publish the rate card pricing' },
      { action: 'facilities', op: 'commercebook_facilities_list', line: 'your facilities with photos and pins', words: 'my facilities buildings' },
      { action: 'facility_create', op: 'commercebook_facility_create', line: 'add a facility', words: 'add a facility' },
      { action: 'facility_update', op: 'commercebook_facility_update', line: 'change a facility', words: 'change a facility' },
      { action: 'facility_delete', op: 'commercebook_facility_delete', line: 'remove a facility (cannot be undone)', words: 'remove a facility' },
      { action: 'facility_pin', op: 'commercebook_facility_pin', line: 'place the map pin again', words: 'place the pin map' },
      { action: 'media_add', op: 'commercebook_facility_media_add', line: 'add a photo or the video', words: 'add a photo video' },
      { action: 'media_order', op: 'commercebook_facility_media_order', line: 'reorder the photos', words: 'reorder photos' },
      { action: 'media_remove', op: 'commercebook_facility_media_remove', line: 'remove a photo or the video', words: 'remove a photo' },
    ],
  },
  {
    name: 'commercebook_warehouse_account',
    title: 'Settings and payments',
    lead: 'Your settings and payments: contact settings, preferences, saved cards and the balance.',
    listing: ['warehouse'],
    actions: [
      { action: 'settings', op: 'commercebook_settings_get', line: 'your phone, who sees it and message notices', words: 'contact settings' },
      { action: 'settings_contact', op: 'commercebook_settings_contact', line: 'change the phone, its visibility or notices', words: 'change contact settings' },
      { action: 'preferences', op: 'commercebook_preferences_get', line: 'your markets, services, notice email, CRM and the systems you run', words: 'warehouse preferences markets wms crm systems' },
      { action: 'preferences_set', op: 'commercebook_preferences_set', line: 'change the named preferences', words: 'change preferences' },
      { action: 'payment_methods', op: 'commercebook_payment_methods', line: 'the saved cards and the balance', words: 'saved cards payment methods' },
      { action: 'payment_method_remove', op: 'commercebook_payment_method_remove', line: 'always refused: the owner removes a card', words: 'remove a saved card' },
      { action: 'balance', op: 'commercebook_balance', line: 'the balance and its recent events', words: 'balance funds' },
      { action: 'funding_instructions', op: 'commercebook_balance_funding_instructions', line: 'where the owner sends money to the balance', words: 'funding instructions add funds wire ach' },
      { action: 'balance_return', op: 'commercebook_balance_return', line: 'return the balance to the owner’s bank', words: 'return the balance withdraw funds' },
    ],
  },
];

/** A 0.3 name that has no action of its own: network_now, the older name of commercebook_network_now (SPEC-64). */
const EXTRA_ALIASES: Record<string, { tool: string; action: string }> = {
  network_now: { tool: 'commercebook_market', action: 'network_now' },
};

/** The intent tool and action of each 0.3 tool name (the first action that runs it). */
export const ALIASES: Record<string, { tool: string; action: string }> = (() => {
  const out: Record<string, { tool: string; action: string }> = {};
  for (const t of INTENT_TOOLS) for (const a of t.actions) out[a.op] ??= { tool: t.name, action: a.action };
  return { ...out, ...EXTRA_ALIASES };
})();

export const INTENT_TOOL_NAMES: string[] = [...INTENT_TOOLS.map((t) => t.name), TOOL_SEARCH_NAME];
const BY_NAME = new Map(INTENT_TOOLS.map((t) => [t.name, t]));
export function intentTool(name: string): IntentTool | undefined {
  return BY_NAME.get(name);
}

/** The keyless tools: listed without a key and without a role (and for every role). */
export const KEYLESS_INTENT_TOOLS: string[] = [...INTENT_TOOLS.filter((t) => t.listing.includes('keyless')).map((t) => t.name), TOOL_SEARCH_NAME];

/** The tools tools/list answers for a role (the keyless ones first), or every one for role all. */
export function toolsForRole(role: IntentRole | 'all' | null | undefined): string[] {
  if (role === 'all') return [...INTENT_TOOL_NAMES];
  if (!role) return [...KEYLESS_INTENT_TOOLS];
  return [...KEYLESS_INTENT_TOOLS, ...INTENT_TOOLS.filter((t) => t.listing.includes(role)).map((t) => t.name)];
}

/**
 * The 0.3 operation a call runs: an intent tool and its action (or the default action), or a 0.3 name itself. null
 * when the call names no known tool or action. The remote server counts keyless calls by this (the book, network now,
 * the open requests and one product page are not counted, whichever name reaches them).
 */
export function opOf(name: string, args?: unknown): string | null {
  const t = BY_NAME.get(name);
  if (!t) return ALIASES[name] || name === TOOL_SEARCH_NAME ? name : null;
  const a = args && typeof args === 'object' ? (args as { action?: unknown }).action : undefined;
  const action = typeof a === 'string' ? a : t.defaultAction;
  return t.actions.find((x) => x.action === action)?.op ?? null;
}

/** "commercebook_seller_products action upsert" for a 0.3 name, the way the documents name it. */
export function intentWords(op: string): string {
  const a = ALIASES[op];
  return a ? `${a.tool} action ${a.action}` : op;
}

/* ------------------------------------------------------------------ SPEC-85: every public call line from this table */

/**
 * The 0.3 names that are not intent tools themselves (the alias table's keys, less the four names that are both).
 * `network_now` and `instructions` are left out of the text rules below: the first is also an action of
 * commercebook_market and the name of the database function, the second an ordinary word.
 */
export const LEGACY_NAMES: string[] = Object.keys(ALIASES).filter((n) => !BY_NAME.has(n) && n !== TOOL_SEARCH_NAME);
const TEXT_NAMES = LEGACY_NAMES.filter((n) => n !== 'network_now' && n !== 'instructions').sort((a, b) => b.length - a.length);
/** A 0.3 name in a text, as a whole word (the longest name first). */
export const LEGACY_NAME_RE = new RegExp(`(?<![A-Za-z0-9_])(${TEXT_NAMES.join('|')})(?![A-Za-z0-9_])`, 'g');

/** The intent tool and action of an operation (a 0.3 name), or null when the table has none. */
export function intentOf(op: string): { tool: string; action: string } | null {
  return ALIASES[op] ?? null;
}

function mustIntent(op: string): { tool: string; action: string } {
  const a = ALIASES[op];
  if (!a) throw new Error(`intent-table: "${op}" is no operation of the registry`);
  return a;
}

/**
 * One call line: `commercebook_requests {"action": "post", "title", "category"}` from the operation and the text inside
 * the braces (empty for a call with only the action).
 */
export function intentCall(op: string, inner = ''): string {
  const a = mustIntent(op);
  const rest = inner.trim();
  return `${a.tool} {"action": "${a.action}"${rest ? `, ${rest}` : ''}}`;
}

/** "`commercebook_requests` action `post`" (markdown) for an operation. */
export function intentCode(op: string): string {
  const a = mustIntent(op);
  return `\`${a.tool}\` action \`${a.action}\``;
}

/**
 * Every 0.3 name in a text rendered as its intent tool and action, so an older text (a database answer, an operation's
 * own description) reads the names tools/list lists:
 *   `name`        "`tool` action `x`"
 *   name {...}    tool {"action": "x", ...}   (a call line)
 *   name          "tool action x"
 */
export function renderOpNames(text: string): string {
  if (!text) return text;
  return text
    .replace(new RegExp(`\`(${TEXT_NAMES.join('|')})\``, 'g'), (_m, n: string) => intentCode(n))
    .replace(new RegExp(`(?<![A-Za-z0-9_])(${TEXT_NAMES.join('|')}) \\{(\\s*\\})?`, 'g'), (_m, n: string, empty: string | undefined) => {
      const a = mustIntent(n);
      return empty ? `${a.tool} {"action": "${a.action}"}` : `${a.tool} {"action": "${a.action}", `;
    })
    .replace(LEGACY_NAME_RE, (_m, n: string) => intentWords(n));
}

/**
 * The tokens a document source names an operation with (scripts/write-answers.mjs, write-book.mjs and the briefings):
 *   {{tool:<op>}}         "`tool` action `x`"
 *   {{call:<op>}} {...}   tool {"action": "x", ...}
 *   {{call:<op>}}         tool {"action": "x"}
 * An unknown operation throws, so a generator fails on it.
 */
export function renderOpTokens(text: string): string {
  return text
    .replace(/\{\{call:([a-z0-9_]+)\}\} \{(\s*\})?/g, (_m, op: string, empty: string | undefined) => {
      const a = mustIntent(op);
      return empty ? `${a.tool} {"action": "${a.action}"}` : `${a.tool} {"action": "${a.action}", `;
    })
    .replace(/\{\{call:([a-z0-9_]+)\}\}/g, (_m, op: string) => intentCall(op))
    .replace(/\{\{tool:([a-z0-9_]+)\}\}/g, (_m, op: string) => intentCode(op))
    .replace(/\{\{words:([a-z0-9_]+)\}\}/g, (_m, op: string) => {
      mustIntent(op);
      return intentWords(op);
    });
}

/** A build reference ("SPEC-79:", "(SPEC-67)", "SPEC-80 item 8:") in public text. */
export const BUILD_TAG_RE = /\bSPEC-\d+/g;
/** The hits of the two rules a public text must pass: a 0.3 name and a build reference. */
export function publicTextHits(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(LEGACY_NAME_RE)) out.push(m[1]);
  for (const m of text.matchAll(BUILD_TAG_RE)) out.push(m[0]);
  return out;
}

/**
 * An answer an older text wrote (a database answer: a next step's tool, a detail, a hint) with every 0.3 name rendered
 * from this table: a `tool` field naming an operation becomes the intent tool with its `action` beside it, and every
 * string reads the intent words.
 */
export function renderServed<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return renderOpNames(v);
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) {
      const a = k === 'tool' && typeof x === 'string' ? ALIASES[x] : undefined;
      if (a && !BY_NAME.has(x as string)) {
        out.tool = a.tool;
        if (!('action' in o)) out.action = a.action;
      } else out[k] = walk(x);
    }
    return out;
  };
  return walk(value) as T;
}
