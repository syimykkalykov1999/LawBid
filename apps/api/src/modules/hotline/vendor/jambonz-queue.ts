/**
 * Copied from jambonz/realtimedb-helpers 0.8.23 (MIT, Copyright (c) Dave
 * Horton / jambonz — https://github.com/jambonz/realtimedb-helpers),
 * lib/sorted-set/sorted-set-length.js and the ZRANK step of
 * lib/sorted-set/sorted-set-position.js: the call-center queue as a Valkey
 * sorted set, oldest first. Changes: TypeScript types, our logger is the
 * caller's (the original swallowed errors into its own logger and returned
 * undefined; here a Valkey error propagates). Notice: apps/api/THIRD_PARTY_NOTICES.md.
 */
import type Redis from 'ioredis';

/** sorted-set-length.js: how many wait in the queue. */
export async function sortedSetLength(
  client: Pick<Redis, 'zcard'>,
  listName: string,
): Promise<number> {
  const result = await client.zcard(listName);
  return result;
}

/** sorted-set-position.js (ZRANK of one known member): the 0-based place,
 * null when it is not in the queue. */
export async function sortedSetRank(
  client: Pick<Redis, 'zrank'>,
  listName: string,
  item: string,
): Promise<number | null> {
  const rank = await client.zrank(listName, item);
  return rank === null || rank === undefined ? null : Number(rank);
}
