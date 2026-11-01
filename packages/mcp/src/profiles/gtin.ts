/**
 * CB-997 (SPEC-144): a valid product code. A UPC-A (12 digits), an EAN-13 or ISBN-13 (13) or a GTIN-14 (14) whose last
 * digit is the GS1 check digit, and not all zeros. A product with one goes live without a photo, because a buyer's agent
 * identifies it from the code (Eric, 2026-11-01 01:56 CT). listing_profile_holds() (migration 198) reads the same rule
 * through gtin_valid(); qa/cb997-photo-optional-with-gtin.mjs proves the two agree.
 * GTIN-8 is left out on purpose: the brief names the three lengths, and an 8-digit code is short enough to collide.
 * Pure: no imports and no I/O.
 */
export function isValidGtin(v: unknown): boolean {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isInteger(v) ? String(v) : '';
  if (!/^(?:\d{12}|\d{13}|\d{14})$/.test(s) || /^0+$/.test(s)) return false;
  const body = s.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    // From the right of the body: the first digit weighs 3, the next 1, and so on.
    const fromRight = body.length - 1 - i;
    sum += Number(body[i]) * (fromRight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(s[s.length - 1]);
}
