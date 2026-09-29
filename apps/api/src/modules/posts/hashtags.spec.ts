import { extractHashtags } from './hashtags';

describe('extractHashtags (docs/05 §3.1)', () => {
  it('lowercases, dedupes, allows letters/digits/_ and caps at 10', () => {
    const text = Array.from({ length: 12 }, (_, i) => `#Tag${i}`).join(' ');
    const tags = extractHashtags(`${text} #DUI #dui #мои_права`);
    expect(tags).toHaveLength(10);
    expect(tags[0]).toBe('tag0');
    expect(tags).not.toContain('tag10');
  });

  it('ignores tags over 30 chars, emails and "##"', () => {
    expect(extractHashtags(`#${'a'.repeat(31)} a@b.com#x ok #fine`)).toEqual([
      'fine',
    ]);
    expect(extractHashtags('Права #мои_права и #DUI_2026')).toEqual([
      'мои_права',
      'dui_2026',
    ]);
  });
});
