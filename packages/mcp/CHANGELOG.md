# Changelog

## 0.5.0 (2026-10-31)

- Auctions with a reserve: `commercebook_market` actions auctions and auction (no key), `commercebook_buy` actions auction_status, auction_bid and my_bids, and `commercebook_seller_orders` actions auction_open, auction_status, auction_close_early and auctions_list.
- Private offers with counters: the new tools `commercebook_private_offers` for buyers and `commercebook_seller_private_offers` for sellers.
- Watch and buy: `commercebook_requests` action post takes auto_buy, and actions watch_list and watch_withdraw read and end a watch.
- Tax exemption certificates: `commercebook_buy` actions tax_certificate_list and tax_certificate_add.
- An invoice PDF for each order: `commercebook_buy` action invoice_pdf.
- Checkout sessions in the Agentic Commerce Protocol shape: `commercebook_buy` actions checkout_create, checkout_update, checkout_get, checkout_complete and checkout_cancel.
- The warehouse work queue: the new tool `commercebook_work_queue` for warehouses, and `commercebook_seller_orders` actions warehouse_status and warehouse_exception.
- Services with booking: `commercebook_seller_products` actions service_list, services, service and availability_set, `commercebook_market` action service_slots, `commercebook_buy` actions book and booking_cancel, and `commercebook_seller_orders` action done.
- Own-traffic pricing: `commercebook_seller_money` actions own_traffic_link and own_traffic_stats, and `commercebook_buy` action place takes via_code.
- Purchase order numbers and a monthly budget: `commercebook_buy` action po_number, action place takes po_number, and the key limits take a monthly budget.
- Ratings on four scores: `commercebook_buy` action rate takes goods as described, packing, speed and communication.
- The warehouse record: `commercebook_market` action warehouse.
- The agent's name: `commercebook_start` action introduce.
- The ways to sell, buy or use the network: `commercebook_capabilities` action ways.
- What a listing in one category needs: `commercebook_capabilities` action profile.
- The README follows the CommerceBook writing standard and lists every tool with its actions.

## 0.4.3 (2026-10-31)

- A shorter tool description for `commercebook_leads`, with its actions listed under the activity they need and the longer line of each action in the action argument. Every tool description is under 1,500 characters.

## 0.4.2 (2026-10-30)

- Shorter tool descriptions for `commercebook_seller_products` and `commercebook_costs`.
- `commercebook_events` and `commercebook_webhooks` are labelled for any member key.
- The README lists every tool.

## 0.4.1 (2026-10-28)

- The package links the source repository errc02/commercebook-agents.

## 0.4.0 (2026-10-27)

- The tools are grouped by task. Each takes action and that action's arguments.
- `tools/list` answers the keyless tools or a role's tools (role buyer, seller, warehouse or all).
- `commercebook_tool_search` finds the tool for plain words.
- The 202 single-action names of 0.3 answer until January 25, 2027, with a deprecated_use note.
