/*
 * Copied from the GrowthBook JavaScript SDK, tag v5.2.0
 * (https://github.com/growthbook/growthbook, packages/sdk-js/src/util.ts,
 * functions `hashFnv32a` and `hash` with version 2). MIT License,
 * Copyright (c) 2025 GrowthBook, Inc. — full text in
 * apps/api/THIRD_PARTY_NOTICES.md. Only the version-2 branch is kept: our
 * version 1 is the older in-house FNV-1a (`hash01`), not GrowthBook's v1.
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

/**
 * GrowthBook hash version 2 ("new unbiased hashing algorithm"): a number in
 * [0, 1) with 4 decimals. Hashing the decimal string of the first hash
 * spreads near-identical inputs and breaks the correlation between seeds.
 */
export function growthbookHash(seed: string, value: string): number {
  return (hashFnv32a(hashFnv32a(seed + value) + '') % 10000) / 10000;
}
