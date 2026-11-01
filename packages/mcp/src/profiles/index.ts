/**
 * CB-977 (SPEC-131): listing profiles, one source. The listing form (src/features/seller), the fact sheet
 * (netlify/functions/lib/lot-page-render.ts through src/lib/fact-sheet.ts), the agent's profile read (GET /api/v1/profiles,
 * commercebook_capabilities action profile), the import and publish check (the compiled rules in listing_profile_rules,
 * migration 191) and the feeds (google_product_category from the taxonomy map) all read this module.
 * Research: deliverables/commercebook-listing-profiles-2026-10-31/research-record.md (facts and fields) and
 * gpt-5.6-answer.md (the data model).
 */
export * from './types.js';
export { BASE_FIELDS, BASE_FULFILMENT, CONDITION_GRADES, GOODS_KINDS } from './base.js';
export { MODULES, MODULE_BY_KEY, MODULE_KEYS, moduleRules } from './modules.js';
export { CB_CATEGORY_NODES, CB_CATEGORY_NOTES, FREE_TEXT_NODES, OVERLAYS, OVERLAY_BY_KEY, WAREHOUSE_KEY_NODES } from './overlays.js';
export { ADULT_REASON, POLICY_BY_KEY, POLICY_RULES } from './policy.js';
export * from './engine.js';
