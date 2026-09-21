/**
 * Parses `JWT_KEYS` ("kid1:secret1,kid2:secret2") into a lookup map.
 * Multiple kids support zero-downtime secret rotation: the active kid
 * signs new tokens, every listed kid can still verify old ones until they
 * naturally expire (docs/CHANGELOG.md, stage 1.4).
 */
export function parseJwtKeys(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of raw.split(',')) {
    const idx = pair.indexOf(':');
    const kid = pair.slice(0, idx);
    const secret = pair.slice(idx + 1);
    map.set(kid, secret);
  }
  return map;
}
