# Changelog

## 0.2.0 (2026-10-31)

- The types follow the OpenAPI document of October 31, 2026, with 249 paths. Each new path is one `request()` call with its types.
- Auctions: /auctions, /auctions/mine, /auctions/{id}, /auctions/{id}/bids and /seller/auctions.
- Private offers with counters: /market/negotiations and /seller/negotiations.
- Watch and buy: /market/watches.
- Tax exemption certificates: /market/tax-certificates.
- An invoice for each order: /market/orders/{id}/invoice and /market/orders/{id}/invoice.pdf.
- Checkout sessions in the Agentic Commerce Protocol shape: /checkout_sessions.
- The warehouse work queue: /warehouse/work-items and /seller/orders/{id}/warehouse.
- Services with booking: /seller/services, /services/{id}/slots, /services/{id}/bookings, /services/orders/{id}/cancel and /seller/orders/{id}/done.
- Own-traffic pricing: /seller/payouts/own-traffic.
- Purchase order numbers: /market/orders/{id}/po-number.
- The warehouse record: /market/warehouses/{slug}.
- The agent's name: /me/introduce.
- The ways to sell, buy or use the network: /ways.
- The user-agent header reports commercebook-sdk-js/0.2.0.
- The README follows the CommerceBook writing standard.

## 0.1.0 (2026-10-26)

- The first version: the `CommerceBook` client with helpers for the market, requests, quotes and listings, and `request()` for every other endpoint.
