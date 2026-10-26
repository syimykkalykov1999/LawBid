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

  describe('sealed metadata fields (S3-5)', () => {
    const AAD = `messages.file_name:${ID}`;

    it('seals a file name, binds it to its row and opens it again', () => {
      const c = keyed();
      const sealed = c.sealField('Divorce_agreement_Ivanov.pdf', AAD);
      expect(sealed.startsWith('encf:v2.k1.')).toBe(true);
      expect(sealed).not.toContain('Divorce');
      expect(c.openField(sealed, AAD)).toBe('Divorce_agreement_Ivanov.pdf');
      expect(c.openField(sealed, `messages.file_name:${OTHER}`)).toBe('');
      expect(MessageBodyCipher.isFieldSealed(sealed)).toBe(true);
      expect(MessageBodyCipher.fieldKidOf(sealed)).toBe('k1');
    });

    it('reads legacy plaintext as is and never returns ciphertext without keys', () => {
      const c = keyed();
      expect(c.openField('plain.pdf', AAD)).toBe('plain.pdf');
      const sealed = c.sealField('x.pdf', AAD);
      expect(cipher({}).openField(sealed, AAD)).toBe('');
      expect(cipher({}).sealField('x.pdf', AAD)).toBe('x.pdf');
    });

    it('rotation: backfills plaintext and re-seals a retired kid', () => {
      const old = keyed().sealField('a.pdf', AAD);
      const rotated = cipher({
        MESSAGE_ENC_KEYS: `${K1},${K2}`,
        MESSAGE_ENC_ACTIVE_KID: 'k2',
      });
      expect(rotated.fieldNeedsWrite(old)).toBe(true);
      expect(rotated.fieldNeedsWrite('plain.pdf')).toBe(true);
      expect(rotated.fieldNeedsWrite('')).toBe(false);
      const next = rotated.resealField(old, AAD)!;
      expect(next.startsWith('encf:v2.k2.')).toBe(true);
      expect(rotated.fieldNeedsWrite(next)).toBe(false);
      expect(rotated.openField(next, AAD)).toBe('a.pdf');
      expect(rotated.resealField('plain.pdf', AAD)!.startsWith('encf:')).toBe(
        true,
      );
      // A value that cannot be opened is reported, not guessed.
      expect(
        rotated.resealField(old, `messages.file_name:${OTHER}`),
      ).toBeNull();
    });

    it('sealMetadata / sealJournalText follow their admin switches', async () => {
      const on = { boolean: jest.fn().mockResolvedValue(true) };
      const off = { boolean: jest.fn().mockResolvedValue(false) };
      const env = { MESSAGE_ENC_KEYS: K1, MESSAGE_ENC_ACTIVE_KID: 'k1' };
      const mk = (settings: unknown) =>
        new MessageBodyCipher(new ConfigService(env), settings as never);
      expect(
        (await mk(on).sealMetadata('n.pdf', AAD)).startsWith('encf:'),
      ).toBe(true);
      expect(await mk(off).sealMetadata('n.pdf', AAD)).toBe('n.pdf');
      expect(on.boolean).toHaveBeenCalledWith('security.seal_case_metadata');
      expect(await mk(off).sealJournalText('t', AAD)).toBe('t');
      expect((await mk(on).sealJournalText('t', AAD)).startsWith('encf:')).toBe(
        true,
      );
      // No settings service (tests, CLI): metadata sealed, journal text not.
      expect(
        (await mk(undefined).sealMetadata('n', AAD)).startsWith('encf:'),
      ).toBe(true);
      expect(await mk(undefined).sealJournalText('t', AAD)).toBe('t');
    });
  });
});
