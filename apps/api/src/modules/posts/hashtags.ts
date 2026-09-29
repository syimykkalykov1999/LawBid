/** docs/05 §3.1: letters, digits and `_`, up to 30 characters, at most 10
 * per post, lowercased; the 11th and later are ignored. */
export const MAX_HASHTAGS = 10;
export const MAX_HASHTAG_LENGTH = 30;

const HASHTAG_RE = /(?:^|[^\p{L}\p{N}_#])#([\p{L}\p{N}_]+)/gu;

export function extractHashtags(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(HASHTAG_RE)) {
    const tag = m[1].toLowerCase();
    if (tag.length > MAX_HASHTAG_LENGTH || out.includes(tag)) continue;
    out.push(tag);
    if (out.length === MAX_HASHTAGS) break;
  }
  return out;
}
