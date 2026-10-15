import { describe, expect, it } from 'vitest';
import { parseTerms, termsText } from './search-admin';

// Run by vitest only: no callers, no API. Covers the admin's phrase editor
// for «Синонимы поиска» (owner 2026-10-15).
describe('synonym phrases as lines', () => {
  it('«язык: фраза» per line, a bare line is Russian', () => {
    expect(parseTerms('en: divorce\nru: расторжение брака\n\n  муж бьёт  \nne: सम्बन्ध विच्छेद')).toEqual([
      { lang: 'en', term: 'divorce' },
      { lang: 'ru', term: 'расторжение брака' },
      { lang: 'ru', term: 'муж бьёт' },
      { lang: 'ne', term: 'सम्बन्ध विच्छेद' },
    ]);
  });

  it('round-trips', () => {
    const terms = [
      { lang: 'en', term: 'green card' },
      { lang: 'ru', term: 'грин карта' },
    ];
    expect(parseTerms(termsText(terms))).toEqual(terms);
  });

  it('a colon inside a phrase without a language stays in the phrase', () => {
    expect(parseTerms('вопрос: как быть')).toEqual([{ lang: 'ru', term: 'вопрос: как быть' }]);
  });
});
