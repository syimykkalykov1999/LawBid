import { MAX_MENTIONS, extractMentions } from './mentions';

describe('extractMentions (OQ-042)', () => {
  it('finds @handles with dots/underscores, lowercases, dedupes', () => {
    expect(
      extractMentions('Thanks @Sima and @gggg.gggg, cc @sima @john_doe.'),
    ).toEqual(['sima', 'gggg.gggg', 'john_doe']);
  });

  it('ignores emails, lone @ and one-letter handles', () => {
    expect(extractMentions('mail a@b.com or @ or @x')).toEqual([]);
  });

  it('caps the count', () => {
    const text = Array.from({ length: 30 }, (_, i) => `@user${i}`).join(' ');
    expect(extractMentions(text)).toHaveLength(MAX_MENTIONS);
  });
});
