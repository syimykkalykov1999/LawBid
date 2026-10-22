/**
 * The `?next=` target after sign-in: only a path on this site. Rejects
 * protocol-relative `//evil.com`, and any backslash or control character —
 * browsers read `/\evil.com` as `//evil.com` (audit #15, OWASP
 * Unvalidated Redirects). Anything else → `/`.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return '/';
  return next;
}
