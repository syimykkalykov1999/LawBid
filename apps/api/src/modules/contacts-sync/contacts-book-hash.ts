/**
 * Owner 2026-10-22 (like Telegram's contacts hash): the hash of a phone
 * book is the XOR of the SHA-256 hashes of its numbers (64 hex). It does
 * not depend on the order, and adding or removing one number is one XOR, so
 * the server updates it from a delta without reading the stored book, and
 * the app computes the same value from its own book
 * (apps/mobile/lib/features/contacts_sync/data/contacts_book.dart).
 */
export const EMPTY_BOOK_HASH = '0'.repeat(64);

/** [hash] XOR every element of [items] (all lowercase 64-hex). */
export function xorBookHash(hash: string, items: Iterable<string>): string {
  const acc = Buffer.from(hash, 'hex');
  for (const item of items) {
    const b = Buffer.from(item, 'hex');
    for (let i = 0; i < 32; i++) acc[i] ^= b[i];
  }
  return acc.toString('hex');
}

/** The hash of a whole book. */
export function bookHashOf(items: Iterable<string>): string {
  return xorBookHash(EMPTY_BOOK_HASH, items);
}
