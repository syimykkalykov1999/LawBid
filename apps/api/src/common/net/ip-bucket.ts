/** One budget per IPv4 address or per IPv6 /64 (a single customer owns a
 * whole /64, so rotating inside it must not give new budgets). */
export function ipBucket(ip: string): string {
  if (!ip.includes(':')) return ip;
  return ip.split(':').slice(0, 4).join(':');
}
