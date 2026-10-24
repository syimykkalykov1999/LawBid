import { providerById } from './provider-registry';

describe('cloudflare_r2 integration (owner 2026-10-24)', () => {
  const p = providerById('cloudflare_r2')!;
  const field = (n: string) => p.fields.find((f) => f.name === n)!;

  it('has the five required fields and two optional purge fields', () => {
    expect(p.fields.filter((f) => f.required).map((f) => f.name)).toEqual([
      'accountId',
      'accessKeyId',
      'secretAccessKey',
      'bucket',
      'publicBaseUrl',
    ]);
    expect(p.fields.filter((f) => !f.required).map((f) => f.name)).toEqual([
      'zoneId',
      'purgeToken',
    ]);
    expect(field('secretAccessKey').secret).toBe(true);
    expect(field('purgeToken').secret).toBe(true);
  });

  it('checks the formats and tidies the public URL', () => {
    expect(field('accountId').pattern!.test('a'.repeat(32))).toBe(true);
    expect(field('accountId').pattern!.test('nope')).toBe(false);
    const url = field('publicBaseUrl');
    expect(
      url.pattern!.test(url.normalize!('"https://media.lawbid.dev/"')),
    ).toBe(true);
    expect(url.pattern!.test('http://media.lawbid.dev')).toBe(false);
    expect(field('bucket').pattern!.test('lawbid-public')).toBe(true);
    expect(field('bucket').pattern!.test('Bad_Name')).toBe(false);
  });
});
