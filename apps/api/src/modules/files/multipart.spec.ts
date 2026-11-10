import {
  DEFAULT_PART_BYTES,
  LEGACY_PART_BYTES,
  MAX_PARTS,
  MIB,
  MIN_MULTIPART_BYTES,
  missingParts,
  partsComplete,
  planFromUploaded,
  planParts,
} from './multipart';

describe('multipart plan', () => {
  // Owner 2026-11-09: parts for every file S3 / R2 can cut. S3 wants every
  // part but the last ≥ 5 MiB, so anything over 5 MiB goes in 5 MiB parts.
  it('uses 5 MiB parts (the S3 minimum) for anything over 5 MiB', () => {
    expect(DEFAULT_PART_BYTES).toBe(5 * MIB);
    expect(MIN_MULTIPART_BYTES).toBe(5 * MIB + 1);
    expect(planParts(20 * MIB)).toEqual({
      partSizeBytes: 5 * MIB,
      partCount: 4,
    });
    expect(planParts(5 * MIB + 1)).toEqual({
      partSizeBytes: 5 * MIB,
      partCount: 2,
    });
  });

  it('an upload begun with 8 MiB parts before the change resumes as begun', () => {
    const size = 30 * MIB;
    const legacy = [{ partNumber: 1, size: LEGACY_PART_BYTES, etag: 'a' }];
    expect(planFromUploaded(size, legacy)).toEqual({
      partSizeBytes: LEGACY_PART_BYTES,
      partCount: 4,
    });
    expect(planFromUploaded(size, [])).toEqual(planParts(size));
    expect(
      planFromUploaded(size, [{ partNumber: 1, size: 5 * MIB, etag: 'a' }]),
    ).toEqual(planParts(size));
  });

  it('grows the part so a huge file stays within MAX_PARTS', () => {
    const plan = planParts(1024 * MIB * 10);
    expect(plan.partCount).toBeLessThanOrEqual(MAX_PARTS);
    expect(plan.partSizeBytes % MIB).toBe(0);
    expect(plan.partSizeBytes * plan.partCount).toBeGreaterThanOrEqual(
      1024 * MIB * 10,
    );
  });

  it('lists the missing parts after an interruption', () => {
    const plan = planParts(30 * MIB); // 6 parts
    expect(
      missingParts(plan, [
        { partNumber: 1, size: 5 * MIB, etag: 'a' },
        { partNumber: 3, size: 5 * MIB, etag: 'c' },
      ]),
    ).toEqual([2, 4, 5, 6]);
    expect(missingParts(plan, [])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('accepts only a complete, exactly sized set of parts', () => {
    const size = 14 * MIB;
    const plan = planParts(size);
    const ok = [
      { partNumber: 1, size: 5 * MIB, etag: 'a' },
      { partNumber: 2, size: 5 * MIB, etag: 'b' },
      { partNumber: 3, size: 4 * MIB, etag: 'c' },
    ];
    expect(partsComplete(plan, size, ok)).toBe(true);
    expect(partsComplete(plan, size, ok.slice(0, 2))).toBe(false);
    expect(
      partsComplete(plan, size, [ok[0], { ...ok[1], size: 4 * MIB }, ok[2]]),
    ).toBe(false);
    expect(
      partsComplete(plan, size, [ok[0], ok[1], { ...ok[2], size: 3 * MIB }]),
    ).toBe(false);
    expect(partsComplete(plan, size, [ok[1], ok[0], ok[2]])).toBe(false);
  });
});
