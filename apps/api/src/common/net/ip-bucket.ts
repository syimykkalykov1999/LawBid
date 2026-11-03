/** One budget per IPv4 address or per IPv6 /64 (a single customer owns a
 * whole /64, so rotating inside it must not give new budgets). Compressed
 * forms ("2001:db8::1") are expanded first so the first four groups are the
 * same for every address of the /64. */
export function ipBucket(ip: string): string {
  if (!ip.includes(':')) return ip;
  // IPv4-mapped (::ffff:1.2.3.4): bucket by the IPv4 address.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail === undefined ? [] : tail ? tail.split(':') : [];
  const groups =
    tail === undefined
      ? h
      : [
          ...h,
          ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'),
          ...t,
        ];
  return groups
    .slice(0, 4)
    .map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':');
}
