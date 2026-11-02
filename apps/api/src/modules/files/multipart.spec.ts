import {
  DEFAULT_PART_BYTES,
  MAX_PARTS,
  MIB,
  missingParts,
  partsComplete,
  planParts,
} from './multipart';

describe('multipart plan', () => {
  it('uses 8 MiB parts; the last one is the remainder', () => {
    expect(planParts(20 * MIB)).toEqual({
      partSizeBytes: DEFAULT_PART_BYTES,
      partCount: 3,
    });
    expect(planParts(16 * MIB).partCount).toBe(2);
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
    const plan = planParts(30 * MIB); // 4 parts
    expect(
      missingParts(plan, [
        { partNumber: 1, size: 8 * MIB, etag: 'a' },
        { partNumber: 3, size: 8 * MIB, etag: 'c' },
      ]),
    ).toEqual([2, 4]);
    expect(missingParts(plan, [])).toEqual([1, 2, 3, 4]);
  });

  it('accepts only a complete, exactly sized set of parts', () => {
    const size = 20 * MIB;
    const plan = planParts(size);
    const ok = [
      { partNumber: 1, size: 8 * MIB, etag: 'a' },
      { partNumber: 2, size: 8 * MIB, etag: 'b' },
      { partNumber: 3, size: 4 * MIB, etag: 'c' },
    ];
    expect(partsComplete(plan, size, ok)).toBe(true);
    expect(partsComplete(plan, size, ok.slice(0, 2))).toBe(false);
    expect(
      partsComplete(plan, size, [ok[0], { ...ok[1], size: 7 * MIB }, ok[2]]),
    ).toBe(false);
    expect(
      partsComplete(plan, size, [ok[0], ok[1], { ...ok[2], size: 5 * MIB }]),
    ).toBe(false);
    expect(partsComplete(plan, size, [ok[1], ok[0], ok[2]])).toBe(false);
  });
});
