import { hiddenTagOf, hiddenTagsFor, isHiddenTag } from './hidden-tags';
import { extractHashtags } from './hashtags';

describe('hidden qualification tags', () => {
  it('writes the code and every level above it', () => {
    expect(hiddenTagsFor('family.divorce')).toEqual([
      '~family',
      '~family.divorce',
    ]);
    expect(hiddenTagsFor('Immigration')).toEqual(['~immigration']);
    expect(hiddenTagsFor(null)).toEqual([]);
  });

  it('a typed hashtag can never be hidden', () => {
    expect(extractHashtags('#~family #family')).toEqual(['family']);
    expect(isHiddenTag(hiddenTagOf('family'))).toBe(true);
    expect(isHiddenTag('family')).toBe(false);
  });
});
