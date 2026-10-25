/** 203.0.113.45 → 203.0.113.x; IPv6 keeps the first two groups. */
export function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes('.')) {
    const p = ip.replace(/^::ffff:/, '').split('.');
    return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.x` : null;
  }
  const g = ip.split(':');
  return g.length > 2 ? `${g[0]}:${g[1]}::` : null;
}

/** "Chrome · macOS" from a User-Agent; null when it says nothing useful. */
export function browserLabel(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /YaBrowser/.test(userAgent)
        ? 'Yandex'
        : /(Chrome|CriOS)\//.test(userAgent)
          ? 'Chrome'
          : /(Firefox|FxiOS)\//.test(userAgent)
            ? 'Firefox'
            : /Safari\//.test(userAgent)
              ? 'Safari'
              : null;
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /(iPhone|iPad|iPod)/.test(userAgent)
      ? 'iOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux|X11/.test(userAgent)
            ? 'Linux'
            : null;
  const label = [browser, os].filter(Boolean).join(' · ');
  return label || null;
}
