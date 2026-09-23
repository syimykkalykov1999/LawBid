/**
 * Minimal dotted-version comparison for the app-version gate
 * (docs/01_FOUNDATION_AUTH.md §7: "Минимальная поддерживаемая версия
 * приложения проверяется сервером"). Not a full semver implementation
 * (no pre-release/build-metadata precedence rules) — the client only
 * ever sends `X-App-Version` as a plain `major.minor.patch` string (see
 * `HeadersInterceptor.appVersion` on the Flutter side, kept in sync with
 * `pubspec.yaml`'s `version:` field before its own `+buildNumber`
 * suffix), and app_config's seeded values (prisma/seed.ts
 * `seedAppConfig`) are the same shape, so dotted-integer comparison is
 * all this needs.
 *
 * Returns `null` (not a comparison result) for a string that isn't
 * dotted integers, so callers can choose to skip the check rather than
 * block on a value they can't parse — see `AppVersionGuard`'s doc
 * comment for why "can't tell" must never mean "reject".
 */
export function compareVersions(a: string, b: string): number | null {
  const partsA = parseVersion(a);
  const partsB = parseVersion(b);
  if (partsA === null || partsB === null) return null;

  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/** `true` only when both versions parse AND `version` is strictly below
 * `minVersion`. Unparseable input never blocks (see [compareVersions]'s
 * doc comment) — it returns `false`, the same as "not below". */
export function isVersionBelow(version: string, minVersion: string): boolean {
  const cmp = compareVersions(version, minVersion);
  return cmp !== null && cmp < 0;
}

function parseVersion(raw: string): number[] | null {
  // Drop a `+buildNumber`/`-prerelease` suffix if present (pubspec.yaml
  // style, e.g. `0.1.0+1`) before splitting on `.`.
  const core = raw.split(/[+-]/, 1)[0];
  const segments = core.split('.');
  const parts: number[] = [];
  for (const segment of segments) {
    if (!/^\d+$/.test(segment)) return null;
    parts.push(Number(segment));
  }
  return parts.length > 0 ? parts : null;
}
