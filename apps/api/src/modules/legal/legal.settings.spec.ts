import {
  DEFAULT_LEGAL_SETTINGS,
  DEFAULT_LEGAL_TEXTS,
  LEGAL_TEXT_LIMITS,
  legalLangOf,
  parseLegalSettings,
} from './legal.settings';

/** Owner 2026-10-05 (legal): the `legal.settings` row. */
describe('legal settings', () => {
  it('defaults: no DMCA agent yet, 3 strikes, the en/ru texts', () => {
    const s = parseLegalSettings(null);
    expect(s).toEqual(DEFAULT_LEGAL_SETTINGS);
    expect(s.dmcaAgent).toEqual({ name: '', email: '', address: '' });
    expect(s.dmcaStrikesToSuspend).toBe(3);
    expect(s.texts.en.partnerTerms).toContain('16 CFR Part 255');
    expect(s.texts.ru.partnerTerms).toContain('W-9');
    expect(s.texts.en.caseCreate).toContain('not a law firm');
    for (const lang of ['en', 'ru'] as const)
      for (const [k, max] of Object.entries(LEGAL_TEXT_LIMITS))
        expect(
          DEFAULT_LEGAL_TEXTS[lang][k as keyof typeof LEGAL_TEXT_LIMITS].length,
        ).toBeLessThanOrEqual(max);
  });

  it('junk is replaced field by field; empty texts fall back, contacts may be empty', () => {
    const s = parseLegalSettings({
      dmcaAgent: { name: '  Jane Doe ', email: 'dmca@lawbid.app', address: 7 },
      incidentContact: { email: '', phone: 'x'.repeat(100) },
      dmcaStrikesToSuspend: 42,
      texts: {
        en: { caseCreate: '', supportNote: 'Custom note', partnerTerms: 5 },
        ru: 'nope',
      },
    });
    expect(s.dmcaAgent).toEqual({
      name: 'Jane Doe',
      email: 'dmca@lawbid.app',
      address: '',
    });
    expect(s.incidentContact).toEqual({ email: '', phone: '' });
    expect(s.dmcaStrikesToSuspend).toBe(3);
    expect(s.texts.en.caseCreate).toBe(DEFAULT_LEGAL_TEXTS.en.caseCreate);
    expect(s.texts.en.supportNote).toBe('Custom note');
    expect(s.texts.en.partnerTerms).toBe(DEFAULT_LEGAL_TEXTS.en.partnerTerms);
    expect(s.texts.ru).toEqual(DEFAULT_LEGAL_TEXTS.ru);
    expect(
      parseLegalSettings({ dmcaStrikesToSuspend: 0 }).dmcaStrikesToSuspend,
    ).toBe(0);
    expect(parseLegalSettings([]).dmcaStrikesToSuspend).toBe(3);
  });

  it('the texts language follows the UI language: ru → ru, anything else → en', () => {
    expect(legalLangOf('ru')).toBe('ru');
    expect(legalLangOf('en')).toBe('en');
    expect(legalLangOf('es')).toBe('en');
    expect(legalLangOf(null)).toBe('en');
  });
});
