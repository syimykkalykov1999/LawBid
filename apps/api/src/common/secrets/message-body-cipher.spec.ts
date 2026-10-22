import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageBodyCipher } from './message-body-cipher';
import { SecretEnvelope } from './secret-envelope';

const K1 = 'k1:0123456789abcdef0123456789abcdef';
const K2 = 'k2:fedcba9876543210fedcba9876543210';
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const cipher = (env: Record<string, string>) =>
  new MessageBodyCipher(new ConfigService(env));
const keyed = () =>
  cipher({ MESSAGE_ENC_KEYS: K1, MESSAGE_ENC_ACTIVE_KID: 'k1' });

/** What the pre-audit code wrote: v2 with the constant AAD. */
const legacyV2 = (plain: string) =>
  'enc:' + new SecretEnvelope(K1, 'k1').encrypt(plain, 'messages.body');

describe('MessageBodyCipher (scaling TZ point 11, audit #6)', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('seals v3 with the active key and opens it again', () => {
    const c = keyed();
    const sealed = c.seal('Call me at 555-0100', ID);
    expect(sealed.startsWith('enc:v3.k1.')).toBe(true);
    expect(sealed).not.toContain('555');
    expect(c.open(sealed, ID)).toBe('Call me at 555-0100');
    expect(warn).not.toHaveBeenCalled();
  });

  it('old v2 rows (constant AAD) still open, whatever the id', () => {
    const c = keyed();
    expect(c.open(legacyV2('old text'), ID)).toBe('old text');
    expect(c.open(legacyV2('old text'), OTHER)).toBe('old text');
  });

  it('a ciphertext moved to another message does not open (swap)', () => {
    const c = keyed();
    const sealed = c.seal('private', ID);
    expect(c.open(sealed, OTHER)).toBe('');
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain(OTHER);
    expect(line).toContain('k1');
    expect(line).not.toContain('private');
  });

  it('downgrading v3 to v2 does not open', () => {
    const c = keyed();
    const sealed = c.seal('private', ID);
    expect(c.open(sealed.replace('enc:v3.', 'enc:v2.'), ID)).toBe('');
  });

  it('a tampered ciphertext or tag reads as empty, loudly', () => {
    const c = keyed();
    const [pre, kid, iv, tag, ct] = c.seal('hello there', ID).split('.');
    const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    expect(c.open([pre, kid, iv, tag, flip(ct)].join('.'), ID)).toBe('');
    expect(c.open([pre, kid, iv, flip(tag), ct].join('.'), ID)).toBe('');
    expect(warn).toHaveBeenCalledTimes(2);
    for (const [msg] of warn.mock.calls) {
      expect(String(msg)).not.toContain('hello');
    }
  });

  it('an empty caption (photo/video without text) opens to empty', () => {
    // Owner 2026-10-22: the bubble showed `enc:v2.m1.…` under a photo —
    // the sealed '' has an empty ciphertext segment.
    const c = keyed();
    const sealed = c.seal('', ID);
    expect(sealed.endsWith('.')).toBe(true);
    expect(c.open(sealed, ID)).toBe('');
    expect(warn).not.toHaveBeenCalled();
  });

  it('a forged empty caption is rejected (logged), never shown sealed', () => {
    const c = keyed();
    const [pre, kid, iv] = c.seal('', ID).split('.');
    const forged = `${pre}.${kid}.${iv}.AAAAAAAAAAAAAAAAAAAAAA.`;
    expect(c.open(forged, ID)).toBe('');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('two seals of the same text differ (random IV)', () => {
    const c = keyed();
    expect(c.seal('hi', ID)).not.toBe(c.seal('hi', ID));
  });

  it('legacy plaintext, system keys and [deleted] pass through', () => {
    const c = keyed();
    for (const s of [
      'hello',
      'offer_accepted',
      '[deleted]',
      'enc: my note',
      '',
    ]) {
      expect(c.open(s, ID)).toBe(s);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('an unknown key id never returns the ciphertext', () => {
    const c = keyed();
    expect(c.open('enc:v3.zz.aaa.bbb.ccc', ID)).toBe('');
    expect(String(warn.mock.calls[0][0])).toContain('zz');
  });

  it('without keys it stores plaintext and never returns ciphertext', () => {
    const sealed = keyed().seal('secret', ID);
    const plain = cipher({});
    expect(plain.enabled).toBe(false);
    expect(plain.seal('x', ID)).toBe('x');
    expect(plain.open(sealed, ID)).toBe('');
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('rotation: rows sealed with the old key still open', () => {
    const sealed = keyed().seal('old', ID);
    const rotated = cipher({
      MESSAGE_ENC_KEYS: `${K1},${K2}`,
      MESSAGE_ENC_ACTIVE_KID: 'k2',
    });
    expect(rotated.open(sealed, ID)).toBe('old');
    expect(rotated.open(legacyV2('older'), ID)).toBe('older');
    expect(rotated.seal('new', ID).startsWith('enc:v3.k2.')).toBe(true);
  });
});
