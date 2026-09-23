import { compareVersions, isVersionBelow } from './semver.util';

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns -1 when the first version is lower', () => {
    expect(compareVersions('1.2.3', '1.3.0')).toBe(-1);
    expect(compareVersions('0.1.0', '0.1.1')).toBe(-1);
    expect(compareVersions('1.9.9', '2.0.0')).toBe(-1);
  });

  it('returns 1 when the first version is higher', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
  });

  it('treats missing trailing segments as 0', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2', '1.2.1')).toBe(-1);
  });

  it('ignores a build-number/prerelease suffix', () => {
    expect(compareVersions('0.1.0+1', '0.1.0')).toBe(0);
    expect(compareVersions('0.1.0+5', '0.1.1')).toBe(-1);
  });

  it('returns null for unparseable input instead of throwing', () => {
    expect(compareVersions('not-a-version', '1.0.0')).toBeNull();
    expect(compareVersions('1.0.0', '')).toBeNull();
    expect(compareVersions('', '')).toBeNull();
  });
});

describe('isVersionBelow', () => {
  it('is true only when the version is strictly below the minimum', () => {
    expect(isVersionBelow('0.1.0', '0.2.0')).toBe(true);
    expect(isVersionBelow('0.2.0', '0.2.0')).toBe(false);
    expect(isVersionBelow('0.3.0', '0.2.0')).toBe(false);
  });

  it('never blocks on unparseable input', () => {
    expect(isVersionBelow('garbage', '0.2.0')).toBe(false);
    expect(isVersionBelow('0.1.0', 'garbage')).toBe(false);
  });
});
