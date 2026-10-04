import { ConfigService } from '@nestjs/config';
import { MessageBodyCipher } from './message-body-cipher';

const K1 = 'k1:0123456789abcdef0123456789abcdef';
const K2 = 'k2:fedcba9876543210fedcba9876543210';

const cipher = (env: Record<string, string>) =>
  new MessageBodyCipher(new ConfigService(env));

describe('MessageBodyCipher (scaling TZ point 11)', () => {
  it('seals with the active key and opens it again', () => {
    const c = cipher({ MESSAGE_ENC_KEYS: K1, MESSAGE_ENC_ACTIVE_KID: 'k1' });
    const sealed = c.seal('Call me at 555-0100');
    expect(sealed.startsWith('enc:v2.k1.')).toBe(true);
    expect(sealed).not.toContain('555');
    expect(c.open(sealed)).toBe('Call me at 555-0100');
  });

  it('two seals of the same text differ (random IV)', () => {
    const c = cipher({ MESSAGE_ENC_KEYS: K1, MESSAGE_ENC_ACTIVE_KID: 'k1' });
    expect(c.seal('hi')).not.toBe(c.seal('hi'));
  });

  it('legacy plaintext, system keys and [deleted] pass through', () => {
    const c = cipher({ MESSAGE_ENC_KEYS: K1, MESSAGE_ENC_ACTIVE_KID: 'k1' });
    for (const s of [
      'hello',
      'offer_accepted',
      '[deleted]',
      'enc: my note',
      '',
    ]) {
      expect(c.open(s)).toBe(s);
    }
  });

  it('plaintext shaped like a sealed body is returned as typed', () => {
    const c = cipher({ MESSAGE_ENC_KEYS: K1, MESSAGE_ENC_ACTIVE_KID: 'k1' });
    expect(c.open('enc:v2.k1.aaa.bbb.ccc')).toBe('enc:v2.k1.aaa.bbb.ccc');
  });

  it('without keys it stores plaintext and never returns ciphertext', () => {
    const sealed = cipher({
      MESSAGE_ENC_KEYS: K1,
      MESSAGE_ENC_ACTIVE_KID: 'k1',
    }).seal('secret');
    const plain = cipher({});
    expect(plain.enabled).toBe(false);
    expect(plain.seal('x')).toBe('x');
    expect(plain.open(sealed)).toBe('');
  });

  it('rotation: rows sealed with the old key still open', () => {
    const sealed = cipher({
      MESSAGE_ENC_KEYS: K1,
      MESSAGE_ENC_ACTIVE_KID: 'k1',
    }).seal('old');
    const rotated = cipher({
      MESSAGE_ENC_KEYS: `${K1},${K2}`,
      MESSAGE_ENC_ACTIVE_KID: 'k2',
    });
    expect(rotated.open(sealed)).toBe('old');
    expect(rotated.seal('new').startsWith('enc:v2.k2.')).toBe(true);
  });
});
