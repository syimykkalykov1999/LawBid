/*
 * Vendored from the GrowthBook JS SDK, @growthbook/growthbook 2.0.0
 * (packages/sdk-js/src/util.ts: hashFnv32a, hash), MIT License,
 * Copyright (c) 2025 GrowthBook, Inc. — https://github.com/growthbook/growthbook
 * Copied whole (only reformatted); see apps/api/THIRD_PARTY_NOTICES.md.
 * Test vectors: packages/sdk-js/test/cases.json "hash" (hash.spec.ts).
 */

function hashFnv32a(str: string): number {
  let hval = 0x811c9dc5;
  const l = str.length;

  for (let i = 0; i < l; i++) {
    hval ^= str.charCodeAt(i);
    hval +=
      (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
  }
  return hval >>> 0;
}

export function hash(
  seed: string,
  value: string,
  version: number,
): number | null {
  // New unbiased hashing algorithm
  if (version === 2) {
    return (hashFnv32a(hashFnv32a(seed + value) + '') % 10000) / 10000;
  }
  // Original biased hashing algorithm (keep for backwards compatibility)
  if (version === 1) {
    return (hashFnv32a(value + seed) % 1000) / 1000;
  }

  // Unknown hash version
  return null;
}
