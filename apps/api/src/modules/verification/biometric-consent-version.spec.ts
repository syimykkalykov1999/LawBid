import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BIOMETRIC_CONSENT_TEXT_EN,
  BIOMETRIC_CONSENT_VERSION,
  biometricConsentVersion,
} from './verification.constants';

/** D1-53 (13.11): the stored consent version follows the retention days the
 * text promised and the wording it showed. */
describe('biometric consent version', () => {
  const repo = join(__dirname, '../../../../..');

  it('names the date, the days and a hash of the wording', () => {
    expect(biometricConsentVersion(30)).toMatch(
      new RegExp(`^${BIOMETRIC_CONSENT_VERSION}\\.30d\\.[0-9a-f]{8}$`),
    );
  });

  it('a new admin retention value gives a new version', () => {
    expect(biometricConsentVersion(45)).not.toBe(biometricConsentVersion(30));
  });

  it('the wording it hashes is the one the app and the seed show', () => {
    const seed = JSON.parse(
      readFileSync(
        join(repo, 'apps/api/prisma/seed/translations/en.json'),
        'utf8',
      ),
    ) as Record<string, string>;
    expect(seed['verification.biometricConsent.text']).toBe(
      BIOMETRIC_CONSENT_TEXT_EN,
    );
    const dart = readFileSync(
      join(repo, 'apps/mobile/lib/core/l10n/static_translator.dart'),
      'utf8',
    );
    expect(dart).toContain(`'${BIOMETRIC_CONSENT_TEXT_EN}'`);
  });

  it('every language names the days through {days}, never a fixed number', () => {
    const dir = join(repo, 'apps/api/prisma/seed/translations');
    const meta = JSON.parse(readFileSync(join(dir, '_meta.json'), 'utf8')) as {
      languages: string[];
    };
    for (const lang of meta.languages) {
      const text = (
        JSON.parse(readFileSync(join(dir, `${lang}.json`), 'utf8')) as Record<
          string,
          string
        >
      )['verification.biometricConsent.text'];
      expect([lang, text.includes('{days}')]).toEqual([lang, true]);
    }
  });
});
