// Compile-only check of the helper types (tsc -p test): every input and answer is a real type, never `never`.
import { CommerceBook, CommerceBookError, type Ok } from '../src/index.js';

export async function usage(): Promise<void> {
  const cb = new CommerceBook({ key: 'cb_agent_EXAMPLE' });
  const now = await cb.networkNow();
  const members: number = now.members_verified;
  const found = await cb.searchProducts({ q: 'stretch film', max_price: 3000, limit: 5 });
  const lot = await cb.product(found.items[0].lot_id);
  const q = await cb.quote({ offer_id: lot.offer_id ?? '', quantity: 10, method: 'ship', destination: 'TX' });
  const r = await cb.postRequest({ title: 'Stretch film, 18 inch, 80 gauge', category: 'packaging', qty: 40, ceiling_unit_cents: 2400, notify: true });
  const id: string = r.intent_id;
  const mine = await cb.myRequests();
  const quotes = await cb.requestQuotes(id);
  const accepted: Ok<'marketIntentQuoteAccept'> = await cb.acceptQuote(id, quotes.items[0].id, { method: 'balance' });
  const offer = await cb.postOffer({ item_id: 'SKU-1', title: 'Pallet wrap', price: '24.00', category: 'packaging' }, { dryRun: true });
  const asks = await cb.sellerRequests({ category: 'packaging' });
  const quoted = await cb.quoteRequest(id, { lot_id: lot.lot_id, unit_price_cents: 2300 });
  try {
    await cb.request('GET', '/market/sellers/example');
  } catch (e) {
    if (e instanceof CommerceBookError) console.log(e.status, e.code, e.detail, e.activity, e.hint, e.requestId);
  }
  console.log(members, q, mine.length, accepted, offer, asks, quoted);
}
