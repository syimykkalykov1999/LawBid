import { ConfigService } from '@nestjs/config';
import {
  formatJoinCode,
  hashJoinCode,
  JOIN_CODE_LENGTH,
  JoinCodeCipher,
  newJoinCode,
  normalizeJoinCode,
} from './join-code';

describe('assistant join codes (owner 2026-10-04)', () => {
  it('12 symbols without look-alikes, unique in practice', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const c = newJoinCode();
      expect(c).toMatch(/^[2-9A-HJKMNP-Z]+$/);
      expect(c).toHaveLength(JOIN_CODE_LENGTH);
      seen.add(c);
    }
    expect(seen.size).toBe(2000);
  });

  it('typed in any case, with or without dashes, hashes the same', () => {
    const c = newJoinCode();
    const shown = formatJoinCode(c);
    expect(shown).toMatch(/^.{4}-.{4}-.{4}$/);
    expect(normalizeJoinCode(` ${shown.toLowerCase()} `)).toBe(c);
    expect(hashJoinCode(shown.toLowerCase())).toBe(hashJoinCode(c));
    expect(hashJoinCode(c)).not.toBe(hashJoinCode(newJoinCode()));
  });

  it('is sealed per seat with the secrets key; plain only without keys', () => {
    const sealed = new JoinCodeCipher(
      new ConfigService({
        SECRETS_MASTER_KEYS: `k1:${'x'.repeat(40)}`,
        SECRETS_ACTIVE_KID: 'k1',
      }),
    );
    const stored = sealed.seal('ABCDEFGHJKMN', 'seat-1');
    expect(stored).not.toContain('ABCDEFGHJKMN');
    expect(sealed.open(stored, 'seat-1')).toBe('ABCDEFGHJKMN');
    // Bound to its seat: pasted onto another row it does not open.
    expect(sealed.open(stored, 'seat-2')).toBeNull();

    const dev = new JoinCodeCipher(new ConfigService({}));
    expect(dev.open(dev.seal('ABCDEFGHJKMN', 's'), 's')).toBe('ABCDEFGHJKMN');
  });
});
