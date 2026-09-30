/** OQ-042: @username in posts and comments, like Instagram. Usernames are
 * letters, digits, `_` and `.` (never ending with a dot), 2–30 chars. */
export const MAX_MENTIONS = 20;

const MENTION_RE = /(?:^|[^\p{L}\p{N}_.@])@([A-Za-z0-9._]{2,30})/gu;

/** Lowercased handles in order, unique, at most [MAX_MENTIONS]. */
export function extractMentions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(MENTION_RE)) {
    const handle = m[1].replace(/\.+$/, '').toLowerCase();
    if (handle.length < 2 || out.includes(handle)) continue;
    out.push(handle);
    if (out.length === MAX_MENTIONS) break;
  }
  return out;
}
