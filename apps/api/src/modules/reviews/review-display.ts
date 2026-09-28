/**
 * docs/03 §7.4: the reviewer is shown as "first name + first letter of
 * the last name" ("Anna K."), never with an avatar or the full surname
 * (client privacy). Returns null when the client has no first name (e.g.
 * an anonymized account); the app then shows a localized placeholder.
 */
export function reviewerDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const first = firstName?.trim();
  if (!first) return null;
  // First code point (not UTF-16 unit), so a non-BMP initial stays whole.
  const initial = [...(lastName?.trim() ?? '')][0];
  return initial ? `${first} ${initial.toLocaleUpperCase('en-US')}.` : first;
}
