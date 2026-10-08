/** Owner 2026-10-07: long user texts (posts, comments, bios, cases) keep
 * at most one empty line in a row — pasted text with dozens of blank
 * lines otherwise turns into an endless gap in the feed. Also trims
 * trailing spaces on each line and the text itself. */
export function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+\n/g, '\n')
    .replace(/\n(?:[^\S\n]*\n){2,}/g, '\n\n')
    .trim();
}

/** class-transformer `@Transform` form of [tidyText]. */
export const tidy = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? tidyText(value) : value;
