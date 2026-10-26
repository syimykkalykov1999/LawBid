import {
  assertExpectedVersion,
  BUMP_VERSION,
  parseIfMatch,
  staleVersion,
} from './optimistic-lock';
import { ErrorCode } from '../errors/error-code.enum';

describe('optimistic-lock', () => {
  it('parses plain, quoted and weak If-Match values', () => {
    expect(parseIfMatch('3')).toBe(3);
    expect(parseIfMatch('"4"')).toBe(4);
    expect(parseIfMatch('W/"5"')).toBe(5);
    expect(parseIfMatch(['6'])).toBe(6);
  });

  it('treats a missing header, empty value and * as no check', () => {
    expect(parseIfMatch(undefined)).toBeUndefined();
    expect(parseIfMatch('')).toBeUndefined();
    expect(parseIfMatch('*')).toBeUndefined();
  });

  it('rejects garbage with VALIDATION_ERROR', () => {
    expect(() => parseIfMatch('abc')).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }),
      }),
    );
    expect(() => parseIfMatch('-1')).toThrow();
  });

  it('passes when nothing is sent or the version matches', () => {
    expect(() => assertExpectedVersion(7, undefined)).not.toThrow();
    expect(() => assertExpectedVersion(7, 7)).not.toThrow();
  });

  it('throws 409 STALE_VERSION with the current version when stale', () => {
    let caught: unknown;
    try {
      assertExpectedVersion(8, 7);
    } catch (e) {
      caught = e;
    }
    const err = caught as ReturnType<typeof staleVersion>;
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse()).toMatchObject({
      code: ErrorCode.STALE_VERSION,
      details: { currentVersion: 8 },
    });
  });

  it('bumps by one', () => {
    expect(BUMP_VERSION).toEqual({ version: { increment: 1 } });
  });
});
